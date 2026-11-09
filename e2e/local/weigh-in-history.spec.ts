import { test, expect } from '@playwright/test'
import { localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Covers docs/backlog.md item 81: the Body tab's "See all weigh-ins" list,
// with edit/delete and the shared typo-check warning. Same direct-admin
// cleanup pattern as body-tab.spec.ts -- body_weight_entries has no name
// field to stamp for e2e/fixtures/cleanup.ts.
test('Weigh-in history: view, edit (with typo check), and delete entries', async ({ page }) => {
  const admin = localDb(page)
  const userId = await startLocal(page)

  try {
    await goTo(page, 'Body')
    await page.getByLabel('Body weight').fill('180')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Add your stats')).not.toBeVisible()

    await page.getByRole('button', { name: "Log today's weight" }).click()
    await page.getByLabel('New body weight').fill('175')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('175', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'See all weigh-ins' }).click()
    const dialog = page.getByRole('dialog', { name: 'Weigh-ins' })
    await expect(dialog.getByRole('heading', { name: 'Weigh-ins' })).toBeVisible()
    await expect(dialog.getByText('2 entries')).toBeVisible()

    // Edit the 175 entry to a typo (400 -- more than 20% off the 180 entry
    // it's compared against) and confirm the warning blocks a blind save.
    const editRow175 = dialog.getByRole('listitem').filter({ hasText: '175 lb' })
    await editRow175.getByRole('button', { name: /^Edit/ }).click()
    const weightField = dialog.getByLabel('Weight', { exact: true })
    await weightField.fill('400')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByText(/That's a big change from 180 lb\. Save anyway\?/)).toBeVisible()

    // "Fix it" refocuses the field without saving -- correct it and save.
    await dialog.getByRole('button', { name: 'Fix it' }).click()
    await expect(weightField).toBeFocused()
    await weightField.fill('170')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByText(/That's a big change/)).not.toBeVisible()
    await expect(dialog.getByText('170 lb')).toBeVisible()

    // Body screen's current-weight card reflects the edited value too.
    await dialog.getByRole('button', { name: 'Close weigh-ins' }).click()
    await expect(page.getByText('170', { exact: true })).toBeVisible()

    // Delete the 180 entry.
    await page.getByRole('button', { name: 'See all weigh-ins' }).click()
    const deleteRow180 = dialog.getByRole('listitem').filter({ hasText: '180 lb' })
    await deleteRow180.getByRole('button', { name: /^Delete/ }).click()
    await expect(dialog.getByText(/Delete the .+ weigh-in \(180 lb\)\?/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm delete' }).click()
    await expect(dialog.getByText('1 entry')).toBeVisible()
    await expect(dialog.getByText('180 lb')).not.toBeVisible()
  } finally {
    await admin.from('body_weight_entries').delete().eq('user_id', userId)
    await admin
      .from('profiles')
      .update({ height: null, height_unit: null, missing_weight_prompt_opt_out: false, weight_reminder: 'monthly' })
      .eq('id', userId)
  }
})
