import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { openAccountSection } from '../fixtures/account'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #187: crossing a tier that unlocks an Extra (Premium, #190) shows a
// screen over the recap with a preview and Use it now. A fresh local database
// is a first launch, so the first finished workout crosses the first tiers.

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

async function setPremium(page: Page) {
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
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

async function picks(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('repbunny-extras') ?? '{}'))
}

test('one unlock: the screen previews it, Use it now sets the pick, and the recap follows', async ({ page }) => {
  await firstLaunchWithBench(page)
  await setPremium(page)

  // Equal sets: the first is the baseline and the rest don't beat it, so only
  // the first workout tier (Stars week mark) is crossed.
  await logFreeformWorkout(page, ['100', '100', '100'])
  const screen = page.getByRole('dialog', { name: 'Your first workout!' })
  await expect(screen).toBeVisible()
  await expect(screen.getByText('Extra unlocked')).toBeVisible()
  const reward = screen.getByTestId('unlock-reward')
  await expect(reward).toHaveCount(1)
  await expect(reward).toContainText('Week mark')
  await expect(reward).toContainText('Stars')
  // The preview: a week with the new mark on the trained days.
  await expect(reward.locator('.day-mark[data-mark="star"]')).toHaveCount(4)

  // The buttons sit under the card, full width, inside a phone screen.
  const use = screen.getByRole('button', { name: 'Use it now' })
  const later = screen.getByRole('button', { name: 'Not now' })
  const card = (await reward.boundingBox())!
  const useBox = (await use.boundingBox())!
  const laterBox = (await later.boundingBox())!
  expect(useBox.y).toBeGreaterThan(card.y + card.height)
  expect(laterBox.y).toBeGreaterThan(useBox.y + useBox.height - 1)
  expect(Math.abs(useBox.width - card.width)).toBeLessThan(2)
  expect(laterBox.y + laterBox.height).toBeLessThanOrEqual(800)

  await use.click()
  await expect(screen).toHaveCount(0)
  expect((await picks(page)).weekMark).toBe('star')
  // The recap is underneath, with its milestone card as before.
  const recap = page.getByTestId('recap-milestones')
  await expect(recap.getByTestId('recap-milestone')).toHaveText(['First workout!Unlocked: Stars week mark'])
  await recap.getByRole('link', { name: 'See all milestones' }).click()
  await expect(page).toHaveURL(/\/progress\/milestones$/)

  // Done marks it seen; the next workout crosses nothing, so no screen.
  await goTo(page, 'Home')
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()
  await logFreeformWorkout(page, ['90', '90', '90'])
  await page.waitForTimeout(400)
  await expect(page.getByTestId('unlock-celebration')).toHaveCount(0)
})

test('several unlocks share one screen, each with its own Use it now', async ({ page }) => {
  await firstLaunchWithBench(page)
  await setPremium(page)

  // The second and third sets each beat the one before: first workout and
  // first record, so the Stars week mark and the Air horn fanfare.
  await logFreeformWorkout(page, ['100', '110', '120'])
  const screen = page.getByRole('dialog', { name: 'Big day. Two at once!' })
  await expect(screen).toBeVisible()
  await expect(screen.getByText('2 Extras unlocked')).toBeVisible()
  const rows = screen.getByTestId('unlock-reward')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Week markStarsFirst workout!')
  await expect(rows.nth(1)).toContainText('Record fanfareAir hornFirst record!')
  // A sound has a play button.
  await expect(rows.nth(1).getByRole('button', { name: 'Play Air horn' })).toBeVisible()

  // Each row keeps its text and button on one line at phone width.
  for (const row of [rows.nth(0), rows.nth(1)]) {
    const rowBox = (await row.boundingBox())!
    expect(rowBox.x).toBeGreaterThanOrEqual(0)
    expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(375)
    const button = (await row.getByRole('button', { name: /now$/ }).boundingBox())!
    expect(button.x + button.width).toBeLessThanOrEqual(rowBox.x + rowBox.width)
    expect(button.y).toBeGreaterThanOrEqual(rowBox.y)
  }

  // Use it now on one row marks it In use and stays on the screen.
  await rows.nth(1).getByRole('button', { name: 'Use Air horn record fanfare now' }).click()
  await expect(rows.nth(1).getByTestId('unlock-in-use')).toHaveText('In use')
  await expect(rows.nth(0).getByRole('button', { name: 'Use Stars week mark now' })).toBeVisible()
  expect((await picks(page)).fanfare).toBe('air-horn')
  expect((await picks(page)).weekMark).toBe('match')

  await screen.getByRole('button', { name: 'See my recap' }).click()
  await expect(screen).toHaveCount(0)
  await expect(page.getByTestId('recap-milestones').getByTestId('recap-milestone')).toHaveCount(2)
})

test('no screen for a free user, or with Milestone moments off', async ({ page }) => {
  await firstLaunchWithBench(page)

  // #190: a free user's tiers carry no Extra; the recap card still shows.
  await logFreeformWorkout(page, ['100', '100', '100'])
  await expect(page.getByTestId('recap-milestones')).toBeVisible()
  await expect(page.getByTestId('unlock-celebration')).toHaveCount(0)
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  // Premium with moments off: the record tier's Air horn stays quiet.
  await setPremium(page)
  const prefs = await openAccountSection(page, 'Preferences')
  const toggle = prefs.getByRole('switch', { name: 'Milestone moments' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await page.reload()
  await logFreeformWorkout(page, ['100', '110', '110'])
  await page.waitForTimeout(400)
  await expect(page.getByTestId('unlock-celebration')).toHaveCount(0)
})
