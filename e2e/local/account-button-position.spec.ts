import type { Locator } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

type Box = { x: number; y: number; width: number; height: number }

// Backlog item 108: the Account button sits top right on the regular tabs
// (App.vue's .app-header) but, before this fix, WorkoutLogger.vue's compact
// active-workout header put it first (top left), so it jumped sides
// depending on the screen. It now sits last in that header's row, after Add
// exercise, so its x position matches every other screen.
test('the Account button stays in the same top-right position on every screen', async ({ page, stamp }) => {
  const admin = localDb(page)
  const exerciseName = `E2E Position Exercise ${stamp}`

  await startLocal(page, {
    beforeNavigate: async (uid) => {
      await admin.from('exercises').insert({ user_id: uid, name: exerciseName })
    },
  })

  await page.setViewportSize({ width: 375, height: 800 })
  const account = page.getByRole('button', { name: 'Account' })

  await goTo(page, 'Home')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()
  const homeAccount = await settledBox(account)

  await goTo(page, 'Exercises')
  await expect(page).toHaveURL(/\/exercises$/)
  await expect(page.getByRole('heading', { name: 'Exercises', level: 2 })).toBeVisible()
  const exercisesAccount = await settledBox(account)

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()

  const addExerciseBtn = page.getByRole('button', { name: 'Add exercise' })
  await expect(addExerciseBtn).toBeVisible()
  const addExerciseBox = await settledBox(addExerciseBtn)
  const workoutAccount = await settledBox(account)

  expect(Math.abs(workoutAccount.x - homeAccount.x)).toBeLessThan(4)
  expect(Math.abs(workoutAccount.x - exercisesAccount.x)).toBeLessThan(4)
  expect(workoutAccount.x).toBeGreaterThan(addExerciseBox.x)
})

// Issue #162: a single boundingBox() read flaked under the full suite. Read
// right after a tab click, it can land on the outgoing screen's button as it
// unmounts (null) or on a header still laying out. Wait until two reads in a
// row agree before trusting the position.
async function settledBox(locator: Locator) {
  let last: Box | null = null
  let settled: Box | null = null
  await expect
    .poll(async () => {
      const box = await locator.boundingBox()
      const same = !!box && !!last && box.x === last.x && box.y === last.y && box.width === last.width
      last = box
      if (same) settled = box
      return same
    }, { intervals: [100] })
    .toBe(true)
  return settled!
}
