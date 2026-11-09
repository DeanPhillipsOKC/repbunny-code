import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Issue #495: archiving a routine used to be a one-way door. The Routines
// screen now lists archived routines with a Restore button that brings the
// routine back with its exercises.
test('an archived routine can be restored with its exercises', async ({ page, stamp }) => {
  const templateName = `E2E Restore ${stamp}`
  const exerciseName = `E2E Restore Lift ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select()
        .single()
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select()
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ user_id: userId, template_id: template!.id, exercise_id: exercise!.id, position: 0 })
    },
  })

  await goTo(page, 'Routines')
  await expect(page.getByRole('heading', { name: 'Archived routines' })).toHaveCount(0)

  const row = page.locator('.row-wrap').filter({ hasText: templateName })
  await row.getByRole('button', { name: 'Archive' }).click()
  await page.getByRole('button', { name: 'Confirm archive' }).click()

  const archived = page.locator('.archived')
  await expect(archived.getByRole('heading', { name: 'Archived routines' })).toBeVisible()
  await expect(archived.getByText(templateName)).toBeVisible()

  await archived.getByRole('button', { name: `Restore ${templateName}` }).click()
  await expect(page.locator('.archived')).toHaveCount(0)
  await expect(page.locator('.row-wrap').filter({ hasText: templateName })).toBeVisible()

  await page.locator('.row-wrap').filter({ hasText: templateName }).locator('.row').click()
  await expect(page.getByText(exerciseName)).toBeVisible()
})
