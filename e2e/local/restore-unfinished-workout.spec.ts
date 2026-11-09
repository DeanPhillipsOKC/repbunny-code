import { test, expect, type Page } from '@playwright/test'
import { openAccountSection } from '../fixtures/account'
import { selectExercise } from '../fixtures/exercise'
import { goTo, openLibrary } from '../fixtures/nav'

// Issue #338: restoring a full backup also erases an unfinished workout, so
// the restore sheet says so. A partial (routines-only) backup merges and
// never touches it.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'
const WARNING = 'Your unfinished workout will be erased too.'

async function saveBackup(page: Page, outputPath: (name: string) => string, routinesOnly: boolean) {
  await openAccountSection(page, 'Your data')
  await page.getByRole('button', { name: /Back up my data/ }).click()
  const options = page.getByRole('dialog', { name: 'What to back up' })
  if (routinesOnly) {
    await options.getByRole('checkbox', { name: /Account preferences/ }).uncheck()
    await options.getByRole('checkbox', { name: /Workout history/ }).uncheck()
  }
  const download = page.waitForEvent('download')
  await options.getByRole('button', { name: 'Save backup' }).click()
  const file = await download
  const saved = outputPath(file.suggestedFilename())
  await file.saveAs(saved)
  await expect(page.getByRole('status').filter({ hasText: 'Backup saved' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Your data' }).getByRole('button', { name: 'Close' }).click()
  return saved
}

async function pickBackup(page: Page, path: string, dialogName: string) {
  if (!(await page.getByRole('dialog', { name: 'Your data' }).isVisible())) await openAccountSection(page, 'Your data')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Restore from a backup/ }).click()
  await (await chooser).setFiles(path)
  return page.getByRole('dialog', { name: dialogName })
}

test('the restore sheet warns that an unfinished workout is erased too, only for a full restore', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
  })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()

  const full = await saveBackup(page, testInfo.outputPath.bind(testInfo), false)
  const partial = await saveBackup(page, testInfo.outputPath.bind(testInfo), true)

  // No unfinished workout: no extra sentence.
  let preview = await pickBackup(page, full, 'Restore this backup?')
  await expect(preview.getByText('replaces everything')).toBeVisible()
  await expect(preview.getByText(WARNING)).toHaveCount(0)
  await preview.getByRole('button', { name: 'Cancel' }).click()
  await expect(preview).toHaveCount(0)
  await page.getByRole('dialog', { name: 'Your data' }).getByRole('button', { name: 'Close' }).click()

  // Start a workout and reload so Home offers to resume it.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Resume your workout?' })).toBeVisible()

  preview = await pickBackup(page, full, 'Restore this backup?')
  await expect(preview.getByText(WARNING)).toBeVisible()
  // Typed confirm ignores case and stray spaces (Android autocomplete).
  const restoreButton = preview.getByRole('button', { name: 'Replace with this backup' })
  await preview.getByLabel('Type RESTORE to confirm').fill('RE STORE')
  await expect(restoreButton).toBeDisabled()
  await preview.getByLabel('Type RESTORE to confirm').fill('restore ')
  await expect(restoreButton).toBeEnabled()
  await preview.getByRole('button', { name: 'Cancel' }).click()
  await expect(preview).toHaveCount(0)

  // A routines-only backup merges and keeps the workout, so no warning.
  const merge = await pickBackup(page, partial, 'Add from this backup?')
  await expect(merge).toBeVisible()
  await expect(merge.getByText(WARNING)).toHaveCount(0)
})
