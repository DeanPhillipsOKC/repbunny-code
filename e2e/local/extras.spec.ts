import { test, expect, type Page } from '@playwright/test'
import { openAccountSection } from '../fixtures/account'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown, skipUnlockCelebrations } from '../fixtures/celebration'
import { goTo, openLibrary } from '../fixtures/nav'
import { installRestChimeSpy, lastSoundPlayed } from '../fixtures/restChime'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #154: milestone rewards, picked under Theme > Extras (option B: a row
// per kind that opens a picker). A fresh local database is a first launch,
// so the first finished workout reaches the first tiers.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'

async function firstLaunchWithBench(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()
}

async function startBench(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
}

async function addSet(page: Page, weight: string) {
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('5')
  await row.getByLabel('Weight').fill(weight)
  await row.getByRole('button', { name: 'Add set' }).click()
}

async function openTheme(page: Page) {
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Theme/ }).click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  await expect(theme).toBeVisible()
  return theme
}

async function openExtra(page: Page, title: string) {
  const theme = await openTheme(page)
  await theme.getByRole('button', { name: title, exact: true }).click()
  const picker = page.getByRole('dialog', { name: title, exact: true })
  await expect(picker).toBeVisible()
  return picker
}

async function closeSheet(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (on) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(on)
  }, unlocked)
}

async function addSeenTiers(page: Page, ids: string[]) {
  await page.evaluate((add) => {
    const seen = JSON.parse(localStorage.getItem('repbunny-milestones-seen') ?? '[]') as string[]
    localStorage.setItem('repbunny-milestones-seen', JSON.stringify([...seen, ...add]))
  }, ids)
}

