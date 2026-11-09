import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md's "Let an accidentally-finished workout be resumed"
// item: tapping "Finish workout" used to be a one-way door the moment any
// set existed (docs/backlog-archive.md item 51 only guards the zero-sets
// case). These specs drive the real "Finish workout" button (not a reload,
// unlike resume-workout.spec.ts's crash-recovery specs) and check the
// post-finish resume offer. It lives on the post-finish recap itself as
// "Finished too early? Resume" (item 68; item 106 made the recap show for
// freeform workouts too) -- "Done" there goes straight to a new workout with
// no second gate.

test('resume after finish: freeform workout with a set offers resume, and Resume restores it', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E ResumeFinish Freeform ${stamp}`

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
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged', { hasText: '10 × 95 lb' })).toBeVisible()

  await page.getByRole('button', { name: 'Finish workout' }).click()

  // Item 106: a freeform finish gets the recap too, with the resume offer
  // on it rather than as a separate "Resume your workout?" card.
  const recap = page.getByTestId('post-finish-card')
  await expect(recap).toBeVisible()
  await expect(recap).toContainText('Freeform workout, done.')
  await expect(page.locator('.card', { hasText: 'Resume your workout?' })).toHaveCount(0)
  // Exact: the recap's row button for this exercise ("... Freeform <stamp>
  // progress", issue #46) must not count as the start screen's button.
  await expect(page.getByRole('button', { name: 'Freeform', exact: true })).toHaveCount(0)

  await recap.getByRole('button', { name: 'Finished too early? Resume' }).click()

  // Genuinely active again, not a cosmetic replay: the prior set is back,
  // the header reflects the resumed workout, and logging can continue.
  await expect(page.getByRole('heading', { name: 'Freeform workout' })).toBeVisible()
  await expect(page.locator('.set-row-logged', { hasText: '10 × 95 lb' })).toBeVisible()

  await selectExercise(page, exerciseName, true)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('105')
  await page.getByRole('button', { name: 'Add set' }).click()
  // 8 × 105 = 840 lb-reps, under the first set's 10 × 95 = 950 -- not a new
  // best, so no celebration renders here (item 82: skip the blind wait).
  await expect(page.locator('.set-row-logged', { hasText: '8 × 105 lb' })).toBeVisible()

  await page.getByRole('button', { name: 'Finish workout' }).click()
})

test('resume after finish: templated workout offers resume inside the recap, and Done skips a second gate', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E ResumeFinish Squat ${stamp}`
  const templateName = `E2E ResumeFinish Day ${stamp}`

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
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('225')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged', { hasText: '5 × 225 lb' })).toBeVisible()

  await page.getByRole('button', { name: 'Finish workout' }).click()

  // Item 68: a templated workout with sets shows the post-finish card, and
  // the just-finished resume offer lives inside that same card as a
  // secondary affordance, not as a second card gating "Done".
  const chart = page.getByTestId('post-finish-card')
  await expect(chart).toBeVisible()
  const resumeLink = chart.getByRole('button', { name: 'Finished too early? Resume' })
  await expect(resumeLink).toBeVisible()
  await expect(page.locator('.card', { hasText: 'Resume your workout?' })).toHaveCount(0)

  // "Done" goes straight to the start screen — no second gate.
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.card', { hasText: 'Resume your workout?' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Freeform' })).toBeEnabled()

  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: templateName })
  await expect(card).toBeVisible()
  await expect(card.locator('li.row-wrap')).toContainText('5 × 225 lb')
})

test('resume after finish: "Finished too early? Resume" on the recap restores the workout', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E ResumeFinish TooEarly ${stamp}`
  const templateName = `E2E ResumeFinish TooEarly Day ${stamp}`

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
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('185')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged', { hasText: '5 × 185 lb' })).toBeVisible()

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()

  await page.getByRole('button', { name: 'Finished too early? Resume' }).click()

  // Genuinely resumed, not left stuck on the card: the workout is active
  // again under its template name with the prior set still there.
  await expect(page.getByRole('heading', { name: templateName, exact: true })).toBeVisible()
  await expect(page.locator('.set-row-logged', { hasText: '5 × 185 lb' })).toBeVisible()
  await expect(page.getByTestId('post-finish-card')).toHaveCount(0)

  await page.getByRole('button', { name: 'Finish workout' }).click()
})

test('resume after finish: finishing with no sets logged does not offer to resume', async ({ page, stamp }) => {
  const templateName = `E2E ResumeFinish Empty ${stamp}`

  const admin = localDb(page)

  // The start-workout form (including the template chips this test needs)
  // only renders once the account has at least one active exercise
  // (docs/backlog-archive.md item 27's zero-exercise welcome card) — this
  // test only exercises the template/resume path, so seed a throwaway
  // exercise directly via the admin client (item 57's pattern) rather than
  // creating one through the UI just to get past the welcome screen. Seeded
  // via startLocal's beforeNavigate hook rather than seed-then-reload,
  // which can leave two competing onMounted fetches racing each other
  // (docs/backlog.md item 58).
  // The template is also pre-existing state this test finishes a workout
  // against, not behavior under test -- seeded the same way (item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: `E2E Baseline ${stamp}` })
      await admin.from('workout_templates').insert({ user_id: userId, name: templateName })
    },
  })

  await page.getByRole('button', { name: templateName, exact: true }).click()

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByText('Finish with no sets logged? This will discard the workout.')).toBeVisible()
  await page.getByRole('button', { name: 'Discard workout' }).click()

  await expect(page.getByRole('heading', { name: 'Resume your workout?' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Log a workout' })).toBeVisible()
  await expect(page.getByRole('button', { name: templateName, exact: true })).toBeVisible()
})
