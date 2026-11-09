import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { openAccountSection } from '../fixtures/account'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #155: free users earn Premium trial passes at milestones. Crossing 10
// workouts earns one; a Themes pass applies a theme for 7 days, then the app
// is back on Classic with one end note.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'
const DAY = 24 * 60 * 60 * 1000

// 9 earlier workouts of 3 equal sets (no records), one a day, so the 10th
// finished in the test crosses the 10-workout tier.
async function seedNineWorkouts(page: Page) {
  await page.evaluate(async (dayMs) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const now = Date.now()
    const workouts = Array.from({ length: 9 }, (_, i) => ({
      id: `w${i}`,
      performed_at: new Date(now - (i + 1) * dayMs).toISOString(),
      template_id: null,
      notes: null,
    }))
    const { error } = await repos.backup.restore({
      format: 'repbunny-backup',
      version: 2,
      exported_at: new Date().toISOString(),
      exercises: [{ id: 'bench', name: 'Barbell Bench Press', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
      workout_templates: [],
      workout_template_exercises: [],
      workouts,
      sets: workouts.flatMap((w, i) =>
        [0, 1, 2].map((s) => ({
          id: `s${i}-${s}`,
          workout_id: w.id,
          exercise_id: 'bench',
          set_index: s,
          reps: 5,
          weight: 100,
          weight_unit: 'lb',
        })),
      ),
      body_weight_entries: [],
    })
    if (error) throw new Error(error.message)
  }, DAY)
}

async function logFreeformWorkout(page: Page, weights: string[]) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  for (const [i, weight] of weights.entries()) {
    const row = page.locator('.set-row-draft').first()
    await row.getByLabel('Reps').fill('5')
    await row.getByLabel('Weight').fill(weight)
    await row.getByRole('button', { name: 'Add set' }).click()
    await dismissCelebrationIfShown(page)
    await expect(page.locator('.set-row-logged')).toHaveCount(i + 1)
  }
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
}

test('crossing 10 workouts earns a trial pass; a Themes trial applies a theme for 7 days, then ends with one note', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await seedNineWorkouts(page)
  await page.reload()

  // The 10th workout crosses the tier, and the recap offers the pass.
  await logFreeformWorkout(page, ['100', '100', '100'])
  const card = page.getByTestId('recap-milestones')
  const tenth = card.getByTestId('recap-milestone').filter({ hasText: '10 workouts!' })
  // #190: the tier's rest chime is Premium's; a free user gets the pass only.
  await expect(tenth).toContainText('Unlocked: a 7-day Premium trial')
  await expect(tenth).not.toContainText('rest chime')
  await card.getByRole('button', { name: 'Pick a Premium feature to try' }).click()

  const sheet = page.getByRole('dialog', { name: 'Try a Premium feature' })
  await expect(sheet).toContainText('You have 1 trial pass.')
  await sheet.getByRole('button', { name: 'Try Themes' }).click()
  // Issue #489: the sheet confirms the pick and says where to use it.
  const started = page.getByRole('dialog', { name: 'Themes is on' })
  await expect(started).toContainText('Free for 7 days, exactly like Premium. Pick a look on the Theme screen in Preferences.')
  await expect(started.getByRole('button', { name: 'Pick a theme' })).toBeVisible()
  await expect(started.getByRole('link', { name: 'How themes work' })).toHaveAttribute('href', 'https://repbunny.app/guides/themes/')
  await started.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog', { name: /Themes is on|Try a Premium feature/ })).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Pick a Premium feature to try' })).toHaveCount(0)
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  // The Milestones screen shows the running trial.
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: /Milestones/ }).click()
  const trialCard = page.getByTestId('milestones-trial')
  await expect(trialCard).toContainText('Themes is on. Pick a look on the Theme screen in Preferences.')
  await expect(trialCard.getByTestId('trial-note')).toContainText('Trial: 7 days left')
  await expect(trialCard.getByRole('link', { name: 'How themes work' })).toHaveAttribute('href', 'https://repbunny.app/guides/themes/')

  // During the trial a pick is saved and applied, like Premium, with the note.
  // Issue #489: the card's Pick a theme opens the Theme screen in one tap.
  await trialCard.getByRole('button', { name: 'Pick a theme' }).click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  await expect(theme.getByTestId('trial-note')).toContainText('Trial: 7 days left')
  await expect(theme.getByText('Premium', { exact: true })).toHaveCount(0)
  await theme.getByRole('button', { name: 'Halloween', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Theme preview' })).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'halloween')
  await theme.getByRole('button', { name: 'Close' }).click()

  // Four days on, it counts down.
  await page.clock.fastForward(4 * DAY)
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: /Milestones/ }).click()
  await expect(page.getByTestId('milestones-trial').getByTestId('trial-note')).toContainText('Trial: 3 days left')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'halloween')

  // Past 7 days: back to Classic, and Home says so once.
  await page.clock.fastForward(4 * DAY)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')
  await expect(page.getByTestId('milestones-trial')).toHaveCount(0)
  await goTo(page, 'Home')
  const ended = page.getByRole('region', { name: 'Trial ended' })
  await expect(ended).toContainText('Your trial of Themes ended.')
  await ended.getByRole('button', { name: 'Close' }).click()
  await expect(ended).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Freeform', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Trial ended' })).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')

  // The pick is kept, not applied: the Theme screen previews Halloween as
  // Premium again.
  const prefsAgain = await openAccountSection(page, 'Preferences')
  await prefsAgain.getByRole('button', { name: /^Theme/ }).click()
  const themeAgain = page.getByRole('dialog', { name: 'Theme', exact: true })
  await expect(themeAgain.getByTestId('trial-note')).toHaveCount(0)
  await expect(themeAgain.getByRole('button', { name: 'Halloween', exact: true })).toContainText('Premium')
  const saved = await page.evaluate(() => localStorage.getItem('repbunny-theme'))
  expect(saved).toBe('halloween')
})

test('Premium users never see trial passes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
  await seedNineWorkouts(page)
  await page.reload()

  await logFreeformWorkout(page, ['100', '100', '100'])
  const card = page.getByTestId('recap-milestones')
  const tenth = card.getByTestId('recap-milestone').filter({ hasText: '10 workouts!' })
  await expect(tenth).toBeVisible()
  await expect(tenth).not.toContainText('Premium trial')
  // #190: Premium earns the tier's Extra instead.
  await expect(tenth).toContainText('Unlocked: Cartoon boing rest chime')
  await expect(card.getByRole('button', { name: 'Pick a Premium feature to try' })).toHaveCount(0)
  const granted = await page.evaluate(async () => {
    const { readTrialState } = await window.__rbImport('/src/lib/trialPass.ts')
    return readTrialState().granted
  })
  expect(granted).toEqual([])
})
