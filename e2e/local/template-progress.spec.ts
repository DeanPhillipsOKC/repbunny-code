import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #157: Routine progress. Free keeps each routine's latest session
// total; the chart is a blurred preview with Keep it with Premium / Go back.
// With Premium the rows get a trend, and the chart's points open each session.

const TEMPLATE = 'E2E Push day'

// Three Push day sessions (bench 8 × 135/145/155 lb, plus a level exercise
// that adds no volume) and one freeform workout that must not count.
async function seed(page: Page) {
  const daysAgo = [40, 20, 5].map((d) => new Date(Date.now() - d * 86_400_000).toISOString())
  const freeform = new Date(Date.now() - 2 * 86_400_000).toISOString()
  await page.evaluate(
    async ({ dates, freeform, template }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [
          { id: 'e1', name: 'E2E Bench', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false },
          { id: 'e2', name: 'E2E Ab Crunch', muscle_group: 'core', also_works: [], load_type: 'level', is_archived: false },
        ],
        workout_templates: [{ id: 't1', name: template, is_archived: false, category: 'upper' }],
        workout_template_exercises: [
          { id: 'te1', template_id: 't1', exercise_id: 'e1', position: 0, target_sets: 2 },
          { id: 'te2', template_id: 't1', exercise_id: 'e2', position: 1, target_sets: 1 },
        ],
        workouts: [
          ...dates.map((at: string, i: number) => ({ id: `w${i}`, performed_at: at, template_id: 't1', notes: null })),
          { id: 'wf', performed_at: freeform, template_id: null, notes: null },
        ],
        sets: [
          ...dates.flatMap((_: string, i: number) => [
            { id: `a${i}`, workout_id: `w${i}`, exercise_id: 'e1', set_index: 0, reps: 8, weight: 135 + i * 10, weight_unit: 'lb' },
            { id: `b${i}`, workout_id: `w${i}`, exercise_id: 'e1', set_index: 1, reps: 6, weight: 135 + i * 10, weight_unit: 'lb' },
            { id: `c${i}`, workout_id: `w${i}`, exercise_id: 'e2', set_index: 2, reps: 15, weight: 0, weight_unit: 'lb', level: 6 + i },
          ]),
          { id: 'f0', workout_id: 'wf', exercise_id: 'e1', set_index: 0, reps: 5, weight: 300, weight_unit: 'lb' },
        ],
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { dates: daysAgo, freeform, template: TEMPLATE },
  )
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

test('local mode: template progress shows the latest total free, and the chart with Premium', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page)
  await page.reload()

  // Hub tile: the latest template and its last total. 155 × 14 = 2,170 lb.
  await goTo(page, 'Progress')
  const tile = page.getByRole('link', { name: /^Routine progress/ })
  await expect(tile).toContainText(TEMPLATE)
  await expect(tile).toContainText('2,170 lb')
  await tile.click()
  await expect(page).toHaveURL(/\/progress\/templates$/)
  await expect(page.getByRole('heading', { name: 'Routine progress' })).toBeVisible()

  // Free: the latest total, no trend.
  const row = page.getByRole('link', { name: `${TEMPLATE}, 2,170 lb` })
  await expect(row).toContainText('3 sessions')
  await expect(row.locator('svg.sparkline, .template-spark')).toHaveCount(0)
  await expect(row).not.toContainText('▲')

  // The chart is a preview; Go back returns to the list.
  await row.click()
  // Restore gives the template a new id.
  await expect(page).toHaveURL(/\/progress\/templates\/[\w-]+$/)
  await expect(page.getByTestId('template-latest-volume')).toContainText('2,170 lb')
  const preview = page.getByRole('group', { name: 'Routine progress is part of Premium preview' })
  await expect(preview).toBeVisible()
  await expect(page.getByTestId('template-session')).toHaveCount(0)
  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect(page).toHaveURL(/\/progress\/templates$/)

  // Keep it with Premium opens the sheet.
  await row.click()
  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  await expect(page.getByRole('dialog', { name: 'Premium' })).toBeVisible()

  // With Premium: trend on the row, the chart, and the sessions.
  await setPremium(page, true)
  await page.goto('/progress/templates')
  await expect(row).toContainText('▲ 280')
  await row.click()
  await expect(preview).toHaveCount(0)
  await expect(page.getByTestId('template-latest-volume')).toHaveCount(0)
  const ranges = page.getByRole('group', { name: 'Chart range' })
  await expect(ranges.getByRole('button', { name: '3M' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('img', { name: 'Total volume over 3 months, from 1,890 to 2,170 lb' })).toBeVisible()

  // The latest session shows until a point is tapped. Freeform's 300 lb never counts.
  const session = page.getByTestId('template-session')
  await expect(session).toContainText('Latest session')
  await expect(session).toContainText('2,170 lb')
  await expect(session.getByRole('listitem')).toHaveText([/E2E Bench\s*8 × 155 lb\s*2 sets/, /E2E Ab Crunch\s*15 × Level 8\s*1 set/])

  // Tap the first point (40 days ago): 135 × 14 = 1,890 lb.
  await page.locator('.hit').first().click()
  await expect(session).toContainText('Selected session')
  await expect(session).toContainText('1,890 lb')
  await expect(session.getByRole('listitem').first()).toContainText('8 × 135 lb')

  // Nothing overflows a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
