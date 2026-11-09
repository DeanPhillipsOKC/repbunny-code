import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Issue #820: the Workout log groups workouts under one header per local day,
// and each card shows its time, so two on one day don't read as two days.

test.use({ viewport: { width: 375, height: 800 } })

function daysAgo(days: number, hour: number, minute: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, minute, 0, 0)
  return d
}

function inputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// The header's and card's formats (src/lib/workoutLogDays.ts), in the page's locale.
function dayHeader(page: Page, date: Date): Promise<string> {
  return page.evaluate((iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), date.toISOString())
}

function cardTime(page: Page, date: Date): Promise<string> {
  return page.evaluate((iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }), date.toISOString())
}

test('workouts on the same day share one header, cards show the time, and a new date regroups', async ({ page, stamp }) => {
  const names = { today: `E2E Day Today ${stamp}`, late: `E2E Day Late ${stamp}`, early: `E2E Day Early ${stamp}`, older: `E2E Day Older ${stamp}` }
  const late = daysAgo(3, 17, 26)
  const early = daysAgo(3, 16, 35)
  const older = daysAgo(5, 12, 15)
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const seeds: [string, Date | null][] = [
        [names.today, null],
        [names.late, late],
        [names.early, early],
        [names.older, older],
      ]
      for (const [name, at] of seeds) {
        const { data: exercise } = await admin.from('exercises').insert({ user_id: userId, name }).select('id').single()
        const { data: workout } = await admin
          .from('workouts')
          .insert({ user_id: userId, ...(at && { performed_at: at.toISOString() }) })
          .select('id')
          .single()
        await admin.from('sets').insert({ workout_id: workout!.id, exercise_id: exercise!.id, set_index: 0, reps: 8, weight: 100, weight_unit: 'lb' })
      }
    },
  })

  await goTo(page, 'Workout log')
  const days = page.getByTestId('workout-day')
  await expect(days).toHaveCount(3)

  // Today's lone workout: no count.
  await expect(days.nth(0).getByRole('heading', { level: 2 })).toHaveText('Today')
  await expect(days.nth(0).locator('.timeline-row')).toHaveCount(1)

  // Two on one day sit under one header with the count, each card showing only its time.
  const sameDay = page.getByTestId('workout-day').filter({ has: page.getByRole('heading', { level: 2, name: `${await dayHeader(page, late)} · 2 workouts` }) })
  await expect(sameDay.locator('.timeline-row')).toHaveCount(2)
  await expect(sameDay.locator('.card', { hasText: names.late }).getByRole('heading', { level: 3 })).toHaveText(await cardTime(page, late))
  await expect(sameDay.locator('.card', { hasText: names.early }).getByRole('heading', { level: 3 })).toHaveText(await cardTime(page, early))

  // Another day gets its own header.
  await expect(days.nth(2).getByRole('heading', { level: 2 })).toHaveText(await dayHeader(page, older))
  await expect(days.nth(2).locator('.card', { hasText: names.older })).toBeVisible()

  // Moving the older workout onto the same day joins that group.
  const olderCard = page.locator('.card', { hasText: names.older })
  await olderCard.locator('.condensed-trigger').click()
  await olderCard.getByRole('button', { name: /^Change date and time/ }).click()
  const moved = daysAgo(3, 8, 5)
  await olderCard.getByLabel('When').fill(inputValue(moved))
  await olderCard.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(days).toHaveCount(2)
  const joined = page.getByTestId('workout-day').filter({ has: page.getByRole('heading', { level: 2, name: `${await dayHeader(page, late)} · 3 workouts` }) })
  await expect(joined.locator('.timeline-row')).toHaveCount(3)
  await expect(joined.locator('.card', { hasText: names.older }).getByRole('heading', { level: 3 })).toHaveText(await cardTime(page, moved))
  // Newest first within the day too.
  await expect(joined.locator('.timeline-row').last()).toContainText(names.older)
})

test('a past workout logged for yesterday lands under a Yesterday header', async ({ page, stamp }) => {
  const exerciseName = `E2E Day Yesterday ${stamp}`
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await localDb(page).from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Workout log')
  await page.getByRole('button', { name: '+ Log a past workout' }).click()
  const form = page.getByRole('form', { name: 'Log a past workout' })
  const yesterday = daysAgo(1, 17, 0)
  await form.getByLabel('When').fill(inputValue(yesterday))
  await form.getByRole('button', { name: 'Add exercises' }).click()
  await page.getByPlaceholder('Search exercises').fill(exerciseName)
  await page.getByRole('button', { name: exerciseName, exact: true }).click()

  const day = page.getByTestId('workout-day')
  await expect(day).toHaveCount(1)
  await expect(day.getByRole('heading', { level: 2 })).toHaveText('Yesterday')
  await expect(day.locator('.card').getByRole('heading', { level: 3 })).toHaveText(await cardTime(page, yesterday))
})

test('day headers and time headings fit at 200% text on a 320px phone', async ({ page, stamp }) => {
  const name = `E2E Day Big Text ${stamp}`
  await page.setViewportSize({ width: 320, height: 640 })
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const admin = localDb(page)
      const { data: exercise } = await admin.from('exercises').insert({ user_id: userId, name }).select('id').single()
      for (const at of [daysAgo(400, 17, 26), daysAgo(400, 16, 35)]) {
        const { data: workout } = await admin.from('workouts').insert({ user_id: userId, performed_at: at.toISOString() }).select('id').single()
        await admin.from('sets').insert({ workout_id: workout!.id, exercise_id: exercise!.id, set_index: 0, reps: 8, weight: 100, weight_unit: 'lb' })
      }
    },
  })
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })

  await goTo(page, 'Workout log')
  const header = page.getByTestId('workout-day').getByRole('heading', { level: 2 })
  // Over a year back, so the header carries the year.
  await expect(header).toContainText(String(daysAgo(400, 17, 26).getFullYear()))
  await expect(header).toContainText('· 2 workouts')

  const fits = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-testid="workout-day"] h2, [data-testid="workout-day"] h3')]
    return els.every((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= window.innerWidth)
  })
  expect(fits).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
