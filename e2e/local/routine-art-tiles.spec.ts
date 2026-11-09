import { test, expect, localDb, startLocal } from '../fixtures/local'
import type { Page } from '@playwright/test'

// Issue #987 (mockup docs/design/issue-987-routine-tiles.png): Log home's
// routine tiles show the mascot doing an exercise picked from the routine's
// name (src/lib/routineArt.ts), Freeform shows the towel bunny, and Minimal
// mascot mode keeps the category icon cards.

const ROUTINES = ['Push day', 'Glute & hammy', 'Ab blast']

async function seedRoutines(page: Page) {
  const db = localDb(page)
  for (const name of ROUTINES) {
    const { error } = await db.from('workout_templates').insert({ name })
    if (error) throw new Error(error.message)
  }
}

function tile(page: Page, name: string) {
  return page.getByRole('group', { name: 'What are you training today?' }).getByRole('button', { name, exact: true })
}

test('routine tiles show keyword art, and Freeform the towel bunny', async ({ page }) => {
  await startLocal(page, { beforeNavigate: () => seedRoutines(page) })
  await expect(page.getByRole('heading', { name: 'What are you training today?' })).toBeVisible()

  await expect(tile(page, 'Push day').locator('img')).toHaveAttribute('src', /\/routines\/(overhead-press|bench-press|push-up)\.webp$/)
  await expect(tile(page, 'Glute & hammy').locator('img')).toHaveAttribute('src', /\/routines\/(hip-thrust|split-squat)\.webp$/)
  await expect(tile(page, 'Ab blast').locator('img')).toHaveAttribute('src', /\/routines\/(crunch|knee-raise)\.webp$/)
  await expect(tile(page, 'Freeform').locator('img')).toHaveAttribute('src', '/routines/wave-towel.webp')

  // Decorative art: the tile's name stays the routine's, and the art loads.
  await expect(tile(page, 'Push day').locator('img')).toHaveAttribute('alt', '')
  await expect
    .poll(() => tile(page, 'Push day').locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0)

  // The pick is stable across a reload.
  const glute = await tile(page, 'Glute & hammy').locator('img').getAttribute('src')
  await page.reload()
  await expect(tile(page, 'Glute & hammy').locator('img')).toHaveAttribute('src', glute!)

  // A tap still starts that routine.
  await tile(page, 'Push day').click()
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible()
})

test('Minimal mascot mode keeps the category icon cards', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('repbunny-theme-mascot', 'minimal'))
  await startLocal(page, { beforeNavigate: () => seedRoutines(page) })
  await expect(page.locator('html')).toHaveAttribute('data-mascot', 'minimal')
  await expect(page.getByRole('heading', { name: 'What are you training today?' })).toBeVisible()

  for (const name of ROUTINES) {
    await expect(tile(page, name).locator('img')).toHaveCount(0)
    await expect(tile(page, name).locator('.category-icon')).toBeVisible()
  }
  await expect(tile(page, 'Freeform').locator('img')).toHaveCount(0)
})

test('tiles fit a 320 px phone without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await startLocal(page, {
    beforeNavigate: async () => {
      await seedRoutines(page)
      const { error } = await localDb(page).from('workout_templates').insert({ name: 'Supercalifragilistic posterior chain extravaganza' })
      if (error) throw new Error(error.message)
    },
  })
  await expect(page.getByRole('heading', { name: 'What are you training today?' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const boxes = await page.locator('.workout-picker .workout-tile:not(.workout-tile-freeform)').evaluateAll((tiles) =>
    tiles.map((t) => t.getBoundingClientRect().width),
  )
  expect(boxes).toHaveLength(4)
  for (const width of boxes) expect(width).toBeLessThan(160)
})
