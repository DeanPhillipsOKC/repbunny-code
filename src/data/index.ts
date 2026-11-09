import { setErrorSink, withRequestLogging } from '../lib/errorLog'
import type { SqlDb } from './sqlite/db'
import { createSqliteRepos } from './sqlite/repos'
import type { Repos } from './types'
import { installTestHooks } from '../testHooks'

// Issue #74: the one place that builds the data layer. Issue #938: the app
// only runs on the device's own SQLite database (the native apps, and the
// browser stand-in the e2e suite drives). capacitor.ts is imported lazily, and
// the database opens on the first repo call.
let localDb: Promise<SqlDb> | null = null
// Issue #431: set when the startup check failed. Every later open fails the
// same way without touching the database, so nothing on the recovery screen
// (the error log, a bug report) retries a failing update or reads damaged
// data. A recovery clears it.
let localDbFailure: unknown = null
function openLocalDb(): Promise<SqlDb> {
  if (localDbFailure) return Promise.reject(localDbFailure)
  localDb ??= import('./sqlite/capacitor')
    .then((m) => m.openCapacitorDb())
    .catch((e) => {
      localDb = null
      throw e
    })
  return localDb
}

// Issue #431: local mode's startup health check (main.ts awaits it before
// mounting): the database opens, migrates, passes PRAGMA quick_check, and the
// launch reads work. Throws what went wrong; the caller decides which
// recovery screen that is.
export async function checkLocalDb(): Promise<void> {
  try {
    const db = await openLocalDb()
    const { checkDatabase } = await import('./sqlite/essentialReads')
    await checkDatabase(db)
  } catch (e) {
    localDb = null
    localDbFailure = e
    throw e
  }
  void import('./sqlite/capacitor').then((m) => m.pruneSetAsideDatabases())
}

// Issue #431: after the recovery screen sets the damaged database aside, the
// next open is the new one.
// Returns the failure it cleared, so a failed recovery can put it back.
export function forgetLocalDbFailure(): unknown {
  const failure = localDbFailure
  localDb = null
  localDbFailure = null
  return failure
}

// Issue #452: a recovery that fails goes back to the damaged database, so the
// connection to the one it deleted is dropped and the startup failure returns.
export function markLocalDbFailed(failure: unknown) {
  localDb = null
  localDbFailure = failure
}

// Issue #452: the repos keep the first connection they get, so they get this
// stand-in, which asks openLocalDb for the current one on every call. A failed
// recovery swaps the connection back and the repos follow.
const currentLocalDb: SqlDb = {
  query: (sql, params) => openLocalDb().then((db) => db.query(sql, params)),
  run: (sql, params) => openLocalDb().then((db) => db.run(sql, params)),
  transaction: (fn) => openLocalDb().then((db) => db.transaction(fn)),
}
const baseRepos: Repos = createSqliteRepos(() => openLocalDb().then(() => currentLocalDb))

// Issue #415: the local e2e specs seed and read this same connection
// (e2e/fixtures/local.ts). Issue #960: also their module loader
// (src/testHooks.ts). Dev server and the e2e hooks build only; every store
// and personal build drops it.
if (import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true') installTestHooks(openLocalDb)

// Issue #83: failed writes are logged to client_errors on their way back to
// the stores, and the log itself writes through the unwrapped repo.
// Issue #234: the on-device log also keeps the action trail.
setErrorSink(baseRepos.clientErrors)
export const repos: Repos = withRequestLogging(baseRepos)

export type * from './types'
