import type { RestorePointKind, RestorePointSummary } from '../data/sqlite/restorePoints'
import { buildBackup, type BackupFile } from './backup'

// Issue #430: the app's side of restore points (src/data/sqlite/restorePoints.ts).
// The store is imported lazily, like the rest of the SQLite adapter
// (src/data/index.ts).

export type { RestorePointKind, RestorePointSummary }

async function store() {
  return (await import('../data/sqlite/capacitor')).restorePointStore
}

// Saves still running, so the list (opened right after a finish) waits for
// them.
let saving: Promise<void> = Promise.resolve()

// Never throws: a restore point is a safety net, and failing to save one
// mustn't stop a finish or a restore.
export function saveRestorePoint(kind: RestorePointKind, label: string): Promise<void> {
  saving = saving.then(async () => {
    try {
      await (await store()).save(kind, label, await buildBackup())
    } catch (e) {
      console.warn('Could not save a restore point', e)
    }
  })
  return saving
}

export async function listRestorePoints(): Promise<RestorePointSummary[]> {
  await saving
  return (await store()).list()
}

export async function loadRestorePoint(id: string): Promise<BackupFile | null> {
  return (await store()).load(id)
}
