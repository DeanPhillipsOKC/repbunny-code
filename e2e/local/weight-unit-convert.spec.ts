import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers issue #57: the logger's lb/kg toggles convert the weights in unsaved
// rows (rounded to 0.5) instead of just relabeling them. Logged sets keep
// their stored weight and unit.

async function seedTemplateWithHistory(page: Page, exerciseName: string, templateName: string) {
  const admin = localDb(page)
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
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      if (templateError) throw templateError
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template.id, exercise_id: exercise.id, position: 0, target_sets: 2 })
      const { data: workout, error: workoutError } = await admin
        .from('workouts')
        .insert({ user_id: userId, template_id: template.id, performed_at: '2026-09-01T15:00:00Z', notes: `E2E ${templateName}` })
        .select('id')
        .single()
      if (workoutError) throw workoutError
      await admin.from('sets').insert(
        [0, 1].map((i) => ({ workout_id: workout.id, exercise_id: exercise.id, set_index: i, reps: 10, weight: 150, weight_unit: 'lb' })),
      )
    },
  })
  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, exerciseName, true)
}

test('weight unit toggle: switching converts every draft row and switching back restores it', async ({ page, stamp }) => {
  const exerciseName = `E2E Convert Bench ${stamp}`
  await seedTemplateWithHistory(page, exerciseName, `E2E Convert Day ${stamp}`)

  const drafts = page.locator('.set-row-draft')
  const units = page.getByRole('group', { name: 'Units', exact: true })
  await expect(drafts).toHaveCount(2)
  await expect(drafts.nth(0).getByLabel('Weight')).toHaveValue('150')
  await expect(drafts.nth(1).getByLabel('Weight')).toHaveValue('150')

  await units.getByRole('button', { name: 'kg', exact: true }).click()
  await expect(drafts.nth(0).getByLabel('Weight')).toHaveValue('68')
  await expect(drafts.nth(1).getByLabel('Weight')).toHaveValue('68')

  // Tapping the already-selected unit changes nothing.
  await units.getByRole('button', { name: 'kg', exact: true }).click()
  await expect(drafts.nth(0).getByLabel('Weight')).toHaveValue('68')

  await units.getByRole('button', { name: 'lb', exact: true }).click()
  await expect(drafts.nth(0).getByLabel('Weight')).toHaveValue('150')
  await expect(drafts.nth(1).getByLabel('Weight')).toHaveValue('150')
})

test('weight unit toggle: a logged set keeps its label and only the remaining draft converts', async ({ page, stamp }) => {
  const exerciseName = `E2E Convert Row ${stamp}`
  await seedTemplateWithHistory(page, exerciseName, `E2E Convert Pull ${stamp}`)

  const drafts = page.locator('.set-row-draft')
  await drafts.nth(0).getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  const logged = page.locator('.set-row-logged')
  await expect(logged).toHaveCount(1)
  await expect(logged.nth(0).locator('.set-logged-weight')).toHaveText('150lb')
  await expect(drafts).toHaveCount(1)

  await page.getByRole('group', { name: 'Units', exact: true }).getByRole('button', { name: 'kg', exact: true }).click()
  await expect(drafts.nth(0).getByLabel('Weight')).toHaveValue('68')
  await expect(logged.nth(0).locator('.set-logged-weight')).toHaveText('150lb')
})

test('weight unit toggle: the inline set editor converts 100 lb to 45.5 kg and saves both', async ({ page, stamp }) => {
  const exerciseName = `E2E Convert Edit ${stamp}`
  const admin = localDb(page)
  const userId = await startLocal(page, {
    beforeNavigate: async (id) => {
      await admin.from('exercises').insert({ user_id: id, name: exerciseName })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  const draft = page.locator('.set-row-draft')
  await draft.getByLabel('Reps').fill('8')
  await draft.getByLabel('Weight').fill('100')
  await draft.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  await page.getByRole('button', { name: 'Edit set 1' }).click()
  const editing = page.locator('.set-row-editing')
  await editing.getByRole('group', { name: 'Units for set 1' }).getByRole('button', { name: 'kg' }).click()
  await expect(editing.getByLabel('Weight')).toHaveValue('45.5')
  await editing.getByRole('button', { name: 'Save set 1' }).click()
  await expect(page.locator('.set-row-logged').nth(0).locator('.set-logged-weight')).toHaveText('45.5kg')

  await expect
    .poll(async () => {
      const { data: exercise } = await admin.from('exercises').select('id').eq('user_id', userId).eq('name', exerciseName).single()
      const { data } = await admin.from('sets').select('weight, weight_unit').eq('exercise_id', exercise!.id)
      return data
    })
    .toEqual([{ weight: 45.5, weight_unit: 'kg' }])
})

test('weight unit toggle: the past-workout set editor converts the weight when the unit changes', async ({ page, stamp }) => {
  const exerciseName = `E2E Convert Past ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (id) => {
      const { data: exercise } = await admin.from('exercises').insert({ user_id: id, name: exerciseName }).select('id').single()
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: id, performed_at: new Date(Date.now() - 60_000).toISOString(), notes: `E2E ${stamp}` })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: workout!.id, exercise_id: exercise!.id, set_index: 0, reps: 8, weight: 100, weight_unit: 'lb' })
    },
  })

  await goTo(page, 'Workout log')
  // Only the newest workout starts expanded (item 45), and a parallel spec's
  // workout can be newer than this one, so expand it if it's condensed.
  const card = page.locator('.card', { hasText: exerciseName })
  await expect(card).toBeVisible()
  if (await card.evaluate((el) => el.classList.contains('card-condensed'))) {
    await card.getByRole('button', { name: new RegExp(exerciseName) }).click()
  }
  const setRow = card.locator('li.row-wrap').first()
  await expect(setRow).toContainText('8 × 100 lb')
  await setRow.getByRole('button', { name: 'Edit' }).click()
  await setRow.getByLabel('Unit').selectOption('kg')
  await expect(setRow.getByLabel('Weight')).toHaveValue('45.5')
  await setRow.getByRole('button', { name: 'Save' }).click()
  await expect(setRow).toContainText('8 × 45.5 kg')
})
