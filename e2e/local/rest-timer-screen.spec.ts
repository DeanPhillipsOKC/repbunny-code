import { test, expect, localDb, startLocal, type LocalDb } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'
import { chimeCount, installRestChimeSpy } from '../fixtures/restChime'

// Each test's exercise (and its rest_seconds) is pre-existing state this
// spec logs a set against, not behavior under test -- e2e/local/rest-timer.spec.ts
// already covers the config UI itself. Seeded directly via the admin client
// instead of driving the Exercises UI (item 57's pattern, item 83).
async function seedExerciseWithRest(admin: LocalDb, userId: string, name: string, restSeconds: number) {
  await admin.from('exercises').insert({ user_id: userId, name, rest_seconds: restSeconds })
}

// Covers docs/backlog.md item 28: the in-app rest screen (RestTimer.vue)
// shown after logging a set for an exercise with rest_seconds configured.
// Distinct from item 15's push notification, which e2e/local/rest-timer.spec.ts
// covers on its configuration side — push delivery itself still needs a real
// device (see docs/backlog.md's [human] checklist). This spec runs while the
// tab is foregrounded, so WorkoutLogger.vue's handleAddSet takes the in-app
// path rather than sending a push.
test('rest timer screen: shows after a set, skip dismisses it', async ({ page, stamp }) => {
  const exerciseName = `E2E Rest Screen ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => seedExerciseWithRest(admin, userId, exerciseName, 30),
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  // First-ever set for this brand-new exercise is also an all-time best —
  // dismiss the record celebration (it renders on top of the rest screen)
  // before interacting with what's underneath.
  await dismissCelebrationIfShown(page)

  // Backlog item 29: the headline now rotates between a few phrases, so
  // assert on the element rather than a specific string.
  await expect(page.locator('.rest-headline')).toBeVisible()
  await expect(page.getByText(`Next: ${exerciseName}`)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()

  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(page.locator('.rest-headline')).toHaveCount(0)

  // The rest screen coming and going doesn't touch the set that was logged.
  await expect(page.locator('.set-row-logged', { hasText: '10 × 45 lb' })).toBeVisible()
})

test('rest timer screen: auto-dismisses when the countdown finishes', async ({ page, stamp }) => {
  const exerciseName = `E2E Rest Auto ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => seedExerciseWithRest(admin, userId, exerciseName, 1),
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('20')
  await page.getByRole('button', { name: 'Add set' }).click()

  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toHaveCount(0, { timeout: 3000 })
})

// Covers docs/backlog.md item 52's ±15s manual adjustment.
test('rest timer screen: -15s and +15s adjust the countdown', async ({ page, stamp }) => {
  const exerciseName = `E2E Rest Adjust ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => seedExerciseWithRest(admin, userId, exerciseName, 60),
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  const countdown = page.locator('.rest-countdown')
  await expect(countdown).toBeVisible()

  async function readCountdownSeconds() {
    const text = (await countdown.textContent())?.trim() ?? ''
    const [m, s] = text.split(':').map(Number)
    return m * 60 + s
  }

  const before = await readCountdownSeconds()
  await page.getByRole('button', { name: '-15s' }).click()
  // A bare "less than before" passes on one natural tick; wait for the -15s itself.
  await expect.poll(async () => before - (await readCountdownSeconds())).toBeGreaterThanOrEqual(13)
  const afterShrink = await readCountdownSeconds()
  expect(before - afterShrink).toBeGreaterThanOrEqual(13)
  expect(before - afterShrink).toBeLessThanOrEqual(16)

  await page.getByRole('button', { name: '+15s' }).click()
  await expect.poll(readCountdownSeconds).toBeGreaterThan(afterShrink)
  const afterGrow = await readCountdownSeconds()
  expect(afterGrow - afterShrink).toBeGreaterThanOrEqual(13)
  expect(afterGrow - afterShrink).toBeLessThanOrEqual(16)
})

// Covers docs/backlog.md item 52's non-destructive return: "Back to workout"
// keeps the rest period running behind the scenes instead of canceling it
// the way "Skip Rest" does.
test('rest timer screen: back to workout minimizes without canceling, resume restores it', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Rest Minimize ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => seedExerciseWithRest(admin, userId, exerciseName, 30),
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.locator('.rest-headline')).toHaveCount(0)
  await expect(page.getByText(/Resting \d:\d\d/)).toBeVisible()

  // Minimized, but the workout underneath is still fully usable.
  await expect(page.locator('.set-row-logged', { hasText: '10 × 45 lb' })).toBeVisible()

  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.locator('.rest-headline')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()

  // The mini-bar's own Skip also ends the rest entirely, same as Skip Rest.
  await page.getByRole('button', { name: 'Back to workout' }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByText(/Resting \d:\d\d/)).toHaveCount(0)
})

// Covers docs/backlog.md item 100: a short chime alongside the existing
// vibration, on both rest-timer completion paths. e2e can't assert real
// audio output, so this stubs window.AudioContext (fixtures/restChime.ts)
// and asserts the chime code path actually ran -- fast-forwarding past
// `endsAt` with Playwright's fake clock instead of waiting out a real rest
// period, since no existing spec here mocks time to reach timer completion.
test('rest timer screen: chimes on completion (full-screen path)', async ({ page, stamp }) => {
  const exerciseName = `E2E Rest Chime Full ${stamp}`

  const admin = localDb(page)
  await installRestChimeSpy(page)
  await page.clock.install()
  await startLocal(page, {
    beforeNavigate: async (userId) => seedExerciseWithRest(admin, userId, exerciseName, 30),
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  expect(await chimeCount(page)).toBe(0)

  await page.clock.fastForward(31_000)

  await expect(page.getByRole('button', { name: 'Skip Rest' })).toHaveCount(0)
  expect(await chimeCount(page)).toBeGreaterThan(0)
})

// Same completion path but via the minimized mini-bar (WorkoutLogger.vue's
// own finishRest(), not RestTimer.vue's) -- item 100 requires the chime on
// both.
test('rest timer screen: chimes on completion (minimized path)', async ({ page, stamp }) => {
  const exerciseName = `E2E Rest Chime Mini ${stamp}`

  const admin = localDb(page)
  await installRestChimeSpy(page)
  await page.clock.install()
  await startLocal(page, {
    beforeNavigate: async (userId) => seedExerciseWithRest(admin, userId, exerciseName, 30),
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.getByText(/Resting \d:\d\d/)).toBeVisible()
  expect(await chimeCount(page)).toBe(0)

  await page.clock.fastForward(31_000)

  await expect(page.getByText(/Resting \d:\d\d/)).toHaveCount(0)
  expect(await chimeCount(page)).toBeGreaterThan(0)
})

// #379: on a short screen the rest screen scrolls, so "Back to workout" stays reachable.
test('rest timer screen: back to workout is reachable on a short screen', async ({ page, stamp }) => {
  const exerciseName = `E2E Rest Short ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => seedExerciseWithRest(admin, userId, exerciseName, 30),
  })
  await page.setViewportSize({ width: 360, height: 360 })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.locator('.rest-headline')).toHaveCount(0)
})
