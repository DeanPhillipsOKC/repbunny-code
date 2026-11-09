import { test, expect, type Page } from '@playwright/test'
import { startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Issue #579: tapping a set in a lift's Sessions list opens its record
// check: the rule, both weight × reps products, and what would beat it, or,
// for a record, the set it beat. The Workout log's "PR set this workout"
// opens the same sheet for that workout's record set.

const BENCH = 'E2E Record Check Bench'

type SeedSet = [weight: number, reps: number]

// Newest first, the order of the Sessions cards.
async function seedBench(page: Page, sessions: { daysAgo: number; sets: SeedSet[] }[]) {
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

async function start(page: Page, sessions: { daysAgo: number; sets: SeedSet[] }[]) {
  await page.setViewportSize({ width: 375, height: 800 })
  await startLocal(page, { weightUnit: 'lb' })
  await seedBench(page, sessions)
  await page.reload()
}

test('Sessions: a non-record set shows both products and what would beat it; a record names the set it beat', async ({ page }) => {
  await start(page, [
    { daysAgo: 2, sets: [[155, 7], [155, 7]] },
    { daysAgo: 10, sets: [[150, 8]] },
    { daysAgo: 20, sets: [[145, 8]] },
  ])
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await page.locator('.lift-row', { hasText: BENCH }).click()
  const history = page.getByRole('dialog', { name: `${BENCH} history` })

  await history.locator('.history-entry').nth(0).getByRole('button', { name: 'Record check for set 1' }).click()
  const sheet = page.getByRole('dialog', { name: 'Record check', exact: true })
  await expect(sheet.getByRole('heading', { name: '155 lb × 7: not a record, yet' })).toBeVisible()
  await expect(sheet).toContainText('A record is your most weight × reps in a single set.')
  await expect(sheet).toContainText('155 × 7 = 1,085')
  await expect(sheet).toContainText('150 × 8 = 1,200')
  await expect(sheet).toContainText('To beat it')
  await expect(sheet).toContainText('155 × 8')
  await expect(sheet).toContainText('Heaviest yet')

  // Escape closes only the sheet; the history stays open.
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(history).toBeVisible()

  // Tapping anywhere on the record row opens it too.
  await history.locator('.history-entry').nth(1).locator('tbody tr').first().click()
  await expect(sheet.getByRole('heading', { name: '150 lb × 8: a record' })).toBeVisible()
  await expect(sheet).toContainText('Best before it')
  await expect(sheet).toContainText('145 × 8 = 1,160')
  await expect(sheet).toContainText('Beat it by')

  await sheet.getByRole('button', { name: 'Open the set it beat' }).click()
  await expect(sheet).toBeHidden()
  await expect(history.locator('.history-entry').nth(2).locator('tbody tr').first()).toHaveClass(/source/)
})

test('Workout log: "PR set this workout" opens the record check for that set', async ({ page }) => {
  await start(page, [
    { daysAgo: 1, sets: [[160, 8]] },
    { daysAgo: 10, sets: [[150, 8]] },
  ])
  await goTo(page, 'Workout log')
  await page.getByRole('button', { name: 'PR set this workout' }).first().click()

  const sheet = page.getByRole('dialog', { name: 'Record check', exact: true })
  await expect(sheet.getByRole('heading', { name: '160 lb × 8: a record' })).toBeVisible()
  await expect(sheet).toContainText(`${BENCH} · Set 1`)
  await expect(sheet).toContainText('160 × 8 = 1,280')
  await expect(sheet).toContainText('150 × 8 = 1,200')

  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('dialog', { name: `${BENCH} history` })).toBeVisible()
})
