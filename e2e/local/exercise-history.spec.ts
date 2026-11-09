import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 1: a focused per-exercise history detail,
// opened from the active logger, showing past workouts newest-first with
// sets in set order, mixed lb/kg weights kept separate (never converted),
// and a per-unit "heaviest completed set" summary. Also confirms opening it
// mid-workout doesn't lose an unsaved draft row -- it's an overlay, not a
// route, specifically so WorkoutLogger.vue never unmounts underneath it.
test('exercise history: opened from the logger shows newest-first sets across mixed units without losing a draft row', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E History Bench ${stamp}`

  const admin = localDb(page)
  const now = Date.now()

  // Issue #53: charts follow the profile's unit once one is picked, so this
  // account prefers kg and the lb sets below get converted.
  await startLocal(page, {
    weightUnit: 'kg',
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()

      // Older workout, logged in lb.
      const { data: olderWorkout } = await admin
        .from('workouts')
        .insert({ user_id: userId, performed_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString() })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: olderWorkout!.id, exercise_id: exercise!.id, set_index: 0, reps: 8, weight: 185, weight_unit: 'lb' })
      await admin
        .from('sets')
        .insert({ workout_id: olderWorkout!.id, exercise_id: exercise!.id, set_index: 1, reps: 8, weight: 190, weight_unit: 'lb' })

      // Newer workout, logged in kg with an RPE on the first set.
      const { data: newerWorkout } = await admin
        .from('workouts')
        .insert({ user_id: userId, performed_at: new Date(now).toISOString() })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: newerWorkout!.id, exercise_id: exercise!.id, set_index: 0, reps: 5, weight: 80, weight_unit: 'kg', rpe: 8 })
      await admin
        .from('sets')
        .insert({ workout_id: newerWorkout!.id, exercise_id: exercise!.id, set_index: 1, reps: 5, weight: 82.5, weight_unit: 'kg' })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  // An unsaved draft row -- still there once the overlay below is dismissed
  // proves WorkoutLogger.vue was never unmounted to show it.
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('225')

  await page.getByRole('button', { name: 'View exercise history' }).click()

  const overlay = page.getByRole('dialog', { name: `${exerciseName} history` })
  await expect(overlay.getByRole('heading', { name: exerciseName })).toBeVisible()
  await expect(overlay.getByText('Archived')).toHaveCount(0)

  // Issue #21: 2+ sessions swap the "heaviest completed set" card for the
  // progress chart, in the preferred kg with the lb sets converted: 190 lb x 8
  // -> 109 kg est. 1RM, 82.5 kg x 5 -> 96.
  await expect(overlay.locator('.summary-card')).toHaveCount(0)
  await expect(overlay.getByRole('img', { name: 'Est. 1RM over 3 months, from 109 to 96 kg' })).toBeVisible()
  await expect(overlay.getByText('Includes converted lb sets')).toBeVisible()

  const entries = overlay.locator('.history-entry')
  await expect(entries).toHaveCount(2)

  // Newest workout first, in columns (issue #181). Each set keeps the unit
  // it was logged in.
  const newest = entries.nth(0).locator('tbody tr')
  await expect(entries.nth(0).locator('thead th')).toHaveText(['Set', 'Weight', 'Reps', 'RPE', 'Record'])
  await expect(newest).toHaveCount(2)
  await expect(newest.nth(0).locator('td')).toHaveText(['1', '80kg', '5', '8', ''])
  await expect(newest.nth(1).locator('td')).toHaveText(['2', '82.5kg', '5', '–', ''])

  // Older workout second, its own sets still in logged order, and no RPE
  // column since neither set has one.
  const older = entries.nth(1).locator('tbody tr')
  await expect(entries.nth(1).locator('thead th')).toHaveText(['Set', 'Weight', 'Reps', 'Record'])
  await expect(older.nth(0).locator('td')).toHaveText(['1', '185lb', '8', ''])
  await expect(older.nth(1).locator('td')).toHaveText(['2', '190lb', '8', ''])

  await overlay.getByRole('button', { name: 'Close history' }).click()
  await expect(overlay).not.toBeVisible()

  await expect(page.getByLabel('Reps')).toHaveValue('5')
  await expect(page.getByLabel('Weight')).toHaveValue('225')
})

// Issue #21: the progress chart card on a weight exercise -- metric toggle,
// range pills, and the "What's est. 1RM?" explainer layered over the sheet.
test('exercise history: weight exercise with several sessions shows the progress chart and the est. 1RM explainer', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E History Chart ${stamp}`
  const admin = localDb(page)
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      // 135 x 10 (est. 180) is outside 3M; then 175, 180, 185 x 8 (222, 228, 234).
      // Only the last one is inside 1M.
      const sessions: [number, number, number][] = [
        [200, 135, 10],
        [70, 175, 8],
        [45, 180, 8],
        [1, 185, 8],
      ]
      for (const [daysAgo, weight, reps] of sessions) {
        const { data: w } = await admin
          .from('workouts')
          .insert({ user_id: userId, performed_at: new Date(now - daysAgo * day).toISOString() })
          .select('id')
          .single()
        await admin.from('sets').insert({ workout_id: w!.id, exercise_id: exercise!.id, set_index: 0, reps, weight, weight_unit: 'lb' })
      }
    },
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await goTo(page, 'Exercises')
  await page.locator('.row-wrap', { hasText: exerciseName }).getByRole('button', { name: 'View exercise history' }).click()

  const overlay = page.getByRole('dialog', { name: `${exerciseName} history` })
  const headline = overlay.locator('.headline')

  await expect(overlay.getByRole('img', { name: 'Est. 1RM over 3 months, from 222 to 234 lb' })).toBeVisible()
  await expect(headline).toContainText('234 lb')
  await expect(headline).toContainText('▲ 12 lb')
  await expect(overlay.getByText('Best: 185 lb × 8 on')).toBeVisible()
  await expect(overlay.locator('.summary-card')).toHaveCount(0)

  const metricToggle = overlay.getByRole('group', { name: 'Chart metric' })
  await metricToggle.getByRole('button', { name: 'Heaviest' }).click()
  await expect(headline).toContainText('185 lb')
  await expect(headline).toContainText('▲ 10 lb')
  await metricToggle.getByRole('button', { name: 'Volume' }).click()
  await expect(headline).toContainText('1,480 lb')
  await expect(overlay.getByRole('button', { name: "What's est. 1RM?" })).toHaveCount(0)

  await metricToggle.getByRole('button', { name: 'Est. 1RM' }).click()
  await overlay.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: 'All' }).click()
  await expect(overlay.getByRole('img', { name: 'Est. 1RM over all time, from 180 to 234 lb' })).toBeVisible()
  await expect(headline).toContainText('▲ 54 lb')

  // 1M holds only one session: not enough to draw, with a way back to All.
  await overlay.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: '1M' }).click()
  await expect(overlay.getByText('Not enough sessions in this range.')).toBeVisible()
  await overlay.getByRole('button', { name: 'Show all' }).click()
  await expect(overlay.getByRole('img', { name: /^Est\. 1RM over all time/ })).toBeVisible()

  // No horizontal scroll down to a 320px phone.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    const panel = overlay.locator('.history-panel')
    const overflow = await panel.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  }

  await overlay.getByRole('button', { name: "What's est. 1RM?" }).click()
  const explainer = page.getByRole('dialog', { name: "What's est. 1RM?" })
  await expect(explainer).toContainText('one-rep max')
  await expect(explainer).toContainText('≈ 234 lb')
  await explainer.getByRole('button', { name: 'Got it' }).click()
  await expect(explainer).toHaveCount(0)
  await expect(overlay).toBeVisible()

  // Escape closes only the explainer, too.
  await overlay.getByRole('button', { name: "What's est. 1RM?" }).click()
  await expect(explainer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(explainer).toHaveCount(0)
  await expect(overlay).toBeVisible()
})

