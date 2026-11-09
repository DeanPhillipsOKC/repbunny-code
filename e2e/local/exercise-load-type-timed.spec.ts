import { test, expect, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise, pickMuscleGroup, openNewExerciseSheet } from '../fixtures/exercise'
import { createTemplateViaUi } from '../fixtures/template'

// Covers docs/backlog.md item 93: a fifth load type, 'timed', for exercises
// like planks and treadmill work that record a duration instead of reps and
// weight, plus optional per-exercise distance/incline/level tracking. Plank
// tracks nothing besides time (the logger should show only Time and RPE);
// Treadmill tracks distance and incline (Time + Distance on one line,
// Incline + RPE on a second, per the item's "wraps only when it doesn't
// fit" decision).
//
// Also covers item 97: the distance unit control lives in a small chip
// beside the Distance value, never in a header button group. And the
// larger-logging redesign (2026-09-28): the shared single-line header now
// only survives when nothing besides time is tracked (Plank) -- with the
// bigger fields, any tracked extra (distance-only Stationary bike, or
// Treadmill's distance + incline) stacks the row one field per line
// instead.
test('timed exercise: create with tracking checkboxes, log/edit duration+distance+incline, no PR celebration', async ({
  page,
  stamp,
}) => {
  const plankName = `E2E Plank ${stamp}`
  const bikeName = `E2E Stationary Bike ${stamp}`
  const treadmillName = `E2E Treadmill ${stamp}`

  await startLocal(page)

  await goTo(page, 'Exercises')

  // Plank: Timed, nothing else tracked.
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(plankName)
  await page.getByRole('button', { name: 'Timed' }).click()
  await expect(page.getByRole('checkbox', { name: 'Distance' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Incline' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Level' })).not.toBeChecked()
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(plankName)).toBeVisible()

  // Stationary bike: Timed + Distance only (1 tracked extra).
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(bikeName)
  await page.getByRole('button', { name: 'Timed' }).click()
  await page.getByRole('checkbox', { name: 'Distance' }).check()
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(bikeName)).toBeVisible()

  // Treadmill: Timed + Distance + Incline (2 tracked extras).
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(treadmillName)
  await page.getByRole('button', { name: 'Timed' }).click()
  await page.getByRole('checkbox', { name: 'Distance' }).check()
  await page.getByRole('checkbox', { name: 'Incline' }).check()
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(treadmillName)).toBeVisible()

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, plankName, false)

  // Plank's set form has no Weight/Reps/Level fields, and only Time + RPE,
  // still on the compact single-line grid with its shared header (0 tracked
  // extras).
  await expect(page.getByLabel('Weight')).not.toBeVisible()
  await expect(page.getByLabel('Reps')).not.toBeVisible()
  await expect(page.locator('.set-header-row')).toBeVisible()
  await expect(page.getByLabel('Time, minutes and seconds')).toBeVisible()
  await expect(page.getByLabel('Distance', { exact: true })).not.toBeVisible()
  await expect(page.getByLabel('Incline', { exact: true })).not.toBeVisible()

  // Typed as bare digits -- the colon fills in automatically.
  await page.getByLabel('Time, minutes and seconds').fill('130')
  await expect(page.getByLabel('Time, minutes and seconds')).toHaveValue('1:30')
  await page.getByRole('button', { name: 'Add set' }).click()

  // No record celebration for a timed set (item 93 decision).
  await expect(page.locator('.celebration-overlay')).not.toBeVisible()
  await expect(page.locator('.set-row-logged').first()).toContainText('1:30')

  await selectExercise(page, bikeName, false)

  // Bike tracks only distance (1 extra) -- the stacked, labeled layout, with
  // the mi/km control a chip beside the Distance value rather than a button
  // group in the header.
  await expect(page.locator('.set-header-row')).not.toBeVisible()
  await expect(page.locator('.set-row-draft .set-field-inline-label', { hasText: 'Distance' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Distance units' })).not.toBeVisible()
  const bikeUnitChip = page.getByRole('button', { name: 'Switch to kilometers' })
  await expect(bikeUnitChip).toBeVisible()
  await page.getByLabel('Time, minutes and seconds').fill('3000')
  await page.getByLabel('Distance', { exact: true }).fill('8.2')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.set-row-logged').first()).toContainText('30:00 · 8.2 mi')

  await selectExercise(page, treadmillName, false)

  // Treadmill tracks distance and incline (2 extras) -- same stacked layout,
  // a label on every field; it doesn't track level, so no Level field.
  await expect(page.locator('.set-header-row')).not.toBeVisible()
  await expect(page.getByRole('group', { name: 'Distance units' })).not.toBeVisible()
  await expect(page.getByLabel('Level')).not.toBeVisible()

  // Item 101: one labeled grid, not item 97's mixed two-line layout -- every
  // field (Time, Dist, Incline, RPE) gets its own visible label, all in a
  // single grid (no separate `.set-row-line-secondary`).
  const draftRow = page.locator('.set-row-draft')
  await expect(draftRow.locator('.set-field-inline-label', { hasText: 'Time' })).toBeVisible()
  await expect(draftRow.locator('.set-field-inline-label', { hasText: 'Distance' })).toBeVisible()
  await expect(draftRow.locator('.set-field-inline-label', { hasText: 'Incline' })).toBeVisible()
  await expect(draftRow.locator('.set-field-inline-label', { hasText: 'RPE' })).toBeVisible()
  await expect(draftRow.locator('.set-row-line-secondary')).toHaveCount(0)

  // Follow-up: one field per line, label left of its input, mi/km chip after
  // the Distance input -- every input starts at the same x, and each label
  // sits on its input's line.
  // Measure only once the exercise-switch slide has finished (both the
  // outgoing and incoming set panels exist mid-transition, moving).
  await expect(page.locator('.set-rows-panel')).toHaveCount(1)
  await page.waitForTimeout(400)
  const inputBoxes = await draftRow.locator('.set-grid-fields input').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, top: r.top, bottom: r.bottom })),
  )
  expect(inputBoxes).toHaveLength(4)
  for (const box of inputBoxes) expect(Math.abs(box.left - inputBoxes[0].left)).toBeLessThan(1)
  for (let i = 1; i < inputBoxes.length; i++) expect(inputBoxes[i].top).toBeGreaterThanOrEqual(inputBoxes[i - 1].bottom)
  const distInput = await page.getByLabel('Distance', { exact: true }).boundingBox()
  const chip = await page.getByRole('button', { name: 'Switch to kilometers' }).boundingBox()
  expect(chip!.x).toBeGreaterThan(distInput!.x + distInput!.width - 1)
  expect(Math.abs(chip!.y + chip!.height / 2 - (distInput!.y + distInput!.height / 2))).toBeLessThan(4)

  await page.getByLabel('Time, minutes and seconds').fill('2000')
  await page.getByLabel('Distance', { exact: true }).fill('2.1')
  await page.getByLabel('Incline', { exact: true }).fill('0')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.celebration-overlay')).not.toBeVisible()
  await expect(page.locator('.set-row-logged').first()).toContainText('20:00 · 2.1 mi · Incline 0')

  // Switching the unit (now a chip, not a header button group) applies to
  // the next row logged for this exercise.
  await page.getByRole('button', { name: 'Switch to kilometers' }).click()
  await page.getByLabel('Time, minutes and seconds').fill('500')
  await page.getByLabel('Distance', { exact: true }).fill('1.6')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.set-row-logged').nth(1)).toContainText('5:00 · 1.6 km')

  // Item 103: editing a logged Treadmill set in the set card uses the same
  // stacked, labeled layout as the entry row, prefilled from the set -- in
  // the set's own unit (mi), not the card's current km -- and round-trips
  // time, distance, and incline.
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  const editingRow = page.locator('.set-row-editing')
  await expect(editingRow).toHaveClass(/set-row-stacked/)
  await expect(editingRow.getByLabel('Time, minutes and seconds')).toHaveValue('20:00')
  await expect(editingRow.getByLabel('Distance', { exact: true })).toHaveValue('2.1')
  await expect(editingRow.getByLabel('Incline', { exact: true })).toHaveValue('0')
  await expect(editingRow.getByRole('button', { name: 'Switch to kilometers' })).toBeVisible()
  await editingRow.getByLabel('Time, minutes and seconds').fill('2100')
  await editingRow.getByLabel('Distance', { exact: true }).fill('2.3')
  await editingRow.getByLabel('Incline', { exact: true }).fill('1')
  await editingRow.getByRole('button', { name: 'Save set 1' }).click()
  await expect(editingRow).toHaveCount(0)
  await expect(page.locator('.set-row-logged').first()).toContainText('21:00 · 2.3 mi · Incline 1')

  await page.getByRole('button', { name: 'Finish workout' }).click()

  // History shows the same labels, and editing one round-trips. Issue #66:
  // sets sit under their exercise's heading, so find the row through it.
  await goTo(page, 'Workout log')
  const plankRow = page.locator('.exercise-group', { hasText: plankName }).locator('li.row-wrap')
  await expect(plankRow).toContainText('1:30')
  await plankRow.getByRole('button', { name: 'Edit' }).click()
  await expect(plankRow.getByLabel('Distance', { exact: true })).not.toBeVisible()
  await expect(plankRow.getByLabel('Incline', { exact: true })).not.toBeVisible()
  await plankRow.locator('input[placeholder="0:00"]').fill('145')
  await plankRow.getByRole('button', { name: 'Save' }).click()
  await expect(plankRow).toContainText('1:45')

  const treadmillFirstRow = page.locator('li.row-wrap', { hasText: '2.3 mi' })
  await expect(treadmillFirstRow).toContainText('21:00 · 2.3 mi · Incline 1')
  await treadmillFirstRow.getByRole('button', { name: 'Edit' }).click()
  await treadmillFirstRow.getByLabel('Incline', { exact: true }).fill('3')
  await treadmillFirstRow.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('li.row-wrap', { hasText: '2.3 mi' })).toContainText('21:00 · 2.3 mi · Incline 3')
})

