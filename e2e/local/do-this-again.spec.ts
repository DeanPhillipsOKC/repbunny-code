import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Issue #536: Home offers "Do this again" for the most recent freeform
// workout. It opens a new freeform workout with the same exercises in order
// and one open row per set logged, and creates no routine.
test('Do this again repeats the last freeform workout without making a routine', async ({ page, stamp }) => {
  const first = `E2E Again A ${stamp}`
  const second = `E2E Again B ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert([
        { user_id: userId, name: first },
        { user_id: userId, name: second },
      ])
    },
  })

  await goTo(page, 'Home')
  await expect(page.getByRole('button', { name: 'Do this again' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Freeform' }).click()

  async function logSet(name: string, inDeck: boolean) {
    await selectExercise(page, name, inDeck)
    await page.getByLabel('Reps').first().fill('8')
    await page.getByLabel('Weight').first().fill('50')
    await page.getByRole('button', { name: 'Add set', exact: true }).first().click()
    await dismissCelebrationIfShown(page)
  }
  await logSet(first, false)
  await logSet(second, false)
  await selectExercise(page, first, true)
  await page.getByLabel('Reps').first().fill('8')
  await page.getByLabel('Weight').first().fill('50')
  await page.getByRole('button', { name: 'Add set', exact: true }).first().click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Home')
  const again = page.getByRole('button', { name: /Do this again/ })
  await expect(again).toContainText(first)
  await again.click()

  await expect(page.getByRole('button', { name: first, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: second, exact: true })).toBeVisible()
  // First exercise had 2 sets logged: two open rows, prefilled from last time.
  await expect(page.getByLabel('Reps')).toHaveCount(2)
  await expect(page.getByLabel('Reps').first()).toHaveValue('8')
  await page.getByRole('button', { name: second, exact: true }).click()
  await expect(page.getByLabel('Reps')).toHaveCount(1)

  const { data: templates } = await admin.from('workout_templates').select('id')
  expect(templates ?? []).toHaveLength(0)
})
