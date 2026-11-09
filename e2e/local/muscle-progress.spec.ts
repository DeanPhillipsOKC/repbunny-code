import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import type { Page } from '@playwright/test'

// Issue #40: muscle-group progress (docs/design/issue-40-muscle-groups.html).
// The shared test accounts already hold other specs' sets, so counts are
// checked as a change from what the screen showed before seeding.

const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Glutes', 'Legs', 'Cardio']

async function seedWorkout(page: Page, userId: string, performedAt: Date, sets: { exerciseId: string; count: number }[]) {
  const admin = localDb(page)
  const { data: w } = await admin
    .from('workouts')
    .insert({ user_id: userId, performed_at: performedAt.toISOString() })
    .select('id')
    .single()
  let setIndex = 0
  const rows = sets.flatMap(({ exerciseId, count }) =>
    Array.from({ length: count }, () => ({
      workout_id: w!.id,
      exercise_id: exerciseId,
      set_index: setIndex++,
      reps: 5,
      weight: 100,
      weight_unit: 'lb',
    })),
  )
  await admin.from('sets').insert(rows)
}

function muscleRow(page: Page, muscle: string) {
  return page.getByRole('link', { name: new RegExp(`^${muscle}, `) })
}

// [this week's count, the week before's count] from the row's accessible name.
async function readRow(page: Page, muscle: string): Promise<[number, number]> {
  const label = (await muscleRow(page, muscle).getAttribute('aria-label')) ?? ''
  // #135 adds ", under 10 sets last week" to rows below the target band.
  const m = label.match(/^\w+, ([\d.]+) sets?, ([\d.]+) the week before(, under 10 sets last week)?$/)
  expect(m, label).not.toBeNull()
  return [Number(m![1]), Number(m![2])]
}

async function openMuscleGroups(page: Page) {
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Muscle groups', exact: true }).click()
  await expect(page).toHaveURL(/\/progress\/muscles$/)
  await expect(muscleRow(page, 'Legs')).toBeVisible()
  await page.waitForLoadState('networkidle')
}

async function expectNoHorizontalScroll(page: Page) {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  }
}

