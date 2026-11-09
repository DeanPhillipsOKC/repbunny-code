import type { Locator, Page } from '@playwright/test'

// Item 67: exercise selection in the active-workout screen moved from a
// suggested-chip row + <select> dropdown to a swipeable carousel. An
// exercise already in the carousel deck (a templated workout's own
// exercises, or one already added this session) is picked by its dot, which
// carries the exercise's name as its accessible name -- same as the old
// suggested chip did, so `getByRole('button', { name, exact: true })` still
// works unchanged for those. An exercise not yet in the deck (freeform, or
// an ad-hoc addition to a templated workout) is added through the "Add
// exercise" sheet first.
//
// `inDeck`, when the caller already knows the answer, skips the race
// entirely instead of guessing (item 82): a freeform workout's deck always
// starts empty, so callers right after tapping the "Freeform" tile can pass
// `false` and go straight to the sheet with no wait at all; a templated
// workout's own exercise (or one already added earlier this session) is
// already there, so callers can pass `true` and assert it's visible instead
// of racing a fallback. Omit it when the caller genuinely doesn't know --
// this keeps today's guess-then-fall-back behavior.
export async function selectExercise(page: Page, name: string, inDeck?: boolean) {
  if (inDeck === false) {
    await addExerciseViaSheet(page, name)
    return
  }

  const existing = page.getByRole('button', { name, exact: true })
  if (inDeck === true) {
    await existing.waitFor({ state: 'visible' })
    await existing.click()
    return
  }

  // Unknown which case applies -- a templated workout's carousel
  // auto-selects its first exercise as soon as `handleStart`/`handleResume`
  // finish (WorkoutLogger.vue), which can still be in flight right after a
  // workout tile tap resolves, so a plain `.count()` snapshot would
  // race that and wrongly conclude the dot doesn't exist yet. `waitFor`
  // retries instead, same short-timeout-then-fall-back shape as
  // `dismissCelebrationIfShown` (fixtures/celebration.ts).
  try {
    await existing.waitFor({ state: 'visible', timeout: 2000 })
    await existing.click()
    return
  } catch {
    // Not in the deck -- add it through the sheet instead.
  }
  await addExerciseViaSheet(page, name)
}

// Issue #43: the sheet stays open across picks, so close it with the
// floating bar's "Done" (which makes the pick current).
async function addExerciseViaSheet(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByPlaceholder('Search exercises').fill(name)
  await sheet.getByRole('button', { name, exact: true }).click()
  await closeAddExerciseSheet(page)
}

export async function closeAddExerciseSheet(page: Page) {
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await sheet.waitFor({ state: 'detached' })
}

// Issue #63: the Exercises tab's create form sits in a sheet behind "New
// exercise" and closes once the exercise is added. Its fields keep their
// page-level labels, so callers can keep filling them through `page`.
export async function openNewExerciseSheet(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'New exercise', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'New exercise' })
  await sheet.waitFor({ state: 'visible' })
  return sheet
}

// Issue #42: both exercise create forms lead with a required "What does it
// work?" group grid (MuscleGroupPicker.vue). `scope` is the page, or the Add
// exercise sheet's dialog for the logger's inline form.
export async function pickMuscleGroup(scope: Page | Locator, label = 'Chest') {
  await scope.getByRole('group', { name: 'What does it work?' }).getByRole('button', { name: label, exact: true }).click()
}

// Issue #549: Edit and Delete on an Exercises row sit behind its "More
// options" button. Opens that strip (unless it's already open)
// and clicks the action.
export async function clickExerciseRowAction(row: Locator, action: 'Edit exercise' | 'Delete exercise') {
  const button = row.getByRole('button', { name: action })
  if (!(await button.isVisible())) await row.getByRole('button', { name: 'More options' }).click()
  await button.click()
}

// Issue #91: editing an exercise opens the same sheet, titled "Edit
// exercise", from the row's pencil instead of expanding the row. Fields and
// Save/Cancel live in the returned dialog; the row keeps its display.
export async function openEditExerciseSheet(page: Page, name: string): Promise<Locator> {
  await clickExerciseRowAction(page.locator('.row-wrap', { hasText: name }), 'Edit exercise')
  const sheet = page.getByRole('dialog', { name: 'Edit exercise' })
  await sheet.waitFor({ state: 'visible' })
  return sheet
}
