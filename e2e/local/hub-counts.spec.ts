import { test, expect, type Page } from '@playwright/test'
import { startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Issue #581: the Progress hub's "new bests" and "records" counts open a sheet
// listing exactly what each counted, with the rule it uses. A lighter
// high-rep set is a record but not a new best (its Est. 1RM is lower); a
// heavier low-rep set is a new best but not a record (its weight × reps is
// lower).

const BENCH = 'E2E Hub Counts Bench'

// [weight, reps, seconds ago]
type SeedSet = [weight: number, reps: number, secondsAgo: number]

async function seedBench(page: Page, sets: SeedSet[]) {
  await page.evaluate(
    async ({ sets, name }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [{ id: 'e1', name, muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
        workout_templates: [],
        workout_template_exercises: [],
        workouts: sets.map(([, , secondsAgo], i) => ({
          id: `w${i}`,
          performed_at: new Date(Date.now() - secondsAgo * 1000).toISOString(),
          template_id: null,
          notes: null,
        })),
        sets: sets.map(([weight, reps], i) => ({
          id: `s${i}`,
          workout_id: `w${i}`,
          exercise_id: 'e1',
          set_index: 0,
          reps,
          weight,
          weight_unit: 'lb',
        })),
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { sets, name: BENCH },
  )
}

const DAY = 86_400

// 150 × 8 (Est. 1RM 190, product 1,200) is the best going in. Today, 12 × 120
// is a record (1,440) with a lower Est. 1RM (168); 6 × 160 is a new best
// (Est. 1RM 192) and not a record (960).
async function start(page: Page, premium = true) {
  await page.setViewportSize({ width: 375, height: 800 })
  await startLocal(page, { weightUnit: 'lb', premium })
  await seedBench(page, [
    [100, 5, 50 * DAY],
    [150, 8, 40 * DAY],
    [120, 12, 20],
    [160, 6, 10],
  ])
  await page.reload()
  await goTo(page, 'Progress')
}

test('hub counts: "new bests" lists the heavier set and its chart, "records" lists the lighter set and its record check', async ({ page }) => {
  await start(page)
  await expect(page.getByTestId('hub-new-bests')).toHaveText('1')
  await expect(page.getByTestId('hub-week-line')).toContainText('1 record')

  await page.getByRole('button', { name: '1 new best, show them' }).click()
  const bests = page.getByRole('dialog', { name: '1 new best' })
  await expect(bests).toContainText("A lift's highest point ever on its chart")
  await expect(bests.getByRole('listitem')).toHaveCount(1)
  await expect(bests.getByRole('listitem')).toContainText(BENCH)
  await expect(bests.getByRole('listitem')).toContainText('6 × 160 lb')
  await expect(bests.getByRole('listitem')).toContainText('Est. 1RM 192 lb')
  await expect(bests).not.toContainText('12 × 120 lb')

  // The difference opens in place, and links to the other list.
  await bests.getByRole('button', { name: "What's the difference from records?" }).click()
  await expect(page.getByTestId('hub-count-difference')).toContainText('Records compare one set with another')
  await bests.getByRole('button', { name: 'See the 1 record ›' }).click()

  const records = page.getByRole('dialog', { name: '1 record' })
  await expect(records).toContainText('single set that beats your best weight × reps')
  await expect(records.getByRole('listitem')).toHaveCount(1)
  await expect(records.getByRole('listitem')).toContainText('12 × 120 lb')
  await expect(records.getByRole('listitem')).toContainText('Beat 8 × 150 lb')
  await expect(records).not.toContainText('6 × 160 lb')

  // Check opens the lift's history with the record check for that set (#579).
  await records.getByRole('button', { name: `Check the 12 × 120 lb set of ${BENCH}` }).click()
  await expect(records).toBeHidden()
  const check = page.getByRole('dialog', { name: 'Record check', exact: true })
  await expect(check.getByRole('heading', { name: '120 lb × 12: a record' })).toBeVisible()
  await check.getByRole('button', { name: 'Close' }).click()
  const history = page.getByRole('dialog', { name: `${BENCH} history` })
  await expect(history).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(history).toBeHidden()

  // Chart opens the lift's history from the new bests list.
  await page.getByRole('button', { name: '1 record this week, show them' }).click()
  await page.getByRole('dialog', { name: '1 record' }).getByRole('button', { name: "What's the difference from new bests?" }).click()
  await page.getByRole('button', { name: 'See the 1 new best ›' }).click()
  await page.getByRole('dialog', { name: '1 new best' }).getByRole('button', { name: `Chart for ${BENCH}` }).click()
  await expect(history).toBeVisible()
})

test('hub counts: free users see the set behind a best, never its Est. 1RM; This looks wrong prefills a report', async ({ page }) => {
  await start(page, false)
  await page.getByRole('button', { name: '1 new best, show them' }).click()
  const bests = page.getByRole('dialog', { name: '1 new best' })
  await expect(bests.getByRole('listitem')).toContainText('6 × 160 lb')
  await expect(bests).not.toContainText('192')

  await bests.getByRole('button', { name: 'This looks wrong' }).click()
  await expect(bests).toBeHidden()
  await expect(page.getByLabel(/What happened/)).toHaveValue(/Screen: Progress › New bests/)
})

test('hub counts: a zero still opens with its rule', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await startLocal(page)
  await goTo(page, 'Progress')
  await page.getByRole('button', { name: '0 records this week, show them' }).click()
  const records = page.getByRole('dialog', { name: '0 records' })
  await expect(records).toContainText('No records yet this week.')
  await records.getByRole('button', { name: 'Close' }).click()
  await expect(records).toBeHidden()
})
