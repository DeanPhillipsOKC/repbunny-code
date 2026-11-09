import { test, expect, startLocal } from '../fixtures/local'
import { EXPECTED_BACKUP, EXPECTED_REPOS } from './data-contract.expected'

// Issue #415: the data-layer contract. The app reads and writes only through
// `repos` (src/data/types.ts), on the device's SQLite adapter
// (src/data/sqlite). This calls every repository method against the app's
// real adapter in the page and checks the shapes and values the stores rely
// on, pinned in data-contract.expected.ts. Only what can't be compared
// directly is normalized (timestamps to ISO, ids to their role). Issue #938:
// it used to run against the Supabase adapter too; the device's adapter is
// the only one now.
//
// The first test only looks at rows it made (stamped names, its own ids). The
// second calls the methods that replace or wipe everything (restore, reset,
// erase, clearing the error log).

const EXERCISE_ROW = {
  setup_notes: null, rest_seconds: null, tracks_distance: false, tracks_incline: false, tracks_level: false,
  tracks_calories: false, library_id: null, uses_barbell: null, bar_type: null, bar_custom_weight: null,
  bar_custom_unit: null, weight_step: null, weight_step_unit: null, rep_range_min: null, rep_range_max: null, push_pull: null,
}

// What's left to tell apart after the page's own normalizing: the stamp in
// names, ids, and timestamps (as days from the test's base time).
function normalize(value: unknown, stamp: number, base: number): unknown {
  if (Array.isArray(value)) return value.map((v) => normalize(v, stamp, base))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, stamp, base)]))
  }
  if (typeof value !== 'string') return value
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) return '<uuid>'
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)) return `<day ${Math.round(((new Date(value).getTime() - base) / 86_400_000) * 1000) / 1000}>`
  return value.replaceAll(String(stamp), '<stamp>')
}

