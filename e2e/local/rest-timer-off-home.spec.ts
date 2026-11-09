import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'
import { goTo } from '../fixtures/nav'
import { chimeCount, installRestChimeSpy } from '../fixtures/restChime'
import type { Page } from '@playwright/test'

// Issue #80: a rest keeps running after leaving Home. The bar shows on the
// other tabs; Resume goes back to the full rest screen, Skip ends it.
async function startRest(page: Page, exerciseName: string) {
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Back to workout' }).click()
}

async function signInWithRest(page: Page, exerciseName: string, restSeconds: number) {
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName, rest_seconds: restSeconds })
    },
  })
}

test('rest bar follows you to other tabs and Resume reopens the rest screen', async ({ page, stamp }) => {
  const exerciseName = `E2E Rest Off Home ${stamp}`
  await signInWithRest(page, exerciseName, 90)
  await startRest(page, exerciseName)

  await goTo(page, 'Routines')
  const bar = page.getByRole('status').filter({ hasText: /Resting \d:\d\d/ })
  await expect(bar).toContainText(exerciseName)
  const first = await bar.textContent()
  await expect(bar).not.toHaveText(first!)

  await goTo(page, 'Exercises')
  await expect(bar).toBeVisible()

  await bar.getByRole('button', { name: 'Resume' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.rest-headline')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  await expect(page.locator('.set-row-logged', { hasText: '10 × 45 lb' })).toBeVisible()
})

test('Skip on another tab ends the rest', async ({ page, stamp }) => {
  const exerciseName = `E2E Rest Skip Off Home ${stamp}`
  await signInWithRest(page, exerciseName, 90)
  await startRest(page, exerciseName)

  await goTo(page, 'Progress')
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByText(/Resting \d:\d\d/)).toHaveCount(0)

  await goTo(page, 'Home')
  await expect(page.locator('.set-row-logged', { hasText: '10 × 45 lb' })).toBeVisible()
  await expect(page.getByText(/Resting \d:\d\d/)).toHaveCount(0)
  await expect(page.locator('.rest-headline')).toHaveCount(0)
})

test('a rest that runs out on another tab chimes and clears the bar', async ({ page, stamp }) => {
  const exerciseName = `E2E Rest Runs Out ${stamp}`
  await installRestChimeSpy(page)
  await page.clock.install()
  await signInWithRest(page, exerciseName, 30)
  await startRest(page, exerciseName)

  await goTo(page, 'Routines')
  await expect(page.getByText(/Resting \d:\d\d/)).toBeVisible()
  expect(await chimeCount(page)).toBe(0)

  await page.clock.fastForward(31_000)

  await expect(page.getByText(/Resting \d:\d\d/)).toHaveCount(0)
  expect(await chimeCount(page)).toBeGreaterThan(0)
})
