import { test, expect, type Page } from '@playwright/test'
import { startLocal } from '../fixtures/local'
import { openAccountSection } from '../fixtures/account'
import { goTo } from '../fixtures/nav'
import { loadReleaseNotes } from '../../scripts/lib/release-notes.mjs'
import { formatNoteDate, noteGuideUrl, noteText, themeNoteSince } from '../../src/lib/whatsNew'

// Issue #558: the same list the dev server baked into the app.
const releaseNotes = loadReleaseNotes()

// Issue #101: after an update, Home shows a one-time "RepBunny just updated"
// banner (not a modal) that opens the What's new sheet; closing either marks
// the build seen. A fresh device stores the build silently and shows nothing,
// and a Preferences switch turns the banner off.

test.use({ viewport: { width: 375, height: 800 } })

// Pretend this device last saw an older build. Only when nothing is stored,
// so the app's own write survives the reload.
async function seenOlderBuild(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('repbunny-whats-new-seen') === null) localStorage.setItem('repbunny-whats-new-seen', '1')
  })
}

function banner(page: Page) {
  return page.getByRole('region', { name: 'RepBunny just updated' })
}

test("after an update the banner opens What's new, newest first, and stays gone after a reload", async ({ page }) => {
  await seenOlderBuild(page)
  await startLocal(page)

  const note = banner(page)
  await expect(note).toBeVisible()
  // Issue #887: an unseen note that ships a theme takes the banner; otherwise the newest note.
  await expect(note).toContainText(themeNoteSince(releaseNotes, 1)?.text ?? noteText(releaseNotes[0].items[0]))

  // In the page flow: under the title, above Start workout, clear of the nav.
  const noteBox = (await note.boundingBox())!
  const navBox = (await page.getByRole('navigation', { name: 'Primary' }).boundingBox())!
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(navBox.y)
  const titleBox = (await page.getByRole('heading', { name: 'Log a workout' }).boundingBox())!
  expect(noteBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height)
  const start = page.getByRole('button', { name: /start workout/i }).first()
  if (await start.isVisible()) expect(noteBox.y + noteBox.height).toBeLessThanOrEqual((await start.boundingBox())!.y)
  expect(noteBox.x).toBeGreaterThanOrEqual(0)
  expect(noteBox.x + noteBox.width).toBeLessThanOrEqual(375)

  await note.getByRole('button', { name: "See what's new" }).click()
  const sheet = page.getByRole('dialog', { name: "What's new" })
  await expect(sheet).toBeVisible()
  const entries = sheet.getByRole('region')
  await expect(entries.first()).toHaveAccessibleName(formatNoteDate(releaseNotes[0].date))
  await expect(entries.first().getByText('New', { exact: true })).toBeVisible()
  await expect(entries.first()).toContainText(noteText(releaseNotes[0].items[0]))
  await expect(entries).toHaveCount(Math.min(releaseNotes.length, 10))

  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(banner(page)).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect(banner(page)).toHaveCount(0)

  // About still has it, now without the unread dot.
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const about = page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('group', { name: 'About' })
  const row = about.getByRole('button', { name: /^What's new/ })
  await expect(row).toBeVisible()
  await expect(row.getByRole('img', { name: 'New updates' })).toHaveCount(0)
})

test('closing the banner marks the update seen', async ({ page }) => {
  await seenOlderBuild(page)
  await startLocal(page)

  await banner(page).getByRole('button', { name: 'Close' }).click()
  await expect(banner(page)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
})

test("the About row shows a dot until What's new is opened", async ({ page }) => {
  await seenOlderBuild(page)
  await startLocal(page)

  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Account', exact: true })
  const about = menu.getByRole('group', { name: 'About' })
  // What's new is About's first row.
  await expect(about.locator('.data-item').first()).toHaveAccessibleName(/^What's new/)
  const row = about.getByRole('button', { name: /^What's new/ })
  await expect(row.getByRole('img', { name: 'New updates' })).toBeVisible()

  await row.click()
  const sheet = page.getByRole('dialog', { name: "What's new" })
  await expect(sheet.getByRole('region').first().getByText('New', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Back to Account' }).click()
  await expect(row.getByRole('img', { name: 'New updates' })).toHaveCount(0)

  await menu.getByRole('button', { name: 'Close' }).click()
  await expect(banner(page)).toHaveCount(0)
})

test('with the Preferences switch off, the banner never shows', async ({ page }) => {
  await seenOlderBuild(page)
  await startLocal(page)
  await expect(banner(page)).toBeVisible()

  const prefs = await openAccountSection(page, 'Preferences')
  const toggle = prefs.getByRole('switch', { name: "Show what's new after updates" })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await prefs.getByRole('button', { name: 'Close' }).click()

  await expect(banner(page)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect(banner(page)).toHaveCount(0)

  // The sheet is still in About.
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^What's new/ }).click()
  await expect(page.getByRole('dialog', { name: "What's new" })).toBeVisible()
})

test('a fresh device shows no banner', async ({ page }) => {
  await startLocal(page)
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
  const stored = await page.evaluate(() => localStorage.getItem('repbunny-whats-new-seen'))
  expect(Number(stored)).toBeGreaterThan(0)
})

test('note items with a guide link to it on repbunny.app, and plain items have no link (#102)', async ({ page }) => {
  await startLocal(page)
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^What's new/ }).click()
  const sheet = page.getByRole('dialog', { name: "What's new" })

  const shown = releaseNotes.slice(0, 10).flatMap((n) => n.items)
  const guided = shown.find((item) => noteGuideUrl(item) !== null)!
  const plain = shown.find((item) => noteGuideUrl(item) === null)!
  expect(guided, 'a note in the newest 10 days links a guide').toBeTruthy()

  const guidedRow = sheet.getByRole('listitem').filter({ hasText: noteText(guided) })
  const link = guidedRow.getByRole('link', { name: 'How to use it' })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', noteGuideUrl(guided)!)
  expect(noteGuideUrl(guided)).toMatch(/^https:\/\/repbunny\.app\/guides\/[a-z0-9-]+\/$/)
  await expect(link).toHaveAttribute('target', '_blank')

  // Inside the sheet, no wider than the 375px screen.
  const box = (await link.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(375)

  const plainRow = sheet.getByRole('listitem').filter({ hasText: noteText(plain) })
  await expect(plainRow).toBeVisible()
  await expect(plainRow.getByRole('link')).toHaveCount(0)
})

test('Back and Close stay pinned at the top while the notes scroll', async ({ page }) => {
  await startLocal(page)
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  await page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^What's new/ }).click()
  const sheet = page.getByRole('dialog', { name: "What's new" })
  await expect(sheet.getByRole('region').first()).toBeVisible()

  await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await expect.poll(() => sheet.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

  const sheetBox = (await sheet.boundingBox())!
  for (const name of ['Back to Account', 'Close']) {
    const button = sheet.getByRole('button', { name })
    await expect(button).toBeInViewport()
    const box = (await button.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(sheetBox.y)
    expect(box.y + box.height).toBeLessThanOrEqual(sheetBox.y + 80)
  }
  await expect(sheet.getByRole('heading', { name: "What's new" })).toBeInViewport()

  // Pinned and on top: a tap lands on Close, not on the notes scrolled under it.
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)
})

// Issue #887 (docs/design/issue-886-theme-discovery.html, option N2): a note
// that ships a theme leads the banner, with a Try it button. The real notes may
// not have one, so this adds one to the list the app baked in, then reopens
// Home so the banner reads it.
const THEME_NOTE = 'New Halloween theme and icon, with candy-corn confetti for your records.'
const HALLOWEEN_ACCENT = '#ff9a3c'

async function addThemeNote(page: Page) {
  await page.evaluate(async (text) => {
    const { releaseNotes } = await window.__rbImport('/src/lib/releaseNotes.ts')
    const day = releaseNotes[0]
    day.items.unshift({ text, theme: 'halloween' })
    day.builds?.unshift(day.build)
  }, THEME_NOTE)
  await goTo(page, 'Exercises')
  await goTo(page, 'Home')
}

function accent(page: Page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
}

test('a new theme leads the banner, and Try it previews it for a free user', async ({ page }) => {
  await seenOlderBuild(page)
  await startLocal(page, { premium: false })
  await addThemeNote(page)

  const note = banner(page)
  await expect(note).toContainText(THEME_NOTE)
  const tryIt = note.getByRole('button', { name: 'Try the Halloween theme' })
  await expect(tryIt).toHaveText('Try it')
  await expect(note.getByRole('button', { name: "See what's new" })).toBeVisible()
  // Side by side on a 375px phone, inside the banner.
  const tryBox = (await tryIt.boundingBox())!
  const linkBox = (await note.getByRole('button', { name: "See what's new" }).boundingBox())!
  expect(Math.abs(tryBox.y + tryBox.height / 2 - (linkBox.y + linkBox.height / 2))).toBeLessThan(4)
  const noteBox = (await note.boundingBox())!
  expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(noteBox.x + noteBox.width)

  await tryIt.click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  const preview = theme.getByRole('group', { name: 'Theme preview' })
  await expect(preview).toContainText("You're trying Halloween.")
  await expect(preview.getByRole('button', { name: 'Keep it with Premium' })).toBeVisible()
  await expect.poll(() => accent(page)).toBe(HALLOWEEN_ACCENT)
  await expect(banner(page)).toHaveCount(0)

  // Go back ends the preview, and the banner stays gone after a reload.
  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect.poll(() => accent(page)).not.toBe(HALLOWEEN_ACCENT)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
})

test('with Premium, Try it switches to the new theme right away', async ({ page }) => {
  await seenOlderBuild(page)
  await startLocal(page)
  await addThemeNote(page)

  await banner(page).getByRole('button', { name: 'Try the Halloween theme' }).click()
  await expect(banner(page)).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Theme', exact: true })).toHaveCount(0)
  await expect.poll(() => accent(page)).toBe(HALLOWEEN_ACCENT)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect.poll(() => accent(page)).toBe(HALLOWEEN_ACCENT)
  await expect(banner(page)).toHaveCount(0)
})
