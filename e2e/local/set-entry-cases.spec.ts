import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'
import type { Page } from '@playwright/test'

// Issue #336: a set's numbers are checked before they're saved. 0 reps is
// blocked with a clear message (not the old "Set not confirmed" Retry row),
// and unlikely weights on a plain weighted exercise ask "Log it anyway?".

const DAY = 24 * 60 * 60 * 1000

// Seeds the exercise (and, when given, one earlier session of it) directly;
// the logging UI under test starts from Freeform.
async function startWith(
  page: Page,
  name: string,
  options: { previous?: { reps: number; weight: number }[]; bodyweight?: string } = {},
) {
  const admin = localDb(page)
  await startLocal(page, {
    weightUnit: 'lb',
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name })
        .select('id')
        .single()
      if (options.bodyweight) {
        await admin.from('exercises').insert({ user_id: userId, name: options.bodyweight, load_type: 'bodyweight' })
      }
      if (!options.previous) return
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: userId, performed_at: new Date(Date.now() - DAY).toISOString() })
        .select('id')
        .single()
      await admin.from('sets').insert(options.previous.map((s, i) => ({
        workout_id: workout!.id, exercise_id: exercise!.id, set_index: i, reps: s.reps, weight: s.weight, weight_unit: 'lb',
      })))
    },
  })
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
}

async function persistedSets(page: Page, exerciseName: string) {
  const admin = localDb(page)
  const { data: exercise } = await admin.from('exercises').select('id').eq('name', exerciseName).single()
  const { data } = await admin.from('sets').select('reps, weight, workout_id').eq('exercise_id', exercise!.id)
  return data ?? []
}

test('0 reps is blocked with a clear message, saves nothing, and leaves no Retry row', async ({ page, stamp }) => {
  const name = `E2E Zero Reps ${stamp}`
  await startWith(page, name)
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('8')
  await row.getByLabel('Weight').fill('100')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)

  const next = page.locator('.set-row-draft').first()
  await next.getByLabel('Reps').fill('0')
  await next.getByLabel('Weight').fill('100')
  await next.getByRole('button', { name: 'Add set' }).click()
  await expect(next.locator('.row-error')).toHaveText('Reps must be 1 or more.')
  await expect(next.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  await expect(next.getByRole('button', { name: 'Add set' })).toBeVisible()
  await expect(next.getByRole('button', { name: 'Remove row 2' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeEnabled()
  await expect(page.getByText('Retry the unconfirmed set before finishing.')).toHaveCount(0)
  expect(await persistedSets(page, name)).toHaveLength(1)

  // A fractional rep count is blocked the same way.
  await next.getByLabel('Reps').fill('2.5')
  await expect(next.locator('.row-error')).toHaveCount(0)
  await next.getByRole('button', { name: 'Add set' }).click()
  await expect(next.locator('.row-error')).toHaveText('Reps must be 1 or more.')

  // Editing the row clears the message; fixed reps log normally.
  await next.getByLabel('Reps').fill('6')
  await expect(next.locator('.row-error')).toHaveCount(0)
  await next.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(2)
  expect(await persistedSets(page, name)).toHaveLength(2)
})

test('999 and 1350 lb after a 135 lb session ask first: Fix it keeps the row, Log anyway saves', async ({ page, stamp }) => {
  const name = `E2E Typo Bench ${stamp}`
  await startWith(page, name, { previous: [{ reps: 8, weight: 135 }, { reps: 8, weight: 135 }] })
  const row = page.locator('.set-row-draft').first()
  // The row pre-fills from last session once it has loaded.
  await expect(row.getByLabel('Weight')).not.toHaveValue('')

  await row.getByLabel('Weight').fill('999')
  await row.getByLabel('Reps').fill('8')
  await row.getByRole('button', { name: 'Add set' }).click()
  const confirm = row.getByRole('alert')
  await expect(confirm).toContainText('999 lb is a big jump from 135 lb last time. Log it anyway?')
  await confirm.getByRole('button', { name: 'Fix it' }).click()
  await expect(row.getByRole('alert')).toHaveCount(0)
  await expect(row.getByLabel('Weight')).toBeFocused()
  await expect(row.getByLabel('Weight')).toBeEditable()
  await expect(page.locator('.set-row-logged')).toHaveCount(0)

  await row.getByLabel('Weight').fill('1350')
  await row.getByRole('button', { name: 'Add set' }).click()
  await expect(confirm).toContainText('1350 lb is a big jump from 135 lb last time. Log it anyway?')
  expect(await persistedSets(page, name).then((sets) => sets.filter((s) => s.weight > 135))).toHaveLength(0)
  await confirm.getByRole('button', { name: 'Log anyway' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)
  await expect(page.locator('.set-row-logged')).toContainText('1350')
  expect((await persistedSets(page, name)).some((s) => s.weight === 1350)).toBe(true)
})

test('0 lb on a weighted exercise asks first; a bodyweight set with blank added weight does not', async ({ page, stamp }) => {
  const name = `E2E Zero Pound ${stamp}`
  const pushUp = `E2E Push-Up ${stamp}`
  await startWith(page, name, { bodyweight: pushUp })
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Weight').fill('0')
  await row.getByLabel('Reps').fill('7')
  await row.getByRole('button', { name: 'Add set' }).click()
  await expect(row.getByRole('alert')).toContainText(`0 lb on ${name}? Log it anyway?`)
  await row.getByRole('alert').getByRole('button', { name: 'Log anyway' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)
  expect(await persistedSets(page, name)).toHaveLength(1)

  await selectExercise(page, pushUp, false)
  const bodyWeightPrompt = page.getByRole('dialog', { name: 'Add your body weight' })
  if (await bodyWeightPrompt.isVisible()) await bodyWeightPrompt.getByRole('button', { name: 'Close' }).click()
  const pushUpRow = page.locator('.set-row-draft').first()
  await pushUpRow.getByLabel('Reps').fill('12')
  await pushUpRow.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.getByRole('alert').filter({ hasText: 'anyway' })).toHaveCount(0)
  expect(await persistedSets(page, pushUp)).toHaveLength(1)
})

test('editing a set to 0 reps shows the friendly block, in the logger and the Workout log', async ({ page, stamp }) => {
  const name = `E2E Edit Zero ${stamp}`
  await startWith(page, name)
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('8')
  await row.getByLabel('Weight').fill('100')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  await page.getByRole('button', { name: 'Edit set 1' }).click()
  const editingRow = page.locator('.set-row-editing')
  await editingRow.getByLabel('Reps').fill('0')
  await editingRow.getByRole('button', { name: 'Save set 1' }).click()
  await expect(editingRow.locator('.row-error')).toHaveText('Reps must be 1 or more.')
  await expect(editingRow).not.toContainText(/check|constraint|violat/i)
  expect((await persistedSets(page, name))[0].reps).toBe(8)
  await editingRow.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: name })
  await card.getByRole('button', { name: /^Edit set 1,/ }).click()
  await card.getByLabel('Reps').fill('0')
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByText('Reps must be 1 or more.')).toBeVisible()
  await expect(page.getByText(/constraint|violates/i)).toHaveCount(0)
  expect((await persistedSets(page, name))[0].reps).toBe(8)

  // A past set edited to 0 lb asks first, with Save anyway.
  await card.getByLabel('Reps').fill('8')
  await expect(card.getByText('Reps must be 1 or more.')).toHaveCount(0)
  await card.getByLabel('Weight').fill('0')
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByRole('alert')).toContainText(`0 lb on ${name}? Save it anyway?`)
  await card.getByRole('alert').getByRole('button', { name: 'Save anyway' }).click()
  await expect(card).toContainText('8 × 0 lb')
  expect((await persistedSets(page, name))[0].weight).toBe(0)
})