test('every read and write repo method returns the expected shapes and values', async ({ page, stamp }) => {
  await startLocal(page)

  const result = await page.evaluate(async (stamp) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    type R = { data?: any; error: { message: string } | null }
    function ok<T extends R>(res: T, what: string): T['data'] {
      if (res.error) throw new Error(`${what}: ${res.error.message}`)
      return res.data
    }
    const iso = (s: string | null | undefined) => (s == null ? null : new Date(s).toISOString())
    const day = 86_400_000
    const base = Date.now() - (Date.now() % 1000)
    const at = (offsetDays: number) => new Date(base + offsetDays * day).toISOString()
    const out: Record<string, unknown> = {}

    // profile: get, update
    const profileBefore = ok(await repos.profile.get(), 'profile.get')
    ok(await repos.profile.update({ prefill_mode: 'blank', default_rest_seconds: 75, plates_lb: [45, 25] }), 'profile.update')
    const profileAfter = ok(await repos.profile.get(), 'profile.get')
    out.profile = {
      keys: Object.keys(profileAfter).sort(),
      prefill_mode: profileAfter.prefill_mode,
      default_rest_seconds: profileAfter.default_rest_seconds,
      plates_lb: profileAfter.plates_lb,
    }
    ok(
      await repos.profile.update({
        prefill_mode: profileBefore.prefill_mode,
        default_rest_seconds: profileBefore.default_rest_seconds,
        plates_lb: profileBefore.plates_lb,
      }),
      'profile.update',
    )

    // exercises: create, update, list, hasLoggedSets, countWorkouts, merge
    const newExercise = (name: string) => ({
      name,
      setup_notes: null,
      rest_seconds: null,
      load_type: 'weight',
      tracks_distance: false,
      tracks_incline: false,
      tracks_level: false,
      tracks_calories: false,
      muscle_group: 'chest',
      also_works: ['arms'],
      library_id: null,
      push_pull: 'push',
    })
    const bench = ok(await repos.exercises.create(newExercise(`E2E Contract Bench ${stamp}`)), 'exercises.create')
    const fly = ok(await repos.exercises.create(newExercise(`E2E Contract Fly ${stamp}`)), 'exercises.create')
    out.exerciseCreated = { ...bench, id: typeof bench.id, user_id: typeof bench.user_id }
    ok(await repos.exercises.update(bench.id, { setup_notes: 'Seat 4', rest_seconds: 120, uses_barbell: true }), 'exercises.update')
    const listed = ok(await repos.exercises.list(), 'exercises.list').find((e: { id: string }) => e.id === bench.id)
    out.exerciseListed = { setup_notes: listed.setup_notes, rest_seconds: listed.rest_seconds, uses_barbell: listed.uses_barbell, also_works: listed.also_works }
    out.exerciseKeys = Object.keys(listed).sort()
    out.hasLoggedSetsBefore = await repos.exercises.hasLoggedSets(bench.id)
    out.countWorkoutsBefore = await repos.exercises.countWorkouts(bench.id)

    // templates: create, update, addExercise, insertExercises, listExercises,
    // saveExercises, updateExerciseTargetSets, removeExercise, list
    const template = ok(await repos.templates.create(`E2E Contract Push ${stamp}`), 'templates.create')
    out.templateCreated = { name: template.name, is_archived: template.is_archived, category: template.category ?? null }
    ok(await repos.templates.update(template.id, { category: 'upper' }), 'templates.update')
    const added = ok(
      await repos.templates.addExercise({ template_id: template.id, exercise_id: bench.id, position: 0, target_sets: 3 }),
      'templates.addExercise',
    )
    out.templateAdded = { position: added.position, target_sets: added.target_sets, exercises: added.exercises }
    ok(
      await repos.templates.insertExercises([{ template_id: template.id, exercise_id: fly.id, position: 1, target_sets: 2 }]),
      'templates.insertExercises',
    )
    const rows = ok(await repos.templates.listExercises(template.id), 'templates.listExercises')
    out.templateRows = rows.map((r: any) => ({ position: r.position, target_sets: r.target_sets, name: r.exercises?.name }))
    const flyRow = rows.find((r: any) => r.exercise_id === fly.id)
    ok(
      await repos.templates.saveExercises([
        { id: added.id, template_id: template.id, exercise_id: bench.id, position: 1, target_sets: 4 },
        { id: flyRow.id, template_id: template.id, exercise_id: fly.id, position: 0, target_sets: 2 },
      ]),
      'templates.saveExercises',
    )
    ok(await repos.templates.updateExerciseTargetSets(flyRow.id, null), 'templates.updateExerciseTargetSets')
    out.templateRowsSaved = ok(await repos.templates.listExercises(template.id), 'templates.listExercises').map((r: any) => ({
      position: r.position,
      target_sets: r.target_sets,
      name: r.exercises?.name,
    }))
    const listedTemplate = ok(await repos.templates.list(), 'templates.list').find((t: { id: string }) => t.id === template.id)
    out.templateListed = {
      name: listedTemplate.name,
      category: listedTemplate.category,
      count: listedTemplate.workout_template_exercises,
      refs: [...listedTemplate.exercise_refs].map((r: any) => (r.exercise_id === bench.id ? 'bench' : r.exercise_id === fly.id ? 'fly' : '?')).sort(),
    }

    // workouts and sets
    const weightedBefore = await repos.workouts.countWeightedSets('lb')
    const w1 = ok(await repos.workouts.createWorkout(`E2E Contract note ${stamp}`, template.id, at(-3)), 'workouts.createWorkout')
    out.workoutCreated = { notes: w1.notes, template_id: w1.template_id === template.id, performed_at: iso(w1.performed_at) === at(-3) }
    const s1 = ok(
      await repos.workouts.insertSet({
        workout_id: w1.id, exercise_id: bench.id, set_index: 0, reps: 5, weight: 100, weight_unit: 'lb', rpe: 8,
        level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null,
      }),
      'workouts.insertSet',
    )
    out.setInserted = { ...s1, id: typeof s1.id, workout_id: s1.workout_id === w1.id, exercise_id: s1.exercise_id === bench.id }
    const s2 = ok(
      await repos.workouts.insertSetWithExercise({
        workout_id: w1.id, exercise_id: bench.id, set_index: 1, reps: 3, weight: 110, weight_unit: 'lb', rpe: null,
        level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null,
      }),
      'workouts.insertSetWithExercise',
    )
    out.setWithExercise = { set_index: s2.set_index, exercises: s2.exercises }
    ok(
      await repos.workouts.updateSet(s2.id, {
        reps: 4, weight: 112.5, weight_unit: 'lb', rpe: 9, level: null, duration_seconds: null, distance: null,
        distance_unit: null, incline: null, calories: null,
      }),
      'workouts.updateSet',
    )
    const found = ok(await repos.workouts.findSet(s2.id, w1.id), 'workouts.findSet')
    out.setFound = { reps: found.reps, weight: found.weight, rpe: found.rpe }
    out.setMissing = ok(await repos.workouts.findSet(s2.id, template.id), 'workouts.findSet')

    ok(await repos.workouts.updateWorkoutNotes(w1.id, `E2E Contract edited ${stamp}`), 'workouts.updateWorkoutNotes')
    ok(await repos.workouts.updateWorkoutDate(w1.id, at(-4)), 'workouts.updateWorkoutDate')
    ok(await repos.workouts.updateWorkoutFeel(w1.id, { sleep: 'over_8', energy: 'high' }), 'workouts.updateWorkoutFeel')
    ok(await repos.workouts.updateWorkoutFeel(w1.id, { stress: 'low' }), 'workouts.updateWorkoutFeel')
    const events = [{ type: 'finished_early', at: at(-4) }]
    ok(await repos.workouts.updateWorkoutEvents(w1.id, events), 'workouts.updateWorkoutEvents')
    ok(await repos.workouts.updateWorkoutFinishedAt(w1.id, at(-4)), 'workouts.updateWorkoutFinishedAt')

    const got = ok(await repos.workouts.getWorkout(w1.id), 'workouts.getWorkout')
    out.workoutGot = {
      notes: got.notes,
      performed_at: iso(got.performed_at) === at(-4),
      finished_at: iso(got.finished_at) === at(-4),
      feel: [got.sleep, got.energy, got.stress],
      events: got.events,
      template: got.workout_templates,
      sets: got.sets.map((s: any) => ({ set_index: s.set_index, reps: s.reps, weight: s.weight, rpe: s.rpe, exercises: s.exercises })),
    }
    out.workoutMissing = ok(await repos.workouts.getWorkout(crypto.randomUUID()), 'workouts.getWorkout')
    out.feels = ok(await repos.workouts.listWorkoutFeels(), 'workouts.listWorkoutFeels')
      .filter((r: any) => r.id === w1.id)
      .map((r: any) => ({ ...r, id: 'w1', performed_at: iso(r.performed_at) === at(-4) }))
    out.events = ok(await repos.workouts.listWorkoutEvents(), 'workouts.listWorkoutEvents')
      .filter((r: any) => r.id === w1.id)
      .map((r: any) => ({ id: 'w1', events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events }))
    out.notes = ok(await repos.workouts.listWorkoutNotes(), 'workouts.listWorkoutNotes')
      .filter((r: any) => r.id === w1.id)
      .map((r: any) => ({ ...r, id: 'w1' }))

    // A second, newer session of the same template.
    const w2 = ok(await repos.workouts.createWorkout(null, template.id, at(1)), 'workouts.createWorkout')
    const s3 = ok(
      await repos.workouts.insertSet({
        workout_id: w2.id, exercise_id: bench.id, set_index: 0, reps: 5, weight: 105, weight_unit: 'lb', rpe: null,
        level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null,
      }),
      'workouts.insertSet',
    )
    // Set order inside a summary isn't part of the contract (only totals are read).
    const byWeight = (a: { weight: number }, b: { weight: number }) => a.weight - b.weight
    const role = (id: string) => (id === w1.id ? 'w1' : id === w2.id ? 'w2' : 'other')
    out.weightedDelta = (await repos.workouts.countWeightedSets('lb')) - weightedBefore
    out.hasLoggedSetsAfter = await repos.exercises.hasLoggedSets(bench.id)
    out.countWorkoutsAfter = await repos.exercises.countWorkouts(bench.id)

    const history = ok(await repos.workouts.listHistory(), 'workouts.listHistory').filter((w: any) => role(w.id) !== 'other')
    out.history = history.map((w: any) => ({ id: role(w.id), template: w.workout_templates, sets: w.sets.map((s: any) => s.weight) }))
    const previous = ok(await repos.workouts.getPreviousForTemplate(template.id, w2.id), 'workouts.getPreviousForTemplate')
    out.previous = { id: role(previous.id), sets: previous.sets.map((s: any) => s.weight) }
    out.previousNone = ok(await repos.workouts.getPreviousForTemplate(template.id, null), 'workouts.getPreviousForTemplate')?.id === w2.id
    out.latestForExercise = ok(await repos.workouts.getLatestSetsForExercise(bench.id, null), 'workouts.getLatestSetsForExercise').map(
      (s: any) => ({ workout: role(s.workout_id), weight: s.weight, exercises: s.exercises }),
    )
    out.latestForExerciseExcluding = ok(await repos.workouts.getLatestSetsForExercise(bench.id, w2.id), 'workouts.getLatestSetsForExercise').map(
      (s: any) => ({ workout: role(s.workout_id), weight: s.weight }),
    )
    const latest = ok(await repos.workouts.getLatestWorkoutSets(), 'workouts.getLatestWorkoutSets')
    out.latestWorkout = { id: role(latest.id), sets: latest.sets.map((s: any) => ({ weight: s.weight, exercises: s.exercises })) }

    const dates = await repos.workouts.listWorkoutDatesSince(at(-5))
    out.datesSince = {
      error: dates.error,
      countMatches: dates.count === dates.data?.length,
      ours: dates.data!.map((d: any) => iso(d.performed_at)).filter((d: string) => d === at(-4) || d === at(1)).sort(),
    }
    const summaries = await repos.workouts.listWorkoutSummariesSince(at(-5))
    out.summariesSince = {
      error: summaries.error,
      countMatches: summaries.count === summaries.data.length,
      ours: summaries.data
        .filter((w: any) => role(w.id) !== 'other')
        .map((w: any) => ({ id: role(w.id), performed_at: iso(w.performed_at), sets: [...w.sets].sort(byWeight) }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id))
        .map((w: any) => ({ ...w, performed_at: w.performed_at === (w.id === 'w1' ? at(-4) : at(1)) })),
    }
    out.templateSessions = ok(await repos.workouts.listTemplateSessions(template.id, at(2), 5), 'workouts.listTemplateSessions').map(
      (w: any) => ({ id: role(w.id), volume: w.sets.map((s: any) => s.reps * s.weight).sort((x: number, y: number) => x - y) }),
    )
    out.templateSessionsUpTo = ok(await repos.workouts.listTemplateSessions(template.id, at(0), 5), 'workouts.listTemplateSessions').map((w: any) =>
      role(w.id),
    )
    out.priorSets = ok(await repos.workouts.listPriorSets([bench.id], w2.id), 'workouts.listPriorSets')
      .map((s: any) => ({
        exercise_id: s.exercise_id === bench.id ? 'bench' : s.exercise_id,
        workout_id: role(s.workout_id),
        performed_at: iso(s.performed_at) === at(-4),
        reps: s.reps, weight: s.weight, weight_unit: s.weight_unit, level: s.level, duration_seconds: s.duration_seconds,
        distance: s.distance, distance_unit: s.distance_unit, calories: s.calories,
      }))
      .sort((a: any, b: any) => a.weight - b.weight)
    out.markers = ok(await repos.workouts.listSetMarkersForExercises([bench.id], w2.id), 'workouts.listSetMarkersForExercises')
      .map((m: any) => ({ ...m, exercise_id: 'bench', workouts: { performed_at: iso(m.workouts?.performed_at) === at(-4) } }))
      .sort((a: any, b: any) => a.weight - b.weight)
    out.markersForOne = ok(await repos.workouts.listSetMarkersForExercise(bench.id, s3.id), 'workouts.listSetMarkersForExercise')
      .map((m: any) => ({ ...m, workouts: { performed_at: iso(m.workouts?.performed_at) === at(-4) } }))
      .sort((a: any, b: any) => a.weight - b.weight)
    out.exerciseHistory = ok(await repos.workouts.listExerciseHistory(bench.id), 'workouts.listExerciseHistory').map((w: any) => ({
      ...w,
      workoutId: role(w.workoutId),
      sets: w.sets.map((s: any) => ({ ...s, id: typeof s.id })),
    }))
    // Issue #467: check the limit by length, and the order by this test's own sets within a wider
    // window.
    out.recentLimit = ok(await repos.workouts.listRecentSetExerciseIds(1), 'workouts.listRecentSetExerciseIds').length
    out.recentExerciseIds = ok(await repos.workouts.listRecentSetExerciseIds(300), 'workouts.listRecentSetExerciseIds').filter(
      (id: string) => id === bench.id,
    ).map(() => 'bench')
    const progress = ok(await repos.workouts.listProgressSets(), 'workouts.listProgressSets').filter((r: any) => r.exercise_id === bench.id)
    out.progressSets = progress
      .map((r: any) => ({
        ...r,
        exercise_id: 'bench',
        workout_id: role(r.workout_id),
        template_id: r.template_id === template.id,
        // Only the first workout has a finish time (#491).
        finished_at: iso(r.finished_at) === (r.workout_id === w1.id ? at(-4) : null),
      }))
      .sort((a: any, b: any) => a.weight - b.weight || a.set_index - b.set_index)

    // exercises.merge: the fly's routine row moves onto the bench, the fly is archived.
    ok(await repos.exercises.merge(fly.id, bench.id), 'exercises.merge')
    out.merged = {
      rows: ok(await repos.templates.listExercises(template.id), 'templates.listExercises').map((r: any) => ({ name: r.exercises?.name, target_sets: r.target_sets })),
      flyArchived: ok(await repos.exercises.list(), 'exercises.list').find((e: { id: string }) => e.id === fly.id).is_archived,
    }

    // removals
    ok(await repos.templates.removeExercise(added.id), 'templates.removeExercise')
    out.afterRemove = ok(await repos.templates.listExercises(template.id), 'templates.listExercises').length
    ok(await repos.workouts.deleteSet(s2.id), 'workouts.deleteSet')
    out.afterDeleteSet = ok(await repos.workouts.findSet(s2.id, w1.id), 'workouts.findSet')
    ok(await repos.workouts.deleteWorkout(w1.id), 'workouts.deleteWorkout')
    out.afterDeleteWorkout = ok(await repos.workouts.getWorkout(w1.id), 'workouts.getWorkout')

    // body weight: create, update, list, remove
    const entry = ok(await repos.bodyWeight.create(181.5, 'lb'), 'bodyWeight.create')
    out.weightCreated = { weight: entry.weight, weight_unit: entry.weight_unit, recorded_at: typeof entry.recorded_at }
    const updatedEntry = ok(await repos.bodyWeight.update(entry.id, 82, 'kg', at(-2)), 'bodyWeight.update')
    out.weightUpdated = { weight: updatedEntry.weight, weight_unit: updatedEntry.weight_unit, recorded_at: iso(updatedEntry.recorded_at) === at(-2) }
    out.weightListed = ok(await repos.bodyWeight.list(), 'bodyWeight.list').filter((e: any) => e.id === entry.id).map((e: any) => Object.keys(e).sort())
    ok(await repos.bodyWeight.remove(entry.id), 'bodyWeight.remove')
    out.weightRemoved = ok(await repos.bodyWeight.list(), 'bodyWeight.list').some((e: any) => e.id === entry.id)

    // measurements: create, update, list, remove
    const m = ok(
      await repos.measurements.create({ waist: 34, chest: null, hips: null, arms: 15, thighs: null, neck: null }, 'in', at(-1)),
      'measurements.create',
    )
    out.measurementCreated = { unit: m.unit, waist: m.waist, arms: m.arms, chest: m.chest, recorded_at: iso(m.recorded_at) === at(-1) }
    const m2 = ok(
      await repos.measurements.update(m.id, { waist: 86, chest: 100, hips: null, arms: null, thighs: null, neck: null }, 'cm', at(-1)),
      'measurements.update',
    )
    out.measurementUpdated = { unit: m2.unit, waist: m2.waist, chest: m2.chest, arms: m2.arms }
    out.measurementListed = ok(await repos.measurements.list(), 'measurements.list').filter((e: any) => e.id === m.id).map((e: any) => Object.keys(e).sort())
    ok(await repos.measurements.remove(m.id), 'measurements.remove')
    out.measurementRemoved = ok(await repos.measurements.list(), 'measurements.list').some((e: any) => e.id === m.id)

    return { out, base }
  }, stamp)

  expect(normalize(result.out, stamp, result.base)).toEqual(EXPECTED_REPOS)
})

