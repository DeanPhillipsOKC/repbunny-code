import { test, expect, localDb, startLocal } from '../fixtures/local'
import { closeAddExerciseSheet } from '../fixtures/exercise'

// Covers docs/backlog.md item 88: pre-fill.spec.ts already covers the
// same-template case (fetchPreviousWorkout / previousSetsByExercise). These
// specs cover ensureDraftRows's fallback for when that has nothing for the
// exercise -- a freeform session, or a template whose last run didn't
// include it -- which instead pulls that exercise's own most recent workout,
// any template or freeform.

// Acceptance (1): a finished freeform workout with bench 3x(8x135lb); a new
// freeform workout, add bench, row 1 pre-fills 8 / 135 lb.
test('prefill fallback: freeform session pre-fills from its own last freeform session', async ({ page, stamp }) => {
  const exerciseName = `E2E Fallback Bench ${stamp}`

  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: bench } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: userId, template_id: null, performed_at: new Date(Date.now() - 86_400_000).toISOString() })
        .select('id')
        .single()
      for (let i = 0; i < 3; i++) {
        await admin
          .from('sets')
          .insert({ workout_id: workout!.id, exercise_id: bench!.id, set_index: i, reps: 8, weight: 135, weight_unit: 'lb' })
      }
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await expect(page.locator('.deck-empty')).toBeVisible()

  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByRole('button', { name: exerciseName, exact: true }).click()
  await closeAddExerciseSheet(page)

  await expect(page.locator('.exercise-card-name')).toHaveText(exerciseName)
  await expect(page.getByLabel('Reps')).toHaveValue('8')
  await expect(page.getByLabel('Weight')).toHaveValue('135')

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()
})

// Acceptance (2): a template whose last session lacks bench, but a newer
// freeform session has bench: starting that template pre-fills bench from
// the freeform session.
test('prefill fallback: template session pre-fills an ad-hoc exercise from a newer freeform session', async ({
  page,
  stamp,
}) => {
  const squatName = `E2E Fallback Squat ${stamp}`
  const benchName = `E2E Fallback Bench2 ${stamp}`
  const templateName = `E2E Fallback Leg Day ${stamp}`

  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: squat } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: squatName })
        .select('id')
        .single()
      const { data: bench } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: benchName })
        .select('id')
        .single()
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: squat!.id, position: 0 })

      // The template's last session: squat only, no bench.
      const { data: templateWorkout } = await admin
        .from('workouts')
        .insert({ user_id: userId, template_id: template!.id, performed_at: new Date(Date.now() - 172_800_000).toISOString() })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: templateWorkout!.id, exercise_id: squat!.id, set_index: 0, reps: 5, weight: 225, weight_unit: 'lb' })

      // A newer freeform session that did log bench.
      const { data: freeformWorkout } = await admin
        .from('workouts')
        .insert({ user_id: userId, template_id: null, performed_at: new Date(Date.now() - 86_400_000).toISOString() })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: freeformWorkout!.id, exercise_id: bench!.id, set_index: 0, reps: 8, weight: 135, weight_unit: 'lb' })
    },
  })

  await page.getByRole('button', { name: templateName, exact: true }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(squatName)

  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByRole('button', { name: benchName, exact: true }).click()
  await closeAddExerciseSheet(page)

  await expect(page.locator('.exercise-card-name')).toHaveText(benchName)
  await expect(page.getByLabel('Reps')).toHaveValue('8')
  await expect(page.getByLabel('Weight')).toHaveValue('135')

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()
})

// Acceptance (3): a template whose last session has bench at 5x185 and a
// newer freeform session at 8x135: the template pre-fill still shows 5 / 185
// -- same-template history wins, the fallback never runs.
test('prefill fallback: same-template history wins over a newer freeform session', async ({ page, stamp }) => {
  const benchName = `E2E Fallback Bench3 ${stamp}`
  const templateName = `E2E Fallback Push Day ${stamp}`

  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: bench } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: benchName })
        .select('id')
        .single()
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: bench!.id, position: 0 })

      // The template's own last session: bench at 5x185.
      const { data: templateWorkout } = await admin
        .from('workouts')
        .insert({ user_id: userId, template_id: template!.id, performed_at: new Date(Date.now() - 172_800_000).toISOString() })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: templateWorkout!.id, exercise_id: bench!.id, set_index: 0, reps: 5, weight: 185, weight_unit: 'lb' })

      // A newer freeform session at a different rep/weight -- must lose to
      // the template's own history.
      const { data: freeformWorkout } = await admin
        .from('workouts')
        .insert({ user_id: userId, template_id: null, performed_at: new Date(Date.now() - 86_400_000).toISOString() })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: freeformWorkout!.id, exercise_id: bench!.id, set_index: 0, reps: 8, weight: 135, weight_unit: 'lb' })
    },
  })

  await page.getByRole('button', { name: templateName, exact: true }).click()

  await expect(page.locator('.exercise-card-name')).toHaveText(benchName)
  await expect(page.getByLabel('Reps')).toHaveValue('5')
  await expect(page.getByLabel('Weight')).toHaveValue('185')

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()
})
