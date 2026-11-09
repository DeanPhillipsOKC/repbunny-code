import { expect, type Locator, type Page } from '@playwright/test'

// Issue #98: the Account sheet's settings live on sub-screens behind three
// rows on its top level. This opens the sheet (unless its top level is
// already showing), taps a row, and returns the sub-screen's dialog.
// "Reset & erase" is local mode's name for "Account & privacy".
export type AccountSection = 'Preferences' | 'Your data' | 'Account & privacy' | 'Reset & erase'

export function accountMenu(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Account', exact: true })
}

export async function openAccountSection(page: Page, section: AccountSection): Promise<Locator> {
  const menu = accountMenu(page)
  if (!(await menu.isVisible())) await page.getByRole('button', { name: 'Account', exact: true }).click()
  await menu.getByRole('button', { name: new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click()
  const screen = page.getByRole('dialog', { name: section, exact: true })
  await expect(screen).toBeVisible()
  return screen
}
