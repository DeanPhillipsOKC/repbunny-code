import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #336 on the local-mode (SQLite) path: the same set checks run before
// a save, so 0 reps never reaches SQLite's CHECK constraint and an unlikely
// weight asks first.

const BENCH = 'Barbell Bench Press'

async function startBench(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
}

async function skipRestIfShown(page: Page) {
  const skip = page.getByRole('button', { name: /^Skip rest/ })
  if (await skip.isVisible()) await skip.click()
}

test('local mode: 0 reps is blocked, a huge weight asks first, and edits to 0 reps are blocked', async ({ page }) => {
  await startBench(page)
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Weight').fill('135')
  await row.getByLabel('Reps').fill('0')
  await row.getByRole('button', { name: 'Add set' }).click()
  await expect(row.locator('.row-error')).toHaveText('Reps must be 1 or more.')
  await expect(row.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  await expect(page.locator('.set-row-logged')).toHaveCount(0)

  // No history yet: 999 lb is over the 600 lb line, so it asks.
  await row.getByLabel('Reps').fill('8')
  await row.getByLabel('Weight').fill('999')
  await row.getByRole('button', { name: 'Add set' }).click()
  await expect(row.getByRole('alert')).toContainText(`999 lb is a lot for ${BENCH}. Log it anyway?`)
  await row.getByRole('alert').getByRole('button', { name: 'Fix it' }).click()
  await row.getByLabel('Weight').fill('135')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await skipRestIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)

  await page.getByRole('button', { name: 'Edit set 1' }).click()
  const editingRow = page.locator('.set-row-editing')
  await editingRow.getByLabel('Reps').fill('0')
  await editingRow.getByRole('button', { name: 'Save set 1' }).click()
  await expect(editingRow.locator('.row-error')).toHaveText('Reps must be 1 or more.')
  await expect(editingRow).not.toContainText(/constraint/i)
  await editingRow.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: BENCH }).first()
  await card.getByRole('button', { name: /^Edit set 1,/ }).click()
  await card.getByLabel('Reps').fill('0')
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByText('Reps must be 1 or more.')).toBeVisible()
  await expect(page.getByText(/constraint/i)).toHaveCount(0)
  await card.getByRole('button', { name: 'Cancel' }).click()
  await expect(card).toContainText('8 × 135 lb')
})
