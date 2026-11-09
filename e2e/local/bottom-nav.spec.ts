import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Covers docs/backlog.md item 41: the persistent bottom tab bar that
// replaced the hamburger-drawer nav (item 18). Checks the bar is always
// present, every tab navigates to its route, and the active tab is marked
// current for assistive tech (router-link's default aria-current="page").
// Issue #44: four tabs; Progress replaced History and folded in Body.
test('bottom nav: all four tabs are always visible and navigate to their screen', async ({ page }) => {
  await startLocal(page)

  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link')).toHaveCount(4)
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')

  await goTo(page, 'Progress')
  await expect(page).toHaveURL(/\/progress$/)
  await expect(nav.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page')

  await goTo(page, 'Routines')
  await expect(page).toHaveURL(/\/templates$/)
  await expect(nav.getByRole('link', { name: 'Routines' })).toHaveAttribute('aria-current', 'page')

  await goTo(page, 'Exercises')
  await expect(page).toHaveURL(/\/exercises$/)
  await expect(nav.getByRole('link', { name: 'Exercises' })).toHaveAttribute('aria-current', 'page')

  await goTo(page, 'Home')
  await expect(page).toHaveURL(/\/$/)
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
})

test('bottom nav: the Progress tab stays lit on its sections, and /history redirects to the workout log', async ({ page }) => {
  await startLocal(page)
  const progressTab = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Progress' })

  for (const path of ['/progress/workouts', '/progress/lifts', '/body']) {
    await page.goto(path)
    await expect(progressTab).toHaveClass(/\bactive\b/)
  }

  await page.goto('/history')
  await expect(page).toHaveURL(/\/progress\/workouts$/)
  await expect(page.getByRole('heading', { name: 'Workout log', exact: true })).toBeVisible()
  await expect(progressTab).toHaveClass(/\bactive\b/)
})
