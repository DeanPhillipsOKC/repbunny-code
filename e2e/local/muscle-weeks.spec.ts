import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import type { Page } from '@playwright/test'

// Issue #582 (docs/design/issue-582-muscle-weeks.html): on one muscle's
// screen, tapping a week's bar makes the headline and the list follow that
// week, and How? shows the average's sum. Local mode starts empty, so every
// count here is exact.

async function seedWorkout(page: Page, performedAt: Date, sets: { exerciseId: string; count: number }[]) {
  const admin = localDb(page)
  const { data: w } = await admin.from('workouts').insert({ performed_at: performedAt.toISOString() }).select('id').single()
  const rows = sets.flatMap(({ exerciseId, count }) =>
    Array.from({ length: count }, (_, i) => ({ workout_id: w!.id, exercise_id: exerciseId, set_index: i, reps: 5, weight: 100, weight_unit: 'lb' })),
  )
  await admin.from('sets').insert(rows)
}

// "Sep 27", as the app writes it in the browser's locale.
function shortDate(page: Page, d: Date): Promise<string> {
  return page.evaluate((t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), d.getTime())
}

test('one muscle: tap a past week to see what counted, and How? shows the average', async ({ page, stamp }) => {
  const admin = localDb(page)
  const bench = `E2E Week Bench ${stamp}`
  const pushup = `E2E Week Push-up ${stamp}`
  const ids: Record<string, string> = {}
  await startLocal(page, {
    beforeNavigate: async (id) => {
      const { data: rows } = await admin
        .from('exercises')
        .insert([
          { user_id: id, name: bench, muscle_group: 'chest', also_works: [] },
          { user_id: id, name: pushup, muscle_group: 'arms', also_works: ['chest'] },
        ])
        .select('id, name')
      for (const r of rows!) ids[r.name] = r.id
    },
  })

  // Weeks start Sunday. Wednesday noon five weeks ago (outside 4W) and two weeks ago.
  const now = new Date()
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  const weekOf = (n: number) => new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - 7 * n)
  const wednesday = (n: number) => new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - 7 * n + 3, 12)
  await seedWorkout(page, wednesday(5), [{ exerciseId: ids[bench], count: 3 }])
  await seedWorkout(page, wednesday(2), [
    { exerciseId: ids[bench], count: 2 },
    { exerciseId: ids[pushup], count: 2 },
  ])
  const older = await shortDate(page, weekOf(5))
  const newer = await shortDate(page, weekOf(2))
  const olderDay = await shortDate(page, wednesday(5))
  const newerDay = await shortDate(page, wednesday(2))

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Muscle groups', exact: true }).click()
  await page.getByRole('link', { name: /^Chest, / }).click()
  await expect(page).toHaveURL(/\/progress\/muscles\/chest$/)

  // The default view is unchanged: this week, nothing logged.
  await expect(page.getByTestId('muscle-week-k')).toHaveText('Sets this week')
  await expect(page.getByTestId('muscle-this-week')).toHaveText('0 sets')
  await expect(page.getByTestId('muscle-list-title')).toHaveText('This week')
  await expect(page.getByRole('button', { name: 'Back to this week' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^This week: 0 sets so far$/ })).toHaveAttribute('aria-pressed', 'true')

  // How? shows the sum and the same week count the average divides by:
  // 3 + 2 + 2 × ½ = 6 sets over the 11 full weeks of the 12 shown.
  await expect(page.getByTestId('muscle-average')).toHaveText('12-week average: 0.5 a week')
  await expect(page.getByTestId('muscle-how')).toHaveCount(0)
  await page.getByRole('button', { name: 'How?' }).click()
  await expect(page.getByRole('button', { name: 'How?' })).toHaveAttribute('aria-expanded', 'true')
  const how = page.getByTestId('muscle-how')
  await expect(how).toHaveText(/^6 sets in the 11 full weeks shown ÷ 11 = 0\.5 a week/)
  await expect(how.locator('b')).toHaveText('0.5 a week')
  await expect(how.locator('span')).toHaveText('Weeks with no chest work count as 0.')

  // Every bar is a tap area at least 44px tall.
  const hits = page.locator('.bar-hit')
  await expect(hits).toHaveCount(12)
  for (const h of await hits.all()) expect((await h.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  // The older bar: only that week's exercise, with the day it was done.
  const olderBar = page.getByRole('button', { name: `Week of ${older}: 3 sets` })
  await olderBar.click()
  await expect(olderBar).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('svg.chart rect.picked')).toHaveCount(1)
  await expect(page.getByTestId('muscle-week-k')).toHaveText(`Sets · week of ${older}`)
  await expect(page.getByTestId('muscle-this-week')).toHaveText('3 sets')
  await expect(page.getByTestId('muscle-list-title')).toHaveText(`Week of ${older}`)
  await expect(page.locator('.exrow')).toHaveCount(1)
  const benchRow = page.locator('.exrow', { hasText: bench })
  await expect(benchRow.locator('small')).toHaveText(`main muscle · ${olderDay}`)
  await expect(benchRow.locator('.c')).toHaveText('3')

  // The newer bar: half credit from "also works".
  await page.getByRole('button', { name: `Week of ${newer}: 3 sets` }).click()
  await expect(olderBar).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('muscle-week-k')).toHaveText(`Sets · week of ${newer}`)
  await expect(page.locator('.exrow')).toHaveCount(2)
  await expect(benchRow.locator('small')).toHaveText(`main muscle · ${newerDay}`)
  await expect(benchRow.locator('.c')).toHaveText('2')
  const pushupRow = page.locator('.exrow', { hasText: pushup })
  await expect(pushupRow.locator('small')).toHaveText(`also works chest · 2 sets × ½ · ${newerDay}`)
  await expect(pushupRow.locator('.c')).toHaveText('1')

  // Volume follows the same pick.
  await page.getByRole('group', { name: 'Chart metric' }).getByRole('button', { name: 'Volume' }).click()
  await expect(page.getByTestId('muscle-week-k')).toHaveText(`Volume · week of ${newer}`)
  await expect(page.getByTestId('muscle-this-week')).toHaveText('1,500 lb')
  await expect(pushupRow.locator('small')).toHaveText(`also works chest · 1,000 lb × ½ · ${newerDay}`)

  // This looks wrong opens Report a bug with the week filled in.
  await page.getByRole('button', { name: 'This looks wrong' }).click()
  const box = page.getByRole('dialog', { name: 'Report a bug' }).getByRole('textbox', { name: /What happened/ })
  await expect(box).toHaveValue(new RegExp(`Screen: Muscle groups › Chest › Volume\\nShown: 1,500 lb, week of ${newer}\\n`))
  await expect(box).toHaveValue(new RegExp(`${pushup}: 500 lb \\(also works chest`))
  await page.getByRole('dialog', { name: 'Report a bug' }).getByRole('button', { name: 'Close' }).click()

  // Back to this week.
  await page.getByRole('button', { name: 'Back to this week' }).click()
  await expect(page.getByTestId('muscle-week-k')).toHaveText('Volume this week')
  await expect(page.getByTestId('muscle-list-title')).toHaveText('This week')
  await expect(page.getByText('No chest volume yet this week.')).toBeVisible()

  // A range that hides the picked bar goes back to this week too.
  await page.getByRole('group', { name: 'Chart metric' }).getByRole('button', { name: 'Sets' }).click()
  await olderBar.click()
  await expect(page.getByTestId('muscle-week-k')).toHaveText(`Sets · week of ${older}`)
  await page.getByRole('button', { name: '4W' }).click()
  await expect(page.getByTestId('muscle-week-k')).toHaveText('Sets this week')
  await expect(page.getByRole('button', { name: 'Back to this week' })).toHaveCount(0)

  // No sideways scroll on a small phone.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  }
})
