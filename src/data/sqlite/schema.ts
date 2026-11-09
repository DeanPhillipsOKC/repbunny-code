import type { SqlDb, SqlExecutor } from './db'
import { NEW_USER_REST_SECONDS } from '../../lib/restDefault'

// Issue #75: the on-device schema. It started as the retired PWA's Postgres
// schema with the multi-user parts taken out: no user_id columns, no
// row-level security, and the profile row becomes the single `settings` row
// (id is always 1). Since #940 this file is the only schema.
//
// Differences from Postgres, handled in repos.ts:
// - Booleans are INTEGER 0/1.
// - Arrays (also_works, plates_lb, plates_kg) are JSON text.
// - Timestamps are ISO 8601 text, always written as `Date#toISOString()`
//   (UTC, millisecond precision) so text order is time order.
// - The set_index trigger becomes a subquery in the insert itself.
// - also_works isn't checked against the muscle group list here (that would
//   need SQLite's JSON functions); the app only ever writes valid values.
//
// Each entry in MIGRATIONS moves the database up one version. Never edit a
// shipped entry: add a new one, so a device on any older version upgrades
// in order. `schema_version` holds the version the database is at.

export const MIGRATIONS: string[][] = [
  // Version 1.
  [
    `CREATE TABLE settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      height REAL CHECK (height IS NULL OR height > 0),
      height_unit TEXT CHECK (height_unit IN ('in', 'cm')),
      missing_weight_prompt_opt_out INTEGER NOT NULL DEFAULT 0 CHECK (missing_weight_prompt_opt_out IN (0, 1)),
      weight_reminder TEXT NOT NULL DEFAULT 'monthly' CHECK (weight_reminder IN ('weekly', 'monthly', 'off')),
      plates_lb TEXT NOT NULL DEFAULT '[45,35,25,10,5,2.5]',
      plates_kg TEXT NOT NULL DEFAULT '[25,20,15,10,5,2.5,1.25]',
      weight_unit TEXT CHECK (weight_unit IN ('lb', 'kg')),
      prefill_mode TEXT NOT NULL DEFAULT 'last_time' CHECK (prefill_mode IN ('last_time', 'next_target', 'blank'))
    )`,
    `INSERT INTO settings (id) VALUES (1)`,

    `CREATE TABLE exercises (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
      setup_notes TEXT,
      rest_seconds INTEGER CHECK (rest_seconds > 0),
      load_type TEXT NOT NULL DEFAULT 'weight' CHECK (load_type IN ('weight', 'level', 'bodyweight', 'assisted', 'timed')),
      tracks_distance INTEGER NOT NULL DEFAULT 0 CHECK (tracks_distance IN (0, 1)),
      tracks_incline INTEGER NOT NULL DEFAULT 0 CHECK (tracks_incline IN (0, 1)),
      tracks_level INTEGER NOT NULL DEFAULT 0 CHECK (tracks_level IN (0, 1)),
      tracks_calories INTEGER NOT NULL DEFAULT 0 CHECK (tracks_calories IN (0, 1)),
      muscle_group TEXT CHECK (muscle_group IN ('chest', 'back', 'shoulders', 'arms', 'core', 'glutes', 'legs', 'cardio')),
      also_works TEXT NOT NULL DEFAULT '[]',
      library_id TEXT,
      uses_barbell INTEGER CHECK (uses_barbell IN (0, 1)),
      bar_type TEXT CHECK (bar_type IN ('standard', 'womens', 'ez', 'custom')),
      bar_custom_weight REAL CHECK (bar_custom_weight IS NULL OR bar_custom_weight > 0),
      bar_custom_unit TEXT CHECK (bar_custom_unit IN ('lb', 'kg')),
      weight_step REAL CHECK (weight_step > 0),
      weight_step_unit TEXT CHECK (weight_step_unit IN ('lb', 'kg')),
      rep_range_min INTEGER,
      rep_range_max INTEGER,
      CHECK (
        (rep_range_min IS NULL AND rep_range_max IS NULL)
        OR (rep_range_min >= 1 AND rep_range_max > rep_range_min AND rep_range_max <= 30)
      )
    )`,

    `CREATE TABLE workout_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
      category TEXT CHECK (category IN ('upper', 'lower', 'full', 'cardio', 'core', 'other'))
    )`,

    `CREATE TABLE workout_template_exercises (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      position INTEGER NOT NULL,
      target_sets INTEGER CHECK (target_sets > 0)
    )`,
    `CREATE INDEX workout_template_exercises_template_id ON workout_template_exercises (template_id, position)`,

    `CREATE TABLE workouts (
      id TEXT PRIMARY KEY,
      template_id TEXT REFERENCES workout_templates(id),
      performed_at TEXT NOT NULL,
      notes TEXT
    )`,
    `CREATE INDEX workouts_performed_at ON workouts (performed_at)`,
    `CREATE INDEX workouts_template_id ON workouts (template_id, performed_at)`,

    `CREATE TABLE sets (
      id TEXT PRIMARY KEY,
      workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      exercise_id TEXT NOT NULL REFERENCES exercises(id),
      set_index INTEGER NOT NULL,
      reps INTEGER CHECK (reps IS NULL OR reps > 0),
      weight REAL NOT NULL CHECK (weight >= 0),
      weight_unit TEXT NOT NULL CHECK (weight_unit IN ('lb', 'kg')),
      rpe REAL,
      level INTEGER CHECK (level IS NULL OR level > 0),
      duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
      distance REAL CHECK (distance IS NULL OR distance >= 0),
      distance_unit TEXT CHECK (distance_unit IN ('mi', 'km')),
      incline REAL CHECK (incline IS NULL OR incline >= 0),
      calories REAL CHECK (calories IS NULL OR calories >= 0)
    )`,
    `CREATE INDEX sets_workout_id ON sets (workout_id, set_index)`,
    `CREATE INDEX sets_exercise_id ON sets (exercise_id)`,

    `CREATE TABLE body_weight_entries (
      id TEXT PRIMARY KEY,
      weight REAL NOT NULL CHECK (weight > 0),
      weight_unit TEXT NOT NULL CHECK (weight_unit IN ('lb', 'kg')),
      recorded_at TEXT NOT NULL
    )`,
    `CREATE INDEX body_weight_entries_recorded_at ON body_weight_entries (recorded_at)`,
  ],
  // Version 2. Issue #90: default rest timer.
  [`ALTER TABLE settings ADD COLUMN default_rest_seconds INTEGER CHECK (default_rest_seconds IS NULL OR default_rest_seconds > 0)`],
  // Version 3. Issue #90 follow-up: rest_seconds 0 means no timer for that
  // exercise. SQLite can't alter a CHECK, so the column is swapped for one
  // with the new check (DROP COLUMN needs SQLite 3.35+).
  [
    `ALTER TABLE exercises ADD COLUMN rest_seconds_new INTEGER CHECK (rest_seconds_new >= 0)`,
    `UPDATE exercises SET rest_seconds_new = rest_seconds`,
    `ALTER TABLE exercises DROP COLUMN rest_seconds`,
    `ALTER TABLE exercises RENAME COLUMN rest_seconds_new TO rest_seconds`,
  ],
  // Version 4. Issue #83: the client error log. repos.ts keeps the newest
  // CLIENT_ERROR_LIMIT rows; nothing here ever leaves the device.
  [
    `CREATE TABLE client_errors (
      id TEXT PRIMARY KEY,
      occurred_at TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('error', 'rejection', 'request')),
      message TEXT NOT NULL,
      stack TEXT,
      route TEXT,
      context TEXT,
      app_version TEXT,
      user_agent TEXT
    )`,
    `CREATE INDEX client_errors_occurred_at ON client_errors (occurred_at)`,
  ],
  // Version 5. Issue #149: "How did it feel?" tags on a workout.
  [
    `ALTER TABLE workouts ADD COLUMN sleep TEXT CHECK (sleep IN ('under_6', '6_to_8', 'over_8'))`,
    `ALTER TABLE workouts ADD COLUMN energy TEXT CHECK (energy IN ('low', 'ok', 'high'))`,
    `ALTER TABLE workouts ADD COLUMN stress TEXT CHECK (stress IN ('low', 'ok', 'high'))`,
  ],
  // Version 6. Issue #139: tape measurements next to weigh-ins.
  [
    `CREATE TABLE body_measurements (
      id TEXT PRIMARY KEY,
      unit TEXT NOT NULL CHECK (unit IN ('in', 'cm')),
      waist REAL CHECK (waist IS NULL OR waist > 0),
      chest REAL CHECK (chest IS NULL OR chest > 0),
      hips REAL CHECK (hips IS NULL OR hips > 0),
      arms REAL CHECK (arms IS NULL OR arms > 0),
      thighs REAL CHECK (thighs IS NULL OR thighs > 0),
      neck REAL CHECK (neck IS NULL OR neck > 0),
      recorded_at TEXT NOT NULL,
      CHECK (COALESCE(waist, chest, hips, arms, thighs, neck) IS NOT NULL)
    )`,
    `CREATE INDEX body_measurements_recorded_at ON body_measurements (recorded_at)`,
  ],
  // Version 7. Issue #158: a workout's story (swaps, skips, early finish), as
  // JSON text. Shape in src/lib/workoutEvents.ts.
  [`ALTER TABLE workouts ADD COLUMN events TEXT`],
  // Version 8. Issue #173: push or pull per exercise, for Balance.
  [`ALTER TABLE exercises ADD COLUMN push_pull TEXT CHECK (push_pull IN ('push', 'pull', 'neither'))`],
  // Version 9. Issue #266: when the workout was finished, for its length.
  [`ALTER TABLE workouts ADD COLUMN finished_at TEXT`],
  // Version 10. Issue #462: workouts the importer added, so their milestones
  // can show as "Before RepBunny".
  [`ALTER TABLE workouts ADD COLUMN imported INTEGER NOT NULL DEFAULT 0`],
  // Version 11. Issue #535: a note on one exercise for one workout, apart
  // from its setup notes.
  [
    `CREATE TABLE workout_exercise_notes (
      workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
      exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 500),
      PRIMARY KEY (workout_id, exercise_id)
    )`,
    `CREATE INDEX workout_exercise_notes_exercise_id ON workout_exercise_notes (exercise_id)`,
  ],
]

