import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { goTo } from '../fixtures/nav'

// Issue #152: Share as PDF on the monthly report, for a coach or physio.
// Premium builds the PDF on the device and hands it over (a download here,
// since navigator.canShare is removed); free gets the themes-style preview.
// jsPDF writes uncompressed text, so the seeded lifts and numbers can be read
// straight out of the file.

const now = new Date()
const daysAgo = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 9).toISOString()

// w0 is older than any month boundary the other dates can reach, so the Progress hub always
// has a full month behind it to offer the report tile (#732). Its one set is on its own
// exercise, so it stays out of the 4-week report's numbers.
const WORKOUTS = [
  { id: 'w0', at: daysAgo(70) },
  { id: 'w1', at: daysAgo(20) },
  { id: 'w2', at: daysAgo(10) },
  { id: 'w3', at: daysAgo(3) },
]

// Bench est. 1RM 175 (5 × 150) to 196 (5 × 168); squat 210 to 224.
const SETS: [workout: string, exercise: string, reps: number, weight: number][] = [
  ['w0', 'row', 5, 100],
  ['w1', 'bench', 5, 150],
  ['w1', 'squat', 5, 180],
  ['w2', 'bench', 5, 160],
  ['w2', 'squat', 5, 192],
  ['w3', 'bench', 5, 168],
]

async function seed(page: Page) {
  await page.evaluate(
    async ({ workouts, sets, weighIns }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [
          { id: 'bench', name: 'E2E Coach Bench', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false },
          { id: 'squat', name: 'E2E Coach Squat', muscle_group: 'legs', also_works: [], load_type: 'weight', is_archived: false },
          { id: 'row', name: 'E2E Coach Row', muscle_group: 'back', also_works: [], load_type: 'weight', is_archived: false },
        ],
        workout_templates: [],
        workout_template_exercises: [],
        workouts: workouts.map((w: { id: string; at: string }) => ({ id: w.id, performed_at: w.at, template_id: null, notes: null })),
        sets: sets.map(([workout, exercise, reps, weight]: (string | number)[], i: number) => ({
          id: `s${i}`,
          workout_id: workout,
          exercise_id: exercise,
          set_index: i,
          reps,
          weight,
          weight_unit: 'lb',
        })),
        body_weight_entries: weighIns,
      })
      if (error) throw new Error(error.message)
    },
    {
      workouts: WORKOUTS,
      sets: SETS,
      weighIns: [
        { id: 'bw1', weight: 180, weight_unit: 'lb', recorded_at: daysAgo(15) },
        { id: 'bw2', weight: 178, weight_unit: 'lb', recorded_at: daysAgo(2) },
      ],
    },
  )
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

async function openReport(page: Page) {
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: / report$/ }).click()
  await expect(page).toHaveURL(/\/progress\/report$/)
}

test('local mode: Share as PDF is a preview without Premium, and with it the PDF holds the seeded lifts', async ({ page }, testInfo) => {
  test.slow()
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page)
  await page.reload()

  // The first Share PDF click loads the PDF module on demand (#383, #421), so load it
  // before the click; test.slow() covers jsPDF's own first load (#436). Issue #960: the
  // suite runs on a production build now, so these are two small chunks, not Vite's cold
  // optimizing (#467).
  await page.evaluate(async () => {
    await window.__rbImport('/src/lib/reportPdf.ts')
  })

  // Free: the button is there, and the sheet is a preview.
  await openReport(page)
  await page.getByRole('button', { name: 'Share as PDF' }).click()
  const sheet = page.getByRole('dialog', { name: 'Share as PDF' })
  await expect(sheet.getByRole('radio', { name: /Last 4 weeks/ })).toBeVisible()
  await sheet.getByText('Last 3 months').click()
  await expect(sheet.getByRole('radio', { name: /Last 3 months/ })).toBeChecked()
  const preview = sheet.getByRole('group', { name: 'Share as PDF preview' })
  await expect(preview).toContainText('Sharing a PDF report is part of Premium.')
  await expect(sheet.getByRole('button', { name: 'Share PDF' })).toHaveCount(0)
  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium).toContainText('A PDF progress report to share with a coach or physio')
  await premium.getByRole('button', { name: 'Not now' }).click()
  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect(sheet).toHaveCount(0)

  // Premium: the last 4 weeks as a PDF.
  await setPremium(page, true)
  await page.getByRole('button', { name: 'Share as PDF' }).click()
  await sheet.getByText('Last 4 weeks').click()
  await expect(sheet.getByRole('radio', { name: /Last 4 weeks/ })).toBeChecked()
  const [file] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    sheet.getByRole('button', { name: 'Share PDF' }).click(),
  ])
  expect(file.suggestedFilename()).toMatch(/^repbunny-report-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf$/)
  await expect(sheet).toHaveCount(0)

  const path = testInfo.outputPath(file.suggestedFilename())
  await file.saveAs(path)
  const pdf = (await readFile(path)).toString('latin1')
  expect(pdf.startsWith('%PDF-')).toBe(true)
  for (const text of [
    'Training report',
    'E2E Coach Bench',
    'E2E Coach Squat',
    '175 lb',
    '196 lb',
    '+21 lb',
    '210 lb',
    '224 lb',
    '+14 lb',
    'Chest',
    'Legs',
    '180 lb on',
    '178 lb on',
    '5 × 168 lb',
    'Made with RepBunny',
  ]) {
    expect(pdf, `PDF text should include "${text}"`).toContain(text)
  }
  expect(pdf).not.toContain('Where the numbers come from')

  // The toggle is off by default; on, the PDF gains the sets behind each number.
  await page.getByRole('button', { name: 'Share as PDF' }).click()
  const appendixToggle = sheet.getByRole('checkbox', { name: /Include the sets behind each number/ })
  await expect(appendixToggle).not.toBeChecked()
  await appendixToggle.check()
  await sheet.getByText('Last 4 weeks').click()
  const [withSets] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    sheet.getByRole('button', { name: 'Share PDF' }).click(),
  ])
  const path2 = testInfo.outputPath(`sets-${withSets.suggestedFilename()}`)
  await withSets.saveAs(path2)
  const pdf2 = (await readFile(path2)).toString('latin1')
  expect(pdf2.startsWith('%PDF-')).toBe(true)
  for (const text of ['Where the numbers come from', 'SET USED', '5 × 150 lb', '5 × 168 lb']) {
    expect(pdf2, `PDF text should include "${text}"`).toContain(text)
  }
})

test('local mode: Share as PDF with custom dates needs the first day on or before the last', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page)
  await setPremium(page, true)
  await page.reload()

  await openReport(page)
  await page.getByRole('button', { name: 'Share as PDF' }).click()
  const sheet = page.getByRole('dialog', { name: 'Share as PDF' })
  await sheet.getByText('Custom').click()
  await sheet.getByLabel('From', { exact: true }).fill('2026-09-30')
  await sheet.getByLabel('To', { exact: true }).fill('2026-09-01')
  await expect(sheet.getByRole('alert')).toHaveText('Pick a first day on or before the last day.')
  await expect(sheet.getByRole('button', { name: 'Share PDF' })).toBeDisabled()
  await sheet.getByLabel('From', { exact: true }).fill('2026-09-01')
  await expect(sheet.getByRole('alert')).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Share PDF' })).toBeEnabled()
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toHaveCount(0)
})
