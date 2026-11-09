import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { goTo } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'

test('returning to Home keeps the selected template exercise and its sets', async ({ page, stamp }) => {
  const first = `E2E Return Bench ${stamp}`
  const second = `E2E Return Row ${stamp}`
  const template = `E2E Return Day ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercises } = await admin.from('exercises')
        .insert([{ user_id: userId, name: first }, { user_id: userId, name: second }])
        .select('id, name')
      const { data: workoutTemplate } = await admin.from('workout_templates')
        .insert({ user_id: userId, name: template }).select('id').single()
      await admin.from('workout_template_exercises').insert([
        { template_id: workoutTemplate!.id, exercise_id: exercises!.find((e) => e.name === first)!.id, position: 0 },
        { template_id: workoutTemplate!.id, exercise_id: exercises!.find((e) => e.name === second)!.id, position: 1 },
      ])
    },
  })

  await page.getByRole('button', { name: template, exact: true }).click()
  const secondDot = page.getByRole('button', { name: second, exact: true })
  await secondDot.click()
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('90')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged', { hasText: '8 × 90 lb' })).toBeVisible()

  for (const view of ['Exercises', 'Workout log'] as const) {
    await goTo(page, view)
    await goTo(page, 'Home')
    await expect(page.locator('.exercise-card-name')).toHaveText(second)
    await expect(page.locator('.exercise-card-position')).toHaveText('2 / 2')
    await expect(secondDot).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.set-row-logged', { hasText: '8 × 90 lb' })).toBeVisible()
    await expect(page.getByLabel('Reps')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add set' })).toBeVisible()
  }
})

test('returning to Home keeps a freeform exercise before its first set', async ({ page, stamp }) => {
  const name = `E2E Return Freeform ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await expect(page.locator('.exercise-card-name')).toHaveText(name)
  await goTo(page, 'Exercises')
  await goTo(page, 'Home')
  await expect(page.locator('.exercise-card-name')).toHaveText(name)
  await expect(page.locator('.exercise-card-position')).toHaveText('1 / 1')
  await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Reps')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add set' })).toBeVisible()
})
