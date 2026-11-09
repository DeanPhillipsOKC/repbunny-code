import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { goTo, openLibrary } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { openAccountSection } from '../fixtures/account'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #149: "How did it feel?" tags on the finish recap, shown and edited in
// the Workout log, kept in the CSV export, and the Progress hub's "What helps
// you lift" card (Premium, a preview without it).

const BENCH = 'Barbell Bench Press'

async function firstLaunch(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

const option = (scope: ReturnType<Page['getByTestId']>, group: string, label: string) =>
  scope.getByRole('group', { name: group }).getByRole('button', { name: label, exact: true })

test('tag how a workout felt on the recap, then see and change it in the Workout log', async ({ page }) => {
  await firstLaunch(page)
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('5')
  await row.getByLabel('Weight').fill('135')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()

  const feel = page.getByTestId('recap-feel')
  await expect(feel.getByRole('heading', { name: 'How did it feel?' })).toBeVisible()
  await option(feel, 'Sleep', 'Over 8 h').click()
  await option(feel, 'Energy', 'High').click()
  await option(feel, 'Energy', 'Low').click()
  await option(feel, 'Stress', 'Low').click()
  await expect(option(feel, 'Sleep', 'Over 8 h')).toHaveAttribute('aria-pressed', 'true')
  await expect(option(feel, 'Energy', 'High')).toHaveAttribute('aria-pressed', 'false')
  await expect(option(feel, 'Energy', 'Low')).toHaveAttribute('aria-pressed', 'true')
  // Three options fit on one line at phone width.
  const boxes = await feel.getByRole('group', { name: 'Sleep' }).getByRole('button').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, right: r.right, scroll: el.scrollWidth - el.clientWidth }
    }),
  )
  expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1)
  expect(Math.max(...boxes.map((b) => b.right))).toBeLessThanOrEqual(375)
  expect(boxes.every((b) => b.scroll <= 0)).toBe(true)

  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Workout log')
  const summary = page.getByTestId('history-feel')
  await expect(summary).toContainText('Sleep over 8 h · Energy low · Stress low')

  // Tapping a picked option again clears it.
  await summary.getByRole('button', { name: 'Edit how it felt' }).click()
  const form = page.getByTestId('history-feel-form')
  await expect(option(form, 'Stress', 'Low')).toHaveAttribute('aria-pressed', 'true')
  await option(form, 'Stress', 'Low').click()
  await expect(option(form, 'Stress', 'Low')).toHaveAttribute('aria-pressed', 'false')
  await form.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(summary).toContainText('Sleep over 8 h · Energy low')
  await expect(summary).not.toContainText('Stress')

  await page.reload()
  await expect(page.getByTestId('history-feel')).toContainText('Sleep over 8 h · Energy low')

  // One tagged workout: the card counts toward the 10 it needs.
  await goTo(page, 'Progress')
  await expect(page.getByTestId('feel-insights')).toContainText('1 of 10 so far')
})

// 12 workouts, one day apart, alternating sleep. Each over-8-hours workout
// lifts more than any before it (a record, after the first sets a baseline);
// each under-6-hours one is lighter (none).
const SEEDED = Array.from({ length: 12 }, (_, i) => ({
  id: `w${i}`,
  daysAgo: 30 - i,
  sleep: i % 2 === 0 ? 'over_8' : 'under_6',
  weight: i % 2 === 0 ? 100 + i * 10 : 60,
}))

async function seedTagged(page: Page) {
  await page.evaluate(async (workouts) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const { error } = await repos.backup.restore({
      format: 'repbunny-backup',
      version: 2,
      exported_at: new Date().toISOString(),
      exercises: [{ id: 'bench', name: 'E2E Bench', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
      workout_templates: [],
      workout_template_exercises: [],
      workouts: workouts.map((w) => ({
        id: w.id,
        performed_at: new Date(Date.now() - w.daysAgo * 86_400_000).toISOString(),
        template_id: null,
        notes: null,
        sleep: w.sleep,
      })),
      sets: workouts.map((w) => ({ id: `s-${w.id}`, workout_id: w.id, exercise_id: 'bench', set_index: 0, reps: 5, weight: w.weight, weight_unit: 'lb' })),
      body_weight_entries: [],
    })
    if (error) throw new Error(error.message)
  }, SEEDED)
}

test('with 10+ tagged workouts, Premium shows what helps you lift; free gets a preview', async ({ page }, testInfo) => {
  await firstLaunch(page)
  await seedTagged(page)
  await page.reload()

  // Free: the user's count, and a preview of sample findings.
  await goTo(page, 'Progress')
  const card = page.getByTestId('feel-insights')
  await expect(card.getByRole('heading', { name: 'What helps you lift' })).toBeVisible()
  await expect(card).toContainText('your 12 tagged workouts')
  await expect(card.getByTestId('feel-finding')).toHaveCount(0)
  await card.getByRole('button', { name: 'Preview' }).click()
  const panel = card.getByRole('group', { name: 'What helps you lift is part of Premium preview' })
  await expect(panel).toBeVisible()
  await panel.getByRole('button', { name: 'Go back' }).click()
  await expect(panel).toHaveCount(0)
  await card.getByRole('button', { name: 'Preview' }).click()
  await card.getByRole('button', { name: 'Keep it with Premium' }).click()
  await expect(page.getByRole('dialog', { name: /Premium/ })).toBeVisible()
  await page.reload()

  // Premium: the real finding, with its sample sizes.
  await setPremium(page, true)
  await page.reload()
  await goTo(page, 'Progress')
  const finding = card.getByTestId('feel-finding')
  await expect(finding).toHaveCount(1)
  await expect(finding).toContainText('You set records after over 8 hours of sleep, and none after under 6 hours of sleep.')
  await expect(finding).toContainText('0.8 vs 0 records a workout. Based on 6 and 6 workouts.')
  await expect(card).toContainText('Based on 12 tagged workouts. Patterns, not proof.')

  // The CSV export carries each workout's tags on its sets.
  const data = await openAccountSection(page, 'Your data')
  const download = page.waitForEvent('download')
  await data.getByRole('button', { name: /Export sets as CSV/ }).click()
  const csvPath = testInfo.outputPath('sets.csv')
  await (await download).saveAs(csvPath)
  const lines = (await readFile(csvPath, 'utf8')).trim().split(/\r?\n/)
  expect(lines[0]).toMatch(/,calories,sleep,energy,stress,finished_at$/)
  expect(lines).toHaveLength(13)
  expect(lines[1]).toMatch(/,E2E Bench,1,100,lb,5,.*,over_8,,,$/)
  expect(lines[2]).toMatch(/,E2E Bench,1,60,lb,5,.*,under_6,,,$/)
})
