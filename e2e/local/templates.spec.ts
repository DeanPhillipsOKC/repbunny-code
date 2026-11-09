import { test, expect, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup, openNewExerciseSheet } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'

// Covers docs/backlog.md item 2 (workout templates): create a template,
// attach an exercise to it, start a workout against it, and confirm the
// template surfaces as a suggestion during logging and as a tag in history.
test('templates: create, log a workout against one, and see it in history', async ({ page, stamp }) => {
  const exerciseName = `E2E Bench ${stamp}`
  const templateName = `E2E Push Day ${stamp}`

  await startLocal(page)

  await goTo(page, 'Exercises')
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(exerciseName)
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(exerciseName)).toBeVisible()

  await goTo(page, 'Routines')

  // Backlog item 54: the create form opens on demand behind an "Add
  // template" trigger rather than sitting permanently above the list.
  await expect(page.getByLabel('Name')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add routine' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByLabel('Name')).toHaveCount(0)

  // Issue #6: naming a template ("Next") goes straight into its editor with
  // the Add exercise sheet open; a pick lands at 3 sets.
  await page.getByRole('button', { name: 'Add routine' }).click()
  await page.getByLabel('Name').fill(templateName)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: templateName })).toBeVisible()

  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByPlaceholder('Search exercises').fill(exerciseName)
  await sheet.getByRole('button', { name: exerciseName, exact: true }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
  const card = page.locator('.ex-card', { hasText: exerciseName })
  await expect(card.locator('.sets-value b')).toHaveText('3')

  // Backlog item 75: the list's count used to stay stuck at the stale
  // cached aggregate from fetchTemplates() instead of tracking the exercise
  // just added in this same session.
  await page.getByRole('button', { name: 'Back to routines' }).click()
  const templateRow = page.locator('.row-wrap', { hasText: templateName })
  await expect(templateRow.locator('.row-sub')).toHaveText(/^1 exercise ·/)

  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()

  const chip = page.getByRole('button', { name: exerciseName, exact: true })
  await expect(chip).toBeVisible()
  await chip.click()

  const firstSetRow = page.locator('.set-row-draft').first()
  await firstSetRow.getByLabel('Reps').fill('5')
  await firstSetRow.getByLabel('Weight').fill('135')
  await firstSetRow.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toBeVisible()

  await page.getByRole('button', { name: 'Finish workout' }).click()
  // Only 1 of the template's 3 planned sets was logged, so item 5's
  // finish-early confirm dialog appears; finish anyway.
  await page.getByRole('dialog', { name: 'Finish now?' }).getByRole('button', { name: 'Finish anyway' }).click()

  await goTo(page, 'Workout log')
  await expect(page.locator('.template-tag').first()).toHaveText(templateName)
})
