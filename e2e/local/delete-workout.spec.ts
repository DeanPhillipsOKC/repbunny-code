import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 31: remove a finished workout logged in error
// from History. `sets.workout_id` has `on delete cascade`, so this also
// confirms the workout row itself is actually gone, not just hidden.
//
// Item 85: this spec used to create its fixture exercise by driving the
// Exercises screen's "Add exercise" form, then assert it rendered there --
// exercise creation isn't the behavior under test, and that assertion could
// intermittently time out on the shared test account once its `exercises`
// table crossed the old online database's 1000-row default page size (item
// 56's root cause). Seeded directly instead, same pattern as
// progress-strip.spec.ts.
test('delete a workout from History', async ({ page, stamp }) => {
  const exerciseName = `E2E Delete Workout ${stamp}`
  const notes = `E2E delete-workout ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  // Item 111: notes are written on the post-finish recap now.
  await page.getByLabel('Notes (optional)').fill(notes)
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: notes })
  await expect(card).toBeVisible()

  // Item 110: clicking the delete icon shows a confirm step in a centered
  // modal dialog, not inline at the bottom of the card.
  const dialog = page.getByRole('dialog', { name: 'Delete this workout?' })
  await card.getByRole('button', { name: 'Delete workout' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("This can't be undone.")).toBeVisible()

  // Cancelling backs out without deleting.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: 'Delete workout' }).click()
  await dialog.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.locator('.card', { hasText: notes })).toHaveCount(0)

  const { data, error } = await admin.from('workouts').select('id').eq('notes', notes)
  expect(error).toBeNull()
  expect(data).toEqual([])
})

// Item 110: on a long workout the old inline confirm rendered a full screen
// or more below the trigger button, so tapping delete looked like it did
// nothing until scrolling down. The modal dialog must stay fully in view at
// phone width regardless of how many sets the card has, and Escape must
// cancel it the same as clicking Cancel.
test('deleting a long workout shows the confirm dialog fully on screen at phone width', async ({ page, stamp }) => {
  const exerciseName = `E2E Delete Long ${stamp}`
  const notes = `E2E delete-long ${stamp}`

  const admin = localDb(page)
  await page.setViewportSize({ width: 375, height: 800 })
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      const { data: workoutRow } = await admin
        .from('workouts')
        .insert({ user_id: userId, notes })
        .select('id')
        .single()
      const sets = Array.from({ length: 12 }, (_, i) => ({
        workout_id: workoutRow!.id,
        exercise_id: exercise!.id,
        set_index: i,
        reps: 10,
        weight: 45,
        weight_unit: 'lb' as const,
      }))
      await admin.from('sets').insert(sets)
    },
  })

  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: notes })
  await expect(card).toBeVisible()
  await expect(card.locator('li.row-wrap')).toHaveCount(12)

  const dialog = page.getByRole('dialog', { name: 'Delete this workout?' })
  await card.getByRole('button', { name: 'Delete workout' }).click()
  await expect(dialog).toBeVisible()

  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(800)

  // Escape cancels the same as the Cancel button.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: 'Delete workout' }).click()
  await dialog.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.locator('.card', { hasText: notes })).toHaveCount(0)

  const { data, error } = await admin.from('workouts').select('id').eq('notes', notes)
  expect(error).toBeNull()
  expect(data).toEqual([])
})
