import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { selectExercise } from '../fixtures/exercise'
import { goTo } from '../fixtures/nav'
import { openAccountSection } from '../fixtures/account'

// Covers issue #53: the default weight unit (profiles.weight_unit), asked
// once after sign-in and changeable from the Account sheet. It only seeds
// new sets; the same set last time still wins.

async function savedUnit(page: Page, userId: string) {
  const { data } = await localDb(page).from('profiles').select('weight_unit').eq('id', userId).single()
  return data?.weight_unit ?? null
}

test('weight unit: the one-time sheet fits at 375px, saves kg, and a new exercise starts in kg', async ({ page, stamp }) => {
  const exerciseName = `E2E Unit Press ${stamp}`
  const admin = localDb(page)
  await page.setViewportSize({ width: 375, height: 800 })
  const userId = await startLocal(page, {
    weightUnit: null,
    beforeNavigate: async (id) => {
      await admin.from('exercises').insert({ user_id: id, name: exerciseName, muscle_group: 'shoulders' })
      // History mostly in kg, on a different exercise, so the sheet suggests
      // kg without giving Unit Press any history of its own.
      const { data: other } = await admin
        .from('exercises')
        .insert({ user_id: id, name: `E2E Unit Squat ${stamp}`, muscle_group: 'legs' })
        .select('id')
        .single()
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: id, performed_at: '2026-09-01T15:00:00Z', notes: `E2E ${stamp}` })
        .select('id')
        .single()
      // The shared worker account can carry weighted lb sets other specs
      // left behind (#177), and a tie goes to lb, so outnumber them. Same
      // filter as countWeightedSets(), scoped to this user via the workout.
      const { count: lbSets, error: countError } = await admin
        .from('sets')
        .select('id, workouts!inner(user_id)', { count: 'exact', head: true })
        .eq('workouts.user_id', id)
        .eq('weight_unit', 'lb')
        .gt('weight', 0)
      if (countError) throw countError
      const kgSets = (lbSets ?? 0) + 3
      await admin.from('sets').insert(
        Array.from({ length: kgSets }, (_, i) => ({ workout_id: workout!.id, exercise_id: other!.id, set_index: i, reps: 5, weight: 100, weight_unit: 'kg' })),
      )
    },
  })

  const sheet = page.getByRole('dialog', { name: 'Which unit do you lift in?' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Most of your logged sets are in kg.')).toBeVisible()
  // No close button: the only way out is picking a unit.
  await expect(sheet.getByRole('button', { name: 'Close' })).toHaveCount(0)

  // Fits on a phone without scrolling: fully inside the viewport, and the
  // sheet itself has nothing hidden below its fold.
  const box = await sheet.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(800 + 1)
  expect(await sheet.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
  // The two choices sit side by side at the same height.
  const lbBox = await sheet.getByRole('button', { name: 'lb', exact: true }).boundingBox()
  const kgBox = await sheet.getByRole('button', { name: 'kg', exact: true }).boundingBox()
  expect(Math.abs(lbBox!.y - kgBox!.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(lbBox!.height - kgBox!.height)).toBeLessThanOrEqual(1)
  expect(kgBox!.x).toBeGreaterThan(lbBox!.x + lbBox!.width)

  await sheet.getByRole('button', { name: 'kg', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await expect.poll(() => savedUnit(page, userId)).toBe('kg')

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  const units = page.getByRole('group', { name: 'Units' })
  await expect(units.getByRole('button', { name: 'kg', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(units.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('weight unit: an exercise logged in lb still starts in lb for a kg-default user', async ({ page, stamp }) => {
  const exerciseName = `E2E Unit Row ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    weightUnit: 'kg',
    beforeNavigate: async (id) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: id, name: exerciseName, muscle_group: 'back' })
        .select('id')
        .single()
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: id, performed_at: '2026-09-01T15:00:00Z', notes: `E2E ${stamp}` })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: workout!.id, exercise_id: exercise!.id, set_index: 0, reps: 10, weight: 135, weight_unit: 'lb' })
    },
  })

  await expect(page.getByRole('dialog', { name: 'Which unit do you lift in?' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  const units = page.getByRole('group', { name: 'Units' })
  await expect(units.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.set-row-draft').first().getByLabel('Weight')).toHaveValue('135')
})

test('weight unit: a kg user with lb history sees muscle volume converted to kg', async ({ page, stamp }) => {
  const exerciseName = `E2E Unit Leg Press ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    weightUnit: 'kg',
    beforeNavigate: async (id) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: id, name: exerciseName, muscle_group: 'legs' })
        .select('id')
        .single()
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: id, performed_at: new Date(Date.now() - 60_000).toISOString(), notes: `E2E ${stamp}` })
        .select('id')
        .single()
      // 4 x 5 x 100 lb = 2,000 lb = 907 kg.
      await admin.from('sets').insert(
        [0, 1, 2, 3].map((i) => ({ workout_id: workout!.id, exercise_id: exercise!.id, set_index: i, reps: 5, weight: 100, weight_unit: 'lb' })),
      )
    },
  })

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Muscle groups', exact: true }).click()
  await page.getByRole('link', { name: /^Legs, / }).click()
  await page.getByRole('group', { name: 'Chart metric' }).getByRole('button', { name: 'Volume' }).click()
  await expect(page.getByTestId('muscle-this-week')).toHaveText(/^[\d,]+\skg$/)
  await expect(page.locator('.exrow', { hasText: exerciseName }).locator('.c')).toHaveText('907')
})

test('weight unit: changing it in the Account sheet persists across a reload', async ({ page }) => {
  const userId = await startLocal(page)

  const openUnitToggle = async () => {
    return (await openAccountSection(page, 'Preferences')).getByRole('group', { name: 'Weight unit' })
  }

  let toggle = await openUnitToggle()
  await expect(toggle.getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'true')
  await toggle.getByRole('button', { name: 'kg' }).click()
  await expect(toggle.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => savedUnit(page, userId)).toBe('kg')

  await page.reload()
  toggle = await openUnitToggle()
  await expect(toggle.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle.getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'false')

  // At 375px the toggle sits on the right of its row, centered on the
  // label, and the taller menu doesn't squeeze the "Your data" rows.
  await page.setViewportSize({ width: 375, height: 800 })
  const account = page.getByRole('dialog', { name: 'Preferences' })
  const group = await account.getByRole('group', { name: 'Preferences' }).boundingBox()
  const label = await account.getByText('Weight unit', { exact: true }).boundingBox()
  const toggleBox = await toggle.boundingBox()
  expect(toggleBox!.x).toBeGreaterThan(label!.x + label!.width)
  expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(group!.x + group!.width)
  expect(toggleBox!.y).toBeGreaterThanOrEqual(group!.y)
  expect(toggleBox!.y + toggleBox!.height).toBeLessThanOrEqual(group!.y + group!.height)
  await account.getByRole('button', { name: 'Back to Account' }).click()
  const data = await openAccountSection(page, 'Your data')
  const restore = await data.getByRole('button', { name: /Restore from a backup/ }).boundingBox()
  expect(restore!.height).toBeGreaterThanOrEqual(44)
})
