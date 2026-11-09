import type { BackupFile, BackupTable } from '../../lib/backup'
import { existingDataFrom, planMerge, profilePatchFrom, V2_PROFILE_KEYS } from '../../lib/backupMerge'
import type { ExerciseHistoryWorkout } from '../../lib/exerciseHistory'
import { combineExerciseNotes } from '../../lib/exerciseNotes'
import type { PriorSet, RecapWorkoutSummary } from '../../lib/finishRecap'
import type { ProgressSetRow } from '../../lib/progressHub'
import type { FeelWorkoutRow } from '../../lib/workoutFeel'
import { remapWorkoutEvents } from '../../lib/workoutEvents'
import { NEW_USER_REST_SECONDS } from '../../lib/restDefault'
import type {
  BodyMeasurement,
  BodyWeightEntry,
  Exercise,
  SetEntry,
  SetWithExercise,
  TemplateExerciseWithName,
  Workout,
  WorkoutTemplate,
  WorkoutTemplateExercise,
  WorkoutWithSets,
} from '../../lib/types'
import type {
  BackupRepo,
  BodyMeasurementsRepo,
  BodyWeightRepo,
  ClientErrorEntry,
  ClientErrorsRepo,
  DataError,
  ExercisesRepo,
  ProfileRepo,
  ProfileSettings,
  Repos,
  SetMarkerRow,
  TemplatesRepo,
  WorkoutEventsRow,
  WorkoutNotesRow,
  WorkoutsRepo,
} from '../types'
import { toDataError, type Row, type SqlDb, type SqlExecutor, type SqlValue } from './db'

// Issue #75: the app's data adapter. Every method returns the shapes in
// ../types.ts, embedded selects included: the joins happen in SQL and the
// nesting in JS. There's one user, so rows
// carry a fixed `user_id` of LOCAL_USER_ID to match the shared types.

export const LOCAL_USER_ID = 'local'

// Issue #83: how many client_errors rows the device keeps.
export const CLIENT_ERROR_LIMIT = 200

export type TableName = BackupTable | 'settings'

interface TableSpec {
  columns: readonly string[]
  booleans?: readonly string[]
  json?: readonly string[]
  timestamps?: readonly string[]
  // Rows that carry user_id on Supabase.
  owned?: boolean
}

// Exported, with encode and decode, for e2e/fixtures/local.ts's table shim
// (#415), which seeds and reads the local database.
export const TABLES: Record<TableName, TableSpec> = {
  settings: {
    columns: ['height', 'height_unit', 'missing_weight_prompt_opt_out', 'weight_reminder', 'plates_lb', 'plates_kg', 'weight_unit', 'prefill_mode', 'default_rest_seconds'],
    booleans: ['missing_weight_prompt_opt_out'],
    json: ['plates_lb', 'plates_kg'],
  },
  exercises: {
    columns: [
      'id', 'name', 'is_archived', 'setup_notes', 'rest_seconds', 'load_type',
      'tracks_distance', 'tracks_incline', 'tracks_level', 'tracks_calories',
      'muscle_group', 'also_works', 'library_id', 'uses_barbell', 'bar_type',
      'bar_custom_weight', 'bar_custom_unit', 'weight_step', 'weight_step_unit',
      'rep_range_min', 'rep_range_max', 'push_pull',
    ],
    booleans: ['is_archived', 'tracks_distance', 'tracks_incline', 'tracks_level', 'tracks_calories', 'uses_barbell'],
    json: ['also_works'],
    owned: true,
  },
  workout_templates: {
    columns: ['id', 'name', 'is_archived', 'category'],
    booleans: ['is_archived'],
    owned: true,
  },
  workout_template_exercises: {
    columns: ['id', 'template_id', 'exercise_id', 'position', 'target_sets'],
  },
  workouts: {
    columns: ['id', 'template_id', 'performed_at', 'notes', 'sleep', 'energy', 'stress', 'events', 'finished_at', 'imported'],
    booleans: ['imported'],
    timestamps: ['performed_at', 'finished_at'],
    json: ['events'],
    owned: true,
  },
  sets: {
    columns: [
      'id', 'workout_id', 'exercise_id', 'set_index', 'reps', 'weight', 'weight_unit', 'rpe',
      'level', 'duration_seconds', 'distance', 'distance_unit', 'incline', 'calories',
    ],
  },
  body_weight_entries: {
    columns: ['id', 'weight', 'weight_unit', 'recorded_at'],
    timestamps: ['recorded_at'],
    owned: true,
  },
  body_measurements: {
    columns: ['id', 'unit', 'waist', 'chest', 'hips', 'arms', 'thighs', 'neck', 'recorded_at'],
    timestamps: ['recorded_at'],
    owned: true,
  },
  // Issue #535: keyed by (workout_id, exercise_id), no id.
  workout_exercise_notes: {
    columns: ['workout_id', 'exercise_id', 'note'],
  },
}

// Normalizes any timestamp the app hands in, so text comparison stays time
// comparison (schema.ts).
export function toTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`Not a valid date: ${String(value)}`)
  return date.toISOString()
}

export function encode(table: TableName, column: string, value: unknown): SqlValue {
  const spec = TABLES[table]
  if (value === null || value === undefined) return null
  if (spec.booleans?.includes(column)) return value ? 1 : 0
  if (spec.json?.includes(column)) return JSON.stringify(value)
  if (spec.timestamps?.includes(column)) return toTimestamp(value as string)
  return value as SqlValue
}

export function decode<T>(table: TableName, row: Row): T {
  const spec = TABLES[table]
  const out: Row = {}
  for (const column of spec.columns) {
    if (!(column in row)) continue
    const value = row[column]
    if (value !== null && spec.booleans?.includes(column)) out[column] = value === 1 || value === true
    else if (value !== null && spec.json?.includes(column)) out[column] = JSON.parse(value as string)
    else out[column] = value
  }
  if (spec.owned) out.user_id = LOCAL_USER_ID
  return out as T
}