// The "Next time" target and "Best reps at each weight" cards under the
// chart (replaced #45's rep-max table), on weight exercises only.
test('exercise history: weight exercise shows a next-time target and best reps at each weight, a bodyweight one does not', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E History RepRec ${stamp}`
  const bodyweightName = `E2E History RepRec BW ${stamp}`
  const admin = localDb(page)
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      // The user's Leg Extension: best at 210 is 11 (two days ago), then 9
      // yesterday. Five lighter weights from a month ago push it past the
      // six rows shown before "Show all".
      const sessions: [number, [number, number][]][] = [
        [30, [[170, 12], [160, 12], [150, 12], [140, 12], [130, 12]]],
        [2, [[210, 11], [210, 8], [190, 10]]],
        [1, [[210, 9], [190, 10], [190, 9]]],
      ]
      for (const [daysAgo, sets] of sessions) {
        const { data: w } = await admin
          .from('workouts')
          .insert({ user_id: userId, performed_at: new Date(now - daysAgo * day).toISOString() })
          .select('id')
          .single()
        await admin.from('sets').insert(
          sets.map(([weight, reps], i) => ({ workout_id: w!.id, exercise_id: exercise!.id, set_index: i, reps, weight, weight_unit: 'lb' })),
        )
      }

      const { data: bodyweight } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: bodyweightName, load_type: 'bodyweight' })
        .select('id')
        .single()
      for (const daysAgo of [5, 1]) {
        const { data: w } = await admin
          .from('workouts')
          .insert({ user_id: userId, performed_at: new Date(now - daysAgo * day).toISOString() })
          .select('id')
          .single()
        await admin.from('sets').insert({ workout_id: w!.id, exercise_id: bodyweight!.id, set_index: 0, reps: 12, weight: 0, weight_unit: 'lb' })
      }
    },
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await goTo(page, 'Exercises')
  await page.locator('.row-wrap', { hasText: exerciseName }).getByRole('button', { name: 'View exercise history' }).click()

  const overlay = page.getByRole('dialog', { name: `${exerciseName} history` })
  // Last session's heaviest was 210 x 9, but the best at 210 is 11: beat it.
  const next = overlay.getByRole('region', { name: 'Next time' })
  await expect(next.locator('.goal')).toHaveText('210 lb × 12')
  await expect(next).toContainText("Beat your 11 from")
  await expect(next).toContainText("Hit 12 and it's time to go up to 215.")
  await expect(next.locator('.range span.done')).toHaveCount(4)
  await expect(next.locator('.range span.target')).toHaveText('12')

  const best = overlay.getByRole('region', { name: 'Best reps at each weight' })
  const rows = best.locator('tbody tr')
  await expect(rows.locator('th')).toHaveText(['210 Last', '190', '170', '160', '150', '140'])
  await expect(rows.locator('td.reps')).toHaveText(['11', '10', '12', '12', '12', '12'])
  await best.getByRole('button', { name: 'Show all 7 weights' }).click()
  await expect(rows).toHaveCount(7)
  await expect(rows.nth(6).locator('th')).toHaveText('130')
  await best.getByRole('button', { name: 'Show fewer' }).click()
  await expect(rows).toHaveCount(6)

  // Both cards sit between the chart and the session list.
  const order = await overlay.locator('.chart-card, .rr-card, .history-list').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-labelledby') ?? [...e.classList].find((n) => n === 'chart-card' || n === 'history-list')),
  )
  expect(order).toEqual(['chart-card', 'next-time-title', 'best-reps-title', 'history-list'])

  // No horizontal scroll down to a 320px phone.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 800 })
    const overflow = await overlay.locator('.history-panel').evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  }

  await overlay.getByRole('button', { name: 'Close history' }).click()
  await page.locator('.row-wrap', { hasText: bodyweightName }).getByRole('button', { name: 'View exercise history' }).click()
  const bodyweightOverlay = page.getByRole('dialog', { name: `${bodyweightName} history` })
  await expect(bodyweightOverlay.locator('.history-entry')).toHaveCount(2)
  await expect(bodyweightOverlay.locator('.history-entry').first().locator('thead th')).toHaveText(['Set', 'Added', 'Reps', 'Record'])
  await expect(bodyweightOverlay.locator('.history-entry').first().locator('tbody td')).toHaveText(['1', '–', '12', ''])
  await expect(bodyweightOverlay.getByRole('region', { name: 'Next time' })).toHaveCount(0)
  await expect(bodyweightOverlay.getByRole('region', { name: 'Best reps at each weight' })).toHaveCount(0)
})

// Issue #21: with a single session there's no trend yet -- the summary card
// stays and a card says when the chart starts.
test('exercise history: a single session keeps the summary card and explains when the chart starts', async ({ page, stamp }) => {
  const exerciseName = `E2E History Single ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      const { data: w } = await admin
        .from('workouts')
        .insert({ user_id: userId, performed_at: new Date().toISOString() })
        .select('id')
        .single()
      await admin.from('sets').insert({ workout_id: w!.id, exercise_id: exercise!.id, set_index: 0, reps: 8, weight: 185, weight_unit: 'lb' })
    },
  })

  await goTo(page, 'Exercises')
  await page.locator('.row-wrap', { hasText: exerciseName }).getByRole('button', { name: 'View exercise history' }).click()

  const overlay = page.getByRole('dialog', { name: `${exerciseName} history` })
  await expect(overlay.locator('.summary-card')).toContainText('Heaviest completed set')
  await expect(overlay.locator('.summary-card')).toContainText('185lb')
  await expect(overlay.getByText('Log this one more time to see your trend.')).toBeVisible()
  await expect(overlay.getByRole('img', { name: /^Est\. 1RM over/ })).toHaveCount(0)
})

