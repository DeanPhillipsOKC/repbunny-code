import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { closeAddExerciseSheet } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'

// Issue #850: 35 hand-written entries (gym, home, class, and military PT
// research) and aliases on existing entries, including machine brand names.

test('library: the #850 additions are found by the names people type', async ({ page }) => {
  await startLocal(page)
  await goTo(page, 'Exercises')
  await page.getByRole('group', { name: 'Exercises view' }).getByRole('button', { name: 'Library' }).click()

  const search = page.getByRole('searchbox', { name: 'Search the library' })
  const cases: [string, string][] = [
    ['Scrunch', 'Ab Glider Machine'],
    ['Ab Sled', 'Ab Glider Machine'],
    ['Assault Bike', 'Air Bike'],
    ['Side-Straddle Hop', 'Jumping Jack'],
    ['Hammer Strength Row', 'Iso-Lateral Row Machine'],
    ['Hammer Strength Chest Press', 'Chest Press Machine'],
    ['Burpees', 'Burpee'],
    ['Single Leg Press', 'Single-Leg Leg Press'],
  ]
  for (const [query, name] of cases) {
    await search.fill(query)
    await expect(page.getByRole('button', { name: `View ${name}`, exact: true })).toBeVisible()
  }
})

test('library: Ab Glider Machine logs by level, with no weight field', async ({ page, stamp }) => {
  await startLocal(page, {
    beforeNavigate: async (id) => {
      // So the account isn't empty (an empty one shows the first-run state).
      const { error } = await localDb(page)
        .from('exercises')
        .insert({ user_id: id, name: `E2E Glider ${stamp}`, muscle_group: 'chest' })
      if (error) throw new Error(error.message)
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByPlaceholder('Search exercises').fill('ab sled')
  await sheet.getByRole('button', { name: 'Add Ab Glider Machine' }).click()
  await closeAddExerciseSheet(page)
  await expect(page.locator('.exercise-card-name')).toHaveText('Ab Glider Machine')

  await expect(page.getByLabel('Weight')).not.toBeVisible()
  await page.getByLabel('Reps').fill('15')
  await page.getByLabel('Level', { exact: true }).fill('4')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged').first()).toContainText('15 × Level 4')
})
