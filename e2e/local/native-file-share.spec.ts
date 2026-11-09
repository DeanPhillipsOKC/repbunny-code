import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'

// Issue #457: the native apps hand files to the system share sheet through
// @capacitor/filesystem + @capacitor/share. This browser build runs the
// plugins' web fallbacks, so deliverFile is called with its native flag on
// and navigator.share stands in for the share sheet.

test('native delivery writes the file and opens the share sheet', async ({ page }) => {
  await startLocal(page)
  const result = await page.evaluate(async () => {
    const shared: unknown[] = []
    Object.assign(navigator, { share: async (data: unknown) => void shared.push(data) })
    const { deliverFile } = await window.__rbImport('/src/lib/backup.ts')
    const ok = await deliverFile('report.pdf', 'application/pdf', 'pdf-bytes', true)
    return { ok, shared: shared.length }
  })
  expect(result).toEqual({ ok: true, shared: 1 })
})

test('native delivery reports a dismissed share sheet as not saved', async ({ page }) => {
  await startLocal(page)
  const ok = await page.evaluate(async () => {
    Object.assign(navigator, { share: async () => Promise.reject(new Error('Share canceled')) })
    const { deliverFile } = await window.__rbImport('/src/lib/backup.ts')
    return deliverFile('report.pdf', 'application/pdf', 'pdf-bytes', true)
  })
  expect(ok).toBe(false)
})

test('a delivery that cannot happen throws and is logged instead of claiming success', async ({ page }) => {
  await startLocal(page)
  const result = await page.evaluate(async () => {
    Object.assign(navigator, { share: undefined })
    const { deliverFile } = await window.__rbImport('/src/lib/backup.ts')
    const { repos } = await window.__rbImport('/src/data/index.ts')
    let thrown = ''
    try {
      await deliverFile('report.pdf', 'application/pdf', 'pdf-bytes', true)
    } catch (e) {
      thrown = e instanceof Error ? e.message : String(e)
    }
    await new Promise((r) => setTimeout(r, 200))
    return { thrown, logged: JSON.stringify((await repos.clientErrors.list()).data) }
  })
  expect(result.thrown).not.toBe('')
  expect(result.logged).toContain('file.deliver')
  expect(result.logged).toContain('application/pdf')
})