test('backup, merge, restore, reset, the error log, and erase return the expected shapes and values', async ({ page, stamp }) => {
  await startLocal(page)

  const result = await page.evaluate(async ({ stamp, exerciseRow }) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    type R = { data?: any; error: { message: string } | null }
    function ok<T extends R>(res: T, what: string): T['data'] {
      if (res.error) throw new Error(`${what}: ${res.error.message}`)
      return res.data
    }
    const out: Record<string, unknown> = {}
    const base = Date.now() - (Date.now() % 1000)
    const at = (offsetDays: number) => new Date(base + offsetDays * 86_400_000).toISOString()

    // client errors: insert, list, clear
    const entry = (message: string) => ({
      occurred_at: at(0), kind: 'error', message, stack: null, route: '/', context: { op: 'contract' },
      app_version: 'test', user_agent: 'contract',
    })
    ok(await repos.clientErrors.insert(entry(`E2E contract first ${stamp}`)), 'clientErrors.insert')
    ok(await repos.clientErrors.insert({ ...entry(`E2E contract second ${stamp}`), occurred_at: at(0.001) }), 'clientErrors.insert')
    const errors = ok(await repos.clientErrors.list(), 'clientErrors.list')
    // Typed fields only.
    out.errors = errors.map((e: any) => ({
      id: typeof e.id, occurred_at: typeof e.occurred_at, kind: e.kind, message: e.message, stack: e.stack, route: e.route,
      context: e.context, app_version: e.app_version, user_agent: e.user_agent,
    }))
    ok(await repos.clientErrors.clear(), 'clientErrors.clear')
    out.errorsCleared = ok(await repos.clientErrors.list(), 'clientErrors.list').length

    // backup: restore a file, read it back, merge another, count, reset, erase.
    // Backup files carry uuids, so these do too.
    const id = Object.fromEntries(['e1', 't1', 'te1', 'w1', 's1', 'b1', 'm1', 'x1', 'xw1', 'xs1'].map((k) => [k, crypto.randomUUID()]))
    ok(await repos.profile.update({ weight_unit: 'kg' }), 'profile.update')
    const file = {
      format: 'repbunny-backup',
      version: 2,
      exported_at: at(0),
      exercises: [{ ...exerciseRow, id: id.e1, name: `E2E Contract Squat ${stamp}`, muscle_group: 'legs', also_works: ['glutes'], load_type: 'weight', is_archived: false }],
      workout_templates: [{ id: id.t1, name: `E2E Contract Legs ${stamp}`, is_archived: false, category: 'lower' }],
      workout_template_exercises: [{ id: id.te1, template_id: id.t1, exercise_id: id.e1, position: 0, target_sets: 3 }],
      workouts: [{ id: id.w1, performed_at: at(-2), template_id: id.t1, notes: `E2E Contract ${stamp}` }],
      sets: [{ id: id.s1, workout_id: id.w1, exercise_id: id.e1, set_index: 0, reps: 5, weight: 100, weight_unit: 'kg' }],
      body_weight_entries: [{ id: id.b1, weight: 80, weight_unit: 'kg', recorded_at: at(-2) }],
      body_measurements: [{ id: id.m1, unit: 'cm', waist: 85, chest: null, hips: null, arms: null, thighs: null, neck: null, recorded_at: at(-2) }],
    }
    ok(await repos.backup.restore(file), 'backup.restore')
    out.afterRestore = await repos.backup.countWorkoutsAndSets()
    const profile = await repos.backup.getProfile()
    out.backupProfile = { keys: Object.keys(profile).sort(), weight_unit: profile.weight_unit }
    const tables = ['exercises', 'workout_templates', 'workout_template_exercises', 'workouts', 'sets', 'body_weight_entries', 'body_measurements']
    const listed: Record<string, unknown> = {}
    for (const table of tables) {
      const rows = await repos.backup.listAll(table)
      // workouts.imported (#462) is left out: a test project without the column omits it.
      listed[table] = rows.map((row: Record<string, unknown>) => Object.keys(row).filter((k) => k !== 'imported').sort())
    }
    out.listAllKeys = listed
    const exercises = await repos.backup.listAll('exercises')
    out.restoredExercise = { name: exercises[0].name, also_works: exercises[0].also_works, idChanged: exercises[0].id !== id.e1 }

    ok(
      await repos.backup.merge({
        format: 'repbunny-backup',
        version: 2,
        includes: ['workouts'],
        exported_at: at(0),
        exercises: [{ ...exerciseRow, id: id.x1, name: `E2E Contract Squat ${stamp}`, muscle_group: 'legs', also_works: ['glutes'], load_type: 'weight', is_archived: false }],
        workout_templates: [],
        workout_template_exercises: [],
        workouts: [{ id: id.xw1, performed_at: at(-1), template_id: null, notes: null }],
        sets: [{ id: id.xs1, workout_id: id.xw1, exercise_id: id.x1, set_index: 0, reps: 3, weight: 110, weight_unit: 'kg' }],
        body_weight_entries: [],
        body_measurements: [],
      }),
      'backup.merge',
    )
    out.afterMerge = await repos.backup.countWorkoutsAndSets()
    out.exercisesAfterMerge = (await repos.backup.listAll('exercises')).length

    ok(await repos.backup.reset(), 'backup.reset')
    out.afterReset = await repos.backup.countWorkoutsAndSets()
    out.exercisesAfterReset = (await repos.backup.listAll('exercises')).length
    out.weightsAfterReset = (await repos.backup.listAll('body_weight_entries')).length
    out.unitAfterReset = (await repos.backup.getProfile()).weight_unit

    ok(await repos.backup.erase(), 'backup.erase')
    return { out, base }
  }, { stamp, exerciseRow: EXERCISE_ROW })

  expect(normalize(result.out, stamp, result.base)).toEqual(EXPECTED_BACKUP)
})
