import { test, expect, type Page } from '@playwright/test'
import { openAccountSection } from '../fixtures/account'

// Issue #1002 (mockup docs/design/issue-1002-look-step.html, option A): a free
// user who finishes setup on a Premium theme gets a one-time 7-day Themes
// trial (no milestone pass used). When it ends the app is back on Classic,
// and Home's trial-end banner names the theme once, with Keep it with
// Premium and Change theme. A setup replay never starts a second one.
test.use({ viewport: { width: 375, height: 800 }, storageState: { cookies: [], origins: [] } })

const DAY = 24 * 60 * 60 * 1000

function wizard(page: Page) {
  return page.getByRole('dialog', { name: 'Set up RepBunny' })
}

function card(page: Page, name: string) {
  return wizard(page).getByRole('group', { name: 'Look' }).getByRole('button', { name, exact: true })
}

async function pickOnLookStep(page: Page, theme: string) {
  const w = wizard(page)
  await expect(w.getByRole('heading', { name: 'Pick your look' })).toBeVisible()
  await w.getByRole('button', { name: /^More themes/ }).click()
  await card(page, theme).click()
  await expect(card(page, theme)).toHaveAttribute('aria-pressed', 'true')
}

async function finishFromLookStep(page: Page) {
  const w = wizard(page)
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'Your workouts, kept safe' })).toBeVisible()
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'How do you want to train?' })).toBeVisible()
  await w.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(w).toHaveCount(0)
}

async function setupOnHalloween(page: Page) {
  await page.clock.install()
  await page.goto('/')
  await wizard(page).getByRole('button', { name: 'Set up in 30 seconds' }).click()
  await wizard(page).getByRole('button', { name: 'Next' }).click()
  await pickOnLookStep(page, 'Halloween')
  await finishFromLookStep(page)
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
}

function trialState(page: Page) {
  return page.evaluate(async () => {
    const { readTrialState } = await window.__rbImport('/src/lib/trialPass.ts')
    return readTrialState()
  })
}

test('finishing setup on Halloween starts a 7-day Themes trial; it ends on Classic with one banner, and Change theme opens the Theme screen', async ({ page }) => {
  await setupOnHalloween(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'halloween')
  const state = await trialState(page)
  expect(state.trials).toHaveLength(1)
  expect(state.trials[0]).toMatchObject({ feature: 'themes', setup: true, theme: 'halloween' })
  // It isn't a milestone pass, so none is used up.
  expect(state.granted).toEqual([])

  // The Theme screen shows the trial's days left, as for any trial.
  let prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Theme/ }).click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  await expect(theme.getByTestId('trial-note')).toContainText('Trial: 7 days left')
  await expect(theme.getByRole('button', { name: 'Halloween', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await theme.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'halloween')

  // A reload keeps it while the trial runs.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'halloween')

  // Eight days on: back on Classic, and Home says so once.
  await page.clock.fastForward(8 * DAY)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')
  const ended = page.getByRole('region', { name: 'Trial ended' })
  await expect(ended).toContainText("Your Halloween trial ended, so you're back on Classic.")
  await expect(ended.getByRole('button', { name: 'Keep Halloween with Premium' })).toBeVisible()
  await ended.getByRole('button', { name: 'Change theme' }).click()
  await expect(theme).toBeVisible()
  await expect(theme.getByRole('button', { name: 'Classic', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await theme.getByRole('button', { name: 'Close' }).click()
  await expect(ended).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Trial ended' })).toHaveCount(0)

  // A setup replay shows the themes, but a Premium pick there starts no
  // second trial: it's a preview that ends with setup.
  prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Run setup again/ }).click()
  await wizard(page).getByRole('button', { name: 'Next' }).click()
  await pickOnLookStep(page, 'Christmas')
  await expect(wizard(page).getByText(/free for 7 days/)).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'christmas')
  await finishFromLookStep(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')
  expect((await trialState(page)).trials).toHaveLength(1)
  await expect(page.getByRole('region', { name: 'Trial ended' })).toHaveCount(0)
})

test('the setup trial banner: Keep it with Premium opens the Premium sheet, and the note is settled for good', async ({ page }) => {
  await setupOnHalloween(page)
  await page.clock.fastForward(8 * DAY)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')
  const ended = page.getByRole('region', { name: 'Trial ended' })
  await ended.getByRole('button', { name: 'Keep Halloween with Premium' }).click()
  await expect(page.getByRole('dialog', { name: 'Premium' })).toBeVisible()
  await expect(ended).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Trial ended' })).toHaveCount(0)
  // The pick is kept, not applied, like a lost unlock.
  expect(await page.evaluate(() => localStorage.getItem('repbunny-theme'))).toBe('halloween')
})
