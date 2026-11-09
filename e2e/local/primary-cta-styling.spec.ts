import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// #5 makes Finish secondary; the recap's Done remains the primary action.
test('Finish is outlined while recap Done keeps the accent fill', async ({ page, stamp }) => {
  const exerciseName = `E2E CTA Style ${stamp}`
  const templateName = `E2E CTA Style Template ${stamp}`

  const admin = localDb(page)

  // The exercise and template are pre-existing state this test logs a
  // workout against, not behavior under test -- seed them directly via the
  // admin client instead of driving the Exercises/Templates UI (item 57's
  // pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: exercise!.id, position: 0 })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, exerciseName, true)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('100')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)

  const finishButton = page.getByRole('button', { name: 'Finish workout' })
  await expect(finishButton).not.toHaveClass(/btn-accent/)
  await expect(finishButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(finishButton).toHaveCSS('border-top-style', 'solid')
  await expect(finishButton).not.toHaveClass(/ghost/)
  await finishButton.click()

  const doneButton = page.getByRole('button', { name: 'Done', exact: true })
  await expect(doneButton).toHaveClass(/btn-accent/)
  await expect(doneButton).not.toHaveClass(/ghost/)
})
