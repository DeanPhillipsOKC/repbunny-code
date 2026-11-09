import { test, expect, localDb, startLocal } from '../fixtures/local'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 67: the +/- stepper buttons (`1b3f9fe`) are
// replaced by compact, always-editable tap-to-edit fields — typing a value
// directly, with no stepper buttons to eat vertical space. RPE rides along
// as an always-visible fourth field (no more +RPE reveal-toggle).
test('compact set-row fields are directly editable with no stepper buttons', async ({ page, stamp }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  const exerciseName = `E2E Compact Field ${stamp}`
  const admin = localDb(page)
  // The exercise is pre-existing state this test logs a set against, not
  // behavior under test -- seed it directly via the admin client instead of
  // driving the Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  const row = page.locator('.set-row-draft').first()
  const weight = row.getByLabel('Weight')
  const reps = row.getByLabel('Reps')
  const rpe = row.getByLabel('RPE (optional)')

  // No stepper buttons left anywhere in the row.
  await expect(row.getByRole('button', { name: /Increase set/ })).toHaveCount(0)
  await expect(row.getByRole('button', { name: /Decrease set/ })).toHaveCount(0)
  // RPE is always present, not behind a "+RPE" reveal toggle.
  await expect(row.getByRole('button', { name: '+RPE' })).toHaveCount(0)
  await expect(rpe).toBeVisible()
  await expect(rpe).toHaveValue('')

  await weight.fill('95')
  await expect(weight).toHaveValue('95')
  await reps.fill('7')
  await expect(reps).toHaveValue('7')
  await rpe.fill('8.5')
  await expect(rpe).toHaveValue('8.5')

  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 720 })
    const geometry = await row.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const weightBounds = element.querySelector('.set-field-weight')!.getBoundingClientRect()
      const repsBounds = element.querySelector('.set-field-reps')!.getBoundingClientRect()
      const rpeBounds = element.querySelector('.set-field-rpe')!.getBoundingClientRect()
      const addBounds = element.querySelector('.log-btn-compact')!.getBoundingClientRect()
      return {
        withinRow:
          weightBounds.left >= bounds.left &&
          repsBounds.right <= bounds.right &&
          rpeBounds.right <= bounds.right &&
          addBounds.right <= bounds.right,
        noOverlap: weightBounds.right <= repsBounds.left && repsBounds.right <= rpeBounds.left,
      }
    })
    expect(geometry.withinRow).toBe(true)
    expect(geometry.noOverlap).toBe(true)
  }
})

// Redesign item: tapping into a reps/weight/RPE field that already held a
// value (pre-fill/carryover from the previous set) used to require manually
// repositioning the cursor before typing. Mirrors the RPE select-on-focus
// coverage in e2e/local/rpe-quick-entry.spec.ts.
test('set row fields select their existing value on focus for one-keystroke overwrite', async ({ page, stamp }) => {
  const exerciseName = `E2E Stepper Select ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  const row = page.locator('.set-row-draft').first()
  const reps = row.getByLabel('Reps')
  const weight = row.getByLabel('Weight')

  // Give each field a value, then move focus away and back -- a genuine
  // re-focus, not the implicit focus `.fill()` itself leaves behind, so the
  // click below is what actually triggers select-on-focus.
  await reps.fill('7')
  await expect(reps).toHaveValue('7')
  await weight.click()
  await reps.click()
  await page.keyboard.type('9')
  await expect(reps).toHaveValue('9')

  await weight.fill('225')
  await expect(weight).toHaveValue('225')
  await reps.click()
  await weight.click()
  await page.keyboard.type('185')
  await expect(weight).toHaveValue('185')
})
