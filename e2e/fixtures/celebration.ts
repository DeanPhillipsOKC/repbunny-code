import type { Page } from '@playwright/test'

// Backlog item 38: the record celebration is a full-screen, manually
// dismissed overlay (RecordCelebration.vue) — unlike the auto-dismissing
// toast it replaced, it blocks the form underneath until dismissed. Most
// specs here log a first-ever set for a brand-new exercise, which gets its
// own first-set celebration, so call this after any "Add set" that isn't itself
// testing the celebration (see pr-toast.spec.ts).
//
// Issue #161: the background record check (workouts.ts) used to be waited out
// with a fixed 2s timeout, which every uncelebrated set paid in full. The
// logger now marks itself `data-record-check="idle"` once no add is still
// deciding whether it set a record; by then a celebration, if any, is already
// mounted. Outside the logger (no such attribute) the old 2s wait still applies.
export async function dismissCelebrationIfShown(page: Page) {
  const overlay = page.locator('.celebration-overlay')
  const logger = page.locator('[data-record-check]')
  if ((await logger.count()) > 0) {
    // Detached covers both "now idle" and the logger unmounting (auto-finish).
    await page.locator('[data-record-check="pending"]').waitFor({ state: 'detached' })
    if ((await overlay.count()) === 0) return
  }
  try {
    await overlay.waitFor({ state: 'visible', timeout: 2000 })
  } catch {
    return
  }
  await page.getByRole('button', { name: 'Nice!' }).click()
  await overlay.waitFor({ state: 'hidden' })
}

// Issue #187: finishing a workout that crosses a tier with an Extra (with
// Premium, which startLocal turns on) shows UnlockCelebration.vue over the
// recap. Specs not testing that screen register this to tap past it whenever
// it blocks them.
export async function skipUnlockCelebrations(page: Page) {
  await page.addLocatorHandler(page.getByTestId('unlock-celebration'), async (overlay) => {
    await overlay.getByRole('button', { name: /^(Not now|See my recap)$/ }).click()
  })
}