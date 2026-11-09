import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { openAccountSection, accountMenu } from '../fixtures/account'

// Issue #476: Preferences > Record celebrations. "Big ones only" (the
// default) keeps small wins (#475) to the chip and the rest line; "All wins"
// opens the full-screen celebration for them too. Per device, kept across a
// reload, and carried by a backup.

const PRESS = 'E2E Celebrate Press'

// Last session: 180 x 12 and 180 x 10 (best volume 2160). 12 is the top of
// the 8 to 12 range, so the free Next time target bumps to 185 x 8.
async function seed(page: Page, unit: 'lb' | 'kg' = 'lb', lastWeight = 180) {
  const at = new Date(Date.now() - 3 * 86_400_000).toISOString()
  await page.evaluate(
    async ({ at, name, unit, lastWeight }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [{ id: 'e1', name, muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false }],
        workout_templates: [{ id: 't1', name: 'Celebrate Day', is_archived: false, category: null }],
        workout_template_exercises: [{ id: 'te1', template_id: 't1', exercise_id: 'e1', position: 0, target_sets: 4 }],
        workouts: [{ id: 'w1', performed_at: at, template_id: 't1', notes: null }],
        sets: [
          { id: 's1', workout_id: 'w1', exercise_id: 'e1', set_index: 0, reps: 12, weight: lastWeight, weight_unit: unit, rpe: null },
          { id: 's2', workout_id: 'w1', exercise_id: 'e1', set_index: 1, reps: 10, weight: lastWeight, weight_unit: unit, rpe: null },
        ],
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { at, name: PRESS, unit, lastWeight },
  )
}

async function start(page: Page, unit: 'lb' | 'kg' = 'lb', lastWeight = 180) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page, unit, lastWeight)
  await page.reload()
}

async function startWorkout(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Celebrate Day', exact: true }).click()
  await expect(page.locator('.exercise-card').last().locator('.exercise-card-name')).toHaveText(PRESS)
}

async function logRow(page: Page, weight: string, reps: string, unit?: 'lb' | 'kg') {
  const row = page.locator('.set-row-draft').first()
  if (unit) await page.getByRole('group', { name: 'Units' }).last().getByRole('button', { name: unit, exact: true }).click()
  await row.getByLabel('Weight').fill(weight)
  await row.getByLabel('Reps').fill(reps)
  await row.getByRole('button', { name: 'Add set' }).click()
}

async function pickCelebrations(page: Page, choice: 'Big ones only' | 'All wins') {
  const prefs = await openAccountSection(page, 'Preferences')
  const group = prefs.getByRole('group', { name: 'Record celebrations' })
  await group.getByRole('button', { name: choice }).click()
  await expect(group.getByRole('button', { name: choice })).toHaveAttribute('aria-pressed', 'true')
  await prefs.getByRole('button', { name: 'Close' }).click()
}

// The Account menu's Preferences row sums up the settings.
async function expectSummary(page: Page, allWins: boolean) {
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const menu = accountMenu(page)
  await expect(menu).toBeVisible()
  if (allWins) await expect(menu).toContainText('All wins celebrated')
  else await expect(menu).not.toContainText('All wins celebrated')
  await menu.getByRole('button', { name: 'Close' }).click()
  await expect(menu).not.toBeVisible()
}

test('local mode: Big ones only is the default and keeps small wins to the chip', async ({ page }) => {
  await start(page)
  const prefs = await openAccountSection(page, 'Preferences')
  const group = prefs.getByRole('group', { name: 'Record celebrations' })
  await expect(group.getByRole('button', { name: 'Big ones only' })).toHaveAttribute('aria-pressed', 'true')
  await expect(group.getByRole('button', { name: 'All wins' })).toHaveAttribute('aria-pressed', 'false')
  // The two choices fit side by side on a 375px phone.
  const big = (await group.getByRole('button', { name: 'Big ones only' }).boundingBox())!
  const all = (await group.getByRole('button', { name: 'All wins' }).boundingBox())!
  expect(Math.abs(big.y - all.y)).toBeLessThan(1)
  await prefs.getByRole('button', { name: 'Close' }).click()
  await expectSummary(page, false)

  await startWorkout(page)
  // 190 x 6: heaviest yet, short of a volume record.
  await logRow(page, '190', '6')
  const rest = page.locator('.rest-overlay')
  await expect(rest).toBeVisible()
  await expect(rest.getByRole('list', { name: 'Small wins' })).toContainText('Heaviest yet')
  await expect(page.locator('[data-record-check="pending"]')).toHaveCount(0)
  await expect(page.locator('.celebration-overlay')).toHaveCount(0)
})