test('the confirm and block messages fit a 375px set card', async ({ page, stamp }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  const name = `E2E Narrow Check Barbell Bench Press With A Long Name ${stamp}`
  await startWith(page, name, { previous: [{ reps: 8, weight: 135 }] })
  const row = page.locator('.set-row-draft').first()
  await expect(row.getByLabel('Weight')).not.toHaveValue('')
  await row.getByLabel('Weight').fill('1350')
  await row.getByLabel('Reps').fill('8')
  await row.getByRole('button', { name: 'Add set' }).click()
  const confirm = row.getByRole('alert')
  await expect(confirm).toBeVisible()

  const line = (await row.locator('.set-row-line').boundingBox())!
  const box = (await confirm.boundingBox())!
  const fix = (await confirm.getByRole('button', { name: 'Fix it' }).boundingBox())!
  const anyway = (await confirm.getByRole('button', { name: 'Log anyway' }).boundingBox())!
  // Under the inputs, inside the row's width, buttons side by side and tappable.
  expect(box.y).toBeGreaterThanOrEqual(line.y + line.height - 1)
  expect(box.x).toBeGreaterThanOrEqual(line.x - 1)
  expect(box.x + box.width).toBeLessThanOrEqual(line.x + line.width + 1)
  expect(Math.abs(fix.y - anyway.y)).toBeLessThan(2)
  expect(fix.x + fix.width).toBeLessThanOrEqual(anyway.x)
  expect(fix.height).toBeGreaterThanOrEqual(44)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)

  await confirm.getByRole('button', { name: 'Fix it' }).click()
  await row.getByLabel('Reps').fill('0')
  await row.getByRole('button', { name: 'Add set' }).click()
  const error = row.locator('.row-error')
  await expect(error).toHaveText('Reps must be 1 or more.')
  const errorBox = (await error.boundingBox())!
  expect(errorBox.y).toBeGreaterThanOrEqual(line.y + line.height - 1)
  expect(errorBox.x + errorBox.width).toBeLessThanOrEqual(line.x + line.width + 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})
