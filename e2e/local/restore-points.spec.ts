import { test, expect, localDb, startLocal } from '../fixtures/local'
import { openAccountSection } from '../fixtures/account'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Issue #430: local mode saves a restore point after every finished workout
// (and before an update or a restore; e2e/migration-safety-unit.spec.ts
// covers the update one and the limit of 10). Account > Your data >
// Restore points lists them, and one goes through the usual restore preview.

test('a finished workout leaves a restore point that brings the data back', async ({ page, stamp }) => {
  const exerciseName = `E2E Point Press ${stamp}`
  const templateName = `E2E Point Day ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async () => {
      const { data: exercise, error } = await admin.from('exercises').insert({ name: exerciseName }).select('id').single()
      if (error) throw error
      const { data: template, error: templateError } = await admin.from('workout_templates').insert({ name: templateName }).select('id').single()
      if (templateError) throw templateError
      const { error: linkError } = await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: exercise!.id, position: 0 })
      if (linkError) throw linkError
    },
  })

  // Nothing saved yet.
  let data = await openAccountSection(page, 'Your data')
  await data.getByRole('button', { name: /^Restore points/ }).click()
  let points = page.getByRole('dialog', { name: 'Restore points' })
  await expect(points.getByText('No restore points yet.')).toBeVisible()
  await points.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, exerciseName, true)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()

  data = await openAccountSection(page, 'Your data')
  await data.getByRole('button', { name: /^Restore points/ }).click()
  points = page.getByRole('dialog', { name: 'Restore points' })
  const afterWorkout = points.getByRole('button', { name: new RegExp(`After ${templateName}`) })
  await expect(afterWorkout).toContainText('1 workout')
  await points.getByRole('button', { name: 'Close' }).click()

  // Lose everything, then bring it back from the restore point.
  await (await openAccountSection(page, 'Reset & erase')).getByRole('button', { name: 'Reset my data' }).click()
  const reset = page.getByRole('dialog', { name: 'Reset your data?' })
  await reset.getByLabel('Type RESET to confirm').fill('RESET')
  await reset.getByRole('button', { name: 'Reset my data' }).click()
  await expect(reset).toHaveCount(0)

  data = await openAccountSection(page, 'Your data')
  await data.getByRole('button', { name: /^Restore points/ }).click()
  await page.getByRole('dialog', { name: 'Restore points' }).getByRole('button', { name: new RegExp(`After ${templateName}`) }).click()
  const preview = page.getByRole('dialog', { name: 'Restore this backup?' })
  await expect(preview).toContainText(`After ${templateName}`)
  const replace = preview.getByRole('button', { name: 'Replace with this backup' })
  await expect(replace).toBeDisabled()
  await preview.getByLabel('Type RESTORE to confirm').fill('RESTORE')
  await replace.click()
  const done = page.getByRole('dialog', { name: 'Backup restored' })
  await expect(done).toContainText('1 workout, 1 set')
  await done.getByRole('button', { name: 'Done' }).click()

  // The restore itself can be undone: the empty state was saved first.
  data = await openAccountSection(page, 'Your data')
  await data.getByRole('button', { name: /^Restore points/ }).click()
  points = page.getByRole('dialog', { name: 'Restore points' })
  const rows = points.getByRole('list', { name: 'Saved restore points' }).getByRole('listitem')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Before a restore')
  await expect(rows.first()).toContainText('0 workouts')
  await expect(rows.nth(1)).toContainText(`After ${templateName}`)
})
