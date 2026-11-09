import { test, expect } from '@playwright/test'

// Issue #83: in local mode (the native apps) client errors stay on the
// device, in the SQLite client_errors table. Read back through the app's own
// repos module, which the dev server serves at the same URL the app loaded.

test('an uncaught error is logged to on-device storage in local mode', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()

  const message = `local boom ${Date.now()}`
  await page.evaluate((m) => {
    setTimeout(() => {
      throw new Error(m)
    })
  }, message)

  const listErrors = () =>
    page.evaluate(async () => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { data } = await repos.clientErrors.list()
      return data.map((row: { kind: string; message: string; stack: string | null; app_version: string | null }) => row)
    })

  await expect.poll(async () => (await listErrors()).map((row) => row.message)).toContain(message)
  const logged = (await listErrors()).find((row) => row.message === message)!
  expect(logged.kind).toBe('error')
  expect(logged.stack).toContain(message)
  expect(logged.app_version).toBeTruthy()
  expect(await page.evaluate(() => localStorage.getItem('repbunny-client-error-queue'))).toBeNull()
})
