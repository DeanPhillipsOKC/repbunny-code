import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #180: a user asked what the glowing dots on the Workout log meant.
// When a workout in the list set a record, a key line explains the glowing
// dot, and the dot itself has an accessible name. No records, no key line.

const now = Date.now()
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString()

async function seed(page: Page, weights: number[]) {
  await page.evaluate(async ({ weights, at }) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const { error } = await repos.backup.restore({
      format: 'repbunny-backup',
      version: 2,
      exported_at: new Date().toISOString(),
      exercises: [{ id: 'bench', name: 'E2E Bench', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
      workout_templates: [],
      workout_template_exercises: [],
      workouts: weights.map((_, i) => ({ id: `w${i}`, performed_at: at[i], template_id: null, notes: null })),
      sets: weights.map((weight, i) => ({
        id: `s${i}`,
        workout_id: `w${i}`,
        exercise_id: 'bench',
        set_index: 0,
        reps: 10,
        weight,
        weight_unit: 'lb',
      })),
      body_weight_entries: [],
    })
    if (error) throw new Error(error.message)
  }, { weights, at: weights.map((_, i) => daysAgo(weights.length - i)) })
}

async function openLog(page: Page, weights: number[]) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page, weights)
  await page.reload()
  await goTo(page, 'Workout log')
  await expect(page.locator('.timeline-row')).toHaveCount(weights.length)
}

test('local mode: the Workout log explains the record dot when a workout set a record', async ({ page }) => {
  // The second workout beats the first, so it set a record.
  await openLog(page, [100, 110])

  await expect(page.getByTestId('record-dot-key')).toHaveText('Set a record')
  await expect(page.getByRole('img', { name: 'Set a record' })).toHaveCount(1)
})

test('local mode: no record dots, no key line', async ({ page }) => {
  await openLog(page, [100, 100])

  await expect(page.getByTestId('record-dot-key')).toHaveCount(0)
  await expect(page.getByRole('img', { name: 'Set a record' })).toHaveCount(0)
})