// Covers the "no history yet" case from docs/backlog.md item 1, opened from
// the Exercises tab entry point rather than the logger.
test('exercise history: opened from the Exercises tab shows no history for a brand-new exercise', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E History Fresh ${stamp}`

  const admin = localDb(page)

  // The exercise is pre-existing state (deliberately with no sets), not
  // behavior under test -- seed it directly via the admin client instead of
  // driving the Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Exercises')
  await expect(page.getByText(exerciseName)).toBeVisible()

  const row = page.locator('.row-wrap', { hasText: exerciseName })
  await row.getByRole('button', { name: 'View exercise history' }).click()

  const overlay = page.getByRole('dialog', { name: `${exerciseName} history` })
  await expect(overlay.getByRole('heading', { name: exerciseName })).toBeVisible()
  // Issue #165: the empty text stays hidden behind the "Loading…" skeleton
  // until the history fetch returns, which under two workers sometimes took
  // longer than the 5s default. Wait the fetch out explicitly first.
  await expect(overlay.getByRole('status').filter({ hasText: 'Loading…' })).toHaveCount(0, { timeout: 15_000 })
  await expect(overlay.getByText('No sets logged for this exercise yet.')).toBeVisible()
  await expect(overlay.locator('.summary-values')).toHaveCount(0)
})

// Covers docs/backlog.md item 94: a timed exercise's weight/reps columns are
// meaningless (see item 93), so its history detail gets its own Longest /
// Farthest summary instead of the "heaviest completed set" card.
test('exercise history: timed exercise shows Longest and Farthest summaries', async ({ page, stamp }) => {
  const treadmillName = `E2E History Treadmill ${stamp}`
  const plankName = `E2E History Plank ${stamp}`

  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: treadmill } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: treadmillName, load_type: 'timed', tracks_distance: true })
        .select('id')
        .single()
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: userId, performed_at: new Date().toISOString() })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: workout!.id, exercise_id: treadmill!.id, set_index: 0, reps: null, weight: 0, weight_unit: 'lb', duration_seconds: 60 })
      await admin
        .from('sets')
        .insert({ workout_id: workout!.id, exercise_id: treadmill!.id, set_index: 1, reps: null, weight: 0, weight_unit: 'lb', duration_seconds: 90 })
      await admin
        .from('sets')
        .insert({
          workout_id: workout!.id,
          exercise_id: treadmill!.id,
          set_index: 2,
          reps: null,
          weight: 0,
          weight_unit: 'lb',
          duration_seconds: 1200,
          distance: 2.1,
          distance_unit: 'mi',
        })

      // Duration-only exercise (a plank) never tracks distance -- no
      // Farthest row should show for it.
      const { data: plank } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: plankName, load_type: 'timed' })
        .select('id')
        .single()
      const { data: plankWorkout } = await admin
        .from('workouts')
        .insert({ user_id: userId, performed_at: new Date().toISOString() })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: plankWorkout!.id, exercise_id: plank!.id, set_index: 0, reps: null, weight: 0, weight_unit: 'lb', duration_seconds: 45 })
    },
  })

  await goTo(page, 'Exercises')

  const treadmillRow = page.locator('.row-wrap', { hasText: treadmillName })
  await treadmillRow.getByRole('button', { name: 'View exercise history' }).click()

  const treadmillOverlay = page.getByRole('dialog', { name: `${treadmillName} history` })
  const treadmillSummaries = treadmillOverlay.locator('.summary-card')
  await expect(treadmillSummaries).toHaveCount(2)
  await expect(treadmillSummaries.nth(0)).toContainText('Longest')
  await expect(treadmillSummaries.nth(0)).toContainText('20:00')
  await expect(treadmillSummaries.nth(1)).toContainText('Farthest')
  await expect(treadmillSummaries.nth(1)).toContainText('2.1 mi')
  await treadmillOverlay.getByRole('button', { name: 'Close history' }).click()

  const plankRow = page.locator('.row-wrap', { hasText: plankName })
  await plankRow.getByRole('button', { name: 'View exercise history' }).click()

  const plankOverlay = page.getByRole('dialog', { name: `${plankName} history` })
  const plankSummaries = plankOverlay.locator('.summary-card')
  await expect(plankSummaries).toHaveCount(1)
  await expect(plankSummaries.nth(0)).toContainText('Longest')
  await expect(plankSummaries.nth(0)).toContainText('0:45')
})

// Issue #181: one card per session with the template name, a top-set line,
// the record set marked, and the newest 10 sessions until "Show older".
test('exercise history: session cards page 10 at a time and mark the record set', async ({ page, stamp }) => {
  const exerciseName = `E2E History Paging ${stamp}`
  const templateName = `E2E Push Day With A Very Long Template Name ${stamp}`
  const admin = localDb(page)
  const day = 24 * 60 * 60 * 1000
  const now = Date.now()

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin.from('exercises').insert({ user_id: userId, name: exerciseName }).select('id').single()
      const { data: template } = await admin.from('workout_templates').insert({ user_id: userId, name: templateName }).select('id').single()
      // 12 sessions, oldest first: 100 lb x 5 climbing 5 lb a session. The
      // newest also has a lighter back-off set at RPE 7.
      for (let i = 0; i < 12; i++) {
        const { data: w } = await admin
          .from('workouts')
          .insert({ user_id: userId, performed_at: new Date(now - (12 - i) * day).toISOString(), template_id: i === 11 ? template!.id : null })
          .select('id')
          .single()
        const sets: Record<string, unknown>[] = [{ workout_id: w!.id, exercise_id: exercise!.id, set_index: 0, reps: 5, weight: 100 + i * 5, weight_unit: 'lb' }]
        if (i === 11) sets.push({ workout_id: w!.id, exercise_id: exercise!.id, set_index: 1, reps: 5, weight: 135, weight_unit: 'lb', rpe: 7 })
        await admin.from('sets').insert(sets)
      }
    },
  })

  await page.setViewportSize({ width: 375, height: 800 })
  await goTo(page, 'Exercises')
  await page.locator('.row-wrap', { hasText: exerciseName }).getByRole('button', { name: 'View exercise history' }).click()
  const overlay = page.getByRole('dialog', { name: `${exerciseName} history` })

  const entries = overlay.locator('.history-entry')
  await expect(entries).toHaveCount(10)
  const newest = entries.first()
  await expect(newest.locator('.session-template')).toHaveText(templateName)
  await expect(newest.locator('.session-summary')).toContainText('Top set 155 lb × 5')
  await expect(newest.locator('.session-summary')).toContainText('2 sets · 10 reps')
  await expect(newest.locator('thead th')).toHaveText(['Set', 'Weight', 'Reps', 'RPE', 'Record'])
  const rows = newest.locator('tbody tr')
  await expect(rows.nth(0).locator('td')).toHaveText(['1', '155lb', '5', '–', ''])
  await expect(rows.nth(1).locator('td')).toHaveText(['2', '135lb', '5', '7', ''])
  // 155 x 5 beat the 150 x 5 before it; the back-off set didn't.
  await expect(rows.nth(0)).toHaveClass(/record/)
  await expect(rows.nth(0).getByRole('img', { name: 'Record' })).toBeVisible()
  await expect(rows.nth(1)).not.toHaveClass(/record/)

  // Columns line up: the Weight cells' right edges match their heading's.
  const head = await newest.locator('thead th.col-load').boundingBox()
  const cell = await rows.nth(1).locator('td.col-load').boundingBox()
  expect(Math.abs(head!.x + head!.width - (cell!.x + cell!.width))).toBeLessThanOrEqual(1)

  // The long template name truncates instead of widening the card.
  const overflow = await overlay.locator('.history-panel').evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  await overlay.getByRole('button', { name: 'Show older' }).click()
  await expect(entries).toHaveCount(12)
  await expect(overlay.getByRole('button', { name: 'Show older' })).toHaveCount(0)
  // The very first session is the baseline, not a record, and a freeform
  // session has no template line.
  await expect(entries.last().locator('tbody tr').first()).not.toHaveClass(/record/)
  await expect(entries.last().locator('.session-template')).toHaveCount(0)
})

// Issue #181: a timed session gets Time plus the columns it logged.
test('exercise history: a timed session shows Time and the fields it logged', async ({ page, stamp }) => {
  const exerciseName = `E2E History Timed Table ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName, load_type: 'timed', tracks_distance: true, tracks_calories: true })
        .select('id')
        .single()
      const { data: w } = await admin.from('workouts').insert({ user_id: userId, performed_at: new Date().toISOString() }).select('id').single()
      await admin.from('sets').insert([
        { workout_id: w!.id, exercise_id: exercise!.id, set_index: 0, reps: null, weight: 0, weight_unit: 'lb', duration_seconds: 1200, distance: 2.1, distance_unit: 'mi', calories: 210 },
        { workout_id: w!.id, exercise_id: exercise!.id, set_index: 1, reps: null, weight: 0, weight_unit: 'lb', duration_seconds: 300, distance: 0.4, distance_unit: 'mi' },
      ])
    },
  })

  await goTo(page, 'Exercises')
  await page.locator('.row-wrap', { hasText: exerciseName }).getByRole('button', { name: 'View exercise history' }).click()
  const entry = page.getByRole('dialog', { name: `${exerciseName} history` }).locator('.history-entry')
  await expect(entry).toHaveCount(1)
  await expect(entry.locator('thead th')).toHaveText(['Set', 'Time', 'Distance', 'Cal'])
  await expect(entry.locator('tbody tr').nth(0).locator('td')).toHaveText(['1', '20:00', '2.1mi', '210'])
  await expect(entry.locator('tbody tr').nth(1).locator('td')).toHaveText(['2', '5:00', '0.4mi', '–'])
  await expect(entry.locator('.session-summary')).toContainText('Longest 20:00')
  await expect(entry.locator('.session-summary')).toContainText('2 sets · 25:00')
})
