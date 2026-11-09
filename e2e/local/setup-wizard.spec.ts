import { test, expect, type Page } from '@playwright/test'
import { localDb, startLocal } from '../fixtures/local'
import { openAccountSection } from '../fixtures/account'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { goTo } from '../fixtures/nav'

// Issue #397 (design docs/design/onboarding-wizard.html): the first-run setup
// wizard. Runs in local mode (the native apps' data path), where each test
// starts with an empty database, like a fresh install. playwright.config.ts
// presets the wizard's "setup done" flag for every other spec; this file
// clears it.
test.use({ viewport: { width: 375, height: 800 }, storageState: { cookies: [], origins: [] } })

function wizard(page: Page) {
  return page.getByRole('dialog', { name: 'Set up RepBunny' })
}

function look(page: Page, name: string) {
  return wizard(page).getByRole('group', { name: 'Look' }).getByRole('button', { name, exact: true })
}

function token(page: Page, name: string) {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
}

// The last step (#399) has no Done: its choices finish setup. Skip there
// saves the earlier steps without picking one, which keeps Home's welcome
// card. On the phone the automatic copy step (#874) comes before it.
async function finishWithoutPick(page: Page) {
  const w = wizard(page)
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'Your workouts, kept safe' })).toBeVisible()
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'How do you want to train?' })).toBeVisible()
  await w.getByRole('button', { name: 'Skip', exact: true }).click()
}

async function openStartStep(page: Page) {
  await page.goto('/')
  const w = wizard(page)
  await w.getByRole('button', { name: 'Set up in 30 seconds' }).click()
  await w.getByRole('button', { name: 'Next' }).click()
  await w.getByRole('button', { name: 'Next' }).click()
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'How do you want to train?' })).toBeVisible()
}

async function openLookStep(page: Page) {
  await page.goto('/')
  await wizard(page).getByRole('button', { name: 'Set up in 30 seconds' }).click()
  await wizard(page).getByRole('button', { name: 'Next' }).click()
  await expect(wizard(page).getByRole('heading', { name: 'Pick your look' })).toBeVisible()
}

