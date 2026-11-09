import { test, expect, localDb, startLocal, type LocalDb } from '../fixtures/local'
import type { Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 104: in a templated workout, once an
// exercise's planned sets (target_sets) are all logged, the deck moves on to
// the next unfinished exercise after rest ends or is skipped (or ~1.5s later
// with an "Up next" toast when no rest is configured). The template and its
// exercises are pre-existing state, seeded via the admin client (item 57's
// pattern, item 83).
async function seedTemplate(
  admin: LocalDb,
  userId: string,
  templateName: string,
  exercises: { name: string; restSeconds: number | null; targetSets: number | null }[],
) {
  const { data: template, error: templateError } = await admin
    .from('workout_templates')
    .insert({ user_id: userId, name: templateName })
    .select('id')
    .single()
  if (templateError) throw templateError
  for (const [position, ex] of exercises.entries()) {
    const { data: exercise, error } = await admin
      .from('exercises')
      .insert({ user_id: userId, name: ex.name, rest_seconds: ex.restSeconds })
      .select('id')
      .single()
    if (error) throw error
    await admin
      .from('workout_template_exercises')
      .insert({ template_id: template.id, exercise_id: exercise.id, position, target_sets: ex.targetSets })
  }
}

async function logOpenRow(page: Page, reps: string, weight: string) {
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill(reps)
  await row.getByLabel('Weight').fill(weight)
  await row.getByRole('button', { name: 'Add set' }).click()
}

async function startTemplate(page: Page, templateName: string) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()
}

