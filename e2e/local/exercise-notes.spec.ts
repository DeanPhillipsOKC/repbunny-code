import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { selectExercise, clickExerciseRowAction } from '../fixtures/exercise'

// Covers docs/backlog.md item 8: add setup notes to an exercise, confirm
// they persist in the Exercises tab, and confirm they surface next to the
// set-entry form while logging a workout (not just in the Exercises tab).
test('exercise setup notes: add, edit, and see them while logging', async ({ page, stamp }) => {
  const exerciseName = `E2E Leg Press ${stamp}`
  const initialNotes = 'Seat position 4, back pad 2'
  const updatedNotes = 'Seat position 5, back pad 2'

  const admin = localDb(page)

  // The exercise is pre-existing state this test adds notes to, not
  // behavior under test -- seed it directly via the admin client instead of
  // driving the Exercises UI (item 57's pattern, item 83).
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
  await editSheet.getByLabel('Setup notes').fill(initialNotes)
  await editSheet.getByRole('button', { name: 'Save' }).click()

  await expect(row.locator('.tag-pill')).toHaveText(initialNotes)

  // Edit persists correctly, not just create.
  await clickExerciseRowAction(row, 'Edit exercise')
  await editSheet.getByLabel('Setup notes').fill(updatedNotes)
  await editSheet.getByRole('button', { name: 'Save' }).click()
  await expect(row.locator('.tag-pill')).toHaveText(updatedNotes)

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  await expect(page.locator('.setup-notes')).toHaveText(updatedNotes)
})
