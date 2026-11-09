import { checkLocalDb, forgetLocalDbFailure, markLocalDbFailed } from '../data'
import { restoreBackup, type BackupFile } from './backup'
import { logClientError } from './errorLog'
import { listRestorePoints, loadRestorePoint } from './restorePoints'

// Issue #431 (design docs/design/issue-431-recovery-screen.html, option A):
// local mode's recovery screen (RecoveryScreen.vue), shown instead of the app
// when the on-device data can't open. main.ts runs the check before
// mounting anything. Nothing here restores on its own: the person taps.

// 'damaged': the database wouldn't open, failed its integrity check, or the
// launch reads failed. 'update-failed': an update's schema change failed its
// checks and rolled back (MigrationCheckError, #430), so the data is fine and
// only this version of the app can't use it yet.
export type RecoveryReason = 'damaged' | 'update-failed'

// Null when the data is healthy. Never throws.
export async function checkLocalData(): Promise<RecoveryReason | null> {
  try {
    await checkLocalDb()
    return null
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e))
    // Goes to the queued log (the database can't take it), so the recovery
    // screen's bug report lists it.
    logClientError({ kind: 'error', message: `Couldn't open the on-device data: ${error.message}`, stack: error.stack ?? null, prompt: false })
    // By name, not instanceof: schema.ts stays out of the main bundle.
    return error.name === 'MigrationCheckError' ? 'update-failed' : 'damaged'
  }
}

// Sets the damaged database aside (kept, never overwritten), restores the
// backup into a new one, and leaves the app to reload onto it. A failed
// restore puts the damaged one back in use and throws.
export async function restoreAfterDamage(backup: BackupFile): Promise<void> {
  const { setAsideActiveDatabase } = await import('../data/sqlite/capacitor')
  const undo = await setAsideActiveDatabase()
  const failure = forgetLocalDbFailure()
  let message = ''
  try {
    const { error } = await restoreBackup(backup)
    if (error) message = error.message
  } catch (e) {
    message = e instanceof Error ? e.message : String(e)
  }
  if (!message) return
  await undo()
  markLocalDbFailed(failure)
  throw new Error(message)
}

// Issue #641: "Start fresh" on the damaged screen. Sets the damaged database
// aside (kept, never deleted, so a backup file or restore point can still
// bring it back) and leaves the app to reload into a new, empty one. Throws
// when that can't be done, leaving the damaged one in use.
export async function startFreshAfterDamage(): Promise<void> {
  const { setAsideActiveDatabase } = await import('../data/sqlite/capacitor')
  const undo = await setAsideActiveDatabase()
  const failure = forgetLocalDbFailure()
  try {
    // Creates the new database, so the next launch finds it as the newest.
    await checkLocalDb()
  } catch (e) {
    await undo()
    markLocalDbFailed(failure)
    throw e
  }
}

// For "Save a backup file" after a failed update: the restore point taken
// just before it when that's the newest, else the data read as it is (the
// update rolled back, so it's unchanged either way).
export async function backupForFailedUpdate(): Promise<BackupFile> {
  try {
    const [newest] = await listRestorePoints()
    if (newest?.kind === 'update') {
      const backup = await loadRestorePoint(newest.id)
      if (backup) return backup
    }
  } catch (e) {
    console.warn('Could not read the restore point from before the update', e)
  }
  const { snapshotActiveDatabase } = await import('../data/sqlite/capacitor')
  return snapshotActiveDatabase()
}