export const SCHEMA_VERSION = MIGRATIONS.length

// Issue #430: the tables whose row counts a migration must keep, unless it
// says otherwise in EXPECTED_COUNTS.
export const COUNTED_TABLES = ['workouts', 'sets', 'exercises', 'workout_templates', 'workout_template_exercises'] as const
export type CountedTable = (typeof COUNTED_TABLES)[number]
export type TableCounts = Partial<Record<CountedTable, number>>

// A migration that's meant to change a counted table's rows (a dedupe, say)
// adds an entry here, keyed by its version: given the counts before it ran,
// it returns the counts it should leave. Every other version must leave
// them exactly as they were.
export const EXPECTED_COUNTS: Record<number, (before: TableCounts) => TableCounts> = {}

export type MigrationCheck = 'apply' | 'quick-check' | 'foreign-keys' | 'row-counts' | 'essential-reads'

// Thrown when a version failed to apply or failed a check before it
// committed. The version was rolled back, so the database is still at
// `fromVersion`.
export class MigrationCheckError extends Error {
  readonly check: MigrationCheck
  readonly version: number
  readonly fromVersion: number
  constructor(check: MigrationCheck, version: number, fromVersion: number, detail: string) {
    super(`Update to schema ${version} failed its ${check} check: ${detail}`)
    this.name = 'MigrationCheckError'
    this.check = check
    this.version = version
    this.fromVersion = fromVersion
  }
}

