import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Swiping between exercises in the active workout with a real touch stream
// (CDP touch input, so the browser's own touch-action/scroll handling runs).
// Swipes used to be dropped when they started on a reps/weight field or
// button, or when a slightly diagonal thumb path let the browser claim the
// gesture as a scroll (pointercancel, no pointerup).

test.use({ hasTouch: true })

async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page)
  const steps = 8
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] })
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }],
    })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('exercise swipe: touch swipes switch exercises even starting on a field or drifting diagonally', async ({ page, stamp }) => {
  const first = `E2E Swipe Bench ${stamp}`
  const second = `E2E Swipe Row ${stamp}`
  const templateName = `E2E Swipe Day ${stamp}`
  const admin = localDb(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercises, error } = await admin
        .from('exercises')
        .insert([
          { user_id: userId, name: first },
          { user_id: userId, name: second },
        ])
        .select('id, name')
      if (error) throw error
      const { data: template } = await admin.from('workout_templates').insert({ user_id: userId, name: templateName }).select('id').single()
      await admin.from('workout_template_exercises').insert([
        { template_id: template!.id, exercise_id: exercises!.find((e) => e.name === first)!.id, position: 0, target_sets: 2 },
        { template_id: template!.id, exercise_id: exercises!.find((e) => e.name === second)!.id, position: 1, target_sets: 2 },
      ])
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()
  const name = page.locator('.exercise-card-name')
  await expect(name).toHaveText(first)

  // Starts on the first row's Weight field and swipes left: next exercise.
  const weight = await page.locator('.set-row-draft').first().getByLabel('Weight').boundingBox()
  const y = weight!.y + weight!.height / 2
  await swipe(page, { x: weight!.x + weight!.width / 2 + 60, y }, { x: 40, y })
  await expect(name).toHaveText(second)
  // Only a swipe, not a tap: the field never took focus.
  await expect(page.locator('input:focus')).toHaveCount(0)

  // A diagonal swipe right (some vertical drift) still goes back.
  await swipe(page, { x: 60, y: y - 30 }, { x: 330, y: y + 40 })
  await expect(name).toHaveText(first)

  // A mostly vertical drag is a scroll, not a swipe.
  await swipe(page, { x: 200, y: y + 100 }, { x: 240, y: y - 100 })
  await page.waitForTimeout(400)
  await expect(name).toHaveText(first)
})