// Covers item 98: a timed exercise can also track Calories, following the
// same tracked-field-count layout rule as item 97 -- a Rowing Machine that
// tracks only Calories (1 extra) gets the stacked, labeled layout, same as
// any other single-extra timed exercise, and a Treadmill with Calories
// turned on alongside Distance/Incline (3 extras) uses the same stacked
// layout with Calories as one more line. Calories has no unit toggle and is
// appended last in the set label.
test('timed exercise: also track Calories', async ({ page, stamp }) => {
  const rowingName = `E2E Rowing Machine ${stamp}`
  const treadmillName = `E2E Treadmill Cal ${stamp}`

  await startLocal(page)
  await goTo(page, 'Exercises')

  // Rowing Machine: Timed + Calories only (1 tracked extra).
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(rowingName)
  await page.getByRole('button', { name: 'Timed' }).click()
  await expect(page.getByRole('checkbox', { name: 'Calories' })).not.toBeChecked()
  await page.getByRole('checkbox', { name: 'Calories' }).check()
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(rowingName)).toBeVisible()

  // Treadmill + Calories: Timed + Distance + Incline + Calories (3 extras),
  // staying editable after sets exist just like the other three.
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(treadmillName)
  await page.getByRole('button', { name: 'Timed' }).click()
  await page.getByRole('checkbox', { name: 'Distance' }).check()
  await page.getByRole('checkbox', { name: 'Incline' }).check()
  await page.getByRole('checkbox', { name: 'Calories' }).check()
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(treadmillName)).toBeVisible()

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, rowingName, false)
  await expect(page.locator('.set-rows-panel')).toHaveCount(1)

  // Rowing Machine tracks only calories (1 extra) -- the stacked, labeled
  // layout, not the compact single-line header.
  await expect(page.locator('.set-header-row')).not.toBeVisible()
  await expect(page.locator('.set-row-draft .set-field-inline-label', { hasText: 'Calories' })).toBeVisible()
  await page.getByLabel('Time, minutes and seconds').fill('2000')
  await page.getByLabel('Calories', { exact: true }).fill('210')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.celebration-overlay')).not.toBeVisible()
  await expect(page.locator('.set-row-logged').first()).toContainText('20:00 · 210 cal')

  await selectExercise(page, treadmillName, false)
  await expect(page.locator('.set-rows-panel')).toHaveCount(1)

  // Treadmill + Calories (3 extras) -- same stacked layout, Calories as one
  // more labeled line alongside Distance and Incline.
  await expect(page.locator('.set-header-row')).not.toBeVisible()
  const draftRow = page.locator('.set-row-draft')
  await expect(draftRow.locator('.set-field-inline-label', { hasText: 'Calories' })).toBeVisible()
  await page.getByLabel('Time, minutes and seconds').fill('2000')
  await page.getByLabel('Distance', { exact: true }).fill('2.1')
  await page.getByLabel('Incline', { exact: true }).fill('2')
  await page.getByLabel('Calories', { exact: true }).fill('250')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.set-row-logged').first()).toContainText('20:00 · 2.1 mi · Incline 2 · 250 cal')

  await page.getByRole('button', { name: 'Finish workout' }).click()

  // History shows the same label, and editing the calorie value round-trips
  // (the row is found through its exercise heading, issue #66).
  await goTo(page, 'Workout log')
  const rowingRow = page.locator('.exercise-group', { hasText: rowingName }).locator('li.row-wrap')
  await expect(rowingRow).toContainText('20:00 · 210 cal')
  await rowingRow.getByRole('button', { name: 'Edit' }).click()
  await rowingRow.getByLabel('Calories', { exact: true }).fill('225')
  await rowingRow.getByRole('button', { name: 'Save' }).click()
  await expect(rowingRow).toContainText('20:00 · 225 cal')
})

