import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { clickExerciseRowAction } from '../fixtures/exercise'

// Covers docs/backlog.md item 15's schema/UI half: configuring a per-exercise
// rest timer duration, add/edit/persist, same inline-editor pattern as
// e2e/local/exercise-notes.spec.ts. The real rest-over notification on a
// locked phone is a native QA case (scripts/qa/procedure.mjs), not something
// this spec can exercise headlessly.
test('exercise rest timer: add, edit, and clear a duration', async ({ page, stamp }) => {
  const exerciseName = `E2E Leg Curl ${stamp}`

  const admin = localDb(page)

  // The exercise is pre-existing state this test configures a rest timer
  // on, not behavior under test -- seed it directly via the admin client
  // instead of driving the Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Exercises')
  await expect(page.getByText(exerciseName)).toBeVisible()

  const row = page.locator('.row-wrap', { hasText: exerciseName })
  await clickExerciseRowAction(row, 'Edit exercise')
  const editSheet = page.getByRole('dialog', { name: 'Edit exercise' })
  await editSheet.getByLabel('Rest timer (seconds)').fill('90')
  await editSheet.getByRole('button', { name: 'Save' }).click()

  await expect(row.locator('.tag-pill', { hasText: 'Rest: 90s' })).toBeVisible()

  // Edit persists correctly, not just create.
  await clickExerciseRowAction(row, 'Edit exercise')
  await editSheet.getByLabel('Rest timer (seconds)').fill('30')
  await editSheet.getByRole('button', { name: 'Save' }).click()
  await expect(row.locator('.tag-pill', { hasText: 'Rest: 30s' })).toBeVisible()

  // Clearing the field removes the timer (no alert configured).
  await clickExerciseRowAction(row, 'Edit exercise')
  await editSheet.getByLabel('Rest timer (seconds)').fill('')
  await editSheet.getByRole('button', { name: 'Save' }).click()
  await expect(row.locator('.tag-pill', { hasText: 'Rest:' })).toHaveCount(0)
})
