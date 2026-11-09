import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Issue #44: the Progress tab's hub (docs/design/issue-44-progress-hub.html),
// its Lift progress screen, and the Workout log / Body screens it now opens.

const DAY = 24 * 60 * 60 * 1000

async function seedWorkout(page: Page, userId: string, exerciseId: string, daysAgo: number, weight: number, reps: number) {
  const admin = localDb(page)
  const { data: w } = await admin
    .from('workouts')
    .insert({ user_id: userId, performed_at: new Date(Date.now() - daysAgo * DAY).toISOString() })
    .select('id')
    .single()
  await admin.from('sets').insert({ workout_id: w!.id, exercise_id: exerciseId, set_index: 0, reps, weight, weight_unit: 'lb' })
}

async function expectNoHorizontalScroll(page: import('@playwright/test').Page) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  }
}


test('progress hub: shows its tiles and counts a newly logged workout this week', async ({ page, stamp }) => {
  const admin = localDb(page)
  const exerciseName = `E2E Hub Press ${stamp}`
  const userId = await startLocal(page)
  const { data: exercise } = await admin.from('exercises').insert({ user_id: userId, name: exerciseName }).select('id').single()

  // A fresh database has no workouts, so the week count starts at 0.
  await goTo(page, 'Progress')
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Workout log', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Lift progress', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Body weight', exact: true })).toBeVisible()
  await expect(page.getByText('Muscle groups')).toBeVisible()
  await expect(page.getByTestId('hub-week-count')).toHaveText('0')

  await seedWorkout(page, userId, exercise!.id, 0, 135, 5)

  // A write outside the app (#463: the hub is kept alive between tab switches
  // and only refetches after the app's own writes) shows up on the next load.
  await page.reload()
  await goTo(page, 'Progress')
  await expect(page.getByTestId('hub-week-count')).toHaveText('1')
  await expect(page.getByText("You're on a roll!")).toBeVisible()

  await expectNoHorizontalScroll(page)
})

// Issue #463: the hub stays mounted between tab switches so they stay fast with
// years of history, and still counts a workout finished in between.
test('progress hub: stays mounted across tab switches and updates after a finished workout', async ({ page, stamp }) => {
  const admin = localDb(page)
  const exerciseName = `E2E Hub Keep ${stamp}`
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Progress')
  await expect(page.getByTestId('hub-week-count')).toHaveText('0')
  await page.evaluate(() => document.querySelector('.progress-hub')!.setAttribute('data-kept', 'yes'))

  await goTo(page, 'Routines')
  await goTo(page, 'Progress')
  await expect(page.locator('.progress-hub[data-kept="yes"]')).toHaveCount(1)

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, exerciseName, false)
  const draftRow = page.locator('.set-row-draft')
  await draftRow.getByLabel('Reps').fill('5')
  await draftRow.getByLabel('Weight').fill('135')
  await draftRow.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  await goTo(page, 'Progress')
  await expect(page.getByTestId('hub-week-count')).toHaveText('1')
  await expect(page.locator('.progress-hub[data-kept="yes"]')).toHaveCount(1)
})

test('progress hub: the Workout log tile opens the log and its back link returns', async ({ page }) => {
  await startLocal(page)

  await goTo(page, 'Workout log')
  await expect(page).toHaveURL(/\/progress\/workouts$/)
  await expect(page.getByRole('heading', { name: 'Workout log', exact: true })).toBeVisible()
  await expect(page.getByText('Tap a workout to review or fix it.')).toBeVisible()

  await page.getByRole('link', { name: 'Back to Progress' }).click()
  await expect(page).toHaveURL(/\/progress$/)
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible()
})

test('lift progress: lists an exercise logged twice with its trend and one logged once without, and opens its chart', async ({ page, stamp }) => {
  const admin = localDb(page)
  const twice = `E2E Lift Twice ${stamp}`
  const once = `E2E Lift Once ${stamp}`

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: rows } = await admin
        .from('exercises')
        .insert([{ user_id: userId, name: twice }, { user_id: userId, name: once }])
        .select('id, name')
      const twiceId = rows!.find((r) => r.name === twice)!.id
      const onceId = rows!.find((r) => r.name === once)!.id
      // Est. 1RM 222 then 234.
      await seedWorkout(page, userId, twiceId, 10, 175, 8)
      await seedWorkout(page, userId, twiceId, 2, 185, 8)
      await seedWorkout(page, userId, onceId, 1, 100, 5)
    },
  })

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await expect(page).toHaveURL(/\/progress\/lifts$/)
  await expect(page.getByRole('heading', { name: 'Lift progress', exact: true })).toBeVisible()

  await page.getByPlaceholder('Search exercises').fill(String(stamp))
  const row = page.locator('.lift-row', { hasText: twice })
  await expect(row).toBeVisible()
  await expect(row).toContainText('Est. 1RM')
  await expect(row).toContainText('234 lb')
  await expect(row).toContainText('▲ 12')
  await expect(row).not.toContainText('1 session')
  // Issue #156: a one-workout lift is listed too, with no trend yet.
  const onceRow = page.locator('.lift-row', { hasText: once })
  await expect(onceRow).toContainText('1 session')
  await expect(onceRow).toContainText('117 lb')

  await expectNoHorizontalScroll(page)

  await row.click()
  const overlay = page.getByRole('dialog', { name: `${twice} history` })
  await expect(overlay.getByRole('img', { name: 'Est. 1RM over 3 months, from 222 to 234 lb' })).toBeVisible()
})

// Issue #131: the headline is the latest session, not the best, and the
// pill compares latest to the first session in range, so a series whose
// best is its first point reads ▼ instead of "No change".
test('lift progress: a series whose best is its first session shows the latest value and a down pill', async ({ page, stamp }) => {
  const admin = localDb(page)
  const name = `E2E Lift Dip ${stamp}`

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin.from('exercises').insert({ user_id: userId, name }).select('id').single()
      // Est. 1RM 260 (best), then 234, then 247.
      await seedWorkout(page, userId, exercise!.id, 9, 200, 9)
      await seedWorkout(page, userId, exercise!.id, 8, 180, 9)
      await seedWorkout(page, userId, exercise!.id, 1, 190, 9)
    },
  })

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await page.getByPlaceholder('Search exercises').fill(String(stamp))
  const row = page.locator('.lift-row', { hasText: name })
  await expect(row).toContainText('247 lb')
  await expect(row).toContainText('▼ 13')
  // With the unit: the row also holds the exercise name, whose numeric stamp
  // can contain "260" on its own (#159).
  await expect(row).not.toContainText('260 lb')
  await expect(row).not.toContainText('no change')

  await row.click()
  const overlay = page.getByRole('dialog', { name: `${name} history` })
  const headline = overlay.locator('.headline')
  await expect(headline).toContainText('247 lb')
  await expect(headline).toContainText('▼ 13 lb')
  await expect(headline).not.toContainText('No change')
  await expect(overlay.getByText('Best: 200 lb × 9 on')).toBeVisible()
})

test('progress hub: the Body weight tile opens the Body screen', async ({ page }) => {
  await startLocal(page)

  await goTo(page, 'Body')
  await expect(page).toHaveURL(/\/body$/)
  await expect(page.getByRole('heading', { name: 'Body', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Progress' })).toBeVisible()
})