test('reach a tier, pick its week mark and confetti, and Match theme puts the theme back', async ({ page }) => {
  // #187: tap past the unlock screen (e2e/local/unlock-celebration.spec.ts).
  await skipUnlockCelebrations(page)
  await firstLaunchWithBench(page)
  // #190: Premium earns Extras through milestones.
  await setPremium(page, true)

  // One workout of 3 rising sets: First workout (Stars week mark) and First
  // record (Air horn fanfare).
  await startBench(page)
  for (const [i, weight] of ['100', '110', '120'].entries()) {
    await addSet(page, weight)
    await dismissCelebrationIfShown(page)
    await expect(page.locator('.set-row-logged')).toHaveCount(i + 1)
  }
  await page.getByRole('button', { name: 'Finish workout' }).click()
  const recap = page.getByTestId('post-finish-card')
  await expect(recap.getByTestId('recap-milestone').first()).toContainText('Unlocked: Stars week mark')
  await recap.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(recap).toHaveCount(0)

  // Home's tracker shows the theme's paw for today.
  await expect(page.locator('.day-mark[data-mark="paw"]').first()).toBeVisible()

  // The Week mark row has something new; the picker shows Stars unlocked and
  // Hearts locked behind 25 workouts.
  const theme = await openTheme(page)
  const weekRow = theme.getByRole('button', { name: 'Week mark', exact: true })
  await expect(weekRow).toHaveAccessibleDescription('Match theme')
  await expect(weekRow).toContainText('New')
  await weekRow.click()
  const picker = page.getByRole('dialog', { name: 'Week mark', exact: true })
  await expect(picker).toBeVisible()

  // A locked one previews but can't be picked.
  const hearts = picker.getByRole('button', { name: 'Hearts, locked, unlocks at 25 workouts' })
  await hearts.click()
  const preview = picker.getByTestId('extra-preview')
  await expect(preview).toBeVisible()
  await expect(preview.locator('.day-mark[data-mark="heart"]').first()).toBeVisible()
  await expect(preview.getByTestId('extra-progress')).toHaveText("1 of 25 workouts. 24 more and it's yours.")
  await expect(hearts).toHaveAttribute('aria-pressed', 'false')
  await expect(picker.getByRole('button', { name: 'Match theme', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await picker.getByRole('button', { name: 'Stars', exact: true }).click()
  await expect(picker.getByRole('button', { name: 'Stars', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(preview).toHaveCount(0)

  // Back on Theme, the row names the pick and the New pill is gone.
  await picker.getByRole('button', { name: 'Back to Theme' }).click()
  const pickedRow = theme.getByRole('button', { name: 'Week mark', exact: true })
  await expect(pickedRow).toHaveAccessibleDescription('Stars')
  await expect(pickedRow).not.toContainText('New')
  await expect(pickedRow).toContainText('2 of 4')
  await closeSheet(page)

  await expect(page.locator('.day-mark[data-mark="star"]').first()).toBeVisible()
  await expect(page.locator('.day-mark[data-mark="paw"]')).toHaveCount(0)

  // Match theme puts the theme's own mark back.
  const weekAgain = await openExtra(page, 'Week mark')
  await weekAgain.getByRole('button', { name: 'Match theme' }).click()
  await closeSheet(page)
  await expect(page.locator('.day-mark[data-mark="paw"]').first()).toBeVisible()
  await expect(page.locator('.day-mark[data-mark="star"]')).toHaveCount(0)

  // Pretend an earlier workout reached 5 workouts on this device: Hearts
  // confetti unlocks.
  await addSeenTiers(page, ['workouts-5'])
  const confetti = await openExtra(page, 'Confetti')
  await expect(confetti.getByRole('button', { name: 'Plates, locked, unlocks at 50 records' })).toBeVisible()
  await confetti.getByRole('button', { name: 'Hearts', exact: true }).click()
  await expect(confetti.getByRole('button', { name: 'Hearts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await closeSheet(page)

  // A record celebration drops hearts.
  await startBench(page)
  await addSet(page, '130')
  const overlay = page.locator('.celebration-overlay')
  await expect(overlay).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.dataset.confetti)).toBe('hearts')
  const mask = await overlay
    .locator('.confetti')
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el)
      return style.maskImage || style.webkitMaskImage
    })
  expect(mask).toContain('svg')
  await page.getByRole('button', { name: 'Nice!' }).click()
  await expect(overlay).toHaveCount(0)

  // Picks are per device and survive a reload.
  await page.reload()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.confetti)).toBe('hearts')

  // Match theme restores Classic's own confetti (plain squares and dots).
  const confettiAgain = await openExtra(page, 'Confetti')
  await confettiAgain.getByRole('button', { name: 'Match theme' }).click()
  await closeSheet(page)
  expect(await page.evaluate(() => document.documentElement.dataset.confetti)).toBeUndefined()
})

test('a free user sees Extras as Premium, even with a trial pass, and a preview offers Premium', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  // A themes trial pass opens Cotton Candy, but not the Extras (#190: only
  // Premium earns those), even for a tier this device already reached.
  await addSeenTiers(page, ['strongWeeks-4'])
  await page.evaluate(async () => {
    const { earnTrialPasses, startTrialPass } = await window.__rbImport('/src/lib/trialPass.ts')
    earnTrialPasses(['workouts-10'])
    startTrialPass('themes')
  })
  const theme = await openTheme(page)
  await expect(theme.getByText('Part of Premium, earned by your milestones.')).toBeVisible()
  await theme.getByRole('button', { name: 'Cotton Candy', exact: true }).click()
  const linesRow = theme.getByRole('button', { name: 'Bunny personality', exact: true })
  await expect(linesRow).toContainText('1 of 4')
  await linesRow.click()
  const picker = page.getByRole('dialog', { name: 'Bunny personality', exact: true })
  // Every personality but Classic is tagged Premium; a preview shows its lines (#183).
  for (const name of ['Punny', 'Coach', 'Hype']) {
    await expect(picker.getByRole('button', { name: `${name}, Premium`, exact: true })).toContainText('Premium')
  }
  const puns = picker.getByRole('button', { name: 'Punny, Premium', exact: true })
  await puns.click()
  const preview = picker.getByTestId('extra-preview')
  await expect(preview).toContainText('2 more reps than last time. Hare-raising.')
  await expect(preview.getByTestId('extra-progress')).toHaveCount(0)
  await expect(puns).toHaveAttribute('aria-pressed', 'false')
  await expect(picker.getByRole('button', { name: 'Classic', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // Light theme: the preview card is drawn on the theme's white surface.
  const bg = await preview.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).toBe('rgb(255, 255, 255)')

  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium', exact: true })
  await expect(premium).toBeVisible()
  await expect(premium.getByRole('heading', { name: 'Extras' })).toBeVisible()
})

test('Premium earns Extras through milestones, and history earned while free counts at once', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)

  // Issue #190: Premium with no milestones has only the defaults.
  await setPremium(page, true)
  const locked = await openExtra(page, 'Confetti')
  await expect(locked.getByRole('button', { name: 'Hearts, locked, unlocks at 5 workouts' })).toBeVisible()
  await expect(locked.getByRole('button', { name: 'Plates, locked, unlocks at 50 records' })).toBeVisible()
  await locked.getByRole('button', { name: 'Back to Theme' }).click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  await expect(theme.getByText('Unlocked by your milestones.')).toBeVisible()
  await expect(theme.getByRole('button', { name: 'Confetti', exact: true })).toContainText('1 of 4')
  await closeSheet(page)

  // While free, 5 workouts were reached (the seen list is written for free
  // users too). Hearts stays Premium until Premium starts.
  await setPremium(page, false)
  await addSeenTiers(page, ['workouts-5'])
  const free = await openExtra(page, 'Confetti')
  await expect(free.getByRole('button', { name: 'Hearts, Premium', exact: true })).toBeVisible()
  await closeSheet(page)

  // Premium: what was reached unlocks right away.
  await setPremium(page, true)
  const confetti = await openExtra(page, 'Confetti')
  await confetti.getByRole('button', { name: 'Hearts', exact: true }).click()
  await expect(confetti.getByRole('button', { name: 'Hearts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(confetti.getByRole('button', { name: 'Stars, locked, unlocks at 10 records' })).toBeVisible()
  await confetti.getByRole('button', { name: 'Back to Theme' }).click()
  await expect(theme.getByRole('button', { name: 'Confetti', exact: true })).toHaveAccessibleDescription('Hearts')
  await closeSheet(page)
  expect(await page.evaluate(() => document.documentElement.dataset.confetti)).toBe('hearts')

  // Losing Premium puts the default back; the pick is kept.
  await setPremium(page, false)
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.confetti)).toBeUndefined()
  const relocked = await openExtra(page, 'Confetti')
  await expect(relocked.getByRole('button', { name: 'Hearts, Premium', exact: true })).toBeVisible()
  await expect(relocked.getByRole('button', { name: 'Match theme', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await relocked.getByRole('button', { name: 'Back to Theme' }).click()
  await expect(theme.getByRole('button', { name: 'Confetti', exact: true })).toHaveAccessibleDescription('Match theme')
  await closeSheet(page)

  // Premium again: the pick comes back.
  await setPremium(page, true)
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.confetti)).toBe('hearts')
})

// Issue #184: the Extras sounds are recorded clips in public/sounds/. The spy
// still fetches each one, so a missing file fails here.
test('Extras sounds play their clips in the picker, at a record, and when rest ends; old picks fall back', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await installRestChimeSpy(page)
  await page.clock.install()
  await firstLaunchWithBench(page)
  // A 30s rest on the bench, and picks of sounds that no longer exist.
  await page.evaluate(async (name) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const { data } = await repos.exercises.list()
    const bench = data.find((e: { name: string }) => e.name === name)!
    const { error } = await repos.exercises.update(bench.id, { rest_seconds: 30 })
    if (error) throw new Error(error.message)
    localStorage.setItem('repbunny-extras', JSON.stringify({ chime: 'bells', fanfare: 'tada' }))
    // Every sound's tier, reached on this device (#190: Premium earns them).
    localStorage.setItem(
      'repbunny-milestones-seen',
      JSON.stringify(['workouts-10', 'workouts-50', 'strongWeeks-12', 'workouts-100', 'records-1', 'strongWeeks-52', 'workouts-200']),
    )
  }, BENCH)
  await page.reload()

  const theme = await openTheme(page)
  await expect(theme.getByRole('button', { name: 'Rest chime', exact: true })).toHaveAccessibleDescription('Classic')
  await expect(theme.getByRole('button', { name: 'Record fanfare', exact: true })).toHaveAccessibleDescription('Off')
  await closeSheet(page)

  // With Premium every sound is earned. Each tap previews its clip at the Extras gain;
  // Classic is the original clip at full volume.
  await setPremium(page, true)
  const chime = await openExtra(page, 'Rest chime')
  await chime.getByRole('button', { name: 'Classic', exact: true }).click()
  await expect.poll(() => lastSoundPlayed(page)).toEqual({ url: '/rest-chime.mp3', gain: 1 })
  // Classic is the reference loudness, so the warning stays hidden (#458).
  const loudWarning = (dialog: typeof chime) => dialog.getByText('These are louder than Classic. Try one at low volume before the gym.')
  await expect(loudWarning(chime)).toHaveCount(0)
  for (const [name, value, gain] of [
    ['Cartoon boing', 'boing', 0.7],
    ['Coach whistle', 'whistle', 0.67],
    ['Bike bell', 'bike-bell', 0.7],
    ['Boxing bell', 'boxing-bell', 0.7],
  ] as const) {
    await chime.getByRole('button', { name, exact: true }).click()
    await expect.poll(() => lastSoundPlayed(page)).toEqual({ url: `/sounds/${value}.mp3`, gain })
  }
  await expect(loudWarning(chime)).toBeVisible()
  await expect(chime.getByRole('button', { name: 'Boxing bell', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await chime.getByRole('button', { name: 'Back to Theme' }).click()
  await theme.getByRole('button', { name: 'Record fanfare', exact: true }).click()
  const fanfare = page.getByRole('dialog', { name: 'Record fanfare', exact: true })
  for (const [name, value] of [
    ['Crowd cheer', 'cheer'],
    ['Ta-da', 'tada-horns'],
    ['Air horn', 'air-horn'],
  ]) {
    await fanfare.getByRole('button', { name, exact: true }).click()
    await expect.poll(() => lastSoundPlayed(page)).toEqual({ url: `/sounds/${value}.mp3`, gain: 0.67 })
  }
  await expect(loudWarning(fanfare)).toBeVisible()
  await closeSheet(page)

  // The first set starts a rest; when it ends, the boxing bell rings.
  await startBench(page)
  await addSet(page, '100')
  await dismissCelebrationIfShown(page)
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  await page.evaluate(() => ((window as unknown as { __soundPlays: unknown[] }).__soundPlays = []))
  await page.clock.fastForward(31_000)
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toHaveCount(0)
  await expect.poll(() => lastSoundPlayed(page)).toEqual({ url: '/sounds/boxing-bell.mp3', gain: 0.7 })

  // A heavier set is a record: the air horn goes off.
  await addSet(page, '110')
  await expect(page.locator('.celebration-overlay')).toBeVisible()
  await expect.poll(() => lastSoundPlayed(page)).toEqual({ url: '/sounds/air-horn.mp3', gain: 0.67 })
  expect(errors).toEqual([])
})
