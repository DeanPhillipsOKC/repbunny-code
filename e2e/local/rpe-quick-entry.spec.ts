import { test, expect, localDb, startLocal } from '../fixtures/local'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 67: RPE is now an always-visible, dashed/dim
// tap-to-edit field (no more "+RPE" reveal-toggle) -- tapping it and typing
// immediately lands the value, with no separate reveal step first. Also
// covers the select-on-focus behavior, so a carried-over RPE value
// (pre-fill.spec.ts) is a one-keystroke overwrite instead of requiring
// manual cursor repositioning.
test('RPE quick-entry: tapping the field accepts input directly, no reveal step', async ({ page, stamp }) => {
  const exerciseName = `E2E RPE Toggle ${stamp}`

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

  await expect(page.getByRole('button', { name: '+RPE' })).toHaveCount(0)
  const rpeInput = page.getByLabel('RPE (optional)')
  await rpeInput.click()
  await page.keyboard.type('7')
  await expect(rpeInput).toHaveValue('7')
})

test('RPE quick-entry: carried-over value is selected on focus for one-keystroke overwrite', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E RPE Carryover ${stamp}`
  const templateName = `E2E RPE Carryover Day ${stamp}`

  const userId = await startLocal(page)

  // The "previous set with an RPE" this carries over is pre-existing state,
  // not behavior under test — seed it directly via the admin client instead
  // of driving a full prior workout through the UI (backlog item 57).
  const admin = localDb(page)
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
    .insert([{ template_id: template!.id, exercise_id: exercise!.id, position: 0 }])
  const { data: workout } = await admin
    .from('workouts')
    .insert({ user_id: userId, template_id: template!.id })
    .select('id')
    .single()
  await admin.from('sets').insert({
    workout_id: workout!.id,
    exercise_id: exercise!.id,
    set_index: 0,
    reps: 5,
    weight: 200,
    weight_unit: 'lb',
    rpe: 8,
  })

  // Reload so the app's onMounted fetch picks up the seeded template — the
  // initial navigation in startLocal happened before it existed.
  await page.reload()

  await page.getByRole('button', { name: templateName, exact: true }).click()
  await page.getByRole('button', { name: exerciseName, exact: true }).click()

  const rpeInput = page.getByLabel('RPE (optional)')
  await expect(rpeInput).toHaveValue('8')

  // Tapping into the pre-filled field selects its value, so typing a
  // replacement overwrites it outright instead of inserting at the cursor.
  await rpeInput.click()
  await page.keyboard.type('3')
  await expect(rpeInput).toHaveValue('3')
})
