import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'

// Issue #726: Rate RepBunny and Share RepBunny sit in the About group on the
// native apps and are hidden in the browser build.
const PLAY_URL = 'https://play.google.com/store/apps/details?id=app.repbunny'

test('the browser build has no Rate or Share rows', async ({ page }) => {
  await startLocal(page)
  await page.getByRole('button', { name: 'Account' }).click()
  const about = page.getByRole('dialog', { name: 'Account' }).getByRole('group', { name: 'About' })
  await expect(about.getByRole('link', { name: 'Privacy policy' })).toBeVisible()
  await expect(about.getByRole('link', { name: 'Rate RepBunny' })).toHaveCount(0)
  await expect(about.getByRole('button', { name: 'Share RepBunny' })).toHaveCount(0)
})

test('on Android the rows open the Play listing and the share sheet', async ({ page }) => {
  await startLocal(page)
  // The browser build can't be the Android platform from the start (its SQLite
  // is the web one, and the rest of the app re-reads the platform), so report
  // Android only for the moment the sheet opens, and stub the share sheet.
  const accountButton = await page.getByRole('button', { name: 'Account' }).elementHandle()
  await accountButton!.evaluate(async (open: HTMLElement) => {
    const w = window as any
    w.__shared = []
    navigator.share = async (o: ShareData) => { w.__shared.push(o) }
    const real = w.Capacitor.getPlatform
    w.Capacitor.getPlatform = () => 'android'
    open.click()
    await new Promise((r) => setTimeout(r, 300))
    w.Capacitor.getPlatform = real
  })
  const about = page.getByRole('dialog', { name: 'Account' }).getByRole('group', { name: 'About' })

  const rate = about.getByRole('link', { name: 'Rate RepBunny' })
  await expect(rate).toHaveAttribute('href', PLAY_URL)
  await expect(rate).toHaveAttribute('target', '_blank')

  // Issue #802: these rows live in AboutLinkRows.vue and once lost their row
  // look (Rate as an underlined link, Share as a small bordered button). Both
  // must be full-width flex rows like Lifting basics, with its divider.
  const share = about.getByRole('button', { name: 'Share RepBunny' })
  const basics = await about.getByRole('button', { name: 'Lifting basics' }).evaluate((el) => {
    const s = getComputedStyle(el)
    return { width: el.getBoundingClientRect().width, borderTop: s.borderTopStyle, borderBottom: s.borderBottomStyle }
  })
  for (const row of [rate, share]) {
    await expect(row).toHaveCSS('display', 'flex')
    await expect(row).toHaveCSS('border-top-style', basics.borderTop)
    await expect(row).toHaveCSS('border-bottom-style', basics.borderBottom)
    expect(await row.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(basics.width, 0)
  }
  await expect(rate).toHaveCSS('text-decoration-line', 'none')

  await share.click()
  await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(1)
  const shared = await page.evaluate(() => (window as any).__shared[0])
  expect(shared.text).toContain(PLAY_URL)
})
