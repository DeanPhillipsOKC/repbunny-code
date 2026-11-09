import { test, expect } from '@playwright/test'
import { openSqlJsDb } from './fixtures/sqljs'
import type { SqlDb } from '../src/data/sqlite/db'
import { essentialReads } from '../src/data/sqlite/essentialReads'
import { createSqliteRepos } from '../src/data/sqlite/repos'
import { createRestorePointStore, RESTORE_POINT_LIMIT, snapshotDatabase } from '../src/data/sqlite/restorePoints'
import { MIGRATIONS, MigrationCheckError, migrate, SCHEMA_VERSION } from '../src/data/sqlite/schema'

// Issue #430: updates must never lose anyone's lifting history. Runs on
// sql.js in Playwright's Node process, like sqlite-adapter-unit.spec.ts.
// - Upgrade from every version: a realistic user seeded at each schema
//   version survives the migration to the latest, row for row. New
//   migrations are covered automatically, since it loops over MIGRATIONS.
// - Fault injection: a version that loses rows, breaks a foreign key, throws
//   halfway, or leaves the app unable to read rolls back and throws
//   MigrationCheckError.
// - Restore points: the gzipped store, its limit, and the pre-update
//   snapshot restoring into the latest schema.

// A database at `version`, built the way an older app built it.
async function databaseAt(version: number): Promise<SqlDb> {
  const db = await openSqlJsDb({ migrated: false })
  await db.run('CREATE TABLE schema_version (version INTEGER NOT NULL)')
  for (const [i, statements] of MIGRATIONS.slice(0, version).entries()) {
    for (const statement of statements) await db.run(statement)
    await db.run('INSERT INTO schema_version (version) VALUES (?)', [i + 1])
  }
  return db
}

const day = (n: number, hour = 18) => new Date(Date.UTC(2026, 5, 1 + n, hour)).toISOString()

// Several workouts with sets (RPE, a timed exercise, notes), two routines,
// weigh-ins, and whatever each later version added a column for.
async function seedUser(db: SqlDb, version: number) {
  await db.run(`UPDATE settings SET height = 70, height_unit = 'in', weight_unit = 'lb', prefill_mode = 'next_target' WHERE id = 1`)
  await db.run(`INSERT INTO exercises (id, name, rest_seconds, muscle_group, also_works, uses_barbell, bar_type, rep_range_min, rep_range_max)
    VALUES ('ex-bench', 'Bench Press', 120, 'chest', '["arms","shoulders"]', 1, 'standard', 5, 8)`)
  await db.run(`INSERT INTO exercises (id, name, muscle_group, setup_notes) VALUES ('ex-row', 'Seated Cable Row (wide grip, long name)', 'back', 'Seat 4, chest pad 2')`)
  await db.run(`INSERT INTO exercises (id, name, load_type, muscle_group) VALUES ('ex-plank', 'Plank', 'timed', 'core')`)
  await db.run(`INSERT INTO exercises (id, name, load_type, is_archived) VALUES ('ex-old', 'Old Machine', 'level', 1)`)
  await db.run(`INSERT INTO workout_templates (id, name, category) VALUES ('t-push', 'Push day', 'upper'), ('t-core', 'Core', 'core')`)
  await db.run(`INSERT INTO workout_template_exercises (id, template_id, exercise_id, position, target_sets) VALUES
    ('te-1', 't-push', 'ex-bench', 0, 4), ('te-2', 't-push', 'ex-row', 1, 3), ('te-3', 't-core', 'ex-plank', 0, NULL)`)
  for (let w = 0; w < 6; w++) {
    const id = `w-${w}`
    await db.run('INSERT INTO workouts (id, template_id, performed_at, notes) VALUES (?, ?, ?, ?)', [
      id,
      w % 3 === 2 ? null : w % 2 ? 't-core' : 't-push',
      day(w * 2),
      w === 1 ? 'Felt strong, "new" grip' : null,
    ])
    for (let s = 0; s < 4; s++) {
      await db.run(
        `INSERT INTO sets (id, workout_id, exercise_id, set_index, reps, weight, weight_unit, rpe) VALUES (?, ?, 'ex-bench', ?, ?, ?, 'lb', ?)`,
        [`s-${w}-${s}`, id, s, 8 - s, 135 + w * 5, s === 3 ? 8.5 : null],
      )
    }
    await db.run(
      `INSERT INTO sets (id, workout_id, exercise_id, set_index, reps, weight, weight_unit, duration_seconds) VALUES (?, ?, 'ex-plank', 4, NULL, 0, 'lb', ?)`,
      [`s-${w}-plank`, id, 45 + w * 5],
    )
  }
  await db.run(`INSERT INTO sets (id, workout_id, exercise_id, set_index, reps, weight, weight_unit, level) VALUES ('s-old', 'w-0', 'ex-old', 5, 12, 0, 'kg', 7)`)
  await db.run(`INSERT INTO body_weight_entries (id, weight, weight_unit, recorded_at) VALUES ('bw-1', 182.4, 'lb', ?), ('bw-2', 81.2, 'kg', ?)`, [day(0, 7), day(7, 7)])

  if (version >= 2) await db.run('UPDATE settings SET default_rest_seconds = 90 WHERE id = 1')
  if (version >= 3) await db.run(`INSERT INTO exercises (id, name, rest_seconds) VALUES ('ex-curl', 'Curl', 0)`)
  if (version >= 5) await db.run(`UPDATE workouts SET sleep = 'over_8', energy = 'high', stress = 'low' WHERE id = 'w-1'`)
  if (version >= 6) await db.run(`INSERT INTO body_measurements (id, unit, waist, chest, recorded_at) VALUES ('bm-1', 'in', 33.5, 41, ?)`, [day(3, 7)])
  if (version >= 7) await db.run(`UPDATE workouts SET events = ? WHERE id = 'w-2'`, [JSON.stringify([{ type: 'finished_early', at: day(4, 19) }])])
  if (version >= 8) await db.run(`UPDATE exercises SET push_pull = 'push' WHERE id = 'ex-bench'`)
  if (version >= 9) await db.run(`UPDATE workouts SET finished_at = ? WHERE id = 'w-0'`, [day(0, 19)])
}

