import { test, expect } from '@playwright/test'
import { openSqlJsDb } from './fixtures/sqljs'
import { createSqliteRepos, LOCAL_USER_ID } from '../src/data/sqlite/repos'
import { MIGRATIONS, migrate, SCHEMA_VERSION } from '../src/data/sqlite/schema'
import type { SqlDb } from '../src/data/sqlite/db'
import type { NewExercise, NewSet, Repos } from '../src/data/types'
import type { BackupFile, BackupTable } from '../src/lib/backup'
import type { ExerciseHistoryWorkout } from '../src/lib/exerciseHistory'
import { isFullBackup, selectBackupRows } from '../src/lib/backupMerge'
import { buildRepRecords } from '../src/lib/repRecords'

// Issue #75: every repo's behavior against the SQLite adapter, on an
// in-memory sql.js database in Playwright's Node process (same "no separate
// unit-test runner" reasoning as progress-series-unit.spec.ts). Each test
// gets a fresh database and a clock it moves by hand.

let db: SqlDb
let repos: Repos
let clock: Date

test.beforeEach(async () => {
  db = await openSqlJsDb()
  clock = new Date('2026-09-01T12:00:00.000Z')
  repos = createSqliteRepos(async () => db, { now: () => clock })
})

function advance(hours: number) {
  clock = new Date(clock.getTime() + hours * 3_600_000)
}

function exercise(name: string, extra: Partial<NewExercise> = {}): NewExercise {
  return {
    name,
    setup_notes: null,
    rest_seconds: null,
    load_type: 'weight',
    tracks_distance: false,
    tracks_incline: false,
    tracks_level: false,
    tracks_calories: false,
    muscle_group: null,
    also_works: [],
    library_id: null,
    ...extra,
  }
}

function set(workoutId: string, exerciseId: string, weight: number, reps: number, extra: Partial<NewSet> = {}): NewSet {
  return {
    workout_id: workoutId,
    exercise_id: exerciseId,
    set_index: 0,
    reps,
    weight,
    weight_unit: 'lb',
    rpe: null,
    level: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    incline: null,
    calories: null,
    ...extra,
  }
}

async function ok<T>(result: Promise<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await result
  expect(error).toBeNull()
  return data
}

async function newExercise(name: string, extra: Partial<NewExercise> = {}) {
  return (await ok(repos.exercises.create(exercise(name, extra))))!
}

async function newWorkout(templateId: string | null = null) {
  advance(24)
  return (await ok(repos.workouts.createWorkout(null, templateId)))!
}

test.describe('schema', () => {
  test('a fresh database migrates to the current version with one settings row', async () => {
    const [row] = await db.query<{ version: number }>('SELECT MAX(version) AS version FROM schema_version')
    expect(row.version).toBe(SCHEMA_VERSION)
    const settings = await db.query('SELECT * FROM settings')
    expect(settings).toHaveLength(1)
  })

  test('migrating again is a no-op', async () => {
    await repos.profile.update({ height: 70 })
    await migrate(db)
    const versions = await db.query('SELECT version FROM schema_version')
    expect(versions).toHaveLength(SCHEMA_VERSION)
    expect((await ok(repos.profile.get()))!.height).toBe(70)
  })

  // Issue #90 follow-up: version 3 swaps exercises.rest_seconds for a column
  // that also allows 0 (no timer), keeping existing values and references.
  test('version 3 keeps rest timers and lets rest_seconds be 0', async () => {
    const old = await openSqlJsDb({ migrated: false })
    await old.run('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    for (const [i, statements] of MIGRATIONS.slice(0, 2).entries()) {
      for (const statement of statements) await old.run(statement)
      await old.run('INSERT INTO schema_version (version) VALUES (?)', [i + 1])
    }
    await old.run(`INSERT INTO exercises (id, name, rest_seconds) VALUES ('a', 'Timed', 60), ('b', 'Untimed', NULL)`)
    await old.run(`INSERT INTO workouts (id, performed_at) VALUES ('w', '2026-09-01T12:00:00.000Z')`)
    await old.run(`INSERT INTO sets (id, workout_id, exercise_id, set_index, reps, weight, weight_unit) VALUES ('s', 'w', 'a', 0, 5, 100, 'lb')`)
    await expect(old.run(`UPDATE exercises SET rest_seconds = 0 WHERE id = 'a'`)).rejects.toThrow(/CHECK/)

    await migrate(old)
    const oldRepos = createSqliteRepos(async () => old, { now: () => clock })
    const list = await ok(oldRepos.exercises.list())
    expect(list.map((e) => [e.name, e.rest_seconds])).toEqual([['Timed', 60], ['Untimed', null]])
    expect((await oldRepos.exercises.update('a', { rest_seconds: 0 })).error).toBeNull()
    expect((await ok(oldRepos.exercises.list())).find((e) => e.id === 'a')!.rest_seconds).toBe(0)
    expect((await oldRepos.exercises.update('a', { rest_seconds: -1 })).error).not.toBeNull()
    await expect(old.run(`DELETE FROM exercises WHERE id = 'a'`)).rejects.toThrow(/FOREIGN KEY/)
  })

  // Issue #429: only a brand-new database gets the 2:00 default rest; an
  // existing install that upgrades keeps its empty default.
  test('a new database starts with a 2:00 default rest, an upgraded one keeps an empty default', async () => {
    const [fresh] = await db.query<{ default_rest_seconds: number | null }>('SELECT default_rest_seconds FROM settings')
    expect(fresh.default_rest_seconds).toBe(120)

    const old = await openSqlJsDb({ migrated: false })
    await old.run('CREATE TABLE schema_version (version INTEGER NOT NULL)')
    for (const [i, statements] of MIGRATIONS.slice(0, SCHEMA_VERSION - 1).entries()) {
      for (const statement of statements) await old.run(statement)
      await old.run('INSERT INTO schema_version (version) VALUES (?)', [i + 1])
    }
    await migrate(old)
    const [upgraded] = await old.query<{ default_rest_seconds: number | null }>('SELECT default_rest_seconds FROM settings')
    expect(upgraded.default_rest_seconds).toBeNull()
  })

  test('a database from a newer app version is refused', async () => {
    await db.run('INSERT INTO schema_version (version) VALUES (?)', [SCHEMA_VERSION + 1])
    await expect(migrate(db)).rejects.toThrow(/newer version/)
  })

  test('the database opens lazily, on the first repo call', async () => {
    let opened = 0
    const fresh = await openSqlJsDb()
    const lazy = createSqliteRepos(async () => {
      opened++
      return fresh
    })
    expect(opened).toBe(0)
    await Promise.all([lazy.exercises.list(), lazy.templates.list()])
    expect(opened).toBe(1)
  })
})

