import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown, skipUnlockCelebrations } from '../fixtures/celebration'
import { openAccountSection } from '../fixtures/account'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #153: milestones. A fresh local database is a first launch, so the
// first finished workout crosses the first tiers.

const BENCH = 'Barbell Bench Press'

async function firstLaunchWithBench(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()
}

// A freeform bench workout, one set per weight, finished.
async function logFreeformWorkout(page: Page, weights: string[]) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  for (const [i, weight] of weights.entries()) {
    const row = page.locator('.set-row-draft').first()
    await row.getByLabel('Reps').fill('5')
    await row.getByLabel('Weight').fill(weight)
    await row.getByRole('button', { name: 'Add set' }).click()
    await dismissCelebrationIfShown(page)
    await expect(page.locator('.set-row-logged')).toHaveCount(i + 1)
  }
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
}

async function setPremium(page: Page) {
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
}

async function done(page: Page) {
  const recap = page.getByTestId('post-finish-card')
  await recap.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(recap).toHaveCount(0)
}

test('the first workout unlocks milestones on the recap and the Milestones screen', async ({ page }) => {
  // #187: tap past the unlock screen (e2e/local/unlock-celebration.spec.ts).
  await skipUnlockCelebrations(page)
  await firstLaunchWithBench(page)
  // #190: Premium earns Extras through milestones.
  await setPremium(page)

  // 3 sets, the second and third each beating the one before: one workout,
  // two record sets.
  await logFreeformWorkout(page, ['100', '110', '120'])
  const card = page.getByTestId('recap-milestones')
  await expect(card.getByRole('heading', { name: '2 milestones unlocked' })).toBeVisible()
  // #154: each tier names its Extras reward.
  await expect(card.getByTestId('recap-milestone')).toHaveText([
    'First workout!Unlocked: Stars week mark',
    'First record!Unlocked: Air horn record fanfare',
  ])
  // Nothing predates milestones on a new device, so no history note.
  await expect(card.getByTestId('recap-milestones-intro')).toHaveCount(0)

  await card.getByRole('link', { name: 'See all milestones' }).click()
  await expect(page).toHaveURL(/\/progress\/milestones$/)
  const workouts = page.getByTestId('milestone-track-workouts')
  await expect(workouts.getByTestId('milestone-next')).toHaveText('1 of 5 workouts · unlocks Hearts confetti')
  await expect(workouts.getByTestId('milestone-tier-workouts-1')).toHaveAttribute('data-unlocked', 'true')
  await expect(workouts.getByTestId('milestone-tier-workouts-5')).toHaveAttribute('data-unlocked', 'false')
  await expect(page.getByTestId('milestone-track-records').getByTestId('milestone-next')).toHaveText('2 of 10 records · unlocks Stars confetti')
  await expect(page.getByTestId('milestone-track-strongWeeks').getByTestId('milestone-next')).toHaveText(
    '0 of 4 strong weeks · unlocks Punny bunny personality',
  )

  // Back on Home the recap is still waiting; Done marks them seen.
  await goTo(page, 'Home')
  await done(page)

  // A second workout crosses nothing new, and nothing is announced again.
  // #188: 5 workouts is 3 away, so the recap says so instead.
  await logFreeformWorkout(page, ['90', '90', '90'])
  await expect(page.getByTestId('recap-milestones')).toHaveCount(0)
  await expect(page.getByTestId('recap-next-unlock')).toHaveText('3 workouts to your next unlock: Hearts confetti')
  await done(page)

  // The Progress hub's tile shows the next workouts tier.
  await goTo(page, 'Progress')
  await expect(page.getByRole('link', { name: /Milestones/ })).toContainText('2 of 5 workouts')
})

