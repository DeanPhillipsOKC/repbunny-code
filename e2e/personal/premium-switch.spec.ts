import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { openAccountSection } from '../fixtures/account'
import { selectExercise } from '../fixtures/exercise'

// Issue #784: the personal Android build sets VITE_PREMIUM_UNLOCKED=true and
// VITE_DEV_TOOLS=true (this project's server). Premium is the default, and the
// Premium (dev) switch in Account > Preferences can turn it off to see the
// free version, then back on.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'

async function openPlates(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await page.getByRole('button', { name: 'Plates' }).click()
}

test('personal build: Premium by default, the dev switch shows the free version and restores Premium', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()

  let prefs = await openAccountSection(page, 'Preferences')
  const toggle = prefs.getByRole('switch', { name: 'Premium (dev)' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await prefs.getByRole('button', { name: 'Close' }).click()

  // Free: the Plates button opens the Premium sheet (survives a reload).
  await page.reload()
  await openPlates(page)
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByRole('heading', { name: 'Plate calculator' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()

  prefs = await openAccountSection(page, 'Preferences')
  const again = prefs.getByRole('switch', { name: 'Premium (dev)' })
  await expect(again).toHaveAttribute('aria-checked', 'false')
  await again.click()
  await expect(again).toHaveAttribute('aria-checked', 'true')
  await prefs.getByRole('button', { name: 'Close' }).click()

  // Premium again: Plates opens the calculator, and the switch holds across a reload.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Plates' }).click()
  await expect(page.getByRole('dialog', { name: 'Load the bar' })).toBeVisible()
  await page.reload()
  prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('switch', { name: 'Premium (dev)' })).toHaveAttribute('aria-checked', 'true')
})
