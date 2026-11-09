import type { BackupFile, BackupProfile, BackupTable } from '../../lib/backup'
import { BACKUP_PARTS } from '../../lib/backupMerge'
import type { Row, SqlDb, SqlExecutor } from './db'
import { decode, TABLES } from './repos'

// Issue #430: restore points. A full backup in the usual JSON format
// (src/lib/backup.ts), gzipped, kept in its own SQLite database next to the
// app's (capacitor.ts opens it), so damage to one can't take the other.
// iOS 15.0 to 16.3 has no CompressionStream, so there the JSON is stored as
// is, marked with a "json:" prefix (gzip's base64 never starts with it).
// Saved before a schema update, after every finished workout, and before a
// restore; the newest RESTORE_POINT_LIMIT are kept. Android leaves them out
// of Auto Backup (android/app/src/main/res/xml/backup_rules.xml).

export const RESTORE_POINT_LIMIT = 10

export type RestorePointKind = 'update' | 'workout' | 'restore'

export type RestorePointSummary = {
  id: string
  created_at: string
  kind: RestorePointKind
  // What made it, e.g. "Before update to 1.4.0" or "After Push day".
  label: string
  workouts: number
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS restore_points (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  workouts INTEGER NOT NULL,
  data TEXT NOT NULL
)`

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}

// Gzipped and base64'd, since the plugin's bindings take text and numbers.
export async function gzipText(text: string): Promise<string> {
  const bytes = await pipeThrough(new TextEncoder().encode(text), new CompressionStream('gzip'))
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const PLAIN_PREFIX = 'json:'

// Gzipped when the WebView can, else stored plain (iOS 15.0 to 16.3).
export async function packText(text: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') return PLAIN_PREFIX + text
  return gzipText(text)
}

export async function unpackText(data: string): Promise<string> {
  return data.startsWith(PLAIN_PREFIX) ? data.slice(PLAIN_PREFIX.length) : gunzipText(data)
}

export async function gunzipText(base64: string): Promise<string> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(await pipeThrough(bytes, new DecompressionStream('gzip')))
}

// A full backup read straight from the database at whatever version it's at,
// for the restore point taken before an update (the repos only know the
// latest schema). Columns an older version doesn't have yet are just
// missing, which a restore already handles.
export async function snapshotDatabase(tx: SqlExecutor, now = new Date()): Promise<BackupFile> {
  const tables: Record<string, Row[]> = {}
  // Every backup table (TABLES is BACKUP_TABLES plus settings; lib/backup.ts
  // itself pulls in the whole data layer).
  for (const table of Object.keys(TABLES).filter((name): name is BackupTable => name !== 'settings')) {
    const exists = await tx.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table])
    tables[table] = exists.length ? (await tx.query(`SELECT * FROM ${table} ORDER BY rowid`)).map((row) => decode<Row>(table, row)) : []
  }
  const [settings] = await tx.query('SELECT * FROM settings WHERE id = 1')
  const backup = {
    format: 'repbunny-backup',
    version: 2,
    includes: [...BACKUP_PARTS],
    exported_at: now.toISOString(),
    ...tables,
  } as BackupFile
  if (settings) backup.profile = decode<BackupProfile>('settings', settings)
  return backup
}

export interface RestorePointStore {
  save(kind: RestorePointKind, label: string, backup: BackupFile): Promise<void>
  // Newest first, without the data.
  list(): Promise<RestorePointSummary[]>
  load(id: string): Promise<BackupFile | null>
}

export function createRestorePointStore(
  openDb: () => Promise<SqlDb>,
  options: { now?: () => Date; newId?: () => string } = {},
): RestorePointStore {
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? (() => crypto.randomUUID())
  let opening: Promise<SqlDb> | null = null
  function db(): Promise<SqlDb> {
    opening ??= openDb()
      .then(async (conn) => {
        await conn.run(SCHEMA)
        return conn
      })
      .catch((e) => {
        opening = null
        throw e
      })
    return opening
  }

  return {
    async save(kind, label, backup) {
      const data = await packText(JSON.stringify(backup))
      const conn = await db()
      await conn.transaction(async (tx) => {
        await tx.run('INSERT INTO restore_points (id, created_at, kind, label, workouts, data) VALUES (?, ?, ?, ?, ?, ?)', [
          newId(),
          now().toISOString(),
          kind,
          label,
          backup.workouts.length,
          data,
        ])
        await tx.run(
          'DELETE FROM restore_points WHERE id NOT IN (SELECT id FROM restore_points ORDER BY created_at DESC, rowid DESC LIMIT ?)',
          [RESTORE_POINT_LIMIT],
        )
      })
    },

    async list() {
      const rows = await (await db()).query<RestorePointSummary>(
        'SELECT id, created_at, kind, label, workouts FROM restore_points ORDER BY created_at DESC, rowid DESC',
      )
      return rows.map((row) => ({ ...row, workouts: Number(row.workouts) }))
    },

    async load(id) {
      const [row] = await (await db()).query<{ data: string }>('SELECT data FROM restore_points WHERE id = ?', [id])
      return row ? (JSON.parse(await unpackText(row.data)) as BackupFile) : null
    },
  }
}
