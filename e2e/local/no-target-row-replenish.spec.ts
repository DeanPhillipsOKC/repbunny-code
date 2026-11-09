import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Bug found from a real report: an exercise with no configured target_sets
// is meant to always keep exactly one open row (completeRow's auto-replenish
// in WorkoutLogger.vue) -- but before this fix, replenishing fired on every
// completion regardless of how many other open rows already existed. A user
// who tapped "+ Add row" a couple of extra times, then logged that many real
// sets, ended up with that same surplus of blank rows stuck open forever
// (each completion removed one and immediately added one back), which read
// as "extra rows" reappearing every time the exercise was reopened.
test('no-target exercise: manually added rows settle back to one open row, not stay at the surplus', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Open Ended Curl ${stamp}`

  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  const openRows = page.locator('.set-row-draft')
  await expect(openRows).toHaveCount(1)

  // Manually add two extra rows, same as a couple of stray "+ Add row" taps.
  await page.getByRole('button', { name: '+ Add row' }).click()
  await page.getByRole('button', { name: '+ Add row' }).click()
  await expect(openRows).toHaveCount(3)

  // Log all three. Completing one of several open rows should not top the
  // grid back up to three -- only the last remaining open row replenishes.
  await openRows.nth(0).getByLabel('Reps').fill('10')
  await openRows.nth(0).getByLabel('Weight').fill('20')
  await openRows.nth(0).getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(openRows).toHaveCount(2)

  await openRows.nth(0).getByLabel('Reps').fill('10')
  await openRows.nth(0).getByLabel('Weight').fill('20')
  await openRows.nth(0).getByRole('button', { name: 'Add set' }).click()
  await expect(openRows).toHaveCount(1)

  // Completing the last open row replenishes exactly one, not another
  // surplus -- this is the case that used to stay stuck at three.
  await openRows.nth(0).getByLabel('Reps').fill('10')
  await openRows.nth(0).getByLabel('Weight').fill('20')
  await openRows.nth(0).getByRole('button', { name: 'Add set' }).click()
  await expect(openRows).toHaveCount(1)

  await expect(page.locator('.set-row-logged')).toHaveCount(3)

  await page.getByRole('button', { name: 'Finish workout' }).click()
})