// What Preferences > Theme shows as picked.
async function expectThemeSettings(page: Page, theme: string, mascot: string) {
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Theme/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Theme' })
  await expect(sheet.getByRole('button', { name: theme, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: mascot, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Close' }).click()
}

async function expectHome(page: Page) {
  await expect(wizard(page)).toHaveCount(0)
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Which unit do you lift in?' })).toHaveCount(0)
}

test('a fresh install opens on the welcome screen, and step 1 saves the unit and the first weigh-in', async ({ page }) => {
  await page.goto('/')
  const w = wizard(page)
  await expect(w.getByRole('heading', { name: 'RepBunny' })).toBeVisible()
  await expect(w.getByText('No account. Your data stays on your phone')).toBeVisible()
  // The wizard replaces the one-time unit sheet for new users.
  await expect(page.getByRole('dialog', { name: 'Which unit do you lift in?' })).toHaveCount(0)

  await w.getByRole('button', { name: 'Set up in 30 seconds' }).click()
  await expect(w.getByRole('heading', { name: 'How do you measure?' })).toBeVisible()
  await expect(w.getByText('Stays on this phone.')).toBeVisible()
  // en-US preselects pounds.
  await expect(w.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Back returns to the welcome screen and forward again keeps the step.
  await w.getByRole('button', { name: 'Back' }).click()
  await expect(w.getByRole('button', { name: 'Set up in 30 seconds' })).toBeVisible()
  await w.getByRole('button', { name: 'Set up in 30 seconds' }).click()

  await w.getByRole('button', { name: 'kg', exact: true }).click()
  await expect(w.getByRole('button', { name: 'kg', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(w.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute('aria-pressed', 'false')

  // A nonsense body weight is caught before leaving the step.
  await w.getByLabel('Body weight').fill('0')
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('alert')).toHaveText('Enter your body weight, or leave it blank.')
  await expect(w.getByRole('heading', { name: 'How do you measure?' })).toBeVisible()

  await w.getByLabel('Body weight').fill('80.5')
  await w.getByRole('button', { name: 'Next' }).click()
  // Step 2: Classic is preselected on a fresh install.
  await expect(w.getByRole('heading', { name: 'Pick your look' })).toBeVisible()
  await expect(w.getByText('Step 2 of 4')).toBeVisible()
  await expect(look(page, 'Classic')).toHaveAttribute('aria-pressed', 'true')
  await finishWithoutPick(page)
  await expectHome(page)

  const prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true')
  await prefs.getByRole('button', { name: 'Close' }).click()

  await goTo(page, 'Body')
  await expect(page.getByText('80.5', { exact: true }).first()).toBeVisible()

  // Done for good: a reload goes straight to the app.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Body' }).first()).toBeVisible()
  await expect(wizard(page)).toHaveCount(0)
})

test('Skip setup on the welcome screen lands on Home with the default unit, and never comes back', async ({ page }) => {
  await page.goto('/')
  await wizard(page).getByRole('button', { name: 'Skip setup' }).click()
  await expectHome(page)

  const prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'true')
  await prefs.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
  await expect(wizard(page)).toHaveCount(0)
})

test('Skip on step 1 keeps the tapped unit and saves no weigh-in', async ({ page }) => {
  await page.goto('/')
  const w = wizard(page)
  await w.getByRole('button', { name: 'Set up in 30 seconds' }).click()
  await w.getByRole('button', { name: 'kg', exact: true }).click()
  await w.getByLabel('Body weight').fill('80')
  await w.getByRole('button', { name: 'Skip', exact: true }).click()
  await expectHome(page)

  const prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true')
  await prefs.getByRole('button', { name: 'Close' }).click()

  await goTo(page, 'Body')
  await expect(page.getByText('80', { exact: true })).toHaveCount(0)
})

test('Run setup again opens step 1 with the current unit, and only changes the unit and adds a weigh-in', async ({ page }) => {
  await page.goto('/')
  const w = wizard(page)
  await w.getByRole('button', { name: 'Set up in 30 seconds' }).click()
  await w.getByRole('button', { name: 'kg', exact: true }).click()
  await w.getByLabel('Body weight').fill('80')
  await w.getByRole('button', { name: 'Next' }).click()
  await finishWithoutPick(page)
  await expectHome(page)

  // Skip on a replay changes nothing.
  let prefs = await openAccountSection(page, 'Preferences')
  // #767: the guided tour's replay row was pulled with the tour.
  await expect(prefs.getByRole('button', { name: /^Show me around again/ })).toHaveCount(0)
  await prefs.getByRole('button', { name: /^Run setup again/ }).click()
  await expect(prefs).toHaveCount(0)
  await expect(w.getByRole('heading', { name: 'How do you measure?' })).toBeVisible()
  await expect(w.getByRole('button', { name: 'kg', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(w.getByLabel('Body weight')).toHaveValue('')
  await w.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(w).toHaveCount(0)

  prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true')
  await prefs.getByRole('button', { name: /^Run setup again/ }).click()
  await w.getByRole('button', { name: 'lb', exact: true }).click()
  await w.getByLabel('Body weight').fill('178')
  await w.getByRole('button', { name: 'Next' }).click()
  await finishWithoutPick(page)
  await expect(w).toHaveCount(0)

  prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'true')
  await prefs.getByRole('button', { name: 'Close' }).click()

  // Both weigh-ins are there (80 kg shows as about 176.4 lb): the replay
  // added one and deleted nothing.
  await goTo(page, 'Body')
  await expect(page.getByText('178', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('img', { name: /^Body weight over time, from 176\.\d+ to 178 lb$/ })).toBeVisible()
})

// Issue #398, reworked by #886 and #1002 (mockup
// docs/design/issue-1002-look-step.html, option A): step 2, Pick your look.
// A Bunny art switch, Classic and Chalk as cards, and every other theme as
// the same cards under a More themes accordion. A tap applies the theme to
// the whole app at once; setup never opens the theme sheet.
function bunnySwitch(page: Page) {
  return wizard(page).getByRole('switch', { name: 'Bunny art' })
}

function moreThemes(page: Page) {
  return wizard(page).getByRole('button', { name: /^More themes/ })
}

test('the look step opens with bunny art on, Classic picked, and More themes closed', async ({ page }) => {
  await openLookStep(page)
  await expect(bunnySwitch(page)).toHaveAttribute('aria-checked', 'true')
  await expect(bunnySwitch(page)).toHaveAccessibleDescription('The bunny cheers you on, with confetti for records.')
  const cards = wizard(page).getByRole('group', { name: 'Look' }).locator('.card')
  await expect(cards).toHaveCount(2)
  await expect(look(page, 'Classic')).toHaveAttribute('aria-pressed', 'true')
  await expect(look(page, 'Classic').locator('.check')).toHaveText('✓')
  await expect(look(page, 'Chalk')).toHaveAttribute('aria-pressed', 'false')
  await expect(look(page, 'Chalk').locator('.check')).toHaveCount(0)
  await expect(look(page, 'Classic').locator('img.mini-bunny')).toBeVisible()
  await expect(moreThemes(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(moreThemes(page)).toContainText('8 more, seasonal ones too')
  // The old tiles and the sheet link are gone, and nothing is sold.
  await expect(look(page, 'Playful')).toHaveCount(0)
  await expect(wizard(page).getByRole('button', { name: /See every theme/ })).toHaveCount(0)
  await expect(wizard(page).getByText('Premium')).toHaveCount(0)
  // Nothing spills sideways at 375px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  await expect(page.locator('html')).toHaveAttribute('data-mascot', 'full')
  expect(await token(page, '--accent')).toBe('#f2879c')
})

test('Bunny art off drops the art from every card; Chalk with it off lasts after a relaunch', async ({ page }) => {
  await openLookStep(page)
  await bunnySwitch(page).click()
  await expect(bunnySwitch(page)).toHaveAttribute('aria-checked', 'false')
  await expect(bunnySwitch(page)).toHaveAccessibleDescription('Off: just your numbers. Records still get a note.')
  await expect(page.locator('html')).toHaveAttribute('data-mascot', 'minimal')
  await moreThemes(page).click()
  await expect(wizard(page).locator('img.mini-bunny')).toHaveCount(0)
  await expect(wizard(page).locator('img.mini-mark')).toHaveCount(10)

  await look(page, 'Chalk').click()
  await expect(look(page, 'Chalk')).toHaveAttribute('aria-pressed', 'true')
  await expect(look(page, 'Classic')).toHaveAttribute('aria-pressed', 'false')
  // The wizard itself is in Chalk now, with no bunny: today's "Just your numbers".
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chalk')
  await expect(wizard(page).getByRole('button', { name: 'Next' })).toHaveCSS('background-color', 'rgb(143, 180, 217)')
  await expect(wizard(page).locator('.mascot-art:visible')).toHaveCount(0)

  await finishWithoutPick(page)
  await expectHome(page)
  await expect(page.locator('.mascot-art:visible')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
  expect(await token(page, '--accent')).toBe('#8fb4d9')
  await expect(page.locator('.mascot-art:visible')).toHaveCount(0)
  await expectThemeSettings(page, 'Chalk', 'Minimal')

  // Switching it back on brings the bunny back on a replay.
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Run setup again/ }).click()
  await wizard(page).getByRole('button', { name: 'Next' }).click()
  await expect(bunnySwitch(page)).toHaveAttribute('aria-checked', 'false')
  await expect(look(page, 'Chalk')).toHaveAttribute('aria-pressed', 'true')
  await bunnySwitch(page).click()
  await expect(page.locator('html')).toHaveAttribute('data-mascot', 'full')
  await wizard(page).getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(wizard(page)).toHaveCount(0)
  await expectThemeSettings(page, 'Chalk', 'Full')
})

test('More themes shows every other theme; a pick repaints the wizard, names it in the header, and never blocks Next', async ({ page }) => {
  await openLookStep(page)
  const w = wizard(page)
  await moreThemes(page).click()
  await expect(moreThemes(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(w.getByText("Pick one and it's yours free for 7 days. After that it comes with Premium, or you're back on Classic.")).toBeVisible()
  const names = await w.locator('#more-themes .card').evaluateAll((cards) => cards.map((c) => c.getAttribute('aria-label')))
  expect(names).toEqual(['Halloween', 'Autumn', 'Christmas', "Valentine's Day", 'Easter', 'Cotton Candy', 'Carrot Patch', 'Sunrise'])
  // No per-card tag or price.
  await expect(w.locator('#more-themes .card').filter({ hasText: 'Premium' })).toHaveCount(0)
  await expect(w.locator('#more-themes .card').filter({ hasText: '$' })).toHaveCount(0)

  await look(page, 'Halloween').click()
  await expect.poll(() => token(page, '--accent')).toBe('#ff9a3c')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'halloween')
  await expect(moreThemes(page)).toContainText('Halloween picked')
  // Exactly one card is picked across both groups.
  await expect(w.locator('.card[aria-pressed="true"]')).toHaveCount(1)
  await expect(look(page, 'Halloween')).toHaveAttribute('aria-pressed', 'true')
  await expect(look(page, 'Classic')).toHaveAttribute('aria-pressed', 'false')
  // Collapsed, the header still names the pick.
  await moreThemes(page).click()
  await expect(moreThemes(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(moreThemes(page)).toContainText('Halloween picked')

  // Back on a main card applies it.
  await look(page, 'Chalk').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chalk')
  await expect(moreThemes(page)).toContainText('8 more, seasonal ones too')
  await moreThemes(page).click()
  await look(page, 'Halloween').click()

  // It never blocks Next, and Back keeps the pick with More themes open.
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'Your workouts, kept safe' })).toBeVisible()
  await w.getByRole('button', { name: 'Back' }).click()
  await expect(moreThemes(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(look(page, 'Halloween')).toHaveAttribute('aria-pressed', 'true')
})

test('a Premium user picks any theme in setup and it simply saves, with no trial and no trial line', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
  await wizard(page).getByRole('button', { name: 'Set up in 30 seconds' }).click()
  await wizard(page).getByRole('button', { name: 'Next' }).click()
  await moreThemes(page).click()
  await expect(wizard(page).getByText(/free for 7 days/)).toHaveCount(0)
  await look(page, 'Cotton Candy').click()
  await bunnySwitch(page).click()
  await finishWithoutPick(page)
  await expectHome(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cotton-candy')
  const trials = await page.evaluate(async () => {
    const { readTrialState } = await window.__rbImport('/src/lib/trialPass.ts')
    return readTrialState().trials
  })
  expect(trials).toEqual([])
  await expectThemeSettings(page, 'Cotton Candy', 'Minimal')

  // A replay opens More themes on its own, on the current pick.
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Run setup again/ }).click()
  await wizard(page).getByRole('button', { name: 'Next' }).click()
  await expect(moreThemes(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(moreThemes(page)).toContainText('Cotton Candy picked')
  await expect(look(page, 'Cotton Candy')).toHaveAttribute('aria-pressed', 'true')
  await expect(bunnySwitch(page)).toHaveAttribute('aria-checked', 'false')
})

test('the look step fits a phone in landscape, with every card and Next in reach', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 375 })
  await openLookStep(page)
  const w = wizard(page)
  await moreThemes(page).click()
  for (const name of ['Classic', 'Chalk', 'Sunrise']) {
    await look(page, name).scrollIntoViewIfNeeded()
    await expect(look(page, name)).toBeInViewport()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(800)
  await look(page, 'Sunrise').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunrise')
  await w.getByRole('button', { name: 'Next' }).scrollIntoViewIfNeeded()
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'Your workouts, kept safe' })).toBeVisible()
})

// Issue #399: step 3, How do you want to train? Each choice saves the earlier
// steps, finishes setup, and goes straight to the matching #207 destination,
// without the welcome card afterwards.
test('step 3 explains routines and programs, and each See how link opens its guide', async ({ page }) => {
  await openStartStep(page)
  const w = wizard(page)
  await expect(w.getByText('Step 4 of 4')).toBeVisible()
  await expect(w.getByText('Routines and programs')).toBeVisible()
  await expect(w.getByText('You can do all three. This just picks where to start.')).toBeVisible()
  await expect(w.getByRole('button', { name: 'Done' })).toHaveCount(0)

  const guides = [
    ['Use a starter program', 'starter-programs'],
    ['Create my own program', 'routines'],
    ['Just log as I go', 'log-a-workout'],
  ] as const
  for (const [name, slug] of guides) {
    await expect(w.getByRole('button', { name })).toBeVisible()
    const link = w.getByRole('link', { name: new RegExp(`^See how: ${name}`) })
    await expect(link).toHaveAttribute('href', `https://repbunny.app/guides/${slug}/`)
    await expect(link).toHaveAttribute('target', '_blank')
  }

  // The choices fit the phone, stacked in order.
  const boxes = await Promise.all(guides.map(([name]) => w.getByRole('button', { name }).boundingBox()))
  for (const box of boxes) expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height)
  expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y + boxes[1]!.height)

  // A tap on See how leaves setup where it was.
  const popup = page.waitForEvent('popup')
  await w.getByRole('link', { name: /^See how: Just log as I go/ }).click()
  await (await popup).close()
  await expect(w.getByRole('heading', { name: 'How do you want to train?' })).toBeVisible()
})

test('Just log as I go starts a workout with Add exercise open, a set three taps away', async ({ page }) => {
  await openStartStep(page)
  await wizard(page).getByRole('button', { name: 'Just log as I go' }).click() // tap 1
  await expect(wizard(page)).toHaveCount(0)

  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(sheet.getByText('Pick your first exercise from the library, or make your own.')).toBeVisible()
  // #767: no walk-through offer in front of the sheet.
  await expect(page.getByText('Want a quick walk-through of your first workout?')).toHaveCount(0)
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('Barbell Bench Press')
  await sheet.getByRole('button', { name: 'Add Barbell Bench Press', exact: true }).click() // tap 2
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('8')
  await row.getByLabel('Weight').fill('135')
  await row.getByRole('button', { name: 'Add set' }).click() // tap 3
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)

  // Setup is done for good.
  await page.reload()
  await expect(wizard(page)).toHaveCount(0)
})

test('Use a starter program opens Starter programs, and Home skips the welcome card', async ({ page }) => {
  await openStartStep(page)
  await wizard(page).getByRole('button', { name: 'Use a starter program' }).click()
  await expect(wizard(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/templates$/)
  await expect(page.getByRole('heading', { name: 'Starter programs' })).toBeInViewport()
  await expect(page.locator('.program-row-glow')).toHaveCount(1)

  await goTo(page, 'Home')
  await expect(page.getByText('Welcome to RepBunny')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'What are you training today?' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'What are you training today?' })).toBeVisible()
  await expect(page.getByText('Welcome to RepBunny')).toHaveCount(0)
})

test('Create my own program builds routines in a row, and Done lands on Home with them listed', async ({ page }) => {
  await openStartStep(page)
  await wizard(page).getByRole('button', { name: 'Create my own program' }).click()
  await expect(wizard(page)).toHaveCount(0)

  async function buildRoutine(name: string, exercise: string) {
    const dialog = page.getByRole('dialog', { name: 'New routine' })
    await dialog.getByLabel('Name').fill(name)
    await dialog.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/\/templates\/[^/?]+\?program=1$/)
    await expect(page.getByRole('heading', { name })).toBeVisible()
    const sheet = page.getByRole('dialog', { name: 'Add exercise' })
    await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(exercise)
    await sheet.getByRole('button', { name: `Add ${exercise}`, exact: true }).click()
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByText(`${name} is saved`)).toBeVisible()
  }

  // No offer until the routine has an exercise.
  await buildRoutine('Push Day', 'Barbell Bench Press')
  // One line each, side by side, on a phone.
  const [more, done] = await Promise.all([
    page.getByRole('button', { name: 'Add another routine' }).boundingBox(),
    page.getByRole('button', { name: 'Done', exact: true }).boundingBox(),
  ])
  expect(more!.height).toBeLessThan(52)
  expect(done!.y).toBeCloseTo(more!.y, 0)
  expect(done!.x + done!.width).toBeLessThanOrEqual(375)
  await page.getByRole('button', { name: 'Add another routine' }).click()
  await expect(page.getByText('Push Day is saved')).toBeVisible()
  await buildRoutine('Pull Day', 'Barbell Row')
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'What are you training today?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Push Day', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pull Day', exact: true })).toBeVisible()
  await expect(page.getByText('Welcome to RepBunny')).toHaveCount(0)
})

test('the routine editor shows no program offer outside setup', async ({ page }) => {
  await page.goto('/')
  await wizard(page).getByRole('button', { name: 'Skip setup' }).click()
  await page.getByRole('button', { name: 'Build a routine' }).click()
  const dialog = page.getByRole('dialog', { name: 'New routine' })
  await dialog.getByLabel('Name').fill('Legs')
  await dialog.getByRole('button', { name: 'Next' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill('Barbell Back Squat')
  await sheet.getByRole('button', { name: 'Add Barbell Back Squat', exact: true }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Barbell Back Squat').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add another routine' })).toHaveCount(0)
})

// Issue #418: adding the program from first run goes straight to Home.
test('adding a starter program from the wizard lands on Home with a note and the first routine highlighted', async ({ page }) => {
  await openStartStep(page)
  await wizard(page).getByRole('button', { name: 'Use a starter program' }).click()
  await page.getByRole('region', { name: 'Starter programs' }).getByRole('button', { name: /Beginner full body/ }).click()
  await page.getByRole('dialog', { name: 'Beginner full body' }).getByRole('button', { name: 'Add 2 routines' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('status').filter({ hasText: 'Tap a routine to start your first workout' })).toContainText('Added Beginner full body.')
  await expect(page.locator('.workout-tile-glow')).toHaveCount(1)
  await expect(page.locator('.workout-picker .workout-tile').first()).toHaveClass(/workout-tile-glow/)

  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText('Tap a routine to start your first workout')).toHaveCount(0)
  await expect(page.locator('.workout-tile-glow')).toHaveCount(0)
})

// Issue #431: a reinstall has no restore points left, so the welcome screen
// offers the usual file restore, and a restore that works skips setup.
test('Restoring from a backup? on the welcome screen restores a file and lands on Home with the data', async ({ page, browser }, testInfo) => {
  const templateName = `E2E Reinstall Day ${Date.now()}`
  // The backup comes from another "phone" with a routine on it.
  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  const otherPage = await other.newPage()
  await startLocal(otherPage, {
    beforeNavigate: async () => {
      const { error } = await localDb(otherPage).from('workout_templates').insert({ name: templateName })
      if (error) throw error
    },
  })
  const backup = await otherPage.evaluate(async () => {
    const { buildBackup } = await window.__rbImport('/src/lib/backup.ts')
    return JSON.stringify(await buildBackup())
  })
  await other.close()

  await page.goto('/')
  const w = wizard(page)
  await expect(w.getByRole('button', { name: 'Set up in 30 seconds' })).toBeVisible()

  // Not a backup: says so and stays put.
  let chooser = page.waitForEvent('filechooser')
  await w.getByRole('button', { name: 'Restoring from a backup?' }).click()
  await (await chooser).setFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
  await expect(w.getByRole('alert')).toHaveText("This isn't a RepBunny backup file.")

  chooser = page.waitForEvent('filechooser')
  await w.getByRole('button', { name: 'Restoring from a backup?' }).click()
  await (await chooser).setFiles({ name: 'repbunny-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
  const preview = page.getByRole('dialog', { name: 'Restore this backup?' })
  await preview.getByLabel('Type RESTORE to confirm').fill('RESTORE')
  await preview.getByRole('button', { name: 'Replace with this backup' }).click()
  // A cold dev server can reload the page right after the restore writes the
  // data (#524). The reloaded app finds routines, marks setup done and opens
  // on Home, so the dialog is gone and there's no Done to tap. The checks
  // below hold either way: the data is back and setup is skipped.
  const restored = page.getByRole('dialog', { name: 'Backup restored' })
  await expect(restored.or(page.getByRole('button', { name: templateName, exact: true })).first()).toBeVisible()
  if (await restored.isVisible()) await restored.getByRole('button', { name: 'Done' }).click({ timeout: 5000 }).catch(() => {})

  await expect(wizard(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
  // Setup counts as done: a relaunch goes straight to Home.
  await page.reload()
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
  await expect(wizard(page)).toHaveCount(0)
})
