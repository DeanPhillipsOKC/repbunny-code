import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { closeAddExerciseSheet, pickMuscleGroup } from '../fixtures/exercise'

// Covers docs/backlog.md item 90: the add-exercise sheet's "New exercise"
// entry lets a freeform workout create an exercise without leaving the
// logger (previously the only path was the "manage" link, which routes away
// and drops any unsaved draft row -- WorkoutLogger.vue unmounts on
// navigation).
test('create a new exercise from the add-exercise sheet without leaving the workout', async ({ page, stamp }) => {
  const exerciseAName = `E2E Sheet Create A ${stamp}`
  const exerciseBName = `E2E Sheet Create B ${stamp}`

  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseAName })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByRole('button', { name: exerciseAName, exact: true }).click()
  await closeAddExerciseSheet(page)

  // Partly fill a draft row for A before creating B.
  await expect(page.locator('.exercise-card-name')).toHaveText(exerciseAName)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('135')

  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByRole('button', { name: 'New exercise', exact: true }).click()
  // Issue #781: it opens as its own sheet on top, not inline above the list.
  const form = page.getByRole('dialog', { name: 'New exercise' })
  await pickMuscleGroup(form)
  await form.getByLabel('Name', { exact: true }).fill(exerciseBName)
  await form.getByRole('button', { name: 'Add exercise' }).click()
  await expect(form).toHaveCount(0)
  // Issue #43: the sheet stays open with B marked added until Done.
  await expect(sheet.getByRole('button', { name: exerciseBName, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await closeAddExerciseSheet(page)

  // B becomes the selected card, with its own fresh (empty) draft row.
  await expect(page.locator('.exercise-card-name')).toHaveText(exerciseBName)
  await expect(page.getByLabel('Reps')).toHaveValue('')

  // Switching back to A shows its draft values were never touched.
  await page.getByRole('button', { name: exerciseAName, exact: true }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(exerciseAName)
  await expect(page.getByLabel('Reps')).toHaveValue('8')
  await expect(page.getByLabel('Weight')).toHaveValue('135')

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()

  // B was created for real, independent of the discarded workout.
  await goTo(page, 'Exercises')
  await expect(page.locator('.row-wrap', { hasText: exerciseBName })).toBeVisible()
})

// A templated workout's deck stays scoped to the template (item 21), so the
// "New exercise" entry doesn't offer a place for a brand-new exercise to go.
test('add-exercise sheet has no "New exercise" entry for a templated workout', async ({ page, stamp }) => {
  const exerciseName = `E2E Sheet Templated ${stamp}`
  const templateName = `E2E Sheet Template ${stamp}`

  const admin = localDb(page)

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
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(sheet.getByRole('button', { name: 'New exercise' })).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()
})
