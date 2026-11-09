import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md's "Recover an interrupted workout after reload"
// item: activeWorkoutId/activeSets used to live only in the Pinia store, so
// a reload lost the live session even though its rows were saved.
// These specs simulate that loss with page.reload() (a fresh mount, same as
// a real refresh or installed-PWA relaunch) and drive the resulting
// Resume/Discard prompt.

test('resume workout: reload after logging a set offers to resume, and Resume restores the session', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Resume Squat ${stamp}`
  const templateName = `E2E Resume Day ${stamp}`

  const admin = localDb(page)

  // The exercise and template are pre-existing state this test logs a
  // workout against, not behavior under test -- seed them directly via the
  // admin client instead of driving the Exercises/Templates UI (item 57's
  // pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: exercise!.id, position: 0 })
    },
  })

  await page.getByRole('button', { name: templateName, exact: true }).click()
  await page.getByRole('button', { name: exerciseName, exact: true }).click()
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('185')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged', { hasText: '8 × 185 lb' })).toBeVisible()

  await page.reload()

  // The normal "start a workout" form must not show while a recoverable
  // workout is pending a decision.
  await expect(page.getByRole('heading', { name: 'Resume your workout?' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Freeform' })).toHaveCount(0)
  const prompt = page.locator('.card', { hasText: 'Resume your workout?' })
  await expect(prompt).toContainText(templateName)
  await expect(prompt).toContainText('1 set logged')

  await page.getByRole('button', { name: 'Resume workout' }).click()

  // The recovered session is genuinely active, not just a cosmetic replay:
  // the previously saved set is back, the header reflects the resumed
  // template, and a second set can still be logged against it.
  await expect(page.getByRole('heading', { name: templateName, exact: true })).toBeVisible()
  await expect(page.locator('.set-row-logged', { hasText: '8 × 185 lb' })).toBeVisible()

  await page.getByRole('button', { name: exerciseName, exact: true }).click()
  await page.getByLabel('Reps').fill('6')
  await page.getByLabel('Weight').fill('205')
  await page.getByRole('button', { name: 'Add set' }).click()
  // 6 × 205 = 1230 lb-reps, under the first set's 8 × 185 = 1480 -- not a new
  // best, so no celebration renders here (item 82: skip the blind wait).
  await expect(page.locator('.set-row-logged', { hasText: '6 × 205 lb' })).toBeVisible()

  await page.getByRole('button', { name: 'Finish workout' }).click()
})

test('resume workout: reload before the first set is still offered, and stays resumable', async ({ page, stamp }) => {
  const exerciseName = `E2E Resume Freeform ${stamp}`

  const admin = localDb(page)

  // The exercise is pre-existing state this test logs a set against, not
  // behavior under test -- seed it directly via the admin client instead of
  // driving the Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await expect(page.getByRole('heading', { name: 'Freeform workout' })).toBeVisible()

  await page.reload()

  const prompt = page.locator('.card', { hasText: 'Resume your workout?' })
  await expect(prompt).toBeVisible()
  await expect(prompt).toContainText('Freeform workout')
  await expect(prompt).not.toContainText('set logged')

  await page.getByRole('button', { name: 'Resume workout' }).click()
  await expect(page.getByRole('heading', { name: 'Freeform workout' })).toBeVisible()

  // No sets existed before the reload, so logging the very first one must
  // still work on the resumed session. A freeform workout's carousel deck
  // starts empty (no template, no ad-hoc additions carried over the
  // reload), so add the exercise through the sheet.
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged', { hasText: '10 × 95 lb' })).toBeVisible()

  await page.getByRole('button', { name: 'Finish workout' }).click()
})

test('resume workout: Discard on a recovered workout requires confirmation and removes it, sets included', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Resume Discard ${stamp}`

  const admin = localDb(page)

  // The exercise is pre-existing state this test logs a set against, not
  // behavior under test -- seed it directly via the admin client instead of
  // driving the Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  // Freeform workout: the carousel deck starts empty, add via the sheet.
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('135')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  await page.reload()

  const prompt = page.locator('.card', { hasText: 'Resume your workout?' })
  await expect(prompt).toBeVisible()

  await page.getByRole('button', { name: 'Discard workout' }).click()
  await expect(prompt).toContainText("Discard this workout and its logged sets? This can't be undone.")

  // Cancel first: the workout must still be there afterward, not deleted
  // the moment Discard was tapped once.
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(prompt).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume workout' })).toBeVisible()

  await page.getByRole('button', { name: 'Discard workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()

  // Back to the normal start-a-workout state — nothing left to recover.
  await expect(prompt).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Resume your workout?' })).toHaveCount(0)
})

test('resume workout: a stale local reference (deleted or foreign row) is silently dropped', async ({
  page,
  stamp,
}) => {
  const admin = localDb(page)

  // The start-workout form only renders once the account has at least one
  // active exercise (docs/backlog-archive.md item 27's zero-exercise welcome
  // card) — this test only exercises the stale-reference-drop path, so seed
  // a throwaway exercise directly via the admin client (item 57's pattern)
  // rather than creating one through the UI just to get past the welcome
  // screen. Seeded via startLocal's beforeNavigate hook rather than
  // seed-then-reload, which can leave two competing onMounted fetches racing
  // each other (docs/backlog.md item 58).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: `E2E Baseline ${stamp}` })
    },
  })

  // The stale-reference tamper still needs its own reload — checkForRecoverableWorkout()
  // only runs on the auth transition/mount, so setting this after the app has
  // already mounted needs a fresh mount to actually exercise it.
  await page.evaluate(() => {
    localStorage.setItem('repbunny-active-workout-id', '00000000-0000-0000-0000-000000000000')
  })
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Resume your workout?' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('repbunny-active-workout-id')))
    .toBeNull()
})
