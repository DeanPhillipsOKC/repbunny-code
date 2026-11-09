import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #135: the 10 to 20 sets a week band on Muscle groups, and a quiet
// "Under 10 sets last week" line. A fresh local database starts empty, so
// last week's counts are exact.

function muscleRow(page: Page, muscle: string) {
  return page.getByRole('link', { name: new RegExp(`^${muscle}, `) })
}

// Restores a backup with one workout last Wednesday at noon (weeks start
// Sunday): 12 chest sets and 4 back sets.
async function seedLastWeek(page: Page) {
  const now = new Date()
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const performedAt = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - 4, 12).toISOString()
  await page.evaluate(async (at) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const exercise = (id: string, name: string, group: string) => ({
      id,
      name,
      muscle_group: group,
      also_works: [],
      load_type: 'weight',
      is_archived: false,
    })
    const set = (i: number, exerciseId: string) => ({
      id: `s${i}`,
      workout_id: 'w1',
      exercise_id: exerciseId,
      set_index: i,
      reps: 5,
      weight: 100,
      weight_unit: 'lb',
    })
    const { error } = await repos.backup.restore({
      format: 'repbunny-backup',
      version: 2,
      exported_at: new Date().toISOString(),
      exercises: [exercise('e1', 'E2E Bench', 'chest'), exercise('e2', 'E2E Row', 'back')],
      workout_templates: [],
      workout_template_exercises: [],
      workouts: [{ id: 'w1', performed_at: at, template_id: null, notes: null }],
      sets: [...Array.from({ length: 12 }, (_, i) => set(i, 'e1')), ...Array.from({ length: 4 }, (_, i) => set(12 + i, 'e2'))],
      body_weight_entries: [],
    })
    if (error) throw new Error(error.message)
  }, performedAt)
}

test('local mode: muscle groups shade 10 to 20 sets and note muscles under 10 last week', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seedLastWeek(page)
  await page.reload()

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Muscle groups', exact: true }).click()
  await expect(page).toHaveURL(/\/progress\/muscles$/)

  // Chest hit 12, so no line; Back hit 4, so it gets one; muscles with no
  // history get nothing.
  await expect(muscleRow(page, 'Chest')).toHaveAttribute('aria-label', 'Chest, 0 sets, 12 the week before')
  await expect(muscleRow(page, 'Chest').getByTestId('under-target')).toHaveCount(0)
  await expect(muscleRow(page, 'Back')).toHaveAttribute('aria-label', 'Back, 0 sets, 4 the week before, under 10 sets last week')
  await expect(muscleRow(page, 'Back').getByTestId('under-target')).toHaveText('Under 10 sets last week')
  await expect(page.getByTestId('under-target')).toHaveCount(1)
  await expect(page.getByText('Why 10 to 20?')).toBeVisible()

  // Every track shows the band, inside the track, from 10 to 20 on its scale.
  for (const row of await page.locator('.mrow').all()) {
    const track = (await row.locator('.track').boundingBox())!
    const band = (await row.getByTestId('target-band').boundingBox())!
    expect(band.width).toBeGreaterThan(0)
    expect(band.x).toBeGreaterThan(track.x)
    expect(band.x + band.width).toBeLessThanOrEqual(track.x + track.width + 0.5)
  }
  // Chest's 12-set tick lands inside the band.
  const chest = muscleRow(page, 'Chest')
  const band = (await chest.getByTestId('target-band').boundingBox())!
  const tick = (await chest.locator('.tick').boundingBox())!
  const tickX = tick.x + tick.width / 2
  expect(tickX).toBeGreaterThan(band.x)
  expect(tickX).toBeLessThan(band.x + band.width)

  // The line is about last week, so it's gone when looking back.
  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(page.getByTestId('muscle-week-title')).toHaveText('Last week')
  await expect(page.getByTestId('under-target')).toHaveCount(0)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // The one-muscle chart shades the band too.
  await page.getByRole('button', { name: 'Next week' }).click()
  await muscleRow(page, 'Back').click()
  await expect(page).toHaveURL(/\/progress\/muscles\/back$/)
  await expect(page.locator('svg.chart').getByTestId('target-band')).toHaveCount(1)
  await expect(page.locator('svg.chart rect')).toHaveCount(12)
  // The band is labeled and explained on the detail chart, Sets only.
  await expect(page.getByTestId('band-label')).toContainText('10–20 sets')
  await expect(page.getByTestId('band-label')).toContainText('Why 10 to 20?')
  await page.getByRole('button', { name: 'Volume' }).click()
  await expect(page.getByTestId('target-band')).toHaveCount(0)
  await expect(page.getByTestId('band-label')).toHaveCount(0)
})
