import type { Page } from '@playwright/test'

// Navigation lives in the persistent bottom tab bar (docs/backlog.md item 41,
// replacing the hamburger-menu drawer, item 18). Tests click a tab link
// directly instead of opening a menu first. Issue #44: History and Body left
// the bar for tiles on the Progress hub, so those two click Progress first,
// then the tile.
type View = 'Home' | 'Progress' | 'Routines' | 'Exercises' | 'Workout log' | 'Body'

const PROGRESS_TILES: Partial<Record<View, string>> = {
  'Workout log': 'Workout log',
  Body: 'Body weight',
}

export async function goTo(page: Page, view: View) {
  const nav = page.getByRole('navigation', { name: 'Primary' })
  const tile = PROGRESS_TILES[view]
  if (tile) {
    await nav.getByRole('link', { name: 'Progress', exact: true }).click()
    await page.getByRole('link', { name: tile, exact: true }).click()
    return
  }
  await nav.getByRole('link', { name: view, exact: true }).click()
}

// Issue #207: Home's welcome card no longer links to the library, so specs
// that stock exercises first go through the Exercises tab's Library segment.
export async function openLibrary(page: Page) {
  await goTo(page, 'Exercises')
  await page.getByRole('group', { name: 'Exercises view' }).getByRole('button', { name: 'Library' }).click()
}
