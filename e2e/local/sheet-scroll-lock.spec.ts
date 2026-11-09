import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'

// Issue #67: while a bottom sheet is open, the page behind it must not
// scroll, and a sheet's own scroll must not chain into the page at its ends.
// src/style.css locks html/body overflow whenever a role="dialog" +
// aria-modal="true" element is in the DOM, and sets overscroll-behavior:
// contain on the dialog (and inner scroll containers), not on every
// descendant (#96: that broke drags starting on a button).
test('an open sheet locks page scroll and contains its own overscroll', async ({ page }) => {
  await startLocal(page)

  const htmlOverflow = () => page.evaluate(() => getComputedStyle(document.documentElement).overflowY)
  const bodyOverflow = () => page.evaluate(() => getComputedStyle(document.body).overflowY)

  expect(await htmlOverflow()).not.toBe('hidden')
  expect(await bodyOverflow()).not.toBe('hidden')

  await page.getByRole('button', { name: 'Account' }).click()
  const sheet = page.getByRole('dialog', { name: 'Account' })
  await expect(sheet).toBeVisible()

  await expect.poll(htmlOverflow).toBe('hidden')
  await expect.poll(bodyOverflow).toBe('hidden')
  await expect(sheet).toHaveCSS('overscroll-behavior-y', 'contain')
  await expect(sheet.getByRole('button', { name: 'Close' })).toHaveCSS('overscroll-behavior-y', 'auto')

  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)

  await expect.poll(htmlOverflow).not.toBe('hidden')
  await expect.poll(bodyOverflow).not.toBe('hidden')
})
