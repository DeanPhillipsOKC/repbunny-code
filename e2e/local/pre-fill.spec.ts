import { test, expect, localDb, startLocal } from '../fixtures/local'

// Covers docs/backlog.md item 3: starting a new workout against a template
// that already has a logged instance pre-fills the reps/weight fields from
// the most recent matching set. The redesign (item 67) removed the separate
// "Last time" summary card that used to also surface these numbers -- the
// per-row pre-fill below is the only place they show now, and it re-narrows
// correctly as the carousel moves between exercises.
test('pre-fill: last workout of the same template surfaces on the next one', async ({ page, stamp }) => {
  const exerciseName = `E2E Squat ${stamp}`
  const otherExerciseName = `E2E Deadlift ${stamp}`
  const templateName = `E2E Leg Day ${stamp}`

  const userId = await startLocal(page)

  // The "last workout of the same template" this test pre-fills against is
  // pre-existing state, not behavior under test — seed the exercises,
  // template, and a completed prior workout directly via the admin client
  // instead of driving the whole logging UI just to create fixture data
  // (backlog item 57).
  const admin = localDb(page)
  const { data: squat } = await admin
    .from('exercises')
    .insert({ user_id: userId, name: exerciseName })
    .select('id')
    .single()
  const { data: deadlift } = await admin
    .from('exercises')
    .insert({ user_id: userId, name: otherExerciseName })
    .select('id')
    .single()
  const { data: template } = await admin
    .from('workout_templates')
    .insert({ user_id: userId, name: templateName })
    .select('id')
    .single()
  await admin.from('workout_template_exercises').insert([
    { template_id: template!.id, exercise_id: squat!.id, position: 0 },
    { template_id: template!.id, exercise_id: deadlift!.id, position: 1 },
  ])
  const { data: workout } = await admin
    .from('workouts')
    .insert({ user_id: userId, template_id: template!.id })
    .select('id')
    .single()
  await admin
    .from('sets')
    .insert({ workout_id: workout!.id, exercise_id: squat!.id, set_index: 0, reps: 8, weight: 185, weight_unit: 'lb' })
  await admin
    .from('sets')
    .insert({ workout_id: workout!.id, exercise_id: deadlift!.id, set_index: 0, reps: 5, weight: 225, weight_unit: 'lb' })

  // Reload so the app's onMounted fetch picks up the seeded template —
  // the initial navigation in startLocal happened before it existed.
  await page.reload()

  // Second workout against the same template, but abandoned with no sets
  // logged (e.g. started by mistake). This must not shadow the real data
  // from the seeded workout on the next lookup.
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  // Backlog item 51: finishing with no sets logged now confirms before discarding.
  await page.getByRole('button', { name: 'Discard workout' }).click()

  // Third workout against the same template: should show the last workout
  // that actually had sets (the seeded one), skipping the empty one.
  await page.getByRole('button', { name: templateName, exact: true }).click()

  // The carousel opens on the first exercise in the deck (template order),
  // already pre-filled from last time's matching set.
  await expect(page.locator('.exercise-card-name')).toHaveText(exerciseName)
  await expect(page.getByLabel('Reps')).toHaveValue('8')
  await expect(page.getByLabel('Weight')).toHaveValue('185')

  // Switching exercises re-fills rather than staying stuck on the first pick.
  await page.getByRole('button', { name: otherExerciseName, exact: true }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(otherExerciseName)
  await expect(page.getByLabel('Reps')).toHaveValue('5')
  await expect(page.getByLabel('Weight')).toHaveValue('225')
})

// Covers docs/backlog.md item 9: pre-fill must index into the previous
// workout's sets by set position, not always grab the last set logged —
// otherwise a superset-style session (alternating exercises) pre-fills set 1
// of today from set 2 of last time, which is backwards.
test('pre-fill: set position tracks across exercises logged in parallel', async ({ page, stamp }) => {
  const exerciseName = `E2E Bench ${stamp}`
  const otherExerciseName = `E2E Row ${stamp}`
  const templateName = `E2E Push Pull ${stamp}`

  const userId = await startLocal(page)

  // The first (superset) workout is pre-existing state this test pre-fills
  // against, not behavior under test — seed it directly via the admin
  // client rather than driving the logging UI four times over just to set
  // up fixture data (backlog item 57). Sets are inserted one at a time, in
  // the same A/B/A/B order the original UI flow logged them in, so the
  // next-set_index rule (e2e/fixtures/local.ts) assigns the same relative
  // per-exercise ordering pre-fill depends on. The first exercise's second
  // set is deliberately lighter (fatigue) so a "last set logged" pre-fill
  // would be obviously wrong for set 1 next time.
  const admin = localDb(page)
  const { data: bench } = await admin
    .from('exercises')
    .insert({ user_id: userId, name: exerciseName })
    .select('id')
    .single()
  const { data: row } = await admin
    .from('exercises')
    .insert({ user_id: userId, name: otherExerciseName })
    .select('id')
    .single()
  const { data: template } = await admin
    .from('workout_templates')
    .insert({ user_id: userId, name: templateName })
    .select('id')
    .single()
  await admin.from('workout_template_exercises').insert([
    { template_id: template!.id, exercise_id: bench!.id, position: 0 },
    { template_id: template!.id, exercise_id: row!.id, position: 1 },
  ])
  const { data: workout } = await admin
    .from('workouts')
    .insert({ user_id: userId, template_id: template!.id })
    .select('id')
    .single()
  const rounds: Array<[string, number, number]> = [
    [bench!.id, 10, 135],
    [row!.id, 5, 225],
    [bench!.id, 8, 115],
    [row!.id, 5, 225],
  ]
  for (const [exerciseId, reps, weight] of rounds) {
    await admin.from('sets').insert({ workout_id: workout!.id, exercise_id: exerciseId, reps, weight, weight_unit: 'lb' })
  }

  // Reload so the app's onMounted fetch picks up the seeded template —
  // the initial navigation in startLocal happened before it existed.
  await page.reload()

  // Second workout: set 1 for the first exercise should pre-fill from its
  // set 1 last time (10x135), not its set 2 (8x115).
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await page.getByRole('button', { name: exerciseName, exact: true }).click()
  await expect(page.getByLabel('Reps')).toHaveValue('10')
  await expect(page.getByLabel('Weight')).toHaveValue('135')
  await page.getByRole('button', { name: 'Add set' }).click()

  // Without re-picking the exercise (same chip, same exerciseId — a plain
  // watch(exerciseId) would never re-fire here), the pre-fill must still
  // advance to set 2 (8x115) as soon as the set above is logged.
  await expect(page.getByLabel('Reps')).toHaveValue('8')
  await expect(page.getByLabel('Weight')).toHaveValue('115')

  await page.getByRole('button', { name: otherExerciseName, exact: true }).click()
  await expect(page.getByLabel('Reps')).toHaveValue('5')
  await expect(page.getByLabel('Weight')).toHaveValue('225')
  await page.getByRole('button', { name: 'Add set' }).click()

  await page.getByRole('button', { name: exerciseName, exact: true }).click()
  await expect(page.getByLabel('Reps')).toHaveValue('8')
  await expect(page.getByLabel('Weight')).toHaveValue('115')
  await page.getByRole('button', { name: 'Add set' }).click()

  // A third round for the first exercise has no matching set last time —
  // falls back to no pre-fill instead of repeating stale numbers.
  await page.getByRole('button', { name: otherExerciseName, exact: true }).click()
  await page.getByRole('button', { name: 'Add set' }).click()
  await page.getByRole('button', { name: exerciseName, exact: true }).click()
  await expect(page.getByLabel('Reps')).toHaveValue('')
  await expect(page.getByLabel('Weight')).toHaveValue('')
})

// Covers docs/backlog.md item 1 (RPE carry-over): applyPrefillToRow already
// seeds reps/weight from the position-matching previous set; RPE should
// carry over the same way and open the RPE field automatically, but only
// when the previous set actually had one recorded.
test('pre-fill: RPE carries over from the previous set when present, stays closed when not', async ({
  page,
  stamp,
}) => {
  const withRpeName = `E2E Squat RPE ${stamp}`
  const noRpeName = `E2E Deadlift RPE ${stamp}`
  const templateName = `E2E RPE Day ${stamp}`

  const userId = await startLocal(page)

  const admin = localDb(page)
  const { data: withRpe } = await admin
    .from('exercises')
    .insert({ user_id: userId, name: withRpeName })
    .select('id')
    .single()
  const { data: noRpe } = await admin
    .from('exercises')
    .insert({ user_id: userId, name: noRpeName })
    .select('id')
    .single()
  const { data: template } = await admin
    .from('workout_templates')
    .insert({ user_id: userId, name: templateName })
    .select('id')
    .single()
  await admin.from('workout_template_exercises').insert([
    { template_id: template!.id, exercise_id: withRpe!.id, position: 0 },
    { template_id: template!.id, exercise_id: noRpe!.id, position: 1 },
  ])
  const { data: workout } = await admin
    .from('workouts')
    .insert({ user_id: userId, template_id: template!.id })
    .select('id')
    .single()
  await admin
    .from('sets')
    .insert({ workout_id: workout!.id, exercise_id: withRpe!.id, set_index: 0, reps: 5, weight: 200, weight_unit: 'lb', rpe: 8 })
  await admin
    .from('sets')
    .insert({ workout_id: workout!.id, exercise_id: noRpe!.id, set_index: 0, reps: 5, weight: 225, weight_unit: 'lb' })

  // Reload so the app's onMounted fetch picks up the seeded template — the
  // initial navigation in startLocal happened before it existed.
  await page.reload()

  await page.getByRole('button', { name: templateName, exact: true }).click()

  // Previous set had an RPE: the always-visible field is already seeded.
  await page.getByRole('button', { name: withRpeName, exact: true }).click()
  await expect(page.getByLabel('Reps')).toHaveValue('5')
  await expect(page.getByLabel('Weight')).toHaveValue('200')
  await expect(page.getByLabel('RPE (optional)')).toHaveValue('8')

  // Previous set had no RPE: the field stays empty (dashed placeholder),
  // not carried over from a value that never existed.
  await page.getByRole('button', { name: noRpeName, exact: true }).click()
  await expect(page.getByLabel('Reps')).toHaveValue('5')
  await expect(page.getByLabel('Weight')).toHaveValue('225')
  await expect(page.getByLabel('RPE (optional)')).toHaveValue('')
})