// Covers the other half of item 93: timed exercises are excluded from
// volume entirely (not counted as 0), same rule as 'level' (item 76) --
// a template mixing a weight exercise with a timed one shows the same
// post-finish volume (item 106's recap) as if the timed one weren't there.
test('timed exercise: excluded from post-finish volume entirely, not counted as 0', async ({ page, stamp }) => {
  const weightName = `E2E Bench Press Timed ${stamp}`
  const timedName = `E2E Plank Volume ${stamp}`
  const templateName = `E2E Cardio Core Day ${stamp}`

  await startLocal(page)

  await goTo(page, 'Exercises')
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(weightName)
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(weightName)).toBeVisible()
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(timedName)
  await page.getByRole('button', { name: 'Timed' }).click()
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByText(timedName)).toBeVisible()

  await createTemplateViaUi(page, templateName, [
    { name: weightName, sets: 1 },
    { name: timedName, sets: 1 },
  ])

  // Workout 1: one set each. Weight volume = 10 x 100 = 1000; the timed set
  // contributes nothing either way.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, weightName, true)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('100')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await selectExercise(page, timedName, true)
  await page.getByLabel('Time, minutes and seconds').fill('100')
  await page.getByRole('button', { name: 'Add set' }).click()
  // Item 109: that set completes every planned set, so the workout finishes on its own.

  // First-ever completion of this template: the congratulatory card shows
  // instead of a chart (item 70) — nothing to assert on the numbers yet.
  await expect(page.getByText(/First .* logged\./)).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // Workout 2: same sets again -- both points should read identically, and
  // the real signal is that the timed exercise never shows up in the totals
  // at all: both points equal the weight exercise's volume alone.
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, weightName, true)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('100')
  await page.getByRole('button', { name: 'Add set' }).click()
  await selectExercise(page, timedName, true)
  await page.getByLabel('Time, minutes and seconds').fill('100')
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
