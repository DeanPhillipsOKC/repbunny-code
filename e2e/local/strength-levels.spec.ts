import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { openAccountSection } from '../fixtures/account'

// Issue #136: strength levels (Premium) under Progress. Free users get the
// blurred preview and no question; Premium asks for sex once (saying why and
// what skipping turns off), "Prefer not to say" shows a prompt instead, and
// with a weigh-in the levels and overall score match the seed.

// 200 lb lifter. Squat 1 x 300 (1.5x, Intermediate), bench 5 x 200
// (est. 233, 1.17x, Intermediate), deadlift 1 x 600 (3x, Elite). A dumbbell
// bench (5 x 60, est. 70 per dumbbell, Novice) and a leg press (1 x 400, 2x,
// Novice) are rated but don't lower the overall: it takes each movement's best.
async function seed(page: Page) {
  await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const at = new Date(Date.now() - 2 * 86400000).toISOString()
    const { error } = await repos.backup.restore({
      format: 'repbunny-backup',
      version: 2,
      exported_at: new Date().toISOString(),
      exercises: [
        // Counted by name (no library id), like an exercise typed by hand.
        { id: 'squat', name: 'Back Squat', muscle_group: 'legs', also_works: [], load_type: 'weight', is_archived: false },
        { id: 'bench', name: 'E2E Bench', library_id: 'barbell_bench_press', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false },
        { id: 'dead', name: 'E2E Pull', library_id: 'deadlift', muscle_group: 'back', also_works: [], load_type: 'weight', is_archived: false },
        { id: 'dbb', name: 'E2E DB Bench', library_id: 'dumbbell_bench_press', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false },
        { id: 'lp', name: 'Leg Press', muscle_group: 'legs', also_works: [], load_type: 'weight', is_archived: false },
        { id: 'sl', name: 'Single Leg Press', muscle_group: 'legs', also_works: [], load_type: 'weight', is_archived: false },
        { id: 'curl', name: 'E2E Curl', muscle_group: 'arms', also_works: [], load_type: 'weight', is_archived: false },
      ],
      workout_templates: [],
      workout_template_exercises: [],
      workouts: [{ id: 'w1', performed_at: at, template_id: null, notes: null }],
      sets: [
        ['squat', 1, 300],
        ['bench', 5, 200],
        ['dead', 1, 600],
        ['dbb', 5, 60],
        ['lp', 1, 400],
        ['sl', 1, 275],
        ['curl', 1, 500],
      ].map(([exercise, reps, weight], i) => ({
        id: `s${i}`,
        workout_id: 'w1',
        exercise_id: exercise,
        set_index: i,
        reps,
        weight,
        weight_unit: 'lb',
      })),
      body_weight_entries: [{ id: 'bw', weight: 200, weight_unit: 'lb', recorded_at: at }],
    })
    if (error) throw new Error(error.message)
  })
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

test('local mode: strength levels are a Premium preview for free, then ask once and rate the seeded lifts', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page)
  await page.reload()

  // Free: blurred preview, and the question isn't asked yet.
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: /^Strength levels/ }).click()
  await expect(page).toHaveURL(/\/progress\/strength$/)
  const preview = page.getByRole('group', { name: 'Strength levels are part of Premium preview' })
  await expect(preview).toBeVisible()
  await expect(page.getByRole('group', { name: 'Sex for strength standards' })).toHaveCount(0)
  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByRole('heading', { name: 'Strength levels' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()

  // Premium: the question, with why and what skipping costs, before any answer.
  await setPremium(page, true)
  const question = page.getByRole('region', { name: 'One question first' })
  await expect(question).toBeVisible()
  await expect(question.getByTestId('strength-sex-why')).toContainText('Used only to pick the right strength standards')
  await expect(question.getByTestId('strength-sex-why')).toContainText('stays on this device')
  await expect(question.getByTestId('strength-sex-skip')).toHaveText(
    "Without this, strength levels won't show, and starting weights for new lifts will come from a test set instead of an estimate. Everything else works the same.",
  )

  // Prefer not to say: a friendly prompt where the levels would be.
  await question.getByRole('button', { name: 'Prefer not to say' }).click()
  const prompt = page.getByTestId('strength-prompt')
  await expect(prompt).toContainText('Levels are off for now')
  await expect(page.getByTestId('strength-overall')).toHaveCount(0)
  await prompt.getByRole('button', { name: 'Answer now' }).click()
  await page.getByRole('region', { name: 'One question first' }).getByRole('button', { name: 'Male', exact: true }).click()

  await expect(page.getByTestId('strength-overall-tier')).toHaveText('Intermediate')
  await expect(page.getByTestId('strength-overall-score')).toHaveText('71/100')
  const squat = page.getByTestId('strength-lift-squat')
  await expect(squat.getByTestId('strength-tier')).toHaveText('Intermediate')
  await expect(squat.getByTestId('strength-next')).toHaveText('100 lb to Advanced')
  await expect(page.getByTestId('strength-lift-bench').getByTestId('strength-next')).toHaveText('40 lb to Advanced')
  const dead = page.getByTestId('strength-lift-deadlift')
  await expect(dead.getByTestId('strength-tier')).toHaveText('Elite')
  await expect(dead.getByTestId('strength-next')).toHaveText('Top of the table. Nice work.')
  // The curl isn't one of the five lifts.
  await expect(page.getByRole('list', { name: 'Lifts' }).getByRole('listitem')).toHaveCount(5)
  const dbBench = page.getByTestId('strength-lift-db_bench')
  await expect(dbBench.getByTestId('strength-tier')).toHaveText('Novice')
  await expect(dbBench).toContainText('70 lb est. 1RM per dumbbell')
  // The single-leg press (1 x 275, est. 500 two-leg) beats the two-leg 400 and says so.
  const legPress = page.getByTestId('strength-lift-leg_press')
  await expect(legPress).toContainText('Machines vary')
  await expect(legPress).toContainText('500 lb est. two-leg 1RM')
  await expect(legPress.getByTestId('strength-one-sided')).toContainText('From your one-leg sets')
  await expect(legPress.getByTestId('strength-next')).toHaveText('30 lb on one leg to Intermediate')
  await expect(page.getByTestId('strength-unrated')).toHaveText('Nothing rated yet for overhead presses, rows, pull-ups and pulldowns.')

  // Preferences changes it, with the same explanation, and the screen follows.
  const prefs = await openAccountSection(page, 'Preferences')
  const picker = prefs.getByRole('group', { name: 'Sex for strength standards' })
  await expect(picker.getByRole('button', { name: 'Male', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(prefs.getByTestId('strength-sex-skip')).toBeVisible()
  await picker.getByRole('button', { name: 'Female' }).click()
  await prefs.getByRole('button', { name: 'Close' }).click()
  await expect(squat.getByTestId('strength-tier')).toHaveText('Advanced')

  // Survives a reload (kept on the device).
  await page.reload()
  await expect(page.getByTestId('strength-lift-squat').getByTestId('strength-tier')).toHaveText('Advanced')
})

test('local mode: without a weigh-in, strength levels ask for one', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await setPremium(page, true)
  await page.evaluate(async () => {
    const { setStrengthSex } = await window.__rbImport('/src/lib/strengthLevels.ts')
    setStrengthSex('male')
  })
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: /^Strength levels/ }).click()
  const prompt = page.getByTestId('strength-prompt')
  await expect(prompt).toContainText('Log a weigh-in to see your levels')
  await prompt.getByRole('link', { name: 'Log your weight' }).click()
  await expect(page).toHaveURL(/\/body$/)
})
