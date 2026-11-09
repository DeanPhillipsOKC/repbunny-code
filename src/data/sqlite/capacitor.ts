import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import type { BackupFile } from '../../lib/backup'
import { serialize, type SqlDb } from './db'
import { essentialReads } from './essentialReads'
import { createRestorePointStore, snapshotDatabase } from './restorePoints'
import { MigrationCheckError, migrate, SCHEMA_VERSION } from './schema'

// Issue #75: opens the app's on-device database through
// @capacitor-community/sqlite and brings its schema up to date. On the web
// platform the plugin runs on jeep-sqlite (sql.js in IndexedDB), which needs
// its <jeep-sqlite> element on the page and sql-wasm.wasm served at
// /assets/sql-wasm.wasm. Local mode in a browser (#76) sets that up; the
// native apps don't need it.

const DB_NAME = 'repbunny'
// Issue #431: recovering from damaged data starts a new database,
// `repbunny-<UTC yyyyMMddHHmmss>`, and leaves the damaged one where it is.
// The newest name is the one in use, so no pointer has to be stored anywhere
// (an Android Auto Backup restore brings the files back, and with them the
// answer). The plugin lists them with its "SQLite.db" suffix.
const DATA_DB_FILE = /^(repbunny(?:-(\d{14}))?)SQLite\.db$/
// Damaged copies kept aside, newest first, at most this many.
const SET_ASIDE_LIMIT = 2
// Issue #430: restore points live in their own database file
// (repbunny-restore-pointsSQLite.db), so damage to one can't take the other.
const RESTORE_POINTS_DB_NAME = 'repbunny-restore-points'

let connection: Promise<SQLiteConnection> | null = null
function sqliteConnection(): Promise<SQLiteConnection> {
  connection ??= (async () => {
    const sqlite = new SQLiteConnection(CapacitorSQLite)
    if (Capacitor.getPlatform() === 'web') {
      const { defineCustomElements } = await import('jeep-sqlite/loader')
      await defineCustomElements(window)
      if (!document.querySelector('jeep-sqlite')) document.body.appendChild(document.createElement('jeep-sqlite'))
      await customElements.whenDefined('jeep-sqlite')
      await sqlite.initWebStore()
    }
    return sqlite
  })().catch((e) => {
    connection = null
    throw e
  })
  return connection
}

// One SqlDb per name, so a second open (the recovery screen's backup of a
// database whose update failed) reuses the connection instead of reopening it.
const opened = new Map<string, Promise<SqlDb>>()
function openDatabase(name: string): Promise<SqlDb> {
  let db = opened.get(name)
  if (!db) {
    db = connect(name).catch((e) => {
      opened.delete(name)
      throw e
    })
    opened.set(name, db)
  }
  return db
}

// Issue #431: jeep-sqlite's open never settles on a stored file that isn't a
// database (its failure is an unhandled rejection inside the element), so the
// app would hang on a blank screen. On the web, check the stored bytes start
// like a database first; the native plugins fail the open themselves.
const SQLITE_HEADER = 'SQLite format 3\0'
function checkWebStoreHeader(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('jeepSqliteStore')
    open.onerror = () => resolve()
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('databases')) {
        db.close()
        resolve()
        return
      }
      const get = db.transaction('databases').objectStore('databases').get(`${name}SQLite.db`)
      get.onerror = () => {
        db.close()
        resolve()
      }
      get.onsuccess = () => {
        db.close()
        const bytes = get.result instanceof Uint8Array ? get.result : null
        if (!bytes || bytes.length === 0) return resolve()
        const header = String.fromCharCode(...bytes.subarray(0, SQLITE_HEADER.length))
        if (header === SQLITE_HEADER) resolve()
        else reject(new Error(`${name}: file is not a database`))
      }
    }
  })
}

async function connect(name: string): Promise<SqlDb> {
  const sqlite = await sqliteConnection()
  const web = Capacitor.getPlatform() === 'web'
  if (web) await checkWebStoreHeader(name)

  // A reload of the WebView can leave the native side holding a connection
  // the JS side has forgotten; reuse it instead of failing to create one.
  const consistent = (await sqlite.checkConnectionsConsistency()).result
  const exists = (await sqlite.isConnection(name, false)).result
  const conn =
    consistent && exists
      ? await sqlite.retrieveConnection(name, false)
      : await sqlite.createConnection(name, false, 'no-encryption', 1, false)
  await conn.open()
  await conn.execute('PRAGMA foreign_keys = ON;', false)

  return serialize({
    query: async (sql, params) => (await conn.query(sql, params ?? [])).values ?? [],
    // `false`: the plugin would otherwise wrap every statement in its own
    // transaction, including ones inside ours.
    run: async (sql, params) => (await conn.run(sql, params ?? [], false)).changes?.changes ?? 0,
    begin: async () => void (await conn.beginTransaction()),
    commit: async () => void (await conn.commitTransaction()),
    rollback: async () => void (await conn.rollbackTransaction()),
    persist: web ? () => sqlite.saveToStore(name) : undefined,
  })
}

export function openRestorePointsDb(): Promise<SqlDb> {
  return openDatabase(RESTORE_POINTS_DB_NAME)
}

export const restorePointStore = createRestorePointStore(openRestorePointsDb)

type DataDatabase = { name: string; stamp: string }

