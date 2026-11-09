import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { closeAddExerciseSheet } from '../fixtures/exercise'

// Issue #264: change a finished workout's date from its History card, and log
// a workout that already happened from the Workout log, without the live
// logger.

function inputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Issue #820: the card heading is the time, under a header for its day
// (src/lib/workoutLogDays.ts), in the page's locale.
function cardDate(page: Page, date: Date): Promise<string> {
  return page.evaluate((iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }), date.toISOString())
}

function dayHeader(page: Page, date: Date): Promise<string> {
  return page.evaluate((iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), date.toISOString())
}

function dayGroup(page: Page, header: string) {
  return page.getByTestId('workout-day').filter({ has: page.getByRole('heading', { level: 2, name: header, exact: true }) })
}

function shortDate(page: Page, date: Date): Promise<string> {
  return page.evaluate((iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), date.toISOString())
}

function daysAgo(days: number, hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, 15, 0, 0)
  return d
}

test('change a finished workout to 3 days ago, rejecting a future time', async ({ page, stamp }) => {
  const exerciseName = `E2E Redate Row ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin.from('exercises').insert({ user_id: userId, name: exerciseName }).select('id').single()
      const { data: workout } = await admin.from('workouts').insert({ user_id: userId }).select('id').single()
      await admin.from('sets').insert({ workout_id: workout!.id, exercise_id: exercise!.id, set_index: 0, reps: 8, weight: 100, weight_unit: 'lb' })
    },
  })

  // Lift progress has loaded the workout on today's date first, so the check
  // below proves the move reaches an already-loaded screen.
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await expect(page.locator('.lift-row', { hasText: exerciseName })).toContainText(await shortDate(page, new Date()))

  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: exerciseName })
  await expect(card).toBeVisible()

  await card.getByRole('button', { name: /^Change date and time/ }).click()
  const when = card.getByLabel('When')
  await expect(when).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)

  // A time still to come is refused in place, and nothing moves.
  const future = new Date(Date.now() + 2 * 86_400_000)
  await when.fill(inputValue(future))
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByText("That's still to come. Pick a time that's already happened.")).toBeVisible()
  await expect(when).toBeVisible()

  const target = daysAgo(3, 18)
  await when.fill(inputValue(target))
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(when).toBeHidden()
  await expect(card.getByRole('heading', { level: 3 })).toHaveText(await cardDate(page, target))
  await expect(dayGroup(page, await dayHeader(page, target)).locator('.card', { hasText: exerciseName })).toBeVisible()

  // It's saved, not just shown.
  await page.reload()
  await expect(
    dayGroup(page, await dayHeader(page, target)).locator('.card', { hasText: exerciseName }).getByRole('heading', { level: 3 }),
  ).toHaveText(await cardDate(page, target))

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await expect(page.locator('.lift-row', { hasText: exerciseName })).toContainText(await shortDate(page, target))
})

test('log a past workout dated yesterday, and the next workout prefills from it', async ({ page, stamp }) => {
  const exerciseName = `E2E Past Bench ${stamp}`
  const newerName = `E2E Past Newer ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      // Today's workout, so yesterday's has to land below it.
      const { data: exercises } = await admin
        .from('exercises')
        .insert([
          { user_id: userId, name: exerciseName },
          { user_id: userId, name: newerName },
        ])
        .select('id, name')
      const newer = exercises!.find((e) => e.name === newerName)!
      const { data: workout } = await admin.from('workouts').insert({ user_id: userId }).select('id').single()
      await admin.from('sets').insert({ workout_id: workout!.id, exercise_id: newer.id, set_index: 0, reps: 5, weight: 50, weight_unit: 'lb' })
    },
  })

  await goTo(page, 'Workout log')
  await page.getByRole('button', { name: '+ Log a past workout' }).click()
  const form = page.getByRole('form', { name: 'Log a past workout' })
  const when = form.getByLabel('When')
  await expect(when).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/)

  await when.fill(inputValue(new Date(Date.now() + 3_600_000 * 3)))
  await form.getByRole('button', { name: 'Add exercises' }).click()
  await expect(form.getByText("That's still to come. Pick a time that's already happened.")).toBeVisible()

  const yesterday = daysAgo(1, 17)
  await when.fill(inputValue(yesterday))
  await form.getByRole('button', { name: 'Add exercises' }).click()

  // The exercise picker opens on the new workout.
  await page.getByPlaceholder('Search exercises').fill(exerciseName)
  await page.getByRole('button', { name: exerciseName, exact: true }).click()

  const heading = await cardDate(page, yesterday)
  const card = dayGroup(page, 'Yesterday').locator('.card', { has: page.getByRole('heading', { level: 3, name: heading }) })
  await card.getByLabel('Reps').fill('8')
  await card.getByLabel('Weight').fill('135')
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.locator('li.row-wrap')).toHaveCount(1)

  // "+ Another set" opens the form for the same exercise, filled in from its last set.
  // Named by its visible text alone, so an exercise name can't make it match
  // another button's name (delete-workout.spec.ts's "Delete workout").
  const anotherSet = card.locator('.exercise-group', { hasText: exerciseName }).getByRole('button', { name: '+ Another set', exact: true })
  await expect(anotherSet).toHaveAccessibleDescription(exerciseName)
  await anotherSet.click()
  await expect(card.getByLabel('Reps')).toHaveValue('8')
  await expect(card.getByLabel('Weight')).toHaveValue('135')
  await card.getByLabel('Reps').fill('6')
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.locator('li.row-wrap')).toHaveCount(2)
  await expect(card.locator('li.row-wrap').nth(1)).toContainText('6 × 135 lb')

  // No live logger or rest timer started.
  await expect(page.locator('.rest-mini-bar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finish workout' })).toHaveCount(0)

  // History lists it under yesterday, below today's workout.
  await expect(card.getByRole('heading', { level: 3 })).toHaveText(heading)
  const newerCard = page.locator('.card', { hasText: newerName })
  expect((await card.boundingBox())!.y).toBeGreaterThan((await newerCard.boundingBox())!.y)

  // A new workout's "last time" comes from it.
  await goTo(page, 'Home')
  await expect(page.locator('.rest-mini-bar')).toHaveCount(0)
  await page.getByRole('button', { name: 'Freeform' }).click()
  await expect(page.locator('.deck-empty')).toBeVisible()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByRole('button', { name: exerciseName, exact: true }).click()
  await closeAddExerciseSheet(page)
  await expect(page.getByLabel('Reps')).toHaveValue('8')
  await expect(page.getByLabel('Weight')).toHaveValue('135')

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()
})
