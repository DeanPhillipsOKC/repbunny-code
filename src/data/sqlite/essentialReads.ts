import type { SqlDb, SqlExecutor } from './db'
import { createSqliteRepos } from './repos'

// Issue #430: the reads the app makes as it opens (the latest workout with
// its sets, the exercise list, a routine with its exercises), through the
// same repo queries, against a migration's open transaction. migrate() runs
// this before the last version commits, so an update that leaves the app
// unable to read its own data rolls back instead. Kept out of schema.ts so
// that file has no runtime imports (scripts/measure-data-growth.mjs loads it
// straight into Node).
export async function essentialReads(tx: SqlExecutor): Promise<void> {
  const db: SqlDb = { query: tx.query, run: tx.run, transaction: (fn) => fn(tx) }
  const repos = createSqliteRepos(() => Promise.resolve(db))
  const check = <T>(what: string, result: { data: T; error: { message: string } | null }) => {
    if (result.error) throw new Error(`Couldn't read ${what}: ${result.error.message}`)
    return result.data
  }
  check('the settings', await repos.profile.get())
  check('the latest workout', await repos.workouts.getLatestWorkoutSets())
  check('the exercise list', await repos.exercises.list())
  const templates = check('the routines', await repos.templates.list())
  if (templates && templates.length > 0) check("a routine's exercises", await repos.templates.listExercises(templates[0].id))
}

// Issue #431: the startup health check, once the database has opened and
// migrated. Any damage SQLite can see, or launch reads that fail, send the
// app to the recovery screen instead of Home.
export async function checkDatabase(db: SqlExecutor): Promise<void> {
  const rows = await db.query<Record<string, unknown>>('PRAGMA quick_check')
  const result = rows.map((row) => String(Object.values(row)[0])).join('; ')
  if (result !== 'ok') throw new Error(`The data failed its integrity check: ${result}`)
  await essentialReads(db)
}
