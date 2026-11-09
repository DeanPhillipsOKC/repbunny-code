import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Issue #474: the workout log shows volume on each weighted set and a total
// per exercise.
test('history shows volume per weighted set and an exercise total', async ({ page, stamp }) => {
  const exerciseName = `E2E History Volume ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  for (const [reps, weight] of [['10', '45'], ['8', '135']]) {
    await page.getByLabel('Reps').fill(reps)
    await page.getByLabel('Weight').fill(weight)
    await page.getByRole('button', { name: 'Add set' }).click()
    await dismissCelebrationIfShown(page)
  }
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: exerciseName })
  await expect(card.getByTestId('set-volume')).toHaveText(['450 lb', '1,080 lb'])
  await expect(card.getByTestId('group-volume')).toHaveText('Volume 1,530 lb')
})
