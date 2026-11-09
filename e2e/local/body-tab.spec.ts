import { test, expect, type Page } from '@playwright/test'
import { localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Covers docs/backlog.md item 77: the "Body" tab. Each test gets a fresh
// SQLite database, so nothing here needs cleaning up afterward; the helper
// below clears body stats through localDb(page) before a test seeds its own.
async function clearBodyStats(page: Page, userId: string) {
  const admin = localDb(page)
  const { error: entriesError } = await admin.from('body_weight_entries').delete().eq('user_id', userId)
  if (entriesError) throw entriesError
  const { error: profileError } = await admin.from('profiles').update({ height: null, height_unit: null }).eq('id', userId)
  if (profileError) throw profileError
}

test('Body tab: enter height + weight, see BMI; log a second weight, see the trend chart', async ({ page }) => {
  const admin = localDb(page)
  const userId = await startLocal(page, { beforeNavigate: (id) => clearBodyStats(page, id) })

  try {
    await goTo(page, 'Body')
    await expect(page.getByText('Add your stats')).toBeVisible()
    await expect(page.getByText('Needs weight and height')).toBeVisible()

    await page.getByLabel('Body weight').fill('180')
    await page.locator('#empty-height-ft').fill('5')
    await page.getByPlaceholder('10').fill('11')
    await page.getByRole('button', { name: 'Save' }).click()

    // Empty state is gone; the weight card, height/BMI tiles now show real
    // values. 180 lb at 5'11" (71 in) computes to a BMI of 25.1 (Overweight).
    await expect(page.getByText('Add your stats')).not.toBeVisible()
    await expect(page.getByText('180', { exact: true })).toBeVisible()
    await expect(page.getByText('5′ 11″')).toBeVisible()
    await expect(page.getByText('25.1')).toBeVisible()
    await expect(page.getByText('Overweight')).toBeVisible()

    // Only 1 entry so far — no trend chart yet.
    await expect(page.getByText('Weight trend')).not.toBeVisible()

    await page.getByRole('button', { name: "Log today's weight" }).click()
    await page.getByLabel('New body weight').fill('175')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('down 5.0 lb in the last week', { exact: true })).toBeVisible()
    await expect(page.getByText('Weight trend')).toBeVisible()
    // #67: the trend chip doesn't judge direction, so it's plain --text, not
    // the success green.
    await expect(page.locator('.trend-chip')).toHaveCSS('color', 'rgb(245, 237, 242)')
    await expect(page.getByRole('img', { name: /Body weight over time/ })).toBeVisible()
  } finally {
    await admin.from('body_weight_entries').delete().eq('user_id', userId)
    await admin
      .from('profiles')
      .update({ height: null, height_unit: null, missing_weight_prompt_opt_out: false, weight_reminder: 'monthly' })
      .eq('id', userId)
  }
})
