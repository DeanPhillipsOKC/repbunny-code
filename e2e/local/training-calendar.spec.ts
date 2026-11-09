import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #137: the training calendar (Premium). Seeded days shade by sets
// logged, and nothing scrolls the page sideways at 320px. Without Premium it's
// a blurred preview. Issue #491: tapping a day opens its summary (sets,
// volume, time, records) with a link to each of its workouts, and a rest day
// gets an empty state.

const now = new Date()
const daysAgo = (n: number, hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, hour)
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// 3 days ago: two workouts (21 + 6 sets = level 3). 10 days ago: one
// workout of 12 sets (level 2). 40 days ago: 4 sets (level 1). 400 days ago
// is outside the 12 months. Push is the one heavier workout, so its first set
// is a record (#491), and the one with a finish time (52 minutes).
const WORKOUTS = [
  { id: 'legs', at: daysAgo(3, 8), template: 't1', sets: 21, weight: 100, minutes: null },
  { id: 'extra', at: daysAgo(3, 18), template: null, sets: 6, weight: 100, minutes: null },
  { id: 'push', at: daysAgo(10, 9), template: 't2', sets: 12, weight: 110, minutes: 52 },
  { id: 'light', at: daysAgo(40, 9), template: null, sets: 4, weight: 100, minutes: null },
  { id: 'ancient', at: daysAgo(400, 9), template: null, sets: 30, weight: 100, minutes: null },
]