test.describe('profile', () => {
  test('starts at the new-install defaults and round-trips a patch', async () => {
    expect(await ok(repos.profile.get())).toEqual({
      height: null,
      height_unit: null,
      missing_weight_prompt_opt_out: false,
      weight_reminder: 'monthly',
      plates_lb: [45, 35, 25, 10, 5, 2.5],
      plates_kg: [25, 20, 15, 10, 5, 2.5, 1.25],
      weight_unit: null,
      prefill_mode: 'last_time',
      default_rest_seconds: 120,
    })
    await ok(
      repos.profile.update({ height: 180, height_unit: 'cm', missing_weight_prompt_opt_out: true, plates_lb: [45, 25], weight_unit: 'kg' }),
    )
    const profile = (await ok(repos.profile.get()))!
    expect(profile).toMatchObject({ height: 180, height_unit: 'cm', missing_weight_prompt_opt_out: true, plates_lb: [45, 25], weight_unit: 'kg' })
  })

  test('a value outside the check constraint is refused', async () => {
    const { error } = await repos.profile.update({ weight_reminder: 'daily' as never })
    expect(error?.code).toBe('23514')
  })
})

test.describe('body weight', () => {
  test('lists newest first, updates, and removes', async () => {
    const first = (await ok(repos.bodyWeight.create(180, 'lb')))!
    advance(1)
    const second = (await ok(repos.bodyWeight.create(179.5, 'lb')))!
    expect(first).toMatchObject({ weight: 180, weight_unit: 'lb', user_id: LOCAL_USER_ID, recorded_at: '2026-09-01T12:00:00.000Z' })

    expect((await ok(repos.bodyWeight.list())).map((e) => e.id)).toEqual([second.id, first.id])

    const updated = (await ok(repos.bodyWeight.update(first.id, 82, 'kg', '2026-09-05T08:00:00+00:00')))!
    expect(updated).toMatchObject({ weight: 82, weight_unit: 'kg', recorded_at: '2026-09-05T08:00:00.000Z' })
    expect((await ok(repos.bodyWeight.list()))[0].id).toBe(first.id)

    await ok(repos.bodyWeight.remove(first.id))
    expect(await ok(repos.bodyWeight.list())).toHaveLength(1)
  })
})

test.describe('exercises', () => {
  test('creates with defaults, lists by name case-insensitively with archived ones, and updates', async () => {
    const squat = await newExercise('squat', { also_works: ['glutes', 'core'], muscle_group: 'legs' })
    const bench = await newExercise('Bench Press')
    expect(squat).toMatchObject({
      user_id: LOCAL_USER_ID,
      is_archived: false,
      also_works: ['glutes', 'core'],
      muscle_group: 'legs',
      uses_barbell: null,
      tracks_distance: false,
    })

    await ok(repos.exercises.update(bench.id, { is_archived: true, uses_barbell: true, rep_range_min: 5, rep_range_max: 8 }))
    const list = await ok(repos.exercises.list())
    expect(list.map((e) => e.name)).toEqual(['Bench Press', 'squat'])
    expect(list[0]).toMatchObject({ is_archived: true, uses_barbell: true, rep_range_min: 5, rep_range_max: 8 })
  })

  test('refuses a column that does not exist and a bad rep range', async () => {
    const e = await newExercise('Row')
    expect((await repos.exercises.update(e.id, { nope: 1 } as never)).error?.message).toMatch(/nope/)
    expect((await repos.exercises.update(e.id, { rep_range_min: 10, rep_range_max: 5 })).error?.code).toBe('23514')
  })

  test('hasLoggedSets', async () => {
    const e = await newExercise('Curl')
    expect(await repos.exercises.hasLoggedSets(e.id)).toBe(false)
    const w = await newWorkout()
    await ok(repos.workouts.insertSet(set(w.id, e.id, 30, 10)))
    expect(await repos.exercises.hasLoggedSets(e.id)).toBe(true)
  })

  test('merge moves sets and routine rows, keeping the larger target, then archives the copy', async () => {
    const a = await newExercise('Bench press')
    const b = await newExercise('Barbell Bench Press')
    const w1 = await newWorkout()
    const w2 = await newWorkout()
    await ok(repos.workouts.insertSet(set(w1.id, a.id, 100, 5)))
    await ok(repos.workouts.insertSet(set(w2.id, a.id, 100, 5)))
    await ok(repos.workouts.insertSet(set(w2.id, b.id, 110, 5)))
    expect(await repos.exercises.countWorkouts(a.id)).toBe(2)
    const both = (await ok(repos.templates.create('Both')))!
    const only = (await ok(repos.templates.create('OnlyA')))!
    await ok(repos.templates.insertExercises([
      { template_id: both.id, exercise_id: a.id, position: 0, target_sets: 5 },
      { template_id: both.id, exercise_id: b.id, position: 1, target_sets: 3 },
      { template_id: only.id, exercise_id: a.id, position: 0, target_sets: 4 },
    ]))
    expect((await repos.exercises.merge(a.id, b.id)).error).toBeNull()
    expect(await repos.exercises.hasLoggedSets(a.id)).toBe(false)
    expect(await repos.exercises.countWorkouts(b.id)).toBe(2)
    const bothRows = await ok(repos.templates.listExercises(both.id))
    expect(bothRows.map((r) => [r.exercise_id, r.target_sets])).toEqual([[b.id, 5]])
    const onlyRows = await ok(repos.templates.listExercises(only.id))
    expect(onlyRows.map((r) => [r.exercise_id, r.target_sets])).toEqual([[b.id, 4]])
    const list = await ok(repos.exercises.list())
    expect(list.find((e) => e.id === a.id)?.is_archived).toBe(true)
    expect(list.find((e) => e.id === b.id)?.is_archived).toBe(false)
  })
})

