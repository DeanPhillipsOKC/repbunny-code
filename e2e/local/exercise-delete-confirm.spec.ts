import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { clickExerciseRowAction } from '../fixtures/exercise'

// Covers docs/backlog.md item 24: "Archive" (no restore path anywhere in the
// UI) is relabeled "Delete" and now requires an explicit confirm step,
// same inline-toggle pattern as e2e/local/template-archive-confirm.spec.ts.
test('deleting an exercise requires an explicit confirm step', async ({ page, stamp }) => {
  const exerciseName = `E2E Delete Confirm ${stamp}`

  const admin = localDb(page)

  // The exercise is pre-existing state this test deletes, not behavior under
  // test -- seed it directly via the admin client instead of driving the
  // Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Exercises')
  await expect(page.getByText(exerciseName)).toBeVisible()

  // The confirm step swaps the exercise's name out of the row entirely, so
  // "Confirm delete"/"Cancel" are queried directly rather than staying
  // scoped to a `hasText: exerciseName` locator that stops matching the
  // instant the confirm UI appears (same shape as the template-archive spec).
  await clickExerciseRowAction(page.locator('.row-wrap', { hasText: exerciseName }), 'Delete exercise')
  const warning = page.getByText(`Remove ${exerciseName}? Your past workouts keep its sets.`)
  await expect(warning).toBeVisible()

  // item 74: the warning text must stack above the button row, not squeeze
  // into a narrow wrapped column beside it.
  const warningBox = await warning.boundingBox()
  const actionsBox = await page.getByRole('button', { name: 'Remove', exact: true }).boundingBox()
  expect(warningBox).not.toBeNull()
  expect(actionsBox).not.toBeNull()
  expect(actionsBox!.y).toBeGreaterThanOrEqual(warningBox!.y + warningBox!.height - 1)

  // #67: white on --danger fails contrast, so the label uses --accent-text.
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCSS('color', 'rgb(36, 26, 44)')

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText(exerciseName)).toBeVisible()

  await clickExerciseRowAction(page.locator('.row-wrap', { hasText: exerciseName }), 'Delete exercise')
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByText(exerciseName)).toHaveCount(0)
})
