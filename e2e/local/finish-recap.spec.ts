import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 106: the post-finish session recap that
// replaced item 6's "Volume over time" chart and item 105's all-time
// Longest/Farthest rows. Headline volume with a delta vs the template's last
// session, "New records" (only when an earlier workout was beaten),
// "Vs last time" chips (green when up, neutral grey when lighter, never red),
// the "This week" strip, and the Done/Resume actions.

const DAY_MS = 24 * 60 * 60 * 1000

for (const allNew of [false, true]) {
  test(`finish recap: ${allNew ? 'all-new template' : 'mixed freeform'} celebrates new exercises`, async ({ page, stamp }) => {
    const newName = `E2E Romanian Deadlift ${stamp}`
    const otherName = `E2E Cable Row ${stamp}`
    const templateName = `E2E New Moves ${stamp}`
    const admin = localDb(page)

    await startLocal(page, {
      beforeNavigate: async (userId) => {
        const { data: exercises, error } = await admin.from('exercises').insert([
          { user_id: userId, name: newName },
          { user_id: userId, name: otherName },
        ]).select('id, name')
        if (error) throw error
        const newId = exercises!.find(exercise => exercise.name === newName)!.id
        const otherId = exercises!.find(exercise => exercise.name === otherName)!.id
        if (allNew) {
          const { data: template, error } = await admin.from('workout_templates')
            .insert({ user_id: userId, name: templateName }).select('id').single()
          if (error) throw error
          const { error: linkError } = await admin.from('workout_template_exercises').insert([
            { template_id: template!.id, exercise_id: newId, position: 0 },
            { template_id: template!.id, exercise_id: otherId, position: 1 },
          ])
          if (linkError) throw linkError
          // An earlier workout of something else, so this is the routine's
          // first run but not the first workout ever (#274).
          const { data: earlierEx } = await admin.from('exercises').insert({ name: `E2E Earlier Curl ${stamp}` }).select('id').single()
          const { data: earlier } = await admin.from('workouts')
            .insert({ performed_at: new Date(Date.now() - 2 * DAY_MS).toISOString() }).select('id').single()
          const { error: earlierError } = await admin.from('sets').insert({
            workout_id: earlier!.id, exercise_id: earlierEx!.id, set_index: 0, reps: 10, weight: 20, weight_unit: 'lb',
          })
          if (earlierError) throw earlierError
        } else {
          const { data: prior, error } = await admin.from('workouts').insert({
            user_id: userId, performed_at: new Date(Date.now() - DAY_MS).toISOString(),
          }).select('id').single()
          if (error) throw error
          const { error: setError } = await admin.from('sets').insert({
            workout_id: prior!.id, exercise_id: otherId, set_index: 0, reps: 10, weight: 50, weight_unit: 'lb',
          })
          if (setError) throw setError
        }
      },
    })
    await page.setViewportSize({ width: 375, height: 800 })
    await page.getByRole('button', { name: allNew ? templateName : 'Freeform', exact: true }).click()
    for (const name of [newName, otherName]) {
      await selectExercise(page, name, allNew)
      await page.getByLabel('Reps').fill('12')
      await page.getByLabel('Weight').fill('50')
      await page.getByRole('button', { name: 'Add set' }).click()
      await dismissCelebrationIfShown(page)
      await expect(page.locator('.set-row-logged').first()).toContainText('12 × 50 lb')
    }
    await page.getByRole('button', { name: 'Finish workout' }).click()

    const recap = page.getByTestId('post-finish-card')
    const card = recap.getByTestId('recap-comparisons')
    await expect(card.getByRole('heading', { name: allNew ? 'All new today' : 'Vs last time' })).toBeVisible()
    await expect(card.getByTestId('recap-comparison')).toHaveCount(2)
    await expect(card.getByText('New', { exact: true })).toHaveCount(allNew ? 2 : 1)
    await expect(recap).not.toContainText('First time')
    const newRow = card.getByTestId('recap-comparison').filter({ hasText: newName })
    await expect(newRow).toContainText('12 × 50 lb')
    await expect(newRow.getByText('New', { exact: true })).toHaveClass(/chip-new/)
    const otherChip = card.getByTestId('recap-comparison').filter({ hasText: otherName }).locator('.chip')
    await expect(otherChip).toHaveText(allNew ? 'New' : '+2 reps')
    await expect(otherChip).toHaveClass(allNew ? /chip-new/ : /chip-up/)
    // Earlier workouts exist, so a routine's first run names the routine (#274).
    await expect(recap.getByText('First workout logged.')).toHaveCount(0)
    await expect(recap.getByText(`First ${templateName} logged.`)).toHaveCount(allNew ? 1 : 0)

    // The gold status stays borderless and fits beside a long name at phone width.
    const chip = newRow.getByText('New', { exact: true })
    await expect(chip).toHaveCSS('border-top-width', '0px')
    const chipBox = (await chip.boundingBox())!
    const nameBox = (await newRow.getByText(newName, { exact: true }).boundingBox())!
    const cardBox = (await card.boundingBox())!
    expect(chipBox.x).toBeGreaterThanOrEqual(nameBox.x + nameBox.width)
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
    const sparkle = (await chip.locator('svg').boundingBox())!
    expect(sparkle.width).toBe(12)
    expect(sparkle.height).toBe(12)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    await recap.getByRole('button', { name: 'Done', exact: true }).click()
  })
}