test('local mode: All wins opens the celebration for a small win, survives reload and restore, and Big ones only turns it off', async ({ page }) => {
  await start(page)
  await pickCelebrations(page, 'All wins')
  await expectSummary(page, true)

  // A backup with preferences carries the choice.
  const backup = await page.evaluate(async () => {
    const { buildBackup } = await window.__rbImport('/src/lib/backup.ts')
    return buildBackup()
  })
  expect(backup.record_celebrations).toBe('all')

  // Kept across a reload.
  await page.reload()
  const prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('group', { name: 'Record celebrations' }).getByRole('button', { name: 'All wins' })).toHaveAttribute('aria-pressed', 'true')
  await prefs.getByRole('button', { name: 'Close' }).click()

  await startWorkout(page)
  // 190 x 6: heaviest yet opens the full screen, named for the win.
  await logRow(page, '190', '6')
  const heaviest = page.getByRole('dialog', { name: `Heaviest yet: ${PRESS}` })
  await expect(heaviest).toBeVisible()
  await expect(heaviest).toContainText("Heaviest you've lifted here.")
  await expect(heaviest).toContainText('190 lb, up from 180 lb')
  await heaviest.getByRole('button', { name: 'Nice!' }).click()
  await expect(heaviest).not.toBeVisible()
  // The chip and the rest line stay too.
  const rest = page.locator('.rest-overlay')
  await expect(rest.getByRole('list', { name: 'Small wins' })).toContainText('Heaviest yet')
  await rest.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(page.locator('.set-row-logged').first().getByTestId('small-win-chip')).toHaveText('Heaviest yet')

  // 185 x 8 hits the Next time target.
  await logRow(page, '185', '8')
  const target = page.getByRole('dialog', { name: `Target hit: ${PRESS}` })
  await expect(target).toBeVisible()
  await expect(target).toContainText('Target: 185 lb × 8')
  await target.getByRole('button', { name: 'Nice!' }).click()
  await page.locator('.rest-overlay').getByRole('button', { name: 'Skip Rest' }).click()

  // Big ones only turns it back off; a restore of the earlier backup brings
  // All wins back.
  await pickCelebrations(page, 'Big ones only')
  await expectSummary(page, false)
  const restored = await page.evaluate(async (file) => {
    const { restoreBackup } = await window.__rbImport('/src/lib/backup.ts')
    const { recordCelebrations, setRecordCelebrations } = await window.__rbImport('/src/lib/recordCelebrations.ts')
    const before = recordCelebrations.value
    const { error } = await restoreBackup(file)
    const after = recordCelebrations.value
    // Back to Big ones only for the rest of the test.
    setRecordCelebrations('big')
    return { before, after, error: error?.message ?? null }
  }, backup)
  expect(restored).toEqual({ before: 'big', after: 'all', error: null })

  // With Big ones only, a small win (190 x 7 is heaviest yet again: the restore dropped today's sets) stays a chip.
  await page.reload()
  await startWorkout(page)
  await logRow(page, '190', '7')
  await expect(page.locator('.rest-overlay').getByRole('list', { name: 'Small wins' })).toContainText('Heaviest yet')
  await expect(page.locator('[data-record-check="pending"]')).toHaveCount(0)
  await expect(page.locator('.celebration-overlay')).toHaveCount(0)
})

// Issue #573: history in kg, then lb sets. 100 kg x 12 is 2,646 lb-reps, so
// 185 lb x 12 (2,220) is no record even though 185 > 100; 240 lb x 12 is.
test('local mode: a record compares kg history with an lb set by converted volume', async ({ page }) => {
  await start(page, 'kg', 100)
  await startWorkout(page)
  await logRow(page, '185', '12', 'lb')
  await expect(page.locator('.rest-overlay')).toBeVisible()
  await expect(page.locator('[data-record-check="pending"]')).toHaveCount(0)
  await expect(page.locator('.celebration-overlay')).toHaveCount(0)
  await page.locator('.rest-overlay').getByRole('button', { name: 'Skip Rest' }).click()
  await logRow(page, '240', '12')
  await expect(page.locator('.celebration-overlay')).toBeVisible()
})