test('muscle groups: counts main and "also works" sets this week, and the detail spells out the credit', async ({ page, stamp }) => {
  const admin = localDb(page)
  const squat = `E2E Squat ${stamp}`
  const rdl = `E2E RDL ${stamp}`
  let squatId = ''
  let rdlId = ''
  // Seeded before the app loads, so the exercises store has them.
  const userId = await startLocal(page, {
    beforeNavigate: async (id) => {
      const { data: rows } = await admin
        .from('exercises')
        .insert([
          { user_id: id, name: squat, muscle_group: 'legs', also_works: [] },
          { user_id: id, name: rdl, muscle_group: 'back', also_works: ['legs'] },
        ])
        .select('id, name')
      squatId = rows!.find((r) => r.name === squat)!.id
      rdlId = rows!.find((r) => r.name === rdl)!.id
    },
  })

  await openMuscleGroups(page)
  await expect(page.getByRole('heading', { name: 'Muscle groups', exact: true })).toBeVisible()
  await expect(page.getByText('Sets per week. "Also works" muscles count as half a set.')).toBeVisible()
  await expect(page.getByTestId('muscle-week-title')).toHaveText('This week')
  await expect(page.getByRole('button', { name: 'Next week' })).toBeDisabled()
  const [legsBefore] = await readRow(page, 'Legs')
  const [backBefore] = await readRow(page, 'Back')

  await seedWorkout(page, userId, new Date(Date.now() - 60_000), [
    { exerciseId: squatId, count: 4 },
    { exerciseId: rdlId, count: 4 },
  ])

  await page.getByRole('link', { name: 'Back to Progress' }).click()
  await page.getByRole('link', { name: 'Muscle groups', exact: true }).click()
  await expect(muscleRow(page, 'Legs')).toHaveAttribute('aria-label', new RegExp(`^Legs, ${legsBefore + 6} sets,`))
  await expect(muscleRow(page, 'Back')).toHaveAttribute('aria-label', new RegExp(`^Back, ${backBefore + 4} sets,`))

  // Rows stay in the fixed muscle order, never ranked.
  const names = await page.locator('.mrow').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.split(',')[0]))
  expect(names).toEqual(MUSCLES)

  // Every bar and tick sits inside its track.
  for (const row of await page.locator('.mrow').all()) {
    const track = (await row.locator('.track').boundingBox())!
    const fill = (await row.locator('.fill').boundingBox())!
    const tick = (await row.locator('.tick').boundingBox())!
    expect(fill.x).toBeCloseTo(track.x, 0)
    expect(fill.x + fill.width).toBeLessThanOrEqual(track.x + track.width + 0.5)
    expect(tick.x + tick.width / 2).toBeGreaterThanOrEqual(track.x - 0.5)
    expect(tick.x + tick.width / 2).toBeLessThanOrEqual(track.x + track.width + 0.5)
  }

  // The hub tile names the busiest muscle.
  const counts = await Promise.all(MUSCLES.map((m) => readRow(page, m)))
  const top = Math.max(...counts.map(([n]) => n))
  const leader = MUSCLES[counts.findIndex(([n]) => n === top)]

  await expectNoHorizontalScroll(page)

  await muscleRow(page, 'Legs').click()
  await expect(page).toHaveURL(/\/progress\/muscles\/legs$/)
  await expect(page.getByRole('heading', { name: 'Legs', exact: true })).toBeVisible()
  await expect(page.getByTestId('muscle-this-week')).toHaveText(`${legsBefore + 6} sets`)
  await expect(page.getByText(/^12-week average: [\d.]+ a week$/)).toBeVisible()
  await expect(page.getByRole('button', { name: '12W' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('svg.chart rect')).toHaveCount(12)
  await page.getByRole('button', { name: '4W' }).click()
  await expect(page.locator('svg.chart rect')).toHaveCount(4)
  await expect(page.getByText(/^4-week average: [\d.]+ a week$/)).toBeVisible()

  const squatRow = page.locator('.exrow', { hasText: squat })
  await expect(squatRow).toContainText('main muscle')
  await expect(squatRow.locator('.c')).toHaveText('4')
  const rdlRow = page.locator('.exrow', { hasText: rdl })
  await expect(rdlRow).toContainText('also works legs · 4 sets × ½')
  await expect(rdlRow.locator('.c')).toHaveText('2')

  await expectNoHorizontalScroll(page)

  await page.getByRole('link', { name: 'Back to Muscle groups' }).click()
  await expect(page).toHaveURL(/\/progress\/muscles$/)
  await page.getByRole('link', { name: 'Back to Progress' }).click()
  await expect(page.locator('#tile-muscle-sub')).toContainText(`${leader} leads`)
  await expect(page.locator('#tile-muscle-sub')).toContainText(`${top} set`)
  await expect(page.locator('#tile-muscle-sub')).toContainText('this week')

  // The mini bars leave the title room for one line on a 375px phone.
  await page.setViewportSize({ width: 375, height: 800 })
  const title = (await page.locator('#tile-muscle-title').boundingBox())!
  expect(title.height).toBeLessThan(30)

  // Issue #109: the subtitle stays on two lines for every muscle name and a
  // 2-digit count, so the tile matches the Workout log tile's height. The
  // account's real leader varies, so each name is swapped into the template's
  // markup.
  const sub = page.locator('#tile-muscle-sub')
  const muscleTile = page.getByRole('link', { name: 'Muscle groups', exact: true })
  const logTile = page.getByRole('link', { name: 'Workout log', exact: true })
  for (const width of [375, 390]) {
    await page.setViewportSize({ width, height: 800 })
    for (const name of MUSCLES) {
      await sub.evaluate((el, n) => {
        el.innerHTML = `<b>${n}</b> leads<br>12.5 sets this week`
      }, name)
      const lineHeight = await sub.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
      const box = (await sub.boundingBox())!
      expect(box.height, `${name} at ${width}px`).toBeLessThanOrEqual(lineHeight * 2 + 1)
      const tileBox = (await muscleTile.boundingBox())!
      const logBox = (await logTile.boundingBox())!
      expect(Math.abs(tileBox.height - logBox.height), `${name} at ${width}px`).toBeLessThanOrEqual(1)
    }
  }
})