test.describe('templates', () => {
  test('list carries the exercise count and refs; exercises keep their order and embed', async () => {
    const squat = await newExercise('Squat')
    const bench = await newExercise('Bench', { load_type: 'weight' })
    const legs = (await ok(repos.templates.create('legs day')))!
    const push = (await ok(repos.templates.create('Push')))!
    expect(legs).toMatchObject({ name: 'legs day', is_archived: false, category: null, user_id: LOCAL_USER_ID })

    const added = (await ok(repos.templates.addExercise({ template_id: legs.id, exercise_id: squat.id, position: 0, target_sets: 3 })))!
    expect(added.exercises).toEqual({ name: 'Squat', load_type: 'weight' })
    await ok(
      repos.templates.insertExercises([
        { template_id: push.id, exercise_id: bench.id, position: 1, target_sets: null },
        { template_id: push.id, exercise_id: squat.id, position: 0, target_sets: 2 },
      ]),
    )

    const list = await ok(repos.templates.list())
    expect(list.map((t) => t.name)).toEqual(['legs day', 'Push'])
    expect(list[1].workout_template_exercises).toEqual([{ count: 2 }])
    expect(list[1].exercise_refs).toEqual([{ exercise_id: squat.id }, { exercise_id: bench.id }])

    const pushExercises = await ok(repos.templates.listExercises(push.id))
    expect(pushExercises.map((te) => te.exercises?.name)).toEqual(['Squat', 'Bench'])

    // Reorder by upsert, then edit and remove one.
    await ok(repos.templates.saveExercises(pushExercises.map(({ exercises: _e, ...te }, i) => ({ ...te, position: 1 - i }))))
    expect((await ok(repos.templates.listExercises(push.id))).map((te) => te.exercises?.name)).toEqual(['Bench', 'Squat'])
    await ok(repos.templates.updateExerciseTargetSets(pushExercises[1].id, 4))
    await ok(repos.templates.removeExercise(pushExercises[0].id))
    const after = await ok(repos.templates.listExercises(push.id))
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ target_sets: 4, position: 0 })

    await ok(repos.templates.update(push.id, { is_archived: true, category: 'upper', name: 'Push A' }))
    expect((await ok(repos.templates.list())).find((t) => t.id === push.id)).toMatchObject({ is_archived: true, category: 'upper', name: 'Push A' })
  })

  test('a batch insert with one bad row inserts none', async () => {
    const squat = await newExercise('Squat')
    const t = (await ok(repos.templates.create('T')))!
    const { error } = await repos.templates.insertExercises([
      { template_id: t.id, exercise_id: squat.id, position: 0, target_sets: 3 },
      { template_id: t.id, exercise_id: squat.id, position: 1, target_sets: 0 },
    ])
    expect(error?.code).toBe('23514')
    expect(await ok(repos.templates.listExercises(t.id))).toHaveLength(0)
  })

  test('a template exercise must point at a real exercise', async () => {
    const t = (await ok(repos.templates.create('T')))!
    const { error } = await repos.templates.addExercise({ template_id: t.id, exercise_id: 'missing', position: 0, target_sets: null })
    expect(error?.code).toBe('23503')
  })
})

