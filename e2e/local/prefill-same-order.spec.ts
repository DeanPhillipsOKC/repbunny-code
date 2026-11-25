import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Issue #1061: a routine's exercises pre-fill from the past session where the
// exercise came in the same order as today, not just the latest session.

type Session = { daysAgo: number; order: [string, number][] } // [exercise key, weight]

async function seed(page: Page, userId: string, stamp: number, keys: string[], sessions: Session[]) {
  const admin = localDb(page)
  const templateName = `E2E Order Day ${stamp}`
  const { data: template } = await admin.from('workout_templates').insert({ user_id: userId, name: templateName }).select('id').single()
  const ids: Record<string, string> = {}
  for (const [position, key] of keys.entries()) {
    const { data: ex } = await admin.from('exercises').insert({ user_id: userId, name: `E2E Order ${key} ${stamp}` }).select('id').single()
    ids[key] = ex!.id
    await admin.from('workout_template_exercises').insert({ template_id: template!.id, exercise_id: ex!.id, position })
  }
  for (const session of sessions) {
    const { data: w } = await admin
      .from('workouts')
      .insert({ user_id: userId, template_id: template!.id, performed_at: new Date(Date.now() - session.daysAgo * 86_400_000).toISOString() })
      .select('id')
      .single()
    for (const [i, [key, weight]] of session.order.entries()) {
      await admin.from('sets').insert({ workout_id: w!.id, exercise_id: ids[key], set_index: i, reps: 5, weight, weight_unit: 'lb' })
    }
  }
  return templateName
}

async function start(page: Page, stamp: number, keys: string[], sessions: Session[]) {
  let templateName = ''
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      templateName = await seed(page, userId, stamp, keys, sessions)
    },
  })
  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()
}

const name = (key: string, stamp: number) => `E2E Order ${key} ${stamp}`

async function logPressFirst(page: Page, stamp: number) {
  await selectExercise(page, name('Press', stamp), true)
  await page.getByRole('button', { name: 'Add set' }).first().click()
  await dismissCelebrationIfShown(page)
}

test('same-order prefill: bench after press uses the press-then-bench session', async ({ page, stamp }) => {
  // Newest session did bench first (150), an older one did press then bench (100).
  await start(page, stamp, ['Press', 'Bench'], [
    { daysAgo: 1, order: [['Bench', 150], ['Press', 55]] },
    { daysAgo: 3, order: [['Press', 50], ['Bench', 100]] },
  ])
  await logPressFirst(page, stamp)
  await selectExercise(page, name('Bench', stamp), true)
  await expect(page.locator('.exercise-card-name')).toHaveText(name('Bench', stamp))
  await expect(page.getByLabel('Weight')).toHaveValue('100')
})

test('same-order prefill: bench first uses the bench-then-press session', async ({ page, stamp }) => {
  // Newest session did press then bench (100), an older one did bench first (150).
  await start(page, stamp, ['Press', 'Bench'], [
    { daysAgo: 1, order: [['Press', 55], ['Bench', 100]] },
    { daysAgo: 3, order: [['Bench', 150], ['Press', 50]] },
  ])
  await selectExercise(page, name('Bench', stamp), true)
  await expect(page.getByLabel('Weight')).toHaveValue('150')
})

test('same-order prefill: no matching order keeps the latest session', async ({ page, stamp }) => {
  // Bench was only ever done after other exercises, so starting it first has no match.
  await start(page, stamp, ['Press', 'Fly', 'Bench'], [
    { daysAgo: 1, order: [['Press', 55], ['Fly', 20], ['Bench', 120]] },
    { daysAgo: 3, order: [['Press', 50], ['Bench', 100]] },
  ])
  await selectExercise(page, name('Bench', stamp), true)
  await expect(page.getByLabel('Weight')).toHaveValue('120')
})

test('same-order prefill: a weight typed while the lookup loads survives', async ({ page, stamp }) => {
  await start(page, stamp, ['Press', 'Bench'], [
    { daysAgo: 1, order: [['Bench', 150], ['Press', 55]] },
    { daysAgo: 3, order: [['Press', 50], ['Bench', 100]] },
  ])
  await logPressFirst(page, stamp)
  // Hold the ordered lookup until the test releases it.
  await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const original = repos.workouts.getOrderedPreviousSets.bind(repos.workouts)
    ;(window as any).__release = () => {}
    repos.workouts.getOrderedPreviousSets = async (...args: any[]) => {
      await new Promise<void>((resolve) => ((window as any).__release = resolve))
      return original(...args)
    }
  })
  await selectExercise(page, name('Bench', stamp), true)
  const weight = page.getByLabel('Weight')
  await weight.fill('222')
  await page.evaluate(() => (window as any).__release())
  await page.waitForTimeout(500)
  await expect(weight).toHaveValue('222')
})