// Column names in SQL come only from TABLES, never from the caller, so a
// patch with a key the table doesn't have fails the way PostgREST would.
function columnsOf(table: TableName, values: Row): string[] {
  const keys = Object.keys(values).filter((key) => values[key] !== undefined && key !== 'user_id')
  const unknown = keys.find((key) => !TABLES[table].columns.includes(key))
  if (unknown) throw new Error(`Column "${unknown}" doesn't exist on ${table}`)
  return keys
}

async function insertRow(tx: SqlExecutor, table: TableName, values: Row): Promise<void> {
  const columns = columnsOf(table, values)
  await tx.run(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((column) => encode(table, column, values[column])),
  )
}

async function updateWhere(tx: SqlExecutor, table: TableName, patch: Row, where: string, params: SqlValue[]): Promise<void> {
  const columns = columnsOf(table, patch).filter((column) => column !== 'id')
  if (columns.length === 0) return
  await tx.run(
    `UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${where}`,
    [...columns.map((column) => encode(table, column, patch[column])), ...params],
  )
}

function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(', ')
}

// The `exercises(name, load_type)` embed, from columns aliased e_name and
// e_load_type by a LEFT JOIN.
function exerciseEmbed(row: Row): { name: string; load_type: Exercise['load_type'] } | null {
  return row.e_name === null || row.e_name === undefined
    ? null
    : { name: row.e_name as string, load_type: row.e_load_type as Exercise['load_type'] }
}

const SET_WITH_EXERCISE = `SELECT s.*, e.name AS e_name, e.load_type AS e_load_type
  FROM sets s LEFT JOIN exercises e ON e.id = s.exercise_id`

function setWithExercise(row: Row): SetWithExercise {
  return { ...decode<SetEntry>('sets', row), exercises: exerciseEmbed(row) }
}

// Every `DataError` path: a thrown error becomes the `{ data, error }`
// result Supabase would have returned.
async function attempt<T>(fallback: T, fn: () => Promise<T>): Promise<{ data: T; error: DataError | null }> {
  try {
    return { data: await fn(), error: null }
  } catch (e) {
    return { data: fallback, error: toDataError(e) }
  }
}

async function attemptWrite(fn: () => Promise<unknown>): Promise<{ error: DataError | null }> {
  const { error } = await attempt(null, fn)
  return { error }
}

export interface SqliteReposOptions {
  // The clock for new rows' timestamps. Tests pass their own.
  now?: () => Date
  newId?: () => string
}

