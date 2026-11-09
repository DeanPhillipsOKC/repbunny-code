import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { goTo } from '../fixtures/nav'
import type { Locator, Page } from '@playwright/test'

// Covers issue #492: with Android's font size and display size turned up,
// text ran into other text on Home, the workout, the recap, and Progress.
// The agreed floor is fully usable at 150% font on a phone that's 320px wide
// once display size is up. The Android WebView scales every font size with
// the system setting, which a 24px root and body font stand in for here (the
// app sizes text in rem, on a 16px body).

const DAY_MS = 24 * 60 * 60 * 1000

async function largeFont(page: Page) {
  await page.addStyleTag({ content: 'html, body { font-size: 24px !important; }' })
}

type Box = { x: number; y: number; width: number; height: number }

async function boxes(locator: Locator): Promise<Box[]> {
  const all = await locator.all()
  const result: Box[] = []
  for (const item of all) {
    const box = await item.boundingBox()
    if (box) result.push(box)
  }
  return result
}

function overlaps(a: Box, b: Box) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 1 && h > 1
}

function expectNoOverlap(list: Box[], what: string) {
  expect(list.length, what).toBeGreaterThan(1)
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      expect(overlaps(list[i], list[j]), `${what} ${i} and ${j} overlap`).toBe(false)
    }
  }
}

function inside(inner: Box, outer: Box) {
  return inner.x >= outer.x - 1 && inner.y >= outer.y - 1
    && inner.x + inner.width <= outer.x + outer.width + 1
    && inner.y + inner.height <= outer.y + outer.height + 1
}

test('Home, a workout, the recap, and Progress fit at 150% font on a 320px phone', async ({ page, stamp }) => {
  const routine = `Upper Body Strength Day ${stamp}`
  const exercise = `Barbell Back Squat ${stamp}`
  const db = localDb(page)

  await startLocal(page, {
    beforeNavigate: async () => {
      const { data: ex, error } = await db.from('exercises').insert({ name: exercise }).select('id').single()
      if (error) throw error
      const { data: tpl } = await db.from('workout_templates').insert({ name: routine }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: tpl!.id, exercise_id: ex!.id, position: 0 })
      const { data: prior } = await db.from('workouts')
        .insert({ template_id: tpl!.id, performed_at: new Date(Date.now() - DAY_MS).toISOString() }).select('id').single()
      await db.from('sets').insert({ workout_id: prior!.id, exercise_id: ex!.id, set_index: 0, reps: 8, weight: 135, weight_unit: 'lb' })
    },
  })
  await page.setViewportSize({ width: 320, height: 700 })
  await largeFont(page)

  // Bottom nav: the four labels sit side by side without touching.
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav.getByRole('link', { name: 'Exercises', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: routine, exact: true })).toBeVisible()
  expectNoOverlap(await boxes(nav.locator('.tab-label')), 'tab labels')

  // Home: the routine tiles go to one column, so a name never breaks
  // mid-word in a half-width tile.
  const picker = await page.locator('.workout-picker').boundingBox()
  const tile = await page.getByRole('button', { name: routine, exact: true }).boundingBox()
  if (!picker || !tile) throw new Error('routine picker not laid out')
  expect(tile.width).toBeGreaterThan(picker.width - 2)

  // The workout header keeps room for the routine name.
  await page.getByRole('button', { name: routine, exact: true }).click()
  const title = page.locator('.workout-title')
  await expect(title).toHaveText(routine)
  const titleBox = await title.boundingBox()
  const clockBox = await page.locator('.log-header-workout .elapsed-time').boundingBox()
  if (!titleBox || !clockBox) throw new Error('workout header not laid out')
  expect(titleBox.width).toBeGreaterThan(100)
  expect(overlaps(titleBox, clockBox)).toBe(false)

  // The exercise card grows to fit its name and footer instead of clipping.
  const card = await page.locator('.exercise-card-viewport').boundingBox()
  const name = await page.locator('.exercise-card-name').boundingBox()
  const history = await page.getByRole('button', { name: 'View exercise history' }).boundingBox()
  if (!card || !name || !history) throw new Error('exercise card not laid out')
  expect(inside(name, card)).toBe(true)
  expect(inside(history, card)).toBe(true)
  expect(history.y).toBeGreaterThanOrEqual(name.y + name.height - 1)

  // Set / Weight / Reps / RPE stay over their own columns.
  expectNoOverlap(await boxes(page.locator('.set-header-row > span:not(:empty)')), 'set column labels')

  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('140')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)
  await page.getByRole('button', { name: 'Finish workout' }).click()

  // Recap: the This week numbers and the How did it feel options.
  const recap = page.getByTestId('post-finish-card')
  await expect(recap).toBeVisible()
  const week = recap.getByTestId('recap-week')
  expectNoOverlap(await boxes(week.locator('.week-stat')), 'week stats')
  const tiles = await boxes(recap.getByTestId('recap-tile'))
  expectNoOverlap(tiles, 'recap tiles')
  for (const group of ['Sleep', 'Energy', 'Stress']) {
    const row = recap.getByRole('group', { name: group })
    const options = await boxes(row.getByRole('button'))
    expect(options).toHaveLength(3)
    expectNoOverlap(options, `${group} options`)
    // Each option is wide enough that "High" or "Under 6 h" wraps between
    // words, not inside one.
    for (const option of options) expect(option.width).toBeGreaterThan(60)
  }
  await recap.getByRole('button', { name: 'Done', exact: true }).click()

  // Progress: the page title stays on one line.
  await goTo(page, 'Progress')
  const heading = page.getByRole('heading', { name: 'Progress', level: 2 })
  const headingBox = await heading.boundingBox()
  if (!headingBox) throw new Error('Progress title not laid out')
  const lineHeight = await heading.evaluate(el => parseFloat(getComputedStyle(el).lineHeight))
  expect(headingBox.height).toBeLessThan(lineHeight * 1.5)
})