test.describe('workouts and sets', () => {
  test('set_index is assigned by the database, and a duplicate id is a 23505', async () => {
    const squat = await newExercise('Squat')
    const w = await newWorkout()
    const a = (await ok(repos.workouts.insertSet(set(w.id, squat.id, 225, 5, { set_index: 7 }))))!
    const [b, c] = await Promise.all([
      repos.workouts.insertSet(set(w.id, squat.id, 225, 5, { id: 'fixed-id' })),
      repos.workouts.insertSetWithExercise(set(w.id, squat.id, 235, 3)),
    ])
    expect([a.set_index, b.data!.set_index, c.data!.set_index]).toEqual([0, 1, 2])
    expect(b.data!.id).toBe('fixed-id')
    expect(c.data!.exercises).toEqual({ name: 'Squat', load_type: 'weight' })

    const dup = await repos.workouts.insertSet(set(w.id, squat.id, 225, 5, { id: 'fixed-id' }))
    expect(dup.error?.code).toBe('23505')
    expect((await ok(repos.workouts.findSet('fixed-id', w.id)))!.weight).toBe(225)
    expect(await ok(repos.workouts.findSet('fixed-id', 'other-workout'))).toBeNull()
  })

  test('getWorkout and listHistory return the embedded shape, sets in order', async () => {
    const squat = await newExercise('Squat')
    const bench = await newExercise('Bench')
    const t = (await ok(repos.templates.create('Full')))!
    const older = await newWorkout(t.id)
    await ok(repos.workouts.insertSet(set(older.id, bench.id, 135, 8)))
    const newer = await newWorkout()
    await ok(repos.workouts.insertSet(set(newer.id, squat.id, 225, 5)))
    await ok(repos.workouts.insertSet(set(newer.id, bench.id, 185, 5, { rpe: 8 })))
    await ok(repos.workouts.updateWorkoutNotes(newer.id, 'felt good'))

    const got = (await ok(repos.workouts.getWorkout(older.id)))!
    expect(got).toMatchObject({ id: older.id, template_id: t.id, user_id: LOCAL_USER_ID, workout_templates: { name: 'Full' } })
    expect(got.sets[0]).toMatchObject({ weight: 135, exercises: { name: 'Bench', load_type: 'weight' } })
    expect(await ok(repos.workouts.getWorkout('missing'))).toBeNull()

    const history = await ok(repos.workouts.listHistory())
    expect(history.map((w) => w.id)).toEqual([newer.id, older.id])
    expect(history[0]).toMatchObject({ notes: 'felt good', workout_templates: null })
    expect(history[0].sets.map((s) => [s.set_index, s.exercises?.name, s.rpe])).toEqual([
      [0, 'Squat', null],
      [1, 'Bench', 8],
    ])
  })

  test('updateSet and deleteSet; deleting a workout removes its sets', async () => {
    const squat = await newExercise('Squat')
    const w = await newWorkout()
    const s1 = (await ok(repos.workouts.insertSet(set(w.id, squat.id, 225, 5))))!
    const s2 = (await ok(repos.workouts.insertSet(set(w.id, squat.id, 225, 5))))!
    await ok(repos.workouts.updateSet(s1.id, { ...set(w.id, squat.id, 230, 4), rpe: 9 }))
    expect(await ok(repos.workouts.findSet(s1.id, w.id))).toMatchObject({ weight: 230, reps: 4, rpe: 9 })
    await ok(repos.workouts.deleteSet(s2.id))
    expect((await ok(repos.workouts.getWorkout(w.id)))!.sets).toHaveLength(1)

    await ok(repos.workouts.deleteWorkout(w.id))
    expect(await db.query('SELECT * FROM sets')).toHaveLength(0)
  })

  test('getPreviousForTemplate skips empty and excluded workouts', async () => {
    const squat = await newExercise('Squat')
    const t = (await ok(repos.templates.create('Legs')))!
    const done = await newWorkout(t.id)
    await ok(repos.workouts.insertSet(set(done.id, squat.id, 225, 5)))
    const later = await newWorkout(t.id)
    await ok(repos.workouts.insertSet(set(later.id, squat.id, 230, 5)))
    await newWorkout(t.id) // empty, newest

    expect((await ok(repos.workouts.getPreviousForTemplate(t.id, null)))!.id).toBe(later.id)
    const previous = (await ok(repos.workouts.getPreviousForTemplate(t.id, later.id)))!
    expect(previous.id).toBe(done.id)
    expect(previous.sets[0]).toMatchObject({ weight: 225, exercises: { name: 'Squat' } })
    expect(previous.workout_templates).toEqual({ name: 'Legs' })
    expect(await ok(repos.workouts.getPreviousForTemplate('none', null))).toBeNull()
  })

  test('getLatestSetsForExercise returns only that exercise, from its latest workout', async () => {
    const squat = await newExercise('Squat')
    const bench = await newExercise('Bench')
    const w1 = await newWorkout()
    await ok(repos.workouts.insertSet(set(w1.id, squat.id, 200, 5)))
    const w2 = await newWorkout()
    await ok(repos.workouts.insertSet(set(w2.id, bench.id, 135, 5)))
    await ok(repos.workouts.insertSet(set(w2.id, squat.id, 210, 5)))
    await ok(repos.workouts.insertSet(set(w2.id, squat.id, 215, 4)))
    const w3 = await newWorkout()
    await ok(repos.workouts.insertSet(set(w3.id, bench.id, 140, 5)))

    const latest = await ok(repos.workouts.getLatestSetsForExercise(squat.id, null))
    expect(latest.map((s) => [s.weight, s.set_index])).toEqual([
      [210, 1],
      [215, 2],
    ])
    expect(latest[0].exercises).toEqual({ name: 'Squat', load_type: 'weight' })
    expect((await ok(repos.workouts.getLatestSetsForExercise(squat.id, w2.id))).map((s) => s.weight)).toEqual([200])
    expect(await ok(repos.workouts.getLatestSetsForExercise('none', null))).toEqual([])
  })

  test('getLatestWorkoutSets is the newest workout, even with no sets', async () => {
    expect(await ok(repos.workouts.getLatestWorkoutSets())).toBeNull()
    const squat = await newExercise('Squat')
    const w = await newWorkout()
    await ok(repos.workouts.insertSet(set(w.id, squat.id, 225, 5, { level: null })))
    expect(await ok(repos.workouts.getLatestWorkoutSets())).toEqual({
      id: w.id,
      sets: [{ exercise_id: squat.id, set_index: 0, reps: 5, weight: 225, weight_unit: 'lb', level: null, exercises: { name: 'Squat', load_type: 'weight' } }],
    })
    const empty = await newWorkout()
    expect(await ok(repos.workouts.getLatestWorkoutSets())).toEqual({ id: empty.id, sets: [] })
  })

  // Issue #264: a backdated workout, and moving one to another date.
  test('createWorkout takes a past date, and updateWorkoutDate moves a workout', async () => {
    const recent = await newWorkout()
    const past = (await ok(repos.workouts.createWorkout(null, null, '2026-01-02T18:30:00.000Z')))!
    expect(past.performed_at).toBe('2026-01-02T18:30:00.000Z')
    expect((await ok(repos.workouts.listHistory())).map((w) => w.id)).toEqual([recent.id, past.id])

    await ok(repos.workouts.updateWorkoutDate(past.id, '2099-01-01T00:00:00.000Z'))
    expect((await ok(repos.workouts.getWorkout(past.id)))!.performed_at).toBe('2099-01-01T00:00:00.000Z')
    expect((await ok(repos.workouts.listHistory())).map((w) => w.id)).toEqual([past.id, recent.id])
  })

  test('date and summary windows, and template sessions', async () => {
    const run = await newExercise('Run', { load_type: 'timed' })
    const t = (await ok(repos.templates.create('Cardio')))!
    const w1 = await newWorkout(t.id)
    await ok(repos.workouts.insertSet(set(w1.id, run.id, 0, 0, { reps: null, duration_seconds: 1200 })))
    const w2 = await newWorkout(t.id)
    const w3 = await newWorkout()
    const since = w2.performed_at.replace('.000Z', '+00:00')

    const dates = await repos.workouts.listWorkoutDatesSince(since)
    expect(dates.error).toBeNull()
    expect(dates.count).toBe(2)
    expect(dates.data!.map((d) => d.performed_at).sort()).toEqual([w2.performed_at, w3.performed_at])

    const all = await repos.workouts.listWorkoutSummariesSince('2000-01-01T00:00:00Z')
    expect(all.count).toBe(3)
    expect(all.data.find((s) => s.id === w1.id)).toEqual({
      id: w1.id,
      performed_at: w1.performed_at,
      sets: [{ reps: null, weight: 0, weight_unit: 'lb', duration_seconds: 1200, exercises: { load_type: 'timed', muscle_group: null } }],
    })

    const sessions = await ok(repos.workouts.listTemplateSessions(t.id, w2.performed_at, 5))
    expect(sessions.map((s) => s.id)).toEqual([w2.id, w1.id])
    expect((await ok(repos.workouts.listTemplateSessions(t.id, w2.performed_at, 1))).map((s) => s.id)).toEqual([w2.id])
    expect(await ok(repos.workouts.listTemplateSessions(t.id, w1.performed_at, 5))).toHaveLength(1)
  })

  test('prior sets and record markers leave out the excluded workout or set', async () => {
    const squat = await newExercise('Squat')
    const bench = await newExercise('Bench')
    const past = await newWorkout()
    const p1 = (await ok(repos.workouts.insertSet(set(past.id, squat.id, 225, 5, { level: null }))))!
    await ok(repos.workouts.insertSet(set(past.id, bench.id, 135, 8)))
    const current = await newWorkout()
    const c1 = (await ok(repos.workouts.insertSet(set(current.id, squat.id, 235, 5))))!

    const prior = await ok(repos.workouts.listPriorSets([squat.id, bench.id], current.id))
    expect(prior).toHaveLength(2)
    expect(prior.find((s) => s.id === p1.id)).toEqual({
      id: p1.id,
      exercise_id: squat.id,
      workout_id: past.id,
      reps: 5,
      weight: 225,
      weight_unit: 'lb',
      level: null,
      duration_seconds: null,
      distance: null,
      distance_unit: null,
      calories: null,
      performed_at: past.performed_at,
    })
    expect(await ok(repos.workouts.listPriorSets([], current.id))).toEqual([])

    expect(await ok(repos.workouts.listSetMarkersForExercises([squat.id], current.id))).toEqual([
      { exercise_id: squat.id, reps: 5, weight: 225, weight_unit: 'lb', level: null, workouts: { performed_at: past.performed_at } },
    ])
    expect(await ok(repos.workouts.listSetMarkersForExercise(squat.id, c1.id))).toEqual([
      { reps: 5, weight: 225, weight_unit: 'lb', level: null, workouts: { performed_at: past.performed_at } },
    ])
  })

  test('exercise history groups by workout, newest first, sets in order', async () => {
    const squat = await newExercise('Squat')
    const bench = await newExercise('Bench')
    const w1 = await newWorkout()
    await ok(repos.workouts.insertSet(set(w1.id, squat.id, 200, 5)))
    const w2 = await newWorkout()
    await ok(repos.workouts.insertSet(set(w2.id, squat.id, 210, 5)))
    await ok(repos.workouts.insertSet(set(w2.id, bench.id, 135, 5)))
    const s = (await ok(repos.workouts.insertSet(set(w2.id, squat.id, 215, 3, { rpe: 9 }))))!

    const history = await ok(repos.workouts.listExerciseHistory(squat.id))
    expect(history.map((h) => [h.workoutId, h.performedAt, h.sets.map((x) => x.weight)])).toEqual([
      [w2.id, w2.performed_at, [210, 215]],
      [w1.id, w1.performed_at, [200]],
    ])
    expect(history[0].sets[1]).toEqual({
      id: s.id,
      reps: 3,
      weight: 215,
      weight_unit: 'lb',
      rpe: 9,
      level: null,
      duration_seconds: null,
      distance: null,
      distance_unit: null,
      incline: null,
      calories: null,
    })
  })

  test('recent exercise ids, progress rows, and weighted set counts', async () => {
    const squat = await newExercise('Squat')
    const pullup = await newExercise('Pull-up', { load_type: 'bodyweight' })
    const t = (await ok(repos.templates.create('Pull')))!
    const w1 = await newWorkout(t.id)
    await ok(repos.workouts.insertSet(set(w1.id, squat.id, 100, 5, { weight_unit: 'kg' })))
    const w2 = await newWorkout()
    await ok(repos.workouts.insertSet(set(w2.id, pullup.id, 0, 8)))
    await ok(repos.workouts.insertSet(set(w2.id, squat.id, 225, 5)))

    expect(await ok(repos.workouts.listRecentSetExerciseIds(2))).toEqual([squat.id, pullup.id])

    const progress = await ok(repos.workouts.listProgressSets())
    expect(progress).toHaveLength(3)
    expect(progress.find((row) => row.workout_id === w1.id)).toMatchObject({ template_name: 'Pull', weight_unit: 'kg', performed_at: w1.performed_at })
    expect(progress.find((row) => row.exercise_id === pullup.id)).toMatchObject({ template_name: null, reps: 8 })

    expect(await repos.workouts.countWeightedSets('lb')).toBe(1)
    expect(await repos.workouts.countWeightedSets('kg')).toBe(1)
  })
})