// The app's databases on this device, oldest first. The original `repbunny`
// has no stamp, so it sorts first. If the list can't be read, it's as if
// there were none (the original name): a healthy install must never land on
// the recovery screen over a listing error.
async function dataDatabases(): Promise<DataDatabase[]> {
  let files: unknown[] = []
  try {
    files = (await (await sqliteConnection()).getDatabaseList()).values ?? []
  } catch (e) {
    console.warn('Could not list the databases', e)
  }
  const found: DataDatabase[] = []
  for (const file of files) {
    const match = DATA_DB_FILE.exec(String(file))
    if (match) found.push({ name: match[1]!, stamp: match[2] ?? '' })
  }
  return found.sort((a, b) => a.stamp.localeCompare(b.stamp))
}

let activeName: string | null = null
async function activeDatabaseName(): Promise<string> {
  activeName ??= (await dataDatabases()).at(-1)?.name ?? DB_NAME
  return activeName
}

function stampOf(date: Date): string {
  return date.toISOString().replace(/\D/g, '').slice(0, 14)
}

function stampDate(stamp: string): Date {
  const [, y, mo, d, h, mi, s] = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/.exec(stamp) ?? []
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)))
}

async function dropDatabase(name: string): Promise<void> {
  const sqlite = await sqliteConnection()
  opened.delete(name)
  try {
    const conn = (await sqlite.isConnection(name, false)).result
      ? await sqlite.retrieveConnection(name, false)
      : await sqlite.createConnection(name, false, 'no-encryption', 1, false)
    await conn.delete()
  } finally {
    await sqlite.closeConnection(name, false).catch(() => undefined)
  }
}

// Issue #431: puts the database in use aside and makes a new, empty one the
// one in use, for a restore after damaged data. Nothing is deleted here; the
// damaged copy stays under its own name. Returns the undo, for a restore
// that fails: it deletes the new database, so the damaged one is in use again
// rather than an empty one hiding it.
export async function setAsideActiveDatabase(now = new Date()): Promise<() => Promise<void>> {
  const old = await activeDatabaseName()
  const sqlite = await sqliteConnection()
  opened.delete(old)
  await sqlite.closeConnection(old, false).catch(() => undefined)
  const name = `${DB_NAME}-${stampOf(now)}`
  activeName = name
  return async () => {
    activeName = old
    await dropDatabase(name).catch((e) => console.warn('Could not remove the new database', e))
  }
}

// Issue #431: a damaged copy is kept until two restore points have been
// saved after it was set aside (so there's a good copy, and one more), and
// only the newest SET_ASIDE_LIMIT are kept at all. Run once the app has
// opened its data. Never throws: a copy left over costs only space. Native
// only: jeep-sqlite opens a database to delete it, which hangs on a damaged
// one (see checkWebStoreHeader), so in a browser they stay.
export async function pruneSetAsideDatabases(): Promise<void> {
  if (Capacitor.getPlatform() === 'web') return
  try {
    const all = await dataDatabases()
    if (all.length < 2) return
    const active = await activeDatabaseName()
    const points = await restorePointStore.list()
    const asideNewestFirst = all
      .map((db, i) => ({ ...db, setAsideAt: all[i + 1]?.stamp }))
      .filter((db) => db.name !== active && db.setAsideAt)
      .reverse()
    for (const [i, db] of asideNewestFirst.entries()) {
      const since = stampDate(db.setAsideAt!).getTime()
      const savedAfter = points.filter((p) => new Date(p.created_at).getTime() > since).length
      if (i < SET_ASIDE_LIMIT && savedAfter < 2) continue
      await dropDatabase(db.name).catch((e) => console.warn(`Could not remove ${db.name}`, e))
    }
  } catch (e) {
    console.warn('Could not tidy the set-aside databases', e)
  }
}

// Issue #431: a full backup of the database in use, read as it is, for the
// recovery screen's "Save a backup file" after an update failed (the
// update rolled back, so it's still at the old version).
export async function snapshotActiveDatabase(): Promise<BackupFile> {
  const db = await openDatabase(await activeDatabaseName())
  return db.transaction((tx) => snapshotDatabase(tx))
}

// Issue #431: dev server and the e2e hooks build only (#960; stripped from
// store and personal builds, like __rbLocalDb): the e2e suite sets this so the next open fails the way an
// update that can't finish does.
export const FAIL_NEXT_UPDATE_KEY = 'rb-dev-fail-next-update'

export async function openCapacitorDb(): Promise<SqlDb> {
  const db = await openDatabase(await activeDatabaseName())
  if ((import.meta.env.DEV || import.meta.env.VITE_E2E_HOOKS === 'true') && localStorage.getItem(FAIL_NEXT_UPDATE_KEY)) {
    localStorage.removeItem(FAIL_NEXT_UPDATE_KEY)
    throw new MigrationCheckError('essential-reads', SCHEMA_VERSION + 1, SCHEMA_VERSION, 'failed on purpose (dev hook)')
  }
  await migrate(db, {
    essentialReads,
    // Issue #430: a restore point of the data as it is, before any version
    // applies. Only when there's data to lose. If it can't be saved, the
    // update still runs: a broken restore-point file mustn't lock anyone
    // out, and every version is checked and rolls back on its own.
    beforeUpgrade: async () => {
      try {
        const [row] = await db.query<{ n: number }>('SELECT (SELECT COUNT(*) FROM workouts) + (SELECT COUNT(*) FROM exercises) AS n')
        if (!Number(row?.n)) return
        // Issue #431: an update that keeps failing is retried on every
        // launch; one copy from before it is enough, and more would push out
        // the older restore points.
        const label = `Before update to ${__APP_VERSION__}`
        const [newest] = await restorePointStore.list()
        if (newest?.kind === 'update' && newest.label === label) return
        const backup = await db.transaction((tx) => snapshotDatabase(tx))
        await restorePointStore.save('update', label, backup)
      } catch (e) {
        console.warn('Could not save a restore point before the update', e)
      }
    },
  })
  return db
}
