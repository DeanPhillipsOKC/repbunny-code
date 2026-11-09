import { writeFile } from 'node:fs/promises'
import { test, expect, startLocal } from '../fixtures/local'
import { openAccountSection } from '../fixtures/account'

// Issue #486: restoring a partial file whose contents are already in the
// account says so in the preview, and offers Done instead of Add.

test('a partial backup restored twice says everything is already here the second time', async ({ page, stamp }, testInfo) => {
  await startLocal(page)
  const path = testInfo.outputPath('partial.json')
  await writeFile(
    path,
    JSON.stringify({
      format: 'repbunny-backup',
      version: 2,
      includes: ['templates'],
      exported_at: '2026-10-01T12:00:00Z',
      exercises: [{ id: 'ex-1', name: `E2E Nothing New Row ${stamp}`, muscle_group: 'back' }],
      workout_templates: [{ id: 'tpl-1', name: `E2E Nothing New Day ${stamp}`, is_archived: false }],
      workout_template_exercises: [{ id: 'tx-1', template_id: 'tpl-1', exercise_id: 'ex-1', position: 0, target_sets: 3 }],
    }),
  )

  const pick = async () => {
    if (!(await page.getByRole('dialog', { name: 'Your data' }).isVisible())) await openAccountSection(page, 'Your data')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: /Restore from a backup/ }).click()
    await (await chooser).setFiles(path)
    return page.getByRole('dialog', { name: 'Add from this backup?' })
  }

  const first = await pick()
  await expect(first).toContainText('Adds 1 routine and 1 exercise.')
  await first.getByRole('button', { name: 'Add to my data' }).click()
  const done = page.getByRole('dialog', { name: 'Added from backup' })
  await expect(done).toBeVisible({ timeout: 15_000 })
  await done.getByRole('button', { name: 'Done' }).click()

  const second = await pick()
  await expect(second).toContainText('Everything in this file is already in your account.')
  await expect(second.getByRole('button', { name: 'Add to my data' })).toHaveCount(0)
  await expect(second.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
  await second.getByRole('button', { name: 'Done' }).click()
  await expect(second).toHaveCount(0)
})
