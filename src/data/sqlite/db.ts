import type { DataError } from '../types'

// Issue #75: the SQLite adapter talks to the database through this small
// interface, so the same repos run on the device (@capacitor-community/sqlite,
// capacitor.ts) and in the e2e suite's Node process (sql.js,
// e2e/fixtures/sqljs.ts). jeep-sqlite, the plugin's web backend, is sql.js
// underneath, so the tests exercise the same engine.

export type SqlValue = string | number | null
export type Row = Record<string, unknown>

export interface SqlExecutor {
  query<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>
  // Resolves to the number of rows changed.
  run(sql: string, params?: SqlValue[]): Promise<number>
}

export interface SqlDb extends SqlExecutor {
  // Runs `fn` in one transaction: a throw rolls everything back. Calls made
  // on the db itself wait until it finishes, so use `tx` inside `fn`, never
  // the db (that would deadlock).
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
}

// What a platform has to provide. Calls are not serialized at this level.
export interface SqlDriver extends SqlExecutor {
  begin(): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  // Flushes to durable storage after a write, where the platform needs it
  // (jeep-sqlite keeps the database in memory until saved to IndexedDB).
  persist?(): Promise<void>
}

// One connection serves every store, and a transaction on it would swallow
// any statement another store fires while it's open. So every call queues
// behind the one before it.
export function serialize(driver: SqlDriver): SqlDb {
  let tail: Promise<unknown> = Promise.resolve()

  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = tail.then(fn)
    tail = result.catch(() => undefined)
    return result
  }

  return {
    query: (sql, params) => exclusive(() => driver.query(sql, params)),
    run: (sql, params) =>
      exclusive(async () => {
        const changes = await driver.run(sql, params)
        await driver.persist?.()
        return changes
      }),
    transaction: (fn) =>
      exclusive(async () => {
        await driver.begin()
        let result
        try {
          result = await fn({ query: driver.query.bind(driver), run: driver.run.bind(driver) })
        } catch (e) {
          await driver.rollback()
          throw e
        }
        await driver.commit()
        await driver.persist?.()
        return result
      }),
  }
}

// Gives SQLite's constraint errors the SQLSTATE code a Postgres error from
// Supabase would carry, since the stores branch on it (a duplicate set id
// is '23505' in stores/workouts.ts).
const CONSTRAINT_CODES: [RegExp, string][] = [
  [/UNIQUE constraint failed/i, '23505'],
  [/FOREIGN KEY constraint failed/i, '23503'],
  [/CHECK constraint failed/i, '23514'],
  [/NOT NULL constraint failed/i, '23502'],
]

export function toDataError(e: unknown): DataError {
  const message = e instanceof Error ? e.message : String(e)
  const code = CONSTRAINT_CODES.find(([pattern]) => pattern.test(message))?.[1]
  return code ? { message, code } : { message }
}