test.describe('backup reads', () => {
  test('profile, table rows, and counts match the backup file format', async () => {
    const squat = await newExercise('Squat', { also_works: ['glutes'] })
    const w = await newWorkout()
    await ok(repos.workouts.insertSet(set(w.id, squat.id, 225, 5)))
    await ok(repos.bodyWeight.create(180, 'lb'))
    await repos.profile.update({ height: 70, height_unit: 'in', weight_unit: 'lb' })

    expect(await repos.backup.getProfile()).toEqual({
      height: 70,
      height_unit: 'in',
      missing_weight_prompt_opt_out: false,
      weight_reminder: 'monthly',
      plates_lb: [45, 35, 25, 10, 5, 2.5],
      plates_kg: [25, 20, 15, 10, 5, 2.5, 1.25],
      weight_unit: 'lb',
      prefill_mode: 'last_time',
      default_rest_seconds: 120,
    })
    const [exerciseRow] = await repos.backup.listAll('exercises')
    expect(exerciseRow).toMatchObject({ id: squat.id, is_archived: false, also_works: ['glutes'], user_id: LOCAL_USER_ID })
    expect(await repos.backup.listAll('sets')).toHaveLength(1)
    expect(await repos.backup.countWorkoutsAndSets()).toEqual({ workouts: 1, sets: 1 })
  })

})

// Issue #77: reset, restore, and erase, the local twins of the
// reset_my_data, restore_my_data, and delete_my_account RPCs.

async function counts() {
  const [row] = await db.query<Record<string, number>>(
    `SELECT (SELECT COUNT(*) FROM exercises) AS exercises, (SELECT COUNT(*) FROM workout_templates) AS templates,
            (SELECT COUNT(*) FROM workout_template_exercises) AS template_exercises, (SELECT COUNT(*) FROM workouts) AS workouts,
            (SELECT COUNT(*) FROM sets) AS sets, (SELECT COUNT(*) FROM body_weight_entries) AS weigh_ins`,
  )
  return row
}

// src/lib/backup.ts's BACKUP_TABLES; that module loads the app's data
// adapter, which can't run in Node.
const BACKUP_TABLES: BackupTable[] = ['exercises', 'workout_templates', 'workout_template_exercises', 'workouts', 'sets', 'body_weight_entries']

const EMPTY = { exercises: 0, templates: 0, template_exercises: 0, workouts: 0, sets: 0, weigh_ins: 0 }

async function seedEverything() {
  const squat = await newExercise('Squat')
  const t = (await ok(repos.templates.create('Legs')))!
  await ok(repos.templates.addExercise({ template_id: t.id, exercise_id: squat.id, position: 0, target_sets: 3 }))
  const w = await newWorkout(t.id)
  await ok(repos.workouts.insertSet(set(w.id, squat.id, 225, 5)))
  await ok(repos.bodyWeight.create(180, 'lb'))
  await repos.profile.update({
    height: 70,
    height_unit: 'in',
    missing_weight_prompt_opt_out: true,
    weight_reminder: 'weekly',
    weight_unit: 'kg',
    prefill_mode: 'blank',
    default_rest_seconds: 120,
    plates_lb: [45, 25],
  })
}

// What "Back up my data" writes (src/lib/backup.ts's buildBackup), from these repos.
async function backupOf(source: Repos): Promise<BackupFile> {
  const file = { format: 'repbunny-backup', version: 1, exported_at: clock.toISOString(), profile: await source.backup.getProfile() } as BackupFile
  for (const table of BACKUP_TABLES) file[table] = await source.backup.listAll(table)
  return file
}

// A file as the PWA writes it: `select *` rows from Supabase, with user_id,
// Postgres-style timestamps, and exercises.category (a column the live
// database still has, #18, that the device schema doesn't).
function supabaseBackup(): BackupFile {
  const user = '6f0c1d2e-0000-4000-8000-000000000001'
  return {
    format: 'repbunny-backup',
    version: 1,
    exported_at: '2026-09-30T18:00:00.000Z',
    profile: {
      height: 180,
      height_unit: 'cm',
      missing_weight_prompt_opt_out: true,
      weight_reminder: 'off',
      plates_lb: [45, 35, 25, 10, 5, 2.5],
      plates_kg: [20, 10, 5, 2.5],
    },
    exercises: [
      {
        id: 'ex-bench', user_id: user, name: 'Bench Press', is_archived: false, setup_notes: 'Bench at notch 3', rest_seconds: 120,
        load_type: 'weight', tracks_distance: false, tracks_incline: false, tracks_level: false, tracks_calories: false,
        muscle_group: 'chest', also_works: ['arms', 'shoulders'], library_id: 'barbell-bench-press', uses_barbell: true,
        bar_type: 'standard', bar_custom_weight: null, bar_custom_unit: null, weight_step: null, weight_step_unit: null,
        rep_range_min: 5, rep_range_max: 8, category: null,
      },
      {
        id: 'ex-curl', user_id: user, name: 'Old Curl', is_archived: true, setup_notes: null, rest_seconds: null,
        load_type: 'weight', tracks_distance: false, tracks_incline: false, tracks_level: false, tracks_calories: false,
        muscle_group: 'arms', also_works: [], library_id: null, uses_barbell: null, bar_type: null, bar_custom_weight: null,
        bar_custom_unit: null, weight_step: null, weight_step_unit: null, rep_range_min: null, rep_range_max: null, category: 'arms',
      },
    ],
    workout_templates: [
      { id: 'tp-push', user_id: user, name: 'Push', is_archived: false, category: 'upper' },
      { id: 'tp-old', user_id: user, name: 'Old Arms', is_archived: true, category: null },
    ],
    workout_template_exercises: [
      { id: 'te-1', template_id: 'tp-push', exercise_id: 'ex-bench', position: 0, target_sets: 3 },
      { id: 'te-2', template_id: 'tp-old', exercise_id: 'ex-curl', position: 0, target_sets: null },
      { id: 'te-dangling', template_id: 'tp-push', exercise_id: 'ex-missing', position: 1, target_sets: 2 },
    ],
    workouts: [
      { id: 'wo-1', user_id: user, template_id: 'tp-push', performed_at: '2026-09-01T15:00:00+00:00', notes: 'Felt strong, "quoted"' },
      { id: 'wo-2', user_id: user, template_id: null, performed_at: '2026-09-03T15:30:00.5+00:00', notes: null },
      { id: 'wo-3', user_id: user, template_id: 'tp-gone', performed_at: '2026-09-05T15:00:00+00:00', notes: null },
    ],
    sets: [
      // Out of order, with a gap: restore renumbers each workout's sets from 0.
      { id: 's-3', workout_id: 'wo-1', exercise_id: 'ex-bench', set_index: 4, reps: 6, weight: 190, weight_unit: 'lb', rpe: 9, level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null },
      { id: 's-1', workout_id: 'wo-1', exercise_id: 'ex-bench', set_index: 0, reps: 8, weight: 185, weight_unit: 'lb', rpe: null, level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null },
      { id: 's-4', workout_id: 'wo-2', exercise_id: 'ex-curl', set_index: 0, reps: 12, weight: 30, weight_unit: 'lb', rpe: null, level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null },
      { id: 's-5', workout_id: 'wo-2', exercise_id: 'ex-bench', set_index: 1, reps: 5, weight: 90, weight_unit: 'kg', rpe: 8.5, level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null },
      { id: 's-6', workout_id: 'wo-3', exercise_id: 'ex-bench', set_index: 0, reps: 3, weight: 200, weight_unit: 'lb', rpe: null, level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null },
      { id: 's-dangling', workout_id: 'wo-missing', exercise_id: 'ex-bench', set_index: 0, reps: 1, weight: 500, weight_unit: 'lb', rpe: null, level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null },
    ],
    body_weight_entries: [
      { id: 'bw-1', user_id: user, weight: 182.4, weight_unit: 'lb', recorded_at: '2026-08-30T07:00:00+00:00' },
      { id: 'bw-2', user_id: user, weight: 81, weight_unit: 'kg', recorded_at: '2026-09-29T07:00:00+00:00' },
    ],
  }
}