test('muscle groups: a set last week moves the tick, and ‹ shows that week', async ({ page, stamp }) => {
  const admin = localDb(page)
  const curl = `E2E Curl ${stamp}`
  let curlId = ''
  const userId = await startLocal(page, {
    beforeNavigate: async (id) => {
      const { data } = await admin.from('exercises').insert({ user_id: id, name: curl, muscle_group: 'arms' }).select('id').single()
      curlId = data!.id
    },
  })

  await openMuscleGroups(page)
  const [thisWeekBefore, lastWeekBefore] = await readRow(page, 'Arms')

  // Wednesday noon of last week, local time (weeks start Sunday).
  const now = new Date()
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
  await seedWorkout(page, userId, new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - 4, 12), [
    { exerciseId: curlId, count: 3 },
  ])
  // Weeks start Sunday 12:00 AM, so a workout early this Sunday is this week.
  await seedWorkout(page, userId, new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 0, 1), [
    { exerciseId: curlId, count: 2 },
  ])

  await page.getByRole('link', { name: 'Back to Progress' }).click()
  await page.getByRole('link', { name: 'Muscle groups', exact: true }).click()
  await expect(muscleRow(page, 'Arms')).toHaveAttribute(
    'aria-label',
    new RegExp(`^Arms, ${thisWeekBefore + 2} sets, ${lastWeekBefore + 3} the week before(, under 10 sets last week)?$`),
  )

  await page.getByRole('button', { name: 'Previous week' }).click()
  await expect(page.getByTestId('muscle-week-title')).toHaveText('Last week')
  await expect(page.getByRole('button', { name: 'Next week' })).toBeEnabled()
  await expect(muscleRow(page, 'Arms')).toHaveAttribute('aria-label', new RegExp(`^Arms, ${lastWeekBefore + 3} sets?,`))

  await page.getByRole('button', { name: 'Next week' }).click()
  await expect(page.getByTestId('muscle-week-title')).toHaveText('This week')
})

test('muscle groups: an exercise with no muscle group shows the prompt, which opens the check screen', async ({ page, stamp }) => {
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (id) => {
      await admin.from('exercises').insert({ user_id: id, name: `E2E No Group ${stamp}` })
    },
  })

  await openMuscleGroups(page)
  const prompt = page.getByRole('link', { name: /exercises? needs? a muscle group/ })
  await expect(prompt).toBeVisible()
  await prompt.click()
  await expect(page).toHaveURL(/\/exercises\/check$/)
})

