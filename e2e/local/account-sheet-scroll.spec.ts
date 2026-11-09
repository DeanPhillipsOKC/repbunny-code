import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'

// Issue #96: on a phone, a drag that started on a button or row in the
// Account sheet didn't scroll the sheet. Desktop Chromium may not reproduce
// the Android behavior exactly, so this checks the sheet scrolls from a
// wheel gesture that starts over a button, and that the button still clicks.
// Issue #98 made the top level short enough to fit at 800px tall, so this
// uses a short phone screen to keep the sheet overflowing.
test.use({ viewport: { width: 375, height: 500 } })

test('the Account sheet scrolls when the gesture starts on a button', async ({ page }) => {
  await startLocal(page)

  await page.getByRole('button', { name: 'Account' }).click()
  const sheet = page.getByRole('dialog', { name: 'Account', exact: true })
  await expect(sheet).toBeVisible()

  const scrollTop = () => sheet.evaluate((el) => el.scrollTop)
  const overflows = await sheet.evaluate((el) => el.scrollHeight > el.clientHeight)
  expect(overflows).toBe(true)
  expect(await scrollTop()).toBe(0)

  // The Preferences row sits in the sheet's visible area before any scroll.
  const rowButton = sheet.getByRole('button', { name: /^Preferences/ })
  const box = await rowButton.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('button') !== null, [x, y])).toBe(true)
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, 300)

  await expect.poll(scrollTop).toBeGreaterThan(0)

  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)
})