export interface MigrateOptions {
  // Tests add a faulty version to this; the app always uses MIGRATIONS.
  migrations?: string[][]
  expectedCounts?: Record<number, (before: TableCounts) => TableCounts>
  // Runs before the first version applies, when the database already has a
  // schema (not on a fresh install). The app saves a restore point here.
  beforeUpgrade?: (from: number, to: number) => Promise<void>
  // The reads the app makes on launch, run inside the last version's
  // transaction (essentialReads.ts). They name the latest columns, so they
  // can't run against the versions in between.
  essentialReads?: (tx: SqlExecutor) => Promise<void>
}

async function tableExists(tx: SqlExecutor, table: string): Promise<boolean> {
  const rows = await tx.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table])
  return rows.length > 0
}

async function countRows(tx: SqlExecutor): Promise<TableCounts> {
  const counts: TableCounts = {}
  for (const table of COUNTED_TABLES) {
    if (!(await tableExists(tx, table))) continue
    const [row] = await tx.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)
    counts[table] = Number(row?.n ?? 0)
  }
  return counts
}

async function quickCheck(tx: SqlExecutor): Promise<string> {
  const rows = await tx.query<Record<string, unknown>>('PRAGMA quick_check')
  return rows.map((row) => String(Object.values(row)[0])).join('; ')
}

