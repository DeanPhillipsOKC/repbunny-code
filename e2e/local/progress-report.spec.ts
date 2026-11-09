import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #134: the Progress hub's free weekly line, and the monthly report
// (Premium) for the month that just ended, compared with the month before.
// Without Premium the report is a blurred preview.

const now = new Date()
const at = (monthsBack: number, day: number, hour = 9) =>
  new Date(now.getFullYear(), now.getMonth() - monthsBack, day, hour).toISOString()
const monthName = (monthsBack: number) =>
  new Date(now.getFullYear(), now.getMonth() - monthsBack, 1).toLocaleDateString('en-US', { month: 'long' })
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// Two months back (the "month before") and last month (the report), plus one
// row from mid last year so the year recap is offered, and one workout today
// for the weekly line.
const WORKOUTS = [
  { id: 'old', at: new Date(now.getFullYear() - 1, 5, 15, 9).toISOString() },
  { id: 'a1', at: at(2, 5) },
  { id: 'a2', at: at(2, 12) },
  { id: 'b1', at: at(1, 3) },
  { id: 'b2', at: at(1, 10) },
  { id: 'b3', at: at(1, 17) },
  { id: 'today', at: new Date().toISOString() },
]

type SeedSet = [workout: string, exercise: string, reps: number | null, weight: number, duration?: number]
const SETS: SeedSet[] = [
  ['old', 'row', 8, 95],
  // Month before: 2 workouts, 6 sets, 4,000 lb, 1 min timed, 2 records
  // (bench 145 and 150 beat the 135 baseline).
  ['a1', 'bench', 5, 135],
  ['a1', 'bench', 5, 145],
  ['a1', 'squat', 5, 185],
  ['a2', 'bench', 5, 150],
  ['a2', 'squat', 5, 185],
  ['a2', 'plank', null, 0, 60],
  // Report month: 3 workouts, 6 sets, 4,300 lb, 2 min timed, 4 records.
  ['b1', 'bench', 5, 155],
  ['b1', 'squat', 5, 195],
  ['b2', 'bench', 5, 150],
  ['b2', 'squat', 5, 200],
  ['b2', 'plank', null, 0, 90],
  ['b3', 'bench', 5, 160],
  // This week: 1 workout, 2 sets, 1 record.
  ['today', 'bench', 5, 165],
  ['today', 'bench', 5, 100],
]

async function seed(page: Page) {
  await page.evaluate(
    async ({ workouts, sets }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [
          { id: 'bench', name: 'E2E Bench', muscle_group: 'chest', also_works: ['arms'], load_type: 'weight', is_archived: false },
          { id: 'squat', name: 'E2E Squat', muscle_group: 'legs', also_works: [], load_type: 'weight', is_archived: false },
          { id: 'plank', name: 'E2E Plank', muscle_group: 'core', also_works: [], load_type: 'timed', is_archived: false },
          { id: 'row', name: 'E2E Row', muscle_group: 'back', also_works: [], load_type: 'weight', is_archived: false },
        ],
        workout_templates: [],
        workout_template_exercises: [],
        workouts: workouts.map((w: { id: string; at: string }) => ({ id: w.id, performed_at: w.at, template_id: null, notes: null })),
        sets: sets.map(([workout, exercise, reps, weight, duration]: (string | number | null | undefined)[], i: number) => ({
          id: `s${i}`,
          workout_id: workout,
          exercise_id: exercise,
          set_index: i,
          reps,
          weight,
          weight_unit: 'lb',
          duration_seconds: duration ?? null,
        })),
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { workouts: WORKOUTS, sets: SETS },
  )
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

function stat(page: Page, key: string) {
  const tile = page.getByTestId(`report-stat-${key}`)
  return { value: tile.getByTestId('report-stat-value'), change: tile.getByTestId('report-stat-change') }
}

test('local mode: the weekly line is free and the monthly report is Premium, matching the seed', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page)
  await page.reload()

  await goTo(page, 'Progress')
  await expect(page.getByTestId('hub-week-line')).toHaveText('This week: 1 workout, 2 sets, 1 record')

  // Free: the tile is there, and opens a blurred preview.
  const reportName = `${monthName(1)} report`
  const tile = page.getByRole('link', { name: reportName, exact: true })
  await expect(tile).toContainText('3 workouts · 4 records')
  await tile.click()
  await expect(page).toHaveURL(/\/progress\/report$/)
  await expect(page.getByRole('heading', { name: reportName })).toBeVisible()
  const preview = page.getByRole('group', { name: 'Monthly reports are part of Premium preview' })
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByRole('heading', { name: 'Monthly reports' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect(page).toHaveURL(/\/progress$/)

  // Premium: the real report.
  await setPremium(page, true)
  await page.getByRole('link', { name: reportName, exact: true }).click()
  await expect(preview).toHaveCount(0)
  const vs = `vs ${monthName(2)}`
  await expect(page.getByTestId('report-period')).toHaveText(
    new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  )
  await expect(stat(page, 'workouts').value).toHaveText('3')
  await expect(stat(page, 'workouts').change).toHaveText(`▲ 1 ${vs}`)
  await expect(stat(page, 'sets').value).toHaveText('6')
  await expect(stat(page, 'sets').change).toHaveText(`Same ${vs}`)
  await expect(stat(page, 'volume').value).toHaveText('4,300 lb')
  await expect(stat(page, 'volume').change).toHaveText(`▲ 300 lb ${vs}`)
  await expect(stat(page, 'time').value).toHaveText('2 min')
  await expect(stat(page, 'time').change).toHaveText(`▲ 1 min ${vs}`)
  await expect(stat(page, 'records').value).toHaveText('4')
  await expect(stat(page, 'records').change).toHaveText(`▲ 2 ${vs}`)

  const records = page.getByTestId('report-record')
  await expect(records).toHaveText([
    `E2E Bench5 × 155 lb${shortDate(at(1, 3))}`,
    `E2E Squat5 × 195 lb${shortDate(at(1, 3))}`,
    `E2E Squat5 × 200 lb${shortDate(at(1, 10))}`,
    `E2E Bench5 × 160 lb${shortDate(at(1, 17))}`,
  ])
  // Est. 1RM: squat 216 -> 233, bench 175 -> 187.
  await expect(page.getByTestId('report-gain')).toHaveText(['E2E Squat+17 lbnow 233', 'E2E Bench+12 lbnow 187'])
  await expect(page.getByTestId('report-muscle')).toHaveText(['Chest3 setsSame', 'Legs2 setsSame', 'Arms1.5 setsSame'])

  // The month before is one tap back, compared with the one before it.
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(page).toHaveURL(/month=/)
  await expect(stat(page, 'workouts').value).toHaveText('2')
  await expect(stat(page, 'records').value).toHaveText('2')
  await expect(stat(page, 'records').change).toHaveText(`▲ 2 vs ${monthName(3)}`)
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(stat(page, 'workouts').value).toHaveText('3')
  await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled()

  // History from last year offers the year recap.
  await page.getByRole('button', { name: 'Year', exact: true }).click()
  await expect(page.getByRole('heading', { name: `${now.getFullYear() - 1} recap` })).toBeVisible()
  await expect(page.getByTestId('report-period')).toHaveText(String(now.getFullYear() - 1))
  await expect(page.getByRole('button', { name: 'Previous year' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next year' })).toBeDisabled()
  // Nothing was logged before that year, so there's nothing to compare with.
  await expect(stat(page, 'workouts').value).toBeVisible()
  await expect(page.getByTestId('report-stat-change')).toHaveCount(0)
})
