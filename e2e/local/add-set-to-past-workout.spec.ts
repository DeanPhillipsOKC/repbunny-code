import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 71: History's per-set actions only offered
// edit/delete on a set that already exists (item 32) -- adding a brand-new
// set to a finished workout was explicitly out of scope back then. This
// closes that gap with a "+ Add exercise" affordance per expanded history card,
// backed by the same exercise picker (AddExerciseSheet) the active logger
// uses, plus an inline reps/weight/unit/RPE form.
test('add a brand-new set to a past workout from History', async ({ page, stamp }) => {
  const loggedExerciseName = `E2E Add Set Existing ${stamp}`
  const newExerciseName = `E2E Add Set New ${stamp}`

  const admin = localDb(page)

  // Both exercises are pre-existing state this test adds a set against, not
  // behavior under test -- seed them directly via the admin client rather
  // than driving the Exercises UI twice (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert([
        { user_id: userId, name: loggedExerciseName },
        { user_id: userId, name: newExerciseName },
      ])
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, loggedExerciseName, false)

  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set', exact: true }).click()
  await dismissCelebrationIfShown(page)

  await page.getByRole('button', { name: 'Finish workout' }).click()

  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: loggedExerciseName })
  await expect(card).toBeVisible()
  await expect(card.locator('li.row-wrap')).toHaveCount(1)

  // Open the picker, back out with the sheet's own close button, and confirm
  // nothing changed -- the affordance shouldn't require completing the flow.
  await card.getByRole('button', { name: '+ Add exercise' }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(card.locator('li.row-wrap')).toHaveCount(1)

  // Add a set for a brand-new exercise (never logged in this workout).
  await card.getByRole('button', { name: '+ Add exercise' }).click()
  await page.getByPlaceholder('Search exercises').fill(newExerciseName)
  await page.getByRole('button', { name: newExerciseName, exact: true }).click()

  await expect(card.getByText(newExerciseName, { exact: true })).toBeVisible()
  await card.getByLabel('Reps').fill('6')
  await card.getByLabel('Weight').fill('95')
  await card.getByRole('button', { name: 'Save', exact: true }).click()

  // Issue #66: the new set lands under its own exercise heading, after the
  // exercise that was already in the workout.
  await expect(card.locator('li.row-wrap')).toHaveCount(2)
  const groups = card.locator('.exercise-group')
  await expect(groups).toHaveCount(2)
  await expect(groups.nth(0).locator('.group-title')).toHaveText(loggedExerciseName)
  await expect(groups.nth(1).locator('.group-title')).toHaveText(newExerciseName)
  await expect(groups.nth(1).locator('li.row-wrap')).toHaveCount(1)
  await expect(groups.nth(1).locator('li.row-wrap')).toContainText('6 × 95 lb')

  // Cancelling the inline form after picking an exercise discards the draft.
  await card.getByRole('button', { name: '+ Add exercise' }).click()
  await page.getByPlaceholder('Search exercises').fill(loggedExerciseName)
  await page.getByRole('button', { name: loggedExerciseName, exact: true }).click()
  await card.getByLabel('Reps').fill('99')
  await card.getByRole('button', { name: 'Cancel' }).click()
  await expect(card.locator('li.row-wrap')).toHaveCount(2)

  // A page reload should show the newly added set persisted, not just
  // reflected in local state.
  await page.reload()
  await expect(card).toBeVisible()
  await expect(card.locator('li.row-wrap')).toHaveCount(2)
  await expect(card.locator('li.row-wrap').nth(1)).toContainText('6 × 95 lb')
})