// `openDb` runs once, on the first call any repo makes, so the adapter can be
// picked synchronously at startup and the database opened lazily.
export function createSqliteRepos(openDb: () => Promise<SqlDb>, options: SqliteReposOptions = {}): Repos {
  const now = () => (options.now ?? (() => new Date()))().toISOString()
  const newId = options.newId ?? (() => crypto.randomUUID())

  let opening: Promise<SqlDb> | null = null
  function db(): Promise<SqlDb> {
    opening ??= openDb().catch((e) => {
      opening = null
      throw e
    })
    return opening
  }

  async function one<T>(table: TableName, id: string): Promise<T | null> {
    const [row] = await (await db()).query(`SELECT * FROM ${table} WHERE id = ?`, [id])
    return row ? decode<T>(table, row) : null
  }

  // Supabase's `.single()` errors when the row isn't there.
  async function single<T>(table: TableName, id: string): Promise<T> {
    const row = await one<T>(table, id)
    if (!row) throw new Error(`No ${table} row with id ${id}`)
    return row
  }

  // Loads WorkoutWithSets for the given workout rows, keeping their order.
  async function withSets(workoutRows: Row[]): Promise<WorkoutWithSets[]> {
    if (workoutRows.length === 0) return []
    const ids = workoutRows.map((row) => row.id as string)
    const setRows = await (await db()).query(
      `${SET_WITH_EXERCISE} WHERE s.workout_id IN (${placeholders(ids)}) ORDER BY s.set_index`,
      ids,
    )
    const byWorkout = groupBy(setRows, (row) => row.workout_id as string)
    const noteRows = await (await db()).query(
      `SELECT workout_id, exercise_id, note FROM workout_exercise_notes WHERE workout_id IN (${placeholders(ids)})`,
      ids,
    )
    const notesByWorkout = groupBy(noteRows, (row) => row.workout_id as string)
    return workoutRows.map((row) => ({
      ...decode<Workout>('workouts', row),
      sets: (byWorkout.get(row.id as string) ?? []).map(setWithExercise),
      workout_templates: row.t_name === null || row.t_name === undefined ? null : { name: row.t_name as string },
      exercise_notes: (notesByWorkout.get(row.id as string) ?? []).map((n) => ({ exercise_id: n.exercise_id as string, note: n.note as string })),
    }))
  }

  const WORKOUT_WITH_TEMPLATE = `SELECT w.*, t.name AS t_name
    FROM workouts w LEFT JOIN workout_templates t ON t.id = w.template_id`

  // The SUMMARY_COLUMNS shape: id, performed_at, and each set's volume inputs.
  async function summaries(workoutRows: Row[]): Promise<RecapWorkoutSummary[]> {
    if (workoutRows.length === 0) return []
    const ids = workoutRows.map((row) => row.id as string)
    const setRows = await (await db()).query(
      `SELECT s.workout_id, s.reps, s.weight, s.weight_unit, s.duration_seconds, e.load_type AS e_load_type, e.muscle_group AS e_muscle_group
       FROM sets s LEFT JOIN exercises e ON e.id = s.exercise_id
       WHERE s.workout_id IN (${placeholders(ids)}) ORDER BY s.set_index`,
      ids,
    )
    const byWorkout = groupBy(setRows, (row) => row.workout_id as string)
    return workoutRows.map((row) => ({
      id: row.id as string,
      performed_at: row.performed_at as string,
      sets: (byWorkout.get(row.id as string) ?? []).map((s) => ({
        reps: s.reps as number | null,
        weight: s.weight as number,
        weight_unit: s.weight_unit as RecapWorkoutSummary['sets'][number]['weight_unit'],
        duration_seconds: s.duration_seconds as number | null,
        exercises: s.e_load_type === null ? null : { load_type: s.e_load_type as Exercise['load_type'], muscle_group: s.e_muscle_group as Exercise['muscle_group'] },
      })),
    }))
  }

  const profile: ProfileRepo = {
    get() {
      return attempt(null, async () => {
        const [row] = await (await db()).query('SELECT * FROM settings WHERE id = 1')
        if (!row) throw new Error('The settings row is missing')
        return decode<ProfileSettings>('settings', row)
      })
    },

    update(patch) {
      return attemptWrite(async () => updateWhere(await db(), 'settings', patch as Row, 'id = 1', []))
    },
  }

  const bodyWeight: BodyWeightRepo = {
    list() {
      return attempt([], async () =>
        (await (await db()).query('SELECT * FROM body_weight_entries ORDER BY recorded_at DESC')).map((row) =>
          decode<BodyWeightEntry>('body_weight_entries', row),
        ),
      )
    },

    create(weight, unit) {
      return attempt(null, async () => {
        const id = newId()
        await insertRow(await db(), 'body_weight_entries', { id, weight, weight_unit: unit, recorded_at: now() })
        return single<BodyWeightEntry>('body_weight_entries', id)
      })
    },

    update(id, weight, unit, recordedAt) {
      return attempt(null, async () => {
        await updateWhere(await db(), 'body_weight_entries', { weight, weight_unit: unit, recorded_at: recordedAt }, 'id = ?', [id])
        return single<BodyWeightEntry>('body_weight_entries', id)
      })
    },

    remove(id) {
      return attemptWrite(async () => (await db()).run('DELETE FROM body_weight_entries WHERE id = ?', [id]))
    },
  }

  const measurements: BodyMeasurementsRepo = {
    list() {
      return attempt([], async () =>
        (await (await db()).query('SELECT * FROM body_measurements ORDER BY recorded_at DESC')).map((row) =>
          decode<BodyMeasurement>('body_measurements', row),
        ),
      )
    },

    create(values, unit, recordedAt) {
      return attempt(null, async () => {
        const id = newId()
        await insertRow(await db(), 'body_measurements', { id, ...values, unit, recorded_at: recordedAt })
        return single<BodyMeasurement>('body_measurements', id)
      })
    },

    update(id, values, unit, recordedAt) {
      return attempt(null, async () => {
        await updateWhere(await db(), 'body_measurements', { ...values, unit, recorded_at: recordedAt }, 'id = ?', [id])
        return single<BodyMeasurement>('body_measurements', id)
      })
    },

    remove(id) {
      return attemptWrite(async () => (await db()).run('DELETE FROM body_measurements WHERE id = ?', [id]))
    },
  }

  const exercises: ExercisesRepo = {
    list() {
      return attempt([], async () =>
        (await (await db()).query('SELECT * FROM exercises ORDER BY name COLLATE NOCASE, name')).map((row) =>
          decode<Exercise>('exercises', row),
        ),
      )
    },

    create(exercise) {
      return attempt(null, async () => {
        const id = newId()
        await insertRow(await db(), 'exercises', { ...exercise, id })
        return single<Exercise>('exercises', id)
      })
    },

    update(id, patch) {
      return attemptWrite(async () => updateWhere(await db(), 'exercises', patch as Row, 'id = ?', [id]))
    },

    async hasLoggedSets(id) {
      const { data } = await attempt(false, async () => {
        const rows = await (await db()).query('SELECT 1 FROM sets WHERE exercise_id = ? LIMIT 1', [id])
        return rows.length > 0
      })
      return data
    },

    async countWorkouts(id) {
      const { data } = await attempt(0, async () => {
        const [row] = await (await db()).query('SELECT COUNT(DISTINCT workout_id) AS n FROM sets WHERE exercise_id = ?', [id])
        return Number(row?.n ?? 0)
      })
      return data
    },

    merge(fromId, intoId) {
      return attemptWrite(async () =>
        (await db()).transaction(async (tx) => {
          await tx.run('UPDATE sets SET exercise_id = ? WHERE exercise_id = ?', [intoId, fromId])
          // Issue #535: a workout with a note on both keeps both lines.
          const notes = await tx.query<{ workout_id: string; from_note: string; kept_note: string | null }>(
            `SELECT f.workout_id, f.note AS from_note, k.note AS kept_note FROM workout_exercise_notes f
             LEFT JOIN workout_exercise_notes k ON k.workout_id = f.workout_id AND k.exercise_id = ?
             WHERE f.exercise_id = ?`,
            [intoId, fromId],
          )
          for (const n of notes) {
            if (n.kept_note === null) {
              await tx.run('UPDATE workout_exercise_notes SET exercise_id = ? WHERE workout_id = ? AND exercise_id = ?', [intoId, n.workout_id, fromId])
            } else {
              await tx.run('UPDATE workout_exercise_notes SET note = ? WHERE workout_id = ? AND exercise_id = ?', [
                combineExerciseNotes(n.kept_note, n.from_note),
                n.workout_id,
                intoId,
              ])
              await tx.run('DELETE FROM workout_exercise_notes WHERE workout_id = ? AND exercise_id = ?', [n.workout_id, fromId])
            }
          }
          const dupes = await tx.query<{ from_row: string; kept_row: string }>(
            `SELECT f.id AS from_row, k.id AS kept_row FROM workout_template_exercises f
             JOIN workout_template_exercises k ON k.template_id = f.template_id AND k.exercise_id = ?
             WHERE f.exercise_id = ?`,
            [intoId, fromId],
          )
          for (const { from_row, kept_row } of dupes) {
            await tx.run(
              `UPDATE workout_template_exercises SET target_sets = (
                 SELECT COALESCE(MAX(a.target_sets, b.target_sets), a.target_sets, b.target_sets)
                 FROM workout_template_exercises a, workout_template_exercises b WHERE a.id = ? AND b.id = ?)
               WHERE id = ?`,
              [kept_row, from_row, kept_row],
            )
            await tx.run('DELETE FROM workout_template_exercises WHERE id = ?', [from_row])
          }
          await tx.run('UPDATE workout_template_exercises SET exercise_id = ? WHERE exercise_id = ?', [intoId, fromId])
          await tx.run('UPDATE exercises SET is_archived = 1 WHERE id = ?', [fromId])
        }),
      )
    },
  }

  async function templateExercise(id: string): Promise<TemplateExerciseWithName> {
    const [row] = await (await db()).query(
      `SELECT te.*, e.name AS e_name, e.load_type AS e_load_type
       FROM workout_template_exercises te LEFT JOIN exercises e ON e.id = te.exercise_id
       WHERE te.id = ?`,
      [id],
    )
    if (!row) throw new Error(`No workout_template_exercises row with id ${id}`)
    return { ...decode<WorkoutTemplateExercise>('workout_template_exercises', row), exercises: exerciseEmbed(row) }
  }

  const templates: TemplatesRepo = {
    list() {
      return attempt([], async () => {
        const conn = await db()
        const rows = await conn.query('SELECT * FROM workout_templates ORDER BY name COLLATE NOCASE, name')
        const refs = await conn.query('SELECT template_id, exercise_id FROM workout_template_exercises ORDER BY position')
        const byTemplate = groupBy(refs, (row) => row.template_id as string)
        return rows.map((row) => {
          const exerciseRefs = (byTemplate.get(row.id as string) ?? []).map((ref) => ({ exercise_id: ref.exercise_id as string }))
          return {
            ...decode<WorkoutTemplate>('workout_templates', row),
            workout_template_exercises: [{ count: exerciseRefs.length }],
            exercise_refs: exerciseRefs,
          }
        })
      })
    },

    create(name) {
      return attempt(null, async () => {
        const id = newId()
        await insertRow(await db(), 'workout_templates', { id, name })
        return single<WorkoutTemplate>('workout_templates', id)
      })
    },

    update(id, patch) {
      return attemptWrite(async () => updateWhere(await db(), 'workout_templates', patch, 'id = ?', [id]))
    },

    listExercises(templateId) {
      return attempt([], async () => {
        const rows = await (await db()).query(
          `SELECT te.*, e.name AS e_name, e.load_type AS e_load_type
           FROM workout_template_exercises te LEFT JOIN exercises e ON e.id = te.exercise_id
           WHERE te.template_id = ? ORDER BY te.position`,
          [templateId],
        )
        return rows.map((row) => ({ ...decode<WorkoutTemplateExercise>('workout_template_exercises', row), exercises: exerciseEmbed(row) }))
      })
    },

    addExercise(row) {
      return attempt(null, async () => {
        const id = newId()
        await insertRow(await db(), 'workout_template_exercises', { ...row, id })
        return templateExercise(id)
      })
    },

    // One transaction, like the single multi-row insert Supabase makes.
    insertExercises(rows) {
      return attemptWrite(async () =>
        (await db()).transaction(async (tx) => {
          for (const row of rows) await insertRow(tx, 'workout_template_exercises', { ...row, id: newId() })
        }),
      )
    },

    saveExercises(rows) {
      return attemptWrite(async () =>
        (await db()).transaction(async (tx) => {
          for (const row of rows) {
            const columns = columnsOf('workout_template_exercises', row as unknown as Row)
            await tx.run(
              `INSERT INTO workout_template_exercises (${columns.join(', ')}) VALUES (${placeholders(columns)})
               ON CONFLICT (id) DO UPDATE SET ${columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`,
              columns.map((column) => encode('workout_template_exercises', column, (row as unknown as Row)[column])),
            )
          }
        }),
      )
    },

    updateExerciseTargetSets(id, targetSets) {
      return attemptWrite(async () =>
        (await db()).run('UPDATE workout_template_exercises SET target_sets = ? WHERE id = ?', [targetSets, id]),
      )
    },

    removeExercise(id) {
      return attemptWrite(async () => (await db()).run('DELETE FROM workout_template_exercises WHERE id = ?', [id]))
    },
  }

  const SET_FIELDS = ['reps', 'weight', 'weight_unit', 'rpe', 'level', 'duration_seconds', 'distance', 'distance_unit', 'incline', 'calories'] as const

  // set_index is never trusted from the caller (the Postgres trigger's
  // rule, backlog item 10): it's computed in the same statement. SQLite runs
  // one statement at a time on this connection, so two quick inserts can't
  // read the same max.
  async function insertSet(set: Parameters<WorkoutsRepo['insertSet']>[0]): Promise<string> {
    const id = set.id ?? newId()
    const values = SET_FIELDS.map((column) => encode('sets', column, set[column]))
    await (await db()).run(
      `INSERT INTO sets (id, workout_id, exercise_id, set_index, ${SET_FIELDS.join(', ')})
       VALUES (?, ?, ?, (SELECT COALESCE(MAX(set_index), -1) + 1 FROM sets WHERE workout_id = ?), ${placeholders(values)})`,
      [id, set.workout_id, set.exercise_id, set.workout_id, ...values],
    )
    return id
  }

  // What a record comparison needs from a past set (SetMarkerRow).
  function marker(row: Row) {
    return {
      reps: row.reps as number,
      weight: row.weight as number,
      weight_unit: row.weight_unit as SetMarkerRow['weight_unit'],
      level: row.level as number | null,
      workouts: { performed_at: row.performed_at as string },
    }
  }

  const workouts: WorkoutsRepo = {
    createWorkout(notes, templateId, performedAt) {
      return attempt(null, async () => {
        const id = newId()
        await insertRow(await db(), 'workouts', { id, notes, template_id: templateId, performed_at: performedAt ?? now() })
        return single<Workout>('workouts', id)
      })
    },

    getWorkout(id) {
      return attempt(null, async () => {
        const rows = await (await db()).query(`${WORKOUT_WITH_TEMPLATE} WHERE w.id = ?`, [id])
        return (await withSets(rows))[0] ?? null
      })
    },

    deleteWorkout(id) {
      return attemptWrite(async () => (await db()).run('DELETE FROM workouts WHERE id = ?', [id]))
    },

    updateWorkoutNotes(id, notes) {
      return attemptWrite(async () => (await db()).run('UPDATE workouts SET notes = ? WHERE id = ?', [notes, id]))
    },

    updateWorkoutDate(id, performedAt) {
      return attemptWrite(async () => updateWhere(await db(), 'workouts', { performed_at: performedAt }, 'id = ?', [id]))
    },

    updateWorkoutFeel(id, feel) {
      return attemptWrite(async () => updateWhere(await db(), 'workouts', feel as Row, 'id = ?', [id]))
    },

    updateWorkoutEvents(id, events) {
      return attemptWrite(async () =>
        (await db()).run('UPDATE workouts SET events = ? WHERE id = ?', [events ? JSON.stringify(events) : null, id]),
      )
    },

    updateWorkoutFinishedAt(id, finishedAt) {
      return attemptWrite(async () =>
        (await db()).run('UPDATE workouts SET finished_at = ? WHERE id = ?', [finishedAt ? toTimestamp(finishedAt) : null, id]),
      )
    },

    listWorkoutEvents() {
      return attempt([] as WorkoutEventsRow[], async () =>
        (await db()).query<WorkoutEventsRow>('SELECT id, events FROM workouts WHERE events IS NOT NULL'),
      )
    },

    listWorkoutNotes() {
      return attempt([] as WorkoutNotesRow[], async () =>
        (await db()).query<WorkoutNotesRow>("SELECT id, notes FROM workouts WHERE notes IS NOT NULL AND TRIM(notes) <> ''"),
      )
    },

    listWorkoutFeels() {
      return attempt([] as FeelWorkoutRow[], async () =>
        (await db()).query<FeelWorkoutRow>(
          `SELECT id, performed_at, sleep, energy, stress FROM workouts
           WHERE sleep IS NOT NULL OR energy IS NOT NULL OR stress IS NOT NULL`,
        ),
      )
    },

    listHistory() {
      return attempt([], async () => withSets(await (await db()).query(`${WORKOUT_WITH_TEMPLATE} ORDER BY w.performed_at DESC`)))
    },

    setExerciseNote(workoutId, exerciseId, note) {
      return attemptWrite(async () =>
        note === null
          ? (await db()).run('DELETE FROM workout_exercise_notes WHERE workout_id = ? AND exercise_id = ?', [workoutId, exerciseId])
          : (await db()).run(
              `INSERT INTO workout_exercise_notes (workout_id, exercise_id, note) VALUES (?, ?, ?)
               ON CONFLICT (workout_id, exercise_id) DO UPDATE SET note = excluded.note`,
              [workoutId, exerciseId, note],
            ),
      )
    },

    getLastExerciseNote(exerciseId, excludeWorkoutId) {
      return attempt(null as string | null, async () => {
        const [row] = await (await db()).query(
          `SELECT n.note FROM (
             SELECT w.id FROM workouts w
             WHERE w.id IS NOT ? AND EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = w.id AND s.exercise_id = ?)
             ORDER BY w.performed_at DESC LIMIT 1
           ) latest LEFT JOIN workout_exercise_notes n ON n.workout_id = latest.id AND n.exercise_id = ?`,
          [excludeWorkoutId, exerciseId, exerciseId],
        )
        return (row?.note as string | null | undefined) ?? null
      })
    },

    // Only a workout with at least one set can win on recency (the `!inner`
    // embed on Supabase).
    getPreviousForTemplate(templateId, excludeWorkoutId) {
      return attempt(null, async () => {
        const rows = await (await db()).query(
          `${WORKOUT_WITH_TEMPLATE}
           WHERE w.template_id = ? AND w.id IS NOT ? AND EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = w.id)
           ORDER BY w.performed_at DESC LIMIT 1`,
          [templateId, excludeWorkoutId],
        )
        return (await withSets(rows))[0] ?? null
      })
    },

    getLatestSetsForExercise(exerciseId, excludeWorkoutId) {
      return attempt([], async () => {
        const conn = await db()
        const [latest] = await conn.query(
          `SELECT w.id FROM workouts w
           WHERE w.id IS NOT ? AND EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = w.id AND s.exercise_id = ?)
           ORDER BY w.performed_at DESC LIMIT 1`,
          [excludeWorkoutId, exerciseId],
        )
        if (!latest) return []
        const rows = await conn.query(`${SET_WITH_EXERCISE} WHERE s.workout_id = ? AND s.exercise_id = ? ORDER BY s.set_index`, [
          latest.id as string,
          exerciseId,
        ])
        return rows.map(setWithExercise)
      })
    },

    getLatestWorkoutSets() {
      return attempt(null, async () => {
        const conn = await db()
        const [latest] = await conn.query('SELECT id FROM workouts ORDER BY performed_at DESC LIMIT 1')
        if (!latest) return null
        const rows = await conn.query(`${SET_WITH_EXERCISE} WHERE s.workout_id = ? ORDER BY s.set_index`, [latest.id as string])
        const sets = rows.map((row) => ({
          exercise_id: row.exercise_id,
          set_index: row.set_index,
          reps: row.reps,
          weight: row.weight,
          weight_unit: row.weight_unit,
          level: row.level,
          exercises: exerciseEmbed(row),
        }))
        return { id: latest.id, sets } as unknown as WorkoutWithSets
      })
    },

    async listWorkoutDatesSince(since) {
      const { data, error } = await attempt(null, async () =>
        (await db()).query<{ performed_at: string }>('SELECT performed_at FROM workouts WHERE performed_at >= ?', [toTimestamp(since)]),
      )
      return { data, count: data?.length ?? null, error }
    },

    async listWorkoutSummariesSince(since) {
      const { data, error } = await attempt([] as RecapWorkoutSummary[], async () =>
        summaries(await (await db()).query('SELECT id, performed_at FROM workouts WHERE performed_at >= ?', [toTimestamp(since)])),
      )
      return { data, count: error ? null : data.length, error }
    },

    listTemplateSessions(templateId, upTo, limit) {
      return attempt([], async () =>
        summaries(
          await (await db()).query(
            'SELECT id, performed_at FROM workouts WHERE template_id = ? AND performed_at <= ? ORDER BY performed_at DESC LIMIT ?',
            [templateId, toTimestamp(upTo), limit],
          ),
        ),
      )
    },

    findSet(id, workoutId) {
      return attempt(null, async () => {
        const [row] = await (await db()).query('SELECT * FROM sets WHERE id = ? AND workout_id = ?', [id, workoutId])
        return row ? decode<SetEntry>('sets', row) : null
      })
    },

    insertSet(set) {
      return attempt(null, async () => single<SetEntry>('sets', await insertSet(set)))
    },

    insertSetWithExercise(set) {
      return attempt(null, async () => {
        const id = await insertSet(set)
        const [row] = await (await db()).query(`${SET_WITH_EXERCISE} WHERE s.id = ?`, [id])
        return setWithExercise(row)
      })
    },

    updateSet(id, fields) {
      return attemptWrite(async () => updateWhere(await db(), 'sets', fields as Row, 'id = ?', [id]))
    },

    deleteSet(id) {
      return attemptWrite(async () => (await db()).run('DELETE FROM sets WHERE id = ?', [id]))
    },

    listPriorSets(exerciseIds, excludeWorkoutId) {
      return attempt([] as PriorSet[], async () => {
        if (exerciseIds.length === 0) return []
        return (await db()).query<PriorSet>(
          `SELECT s.id, s.exercise_id, s.workout_id, s.reps, s.weight, s.weight_unit, s.level, s.duration_seconds,
                  s.distance, s.distance_unit, s.calories, w.performed_at
           FROM sets s JOIN workouts w ON w.id = s.workout_id
           WHERE s.exercise_id IN (${placeholders(exerciseIds)}) AND s.workout_id != ?
           ORDER BY s.id`,
          [...exerciseIds, excludeWorkoutId],
        )
      })
    },

    listSetMarkersForExercises(exerciseIds, excludeWorkoutId) {
      return attempt([] as SetMarkerRow[], async () => {
        if (exerciseIds.length === 0) return []
        const rows = await (await db()).query(
          `SELECT s.exercise_id, s.reps, s.weight, s.weight_unit, s.level, w.performed_at
           FROM sets s JOIN workouts w ON w.id = s.workout_id
           WHERE s.exercise_id IN (${placeholders(exerciseIds)}) AND s.workout_id != ?`,
          [...exerciseIds, excludeWorkoutId],
        )
        return rows.map((row) => ({ exercise_id: row.exercise_id as string, ...marker(row) }))
      })
    },

    listSetMarkersForExercise(exerciseId, excludeSetId) {
      return attempt([] as Omit<SetMarkerRow, 'exercise_id'>[], async () => {
        const rows = await (await db()).query(
          `SELECT s.reps, s.weight, s.weight_unit, s.level, w.performed_at
           FROM sets s JOIN workouts w ON w.id = s.workout_id
           WHERE s.exercise_id = ? AND s.id != ?`,
          [exerciseId, excludeSetId],
        )
        return rows.map(marker)
      })
    },

    listExerciseHistory(exerciseId) {
      return attempt([] as ExerciseHistoryWorkout[], async () => {
        const rows = await (await db()).query(
          `SELECT s.id, s.reps, s.weight, s.weight_unit, s.rpe, s.level, s.duration_seconds, s.distance,
                  s.distance_unit, s.incline, s.calories, w.id AS workout_id, w.performed_at, t.name AS template_name
           FROM sets s JOIN workouts w ON w.id = s.workout_id
           LEFT JOIN workout_templates t ON t.id = w.template_id
           WHERE s.exercise_id = ?
           ORDER BY w.performed_at DESC, w.id, s.set_index`,
          [exerciseId],
        )
        const history: ExerciseHistoryWorkout[] = []
        for (const { workout_id, performed_at, template_name, ...set } of rows) {
          let workout = history[history.length - 1]
          if (workout?.workoutId !== workout_id) {
            workout = {
              workoutId: workout_id as string,
              performedAt: performed_at as string,
              templateName: (template_name as string | null) ?? null,
              sets: [],
            }
            history.push(workout)
          }
          workout.sets.push(set as unknown as ExerciseHistoryWorkout['sets'][number])
        }
        return history
      })
    },

    listRecentSetExerciseIds(limit) {
      return attempt([] as string[], async () => {
        const rows = await (await db()).query<{ exercise_id: string }>(
          `SELECT s.exercise_id FROM sets s JOIN workouts w ON w.id = s.workout_id
           ORDER BY w.performed_at DESC, s.set_index DESC LIMIT ?`,
          [limit],
        )
        return rows.map((row) => row.exercise_id)
      })
    },

    listProgressSets() {
      return attempt([] as ProgressSetRow[], async () => {
        const rows = await (await db()).query<ProgressSetRow>(
          `SELECT s.id, s.exercise_id, s.workout_id, s.set_index, s.reps, s.weight, s.weight_unit, s.rpe, s.level, s.duration_seconds,
                  s.distance, s.distance_unit, s.incline, s.calories, w.performed_at, w.finished_at, w.imported, w.template_id, t.name AS template_name
           FROM sets s JOIN workouts w ON w.id = s.workout_id
           LEFT JOIN workout_templates t ON t.id = w.template_id
           ORDER BY s.id`,
        )
        return rows.map((row) => ({ ...row, imported: !!row.imported }))
      })
    },

    async countWeightedSets(unit) {
      const { data } = await attempt(0, async () => {
        const [row] = await (await db()).query<{ n: number }>('SELECT COUNT(*) AS n FROM sets WHERE weight_unit = ? AND weight > 0', [unit])
        return row?.n ?? 0
      })
      return data
    },
  }

  const backup: BackupRepo = {
    async getProfile() {
      const { data, error } = await profile.get()
      if (error || !data) throw new Error(`Couldn't read your profile: ${error?.message ?? 'no settings row'}`)
      const { plates_lb, plates_kg, ...rest } = data
      return { ...rest, plates_lb: plates_lb ?? [], plates_kg: plates_kg ?? [] }
    },

    async listAll(table) {
      try {
        const order = table === 'workout_exercise_notes' ? 'workout_id, exercise_id' : 'id'
        const rows = await (await db()).query(`SELECT * FROM ${table} ORDER BY ${order}`)
        return rows.map((row) => decode<Row>(table, row))
      } catch (e) {
        throw new Error(`Couldn't read ${table.replace(/_/g, ' ')}: ${toDataError(e).message}`)
      }
    },

    async countWorkoutsAndSets() {
      const conn = await db()
      const [row] = await conn.query<{ workouts: number; sets: number }>(
        'SELECT (SELECT COUNT(*) FROM workouts) AS workouts, (SELECT COUNT(*) FROM sets) AS sets',
      )
      return { workouts: row?.workouts ?? 0, sets: row?.sets ?? 0 }
    },

    // Issue #77: reset, restore, and erase (once the PWA backend's
    // reset_my_data, restore_my_data, and delete_my_account RPCs). Each runs in one
    // transaction, so a failure leaves the data untouched.
    reset() {
      return attemptWrite(async () => (await db()).transaction((tx) => clearTrainingData(tx)))
    },

    restore(file) {
      return attemptWrite(async () => {
        if (file?.format !== 'repbunny-backup') throw new Error('Not a RepBunny backup file')
        await (await db()).transaction(async (tx) => {
          await clearTrainingData(tx)
          await restoreRows(tx, file, newId)
        })
      })
    },

    // Issue #93: a partial file adds to what's there, in one transaction.
    merge(file) {
      return attemptWrite(async () => {
        if (file?.format !== 'repbunny-backup') throw new Error('Not a RepBunny backup file')
        await (await db()).transaction(async (tx) => {
          const read = async (table: BackupTable) => (await tx.query(`SELECT * FROM ${table}`)).map((row) => decode<Row>(table, row))
          const existing = existingDataFrom(await read('exercises'), await read('workout_templates'), await read('workout_template_exercises'))
          const plan = planMerge(file, existing, newId)
          for (const update of plan.exerciseUpdates) await updateWhere(tx, 'exercises', update.patch, 'id = ?', [update.id])
          for (const table of ['exercises', 'workout_templates', 'workout_template_exercises', 'workouts', 'sets', 'workout_exercise_notes', 'body_weight_entries', 'body_measurements'] as const) {
            for (const row of plan[table]) await insertRow(tx, table, backupRow(table, row, {}))
          }
          if (plan.profile) await updateWhere(tx, 'settings', plan.profile as Row, 'id = 1', [])
        })
      })
    },

    // Every table, and the settings row back to its defaults (weight unit
    // unasked, the 2:00 default rest from #429), so the app starts over like
    // a first launch.
    erase() {
      return attemptWrite(async () =>
        (await db()).transaction(async (tx) => {
          await clearTrainingData(tx)
          await tx.run('DELETE FROM client_errors')
          await tx.run('DELETE FROM settings')
          await tx.run('INSERT INTO settings (id, default_rest_seconds) VALUES (1, ?)', [NEW_USER_REST_SECONDS])
        }),
      )
    },
  }

  // Issue #83: on-device only, trimmed to the newest CLIENT_ERROR_LIMIT rows.
  const clientErrors: ClientErrorsRepo = {
    insert(entry) {
      return attemptWrite(async () =>
        (await db()).transaction(async (tx) => {
          await tx.run(
            `INSERT INTO client_errors (id, occurred_at, kind, message, stack, route, context, app_version, user_agent)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newId(), entry.occurred_at, entry.kind, entry.message, entry.stack, entry.route,
              entry.context === null ? null : JSON.stringify(entry.context), entry.app_version, entry.user_agent,
            ],
          )
          await tx.run(
            'DELETE FROM client_errors WHERE id NOT IN (SELECT id FROM client_errors ORDER BY occurred_at DESC LIMIT ?)',
            [CLIENT_ERROR_LIMIT],
          )
        }),
      )
    },

    list() {
      return attempt([] as (ClientErrorEntry & { id: string })[], async () => {
        const rows = await (await db()).query<Row>('SELECT * FROM client_errors ORDER BY occurred_at DESC')
        return rows.map((row) => ({
          ...(row as unknown as ClientErrorEntry & { id: string }),
          context: typeof row.context === 'string' ? (JSON.parse(row.context) as Record<string, unknown>) : null,
        }))
      })
    },

    clear() {
      return attemptWrite(async () => {
        await (await db()).run('DELETE FROM client_errors')
      })
    },
  }

  return { profile, bodyWeight, measurements, exercises, templates, workouts, backup, clientErrors }
}

// reset_my_data(): the training data and the profile fields that go with it.
// Weight unit, prefill mode, and plates stay. Children go first so this
// doesn't lean on ON DELETE CASCADE.
async function clearTrainingData(tx: SqlExecutor): Promise<void> {
  for (const table of ['sets', 'workout_exercise_notes', 'workouts', 'workout_template_exercises', 'workout_templates', 'exercises', 'body_weight_entries', 'body_measurements']) {
    await tx.run(`DELETE FROM ${table}`)
  }
  await tx.run(
    `UPDATE settings SET height = NULL, height_unit = NULL, missing_weight_prompt_opt_out = 0, weight_reminder = 'monthly' WHERE id = 1`,
  )
}

// A backup row's own columns. Anything else (user_id, a column the live
// database still has but this schema doesn't, like exercises.category) is
// dropped, the way jsonb_populate_record ignores keys it doesn't know.
function backupRow(table: BackupTable, row: Row, overrides: Row): Row {
  const out: Row = {}
  for (const column of TABLES[table].columns) {
    if (row[column] !== undefined) out[column] = row[column]
  }
  return { ...out, ...overrides }
}

// restore_my_data(): every row gets a new id, and references are remapped
// through the file's own ids. A template exercise or set that points at a
// row the file doesn't have is skipped, like the RPC's inner joins; a
// workout's unknown template becomes freeform. Each workout's sets are
// renumbered from 0 in file order, the same as the set_index trigger does.
async function restoreRows(tx: SqlExecutor, file: BackupFile, newId: () => string): Promise<void> {
  const rows = (table: BackupTable) => (Array.isArray(file[table]) ? file[table] : [])
  const remap = (table: BackupTable) => new Map(rows(table).map((row) => [String(row.id), newId()]))
  const exerciseIds = remap('exercises')
  const templateIds = remap('workout_templates')
  const workoutIds = remap('workouts')

  for (const row of rows('exercises')) {
    await insertRow(tx, 'exercises', backupRow('exercises', row, { id: exerciseIds.get(String(row.id)) }))
  }
  for (const row of rows('workout_templates')) {
    await insertRow(tx, 'workout_templates', backupRow('workout_templates', row, { id: templateIds.get(String(row.id)) }))
  }
  for (const row of rows('workout_template_exercises')) {
    const templateId = templateIds.get(String(row.template_id))
    const exerciseId = exerciseIds.get(String(row.exercise_id))
    if (!templateId || !exerciseId) continue
    await insertRow(
      tx,
      'workout_template_exercises',
      backupRow('workout_template_exercises', row, { id: newId(), template_id: templateId, exercise_id: exerciseId }),
    )
  }
  for (const row of rows('workouts')) {
    const templateId = row.template_id === null || row.template_id === undefined ? null : templateIds.get(String(row.template_id)) ?? null
    const events = remapWorkoutEvents(row.events, exerciseIds)
    await insertRow(tx, 'workouts', backupRow('workouts', row, { id: workoutIds.get(String(row.id)), template_id: templateId, events }))
  }

  const setsByWorkout = groupBy(
    rows('sets').filter((row) => workoutIds.has(String(row.workout_id)) && exerciseIds.has(String(row.exercise_id))),
    (row) => String(row.workout_id),
  )
  for (const [oldWorkoutId, sets] of setsByWorkout) {
    const ordered = [...sets].sort((a, b) => Number(a.set_index) - Number(b.set_index))
    for (const [index, row] of ordered.entries()) {
      await insertRow(
        tx,
        'sets',
        backupRow('sets', row, {
          id: newId(),
          workout_id: workoutIds.get(oldWorkoutId),
          exercise_id: exerciseIds.get(String(row.exercise_id)),
          set_index: index,
        }),
      )
    }
  }

  // Issue #535: a note restores when both its workout and exercise did.
  for (const row of rows('workout_exercise_notes')) {
    const workoutId = workoutIds.get(String(row.workout_id))
    const exerciseId = exerciseIds.get(String(row.exercise_id))
    if (!workoutId || !exerciseId) continue
    await insertRow(tx, 'workout_exercise_notes', backupRow('workout_exercise_notes', row, { workout_id: workoutId, exercise_id: exerciseId }))
  }

  for (const row of rows('body_weight_entries')) {
    await insertRow(tx, 'body_weight_entries', backupRow('body_weight_entries', row, { id: newId() }))
  }
  for (const row of rows('body_measurements')) {
    await insertRow(tx, 'body_measurements', backupRow('body_measurements', row, { id: newId() }))
  }

  const p: Partial<BackupFile['profile']> = file.profile ?? {}
  const settings: Row = {
    height: p.height ?? null,
    height_unit: p.height_unit ?? null,
    missing_weight_prompt_opt_out: p.missing_weight_prompt_opt_out ?? false,
    weight_reminder: p.weight_reminder ?? 'monthly',
  }
  if (Array.isArray(p.plates_lb)) settings.plates_lb = p.plates_lb.map(Number)
  if (Array.isArray(p.plates_kg)) settings.plates_kg = p.plates_kg.map(Number)
  // v2 files (#93) carry these too; a v1 file leaves them as they are.
  Object.assign(settings, profilePatchFrom(file.profile, V2_PROFILE_KEYS))
  await updateWhere(tx, 'settings', settings, 'id = 1', [])
}

function groupBy(rows: Row[], key: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const k = key(row)
    let group = groups.get(k)
    if (!group) groups.set(k, (group = []))
    group.push(row)
  }
  return groups
}