test.describe('reset, restore, and erase', () => {
  test('reset clears training data but keeps the unit, prefill mode, default rest, and plates', async () => {
    await seedEverything()
    expect((await repos.backup.reset()).error).toBeNull()

    expect(await counts()).toEqual(EMPTY)
    expect(await ok(repos.profile.get())).toEqual({
      height: null,
      height_unit: null,
      missing_weight_prompt_opt_out: false,
      weight_reminder: 'monthly',
      plates_lb: [45, 25],
      plates_kg: [25, 20, 15, 10, 5, 2.5, 1.25],
      weight_unit: 'kg',
      prefill_mode: 'blank',
      default_rest_seconds: 120,
    })
  })

  test('erase empties every table and puts the settings row back to first-launch defaults', async () => {
    await seedEverything()
    expect((await repos.backup.erase()).error).toBeNull()

    expect(await counts()).toEqual(EMPTY)
    expect(await ok(repos.profile.get())).toEqual({
      height: null,
      height_unit: null,
      missing_weight_prompt_opt_out: false,
      weight_reminder: 'monthly',
      plates_lb: [45, 35, 25, 10, 5, 2.5],
      plates_kg: [25, 20, 15, 10, 5, 2.5, 1.25],
      weight_unit: null,
      prefill_mode: 'last_time',
      default_rest_seconds: 120,
    })
  })

  test('a PWA backup restores with the same PRs, templates, notes, body weight, and archived exercises', async () => {
    await seedEverything()
    await repos.profile.update({ weight_unit: 'lb' })
    const file = supabaseBackup()
    expect((await repos.backup.restore(file)).error).toBeNull()

    // What was there before is gone; dangling rows are skipped.
    expect(await counts()).toEqual({ exercises: 2, templates: 2, template_exercises: 2, workouts: 3, sets: 5, weigh_ins: 2 })

    const exercises = await ok(repos.exercises.list())
    const bench = exercises.find((e) => e.name === 'Bench Press')!
    const curl = exercises.find((e) => e.name === 'Old Curl')!
    expect(bench).toMatchObject({
      is_archived: false, setup_notes: 'Bench at notch 3', rest_seconds: 120, muscle_group: 'chest', also_works: ['arms', 'shoulders'],
      library_id: 'barbell-bench-press', uses_barbell: true, bar_type: 'standard', rep_range_min: 5, rep_range_max: 8, user_id: LOCAL_USER_ID,
    })
    expect(bench).not.toHaveProperty('category')
    expect(bench.id).not.toBe('ex-bench')
    expect(curl).toMatchObject({ is_archived: true, uses_barbell: null })

    const templates = await ok(repos.templates.list())
    const push = templates.find((t) => t.name === 'Push')!
    expect(push).toMatchObject({ category: 'upper', is_archived: false, workout_template_exercises: [{ count: 1 }] })
    expect(templates.find((t) => t.name === 'Old Arms')).toMatchObject({ is_archived: true })
    expect(await ok(repos.templates.listExercises(push.id))).toEqual([
      expect.objectContaining({ exercise_id: bench.id, position: 0, target_sets: 3, exercises: { name: 'Bench Press', load_type: 'weight' } }),
    ])

    // Newest first; an unknown template becomes freeform.
    const history = await ok(repos.workouts.listHistory())
    expect(history.map((w) => [w.performed_at, w.notes, w.workout_templates?.name ?? null])).toEqual([
      ['2026-09-05T15:00:00.000Z', null, null],
      ['2026-09-03T15:30:00.500Z', null, null],
      ['2026-09-01T15:00:00.000Z', 'Felt strong, "quoted"', 'Push'],
    ])
    expect(history[0].template_id).toBeNull()
    expect(history[2].template_id).toBe(push.id)
    expect(history[2].sets.map((s) => [s.set_index, s.weight, s.reps, s.rpe])).toEqual([[0, 185, 8, null], [1, 190, 6, 9]])
    expect(history[1].sets.map((s) => [s.set_index, s.exercise_id, s.weight_unit])).toEqual([[0, curl.id, 'lb'], [1, bench.id, 'kg']])

    // The same rep records the file's own sets give.
    const fromFile: ExerciseHistoryWorkout[] = file.workouts
      .map((w) => ({
        workoutId: String(w.id),
        performedAt: String(w.performed_at),
        sets: file.sets.filter((s) => s.workout_id === w.id && s.exercise_id === 'ex-bench') as unknown as ExerciseHistoryWorkout['sets'],
      }))
      .filter((w) => w.sets.length > 0)
    const restored = buildRepRecords(await ok(repos.workouts.listExerciseHistory(bench.id)), 'lb')
    expect(restored?.records).toEqual(buildRepRecords(fromFile, 'lb')?.records.map((r) => ({ ...r, performedAt: new Date(r.performedAt).toISOString() })))
    expect(restored?.records.map((r) => [r.weight, r.reps])).toEqual([[200, 3], [198.4, 5], [190, 6], [185, 8]])

    expect((await ok(repos.bodyWeight.list())).map((e) => [e.weight, e.weight_unit, e.recorded_at])).toEqual([
      [81, 'kg', '2026-09-29T07:00:00.000Z'],
      [182.4, 'lb', '2026-08-30T07:00:00.000Z'],
    ])

    // Profile fields from the file; the unit, prefill mode, and default rest stay the device's.
    expect(await ok(repos.profile.get())).toEqual({
      height: 180,
      height_unit: 'cm',
      missing_weight_prompt_opt_out: true,
      weight_reminder: 'off',
      plates_lb: [45, 35, 25, 10, 5, 2.5],
      plates_kg: [20, 10, 5, 2.5],
      weight_unit: 'lb',
      prefill_mode: 'blank',
      default_rest_seconds: 120,
    })
  })

  test('a device backup restores into another device unchanged', async () => {
    await repos.backup.restore(supabaseBackup())
    const original = await backupOf(repos)

    const other = createSqliteRepos(openSqlJsDb, { now: () => clock })
    expect((await other.backup.restore(original)).error).toBeNull()
    const copy = await backupOf(other)

    // Same rows apart from the new ids.
    const strip = (rows: Record<string, unknown>[]) =>
      rows.map(({ id: _id, template_id: _t, exercise_id: _e, workout_id: _w, ...rest }) => rest).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    expect(copy.profile).toEqual(original.profile)
    for (const table of BACKUP_TABLES) expect(strip(copy[table])).toEqual(strip(original[table]))
    expect(await other.backup.countWorkoutsAndSets()).toEqual({ workouts: 3, sets: 5 })
  })

  test('a failed restore leaves the data untouched', async () => {
    await seedEverything()
    const before = await counts()

    const bad = supabaseBackup()
    bad.sets[2] = { ...bad.sets[2], reps: -1 }
    const { error } = await repos.backup.restore(bad)
    expect(error?.code).toBe('23514')
    expect(await counts()).toEqual(before)
    expect((await ok(repos.profile.get()))!.height).toBe(70)

    expect((await repos.backup.restore({ hello: 'world' } as unknown as BackupFile)).error?.message).toBe('Not a RepBunny backup file')
    expect(await counts()).toEqual(before)
  })

  test('a backup with missing tables or profile restores as empty', async () => {
    await seedEverything()
    const minimal = { format: 'repbunny-backup', version: 1, exported_at: '2026-09-12T21:41:00Z' } as unknown as BackupFile
    expect((await repos.backup.restore(minimal)).error).toBeNull()
    expect(await counts()).toEqual(EMPTY)
    expect(await ok(repos.profile.get())).toMatchObject({ height: null, weight_reminder: 'monthly', plates_lb: [45, 25] })
  })
})

