import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { openAccountSection } from '../fixtures/account'
import { closeAddExerciseSheet, selectExercise } from '../fixtures/exercise'

// Issue #113: dev builds show a Premium (dev) switch and a Reset Premium
// hints (dev) button in Account > Preferences in local mode, for trying the
// free version. Production builds drop both (checked by grepping dist/, not
// here: e2e runs against the dev server).

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'
const HINT = "That's your last free routine."

async function addTemplate(page: Page, name: string) {
  await goTo(page, 'Routines')
  await page.getByRole('button', { name: 'Add routine' }).click()
  const sheet = page.getByRole('dialog', { name: 'New routine' })
  await sheet.getByLabel('Name', { exact: true }).fill(name)
  await sheet.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/\/templates\/.+/)
  await closeAddExerciseSheet(page)
  await goTo(page, 'Routines')
}

async function setDevPremium(page: Page, on: boolean) {
  const prefs = await openAccountSection(page, 'Preferences')
  const toggle = prefs.getByRole('switch', { name: 'Premium (dev)' })
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', String(on))
  await prefs.getByRole('button', { name: 'Close' }).click()
  await expect(prefs).toHaveCount(0)
}

test('local mode dev build: the Premium (dev) switch gates templates and Plates, and hints can be reset', async ({ page }) => {
  const premium = page.getByRole('dialog', { name: 'Premium' })
  const newTemplate = page.getByRole('dialog', { name: 'New routine' })

  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()

  // Free by default, so the switch starts off.
  const prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('switch', { name: 'Premium (dev)' })).toHaveAttribute('aria-checked', 'false')
  await prefs.getByRole('button', { name: 'Close' }).click()

  // Three templates; the 3rd brings up the one-time hint on Templates.
  await addTemplate(page, 'Push')
  await addTemplate(page, 'Pull')
  await addTemplate(page, 'Legs')
  const hint = page.getByRole('note').filter({ hasText: HINT })
  await expect(hint).toBeVisible()
  await hint.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText(HINT)).toHaveCount(0)

  // Off: the 4th template opens the Premium sheet.
  await page.getByRole('button', { name: 'Add routine' }).click()
  await expect(premium.getByRole('heading', { name: 'Unlimited routines' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await expect(newTemplate).toHaveCount(0)

  // Reset Premium hints: dropping back to 3 routines shows the hint again.
  // (Before any workout starts, since the hint waits out a workout.)
  const prefsAgain = await openAccountSection(page, 'Preferences')
  await prefsAgain.getByRole('button', { name: 'Reset Premium hints (dev)' }).click()
  await expect(prefsAgain).toContainText('One-time hints will show again.')
  await prefsAgain.getByRole('button', { name: 'Close' }).click()
  await page.locator('.row-wrap', { hasText: 'Legs' }).getByRole('button', { name: 'Archive routine' }).click()
  await page.getByRole('button', { name: 'Confirm archive' }).click()
  await expect(page.getByText('2 of 3 free routines', { exact: true })).toBeVisible()
  await addTemplate(page, 'Arms')
  await expect(page.getByRole('note').filter({ hasText: HINT })).toBeVisible()

  // On: the 4th template opens the name sheet instead.
  await setDevPremium(page, true)
  await goTo(page, 'Routines')
  await page.getByRole('button', { name: 'Add routine' }).click()
  await expect(newTemplate).toBeVisible()
  await expect(premium).toHaveCount(0)
  await newTemplate.getByRole('button', { name: 'Cancel' }).click()

  // On: Plates opens the calculator.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await page.getByRole('button', { name: 'Plates' }).click()
  const plates = page.getByRole('dialog', { name: 'Load the bar' })
  await expect(plates).toBeVisible()
  await expect(premium).toHaveCount(0)
  await plates.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(plates).toHaveCount(0)

  // Off again: Plates opens the Premium sheet.
  await setDevPremium(page, false)
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Plates' }).click()
  await expect(premium.getByRole('heading', { name: 'Plate calculator' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Load the bar' })).toHaveCount(0)
  await premium.getByRole('button', { name: 'Not now' }).click()
})
