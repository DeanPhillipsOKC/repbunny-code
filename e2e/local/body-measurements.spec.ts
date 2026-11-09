import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #139: body measurements on the Body screen (Premium, feature key
// `progress`). A fresh local database starts empty each test.

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

async function openBody(page: Page, premium: boolean) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await setPremium(page, premium)
  await goTo(page, 'Body')
  return page.getByTestId('measurements-card')
}

async function logMeasurements(page: Page, values: Record<string, string>) {
  const card = page.getByTestId('measurements-card')
  await card.getByRole('button', { name: 'Log measurements' }).click()
  for (const [label, value] of Object.entries(values)) await card.getByLabel(label, { exact: true }).fill(value)
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByRole('button', { name: 'Log measurements' })).toBeVisible()
}

test('local mode: add, chart, switch units, edit, and delete measurements', async ({ page }) => {
  const card = await openBody(page, true)
  await expect(card.getByText('Track waist, chest, hips, arms, thighs, and neck.', { exact: false })).toBeVisible()

  // Blank form: nothing to save.
  await card.getByRole('button', { name: 'Log measurements' }).click()
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(card.getByRole('alert')).toHaveText('Fill in at least one measurement.')
  await card.getByRole('button', { name: 'Cancel' }).click()

  await logMeasurements(page, { Waist: '34', Chest: '40' })
  const waist = card.getByRole('button', { name: /^Waist/ })
  await expect(waist).toContainText('34 in')
  await expect(waist).toContainText('First entry')
  await expect(card.getByRole('button', { name: /^Chest/ })).toContainText('40 in')
  await expect(card.getByRole('button', { name: /^Hips/ })).toHaveCount(0)
  await expect(card.getByText('Log waist again to see a trend.')).toBeVisible()

  await logMeasurements(page, { Waist: '33' })
  await expect(waist).toContainText('33 in')
  await expect(waist).toContainText('−1 since first')
  await expect(card.getByRole('img', { name: 'Waist over time, from 34 to 33 in' })).toBeVisible()

  // Chest has one entry, so its chart waits for a second.
  await card.getByRole('button', { name: /^Chest/ }).click()
  await expect(card.getByText('Log chest again to see a trend.')).toBeVisible()

  // Display in cm, and the choice sticks after a reload.
  await card.getByRole('group', { name: 'Show measurements in' }).getByRole('button', { name: 'cm' }).click()
  await expect(waist).toContainText('83.8 cm')
  await page.reload()
  await expect(page.getByTestId('measurements-card').getByRole('button', { name: /^Waist/ })).toContainText('83.8 cm')
  await page.getByTestId('measurements-card').getByRole('group', { name: 'Show measurements in' }).getByRole('button', { name: 'in' }).click()

  // Fits the phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // Edit the newest entry from the history sheet.
  await page.getByRole('button', { name: 'See all measurements' }).click()
  const sheet = page.getByRole('dialog', { name: 'Measurements' })
  await expect(sheet.getByText('2 entries')).toBeVisible()
  await expect(sheet.getByText('Waist 33 in')).toBeVisible()
  await expect(sheet.getByText('Waist 34 · Chest 40 in')).toBeVisible()
  await sheet.getByRole('button', { name: /^Edit measurements/ }).first().click()
  await sheet.getByLabel('Waist', { exact: true }).fill('32.5')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByText('Waist 32.5 in')).toBeVisible()

  // Delete the older one.
  await sheet.getByRole('button', { name: /^Delete measurements/ }).last().click()
  await sheet.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(sheet.getByText('1 entry')).toBeVisible()
  await sheet.getByRole('button', { name: 'Close measurements' }).click()

  await expect(waist).toContainText('32.5 in')
  await expect(waist).toContainText('First entry')
  await expect(card.getByRole('button', { name: /^Chest/ })).toHaveCount(0)
})

test('local mode: measurements survive a backup round trip and export as CSV', async ({ page }) => {
  const card = await openBody(page, true)
  await logMeasurements(page, { Waist: '34', Neck: '15.5' })

  const result = await page.evaluate(async () => {
    const backup = await window.__rbImport('/src/lib/backup.ts')
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const file = await backup.buildBackup()
    const csv = backup.buildMeasurementsCsv(file)
    const erased = await repos.backup.erase()
    if (erased.error) throw new Error(erased.error.message)
    const afterErase = (await repos.measurements.list()).data.length
    const restored = await backup.restoreBackup(JSON.parse(JSON.stringify(file)))
    if (restored.error) throw new Error(restored.error.message)
    return { inFile: file.body_measurements.length, csv, afterErase }
  })
  expect(result.inFile).toBe(1)
  expect(result.afterErase).toBe(0)
  const [header, row] = result.csv.trim().split('\r\n')
  expect(header).toBe('date,unit,waist,chest,hips,arms,thighs,neck')
  expect(row).toMatch(/^\d{4}-\d\d-\d\dT[^,]+,in,34,,,,,15\.5$/)

  // The file's preferences bring the weight unit back, so nothing asks again.
  await page.reload()
  await expect(card.getByRole('button', { name: /^Waist/ })).toContainText('34 in')
  await expect(card.getByRole('button', { name: /^Neck/ })).toContainText('15.5 in')
})

test('local mode: without Premium, measurements are a preview, and How to measure still opens', async ({ page }) => {
  const card = await openBody(page, false)
  await expect(card.getByRole('button', { name: 'Log measurements' })).toHaveCount(0)
  await card.getByRole('button', { name: 'Preview' }).click()
  const panel = card.getByRole('group', { name: 'Measurements are part of Premium preview' })
  await expect(panel).toBeVisible()
  await expect(panel.getByText('Weigh-ins, height, and BMI stay free.')).toBeVisible()
  await panel.getByRole('button', { name: 'Keep it with Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByText('Body measurements with a chart for each')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(premium).toHaveCount(0)

  await page.getByTestId('measurements-card').getByRole('button', { name: 'How to measure' }).click()
  const guide = page.getByRole('dialog', { name: 'How to measure' })
  await expect(guide.getByText('At your belly button.', { exact: false })).toBeVisible()
  // A bunny for each spot, plus the one at the top, and every file loads.
  const art = guide.locator('img.mascot-art')
  await expect(art).toHaveCount(7)
  for (const img of await art.all()) {
    await img.scrollIntoViewIfNeeded()
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  }
  await guide.getByRole('button', { name: 'Got it' }).click()
  await expect(guide).toHaveCount(0)
})