test('finish recap: heavier session shows records and green chips, a lighter one shows neutral chips', async ({
  page,
  stamp,
}) => {
  const pressName = `E2E Recap Press ${stamp}`
  const rowName = `E2E Recap Row ${stamp}`
  const templateName = `E2E Recap Upper ${stamp}`

  const admin = localDb(page)

  // Prior session of the same template: press 5 × 100 (500), row 10 × 50
  // (500), total 1,000 lb. Pre-existing state, not behavior under test, so
  // seeded directly (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: press } = await admin.from('exercises').insert({ user_id: userId, name: pressName }).select('id').single()
      const { data: row } = await admin.from('exercises').insert({ user_id: userId, name: rowName }).select('id').single()
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin.from('workout_template_exercises').insert([
        { template_id: template!.id, exercise_id: press!.id, position: 0 },
        { template_id: template!.id, exercise_id: row!.id, position: 1 },
      ])
      const { data: prior } = await admin
        .from('workouts')
        .insert({ user_id: userId, template_id: template!.id, performed_at: new Date(Date.now() - DAY_MS).toISOString() })
        .select('id')
        .single()
      await admin.from('sets').insert([
        { workout_id: prior!.id, exercise_id: press!.id, set_index: 0, reps: 5, weight: 100, weight_unit: 'lb' },
        { workout_id: prior!.id, exercise_id: row!.id, set_index: 1, reps: 10, weight: 50, weight_unit: 'lb' },
      ])
    },
  })

  // Heavier session: press 5 × 110 (a new heaviest set), row 12 × 50 (+2
  // reps). 550 + 600 = 1,150 lb, +150 vs last time.
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, pressName, true)
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('110')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged', { hasText: '5 × 110 lb' })).toBeVisible()
  await selectExercise(page, rowName, true)
  await page.getByLabel('Reps').fill('12')
  await page.getByLabel('Weight').fill('50')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged', { hasText: '12 × 50 lb' })).toBeVisible()
  await page.getByRole('button', { name: 'Finish workout' }).click()

  const recap = page.getByTestId('post-finish-card')
  await expect(recap.getByRole('heading', { name: `${templateName}, done.` })).toBeVisible()
  await expect(recap).toContainText('Workout saved')
  // Not the template's first run, so no first-workout celebration.
  await expect(recap.getByText('First workout logged.')).toHaveCount(0)

  const hero = recap.getByTestId('recap-hero')
  await expect(hero).toContainText('Volume moved')
  await expect(hero).toContainText('1,150')
  await expect(recap.getByTestId('recap-volume-delta')).toHaveText('+150 lb')
  await expect(recap.getByTestId('recap-volume-delta')).toHaveClass(/chip-up/)
  await expect(hero).toContainText(`vs your last ${templateName}`)
  const bars = recap.getByTestId('recap-volume-bar')
  await expect(bars).toHaveCount(2)
  await expect(bars.nth(0)).toContainText('1,000 lb')
  await expect(bars.nth(1)).toContainText('Today: 1,150 lb')

  // Sets and Time tiles for a strength session.
  const tiles = recap.getByTestId('recap-tile')
  await expect(tiles).toHaveCount(2)
  await expect(tiles.nth(0)).toContainText('Sets')
  await expect(tiles.nth(0)).toContainText('17 reps')
  await expect(tiles.nth(1)).toContainText('Time')

  const records = recap.getByTestId('recap-records')
  await expect(records).toContainText('New record')
  const record = records.getByTestId('recap-record')
  await expect(record).toHaveCount(1)
  await expect(record).toContainText(pressName)
  await expect(record).toContainText('Heaviest set · was 100 lb')
  await expect(record).toContainText('110 lb × 5')
  // Issue #46: est. 1RM 5 × 100 -> 117, 5 × 110 -> 128.
  await expect(record.getByTestId('recap-e1rm-gain')).toHaveText('est. 1RM ▲ 11 lb')
  await expect(record.getByTestId('recap-e1rm-gain')).toHaveClass(/chip-up/)

  // The press is already celebrated above, so only the row is compared.
  const comparisons = recap.getByTestId('recap-comparison')
  await expect(comparisons).toHaveCount(1)
  await expect(comparisons.first()).toContainText(rowName)
  await expect(comparisons.first()).toContainText('12 × 50 lb')
  await expect(comparisons.first().locator('.chip')).toHaveText('+2 reps')
  await expect(comparisons.first().locator('.chip')).toHaveClass(/chip-up/)
  // Comparison rows get no est. 1RM pill.
  await expect(recap.getByTestId('recap-e1rm-gain')).toHaveCount(1)

  // Issue #46: tapping a record row opens that exercise's history with its
  // progress chart over the recap; closing it leaves the recap in place.
  await record.getByRole('button', { name: new RegExp(`^${pressName} progress`) }).click()
  const pressHistory = page.getByRole('dialog', { name: `${pressName} history` })
  await expect(pressHistory).toBeVisible()
  await expect(pressHistory.getByRole('img', { name: /1RM over .*, from 117 to 128/i })).toBeVisible()
  await pressHistory.getByRole('button', { name: 'Close history' }).click()
  await expect(pressHistory).toHaveCount(0)
  await expect(recap.getByRole('heading', { name: `${templateName}, done.` })).toBeVisible()

  // A Vs last time row opens its own exercise's history the same way.
  await comparisons.first().getByRole('button', { name: new RegExp(`^${rowName} progress`) }).click()
  const rowHistory = page.getByRole('dialog', { name: `${rowName} history` })
  await expect(rowHistory).toBeVisible()
  await rowHistory.getByRole('button', { name: 'Close history' }).click()
  await expect(rowHistory).toHaveCount(0)
  await expect(recap).toBeVisible()

  // Today's dot on the week strip is marked as a strength day.
  const week = recap.getByTestId('recap-week')
  await expect(week.getByRole('listitem', { name: /\(today\)/ })).toHaveAccessibleName(/strength workout \(today\)/)

  await recap.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('post-finish-card')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()

  // Lighter session: press 5 × 90, row 10 × 50. 450 + 500 = 950 lb, 200
  // under the session just finished. Nothing beats a prior best.
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, pressName, true)
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('90')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.set-row-logged', { hasText: '5 × 90 lb' })).toBeVisible()
  await selectExercise(page, rowName, true)
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('50')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.set-row-logged', { hasText: '10 × 50 lb' })).toBeVisible()
  await page.getByRole('button', { name: 'Finish workout' }).click()

  await expect(recap.getByRole('heading', { name: `${templateName}, done.` })).toBeVisible()
  await expect(recap.getByTestId('recap-records')).toHaveCount(0)
  await expect(recap.getByTestId('recap-volume-delta')).toHaveText('−200 lb')
  await expect(recap.getByTestId('recap-volume-delta')).toHaveClass(/chip-neutral/)
  await expect(recap.getByTestId('recap-volume-bar')).toHaveCount(3)

  // Lighter reads as a neutral grey chip, never an alarming red one.
  await expect(comparisons).toHaveCount(2)
  for (const i of [0, 1]) {
    await expect(comparisons.nth(i).locator('.chip')).toHaveText('Lighter')
    await expect(comparisons.nth(i).locator('.chip')).toHaveClass(/chip-neutral/)
  }

  await recap.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()
})

