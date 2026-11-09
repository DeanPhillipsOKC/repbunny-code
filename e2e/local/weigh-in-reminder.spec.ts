import { test, expect } from '@playwright/test'
import { localDb, startLocal } from '../fixtures/local'

// Covers docs/backlog.md item 80: the periodic "update your weight" reminder
// on Home, shown once a user has both a body weight and a height on file and
// their latest weigh-in is older than their reminder cadence. Seeded via
// startLocal's beforeNavigate hook (progress-strip.spec.ts's pattern)
// so the reminder check — which runs once on Home's first mount — sees the
// stale entry and the height from the very first load, rather than racing a
// second fetch after a reload. `profiles.upsert` (not `.update`) because this
// may be the first time this worker's test account ever gets a profile row.
test('Periodic weigh-in reminder: shows when due, "Don\'t ask again" turns it off for good', async ({ page }) => {
  const admin = localDb(page)
  const staleEntryRecordedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
  let userId = ''

  try {
    userId = await startLocal(page, {
      beforeNavigate: async (id) => {
        await admin.from('profiles').upsert({ id, weight_unit: 'lb', height: 71, height_unit: 'in', weight_reminder: 'monthly' })
        await admin
          .from('body_weight_entries')
          .insert({ user_id: id, weight: 180, weight_unit: 'lb', recorded_at: staleEntryRecordedAt })
      },
    })

    await expect(page.getByRole('heading', { name: 'Time for a weigh-in?' })).toBeVisible()
    await page.getByRole('button', { name: "Don't ask again" }).click()
    await expect(page.getByRole('heading', { name: 'Time for a weigh-in?' })).not.toBeVisible()

    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Time for a weigh-in?' })).not.toBeVisible()
  } finally {
    if (userId) {
      await admin.from('body_weight_entries').delete().eq('user_id', userId)
      await admin
        .from('profiles')
        .update({ height: null, height_unit: null, missing_weight_prompt_opt_out: false, weight_reminder: 'monthly' })
        .eq('id', userId)
    }
  }
})
