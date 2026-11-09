import { test, expect, localDb, startLocal } from '../fixtures/local'

// Issue #275: the Add exercise sheet's first section is padded with
// never-logged exercises, so it must not be titled "Recently logged" then.
test('add exercise sheet: first section is not "Recently logged" when padded with never-logged exercises', async ({ page, stamp }) => {
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (id) => {
      await admin.from('exercises').insert([
        { user_id: id, name: `E2E Title A ${stamp}`, muscle_group: 'chest' },
        { user_id: id, name: `E2E Title B ${stamp}`, muscle_group: 'back' },
      ])
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(sheet.getByText('New · not logged yet').first()).toBeVisible()
  await expect(sheet.getByText('Your exercises', { exact: true })).toBeVisible()
  await expect(sheet.getByText('Recently logged', { exact: true })).toHaveCount(0)
})
