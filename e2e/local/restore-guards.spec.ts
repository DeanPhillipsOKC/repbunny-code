import { test, expect, startLocal } from '../fixtures/local'
import { openAccountSection } from '../fixtures/account'

// Issue #20's guards on Restore from a backup: a file that isn't a RepBunny
// backup is turned away before anything is touched, a wrong confirm phrase
// keeps Replace disabled, Cancel goes back to Your data with the data as it
// was, and restore and import are off while a workout is in progress.
// Issue #938 moved these here from the retired Supabase-mode backup spec.

test.use({ viewport: { width: 375, height: 800 } })

test('a non-backup file is rejected, and a wrong phrase or Cancel changes nothing', async ({ page, db, stamp }) => {
  const name = `E2E Keep Me ${stamp}`
  await startLocal(page, {
    beforeNavigate: async () => {
      const { error } = await db.from('exercises').insert({ name, muscle_group: 'legs' })
      if (error) throw new Error(error.message)
    },
  })

  await openAccountSection(page, 'Your data')

  // Not a RepBunny backup.
  let chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Restore from a backup/ }).click()
  await (await chooser).setFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
  })
  await expect(page.getByRole('alert')).toHaveText("This isn't a RepBunny backup file.")
  await expect(page.getByRole('dialog', { name: 'Restore this backup?' })).toHaveCount(0)

  // A real (empty) backup: a wrong phrase keeps it disabled, Cancel backs out.
  chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Restore from a backup/ }).click()
  await (await chooser).setFiles({
    name: 'repbunny-backup-2026-09-12.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ format: 'repbunny-backup', version: 1, exported_at: '2026-09-12T21:41:00Z', profile: {} })),
  })
  const preview = page.getByRole('dialog', { name: 'Restore this backup?' })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('right now (0 workouts, 0 sets)')
  const restoreButton = preview.getByRole('button', { name: 'Replace with this backup' })
  await preview.getByLabel('Type RESTORE to confirm').fill('RE STORE')
  await expect(restoreButton).toBeDisabled()
  await preview.getByRole('button', { name: 'Cancel' }).click()

  // Cancel goes back to Your data, where Restore was opened from.
  await expect(page.getByRole('dialog', { name: 'Your data' })).toBeVisible()
  await expect(preview).toHaveCount(0)

  const { data: exercises, error } = await db.from('exercises').select('name')
  expect(error).toBeNull()
  expect(exercises).toEqual([{ name }])
})

test('restore and import are disabled while a workout is in progress', async ({ page, db, stamp }) => {
  await startLocal(page, {
    beforeNavigate: async () => {
      const { error } = await db.from('exercises').insert({ name: `E2E Active Row ${stamp}`, muscle_group: 'arms' })
      if (error) throw new Error(error.message)
    },
  })

  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add exercise' })).toBeVisible()
  await openAccountSection(page, 'Your data')

  const restoreRow = page.getByRole('button', { name: /Restore from a backup/ })
  await expect(restoreRow).toBeDisabled()
  await expect(restoreRow).toContainText('Finish your workout first')
  await expect(page.getByText('Finish or discard your workout to restore or import.')).toBeVisible()
  await expect(restoreRow).toHaveAccessibleDescription(/Finish or discard your workout/)
  const importRow = page.getByRole('button', { name: /Import from another app/ })
  await expect(importRow).toBeDisabled()
  await expect(importRow).toHaveAccessibleDescription(/Finish or discard your workout/)
})
