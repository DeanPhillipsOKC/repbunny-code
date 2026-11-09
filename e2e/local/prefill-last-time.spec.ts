import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { openAccountSection } from '../fixtures/account'

// Issue #60 cut #55's "New sets start with" setting and #54's per-exercise
// Progression fields. New sets always copy the same set last time, even for
// an account whose (now unused) profiles.prefill_mode column still says
// 'next_target' or 'blank' from before the cut.

async function seedHistory(page: Page, userId: string, stamp: number) {
  const admin = localDb(page)
  const templateName = `E2E Prefill Day ${stamp}`
  const pressName = `E2E Prefill Press ${stamp}`
  await admin.from('profiles').update({ prefill_mode: 'next_target' }).eq('id', userId)
  const { data: press } = await admin.from('exercises').insert({ user_id: userId, name: pressName }).select('id').single()
  const { data: template } = await admin
    .from('workout_templates')
    .insert({ user_id: userId, name: templateName })
    .select('id')
    .single()
  await admin
    .from('workout_template_exercises')
    .insert({ template_id: template!.id, exercise_id: press!.id, position: 0, target_sets: 3 })
  const { data: workout } = await admin
    .from('workouts')
    .insert({ user_id: userId, template_id: template!.id, performed_at: '2026-09-01T15:00:00Z' })
    .select('id')
    .single()
  const lastTime: Array<[number, number]> = [
    [160, 12],
    [160, 8],
    [140, 11],
  ]
  for (const [i, [weight, reps]] of lastTime.entries()) {
    await admin
      .from('sets')
      .insert({ workout_id: workout!.id, exercise_id: press!.id, set_index: i, reps, weight, weight_unit: 'lb', rpe: 8 })
  }
  return { templateName, pressName }
}

test('prefill: new sets copy last time even with a leftover Next target mode', async ({ page, stamp }) => {
  let names!: Awaited<ReturnType<typeof seedHistory>>
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      names = await seedHistory(page, userId, stamp)
    },
  })
  await page.getByRole('button', { name: names.templateName, exact: true }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(names.pressName)

  const rows: Array<[string, string]> = [
    ['160', '12'],
    ['160', '8'],
    ['140', '11'],
  ]
  const repsInputs = page.getByLabel('Reps')
  const weightInputs = page.getByLabel('Weight')
  await expect(repsInputs).toHaveCount(rows.length)
  for (const [i, [weight, reps]] of rows.entries()) {
    await expect(weightInputs.nth(i)).toHaveValue(weight)
    await expect(repsInputs.nth(i)).toHaveValue(reps)
    await expect(page.getByLabel('RPE (optional)').nth(i)).toHaveValue('8')
  }
})

test('prefill: the Account sheet has no "New sets start with" setting', async ({ page }) => {
  await startLocal(page)
  const account = await openAccountSection(page, 'Preferences')
  await expect(account.getByRole('group', { name: 'Weight unit' })).toBeVisible()
  await expect(account.getByText('New sets start with')).toHaveCount(0)
  await expect(account.getByRole('button', { name: 'Next target' })).toHaveCount(0)
})