const DATA_TABLES = [
  'settings',
  'exercises',
  'workout_templates',
  'workout_template_exercises',
  'workouts',
  'sets',
  'body_weight_entries',
  'body_measurements',
  'schema_version',
]

// Every row of every table, as the database has it now.
async function dump(db: SqlDb): Promise<Record<string, Record<string, unknown>[]>> {
  const out: Record<string, Record<string, unknown>[]> = {}
  for (const table of DATA_TABLES) {
    const exists = await db.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table])
    if (exists.length) out[table] = await db.query(`SELECT * FROM ${table} ORDER BY rowid`)
  }
  return out
}

test('every older schema version upgrades to the latest with every row intact', async () => {
  expect(SCHEMA_VERSION).toBe(MIGRATIONS.length)
  for (let version = 1; version <= SCHEMA_VERSION; version++) {
    const db = await databaseAt(version)
    await seedUser(db, version)
    const before = await dump(db)
    const upgrades: [number, number][] = []

    await migrate(db, { essentialReads, beforeUpgrade: async (from, to) => void upgrades.push([from, to]) })

    expect(upgrades, `version ${version}`).toEqual(version < SCHEMA_VERSION ? [[version, SCHEMA_VERSION]] : [])
    const after = await dump(db)
    const [{ v }] = await db.query<{ v: number }>('SELECT MAX(version) AS v FROM schema_version')
    expect(v).toBe(SCHEMA_VERSION)
    for (const [table, rows] of Object.entries(before)) {
      if (table === 'schema_version') continue
      // Each seeded value is still there, unchanged; columns a later version
      // added come along beside them.
      expect(after[table], `${table} from version ${version}`).toHaveLength(rows.length)
      rows.forEach((row, i) => expect(after[table][i], `${table} row ${i} from version ${version}`).toMatchObject(row))
    }

    // And the app reads it the way it does on launch.
    const repos = createSqliteRepos(async () => db)
    const latest = await repos.workouts.getLatestWorkoutSets()
    expect(latest.error).toBeNull()
    expect(latest.data!.id).toBe('w-5')
    expect(latest.data!.sets).toHaveLength(5)
    const history = await repos.workouts.listHistory()
    expect(history.data).toHaveLength(6)
    const pushExercises = await repos.templates.listExercises('t-push')
    expect(pushExercises.data!.map((e) => e.exercise_id)).toEqual(['ex-bench', 'ex-row'])
  }
})

// A latest-version database with a user in it, plus one more test-only
// version that does `statements`.
async function faultyUpgrade(statements: string[], expectedCounts?: Parameters<typeof migrate>[1]['expectedCounts']) {
  const db = await databaseAt(SCHEMA_VERSION)
  await seedUser(db, SCHEMA_VERSION)
  const before = await dump(db)
  const run = migrate(db, { migrations: [...MIGRATIONS, statements], expectedCounts, essentialReads })
  return { db, before, run }
}

async function expectRolledBack(statements: string[], check: string) {
  const { db, before, run } = await faultyUpgrade(statements)
  const error = await run.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, `${check} should fail`).toBeInstanceOf(MigrationCheckError)
  expect((error as MigrationCheckError).check).toBe(check)
  expect((error as MigrationCheckError).version).toBe(SCHEMA_VERSION + 1)
  expect((error as MigrationCheckError).fromVersion).toBe(SCHEMA_VERSION)
  expect(await dump(db)).toEqual(before)
}

test('a version that deletes sets rolls back', async () => {
  await expectRolledBack(['DELETE FROM sets WHERE rowid IN (SELECT rowid FROM sets ORDER BY rowid LIMIT 3)'], 'row-counts')
})

test('a version that breaks a foreign key rolls back', async () => {
  await expectRolledBack(
    ['PRAGMA defer_foreign_keys = ON', "UPDATE sets SET exercise_id = 'missing' WHERE id = 's-0-0'"],
    'foreign-keys',
  )
})

