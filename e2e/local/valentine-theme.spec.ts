import { test, expect, type Page } from '@playwright/test'
import { openAccountSection } from '../fixtures/account'
import { selectExercise } from '../fixtures/exercise'
import { goTo, openLibrary } from '../fixtures/nav'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #969: the Valentine's Day theme and outfit. Its own palette and art,
// candy hearts on the week tracker and as record confetti, and the Holidays
// outfit wears it in February. Contrast is checked for every theme in
// themes.spec.ts.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'
const ACCENT = '#ff86b0'

async function firstLaunch(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await turnOffDefaultRest(page)
}

function token(page: Page, name: string) {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
}

async function setPremium(page: Page, on: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, on)
}

async function openTheme(page: Page) {
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Theme/ }).click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  await expect(theme).toBeVisible()
  return theme
}

test("with Premium: Valentine's Day persists across a reload, with its own art, candy heart confetti, and tracker", async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByLabel('Default rest timer').fill('60')
  await prefs.getByLabel('Default rest timer').blur()
  await prefs.getByRole('button', { name: 'Close' }).click()

  const theme = await openTheme(page)
  const card = theme.locator('.theme-card', { hasText: "Valentine's Day" })
  await expect(card.locator('.candy-heart')).not.toHaveCount(0)
  await expect(card.locator('.mini-bunny')).toHaveAttribute('src', '/themes/valentine/celebration-bunny.webp')
  await theme.getByRole('button', { name: "Valentine's Day", exact: true }).click()
  await expect.poll(() => token(page, '--accent')).toBe(ACCENT)
  await theme.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  expect(await token(page, '--accent')).toBe(ACCENT)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'valentine')
  await expect(page.locator('html')).toHaveAttribute('data-confetti', 'candy-heart')

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('135')
  await page.getByRole('button', { name: 'Add set' }).click()
  const celebration = page.getByRole('dialog', { name: `First set: ${BENCH}` })
  await expect(celebration.locator('.celebration-mascot')).toHaveAttribute('src', /^\/themes\/valentine\/celebration-(dumbbell-)?bunny\.webp$/)
  const images = await celebration.locator('.confetti').evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundImage))
  expect(images.length).toBeGreaterThan(0)
  // The candy heart's outline, not another theme's shape.
  for (const image of images) expect(image).toContain('M12 21.2s-8.7-5.4')
  await celebration.getByRole('button', { name: 'Nice!' }).click()

  const rest = page.locator('.rest-bunny')
  await expect(rest).toHaveAttribute('src', '/themes/valentine/rest-bunny.webp')
  await expect.poll(() => rest.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  const week = page.locator('.stat-tile-week')
  await expect(week.locator('.paw-day-done .candy-heart')).toHaveCount(1)
  await expect(week.locator('.paw')).toHaveCount(0)
})

test("Holidays wears the Valentine's Day outfit in February", async ({ page }) => {
  await page.clock.setFixedTime(new Date(2027, 1, 9, 9, 0))
  await firstLaunch(page)
  await setPremium(page, true)
  const theme = await openTheme(page)
  const holidays = theme.getByRole('button', { name: 'Holidays outfit' })
  await expect(holidays).toContainText("Valentine's Day in February")
  await holidays.click()
  await expect(holidays).toHaveAttribute('aria-pressed', 'true')
  await expect(theme.getByRole('button', { name: 'Full' }).locator('img')).toHaveAttribute('src', '/themes/valentine/celebration-bunny.webp')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')
})
