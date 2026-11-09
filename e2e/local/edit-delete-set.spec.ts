import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md items 13 and 103: fix or remove a set logged in
// error while a workout is still in progress, right on the logged row in the
// set card (its pencil turns it back into inputs), without having to finish
// and re-log.
test('edit and delete a set in an active workout from its row in the set card', async ({ page, stamp }) => {
  const exerciseName = `E2E Overhead Press ${stamp}`

  const admin = localDb(page)

  // The exercise is pre-existing state this test logs a set against, not
  // behavior under test -- seed it directly via the admin client instead of
  // driving the Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  const draftRow = page.locator('.set-row-draft')
  await draftRow.getByLabel('Reps').fill('10')
  await draftRow.getByLabel('Weight').fill('45')
  await draftRow.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await draftRow.getByLabel('Reps').fill('6')
  await draftRow.getByLabel('Weight').fill('65')
  await draftRow.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  const loggedRows = page.locator('.set-row-logged')
  await expect(loggedRows).toHaveCount(2)
  await expect(loggedRows.nth(0)).toContainText('10 × 45 lb')
  await expect(loggedRows.nth(1)).toContainText('6 × 65 lb')

  // Item 103: the workout-wide list of every set that used to sit below the
  // set card is gone.
  await expect(page.locator('li.row-wrap')).toHaveCount(0)

  // Fix a fat-fingered entry on set 1 from its own pencil. The row turns
  // back into the entry inputs, prefilled with the logged values.
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  const editingRow = page.locator('.set-row-editing')
  await expect(editingRow).toHaveCount(1)
  await expect(editingRow.getByLabel('Reps')).toHaveValue('10')
  await expect(editingRow.getByLabel('Weight')).toHaveValue('45')
  await editingRow.getByLabel('Reps').fill('8')
  await editingRow.getByLabel('Weight').fill('50')
  await editingRow.getByRole('button', { name: 'Save set 1' }).click()

  await expect(editingRow).toHaveCount(0)
  await expect(loggedRows).toHaveCount(2)
  await expect(loggedRows.nth(0).locator('.set-logged-weight')).toHaveText('50lb')
  await expect(loggedRows.nth(0).locator('.set-field-reps')).toHaveText('8')

  // Units are per set: switching set 1 to kg while editing it doesn't touch
  // the card's shared lb/kg toggle that new sets use. Issue #57: the switch
  // converts the weight (50 lb is 22.5 kg), it doesn't just relabel it.
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  await editingRow.getByRole('group', { name: 'Units for set 1' }).getByRole('button', { name: 'kg' }).click()
  await editingRow.getByRole('button', { name: 'Save set 1' }).click()
  await expect(loggedRows.nth(0).locator('.set-logged-weight')).toHaveText('22.5kg')
  await expect(page.getByRole('group', { name: 'Units', exact: true }).getByRole('button', { name: 'lb' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Editing again then cancelling discards the change. Only one row edits at
  // a time: opening set 2's editor closes set 1's.
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  await editingRow.getByLabel('Reps').fill('99')
  await editingRow.getByRole('button', { name: 'Cancel' }).click()
  await expect(loggedRows.nth(0).locator('.set-field-reps')).toHaveText('8')
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  await page.getByRole('button', { name: 'Edit set 2' }).click()
  await expect(editingRow).toHaveCount(1)
  await expect(editingRow.getByLabel('Reps')).toHaveValue('6')

  // Remove set 2 -- backlog item 51 requires a confirm step before the
  // delete actually happens.
  await editingRow.getByRole('button', { name: 'Delete set 2' }).click()
  await expect(editingRow.getByText("Delete this set? This can't be undone.")).toBeVisible()
  await editingRow.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(loggedRows).toHaveCount(1)
  await expect(editingRow).toHaveCount(0)
  await expect(loggedRows.nth(0)).toContainText('8 × 22.5 kg')

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: exerciseName })
  await expect(card.locator('li.row-wrap')).toHaveCount(1)
  await expect(card).toContainText('8 × 22.5 kg')
  await expect(card).not.toContainText('6 × 65 lb')
})

// Item 103: the edit row has to fit the same width budget as item 102's entry
// row, including 320px phones.
test('editing a logged set fits a 320px phone without horizontal overflow', async ({ page, stamp }) => {
  const exerciseName = `E2E Narrow Edit ${stamp}`
  const admin = localDb(page)
  await page.setViewportSize({ width: 320, height: 640 })
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  const draftRow = page.locator('.set-row-draft')
  await draftRow.getByLabel('Reps').fill('10')
  await draftRow.getByLabel('Weight').fill('132.5')
  await draftRow.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  const card = page.locator('.set-card')
  const cardBox = (await card.boundingBox())!
  const pencilBox = (await page.getByRole('button', { name: 'Edit set 1' }).boundingBox())!
  expect(pencilBox.width).toBeGreaterThanOrEqual(44)
  expect(pencilBox.x + pencilBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)

  await page.getByRole('button', { name: 'Edit set 1' }).click()
  const editingRow = page.locator('.set-row-editing')
  for (const name of ['Delete set 1', 'Save set 1']) {
    const box = (await editingRow.getByRole('button', { name }).boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})
