import { test, expect, type Page } from '@playwright/test'
import { startLocal } from '../fixtures/local'
import { accountMenu } from '../fixtures/account'

// Issue #568 (design docs/design/issue-568-guide-search.html, option A):
// Account > About > Help & guides opens the guides in the app, searchable on
// the device (MiniSearch over an index built from site/guides/), and a guide
// opens as text with a link to its page on repbunny.app.

test.use({ viewport: { width: 375, height: 800 } })

function guidesSheet(page: Page) {
  return page.getByRole('dialog', { name: 'Help & guides' })
}

async function openGuides(page: Page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await accountMenu(page).getByRole('group', { name: 'About' }).getByRole('button', { name: 'Help & guides' }).click()
  const sheet = guidesSheet(page)
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('searchbox', { name: 'Search the guides' })).toBeEnabled()
  return sheet
}

function results(page: Page) {
  return guidesSheet(page).getByRole('list', { name: 'Search results' }).getByRole('button')
}

test('before typing, every guide is listed under its topic', async ({ page }) => {
  await startLocal(page)
  const sheet = await openGuides(page)
  for (const topic of ['Logging', 'Routines & programs', 'Progress', 'Make it yours', 'Your data & help']) {
    await expect(sheet.getByRole('heading', { name: topic })).toBeVisible()
  }
  await expect(sheet.getByRole('region', { name: 'Logging' }).getByRole('button', { name: /^Plate calculator/ })).toBeVisible()
  // Nothing spills past the phone's width.
  const box = (await sheet.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(375)
})

test('a typo finds the backup guide first, and it opens as text in the app', async ({ page }) => {
  await startLocal(page)
  const sheet = await openGuides(page)
  await sheet.getByRole('searchbox', { name: 'Search the guides' }).fill('bakup')
  const first = results(page).first()
  await expect(first).toContainText('Back up just what you need')
  await expect(first.locator('mark').first()).toBeVisible()

  await first.click()
  await expect(sheet.getByRole('heading', { name: 'Back up just what you need' })).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'Open Your data' })).toBeVisible()
  await expect(sheet.locator('.step-body strong', { hasText: 'Save backup' })).toBeVisible()
  const web = sheet.getByRole('link', { name: /Open on repbunny\.app/ })
  await expect(web).toHaveAttribute('href', 'https://repbunny.app/guides/partial-backups/')
  await expect(web).toHaveAttribute('target', '_blank')
  await expect(sheet.locator('article img, article video')).toHaveCount(0)

  // Back returns to the results with the search kept; Back again to Account.
  await sheet.getByRole('button', { name: 'Back to guides' }).click()
  await expect(sheet.getByRole('searchbox', { name: 'Search the guides' })).toHaveValue('bakup')
  await expect(results(page).first()).toContainText('Back up just what you need')
  await sheet.getByRole('button', { name: 'Back to Account' }).click()
  await expect(accountMenu(page).getByRole('group', { name: 'About' })).toBeVisible()
})

test('a synonym finds the guide: "one rep max" lists Exercise history first', async ({ page }) => {
  await startLocal(page)
  const sheet = await openGuides(page)
  await sheet.getByRole('searchbox', { name: 'Search the guides' }).fill('one rep max')
  await expect(results(page).first()).toContainText('Exercise history')
})

test('with the network off, search still works and makes no requests', async ({ page, context }) => {
  await startLocal(page)
  let sheet = await openGuides(page)
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(sheet).toBeHidden()

  const requests: string[] = []
  page.on('request', (r) => requests.push(r.url()))
  await context.setOffline(true)
  sheet = await openGuides(page)
  await sheet.getByRole('searchbox', { name: 'Search the guides' }).fill('rest timr')
  await expect(results(page).first()).toContainText('Rest timer')
  await results(page).first().click()
  await expect(sheet.getByRole('heading', { name: 'Rest timer' })).toBeVisible()
  expect(requests.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'))).toEqual([])
  await context.setOffline(false)
})

test('nothing found offers Email support, with the search words in the email', async ({ page }) => {
  await startLocal(page)
  await page.evaluate(() => {
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (!this.href.startsWith('mailto:')) return click.call(this)
      ;(window as unknown as { mailto?: string }).mailto = this.href
    }
  })
  const sheet = await openGuides(page)
  await sheet.getByRole('searchbox', { name: 'Search the guides' }).fill('zzqxv')
  await expect(sheet.getByText('No guide for that yet')).toBeVisible()
  await sheet.getByRole('button', { name: 'Email support' }).click()
  const href = await page.evaluate(() => (window as unknown as { mailto?: string }).mailto)
  expect(href).toMatch(/^mailto:hello@repbunny\.app\?subject=RepBunny%20question/)
  expect(decodeURIComponent(href!.split('body=')[1])).toContain('I searched the guides for: "zzqxv"')
})
