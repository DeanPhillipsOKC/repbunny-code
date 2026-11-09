import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #475: small wins short of a big record get a chip on the logged set
// row (the strongest one) and a line each on the rest screen, with no
// takeover. Free accounts: heaviest yet, rep best, and target hit (the free
// Next time target); est. 1RM wins are Premium (covered in
// small-wins-unit.spec.ts).

const PRESS = 'E2E Small Wins Press'

// Last session: 180 x 12 and 180 x 10 (best volume 2160). 12 is the top of
// the 8 to 12 range, so the free Next time target bumps to 185 x 8.
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
        workout_templates: [{ id: 't1', name: 'Wins Day', is_archived: false, category: null }],
        workout_template_exercises: [{ id: 'te1', template_id: 't1', exercise_id: 'e1', position: 0, target_sets: 4 }],
        workouts: [{ id: 'w1', performed_at: at, template_id: 't1', notes: null }],
        sets: [
          { id: 's1', workout_id: 'w1', exercise_id: 'e1', set_index: 0, reps: 12, weight: 180, weight_unit: 'lb', rpe: null },
          { id: 's2', workout_id: 'w1', exercise_id: 'e1', set_index: 1, reps: 10, weight: 180, weight_unit: 'lb', rpe: null },
        ],
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { at, name: PRESS },
  )
}

async function start(page: Page, { restOff = false } = {}) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  if (restOff) await turnOffDefaultRest(page)
  await seed(page)
  await page.reload()
}

async function logRow(page: Page, weight: string, reps: string) {
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Weight').fill(weight)
  await row.getByLabel('Reps').fill(reps)
  await row.getByRole('button', { name: 'Add set' }).click()
}

test('local mode: heaviest yet and a target hit show a chip on the row and a line on the rest screen, with no takeover', async ({ page }) => {
  await start(page)
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Wins Day', exact: true }).click()
  await expect(page.locator('.exercise-card').last().locator('.exercise-card-name')).toHaveText(PRESS)

  const rest = page.locator('.rest-overlay')
  const logged = page.locator('.set-row-logged')

  // 190 x 6: heavier than anything before, but less volume than 180 x 12.
  await logRow(page, '190', '6')
  await expect(rest).toBeVisible()
  const restWins = rest.getByRole('list', { name: 'Small wins' })
  await expect(restWins).toContainText('Heaviest yet')
  await expect(restWins).toContainText('190 lb, up from 180 lb')
  await expect(page.locator('.celebration-overlay')).toHaveCount(0)
  await rest.getByRole('button', { name: 'Skip Rest' }).click()

  await expect(logged.nth(0).getByTestId('small-win-chip')).toHaveText('Heaviest yet')
  // The chip sits under the values, inside the row, on a 375px phone.
  const row = (await logged.nth(0).boundingBox())!
  const chip = (await logged.nth(0).getByTestId('small-win-chip').boundingBox())!
  const reps = (await logged.nth(0).locator('.set-field-reps').boundingBox())!
  expect(chip.y).toBeGreaterThanOrEqual(reps.y + reps.height - 0.5)
  expect(chip.y + chip.height).toBeLessThanOrEqual(row.y + row.height + 0.5)
  expect(chip.x).toBeGreaterThan(row.x + 28)

  // 185 x 8 hits the bumped Next time target: not heavier than 190, no
  // earlier set at 185, and nowhere near a volume record.
  await logRow(page, '185', '8')
  await expect(rest).toBeVisible()
  await expect(rest.getByRole('list', { name: 'Small wins' })).toContainText('Target hit')
  await expect(rest.getByRole('list', { name: 'Small wins' })).toContainText('185 lb × 8')
  await expect(page.locator('.celebration-overlay')).toHaveCount(0)
  await rest.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(logged.nth(1).getByTestId('small-win-chip')).toHaveText('Target hit')

  // A set with no win gets no chip and no rest line.
  await logRow(page, '150', '5')
  await expect(rest).toBeVisible()
  await expect(page.locator('[data-record-check="pending"]')).toHaveCount(0)
  await expect(rest.getByRole('list', { name: 'Small wins' })).toHaveCount(0)
  await rest.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(logged.nth(2).getByTestId('small-win-chip')).toHaveCount(0)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('local mode: a big record keeps its takeover and also gets the chip, with the rest timer off', async ({ page }) => {
  await start(page, { restOff: true })
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, PRESS, false)

  // 200 x 12: heaviest yet and a volume record (2400 over 2160).
  await page.getByLabel('Reps').fill('12')
  await page.getByLabel('Weight').fill('200')
  await page.getByRole('button', { name: 'Add set' }).click()
  const celebration = page.getByRole('dialog', { name: `New record: ${PRESS}` })
  await expect(celebration).toBeVisible()
  await page.getByRole('button', { name: 'Nice!' }).click()
  await expect(celebration).not.toBeVisible()
  await expect(page.locator('.rest-overlay')).toHaveCount(0)
  await expect(page.locator('.set-row-logged').first().getByTestId('small-win-chip')).toHaveText('Heaviest yet')

  // Editing the set drops its chip, since the win may no longer hold.
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  await page.locator('.set-row-editing').getByLabel('Reps').fill('3')
  await page.locator('.set-row-editing').getByRole('button', { name: 'Save set 1' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)
  await expect(page.getByTestId('small-win-chip')).toHaveCount(0)
})
