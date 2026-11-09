import { test, expect } from '@playwright/test'

// The build version is in the page title, so a screenshot or a bug report
// says which build it came from (the Account menu shows it too, #931:
// e2e/local/account-about.spec.ts). Issue #938 moved this here from the
// retired Supabase-mode auth spec.

test('the page title carries the build version', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/^RepBunny v\d+\+[0-9a-f]{7,}/)
})