test('auto-advance: after the last planned set, rest shows "Up next" and the deck moves on when it ends', async ({
  page,
  stamp,
}) => {
  const first = `E2E Advance Bench ${stamp}`
  const second = `E2E Advance Row ${stamp}`
  const templateName = `E2E Advance Day ${stamp}`

  const admin = localDb(page)
  await page.clock.install()
  await startLocal(page, {
    beforeNavigate: (userId) =>
      seedTemplate(admin, userId, templateName, [
        { name: first, restSeconds: 30, targetSets: 2 },
        { name: second, restSeconds: 30, targetSets: 2 },
      ]),
  })
  await startTemplate(page, templateName)
  await selectExercise(page, first, true)

  // Set 1 of 2: a normal rest, nothing about moving on yet.
  await logOpenRow(page, '8', '135')
  await dismissCelebrationIfShown(page)
  await expect(page.getByText(`Next: ${first}`)).toBeVisible()
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(first)

  // Set 2 of 2 is the last planned one: rest names the next exercise.
  await logOpenRow(page, '8', '135')
  await dismissCelebrationIfShown(page)
  await expect(page.getByText(`Up next: ${second}`)).toBeVisible()

  await page.clock.fastForward(31_000)
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toHaveCount(0)
  await expect(page.locator('.exercise-card-name')).toHaveText(second)
  await expect(page.getByRole('button', { name: second, exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('auto-advance: skipping rest after the last planned set also advances', async ({ page, stamp }) => {
  const first = `E2E Advance Skip A ${stamp}`
  const second = `E2E Advance Skip B ${stamp}`
  const templateName = `E2E Advance Skip Day ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: (userId) =>
      seedTemplate(admin, userId, templateName, [
        { name: first, restSeconds: 30, targetSets: 1 },
        { name: second, restSeconds: 30, targetSets: 1 },
      ]),
  })
  await startTemplate(page, templateName)
  await selectExercise(page, first, true)

  await logOpenRow(page, '5', '100')
  await dismissCelebrationIfShown(page)
  await expect(page.getByText(`Up next: ${second}`)).toBeVisible()
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(second)
})

test('auto-advance: an extra row in progress during rest suppresses the advance', async ({ page, stamp }) => {
  const first = `E2E Advance Extra A ${stamp}`
  const second = `E2E Advance Extra B ${stamp}`
  const templateName = `E2E Advance Extra Day ${stamp}`

  const admin = localDb(page)
  await page.clock.install()
  await startLocal(page, {
    beforeNavigate: (userId) =>
      seedTemplate(admin, userId, templateName, [
        { name: first, restSeconds: 30, targetSets: 1 },
        { name: second, restSeconds: 30, targetSets: 1 },
      ]),
  })
  await startTemplate(page, templateName)
  await selectExercise(page, first, true)

  await logOpenRow(page, '5', '100')
  await dismissCelebrationIfShown(page)
  await expect(page.getByText(`Up next: ${second}`)).toBeVisible()

  // Back to the workout mid-rest to start an unplanned extra set.
  await page.getByRole('button', { name: 'Back to workout' }).click()
  await page.getByRole('button', { name: '+ Add row' }).click()
  await page.locator('.set-row-draft').first().getByLabel('Reps').fill('5')

  await page.clock.fastForward(31_000)
  await expect(page.getByText(/Resting \d:\d\d/)).toHaveCount(0)
  await expect(page.locator('.exercise-card-name')).toHaveText(first)
  await expect(page.locator('.set-row-draft')).toHaveCount(1)
})

test('auto-advance: with no rest configured, an "Up next" toast then the move', async ({ page, stamp }) => {
  const first = `E2E Advance NoRest A ${stamp}`
  const second = `E2E Advance NoRest B ${stamp}`
  const templateName = `E2E Advance NoRest Day ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: (userId) =>
      seedTemplate(admin, userId, templateName, [
        { name: first, restSeconds: null, targetSets: 1 },
        { name: second, restSeconds: null, targetSets: 1 },
      ]),
  })
  await startTemplate(page, templateName)
  await selectExercise(page, first, true)

  await logOpenRow(page, '10', '50')
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.exercise-card-name')).toHaveText(second)
})

test('legacy no-target exercise: auto-advance reaches it and one set lets the workout auto-finish', async ({
  page,
  stamp,
}) => {
  const first = `E2E Legacy Target A ${stamp}`
  const legacy = `E2E Legacy No Target ${stamp}`
  const last = `E2E Legacy Target C ${stamp}`
  const templateName = `E2E Legacy Target Day ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: (userId) =>
      seedTemplate(admin, userId, templateName, [
        { name: first, restSeconds: null, targetSets: 2 },
        { name: legacy, restSeconds: null, targetSets: null },
        { name: last, restSeconds: null, targetSets: 2 },
      ]),
  })
  await startTemplate(page, templateName)
  await selectExercise(page, first, true)

  await logOpenRow(page, '8', '100')
  await dismissCelebrationIfShown(page)
  await logOpenRow(page, '8', '100')
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.exercise-card-name')).toHaveText(legacy)

  await logOpenRow(page, '8', '50')
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.exercise-card-name')).toHaveText(legacy)

  await selectExercise(page, last, true)
  await logOpenRow(page, '8', '75')
  await dismissCelebrationIfShown(page)
  await logOpenRow(page, '8', '75')
  await dismissCelebrationIfShown(page)
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
})

test('legacy no-target exercise: auto-finish waits until it has a set', async ({ page, stamp }) => {
  const first = `E2E Legacy Wait A ${stamp}`
  const legacy = `E2E Legacy Wait B ${stamp}`
  const last = `E2E Legacy Wait C ${stamp}`
  const templateName = `E2E Legacy Wait Day ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: (userId) =>
      seedTemplate(admin, userId, templateName, [
        { name: first, restSeconds: null, targetSets: 1 },
        { name: legacy, restSeconds: null, targetSets: null },
        { name: last, restSeconds: null, targetSets: 1 },
      ]),
  })
  await startTemplate(page, templateName)
  await selectExercise(page, first, true)

  await logOpenRow(page, '8', '100')
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.exercise-card-name')).toHaveText(legacy)

  await selectExercise(page, last, true)
  await logOpenRow(page, '8', '75')
  await dismissCelebrationIfShown(page)
  await expect(page.getByTestId('post-finish-card')).toHaveCount(0)
  await expect(page.locator('.exercise-card-name')).toHaveText(legacy)
})

// Backlog item 109 (supersedes item 104's "stays put" rule 5): the set that
// completes every planned set skips its rest, shows a short "Finishing
// workout…" moment, then finishes into the recap, whose Resume undoes it.
test('auto-finish: logging the last planned set finishes into the recap, and Resume restores both sets', async ({
  page,
  stamp,
}) => {
  const first = `E2E AutoFinish A ${stamp}`
  const second = `E2E AutoFinish B ${stamp}`
  const templateName = `E2E AutoFinish Day ${stamp}`

  const admin = localDb(page)
  await page.clock.install()
  await startLocal(page, {
    beforeNavigate: (userId) =>
      seedTemplate(admin, userId, templateName, [
        { name: first, restSeconds: 30, targetSets: 1 },
        { name: second, restSeconds: 30, targetSets: 1 },
      ]),
  })
  await startTemplate(page, templateName)
  await selectExercise(page, first, true)

  // Exercise 1 advances exactly as in item 104.
  await logOpenRow(page, '5', '100')
  await dismissCelebrationIfShown(page)
  await expect(page.getByText(`Up next: ${second}`)).toBeVisible()
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(second)

  // Clock paused so the finishing moment can't elapse before it's asserted.
  await page.clock.pauseAt(Date.now() + 60_000)
  await logOpenRow(page, '6', '110')
  await dismissCelebrationIfShown(page)
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toHaveCount(0)
  await expect(page.getByText('All planned sets done')).toBeVisible()
  await expect(page.getByText('Finishing workout…')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Finish workout' })).toHaveCount(0)

  await page.clock.fastForward(2_000)
  await page.clock.resume()
  const recap = page.getByTestId('post-finish-card')
  await expect(recap).toBeVisible()

  await recap.getByRole('button', { name: 'Finished too early? Resume' }).click()
  await expect(page.getByRole('heading', { name: templateName })).toBeVisible()
  await expect(page.locator('.set-row-logged', { hasText: '5 × 100 lb' })).toBeVisible()
  await selectExercise(page, second, true)
  await expect(page.locator('.set-row-logged', { hasText: '6 × 110 lb' })).toBeVisible()
})

test('auto-finish: an extra row opened on the last exercise suppresses it; all done shows by Finish', async ({
  page,
  stamp,
}) => {
  const only = `E2E AutoFinish Extra ${stamp}`
  const templateName = `E2E AutoFinish Extra Day ${stamp}`

  const admin = localDb(page)
  await page.clock.install()
  await startLocal(page, {
    beforeNavigate: (userId) =>
      seedTemplate(admin, userId, templateName, [{ name: only, restSeconds: null, targetSets: 1 }]),
  })
  await startTemplate(page, templateName)
  await selectExercise(page, only, true)

  await page.getByRole('button', { name: '+ Add row' }).click()
  await expect(page.locator('.set-row-draft')).toHaveCount(2)
  await logOpenRow(page, '10', '50')
  await dismissCelebrationIfShown(page)

  await page.clock.fastForward(3_000)
  await expect(page.getByText('All planned sets done')).toBeVisible()
  await expect(page.getByText('Finishing workout…')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible()
  await expect(page.getByTestId('post-finish-card')).toHaveCount(0)
  await expect(page.locator('.set-row-draft')).toHaveCount(1)
})

test('auto-advance: the no-rest toast names the next exercise', async ({ page, stamp }) => {
  const first = `E2E Advance Toast A ${stamp}`
  const second = `E2E Advance Toast B ${stamp}`
  const templateName = `E2E Advance Toast Day ${stamp}`

  const admin = localDb(page)
  await page.clock.install()
  await startLocal(page, {
    beforeNavigate: (userId) =>
      seedTemplate(admin, userId, templateName, [
        { name: first, restSeconds: null, targetSets: 1 },
        { name: second, restSeconds: null, targetSets: 1 },
      ]),
  })
  await startTemplate(page, templateName)
  await selectExercise(page, first, true)

  // Clock paused so the toast can't expire before it's asserted on.
  await page.clock.pauseAt(Date.now() + 60_000)
  await logOpenRow(page, '10', '50')
  await expect(page.getByText(`Up next: ${second}`)).toBeVisible()
  await expect(page.locator('.exercise-card-name')).toHaveText(first)
  await dismissCelebrationIfShown(page)
  await page.clock.fastForward(2_000)
  await expect(page.locator('.exercise-card-name')).toHaveText(second)
})

test('auto-advance: a freeform workout never advances', async ({ page, stamp }) => {
  const first = `E2E Advance Free A ${stamp}`
  const second = `E2E Advance Free B ${stamp}`

  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert([
        { user_id: userId, name: first, rest_seconds: 30 },
        { user_id: userId, name: second, rest_seconds: 30 },
      ])
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, second, false)
  await selectExercise(page, first, false)

  await logOpenRow(page, '5', '100')
  await dismissCelebrationIfShown(page)
  await expect(page.getByText(`Next: ${first}`)).toBeVisible()
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(first)
  await expect(page.getByText('All planned sets done')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible()
  await expect(page.getByTestId('post-finish-card')).toHaveCount(0)
})
