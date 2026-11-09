import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #133: a lift that's been flat for weeks gets a "Flat since" chip on
// Lift progress. With Premium, its chart card carries the date and one fix to
// try; without, the chip opens the Premium preview.

const FLAT = 'E2E Flat Bench'
const RISING = 'E2E Rising Squat'

// Five weekly sessions each: the bench peaks on the first and stays under it,
// the squat beats itself every time.
async function seedLifts(page: Page) {
  const dates = [42, 35, 28, 21, 14].map((d) => new Date(Date.now() - d * 86_400_000).toISOString())
  await page.evaluate(
    async ({ dates, flat, rising }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const lifts = [
        { id: 'e1', name: flat, weights: [185, 180, 180, 175, 180] },
        { id: 'e2', name: rising, weights: [185, 195, 205, 215, 225] },
      ]
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: lifts.map((l) => ({ id: l.id, name: l.name, muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false })),
        workout_templates: [],
        workout_template_exercises: [],
        workouts: dates.map((at: string, i: number) => ({ id: `w${i}`, performed_at: at, template_id: null, notes: null })),
        sets: lifts.flatMap((l, li) =>
          dates.map((_: string, i: number) => ({
            id: `s${li}-${i}`,
            workout_id: `w${i}`,
            exercise_id: l.id,
            set_index: li,
            reps: 5,
            weight: l.weights[i],
            weight_unit: 'lb',
          })),
        ),
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { dates, flat: FLAT, rising: RISING },
  )
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

test('local mode: a flat lift gets a plateau chip, with a tip for Premium and a preview for free', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seedLifts(page)
  await page.reload()

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  const flatCard = page.locator('.lift-card', { hasText: FLAT })
  const risingCard = page.locator('.lift-card', { hasText: RISING })
  await expect(flatCard).toBeVisible()
  await expect(risingCard).toBeVisible()

  // Free: only the flat lift shows the chip, and it opens the Premium preview.
  const chip = flatCard.getByRole('button', { name: /^Flat since / })
  await expect(chip).toBeVisible()
  await expect(risingCard.getByRole('button', { name: /^Flat since / })).toHaveCount(0)
  await chip.click()
  const preview = page.getByRole('group', { name: 'Plateau calls are part of Premium preview' })
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect(preview).toHaveCount(0)

  // Free: no tip on the chart.
  await flatCard.locator('.lift-row').click()
  const flatHistory = page.getByRole('dialog', { name: `${FLAT} history` })
  await expect(flatHistory.getByRole('img', { name: /^Heaviest over 3 months/ })).toBeVisible()
  await expect(flatHistory.getByText(/^Flat since /)).toHaveCount(0)
  await flatHistory.getByRole('button', { name: 'Close history' }).click()

  // Premium: the chip opens the chart, which carries the tip.
  await setPremium(page, true)
  await chip.click()
  await expect(flatHistory.getByText(/^Flat since .+\. Try a lighter week \(about 10% off\), or switch to 5 to 8 reps for 3 weeks\.$/)).toBeVisible()
  await flatHistory.getByRole('button', { name: 'Close history' }).click()
  await expect(page.getByRole('group', { name: /preview$/ })).toHaveCount(0)

  // The rising lift has no chip and no tip.
  await expect(risingCard.getByRole('button', { name: /^Flat since / })).toHaveCount(0)
  await risingCard.locator('.lift-row').click()
  const risingHistory = page.getByRole('dialog', { name: `${RISING} history` })
  await expect(risingHistory.getByRole('img', { name: /^Est\. 1RM over 3 months/ })).toBeVisible()
  await expect(risingHistory.getByText(/^Flat since /)).toHaveCount(0)
})
