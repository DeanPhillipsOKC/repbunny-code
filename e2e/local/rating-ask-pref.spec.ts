import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'

// Issue #776: Preferences' "Ask me to rate RepBunny" switch is on by default,
// native apps only, and stays off once switched off.
async function openPreferences(page: import('@playwright/test').Page, platform: 'web' | 'android') {
  const accountButton = await page.getByRole('button', { name: 'Account' }).elementHandle()
  // As in account-rate-share.spec.ts: report the platform only while the sheet
  // and its Preferences section open (the row reads it when it mounts).
  await accountButton!.evaluate(async (open: HTMLElement, p: string) => {
    const w = window as any
    const wait = () => new Promise((r) => setTimeout(r, 300))
    const real = w.Capacitor.getPlatform
    w.Capacitor.getPlatform = () => p
    open.click()
    await wait()
    const prefs = [...document.querySelectorAll('[role="dialog"] button')].find((b) => /^Preferences/.test(b.textContent?.trim() ?? ''))
    ;(prefs as HTMLElement).click()
    await wait()
    w.Capacitor.getPlatform = real
  }, platform)
  const dialog = page.getByRole('dialog', { name: 'Preferences' })
  return dialog
}

test('the browser build has no rating switch', async ({ page }) => {
  await startLocal(page)
  const dialog = await openPreferences(page, 'web')
  await expect(dialog.getByRole('switch', { name: "Show what's new after updates" })).toBeVisible()
  await expect(dialog.getByRole('switch', { name: 'Ask me to rate RepBunny' })).toHaveCount(0)
})

test('on Android the switch starts on and turning it off sticks', async ({ page }) => {
  await startLocal(page)
  const dialog = await openPreferences(page, 'android')
  const sw = dialog.getByRole('switch', { name: 'Ask me to rate RepBunny' })
  await expect(sw).toHaveAttribute('aria-checked', 'true')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'false')
  expect(await page.evaluate(() => localStorage.getItem('rb-rating-ask-on'))).toBe('0')
  await sw.click()
  await expect(sw).toHaveAttribute('aria-checked', 'true')
})
