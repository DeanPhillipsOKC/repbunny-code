import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { selectExercise, openEditExerciseSheet } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'

// Issue #851: merging duplicate library entries removed their ids, but
// exercises.library_id can still name one (native on-device data, or an
// account the one-off SQL missed). Such an exercise keeps working as a
// custom one: it opens, logs, shows history, and its Library match row
// treats it as unlinked.

test('an exercise linked to a removed library id still opens, logs, and shows history', async ({ page }) => {
  // Close to Dumbbell Curl, so an unlinked exercise gets a suggestion.
  const name = 'Alt DB Curls'
  await startLocal(page, {
    beforeNavigate: async (id) => {
      const admin = localDb(page)
      const { data: exercise, error } = await admin
        .from('exercises')
        .insert({ user_id: id, name, muscle_group: 'arms', load_type: 'weight', library_id: 'alternating_dumbbell_curl' })
        .select('id')
        .single()
      if (error) throw new Error(error.message)
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: id, performed_at: new Date(Date.now() - 3 * 86400000).toISOString() })
        .select('id')
        .single()
      await admin.from('sets').insert({ workout_id: workout!.id, exercise_id: exercise!.id, set_index: 0, reps: 10, weight: 30, weight_unit: 'lb' })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('35')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged').first()).toContainText('8 × 35')
  await page.getByRole('button', { name: 'Finish workout' }).click()

  await goTo(page, 'Exercises')
  await page.locator('.row-wrap', { hasText: name }).getByRole('button', { name: 'View exercise history' }).click()
  const overlay = page.getByRole('dialog', { name: `${name} history` })
  await expect(overlay.getByRole('heading', { name })).toBeVisible()
  await expect(overlay.getByText('Best: 35 lb × 8 on')).toBeVisible()
  await overlay.getByRole('button', { name: 'Close' }).first().click()

  // Unlinked, so the row suggests a real entry to link instead.
  const sheet = await openEditExerciseSheet(page, name)
  const field = sheet.getByRole('group', { name: 'Library match' })
  await expect(field.getByTestId('library-link-status')).toHaveText('Not linked')
  await expect(field.getByRole('button', { name: 'Link to library' })).toBeVisible()
  await expect(field.getByRole('button', { name: 'Unlink' })).toHaveCount(0)
  await expect(field).toContainText('Looks like')
})

test('library: a merged entry is found by its old name, and common short names find their entry', async ({ page }) => {
  await startLocal(page)
  await goTo(page, 'Exercises')
  await page.getByRole('group', { name: 'Exercises view' }).getByRole('button', { name: 'Library' }).click()

  const search = page.getByRole('searchbox', { name: 'Search the library' })
  const cases: [string, string][] = [
    ['Alternating Dumbbell Curl', 'Dumbbell Curl'],
    ['Seated Overhead Tricep Extension', 'Overhead Tricep Extension'],
    ['Barbell Wrist Curl', 'Wrist Curl'],
    ['OHP', 'Overhead Press'],
    ['RFESS', 'Bulgarian Split Squat'],
    ['Pec Dec', 'Pec Deck'],
  ]
  for (const [query, name] of cases) {
    await search.fill(query)
    await expect(page.getByRole('button', { name: `View ${name}`, exact: true })).toBeVisible()
  }
})
