import { test, expect, type Page } from '@playwright/test'
import { startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Issue #578: tapping a dot on a lift's chart shows its receipt (the Epley
// line or the Volume sum, and the session before it), and See the sets ›
// scrolls to that session's card with the set behind the point highlighted.
// The change pill shows its own math.

const BENCH = 'E2E Receipt Bench'

type SeedSet = [weight: number, reps: number]

// Twelve bench sessions inside 3 months, newest first: the first three are
// the ones the receipts check, the nine older ones push the oldest past the
// Sessions list's first page.
async function seedBench(page: Page) {
  const sessions: { daysAgo: number; sets: SeedSet[] }[] = [
    { daysAgo: 10, sets: [[150, 8], [150, 8], [150, 7]] },
    { daysAgo: 20, sets: [[145, 8]] },
    { daysAgo: 30, sets: [[140, 8], [140, 8]] },
    ...Array.from({ length: 9 }, (_, i) => ({ daysAgo: 40 + i * 5, sets: [[120, 5]] as SeedSet[] })),
  ]
  await page.evaluate(
    async ({ sessions, name }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [{ id: 'e1', name, muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
        workout_templates: [],
        workout_template_exercises: [],
        workouts: sessions.map((s, i) => ({
          id: `w${i}`,
          performed_at: new Date(Date.now() - s.daysAgo * 86_400_000).toISOString(),
          template_id: null,
          notes: null,
        })),
        sets: sessions.flatMap((s, i) =>
          s.sets.map(([weight, reps], j) => ({
            id: `s${i}-${j}`,
            workout_id: `w${i}`,
            exercise_id: 'e1',
            set_index: j,
            reps,
            weight,
            weight_unit: 'lb',
          })),
        ),
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { sessions, name: BENCH },
  )
}

async function openBench(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 })
  await startLocal(page, { weightUnit: 'lb' })
  await seedBench(page)
  await page.reload()
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await page.locator('.lift-row', { hasText: BENCH }).click()
  const history = page.getByRole('dialog', { name: `${BENCH} history` })
  await expect(history.getByRole('group', { name: 'Chart metric' }).getByRole('button', { name: 'Est. 1RM' })).toHaveAttribute('aria-pressed', 'true')
  return history
}

test('Est. 1RM point shows the Epley math and the previous session, and See the sets highlights the set', async ({ page }) => {
  const history = await openBench(page)

  await history.locator('.hit').last().click()
  const receipt = history.locator('.tooltip.receipt')
  await expect(receipt).toContainText('150 lb × 8')
  await expect(receipt).toContainText('150 × (1 + 8 ÷ 30) = 190')
  await expect(receipt).toContainText(/Previous: 145 × 8 on .+ → 184 \(▲ 6\)/)

  await receipt.getByRole('button', { name: 'See the sets ›' }).click()
  // Restore gives the workouts new ids, so the newest card is the first one.
  const card = history.locator('.history-entry').first()
  await expect(card).toHaveClass(/highlighted/)
  await expect(card).toBeInViewport()
  await expect(card.getByRole('columnheader', { name: 'Est. 1RM' })).toBeVisible()
  const rows = card.locator('tbody tr')
  await expect(rows.nth(0)).toHaveClass(/source/)
  await expect(rows.nth(1)).not.toHaveClass(/source/)
  await expect(rows.nth(0).locator('.col-point')).toHaveText('190')
  await expect(rows.nth(2).locator('.col-point')).toHaveText('185')
  await expect(card).toContainText('Set 1 is the one on the chart.')
  // Other cards stay as they were.
  await expect(history.locator('.history-entry.highlighted')).toHaveCount(1)
  await expect(history.locator('.history-entry').nth(1).getByRole('columnheader', { name: 'Est. 1RM' })).toHaveCount(0)

  // This looks wrong opens Report a bug with the point filled in.
  await card.getByRole('button', { name: 'This looks wrong' }).click()
  const box = page.getByRole('dialog', { name: 'Report a bug' }).getByRole('textbox', { name: /What happened/ })
  await expect(box).toHaveValue(/Screen: E2E Receipt Bench › Est\. 1RM chart\nShown: 190 lb on .+\nWorked out from: 150 lb × 8\nRule: Epley/)
  await expect(box).toHaveValue(/Other sets that day: 150 lb × 8, 150 lb × 7/)
})

test('Volume point shows the sum, and See the sets reaches a session past the first page', async ({ page }) => {
  const history = await openBench(page)
  await history.getByRole('group', { name: 'Chart metric' }).getByRole('button', { name: 'Volume' }).click()

  await history.locator('.hit').last().click()
  const receipt = history.locator('.tooltip.receipt')
  await expect(receipt).toContainText('3 sets: 1,200 + 1,200 + 1,050 = 3,450 lb')
  await expect(receipt).toContainText(/Previous: 1,160 lb on .+ \(▲ 2,290\)/)
  await receipt.getByRole('button', { name: 'See the sets ›' }).click()
  const card = history.locator('.history-entry').first()
  await expect(card.getByRole('columnheader', { name: 'Volume' })).toBeVisible()
  await expect(card.locator('tbody tr.source')).toHaveCount(3)
  await expect(card.locator('tbody tr').nth(2).locator('.col-point')).toHaveText('1,050')

  // The oldest session is past the first 10 cards: Show older opens itself.
  await expect(history.locator('.history-entry')).toHaveCount(10)
  await history.locator('.hit').first().click()
  await expect(receipt).toContainText('1 set: 600 lb')
  await receipt.getByRole('button', { name: 'See the sets ›' }).click()
  await expect(history.locator('.history-entry')).toHaveCount(12)
  const oldest = history.locator('.history-entry').last()
  await expect(oldest).toHaveClass(/highlighted/)
  await expect(oldest).toBeInViewport()
})

test('the change pill shows its math', async ({ page }) => {
  const history = await openBench(page)
  await history.locator('.change-pill').click()
  // 120 × (1 + 5 ÷ 30) = 140 on the oldest session in range.
  await expect(history.locator('.pill-math')).toHaveText(/^190 on .+ − 140 on .+ = ▲ 50 lb$/)
  await history.locator('.change-pill').click()
  await expect(history.locator('.pill-math')).toHaveCount(0)
})
