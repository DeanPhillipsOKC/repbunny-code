import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #132: without Premium a lift's chart opens on Heaviest over 1M/3M.
// Est. 1RM, Volume, 1Y, All, and the best-reps table are a blurred preview
// with Keep it with Premium (opens the Premium sheet) and Go back. With
// Premium they open directly, and losing it lands on the preview again.

const BENCH = 'E2E Bench'

// Restores a backup with four bench workouts: three in the last two months
// and one about seven months back.
async function seedBench(page: Page) {
  const daysAgo = [210, 50, 30, 10].map((d) => new Date(Date.now() - d * 86_400_000).toISOString())
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

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

test('local mode: lift progress analytics are a Premium preview, and Premium opens them', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seedBench(page)
  await page.reload()

  // The list stays fully usable for free.
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  const row = page.locator('.lift-row', { hasText: BENCH })
  await expect(row).toBeVisible()
  await row.click()

  const history = page.getByRole('dialog', { name: `${BENCH} history` })
  const metrics = history.getByRole('group', { name: 'Chart metric' })
  const ranges = history.getByRole('group', { name: 'Chart range' })
  const premium = page.getByRole('dialog', { name: 'Premium' })

  // Free: Heaviest over 3M, no preview.
  await expect(metrics.getByRole('button', { name: 'Heaviest' })).toHaveAttribute('aria-pressed', 'true')
  await expect(ranges.getByRole('button', { name: '3M' })).toHaveAttribute('aria-pressed', 'true')
  await expect(history.getByRole('img', { name: /^Heaviest over 3 months/ })).toBeVisible()
  await expect(history.getByRole('group', { name: /preview$/ })).toHaveCount(0)
  await ranges.getByRole('button', { name: '1M' }).click()
  await expect(history.getByRole('group', { name: /preview$/ })).toHaveCount(0)
  await ranges.getByRole('button', { name: '3M' }).click()
  // Next time stays free.
  await expect(history.getByRole('heading', { name: 'Next time' })).toBeVisible()

  // Est. 1RM: a preview, Keep it with Premium opens the sheet, Go back
  // returns to Heaviest.
  await metrics.getByRole('button', { name: 'Est. 1RM' }).click()
  const e1rmPreview = history.getByRole('group', { name: 'Est. 1RM is part of Premium preview' })
  await expect(e1rmPreview).toBeVisible()
  await expect(history.getByRole('button', { name: "What's est. 1RM?" })).toHaveCount(0)
  await e1rmPreview.getByRole('button', { name: 'Keep it with Premium' }).click()
  await expect(premium).toBeVisible()
  await expect(premium.getByRole('heading', { name: 'Lift progress analytics' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await expect(premium).toHaveCount(0)
  await e1rmPreview.getByRole('button', { name: 'Go back' }).click()
  await expect(e1rmPreview).toHaveCount(0)
  await expect(metrics.getByRole('button', { name: 'Heaviest' })).toHaveAttribute('aria-pressed', 'true')

  // Volume.
  await metrics.getByRole('button', { name: 'Volume' }).click()
  const volumePreview = history.getByRole('group', { name: 'Volume is part of Premium preview' })
  await expect(volumePreview).toBeVisible()
  await volumePreview.getByRole('button', { name: 'Keep it with Premium' }).click()
  await expect(premium).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await volumePreview.getByRole('button', { name: 'Go back' }).click()
  await expect(metrics.getByRole('button', { name: 'Heaviest' })).toHaveAttribute('aria-pressed', 'true')

  // 1Y and All; Go back returns to the last free range.
  await ranges.getByRole('button', { name: '1M' }).click()
  await ranges.getByRole('button', { name: '1Y' }).click()
  const yearPreview = history.getByRole('group', { name: '1 year is part of Premium preview' })
  await expect(yearPreview).toBeVisible()
  await yearPreview.getByRole('button', { name: 'Keep it with Premium' }).click()
  await expect(premium).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await yearPreview.getByRole('button', { name: 'Go back' }).click()
  await expect(ranges.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true')
  await ranges.getByRole('button', { name: 'All' }).click()
  const allPreview = history.getByRole('group', { name: 'All time is part of Premium preview' })
  await expect(allPreview).toBeVisible()
  await allPreview.getByRole('button', { name: 'Go back' }).click()
  await expect(allPreview).toHaveCount(0)

  // The best-reps table.
  await expect(history.locator('.rr-card').getByRole('table')).toHaveCount(0)
  await history.getByRole('button', { name: /^Best reps at each weight/ }).click()
  const repsPreview = history.getByRole('group', { name: 'Best reps at each weight is part of Premium preview' })
  await expect(repsPreview).toBeVisible()
  await repsPreview.getByRole('button', { name: 'Keep it with Premium' }).click()
  await expect(premium).toBeVisible()
  await expect(premium.getByRole('heading', { name: 'Lift progress analytics' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await repsPreview.getByRole('button', { name: 'Go back' }).click()
  await expect(repsPreview).toHaveCount(0)
  await expect(history.getByRole('button', { name: /^Best reps at each weight/ })).toBeVisible()

  // With Premium, everything opens directly.
  await setPremium(page, true)
  await metrics.getByRole('button', { name: 'Est. 1RM' }).click()
  await expect(history.getByRole('group', { name: /preview$/ })).toHaveCount(0)
  await expect(history.getByRole('button', { name: "What's est. 1RM?" })).toBeVisible()
  await metrics.getByRole('button', { name: 'Volume' }).click()
  await ranges.getByRole('button', { name: 'All' }).click()
  await expect(history.getByRole('img', { name: /^Volume over all time/ })).toBeVisible()
  await expect(history.getByRole('group', { name: /preview$/ })).toHaveCount(0)
  await expect(history.getByRole('heading', { name: 'Best reps at each weight' })).toBeVisible()
  await expect(history.locator('.rr-card').getByRole('table')).toBeVisible()

  // Losing Premium falls back to the preview, without errors.
  await setPremium(page, false)
  await expect(history.getByRole('group', { name: 'Volume is part of Premium preview' })).toBeVisible()
  await expect(history.getByRole('button', { name: /^Best reps at each weight/ })).toBeVisible()
  await history.getByRole('group', { name: 'Volume is part of Premium preview' }).getByRole('button', { name: 'Go back' }).click()
  await expect(metrics.getByRole('button', { name: 'Heaviest' })).toHaveAttribute('aria-pressed', 'true')
  await expect(ranges.getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true')
  await expect(history.getByRole('group', { name: /preview$/ })).toHaveCount(0)

  // A fresh open without Premium starts on Heaviest again.
  await history.getByRole('button', { name: 'Close history' }).click()
  await row.click()
  await expect(metrics.getByRole('button', { name: 'Heaviest' })).toHaveAttribute('aria-pressed', 'true')
})
