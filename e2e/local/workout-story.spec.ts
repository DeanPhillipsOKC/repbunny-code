import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown, skipUnlockCelebrations } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #158: a workout with a swap, a skipped exercise, or planned sets left
// saves its story. Charts mark that session, tapping tells the story (an
// exercise chart only its own part), and the Workout log shows it on the
// card. Backup and restore keep it.

const TEMPLATE = 'Leg Day'
const SWAP_LINE = 'Leg Press was taken, so you did Hack Squat (2 sets).'
const SKIP_LINE = 'Skipped Standing Calf Raise.'
const LEFT_LINE = 'Finished with 1 planned set left.'

// A freeform Hack Squat session (so it ranks first as a swap and has a chart
// once it's logged again) and one plain Leg Day session.
async function seed(page: Page) {
  const at = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
  await page.evaluate(
    async ({ hack, plain, template }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const exercise = (id: string, name: string, library_id: string, load_type: string) => ({
        id, name, library_id, load_type, muscle_group: 'legs', also_works: [], is_archived: false,
      })
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [
          exercise('lp', 'Leg Press', 'leg_press', 'weight'),
          exercise('hs', 'Hack Squat', 'hack_squat', 'weight'),
          exercise('cr', 'Standing Calf Raise', 'standing_calf_raise', 'bodyweight'),
        ],
        workout_templates: [{ id: 't1', name: template, is_archived: false, category: 'lower' }],
        workout_template_exercises: [
          { id: 'te1', template_id: 't1', exercise_id: 'lp', position: 0, target_sets: 2 },
          { id: 'te2', template_id: 't1', exercise_id: 'cr', position: 1, target_sets: 2 },
        ],
        workouts: [
          { id: 'w0', performed_at: hack, template_id: null, notes: null },
          { id: 'w1', performed_at: plain, template_id: 't1', notes: null },
        ],
        sets: [
          { id: 's0', workout_id: 'w0', exercise_id: 'hs', set_index: 0, reps: 10, weight: 200, weight_unit: 'lb' },
          { id: 's1', workout_id: 'w1', exercise_id: 'lp', set_index: 0, reps: 12, weight: 300, weight_unit: 'lb' },
          { id: 's2', workout_id: 'w1', exercise_id: 'lp', set_index: 1, reps: 12, weight: 300, weight_unit: 'lb' },
          { id: 's3', workout_id: 'w1', exercise_id: 'cr', set_index: 2, reps: 15, weight: 0, weight_unit: 'lb' },
          { id: 's4', workout_id: 'w1', exercise_id: 'cr', set_index: 3, reps: 15, weight: 0, weight_unit: 'lb' },
        ],
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
      const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
      setPremiumUnlocked(true)
    },
    { hack: at(10), plain: at(5), template: TEMPLATE },
  )
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function expectStories(page: Page) {
  // Workout log: the newest card is expanded, with the whole story.
  await goTo(page, 'Progress')
  await page.goto('/progress/workouts')
  const stories = page.getByTestId('workout-story')
  await expect(stories).toHaveCount(1)
  await expect(stories).toHaveText(`${SWAP_LINE}${SKIP_LINE}${LEFT_LINE}`)

  // Routine progress: one marked point, and the story in the session card.
  await page.goto('/progress/templates')
  await page.getByRole('link', { name: new RegExp(`^${TEMPLATE}`) }).click()
  await expect(page.getByTestId('story-marker')).toHaveCount(1)
  const session = page.getByTestId('template-session')
  await expect(session.getByTestId('workout-story')).toHaveText(`${SWAP_LINE}${SKIP_LINE}${LEFT_LINE}`)
  // The plain session before it has no story.
  await page.locator('.hit').first().click()
  await expect(session).toContainText('Selected session')
  await expect(session.getByTestId('workout-story')).toHaveCount(0)

  // Hack Squat's chart: the swap and its own set left undone, not the calf
  // raise's skip, under the chart once its point is tapped.
  await page.goto('/progress/lifts')
  await page.locator('.lift-row', { hasText: 'Hack Squat' }).click()
  const history = page.getByRole('dialog', { name: 'Hack Squat history' })
  await expect(history.getByTestId('story-marker')).toHaveCount(1)
  await expect(history.getByTestId('workout-story')).toHaveCount(0)
  await history.getByTestId('story-marker').click()
  const story = history.getByTestId('workout-story')
  await expect(story).toHaveText(new RegExp(`^\\w{3} \\d{1,2}: ${escape(SWAP_LINE)}${escape(LEFT_LINE)}$`))
  await history.getByRole('button', { name: 'Close history' }).click()
}

test('local mode: a swap and an early finish tell their story on the charts and the log', async ({ page }) => {
  // #187: the first workout unlocks Extras; that screen isn't what's tested here.
  await skipUnlockCelebrations(page)
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await seed(page)
  await page.reload()

  // Leg Day: the Leg Press is taken, so Hack Squat takes its 2 sets; one is
  // logged, the calf raise is skipped, and the workout ends early.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: TEMPLATE, exact: true }).click()
  const card = page.locator('.exercise-card').last()
  await expect(card.locator('.exercise-card-name')).toHaveText('Leg Press')
  await page.getByRole('button', { name: 'Swap exercise' }).click()
  const swapSheet = page.getByRole('dialog', { name: 'Try instead' })
  await swapSheet.getByRole('button', { name: /^Hack Squat/ }).click()
  await expect(card.locator('.exercise-card-name')).toHaveText('Hack Squat')
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('10')
  await row.getByLabel('Weight').fill('210')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  const skipRest = page.getByRole('button', { name: 'Skip Rest' })
  if (await skipRest.isVisible()) await skipRest.click()
  await expect(card).toContainText('1 of 2 sets logged')

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('dialog', { name: 'Finish now?' }).getByRole('button', { name: 'Finish anyway' }).click()
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  await expectStories(page)

  // Nothing overflows a phone with the story strip showing.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // A backup restored onto a fresh database keeps the story, pointed at the
  // restored exercises' new ids.
  await page.evaluate(async () => {
    const { buildBackup } = await window.__rbImport('/src/lib/backup.ts')
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const file = await buildBackup()
    const { error } = await repos.backup.restore(JSON.parse(JSON.stringify(file)))
    if (error) throw new Error(error.message)
  })
  await page.reload()
  await expectStories(page)
})
