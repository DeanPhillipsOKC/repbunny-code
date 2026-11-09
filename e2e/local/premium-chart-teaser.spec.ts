import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #115: once a free user's lift is in its 5th workout, the finish
// recap shows that lift's est. 1RM line blurred, once, with See Premium
// (opens the Premium sheet) and Not now. Never again after that, and never
// with Premium.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'E2E Bench'
const TITLE = `You've logged ${BENCH} 5 times`

// Restores a backup with four earlier bench workouts.
async function seedBench(page: Page) {
  const daysAgo = [40, 30, 20, 10].map((d) => new Date(Date.now() - d * 86_400_000).toISOString())
  await page.evaluate(
    async ({ dates, name }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [{ id: 'e1', name, muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
        workout_templates: [],
        workout_template_exercises: [],
        workouts: dates.map((at: string, i: number) => ({ id: `w${i}`, performed_at: at, template_id: null, notes: null })),
        sets: dates.map((_: string, i: number) => ({
          id: `s${i}`,
          workout_id: `w${i}`,
          exercise_id: 'e1',
          set_index: 0,
          reps: 8,
          weight: 135 + i * 10,
          weight_unit: 'lb',
        })),
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { dates: daysAgo, name: BENCH },
  )
}

async function setUp(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await seedBench(page)
  await page.reload()
}

// Logs one bench set in a freeform workout and finishes it, leaving the
// recap open.
async function logBenchAndFinish(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  const draft = page.locator('.set-row-draft').first()
  await draft.getByLabel('Reps').fill('8')
  await draft.getByLabel('Weight').fill('175')
  await draft.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged').first()).toBeVisible()
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('recap-week')).toBeVisible()
}

async function closeRecap(page: Page) {
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()
}

test('local mode: the 5th workout of a lift shows the blurred chart teaser once', async ({ page }) => {
  await setUp(page)
  const premium = page.getByRole('dialog', { name: 'Premium' })

  await logBenchAndFinish(page)
  const teaser = page.getByRole('group', { name: 'Est. 1RM preview' })
  await expect(teaser).toBeVisible()
  await expect(teaser.getByRole('heading', { name: TITLE })).toBeVisible()
  await expect(teaser).toContainText('Premium shows its est. 1RM trend, volume, and all-time chart.')
  // The blurred line has a point per workout.
  await expect(teaser.locator('circle')).toHaveCount(5)

  // See Premium opens the sheet over the recap, and the teaser stays.
  await teaser.getByRole('button', { name: 'See Premium' }).click()
  await expect(premium.getByRole('heading', { name: 'Lift progress analytics' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await expect(premium).toHaveCount(0)
  await expect(teaser).toBeVisible()

  // Not now hides it.
  await teaser.getByRole('button', { name: 'Not now' }).click()
  await expect(teaser).toHaveCount(0)
  await closeRecap(page)

  // Shown once: the 6th workout's recap doesn't bring it back.
  await logBenchAndFinish(page)
  await expect(page.getByRole('group', { name: 'Est. 1RM preview' })).toHaveCount(0)
  await closeRecap(page)

  // The dev toggle's reset (#113) brings it back for the next one.
  await page.evaluate(async () => {
    const { resetPremiumHints } = await window.__rbImport('/src/lib/premium.ts')
    resetPremiumHints()
  })
  await logBenchAndFinish(page)
  await expect(page.getByRole('group', { name: 'Est. 1RM preview' }).getByRole('heading', { name: `You've logged ${BENCH} 7 times` })).toBeVisible()
})

test('local mode: with Premium, the 5th workout shows no teaser and the real chart opens', async ({ page }) => {
  await setUp(page)
  const teaser = page.getByRole('group', { name: 'Est. 1RM preview' })

  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
  await logBenchAndFinish(page)
  await expect(teaser).toHaveCount(0)
  // The real chart opens from the recap row instead.
  await page.getByTestId('post-finish-card').getByRole('button', { name: new RegExp(`^${BENCH} progress`) }).click()
  await expect(page.getByRole('dialog', { name: `${BENCH} history` }).getByRole('img', { name: /^Est\. 1RM over/ })).toBeVisible()
})
