import { test, expect, localDb, startLocal } from '../fixtures/local'
import type { Page } from '@playwright/test'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'

async function logSet(page: Page) {
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('8')
  await row.getByLabel('Weight').fill('50')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)
}

test('early template finish lists partial and legacy plans, keeps focus, and can continue or finish', async ({ page, stamp }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  const names = [`E2E Bench ${stamp}`, `E2E Legacy ${stamp}`, `E2E Row ${stamp}`]
  const templateName = `E2E Pull ${stamp}`
  const admin = localDb(page)
  await startLocal(page, { beforeNavigate: async (userId) => {
    const { data: template, error } = await admin.from('workout_templates').insert({ user_id: userId, name: templateName }).select('id').single()
    if (error) throw error
    for (const [position, name] of names.entries()) {
      const { data: exercise, error } = await admin.from('exercises').insert({ user_id: userId, name }).select('id').single()
      if (error) throw error
      const { error: linkError } = await admin.from('workout_template_exercises').insert({ template_id: template.id, exercise_id: exercise.id, position, target_sets: position === 1 ? null : 3 })
      if (linkError) throw linkError
    }
  } })
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, names[0]!, true)
  const finish = page.getByRole('button', { name: 'Finish workout', exact: true })
  // Zero logged sets retain the discard flow, even with a whole template left.
  await finish.click()
  await expect(page.getByRole('button', { name: 'Discard workout' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Finish now?' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await logSet(page)
  await finish.click()
  const dialog = page.getByRole('dialog', { name: 'Finish now?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(`3 exercises in ${templateName} still have sets left`)
  await expect(dialog.getByRole('listitem')).toHaveText([
    `${names[0]}1 of 3 sets`, `${names[1]}0 sets logged`, `${names[2]}0 of 3 sets`,
  ])
  const keep = dialog.getByRole('button', { name: 'Keep going' })
  const anyway = dialog.getByRole('button', { name: 'Finish anyway' })
  await expect(keep).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(anyway).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(keep).toBeFocused()
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 800 })
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(20)
    expect(box.x + box.width).toBeLessThanOrEqual(width - 20)
    expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThan(2)
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    const keepBox = (await keep.boundingBox())!
    const anywayBox = (await anyway.boundingBox())!
    expect(anywayBox.y).toBeGreaterThanOrEqual(keepBox.y + keepBox.height)
  }
  await page.setViewportSize({ width: 375, height: 800 })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(finish).toBeFocused()
  await finish.click()
  await keep.click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.exercise-card-name')).toHaveText(names[0]!)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)
  await finish.click()
  await anyway.click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
})

test('freeform warns only for exercises with zero logged sets; extra draft rows do not prevent finishing', async ({ page, stamp }) => {
  const first = `E2E Free First ${stamp}`
  const second = `E2E Free Empty ${stamp}`
  await startLocal(page, { beforeNavigate: async (userId) => {
    const { error } = await localDb(page).from('exercises').insert([{ user_id: userId, name: first }, { user_id: userId, name: second }])
    if (error) throw error
  } })
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, first, false)
  await logSet(page)
  await selectExercise(page, second, false)
  const finish = page.getByRole('button', { name: 'Finish workout', exact: true })
  await expect(finish).not.toHaveClass(/btn-accent/)
  await expect(finish).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await finish.click()
  const dialog = page.getByRole('dialog', { name: 'Finish now?' })
  await expect(dialog).toContainText('1 exercise in Freeform workout still has sets left')
  await expect(dialog.getByRole('listitem')).toHaveText([`${second}0 sets logged`])
  await dialog.getByRole('button', { name: 'Finish anyway' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
  await page.getByRole('button', { name: 'Finished too early? Resume' }).click()
  // Empty ad-hoc exercises aren't persisted on resume; add it again.
  await selectExercise(page, second, false)
  await logSet(page)
  await page.getByRole('button', { name: '+ Add row' }).click()
  await finish.click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
})
