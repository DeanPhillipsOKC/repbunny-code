import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Covers issue #3: renaming a template used to have no path other than
// archiving and recreating it, which would have split its history across two
// template ids and lost its exercise list. Seeds a template with an exercise
// and one finished workout directly via the admin client (item 83's pattern
// -- this isn't the behavior under test), renames it via the UI, and checks
// the new name shows up everywhere that reads a template's name (Templates
// row, Home tile, History card) while the row itself (and its exercise/
// workout history) stays the same, plus that an empty/whitespace-only name
// is rejected and leaves the old name in place.
test('rename a template: updates everywhere in place, rejects a blank name', async ({ page, stamp }) => {
  const exerciseName = `E2E Bench ${stamp}`
  const oldName = `E2E Push Day ${stamp}`
  const newName = `E2E Pull Day ${stamp}`
  const admin = localDb(page)
  let templateId = ''

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise, error: exerciseError } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      if (exerciseError) throw exerciseError

      const { data: template, error: templateError } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: oldName })
        .select('id')
        .single()
      if (templateError) throw templateError
      templateId = template!.id

      const { error: linkError } = await admin
        .from('workout_template_exercises')
        .insert({ template_id: templateId, exercise_id: exercise!.id, position: 0, target_sets: 3 })
      if (linkError) throw linkError

      const { data: prior, error: workoutError } = await admin
        .from('workouts')
        .insert({ user_id: userId, template_id: templateId, performed_at: new Date().toISOString() })
        .select('id')
        .single()
      if (workoutError) throw workoutError

      const { error: setError } = await admin
        .from('sets')
        .insert({ workout_id: prior!.id, exercise_id: exercise!.id, set_index: 0, reps: 10, weight: 135, weight_unit: 'lb' })
      if (setError) throw setError
    },
  })

  // Issue #6: rename lives in the template editor's header -- tap the name.
  await goTo(page, 'Routines')
  await page.locator('.row-wrap', { hasText: oldName }).locator('.row-title').click()
  await page.getByRole('heading', { name: oldName }).getByRole('button').click()

  // A blank name is rejected and the old name stays untouched.
  await page.getByLabel('Name', { exact: true }).fill('   ')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Name cannot be empty.')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: oldName })).toBeVisible()
  await expect(page.getByText('Name cannot be empty.')).toHaveCount(0)

  await page.getByRole('heading', { name: oldName }).getByRole('button').click()
  await page.getByLabel('Name', { exact: true }).fill(newName)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0)

  await expect(page.getByRole('heading', { name: newName })).toBeVisible()
  await expect(page.locator('.ex-card', { hasText: exerciseName })).toBeVisible()

  await page.getByRole('button', { name: 'Back to routines' }).click()
  await expect(page.locator('.row-wrap', { hasText: newName })).toBeVisible()
  await expect(page.getByText(oldName)).toHaveCount(0)

  await goTo(page, 'Home')
  await expect(page.getByRole('button', { name: newName, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: oldName, exact: true })).toHaveCount(0)

  await goTo(page, 'Workout log')
  await expect(page.locator('.template-tag').first()).toHaveText(newName)

  const { data: renamed } = await admin.from('workout_templates').select('id, name').eq('id', templateId).single()
  expect(renamed?.id).toBe(templateId)
  expect(renamed?.name).toBe(newName)
})
