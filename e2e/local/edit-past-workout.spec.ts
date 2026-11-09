import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 32: fix a wrong rep/weight/RPE entry, remove a
// set, or edit the notes on a workout that's already finished, without
// having to delete the whole thing (item 31) and re-log it. Scoped to sets
// that already exist on the workout — adding a brand-new set to a finished
// workout is out of scope for this item.
test('edit notes and a set, and delete a set, on a past workout in History', async ({ page, stamp }) => {
  const exerciseName = `E2E Edit Past Workout ${stamp}`
  const notes = `E2E edit-past-workout ${stamp}`
  const updatedNotes = `${notes} (fixed)`

  const admin = localDb(page)
  await page.setViewportSize({ width: 375, height: 800 })

  // The exercise is pre-existing state this test logs sets against, not
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

  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('135')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  await page.getByRole('button', { name: 'Finish workout' }).click()
  // Item 111: notes are written on the post-finish recap now.
  await page.getByLabel('Notes (optional)').fill(notes)
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Workout log')
  // exerciseName is unique to this test run and untouched by the notes edit
  // below, so it stays a stable way to find this workout's card throughout.
  const card = page.locator('.card', { hasText: exerciseName })
  await expect(card).toBeVisible()
  await expect(card.getByText(notes, { exact: true })).toBeVisible()

  // Fix a wrong note.
  await card.getByRole('button', { name: 'Edit notes' }).click()
  await card.getByLabel('Notes').fill(updatedNotes)
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByText(updatedNotes, { exact: true })).toBeVisible()
  await expect(card.getByText(notes, { exact: true })).toHaveCount(0)

  // Issue #66: both sets sit under one exercise heading (the name once, not
  // per set), with no per-set Edit/Delete buttons until a line is tapped.
  await expect(card.locator('.exercise-group')).toHaveCount(1)
  await expect(card.getByText(exerciseName, { exact: true })).toHaveCount(1)
  await expect(card.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Delete set' })).toHaveCount(0)

  // Each set line is a full-width tap target that fits a phone.
  const cardBox = (await card.boundingBox())!
  for (const line of await card.locator('.set-line').all()) {
    const box = (await line.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  // Fix a fat-fingered entry on the first set (set_index 0, so the first
  // row in list order) — re-locate by position rather than by its old
  // reps/weight text, since that text is exactly what this edit changes.
  const firstSetRow = card.locator('li.row-wrap').first()
  await expect(firstSetRow).toContainText('10 × 45 lb')
  await firstSetRow.getByRole('button', { name: 'Edit' }).click()
  await firstSetRow.getByLabel('Reps').fill('12')
  await firstSetRow.getByLabel('Weight').fill('50')
  await firstSetRow.getByRole('button', { name: 'Save' }).click()
  await expect(firstSetRow).toContainText('12 × 50 lb')

  // Editing again then cancelling should discard the draft.
  await firstSetRow.getByRole('button', { name: 'Edit' }).click()
  await firstSetRow.getByLabel('Reps').fill('99')
  await firstSetRow.getByRole('button', { name: 'Cancel' }).click()
  await expect(firstSetRow).toContainText('12 × 50 lb')

  // Tapping an open set's line again closes its editor.
  await firstSetRow.getByRole('button', { name: 'Edit' }).click()
  await expect(firstSetRow.getByLabel('Reps')).toBeVisible()
  await firstSetRow.getByRole('button', { name: 'Edit' }).click()
  await expect(firstSetRow.getByLabel('Reps')).toHaveCount(0)

  // Remove the second set logged in error — the workout itself (and its
  // other set) should still be there afterward, unlike deleting the whole
  // workout (item 31). Issue #66: Delete lives inside the set's edit state.
  const secondSetRow = card.locator('li.row-wrap').nth(1)
  await expect(secondSetRow).toContainText('8 × 135 lb')
  await secondSetRow.getByRole('button', { name: 'Edit set 2' }).click()
  await expect(secondSetRow.getByRole('button', { name: 'Edit set 2' })).toHaveAttribute('aria-expanded', 'true')

  // Delete, Cancel and Save sit in one row at the same size, each label
  // fitting without being clipped.
  const actionBoxes = []
  for (const name of ['Delete set', 'Cancel', 'Save']) {
    const button = secondSetRow.getByRole('button', { name, exact: true })
    actionBoxes.push((await button.boundingBox())!)
    expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  }
  for (const box of actionBoxes) {
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(Math.abs(box.height - actionBoxes[0].height)).toBeLessThan(1)
    expect(Math.abs(box.width - actionBoxes[0].width)).toBeLessThan(1)
    expect(Math.abs(box.y - actionBoxes[0].y)).toBeLessThan(1)
  }
  expect(actionBoxes[0].x).toBeLessThan(actionBoxes[1].x)
  expect(actionBoxes[1].x).toBeLessThan(actionBoxes[2].x)

  await secondSetRow.getByRole('button', { name: 'Delete set' }).click()
  await expect(secondSetRow.getByText("Delete this set? This can't be undone.")).toBeVisible()
  await secondSetRow.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(card.locator('li.row-wrap')).toHaveCount(1)
  await expect(card).toBeVisible()
  await expect(firstSetRow).toContainText('12 × 50 lb')
})
