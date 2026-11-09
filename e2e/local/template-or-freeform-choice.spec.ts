import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'

// Item 111: the start screen is a set of workout tiles, and tapping one
// starts that workout right away (it used to be "Template (optional)" chips
// above a Start button that stayed disabled until a chip was picked, which
// kept stalling users). A wrong tap is undone with "Wrong workout? Change it",
// shown only until the first set is saved; it drops the empty workout row.
// Workout notes moved to the post-finish recap.
test('tapping a workout tile starts it, and Change workout undoes a wrong tap', async ({ page, stamp }) => {
  const exerciseName = `E2E Choice Squat ${stamp}`
  const templateName = `E2E Choice Day ${stamp}`
  const notes = `E2E choice notes ${stamp}`

  const admin = localDb(page)

  // The exercise and template are pre-existing state this test picks
  // between, not behavior under test -- seed them directly via the admin
  // client instead of driving the Exercises/Templates UI (item 57's
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

  const freeformTile = page.getByRole('button', { name: 'Freeform' })
  const templateTile = page.getByRole('button', { name: templateName, exact: true })
  const changeWorkout = page.getByRole('button', { name: 'Wrong workout? Change it' })

  // No Start button and no notes field on the start screen any more.
  await expect(templateTile).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start workout' })).toHaveCount(0)
  await expect(page.getByLabel('Notes (optional)')).toHaveCount(0)
  await expect(freeformTile).toHaveAccessibleDescription(/no progress chart/)

  // A wrong tap: Freeform starts immediately...
  await freeformTile.click()
  await expect(page.getByRole('heading', { name: 'Freeform workout' })).toBeVisible()
  const wrongId = await page.evaluate(() => localStorage.getItem('repbunny-active-workout-id'))
  expect(wrongId).toBeTruthy()

  // ...and "Change workout" backs out with no confirm, deleting the empty row.
  await changeWorkout.click()
  await expect(templateTile).toBeVisible()
  await expect.poll(async () => (await admin.from('workouts').select('id').eq('id', wrongId!)).data?.length).toBe(0)

  // The right tap starts the template.
  await templateTile.click()
  await expect(page.getByRole('heading', { name: templateName, exact: true })).toBeVisible()
  await expect(changeWorkout).toBeVisible()

  await page.getByRole('button', { name: exerciseName, exact: true }).click()
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('135')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  // Once a set is saved, leaving means Finish or Discard like always.
  await expect(changeWorkout).toHaveCount(0)

  const workoutId = await page.evaluate(() => localStorage.getItem('repbunny-active-workout-id'))
  await page.getByRole('button', { name: 'Finish workout' }).click()

  // Notes are written on the recap and saved on Done.
  await page.getByLabel('Notes (optional)').fill(notes)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(templateTile).toBeVisible()
  await expect
    .poll(async () => (await admin.from('workouts').select('notes').eq('id', workoutId!).single()).data?.notes)
    .toBe(notes)
})