// Issue #50 (docs/design/issue-50-muscle-metrics.html): the Sets / Volume /
// Time switch on the one-muscle screen. Per-exercise rows are exact; totals
// aren't, since the shared test accounts hold other specs' sets.
test('one muscle: the metric switch shows volume and time, with half credit spelled out', async ({ page, stamp }) => {
  const admin = localDb(page)
  const squat = `E2E Vol Squat ${stamp}`
  const rdl = `E2E Vol RDL ${stamp}`
  const plank = `E2E Plank ${stamp}`
  const carry = `E2E Carry ${stamp}`
  const ids: Record<string, string> = {}
  const userId = await startLocal(page, {
    beforeNavigate: async (id) => {
      const { data: rows } = await admin
        .from('exercises')
        .insert([
          { user_id: id, name: squat, muscle_group: 'legs', also_works: [], load_type: 'weight' },
          { user_id: id, name: rdl, muscle_group: 'back', also_works: ['legs'], load_type: 'weight' },
          { user_id: id, name: plank, muscle_group: 'core', also_works: [], load_type: 'timed' },
          { user_id: id, name: carry, muscle_group: 'arms', also_works: ['core'], load_type: 'timed' },
        ])
        .select('id, name')
      for (const r of rows!) ids[r.name] = r.id
      const { data: w } = await admin
        .from('workouts')
        .insert({ user_id: id, performed_at: new Date(Date.now() - 60_000).toISOString() })
        .select('id')
        .single()
      const lift = (exercise: string, i: number) => ({ workout_id: w!.id, exercise_id: ids[exercise], set_index: i, reps: 5, weight: 100, weight_unit: 'lb' })
      const hold = (exercise: string, i: number, seconds: number) => ({
        workout_id: w!.id,
        exercise_id: ids[exercise],
        set_index: i,
        reps: null,
        weight: 0,
        weight_unit: 'lb',
        duration_seconds: seconds,
      })
      await admin.from('sets').insert([
        ...[0, 1, 2, 3].map((i) => lift(squat, i)),
        ...[4, 5, 6, 7].map((i) => lift(rdl, i)),
        hold(plank, 8, 60),
        hold(plank, 9, 45),
        hold(carry, 10, 90),
        hold(carry, 11, 90),
      ])
    },
  })
  expect(userId).toBeTruthy()

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Muscle groups', exact: true }).click()
  await muscleRow(page, 'Legs').click()
  await expect(page).toHaveURL(/\/progress\/muscles\/legs$/)

  const switcher = page.getByRole('group', { name: 'Chart metric' })
  await expect(switcher.getByRole('button', { name: 'Sets' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Sets this week', { exact: true })).toBeVisible()

  // Range survives a metric switch.
  await page.getByRole('button', { name: '4W' }).click()
  await switcher.getByRole('button', { name: 'Volume' }).click()
  await expect(switcher.getByRole('button', { name: 'Volume' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '4W' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('svg.chart rect')).toHaveCount(4)
  await expect(page.getByText('Volume this week', { exact: true })).toBeVisible()
  const big = (await page.getByTestId('muscle-this-week').textContent())!.trim()
  const m = big.match(/^([\d,]+)\s(lb|kg)$/)
  expect(m, big).not.toBeNull()
  const unit = m![2]
  const shown = (lb: number) => Math.round(unit === 'lb' ? lb : lb / 2.20462).toLocaleString('en-US')
  expect(Number(m![1].replace(/,/g, ''))).toBeGreaterThanOrEqual(Number(shown(3000).replace(/,/g, '')))
  await expect(page.getByText(new RegExp(`^4-week average: [\\d,]+ ${unit} a week$`))).toBeVisible()
  await expect(page.locator('svg.chart')).toHaveAttribute('aria-label', /^Legs volume per week over 4 weeks, [\d,]+ (lb|kg) this week so far$/)

  const squatRow = page.locator('.exrow', { hasText: squat })
  await expect(squatRow).toContainText('main muscle')
  await expect(squatRow.locator('.c')).toHaveText(shown(2000))
  const rdlRow = page.locator('.exrow', { hasText: rdl })
  await expect(rdlRow).toContainText(`also works legs · ${shown(2000)} ${unit} × ½`)
  await expect(rdlRow.locator('.c')).toHaveText(shown(1000))

  // The switch is one row, inside the card, buttons sharing a top edge.
  await page.setViewportSize({ width: 375, height: 800 })
  const card = (await page.locator('.card').first().boundingBox())!
  const boxes = await Promise.all((await switcher.getByRole('button').all()).map(async (b) => (await b.boundingBox())!))
  for (const b of boxes) {
    expect(b.y).toBeCloseTo(boxes[0].y, 0)
    expect(b.x).toBeGreaterThanOrEqual(card.x)
    expect(b.x + b.width).toBeLessThanOrEqual(card.x + card.width + 0.5)
  }
  await expectNoHorizontalScroll(page)

  // Core: timed work, main and "also works".
  await page.getByRole('link', { name: 'Back to Muscle groups' }).click()
  await muscleRow(page, 'Core').click()
  await expect(page).toHaveURL(/\/progress\/muscles\/core$/)
  await switcher.getByRole('button', { name: 'Time' }).click()
  await expect(page.getByText('Time this week', { exact: true })).toBeVisible()
  await expect(page.getByTestId('muscle-this-week')).toHaveText(/^\d+(:\d\d){1,2}$/)
  const plankRow = page.locator('.exrow', { hasText: plank })
  await expect(plankRow).toContainText('main muscle')
  await expect(plankRow.locator('.c')).toHaveText('1:45')
  const carryRow = page.locator('.exrow', { hasText: carry })
  await expect(carryRow).toContainText('also works core · 3:00 × ½')
  await expect(carryRow.locator('.c')).toHaveText('1:30')
  await expectNoHorizontalScroll(page)
})