async function seed(page: Page) {
  await page.evaluate(async (workouts) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    let i = 0
    const { error } = await repos.backup.restore({
      format: 'repbunny-backup',
      version: 2,
      exported_at: new Date().toISOString(),
      exercises: [{ id: 'bench', name: 'E2E Bench', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
      workout_templates: [
        { id: 't1', name: 'E2E Legs', is_archived: false, category: null },
        { id: 't2', name: 'E2E Push', is_archived: false, category: null },
      ],
      workout_template_exercises: [],
      workouts: workouts.map((w) => ({
        id: w.id,
        performed_at: new Date(w.at).toISOString(),
        finished_at: w.minutes === null ? null : new Date(new Date(w.at).getTime() + w.minutes * 60000).toISOString(),
        template_id: w.template,
        notes: null,
      })),
      sets: workouts.flatMap((w) =>
        Array.from({ length: w.sets }, (_, n) => ({
          id: `s${i++}`,
          workout_id: w.id,
          exercise_id: 'bench',
          set_index: n,
          reps: 10,
          weight: w.weight,
          weight_unit: 'lb',
        })),
      ),
      body_weight_entries: [],
    })
    if (error) throw new Error(error.message)
  }, WORKOUTS.map((w) => ({ ...w, at: w.at.toISOString() })))
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

const cell = (page: Page, d: Date) => page.locator(`.grid [data-day="${key(d)}"]`)
const label = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

test('local mode: the training calendar shades seeded days, opens their workouts, and is a preview without Premium', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page)
  await page.reload()

  await goTo(page, 'Progress')
  const tile = page.getByRole('link', { name: 'Training calendar' })
  await expect(tile).toContainText('4 workouts in 12 months')
  await expect(page.getByTestId('hub-mini-calendar').locator('i')).toHaveCount(56)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  // Free: a blurred preview.
  await tile.click()
  await expect(page).toHaveURL(/\/progress\/calendar$/)
  const preview = page.getByRole('group', { name: 'The training calendar is part of Premium preview' })
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByRole('heading', { name: 'Lift progress analytics' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect(page).toHaveURL(/\/progress$/)

  // Premium: the real calendar.
  await setPremium(page, true)
  await page.getByRole('link', { name: 'Training calendar' }).click()
  await expect(preview).toHaveCount(0)
  await expect(page.getByTestId('calendar-workouts')).toContainText('4')
  await expect(page.getByTestId('calendar-days')).toContainText('3')

  await expect(cell(page, daysAgo(3, 8))).toHaveAttribute('data-level', '3')
  await expect(cell(page, daysAgo(10, 9))).toHaveAttribute('data-level', '2')
  await expect(cell(page, daysAgo(40, 9))).toHaveAttribute('data-level', '1')
  await expect(cell(page, daysAgo(1, 9))).toHaveAttribute('data-level', '0')
  await expect(cell(page, daysAgo(400, 9))).toHaveCount(0)
  await expect(cell(page, now)).toHaveClass(/today/)

  // No page overflow at 320px; the grid scrolls on its own, starting at today.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  const scroller = page.getByTestId('calendar-scroller')
  const scroll = await scroller.evaluate((el) => ({ left: el.scrollLeft, width: el.clientWidth, total: el.scrollWidth }))
  expect(scroll.total).toBeGreaterThan(scroll.width)
  expect(scroll.left + scroll.width).toBeGreaterThanOrEqual(scroll.total - 1)
  const box = (await scroller.boundingBox())!
  const todayBox = (await cell(page, now).boundingBox())!
  expect(todayBox.x).toBeGreaterThanOrEqual(box.x)
  expect(todayBox.x + todayBox.width).toBeLessThanOrEqual(box.x + box.width + 1)

  // The screen's own header carries the one Account button.
  await expect(page.getByRole('button', { name: 'Account' })).toHaveCount(1)

  // Two workouts: the day's totals, then both workouts in time order. No
  // finish times, so no time; no records that day.
  await cell(page, daysAgo(3, 8)).click()
  const sheet = page.getByRole('dialog', { name: label(daysAgo(3, 8)) })
  await expect(sheet.getByText('2 workouts', { exact: true })).toBeVisible()
  await expect(sheet.getByTestId('day-sets')).toContainText('27')
  await expect(sheet.getByTestId('day-volume')).toContainText('27,000 lb')
  await expect(sheet.getByTestId('day-time')).toContainText('–')
  await expect(sheet.getByTestId('day-records')).toHaveCount(0)
  await expect(sheet.locator('.pick-name')).toHaveText(['E2E Legs', 'Freeform workout'])
  await expect(sheet.getByRole('button', { name: /E2E Legs/ })).toContainText('21 sets')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)

  // One workout: its volume, time, and the record it set.
  await cell(page, daysAgo(10, 9)).click()
  const push = page.getByRole('dialog', { name: label(daysAgo(10, 9)) })
  await expect(push.getByText('1 workout', { exact: true })).toBeVisible()
  await expect(push.getByTestId('day-sets')).toContainText('12')
  await expect(push.getByTestId('day-volume')).toContainText('13,200 lb')
  await expect(push.getByTestId('day-time')).toContainText('52 min')
  await expect(push.getByTestId('day-records').locator('li')).toHaveCount(1)
  await expect(push.getByTestId('day-records')).toContainText('E2E Bench')
  await expect(push.getByTestId('day-records')).toContainText('10 × 110 lb')

  // Its link opens that workout in the Workout log, expanded.
  await push.getByRole('button', { name: /E2E Push/ }).click()
  await expect(page).toHaveURL(/\/progress\/workouts\?workout=/)
  const id = new URL(page.url()).searchParams.get('workout')!
  const row = page.locator(`[data-workout-id="${id}"]`)
  await expect(row.getByText('E2E Push')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Collapse details' })).toBeVisible()
  await expect(row).toBeInViewport()

  // Back to the calendar: a rest day is an empty state with nothing to open.
  await page.goBack()
  await cell(page, daysAgo(5, 9)).click()
  const rest = page.getByRole('dialog', { name: label(daysAgo(5, 9)) })
  await expect(rest.getByTestId('day-rest')).toContainText('Rest day')
  await expect(rest.locator('.pick')).toHaveCount(0)
  await rest.getByRole('button', { name: 'Close' }).click()
  await expect(rest).toHaveCount(0)

  // Escape closes it too (Android's back gesture, #482).
  await cell(page, daysAgo(5, 9)).click()
  await expect(rest).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(rest).toHaveCount(0)

  // Then through the two-workout day to the evening workout.
  await cell(page, daysAgo(3, 8)).click()
  await page.getByRole('dialog').getByRole('button', { name: /Freeform workout/ }).click()
  await expect(page).toHaveURL(/\/progress\/workouts\?workout=/)
  const eveningId = new URL(page.url()).searchParams.get('workout')!
  await expect(page.locator(`[data-workout-id="${eveningId}"]`).getByRole('button', { name: 'Collapse details' })).toBeVisible()
})

// Issue #179: with the Workout log already visited (history cached), the
// log's own refetch used to replace the focused timeline, so every calendar
// tap landed on the newest workout. And the hint has to match the legend.
test('local mode: a calendar tap opens that day even after the Workout log was visited', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page)
  await setPremium(page, true)
  await page.reload()

  await goTo(page, 'Workout log')
  await expect(page.locator('[data-workout-id]')).toHaveCount(5)

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Training calendar' }).click()
  await expect(page.getByText('Stronger color means more sets. Swipe the calendar to see earlier months.')).toBeVisible()
  await expect(page.getByText(/Darker days/)).toHaveCount(0)

  await cell(page, daysAgo(40, 9)).click()
  await page.getByRole('dialog').getByRole('button', { name: /Freeform workout/ }).click()
  await expect(page).toHaveURL(/\/progress\/workouts\?workout=/)
  const lightId = new URL(page.url()).searchParams.get('workout')!
  const row = page.locator(`[data-workout-id="${lightId}"]`)
  await expect(row.getByRole('button', { name: 'Collapse details' })).toBeVisible()
  await expect(row).toBeInViewport()

  // Back, then a different day: the log follows the new tap too.
  await page.goBack()
  await cell(page, daysAgo(10, 9)).click()
  await page.getByRole('dialog').getByRole('button', { name: /E2E Push/ }).click()
  await expect(page).toHaveURL(new RegExp(`\\?workout=(?!${lightId})`))
  const pushId = new URL(page.url()).searchParams.get('workout')!
  const push = page.locator(`[data-workout-id="${pushId}"]`)
  await expect(push.getByText('E2E Push')).toBeVisible()
  await expect(push.getByRole('button', { name: 'Collapse details' })).toBeVisible()
  await expect(push).toBeInViewport()
})