// Issue #93: a partial file (v2 without all three parts) merges in.
function partialOf(file: BackupFile, includes: NonNullable<BackupFile['includes']>): BackupFile {
  const out: BackupFile = { ...file, version: 2, includes }
  if (!includes.includes('preferences')) delete out.profile
  if (!includes.includes('templates')) {
    out.workout_templates = []
    out.workout_template_exercises = []
  }
  if (!includes.includes('history')) {
    out.workouts = []
    out.sets = []
    out.body_weight_entries = []
  }
  return out
}

test.describe('partial backups (#93)', () => {
  test('only v1 files and v2 files with all three parts are full backups', () => {
    expect(isFullBackup(supabaseBackup())).toBe(true)
    expect(isFullBackup(partialOf(supabaseBackup(), ['preferences', 'templates', 'history']))).toBe(true)
    expect(isFullBackup(partialOf(supabaseBackup(), ['templates']))).toBe(false)
    expect(isFullBackup(partialOf(supabaseBackup(), ['preferences', 'history']))).toBe(false)
  })

  test('a templates-only file adds templates, reuses matching exercises, and deletes nothing', async () => {
    const bench = await newExercise('bench press ')
    const squat = await newExercise('My Squat', { library_id: 'barbell-squat' })
    const push = (await ok(repos.templates.create('push')))!
    await ok(repos.templates.addExercise({ template_id: push.id, exercise_id: squat.id, position: 0, target_sets: 3 }))
    const w = await newWorkout(push.id)
    await ok(repos.workouts.insertSet(set(w.id, squat.id, 225, 5)))
    await repos.profile.update({ weight_unit: 'kg', height: 70, height_unit: 'in' })

    const file = partialOf(supabaseBackup(), ['templates'])
    // Matches "My Squat" by library id, despite the different name.
    file.exercises.push({ ...file.exercises[0], id: 'ex-squat', name: 'Back Squat', library_id: 'barbell-squat' })
    file.workout_template_exercises.push({ id: 'te-3', template_id: 'tp-push', exercise_id: 'ex-squat', position: 1, target_sets: 5 })
    expect((await repos.backup.merge(file)).error).toBeNull()

    // Bench and squat reused, Old Curl added; the dangling template row skipped.
    expect(await counts()).toEqual({ exercises: 3, templates: 3, template_exercises: 4, workouts: 1, sets: 1, weigh_ins: 0 })
    const exercises = await ok(repos.exercises.list())
    expect(exercises.map((e) => e.name)).toEqual(['bench press ', 'My Squat', 'Old Curl'])

    const templates = await ok(repos.templates.list())
    expect(templates.map((t) => t.name)).toEqual(['Old Arms', 'push', 'Push (2)'])
    const copied = templates.find((t) => t.name === 'Push (2)')!
    expect(copied).toMatchObject({ category: 'upper', is_archived: false })
    expect((await ok(repos.templates.listExercises(copied.id))).map((te) => [te.exercise_id, te.target_sets])).toEqual([
      [bench.id, 3],
      [squat.id, 5],
    ])

    // The device's own history and preferences are untouched.
    expect((await ok(repos.workouts.listHistory())).map((h) => h.sets.length)).toEqual([1])
    expect(await ok(repos.profile.get())).toMatchObject({ weight_unit: 'kg', height: 70 })
  })

  test('a history-only file adds workouts on top, freeform where the template is missing', async () => {
    await newExercise('Bench Press', { library_id: 'barbell-bench-press' })
    const w = await newWorkout()
    await ok(repos.workouts.insertSet(set(w.id, (await ok(repos.exercises.list()))[0].id, 100, 5)))

    const file = partialOf(supabaseBackup(), ['history'])
    expect((await repos.backup.merge(file)).error).toBeNull()
    expect(await counts()).toEqual({ exercises: 2, templates: 0, template_exercises: 0, workouts: 4, sets: 6, weigh_ins: 2 })
    const history = await ok(repos.workouts.listHistory())
    expect(history.every((h) => h.template_id === null)).toBe(true)
    // Renumbered from 0 in file order, as a full restore does.
    const first = history.find((h) => h.notes === 'Felt strong, "quoted"')!
    expect(first.sets.map((s) => [s.set_index, s.reps])).toEqual([[0, 8], [1, 6]])
  })

  test('a failed merge adds nothing', async () => {
    await newExercise('Squat')
    const before = await counts()
    const bad = partialOf(supabaseBackup(), ['history'])
    bad.sets[2] = { ...bad.sets[2], reps: -1 }
    expect((await repos.backup.merge(bad)).error?.code).toBe('23514')
    expect(await counts()).toEqual(before)
  })

  test('preferences round-trip through a full backup and a preferences-only file', async () => {
    await repos.profile.update({
      height: 180,
      height_unit: 'cm',
      missing_weight_prompt_opt_out: true,
      weight_reminder: 'weekly',
      weight_unit: 'kg',
      prefill_mode: 'blank',
      default_rest_seconds: 150,
      plates_kg: [20, 10, 5],
    })
    const prefs = await ok(repos.profile.get())
    const full = await backupOf(repos)
    expect(full.profile).toMatchObject({ weight_unit: 'kg', prefill_mode: 'blank', default_rest_seconds: 150 })

    const other = createSqliteRepos(openSqlJsDb, { now: () => clock })
    expect((await other.backup.restore(full)).error).toBeNull()
    expect(await ok(other.profile.get())).toEqual(prefs)

    // Preferences only: the profile changes, the rows don't.
    const third = createSqliteRepos(openSqlJsDb, { now: () => clock })
    await third.exercises.create(exercise('Keep Me'))
    expect((await third.backup.merge(partialOf(full, ['preferences']))).error).toBeNull()
    expect(await ok(third.profile.get())).toEqual(prefs)
    expect((await ok(third.exercises.list())).map((e) => e.name)).toEqual(['Keep Me'])

    // A v1 file has none of the v2 preferences, so a restore leaves them be.
    expect((await third.backup.restore(supabaseBackup())).error).toBeNull()
    expect(await ok(third.profile.get())).toMatchObject({ weight_unit: 'kg', prefill_mode: 'blank', default_rest_seconds: 150, height: 180 })
  })

  // Issue #95 follow-ups from merging a real account's templates.
  test('a templates-only file leaves out archived templates and exercises nothing uses', () => {
    const file = supabaseBackup()
    // Old Curl is archived but a kept template uses it, so it stays.
    file.workout_template_exercises.push({ id: 'te-4', template_id: 'tp-push', exercise_id: 'ex-curl', position: 2, target_sets: 2 })
    file.exercises.push({ ...file.exercises[1], id: 'ex-junk', name: 'Archived Junk' })
    const picked = selectBackupRows(file, ['templates'])
    expect(picked.workout_templates.map((t) => t.name)).toEqual(['Push'])
    expect(picked.workout_template_exercises.map((r) => r.id)).toEqual(['te-1', 'te-dangling', 'te-4'])
    expect(picked.exercises.map((e) => e.name)).toEqual(['Bench Press', 'Old Curl'])
    expect(picked.workouts).toEqual([])

    // With history every template stays (old workouts point at them), and a
    // full backup keeps everything.
    expect(selectBackupRows(file, ['templates', 'history']).workout_templates).toHaveLength(2)
    expect(selectBackupRows(file, ['preferences', 'templates', 'history']).exercises).toHaveLength(3)
    // History alone: just the exercises its sets use.
    expect(selectBackupRows(file, ['history']).exercises.map((e) => e.name)).toEqual(['Bench Press', 'Old Curl'])
  })

  test('an identical template is skipped, and an archived one with the name does not clash', async () => {
    const bench = await newExercise('Bench Press', { library_id: 'barbell-bench-press' })
    const push = (await ok(repos.templates.create('Push')))!
    await ok(repos.templates.addExercise({ template_id: push.id, exercise_id: bench.id, position: 0, target_sets: 3 }))
    const oldArms = (await ok(repos.templates.create('Old Arms')))!
    await repos.templates.update(oldArms.id, { is_archived: true })
    const legs = (await ok(repos.templates.create('Legs')))!
    await repos.templates.update(legs.id, { is_archived: true })

    const file = partialOf(supabaseBackup(), ['templates', 'history'])
    file.workout_templates[1] = { ...file.workout_templates[1], is_archived: false }
    file.workout_templates.push({ id: 'tp-legs', name: 'Legs', is_archived: false, category: null })
    const { error } = await repos.backup.merge(file)
    expect(error).toBeNull()

    const templates = await ok(repos.templates.list())
    expect(templates.map((t) => [t.name, t.is_archived])).toEqual([
      ['Legs', true],
      ['Legs', false],
      ['Old Arms', true],
      ['Old Arms', false],
      ['Push', false],
    ])
    // The skipped Push's workout points at the one already here.
    const history = await ok(repos.workouts.listHistory())
    expect(history.find((h) => h.notes === 'Felt strong, "quoted"')!.template_id).toBe(push.id)

    // Merging the same file again adds no templates.
    expect((await repos.backup.merge(file)).error).toBeNull()
    expect(await ok(repos.templates.list())).toHaveLength(5)

    // A suffixed copy counts too: "Push (2)" from a different Push is a
    // copy of the file's, so merging that file again adds no "Push (3)".
    const other = partialOf(supabaseBackup(), ['templates'])
    other.workout_template_exercises[0] = { ...other.workout_template_exercises[0], target_sets: 5 }
    expect((await repos.backup.merge(other)).error).toBeNull()
    expect((await repos.backup.merge(other)).error).toBeNull()
    expect((await ok(repos.templates.list())).map((t) => t.name).filter((n) => n.startsWith('Push'))).toEqual(['Push', 'Push (2)'])
  })

  test('a reused archived exercise comes back, and only its blank fields are filled', async () => {
    const bench = await newExercise('Bench Press', { library_id: 'barbell-bench-press', rest_seconds: 60 })
    await repos.exercises.update(bench.id, { is_archived: true })
    const curl = await newExercise('old curl')
    await repos.exercises.update(curl.id, { is_archived: true })

    expect((await repos.backup.merge(partialOf(supabaseBackup(), ['templates']))).error).toBeNull()

    const exercises = await ok(repos.exercises.list())
    expect(exercises).toHaveLength(2)
    const benchAfter = exercises.find((e) => e.id === bench.id)!
    // Unarchived; notes, muscle group, and rep range filled; rest kept at 60.
    expect(benchAfter).toMatchObject({
      is_archived: false,
      rest_seconds: 60,
      setup_notes: 'Bench at notch 3',
      muscle_group: 'chest',
      also_works: ['arms', 'shoulders'],
      rep_range_min: 5,
      rep_range_max: 8,
      uses_barbell: true,
      bar_type: 'standard',
    })
    // Old Curl is archived in the file too, and only an archived template
    // uses it, so it stays archived.
    expect(exercises.find((e) => e.id === curl.id)).toMatchObject({ is_archived: true, muscle_group: 'arms' })
  })
})
