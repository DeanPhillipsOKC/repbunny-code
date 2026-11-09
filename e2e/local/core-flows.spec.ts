import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { createTemplateViaUi } from '../fixtures/template'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { openAccountSection } from '../fixtures/account'

// Issue #79: the core flows on the local-mode data path (the native apps:
// SQLite on the device, no account), all driven through the app from a
// first launch: add from the library, build a template, log a workout from
// it, fix a set in the Workout log, check Progress, then back up, erase,
// and restore. navigator.canShare is removed so the backup arrives as a
// download Playwright can capture.

const BENCH = 'Barbell Bench Press'
const ROW = 'Seated Cable Row'

async function addFromLibrary(page: Page, name: string) {
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(name)
  await page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: name }).getByText('Added', { exact: true })).toBeVisible()
}

// A template workout opens one draft row per planned set; log the first.
// A first launch rests 2:00 by default (#429), so each set starts a rest.
async function logSet(page: Page, reps: string, weight: string) {
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill(reps)
  await row.getByLabel('Weight').fill(weight)
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
}

// The Workout log expands only the newest workout; open the template one.
async function openTemplateWorkout(page: Page) {
  await goTo(page, 'Workout log')
  await page.getByRole('button', { name: /Local Push Pull/ }).click()
}

test('local mode: library, template workout, workout log, progress, and backup and restore', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
  await page.setViewportSize({ width: 375, height: 800 })

  // First launch: the unit sheet, then the exercise library.
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await openLibrary(page)
  await expect(page).toHaveURL(/\/exercises\?view=library$/)
  await addFromLibrary(page, BENCH)
  await addFromLibrary(page, ROW)
  await page.getByRole('group', { name: 'Exercises view' }).getByRole('button', { name: 'My exercises' }).click()
  await expect(page.locator('.row-wrap', { hasText: BENCH })).toBeVisible()
  await expect(page.locator('.row-wrap', { hasText: ROW })).toBeVisible()

  // A template of both, started from Home.
  await createTemplateViaUi(page, 'Local Push Pull', [
    { name: BENCH, sets: 3 },
    { name: ROW, sets: 3 },
  ])
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Local Push Pull', exact: true }).click()

  await selectExercise(page, BENCH, true)
  await logSet(page, '8', '135')
  await logSet(page, '6', '155')
  await expect(page.locator('.set-row-logged')).toHaveCount(2)
  await selectExercise(page, ROW, true)
  await logSet(page, '10', '100')
  await page.getByRole('button', { name: 'Finish workout' }).click()
  // Two of the six planned sets are left, so it asks first.
  await page.getByRole('dialog', { name: 'Finish now?' }).getByRole('button', { name: 'Finish anyway' }).click()

  const recap = page.getByTestId('post-finish-card')
  await expect(recap.getByText('First workout logged.')).toBeVisible()
  await page.getByLabel('Notes (optional)').fill('Local mode notes')
  await recap.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(recap).toHaveCount(0)

  // The Workout log shows it, and a set can be fixed there.
  await goTo(page, 'Workout log')
  // The row only appears in the template workout, so it finds that card.
  const card = page.locator('.card', { hasText: ROW })
  await expect(card.getByText('Local mode notes', { exact: true })).toBeVisible()
  const firstSet = card.locator('li.row-wrap').first()
  await expect(firstSet).toContainText('8 × 135 lb')
  await firstSet.getByRole('button', { name: 'Edit' }).click()
  await firstSet.getByLabel('Reps').fill('9')
  await firstSet.getByRole('button', { name: 'Save' }).click()
  await expect(firstSet).toContainText('9 × 135 lb')

  // Lift progress lists a one-workout lift too, with no trend yet (#156).
  await goTo(page, 'Progress')
  await expect(page.getByTestId('hub-week-count')).toHaveText('1')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await expect(page.locator('.lift-row', { hasText: BENCH })).toContainText('1 session')

  // A second, freeform workout with the bench.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await logSet(page, '5', '185')
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Progress')
  await expect(page.getByTestId('hub-week-count')).toHaveText('2')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await expect(page).toHaveURL(/\/progress\/lifts$/)
  const lift = page.locator('.lift-row', { hasText: BENCH })
  await expect(lift).toContainText('Est. 1RM')
  await expect(lift).not.toContainText('1 session')
  await expect(page.locator('.lift-row', { hasText: ROW })).toContainText('1 session')
  await lift.click()
  await expect(page.getByRole('dialog', { name: `${BENCH} history` })).toBeVisible()

  // The fix survives a reload (SQLite saved to IndexedDB).
  await page.reload()
  await openTemplateWorkout(page)
  await expect(page.locator('.card', { hasText: ROW }).locator('li.row-wrap').first()).toContainText('9 × 135 lb')

  // Back up.
  const account = await openAccountSection(page, 'Your data')
  const download = page.waitForEvent('download')
  await account.getByRole('button', { name: /Back up my data/ }).click()
  await page.getByRole('dialog', { name: 'What to back up' }).getByRole('button', { name: 'Save backup' }).click()
  const file = await download
  const backupPath = testInfo.outputPath(file.suggestedFilename())
  await file.saveAs(backupPath)
  await expect(page.getByRole('status').filter({ hasText: 'Backup saved' })).toBeVisible()
  const backup = JSON.parse(await readFile(backupPath, 'utf8'))
  expect(backup.format).toBe('repbunny-backup')
  expect(backup.workouts).toHaveLength(2)
  expect(backup.workouts.map((workout: { notes: string | null }) => workout.notes)).toContain('Local mode notes')
  expect(backup.sets.map((set: { reps: number }) => set.reps).sort()).toEqual([10, 5, 6, 9])
  expect(backup.workout_template_exercises).toHaveLength(2)

  // Erase everything: back to a first launch.
  await account.getByRole('button', { name: 'Back to Account' }).click()
  await (await openAccountSection(page, 'Reset & erase')).getByRole('button', { name: 'Erase all data' }).click()
  const erase = page.getByRole('dialog', { name: 'Erase all data?' })
  await erase.getByLabel('Type ERASE to confirm').fill('ERASE')
  await erase.getByRole('button', { name: 'Erase all data' }).click()
  const unitSheet = page.getByRole('dialog', { name: 'Which unit do you lift in?' })
  await unitSheet.getByRole('button', { name: 'lb' }).click()
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()

  // Restore the backup: the workout, its fixed set, and the template are back.
  await openAccountSection(page, 'Your data')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Restore from a backup/ }).click()
  await (await chooser).setFiles(backupPath)
  const preview = page.getByRole('dialog', { name: 'Restore this backup?' })
  await expect(preview.getByText('replaces everything')).toBeVisible()
  await expect(preview.getByText(/sign-in|passkey/)).toHaveCount(0)
  await preview.getByLabel('Type RESTORE to confirm').fill('RESTORE')
  await preview.getByRole('button', { name: 'Replace with this backup' }).click()
  const done = page.getByRole('dialog', { name: 'Backup restored' })
  await expect(done).toContainText('2 workouts, 4 sets, 2 exercises, 1 routine')
  await done.getByRole('button', { name: 'Done' }).click()

  await openTemplateWorkout(page)
  const restored = page.locator('.card', { hasText: ROW })
  await expect(restored.getByText('Local mode notes', { exact: true })).toBeVisible()
  await expect(restored.locator('li.row-wrap').first()).toContainText('9 × 135 lb')
  await goTo(page, 'Routines')
  await expect(page.getByText('Local Push Pull')).toBeVisible()
})
