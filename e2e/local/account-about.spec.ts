import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'

// Issue #61: App Store guideline 5.1.1 wants the privacy policy reachable
// inside the app. The Account sheet ends with an About group linking the
// privacy policy and support page (opening in the browser) and showing the
// the version string.
test('the Account sheet links the privacy policy and support page and shows the version', async ({ page }) => {
  await startLocal(page)

  // Issue #931: the version lives only here, not in a footer on every screen.
  await expect(page.locator('footer.app-version')).toHaveCount(0)

  await page.getByRole('button', { name: 'Account' }).click()
  const sheet = page.getByRole('dialog', { name: 'Account' })
  const about = sheet.getByRole('group', { name: 'About' })

  const privacy = about.getByRole('link', { name: 'Privacy policy' })
  await expect(privacy).toHaveAttribute('href', 'https://repbunny.app/privacy/')
  await expect(privacy).toHaveAttribute('target', '_blank')
  await expect(privacy).toHaveAttribute('rel', 'noopener')
  // Issue #802: the rows live in AboutLinkRows.vue, out of reach of the
  // sheet's scoped styles, so they lost their row look once. Same box and
  // no link underline as the Help & guides row.
  await expect(privacy).toHaveCSS('display', 'flex')
  await expect(privacy).toHaveCSS('text-decoration-line', 'none')
  const help = about.getByRole('button', { name: 'Help & guides' })
  await expect(privacy).toHaveCSS('padding', await help.evaluate((el) => getComputedStyle(el).padding))

  const support = about.getByRole('link', { name: 'Support' })
  await expect(support).toHaveAttribute('href', 'https://repbunny.app/support/')
  await expect(support).toHaveAttribute('target', '_blank')
  await expect(support).toHaveAttribute('rel', 'noopener')

  // Issue #111: Help & guides sits right after What's new. Issue #568: it opens
  // the guides in the app now (guide-search.spec.ts), not the website.
  await expect(about.getByRole('button', { name: 'Help & guides' })).toBeVisible()
  await expect(about.locator('.data-title')).toContainText(["What's new", 'Help & guides', 'Privacy policy'])

  await expect(about.locator('.about-version')).toHaveText(/^v\d+\+[0-9a-f]{7,}/)

  // Issue #100: Request a feature sits below Report a bug.
  const rows = about.locator('.data-title')
  await expect(rows).toContainText(['Report a bug', 'Request a feature'])
  await expect(about.getByRole('button', { name: 'Request a feature' })).toBeVisible()

  // The group sits at the bottom of a scrolling sheet; it has to be reachable.
  await page.setViewportSize({ width: 375, height: 800 })
  await privacy.scrollIntoViewIfNeeded()
  await expect(privacy).toBeInViewport()
})
