import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #142 (Premium): a warm-up guide up to the target for a barbell or
// dumbbell lift, and a starting weight the first time a weight lift is
// logged, saying where it came from: a related lift, body weight and sex
// (asked once here if #136 hasn't), or a test set.

const PRESS = 'E2E Warm Press'
const INCLINE = 'E2E Warm Incline'
const SQUAT = 'E2E Fresh Squat'

type Seed = {
  exercises: Record<string, unknown>[]
  sets: Record<string, unknown>[]
  bodyWeight?: number
}

async function seed(page: Page, data: Seed) {
  const at = new Date(Date.now() - 3 * 86_400_000).toISOString()
  await page.evaluate(
    async ({ at, data }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: data.exercises,
        workout_templates: [{ id: 't1', name: 'Warm Day', is_archived: false, category: null }],
        workout_template_exercises: data.exercises.map((e, i) => ({
          id: `te${i}`,
          template_id: 't1',
          exercise_id: e.id,
          position: i,
          target_sets: 1,
        })),
        workouts: [{ id: 'w1', performed_at: at, template_id: 't1', notes: null }],
        sets: data.sets,
        body_weight_entries: data.bodyWeight
          ? [{ id: 'bw', weight: data.bodyWeight, weight_unit: 'lb', recorded_at: at }]
          : [],
      })
      if (error) throw new Error(error.message)
    },
    { at, data },
  )
}

async function start(page: Page, data: Seed) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page, data)
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
  await page.reload()
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Warm Day', exact: true }).click()
}

const cardName = (page: Page) => page.locator('.exercise-card').last().locator('.exercise-card-name')

test('local mode: a target shows a rounded warm-up list, and a new lift starts from a related lift', async ({ page }) => {
  await start(page, {
    exercises: [
      { id: 'e1', name: PRESS, library_id: 'barbell_bench_press', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false },
      { id: 'e2', name: INCLINE, library_id: 'incline_barbell_bench_press', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false },
    ],
    // 180 x 12 at RPE 8: set 1's target is 185 x 8, est. 1RM 252.
    sets: [{ id: 's1', workout_id: 'w1', exercise_id: 'e1', set_index: 0, reps: 12, weight: 180, weight_unit: 'lb', rpe: 8 }],
  })
  await expect(cardName(page)).toHaveText(PRESS)
  await expect(page.getByRole('button', { name: 'Fill set 1 with target 185 lb × 8' })).toBeVisible()

  // Warm-up to 185 on a 45 lb bar with 5 lb steps: bar, 75, 110, 150.
  const warmup = page.getByTestId('warmup')
  const toggle = warmup.getByRole('button', { name: /^Warm-up/ })
  await expect(toggle).toContainText('4 sets up to 150 lb')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  const list = page.getByRole('list', { name: 'Warm-up sets' })
  await expect(list).toContainText('Bar (45 lb) × 10')
  await expect(list).toContainText('75 lb × 5')
  await expect(list).toContainText('110 lb × 3')
  await expect(list).toContainText('150 lb × 1')
  await expect(list).toContainText("A guide only. Warm-ups aren't logged.")
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // A warm-up line opens the plate calculator at its weight, and Use leaves
  // the set row alone.
  const row = page.locator('.set-row-draft').first()
  const before = await row.getByLabel('Weight').inputValue()
  await list.getByRole('button', { name: 'Plates for warm-up 110 lb × 3' }).click()
  const sheet = page.getByRole('dialog', { name: 'Load the bar' })
  await expect(sheet.getByLabel('Total weight')).toHaveValue('110')
  await sheet.getByRole('button', { name: /^Use/ }).click()
  await expect(sheet).toHaveCount(0)
  await expect(row.getByLabel('Weight')).toHaveValue(before)
  await expect(page.getByTestId('starting-weight')).toHaveCount(0)

  // The incline has never been logged: 60% of the press's 252 est. 1RM,
  // rounded down on the bar, is 150.
  await page.getByRole('button', { name: 'Next exercise' }).click()
  await expect(cardName(page)).toHaveText(INCLINE)
  const startCard = page.getByTestId('starting-weight')
  await expect(startCard).toContainText(`From your ${PRESS} (est. 1RM 252 lb). Adjust after your first set.`)
  await startCard.getByRole('button', { name: 'Fill set 1 with starting weight 150 lb × 10' }).click()
  const inclineRow = page.locator('.set-row-draft').first()
  await expect(inclineRow.getByLabel('Weight')).toHaveValue('150')
  await expect(inclineRow.getByLabel('Reps')).toHaveValue('10')
  // It gets a warm-up up to the starting weight too.
  await expect(page.getByTestId('warmup').getByRole('button', { name: /^Warm-up/ })).toContainText('4 sets up to 120 lb')
})

test('local mode: a brand-new user is asked once, then gets a body-weight start with its label', async ({ page }) => {
  await start(page, {
    exercises: [{ id: 'e1', name: SQUAT, library_id: 'barbell_back_squat', muscle_group: 'legs', also_works: [], load_type: 'weight', is_archived: false }],
    sets: [],
    bodyWeight: 200,
  })
  await expect(cardName(page)).toHaveText(SQUAT)
  const question = page.getByTestId('starting-weight-question')
  await expect(question).toContainText('Want a starting weight from your body weight?')
  await expect(question).toContainText('Used only to pick the right strength standards')
  await expect(question).toContainText('starting weights for new lifts will come from a test set')
  // Logging isn't blocked by it.
  await expect(page.locator('.set-row-draft').first().getByLabel('Weight')).toBeEnabled()

  // Male, 200 lb: Beginner squat 0.75x = 150, 65% of it rounded down = 95.
  await question.getByRole('button', { name: 'Male', exact: true }).click()
  await expect(question).toHaveCount(0)
  const startCard = page.getByTestId('starting-weight')
  await expect(startCard).toContainText('A rough starting point from your body weight. Adjust after your first set.')
  await expect(startCard.getByRole('button', { name: 'Fill set 1 with starting weight 95 lb × 10' })).toBeVisible()
})

test('local mode: "Prefer not to say" gets the test-set suggestion', async ({ page }) => {
  await start(page, {
    exercises: [{ id: 'e1', name: SQUAT, library_id: 'barbell_back_squat', muscle_group: 'legs', also_works: [], load_type: 'weight', is_archived: false }],
    sets: [],
    bodyWeight: 200,
  })
  await expect(cardName(page)).toHaveText(SQUAT)
  await page.getByTestId('starting-weight-question').getByRole('button', { name: 'Prefer not to say' }).click()
  const startCard = page.getByTestId('starting-weight')
  await expect(startCard).toContainText('Pick a weight you could do about 12 times.')
  await expect(startCard.getByRole('button')).toHaveCount(0)
  await expect(page.getByTestId('warmup')).toHaveCount(0)
})
