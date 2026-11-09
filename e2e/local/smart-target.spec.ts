import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { openEditExerciseSheet } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #140: Premium's next-set target. Free keeps today's Next time card
// and no targets in the logger. With Premium each open row shows its own
// "Target ..." chip (issue #160), built from the same set last session and
// its RPE (today's logged sets don't move it), with "Why?" and a tap that
// fills that row. "Next-set targets" off in the exercise sheet hides them.

const PRESS = 'E2E Target Press'

// Last session (3 days ago): 180 x 12 at RPE 8 is the top set, so the normal
// step goes up to 185 for 8 reps. Est. 1RM 180 x 12 = 252; 185 is 73% of it.
async function seed(page: Page) {
  const at = new Date(Date.now() - 3 * 86_400_000).toISOString()
  await page.evaluate(
    async ({ at, name }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [{ id: 'e1', name, muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
        workout_templates: [{ id: 't1', name: 'Press Day', is_archived: false, category: null }],
        workout_template_exercises: [{ id: 'te1', template_id: 't1', exercise_id: 'e1', position: 0, target_sets: 2 }],
        workouts: [{ id: 'w1', performed_at: at, template_id: 't1', notes: null }],
        sets: [
          { id: 's1', workout_id: 'w1', exercise_id: 'e1', set_index: 0, reps: 12, weight: 180, weight_unit: 'lb', rpe: 8 },
          { id: 's2', workout_id: 'w1', exercise_id: 'e1', set_index: 1, reps: 10, weight: 180, weight_unit: 'lb', rpe: 9 },
        ],
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { at, name: PRESS },
  )
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

test('local mode: Premium puts an RPE-aware target on each row from last time, logging leaves them, and Targets off hides them', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await seed(page)
  await page.reload()

  const chips = page.getByTestId('set-target')
  const rows = page.locator('.set-row-draft')

  // Free: no targets; rows pre-fill from last time as always.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Press Day', exact: true }).click()
  await expect(page.locator('.exercise-card').last().locator('.exercise-card-name')).toHaveText(PRESS)
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByLabel('Weight')).toHaveValue('180')
  await expect(rows.nth(0).getByLabel('Reps')).toHaveValue('12')
  await expect(chips).toHaveCount(0)

  // Premium (issue #160): each row gets its own target without changing
  // any row. Set 1 is #140's session target; set 2 works from set 2 last
  // time (180 x 10 at RPE 9), so one more rep.
  await setPremium(page, true)
  const fill1 = rows.nth(0).getByRole('button', { name: 'Fill set 1 with target 185 lb × 8' })
  const fill2 = rows.nth(1).getByRole('button', { name: 'Fill set 2 with target 180 lb × 11' })
  await expect(fill1).toBeVisible()
  await expect(fill2).toBeVisible()
  await expect(rows.nth(0).getByLabel('Weight')).toHaveValue('180')
  await expect(page.getByTestId('target-hint')).toHaveCount(0)

  // Each chip sits under its row's inputs, inside the row, on a 375px phone.
  for (const i of [0, 1]) {
    const row = (await rows.nth(i).boundingBox())!
    const reps = (await rows.nth(i).getByLabel('Reps').boundingBox())!
    const chip = (await rows.nth(i).getByTestId('set-target').boundingBox())!
    expect(chip.y).toBeGreaterThanOrEqual(reps.y + reps.height)
    expect(chip.x).toBeGreaterThanOrEqual(row.x)
    expect(chip.x + chip.width).toBeLessThanOrEqual(row.x + row.width + 0.5)
    expect(chip.y + chip.height).toBeLessThanOrEqual(row.y + row.height + 0.5)
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // Why? shows the math, under its own row.
  const why1 = rows.nth(0).getByRole('button', { name: 'Why this target for set 1?' })
  await expect(why1).toHaveAttribute('aria-expanded', 'false')
  await why1.click()
  await expect(why1).toHaveAttribute('aria-expanded', 'true')
  await expect(rows.nth(0)).toContainText('Last time 180 lb × 12 at RPE 8.')
  await expect(rows.nth(0)).toContainText('RPE 8 is a solid working set, so this is the usual step.')
  await expect(rows.nth(0)).toContainText('Est. 1RM 252, so 185 × 8 is about 73% of it.')
  await rows.nth(1).getByRole('button', { name: 'Why this target for set 2?' }).click()
  await expect(rows.nth(1)).toContainText('Set 2 last time: 180 lb × 10 at RPE 9.')
  await expect(why1).toHaveAttribute('aria-expanded', 'false')

  // A tap fills only its own row.
  await fill1.click()
  await expect(rows.nth(0).getByLabel('Weight')).toHaveValue('185')
  await expect(rows.nth(0).getByLabel('Reps')).toHaveValue('8')
  await expect(rows.nth(1).getByLabel('Weight')).toHaveValue('180')
  await expect(rows.nth(1).getByLabel('Reps')).toHaveValue('10')

  // Logging set 1, even at RPE 10, doesn't move set 2: it still works from
  // set 2 last time, so a drop or back-off pattern keeps its own numbers.
  await rows.nth(0).getByLabel('RPE (optional)').fill('10')
  await rows.nth(0).getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  const skip = page.getByRole('button', { name: 'Skip Rest' })
  if (await skip.isVisible()) await skip.click()
  await expect(rows).toHaveCount(1)
  const fill = rows.nth(0).getByRole('button', { name: 'Fill set 2 with target 180 lb × 11' })
  await expect(fill).toBeVisible()
  await expect(rows.nth(0)).toContainText('Set 2 last time: 180 lb × 10 at RPE 9.')
  // Logged sets are never touched, and nothing fills until tapped.
  await expect(rows.nth(0).getByLabel('Weight')).toHaveValue('180')
  await expect(rows.nth(0).getByLabel('Reps')).toHaveValue('10')
  await fill.click()
  await expect(rows.nth(0).getByLabel('Reps')).toHaveValue('11')
  await expect(page.locator('.set-row-logged').first()).toContainText('185')

  // Targets off in the exercise sheet hides it.
  await goTo(page, 'Exercises')
  const sheet = await openEditExerciseSheet(page, PRESS)
  const targets = sheet.getByRole('switch', { name: 'Next-set targets' })
  await expect(targets).toHaveAttribute('aria-checked', 'true')
  await targets.click()
  await expect(targets).toHaveAttribute('aria-checked', 'false')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toHaveCount(0)
  await goTo(page, 'Home')
  await expect(page.locator('.exercise-card').last().locator('.exercise-card-name')).toHaveText(PRESS)
  await expect(rows).toHaveCount(1)
  await expect(chips).toHaveCount(0)

  // And back on.
  await goTo(page, 'Exercises')
  await openEditExerciseSheet(page, PRESS)
  await targets.click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await goTo(page, 'Home')
  await expect(fill).toBeVisible()
})

test('local mode: free keeps the plain Next time card; Premium adds Why this? to it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await seed(page)
  await page.reload()

  await goTo(page, 'Exercises')
  await page.locator('.row-wrap', { hasText: PRESS }).getByRole('button', { name: 'View exercise history' }).click()
  const overlay = page.getByRole('dialog', { name: `${PRESS} history` })
  const next = overlay.getByRole('region', { name: 'Next time' })
  await expect(next.locator('.goal')).toHaveText('Go up: 185 lb × 8')
  await expect(next).toContainText('You hit 12 at 180 lb')
  await expect(next.getByRole('button', { name: 'Why this?' })).toHaveCount(0)

  await setPremium(page, true)
  await expect(next.locator('.goal')).toHaveText('Go up: 185 lb × 8')
  await next.getByRole('button', { name: 'Why this?' }).click()
  await expect(next).toContainText('Last time 180 lb × 12 at RPE 8.')
  await expect(next).toContainText('Est. 1RM 252, so 185 × 8 is about 73% of it.')
})
