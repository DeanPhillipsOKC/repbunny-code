import { test, expect } from '@playwright/test'
import { accountMenu, openAccountSection } from '../fixtures/account'

// Issue #98 in local mode: no account card or Sign out, and the third row is
// "Reset & erase".
test.use({ viewport: { width: 375, height: 800 } })

test('the local Account sheet lists Reset & erase and no sign-in parts', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'kg' }).click()

  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const menu = accountMenu(page)
  await expect(menu.getByText('Signed in as')).toHaveCount(0)
  // A first launch rests 2:00 by default (#429).
  await expect(menu.getByRole('button', { name: /^Preferences/ })).toContainText(/kg · Rest timer 120s/)
  await expect(menu.getByRole('button', { name: /^Your data/ })).toBeVisible()
  await expect(menu.getByRole('button', { name: /^Account & privacy/ })).toHaveCount(0)

  const erase = await openAccountSection(page, 'Reset & erase')
  await expect(erase.getByRole('heading', { name: 'Reset & erase' })).toBeVisible()
  await expect(erase.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  await expect(erase.getByText('Signed in as')).toHaveCount(0)
  await expect(erase.getByRole('button', { name: 'Erase all data' })).toBeVisible()

  // Cancel on Erase comes back to Reset & erase.
  await erase.getByRole('button', { name: 'Erase all data' }).click()
  await page.getByRole('dialog', { name: 'Erase all data?' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(erase).toBeVisible()
  await erase.getByRole('button', { name: 'Back to Account' }).click()
  await expect(menu).toBeVisible()
})