test('for free users, tiers without a trial pass are achievements only: no Extra named', async ({ page }) => {
  await firstLaunchWithBench(page)
  // #190: Extras are Premium; free users earn only trial passes.

  await logFreeformWorkout(page, ['100', '110', '120'])
  const card = page.getByTestId('recap-milestones')
  await expect(card.getByTestId('recap-milestone')).toHaveText(['First workout!', 'First record!'])

  await card.getByRole('link', { name: 'See all milestones' }).click()
  await expect(page.getByTestId('milestone-track-workouts').getByTestId('milestone-next')).toHaveText('1 of 5 workouts')
  await expect(page.getByTestId('milestone-track-strongWeeks').getByTestId('milestone-next')).toHaveText('0 of 4 strong weeks')

  // #188: the next pass (10 workouts) isn't close, so no next-unlock line.
  await goTo(page, 'Home')
  await done(page)
  await logFreeformWorkout(page, ['90', '90', '90'])
  await expect(page.locator('.recap')).toBeVisible()
  await expect(page.getByTestId('recap-next-unlock')).toHaveCount(0)
})

// Issue #186: the Preferences switch hides the moments, not the milestones.
test('with Milestone moments off, the recap card is hidden but milestones still count', async ({ page }) => {
  await firstLaunchWithBench(page)
  await setPremium(page)
  const prefs = await openAccountSection(page, 'Preferences')
  const toggle = prefs.getByRole('switch', { name: 'Milestone moments' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')

  // It's a preference, so a backup with preferences carries it.
  const carried = await page.evaluate(async () => {
    const { buildBackup } = await window.__rbImport('/src/lib/backup.ts')
    return (await buildBackup(['preferences'])).milestone_moments
  })
  expect(carried).toBe(false)

  // Kept across a reload.
  await page.reload()
  await logFreeformWorkout(page, ['100', '110', '120'])
  await expect(page.getByTestId('recap-milestones')).toHaveCount(0)
  await done(page)
  // #188: the next-unlock line is a moment too (5 workouts is 3 away).
  await logFreeformWorkout(page, ['90', '90', '90'])
  await expect(page.locator('.recap')).toBeVisible()
  await expect(page.getByTestId('recap-next-unlock')).toHaveCount(0)
  await done(page)

  // The Milestones screen still has them.
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: /Milestones/ }).click()
  await expect(page.getByTestId('milestone-tier-workouts-1')).toHaveAttribute('data-unlocked', 'true')
  await expect(page.getByTestId('milestone-track-records').getByTestId('milestone-next')).toHaveText('2 of 10 records · unlocks Stars confetti')

  // Back on, what was crossed while it was off isn't replayed.
  const prefsAgain = await openAccountSection(page, 'Preferences')
  await prefsAgain.getByRole('switch', { name: 'Milestone moments' }).click()
  await expect(prefsAgain.getByRole('switch', { name: 'Milestone moments' })).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await logFreeformWorkout(page, ['90', '90', '90'])
  await expect(page.getByTestId('recap-milestones')).toHaveCount(0)
  // A third workout today doesn't count (2 a day), so Hearts confetti is
  // still 3 away. The line opens Milestones.
  const line = page.getByTestId('recap-next-unlock')
  await expect(line).toHaveText('3 workouts to your next unlock: Hearts confetti')
  await line.click()
  await expect(page).toHaveURL(/\/progress\/milestones$/)
})

test('history from before milestones unlocks with one note, shown once', async ({ page }) => {
  await firstLaunchWithBench(page)
  await logFreeformWorkout(page, ['100', '100', '100'])
  await done(page)

  // Pretend this device has never seen milestones: the history is already there.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('repbunny-milestones-')) localStorage.removeItem(key)
  })
  await page.reload()
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: /Milestones/ }).click()
  const note = page.getByTestId('milestones-intro')
  // A free user: Extras aren't theirs, so it counts milestones (#190).
  await expect(note).toHaveText(/Your 1 workout already reached 1 milestone\./)
  await expect(page.getByTestId('milestone-tier-workouts-1')).toHaveAttribute('data-unlocked', 'true')
  await note.getByRole('button', { name: 'Got it' }).click()
  await expect(note).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId('milestone-track-workouts')).toBeVisible()
  await expect(page.getByTestId('milestones-intro')).toHaveCount(0)

  // Already-unlocked tiers aren't announced again on the next recap.
  await logFreeformWorkout(page, ['100', '100', '100'])
  await expect(page.getByTestId('recap-milestones')).toHaveCount(0)
})
