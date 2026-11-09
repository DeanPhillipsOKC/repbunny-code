import { test, expect, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise, pickMuscleGroup, openNewExerciseSheet } from '../fixtures/exercise'
import { createTemplateViaUi } from '../fixtures/template'

// Covers docs/backlog.md item 76: exercises can be typed 'level' instead of
// 'weight' — the set form swaps weight+unit for a whole-number level field,
// and every place a set is rendered says "reps × Level N" instead of
// "reps × 0 lb" (a level set's weight column is always 0).
test('level exercise: create, log a set by level instead of weight, and render it as a level', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Leg Press Machine ${stamp}`

  await startLocal(page)

  await goTo(page, 'Exercises')
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(exerciseName)
  await page.getByRole('button', { name: 'Level' }).click()
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(exerciseName)).toBeVisible()

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  // The set form for a level exercise offers a "Level" field instead of
  // "Weight" — no unit toggle either, since a level has no lb/kg.
  await expect(page.getByLabel('Weight')).not.toBeVisible()
  await expect(page.getByRole('group', { name: 'Units' })).not.toBeVisible()
  await page.getByLabel('Reps').fill('12')
  await page.getByLabel('Level', { exact: true }).fill('3')
  await page.getByRole('button', { name: 'Add set' }).click()
  // First-ever set for this brand-new exercise is also an all-time best.
  await dismissCelebrationIfShown(page)

  const row = page.locator('.set-row-logged').first()
  await expect(row).toContainText('12 × Level 3')
  await expect(row).not.toContainText('0lb')

  // Editing it (item 103: in the set card) stays on the level field, not
  // weight, with no per-set lb/kg either.
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  const editingRow = page.locator('.set-row-editing')
  await expect(editingRow.getByLabel('Weight')).not.toBeVisible()
  await expect(editingRow.getByRole('group', { name: 'Units for set 1' })).not.toBeVisible()
  await editingRow.getByLabel('Level', { exact: true }).fill('4')
  await editingRow.getByRole('button', { name: 'Save set 1' }).click()
  await expect(row).toContainText('12 × Level 4')

  await page.getByRole('button', { name: 'Finish workout' }).click()

  // Exercise history detail shows a "Best level" summary, not a weight one.
  await goTo(page, 'Exercises')
  const exerciseRow = page.locator('.row-wrap', { hasText: exerciseName })
  await exerciseRow.getByRole('button', { name: 'View exercise history' }).click()
  await expect(page.getByText('Best level')).toBeVisible()
  await expect(page.locator('.summary-card').getByText('Level 4 × 12')).toBeVisible()
  await expect(page.getByText('Heaviest completed set')).not.toBeVisible()
})

// Covers the other half of item 76: level exercises are excluded from
// volume entirely (not counted as 0) -- so a template mixing a weight
// exercise with a level exercise shows the same post-finish volume (item
// 106's recap) as if the level exercise weren't there at all.
test('level exercise: excluded from post-finish volume entirely, not counted as 0', async ({ page, stamp }) => {
  const weightName = `E2E Bench Press ${stamp}`
  const levelName = `E2E Assisted Dip Machine ${stamp}`
  const templateName = `E2E Push Day ${stamp}`

  await startLocal(page)

  await goTo(page, 'Exercises')
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(weightName)
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(weightName)).toBeVisible()
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(levelName)
  await page.getByRole('button', { name: 'Level' }).click()
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(levelName)).toBeVisible()

  await createTemplateViaUi(page, templateName, [
    { name: weightName, sets: 1 },
    { name: levelName, sets: 1 },
  ])

  // Workout 1: one set each. Weight volume = 10 x 100 = 1000; the level set
  // contributes nothing either way.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, weightName, true)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('100')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await selectExercise(page, levelName, true)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Level', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  // Item 109: that set completes every planned set, so the workout finishes on its own.

  // First-ever completion of this template: the congratulatory card shows
  // instead of a chart (item 70) — nothing to assert on the numbers yet.
  await expect(page.getByText(/First .* logged\./)).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Workout 2: same sets again, so both points should read identically —
  // if the level set were being counted as 0 volume instead of excluded, or
  // its template exercise were wrongly treated as "skipped" and carried
  // forward, the numbers here would still match (both are level, both 0),
  // so the real signal is simply that the level exercise never shows up in
  // the totals at all: both points equal the weight exercise's volume alone.
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, weightName, true)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('100')
  await page.getByRole('button', { name: 'Add set' }).click()
  await selectExercise(page, levelName, true)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Level', { exact: true }).fill('2')
  await page.getByRole('button', { name: 'Add set' }).click()
  // Item 109: that set completes every planned set, so the workout finishes on its own.

  // Item 106: both sessions' volume bars equal the weight exercise's volume
  // alone -- the other exercise never counts toward the total.
  const bars = page.getByTestId('recap-volume-bar')
  await expect(bars).toHaveCount(2)
  await expect(bars.nth(0)).toContainText('1,000 lb')
  await expect(bars.nth(1)).toContainText('1,000 lb')
  await expect(page.getByTestId('recap-hero')).toContainText('1,000')

  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()
})
