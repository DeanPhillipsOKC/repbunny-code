import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #141: stall handling. Three missed targets in a row hold the weight
// and offer a lighter week; taking it targets about 10% off for one session,
// and the session after goes back to the weight before it.

const PRESS = 'E2E Stall Press'

// 180 x 12 sets up 185 x 8. 185 x 6 misses it, and the next two miss 185 x 7.
async function seed(page: Page, targetSets = 1) {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
  await page.evaluate(
    async ({ days, name, targetSets }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const plan: [number, number][] = [
        [180, 12],
        [185, 6],
        [185, 6],
        [185, 6],
      ]
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [{ id: 'e1', name, muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
        workout_templates: [{ id: 't1', name: 'Press Day', is_archived: false, category: null }],
        workout_template_exercises: [{ id: 'te1', template_id: 't1', exercise_id: 'e1', position: 0, target_sets: targetSets }],
        workouts: days.map((at, i) => ({ id: `w${i}`, performed_at: at, template_id: 't1', notes: null })),
        sets: plan.map(([weight, reps], i) => ({
          id: `s${i}`,
          workout_id: `w${i}`,
          exercise_id: 'e1',
          set_index: 0,
          reps,
          weight,
          weight_unit: 'lb',
          rpe: null,
        })),
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { days: [day(12), day(9), day(6), day(3)], name: PRESS, targetSets },
  )
}

async function startPressDay(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Press Day', exact: true }).click()
  await expect(page.locator('.exercise-card').last().locator('.exercise-card-name')).toHaveText(PRESS)
}

test('local mode: three missed targets offer a lighter week, then the next session goes back', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await seed(page)
  await page.reload()
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })

  const hint = page.getByTestId('target-hint')
  const offer = hint.getByRole('group', { name: 'Lighter week' })
  // Issue #160: the target itself is on the set row, the stall card above.
  const row = page.locator('.set-row-draft').first()

  // Held at 185 for one more rep, with the offer under it.
  await startPressDay(page)
  await expect(row.getByRole('button', { name: 'Fill set 1 with target 185 lb × 7' })).toBeVisible()
  await expect(hint).toContainText('Same weight, try for one more rep.')
  await expect(offer).toContainText('About 10% off for one session, then build back.')
  await row.getByRole('button', { name: 'Why this target for set 1?' }).click()
  await expect(row).toContainText("You've missed the target 3 sessions in a row, so a lighter week could help")

  // It fits a 375px phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // Taking it switches the target to 165 for this session.
  await offer.getByRole('button', { name: 'Take it: 165 lb × 7' }).click()
  await expect(offer).toHaveCount(0)
  // Issue #821: the open row's fields are already at the lighter target.
  await expect(row.getByLabel('Weight')).toHaveValue('165')
  await expect(row.getByLabel('Reps')).toHaveValue('7')
  const lighter = row.getByRole('button', { name: 'Fill set 1 with target 165 lb × 7' })
  await expect(lighter).toContainText('Lighter week')
  await expect(row).toContainText("Next time it's back to 185 lb × 7.")

  // Log it; the template's one set done finishes the workout.
  await lighter.click()
  await expect(row.getByLabel('Weight')).toHaveValue('165')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  const recap = page.getByTestId('post-finish-card')
  await expect(recap).toContainText('Press Day, done.')
  await recap.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(recap).toHaveCount(0)

  // The next session goes back to 185 x 7, with no offer.
  await startPressDay(page)
  await expect(row.getByRole('button', { name: 'Fill set 1 with target 185 lb × 7' })).toBeVisible()
  await expect(hint).toContainText('Lighter week done, so back to 185 lb.')
  await expect(offer).toHaveCount(0)
})

test('local mode: Not now keeps the held target and hides the offer', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await seed(page)
  await page.reload()
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })

  // The history screen's Next time card offers it too.
  await goTo(page, 'Exercises')
  await page.locator('.row-wrap', { hasText: PRESS }).getByRole('button', { name: 'View exercise history' }).click()
  const next = page.getByRole('dialog', { name: `${PRESS} history` }).getByRole('region', { name: 'Next time' })
  await expect(next.locator('.goal')).toHaveText('185 lb × 7')
  await expect(next.getByRole('group', { name: 'Lighter week' })).toContainText('165 lb × 7')
  await next.getByRole('button', { name: 'Not now' }).click()
  await expect(next.getByRole('group', { name: 'Lighter week' })).toHaveCount(0)
  await expect(next.locator('.goal')).toHaveText('185 lb × 7')

  // The logger agrees: the hold stays, the offer is gone.
  await page.getByRole('button', { name: 'Close history' }).click()
  await startPressDay(page)
  const hint = page.getByTestId('target-hint')
  await expect(page.locator('.set-row-draft').first().getByRole('button', { name: 'Fill set 1 with target 185 lb × 7' })).toBeVisible()
  await expect(hint).toContainText('Same weight, try for one more rep.')
  await expect(hint.getByRole('group', { name: 'Lighter week' })).toHaveCount(0)
})

test('local mode: Not now leaves the open rows on last time\'s numbers', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await turnOffDefaultRest(page)
  await seed(page)
  await page.reload()
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
  await startPressDay(page)
  const row = page.locator('.set-row-draft').first()
  await expect(row.getByLabel('Weight')).toHaveValue('185')
  await page.getByTestId('target-hint').getByRole('button', { name: 'Not now' }).click()
  await expect(row.getByLabel('Weight')).toHaveValue('185')
  await expect(row.getByLabel('Reps')).toHaveValue('6')
})

test('local mode: the stall note and offer are gone once the first set is in', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await seed(page, 2)
  await page.reload()
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })

  await startPressDay(page)
  const hint = page.getByTestId('target-hint')
  await expect(hint.getByRole('group', { name: 'Lighter week' })).toBeVisible()
  const rows = page.locator('.set-row-draft')
  await expect(rows).toHaveCount(2)
  await rows.nth(0).getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  const skip = page.getByRole('button', { name: 'Skip Rest' })
  if (await skip.isVisible()) await skip.click()
  await expect(rows).toHaveCount(1)
  await expect(hint).toHaveCount(0)
  // The stall still holds the open row to the session target.
  await expect(rows.nth(0).getByRole('button', { name: 'Fill set 2 with target 185 lb × 7' })).toBeVisible()
})

// Issue #823: Take it fills every open row, and logging right after it (no
// chip tap) saves the lighter numbers.
test('local mode: Take it fills every open row, and Add set logs the lighter target', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await turnOffDefaultRest(page)
  await seed(page, 2)
  await page.reload()
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })

  await startPressDay(page)
  const rows = page.locator('.set-row-draft')
  await expect(rows).toHaveCount(2)
  await page.getByTestId('target-hint').getByRole('group', { name: 'Lighter week' })
    .getByRole('button', { name: 'Take it: 165 lb × 7' }).click()
  for (const i of [0, 1]) {
    await expect(rows.nth(i).getByLabel('Weight')).toHaveValue('165')
    await expect(rows.nth(i).getByLabel('Reps')).toHaveValue('7')
  }

  // No chip tap: Add set saves what Take it filled.
  await rows.nth(0).getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  const skip = page.getByRole('button', { name: 'Skip Rest' })
  if (await skip.isVisible()) await skip.click()
  await expect(page.locator('.set-row-logged')).toContainText('7 × 165 lb')
})
