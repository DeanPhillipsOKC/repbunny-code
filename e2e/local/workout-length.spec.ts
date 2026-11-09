import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #266: Finish saves when the workout ended (workouts.finished_at), and
// the Workout log card shows the length next to the date.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'

async function setUp(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()
}

async function logSet(page: Page) {
  const draft = page.locator('.set-row-draft').first()
  await draft.getByLabel('Reps').fill('5')
  await draft.getByLabel('Weight').fill('135')
  await draft.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
}

test('a finished workout shows its length in the Workout log, and resuming clears it until the next Finish', async ({ page }) => {
  await setUp(page)
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await logSet(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()

  // Resume, log another set, finish again.
  await page.getByRole('button', { name: 'Finished too early? Resume' }).click()
  await page.getByRole('button', { name: '+ Add row' }).click()
  await logSet(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Workout log')
  await expect(page.getByTestId('workout-length')).toHaveText(/^ · \d+ min$/)

  // The sets CSV ends with a finished_at column holding the stamp.
  const csv = await page.evaluate(async () => {
    const { buildBackup, buildSetsCsv } = await window.__rbImport('/src/lib/backup.ts')
    return buildSetsCsv(await buildBackup())
  })
  const [header, row] = csv.trim().split('\r\n')
  expect(header.split(',').pop()).toBe('finished_at')
  expect(row.split(',').pop()).toMatch(/^\d{4}-\d{2}-\d{2}T/)
})

test('a workout restored from a backup without finished_at shows no length', async ({ page }) => {
  await setUp(page)
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await logSet(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Workout log')
  await expect(page.getByTestId('workout-length')).toHaveCount(1)

  // Restore the same data from a backup file that predates the column, and
  // the card has no length and nothing breaks.
  await page.evaluate(async () => {
    const { buildBackup } = await window.__rbImport('/src/lib/backup.ts')
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const backup = await buildBackup()
    for (const workout of backup.workouts) delete workout.finished_at
    const { error } = await repos.backup.restore(backup)
    if (error) throw error
  })
  await page.reload()
  await goTo(page, 'Workout log')
  await expect(page.locator('.card').first()).toBeVisible()
  await expect(page.getByTestId('workout-length')).toHaveCount(0)
})

// Issue #264: moving a finished workout to another date moves its finish
// time too, so the length shown stays the same, and it survives a reload.
test('moving a workout to another date keeps its length', async ({ page }) => {
  await setUp(page)
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await logSet(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Workout log')
  const length = page.getByTestId('workout-length')
  await expect(length).toHaveText(/^ · \d+ min$/)
  const before = await length.textContent()

  await page.getByRole('button', { name: /^Change date and time/ }).click()
  await page.getByLabel('When').fill('2026-01-05T07:30')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByLabel('When')).toBeHidden()
  await expect(length).toHaveText(before!)

  await page.reload()
  await goTo(page, 'Workout log')
  await expect(page.getByTestId('workout-length')).toHaveText(before!)
  const stored = await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const { data } = await repos.workouts.listHistory()
    return { performedAt: data[0].performed_at, finishedAt: data[0].finished_at }
  })
  expect(new Date(stored.performedAt).getMonth()).toBe(0)
  expect(new Date(stored.finishedAt!).getTime()).toBeGreaterThanOrEqual(new Date(stored.performedAt).getTime())
})