test('finish recap: freeform cardio session leads with time moving, distance and calories', async ({ page, stamp }) => {
  const treadmillName = `E2E Recap Treadmill ${stamp}`
  const plankName = `E2E Recap Plank ${stamp}`

  const admin = localDb(page)

  // Treadmill has a prior best of 20:00 / 2.1 mi. Plank has no history.
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: treadmill } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: treadmillName, load_type: 'timed', tracks_distance: true, tracks_calories: true })
        .select('id')
        .single()
      const { data: prior } = await admin
        .from('workouts')
        .insert({ user_id: userId, performed_at: new Date(Date.now() - DAY_MS).toISOString() })
        .select('id')
        .single()
      await admin.from('sets').insert({
        workout_id: prior!.id,
        exercise_id: treadmill!.id,
        set_index: 0,
        reps: null,
        weight: 0,
        weight_unit: 'lb',
        duration_seconds: 1200,
        distance: 2.1,
        distance_unit: 'mi',
        calories: 200,
      })
      await admin.from('exercises').insert({ user_id: userId, name: plankName, load_type: 'timed' })
    },
  })

  // Narrowest supported phone width: the recap must not scroll sideways.
  await page.setViewportSize({ width: 320, height: 720 })

  await page.getByRole('button', { name: 'Freeform' }).click()

  await selectExercise(page, treadmillName, false)
  await page.getByLabel('Time, minutes and seconds').fill('2500')
  await page.getByLabel('Distance', { exact: true }).fill('3.1')
  await page.getByLabel('Calories', { exact: true }).fill('300')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.set-row-logged').first()).toContainText('25:00 · 3.1 mi · 300 cal')

  await selectExercise(page, plankName, false)
  await page.getByLabel('Time, minutes and seconds').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.set-row-logged').first()).toContainText('0:45')

  await page.getByRole('button', { name: 'Finish workout' }).click()

  const recap = page.getByTestId('post-finish-card')
  await expect(recap.getByRole('heading', { name: 'Freeform workout, done.' })).toBeVisible()

  // 25:00 + 0:45 = 25:45 of timed work, rounded to 26 min. No volume at all.
  const hero = recap.getByTestId('recap-hero')
  await expect(hero).toContainText('Time moving')
  await expect(hero).toContainText('26')
  await expect(hero).toContainText(`${treadmillName} 25:00`)
  await expect(hero).toContainText(`${plankName} 0:45`)
  await expect(recap.getByText('Volume moved')).toHaveCount(0)
  await expect(recap.getByTestId('recap-volume-bar')).toHaveCount(0)

  const tiles = recap.getByTestId('recap-tile')
  await expect(tiles).toHaveCount(2)
  await expect(tiles.nth(0)).toContainText('Distance')
  await expect(tiles.nth(0)).toContainText('3.1 mi')
  await expect(tiles.nth(1)).toContainText('Calories')
  await expect(tiles.nth(1)).toContainText('300')
  await expect(tiles.nth(1)).toContainText('from machine readouts')

  // Both the treadmill's duration and distance beat its prior best.
  const records = recap.getByTestId('recap-record')
  await expect(records).toHaveCount(2)
  await expect(records.nth(0)).toContainText('Longest · was 20:00')
  await expect(records.nth(0)).toContainText('25:00')
  await expect(records.nth(1)).toContainText('Farthest · was 2.1 mi')
  await expect(records.nth(1)).toContainText('3.1 mi')

  // The comparison card's only row is new (the treadmill is in records).
  const comparisons = recap.getByTestId('recap-comparison')
  await expect(comparisons).toHaveCount(1)
  await expect(comparisons.first()).toContainText(plankName)
  await expect(comparisons.first().locator('.chip')).toHaveText('New')
  await expect(comparisons.first().locator('.chip')).toHaveClass(/chip-new/)
  await expect(recap.getByRole('heading', { name: 'All new today' })).toBeVisible()
  await expect(recap).not.toContainText('First time')

  const week = recap.getByTestId('recap-week')
  await expect(week.getByRole('listitem', { name: /\(today\)/ })).toHaveAccessibleName(/(strength|timed) workout \(today\)/)

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)

  await recap.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()
})