test('a version that throws halfway rolls back what it already did', async () => {
  await expectRolledBack(['DELETE FROM sets', 'UPDATE workouts SET notes = NULL', 'INSERT INTO no_such_table VALUES (1)'], 'apply')
})

test('a version that leaves the app unable to read its data rolls back', async () => {
  await expectRolledBack(['DROP TABLE settings'], 'essential-reads')
})

test('a version can declare the row counts it means to change', async () => {
  const { db, run } = await faultyUpgrade(["DELETE FROM sets WHERE id = 's-old'"], {
    [SCHEMA_VERSION + 1]: (before) => ({ ...before, sets: before.sets! - 1 }),
  })
  await run
  const [{ v }] = await db.query<{ v: number }>('SELECT MAX(version) AS v FROM schema_version')
  expect(v).toBe(SCHEMA_VERSION + 1)
})

test('a fresh install takes no pre-update restore point', async () => {
  const db = await openSqlJsDb({ migrated: false })
  let called = false
  await migrate(db, { essentialReads, beforeUpgrade: async () => void (called = true) })
  expect(called).toBe(false)
})

test('restore points keep the newest ten, gzipped, and load back intact', async () => {
  const store = await openSqlJsDb({ migrated: false })
  let clock = Date.UTC(2026, 9, 1)
  let n = 0
  const points = createRestorePointStore(async () => store, { now: () => new Date((clock += 60_000)), newId: () => `rp-${++n}` })
  const source = await databaseAt(SCHEMA_VERSION)
  await seedUser(source, SCHEMA_VERSION)
  const backup = await source.transaction((tx) => snapshotDatabase(tx, new Date('2026-10-01T12:00:00.000Z')))

  for (let i = 1; i <= RESTORE_POINT_LIMIT + 2; i++) await points.save('workout', `After workout ${i}`, backup)
  const list = await points.list()
  expect(list).toHaveLength(RESTORE_POINT_LIMIT)
  expect(list[0]).toMatchObject({ id: 'rp-12', kind: 'workout', label: 'After workout 12', workouts: 6 })
  expect(list.at(-1)!.label).toBe('After workout 3')
  expect(await points.load('rp-1')).toBeNull()

  // Stored compressed, not as plain JSON.
  const [{ data }] = await store.query<{ data: string }>("SELECT data FROM restore_points WHERE id = 'rp-12'")
  expect(data.length).toBeLessThan(JSON.stringify(backup).length / 3)
  expect(await points.load('rp-12')).toEqual(backup)
})

test('restore points still save and load where CompressionStream is missing (iOS 15.0 to 16.3)', async () => {
  const store = await openSqlJsDb({ migrated: false })
  const points = createRestorePointStore(async () => store, { newId: () => 'rp-plain' })
  const source = await databaseAt(SCHEMA_VERSION)
  await seedUser(source, SCHEMA_VERSION)
  const backup = await source.transaction((tx) => snapshotDatabase(tx, new Date('2026-10-01T12:00:00.000Z')))
  const g = globalThis as { CompressionStream?: unknown; DecompressionStream?: unknown }
  const saved = { c: g.CompressionStream, d: g.DecompressionStream }
  delete g.CompressionStream
  delete g.DecompressionStream
  try {
    await points.save('workout', 'After Push day', backup)
    expect(await points.load('rp-plain')).toEqual(backup)
  } finally {
    g.CompressionStream = saved.c
    g.DecompressionStream = saved.d
  }
  // A later load on a device that has the streams still reads it.
  expect(await points.load('rp-plain')).toEqual(backup)
})

test('a restore point taken before an update restores into the latest schema', async () => {
  const old = await databaseAt(4)
  await seedUser(old, 4)
  const snapshot = await old.transaction((tx) => snapshotDatabase(tx))
  expect(snapshot.workouts).toHaveLength(6)
  expect(snapshot.sets).toHaveLength(31)
  expect(snapshot.profile).toMatchObject({ height: 70, default_rest_seconds: 90 })

  const store = await openSqlJsDb({ migrated: false })
  const points = createRestorePointStore(async () => store)
  await points.save('update', 'Before update to 1.4.0', snapshot)
  const [summary] = await points.list()
  expect(summary).toMatchObject({ kind: 'update', label: 'Before update to 1.4.0', workouts: 6 })

  const fresh = await openSqlJsDb()
  const repos = createSqliteRepos(async () => fresh)
  expect((await repos.backup.restore((await points.load(summary.id))!)).error).toBeNull()
  const history = (await repos.workouts.listHistory()).data!
  expect(history).toHaveLength(6)
  expect(history.flatMap((w) => w.sets)).toHaveLength(31)
  expect(history.find((w) => w.notes)?.notes).toBe('Felt strong, "new" grip')
  const plank = history[0].sets.find((s) => s.duration_seconds)
  expect(plank?.duration_seconds).toBe(70)
  expect((await repos.profile.get()).data).toMatchObject({ height: 70, default_rest_seconds: 90 })
})
