import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'

// Issue #269: the app self-hosts Baloo 2 and Manrope, so launching it never
// contacts Google Fonts (the privacy policy says nothing leaves the phone).
test('app load makes no request to a font host and renders the self-hosted fonts', async ({ page }) => {
  const hosts = new Set<string>()
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.host)
  })
  await startLocal(page)
  // Local mode mounts only once its data has been checked (#431), so wait
  // for Home's text before asking which fonts it loaded.
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  expect([...hosts].filter((h) => /googleapis|gstatic/.test(h))).toEqual([])
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
  )
  expect(loaded).toContain('Manrope')
})
