import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { clickExerciseRowAction } from '../fixtures/exercise'

// Covers docs/backlog.md item 7: rename an existing exercise without
// archiving it, and confirm the new name persists and shows up where the
// exercise is used elsewhere (the workout logging add-exercise sheet).
test('edit exercise name: rename and see it reflected elsewhere', async ({ page, stamp }) => {
  const originalName = `E2E Bench Press ${stamp}`
  const renamedName = `E2E Incline Bench Press ${stamp}`

  const admin = localDb(page)

  // The exercise is pre-existing state this test renames, not behavior under
  // test -- seed it directly via the admin client instead of driving the
  // Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: originalName })
    },
  })

  await goTo(page, 'Exercises')
  await expect(page.getByText(originalName)).toBeVisible()

  const row = page.locator('.row-wrap', { hasText: originalName })
  await clickExerciseRowAction(row, 'Edit exercise')
  const editSheet = page.getByRole('dialog', { name: 'Edit exercise' })
  await editSheet.getByLabel('Name').fill(renamedName)
  await editSheet.getByRole('button', { name: 'Save' }).click()

  await expect(page.locator('.row-wrap', { hasText: renamedName }).locator('.row-title')).toHaveText(
    renamedName,
  )
  await expect(page.getByText(originalName)).not.toBeVisible()

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByRole('button', { name: renamedName, exact: true })).toBeVisible()
})