async function foreignKeyProblems(tx: SqlExecutor): Promise<Set<string>> {
  const rows = await tx.query<Record<string, unknown>>('PRAGMA foreign_key_check')
  return new Set(rows.map((row) => `${row.table} row ${row.rowid} -> ${row.parent}`))
}

// Brings the database up to the latest version, one transaction per version,
// so a failed step leaves it at the last version that fully applied.
// Issue #430: each version is checked before it commits (integrity, foreign
// keys, row counts, and on the last one the app's launch reads), and any
// failure rolls it back and throws MigrationCheckError. The integrity and
// foreign key checks fail only on problems the version itself caused, so a
// device with an old quirk still opens.
export async function migrate(db: SqlDb, options: MigrateOptions = {}): Promise<void> {
  const migrations = options.migrations ?? MIGRATIONS
  const expectedCounts = options.expectedCounts ?? EXPECTED_COUNTS
  const target = migrations.length
  await db.run('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  const [row] = await db.query<{ version: number | null }>('SELECT MAX(version) AS version FROM schema_version')
  const current = row?.version ?? 0
  if (current > target) {
    throw new Error(`This database is from a newer version of RepBunny (schema ${current}). Update the app.`)
  }
  if (current === target) return
  if (current > 0) await options.beforeUpgrade?.(current, target)

  for (let version = current + 1; version <= target; version++) {
    const fail = (check: MigrationCheck, detail: string) => new MigrationCheckError(check, version, version - 1, detail)
    await db.transaction(async (tx) => {
      const integrityBefore = await quickCheck(tx)
      const fkBefore = await foreignKeyProblems(tx)
      const countsBefore = await countRows(tx)

      try {
        for (const statement of migrations[version - 1]) await tx.run(statement)
        // Issue #429: a brand-new database (a new install) starts with the
        // 2:00 default rest. Done here rather than as a column default so an
        // existing install's empty default stays empty.
        if (current === 0 && version === target && migrations === MIGRATIONS) {
          await tx.run('UPDATE settings SET default_rest_seconds = ? WHERE id = 1', [NEW_USER_REST_SECONDS])
        }
      } catch (e) {
        throw fail('apply', e instanceof Error ? e.message : String(e))
      }

      const integrity = await quickCheck(tx)
      if (integrity !== 'ok' && integrity !== integrityBefore) throw fail('quick-check', integrity)

      const newProblems = [...(await foreignKeyProblems(tx))].filter((problem) => !fkBefore.has(problem))
      if (newProblems.length > 0) throw fail('foreign-keys', newProblems.slice(0, 5).join(', '))

      const countsAfter = await countRows(tx)
      const expected = expectedCounts[version]?.(countsBefore) ?? countsBefore
      for (const table of COUNTED_TABLES) {
        if (expected[table] === undefined) continue
        if (countsAfter[table] !== expected[table]) {
          throw fail('row-counts', `${table} has ${countsAfter[table] ?? 'no'} rows, expected ${expected[table]}`)
        }
      }

      if (version === target && options.essentialReads) {
        try {
          await options.essentialReads(tx)
        } catch (e) {
          throw fail('essential-reads', e instanceof Error ? e.message : String(e))
        }
      }

      await tx.run('INSERT INTO schema_version (version) VALUES (?)', [version])
    })
  }
}
