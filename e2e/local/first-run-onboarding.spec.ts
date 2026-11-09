import { test, expect, type Page } from '@playwright/test'
import { dismissCelebrationIfShown } from '../fixtures/celebration'

// Issue #207 (design docs/design/issue-207-first-run.html, option B): a
// brand-new account's welcome card offers three ways in, none of them a
// detour through the Exercises tab. Runs on the local-mode dev server (the
// `local` Playwright project) because each test there starts with an empty
// database, so the zero-exercise welcome card is guaranteed.

const BENCH = 'Barbell Bench Press'

async function firstLaunch(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
}

async function logFirstBenchSet(page: Page) {
  await page.getByRole('button', { name: 'Start a workout' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(sheet.getByText('Pick your first exercise from the library, or make your own.')).toBeVisible()
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(BENCH)
  await sheet.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()

  // Issue #313: the first workout keeps the sheet open, like every later one.
  await expect(sheet.getByRole('button', { name: BENCH, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('.exercise-card-name')).toHaveText(BENCH)
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('8')
  await row.getByLabel('Weight').fill('135')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  // Issue #429: a new lifter's first set starts the 2:00 default rest, with
  // the one-time tip on how to change it.
  await expect(page.locator('.rest-countdown')).toHaveText(/^(2:00|1:5\d)$/)
  await expect(page.getByRole('group', { name: 'Rest timer tip' })).toContainText("It's 2:00 for now.")
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(page.locator('.set-row-logged')).toHaveCount(1)

  await page.getByRole('button', { name: 'Finish workout' }).click()
  const recap = page.getByTestId('post-finish-card')
  await expect(recap).toBeVisible()
  return recap
}

test('the welcome card offers three full-width ways in', async ({ page }) => {
  await firstLaunch(page)
  const choices = page.getByRole('group', { name: 'How do you want to start?' }).getByRole('button')
  await expect(choices).toHaveText([/Start a workout/, /Build a routine/, /Start from a program/])
  await expect(page.getByRole('button', { name: 'Add your first exercise' })).toHaveCount(0)

  const boxes = await Promise.all([0, 1, 2].map((i) => choices.nth(i).boundingBox()))
  for (const box of boxes) {
    expect(box!.x).toBeCloseTo(boxes[0]!.x, 0)
    expect(box!.width).toBeCloseTo(boxes[0]!.width, 0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  }
  // Stacked top to bottom in order.
  expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height)
  expect(boxes[2]!.y).toBeGreaterThan(boxes[1]!.y + boxes[1]!.height)
})

test('Start a workout logs a first set, and the recap offers to save it as a named template', async ({ page }) => {
  await firstLaunch(page)
  const recap = await logFirstBenchSet(page)

  const offer = recap.getByRole('region', { name: 'Do this again?' })
  await expect(offer).toBeVisible()
  // Bench is chest, so the name is picked from the muscle groups.
  await expect(offer.getByLabel('Routine name')).toHaveValue('Upper body push')
  await offer.getByRole('button', { name: 'Save as routine' }).click()
  await expect(recap.getByRole('status').filter({ hasText: 'Saved as Upper body push.' })).toBeVisible()
  await expect(offer).toHaveCount(0)

  await recap.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Upper body push', exact: true })).toBeVisible()
  await expect(page.getByText('Welcome to RepBunny')).toHaveCount(0)
})

// Issue #313 (design docs/design/issue-313-first-workout.html): the first
// workout picks several exercises, a library row's detail opens inside the
// sheet and comes back to it, and the header's add control is labeled.
test('first workout: Add selects several, and library detail returns to the sheet', async ({ page }) => {
  await firstLaunch(page)
  await page.getByRole('button', { name: 'Start a workout' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  const search = sheet.getByRole('searchbox', { name: 'Search exercises' })
  const bar = sheet.getByRole('status')

  await search.fill(BENCH)
  await sheet.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await search.fill('Barbell Back Squat')
  await sheet.getByRole('button', { name: 'Add Barbell Back Squat', exact: true }).click()
  await expect(sheet).toBeVisible()
  await expect(bar).toContainText('2 added')

  // Detail, then back: the list and picks are as they were.
  await search.fill('Barbell Row')
  await sheet.getByRole('button', { name: 'View Barbell Row', exact: true }).click()
  await expect(sheet.getByRole('heading', { name: 'Barbell Row' })).toBeVisible()
  await expect(sheet.getByText('Tracked as')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  await sheet.getByRole('button', { name: 'Back to Add exercise' }).click()
  await expect(search).toHaveValue('Barbell Row')
  await expect(bar).toContainText('2 added')

  // Detail, then Add to workout: back on the list with it picked too.
  await sheet.getByRole('button', { name: 'View Barbell Row', exact: true }).click()
  await sheet.getByRole('button', { name: 'Add to workout' }).click()
  await expect(sheet.getByRole('heading', { name: 'Add exercise' })).toBeVisible()
  await expect(bar).toContainText('3 added')
  await expect(sheet.getByRole('button', { name: 'Barbell Row', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('.exercise-card-name')).toHaveText(BENCH)
  await expect(page.getByText('1 / 3', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Barbell Back Squat', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Barbell Row', exact: true })).toBeVisible()

  // The header's add control says what it adds.
  await expect(page.getByRole('button', { name: 'Add exercise' })).toContainText('Exercise')
})

test("Don't ask again hides the save offer for good", async ({ page }) => {
  await firstLaunch(page)
  const recap = await logFirstBenchSet(page)
  const offer = recap.getByRole('region', { name: 'Do this again?' })
  await offer.getByRole('button', { name: "Don't ask again" }).click()
  await expect(offer).toHaveCount(0)
  await recap.getByRole('button', { name: 'Done', exact: true }).click()

  // A second freeform workout: still no templates, but no offer.
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByRole('button', { name: BENCH, exact: true }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('8')
  await row.getByLabel('Weight').fill('135')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  // The tip showed on the first rest, so this one only names the default.
  await expect(page.getByText('Default rest 2:00')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Rest timer tip' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Do this again?' })).toHaveCount(0)
})

test('Build a routine names it on Home, then opens the editor with the library', async ({ page }) => {
  await firstLaunch(page)
  await page.getByRole('button', { name: 'Build a routine' }).click()
  const dialog = page.getByRole('dialog', { name: 'New routine' })
  await dialog.getByLabel('Name').fill('Push Day')
  await dialog.getByRole('button', { name: 'Next' }).click()

  await expect(page).toHaveURL(/\/templates\/[^/?]+/)
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(sheet.getByText('Pick your first exercise from the library, or make your own.')).toBeVisible()
  await sheet.getByRole('searchbox', { name: 'Search exercises' }).fill(BENCH)
  await sheet.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(BENCH).first()).toBeVisible()
})

test('Start from a program opens the starter programs, first one highlighted', async ({ page }) => {
  await firstLaunch(page)
  await page.getByRole('button', { name: 'Start from a program' }).click()
  await expect(page).toHaveURL(/\/templates$/)
  await expect(page.getByRole('heading', { name: 'Starter programs' })).toBeInViewport()
  await expect(page.locator('.program-row-glow')).toHaveCount(1)
})

// Issue #418: the same hand-off from the Home welcome card.
test('adding a program from the welcome card lands on Home ready to start', async ({ page }) => {
  await firstLaunch(page)
  await page.getByRole('button', { name: 'Start from a program' }).click()
  await page.getByRole('region', { name: 'Starter programs' }).getByRole('button', { name: /Beginner full body/ }).click()
  await page.getByRole('dialog', { name: 'Beginner full body' }).getByRole('button', { name: 'Add 2 routines' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Added Beginner full body. Tap a routine to start your first workout.')).toBeVisible()
  await expect(page.locator('.workout-tile-glow')).toHaveCount(1)
})
