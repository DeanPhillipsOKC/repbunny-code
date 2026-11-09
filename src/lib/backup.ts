import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { repos } from '../data'
import { logClientError } from './errorLog'
import { addSeenTiers, milestoneMomentsOn, readSeenTiers, setMilestoneMomentsOn } from './milestones'
import { recordCelebrations, setRecordCelebrations } from './recordCelebrations'
import { readTrialState, restoreTrialState, type TrialState } from './trialPass'
import { BACKUP_PARTS, existingDataFrom, isFullBackup, planMerge, selectBackupRows, type BackupPart, type MergePlan } from './backupMerge'

export { BACKUP_PARTS, isFullBackup, type BackupPart }

// Issue #20: one restorable JSON backup plus an export-only CSV of every set.
// Restore (`repos.backup.restore`, src/data/sqlite/repos.ts) gives every row
// a new id and remaps references through the file's own
// ids, so the arrays here are just `select *` rows, archived ones included.

type Row = Record<string, unknown>

export const BACKUP_TABLES = [
  'exercises',
  'workout_templates',
  'workout_template_exercises',
  'workouts',
  'sets',
  'body_weight_entries',
  // Issue #139. Older files don't have it; parseBackup fills in [].
  'body_measurements',
  // Issue #535: no id column; keyed by workout and exercise. Older files
  // don't have it either.
  'workout_exercise_notes',
] as const

export type BackupTable = (typeof BACKUP_TABLES)[number]

export type BackupProfile = {
  height: number | null
  height_unit: string | null
  missing_weight_prompt_opt_out: boolean
  weight_reminder: string
  plates_lb: number[]
  plates_kg: number[]
  // Issue #93: version 2 files also carry these. A v1 file doesn't, and a
  // restore leaves the current values alone when they're missing.
  weight_unit?: string | null
  prefill_mode?: string | null
  default_rest_seconds?: number | null
}


export type BackupFile = {
  format: 'repbunny-backup'
  version: 1 | 2
  includes?: BackupPart[]
  exported_at: string
  // Left out of a v2 file without preferences.
  profile?: BackupProfile
  // Issue #153: milestone tiers this device has shown as unlocked, so a
  // restore keeps them unlocked. Kept on the device, not in the database.
  // Preferences only.
  milestones_seen?: string[]
  // Issue #155: trial passes earned, started, and noted. Preferences only.
  trial_passes?: TrialState
  // Issue #186: the Milestone moments switch. Preferences only; a file
  // without it leaves the switch alone.
  milestone_moments?: boolean
  // Issue #476: Preferences > Record celebrations. Preferences only; a file
  // without it leaves the choice alone.
  record_celebrations?: 'big' | 'all'
} & Record<BackupTable, Row[]>

// What goes in is selectBackupRows' call (src/lib/backupMerge.ts): a
// templates-only file leaves out archived templates, for example.
export async function buildBackup(includes: readonly BackupPart[] = BACKUP_PARTS): Promise<BackupFile> {
  const wants = (part: BackupPart) => includes.includes(part)
  const needsTables = wants('templates') || wants('history')
  const [profile, ...tables] = await Promise.all([
    wants('preferences') ? repos.backup.getProfile() : Promise.resolve(undefined),
    ...BACKUP_TABLES.map((table) => (needsTables ? repos.backup.listAll(table) : Promise.resolve([]))),
  ])
  const all = Object.fromEntries(BACKUP_TABLES.map((table, i) => [table, tables[i] as Row[]])) as Record<BackupTable, Row[]>
  const backup = {
    format: 'repbunny-backup',
    version: 2,
    includes: BACKUP_PARTS.filter(wants),
    exported_at: new Date().toISOString(),
    ...selectBackupRows(all, includes),
  } as BackupFile
  if (profile) backup.profile = profile as BackupProfile
  const seen = wants('preferences') ? readSeenTiers() : null
  if (seen) backup.milestones_seen = [...seen]
  if (wants('preferences')) {
    backup.trial_passes = readTrialState()
    backup.milestone_moments = milestoneMomentsOn.value
    backup.record_celebrations = recordCelebrations.value
  }
  return backup
}

function localDateStamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// A partial file is named for what's in it, e.g. repbunny-templates-2026-10-01.json.
export function backupFileName(date = new Date(), includes: readonly BackupPart[] = BACKUP_PARTS) {
  const parts = BACKUP_PARTS.filter((part) => includes.includes(part))
  const label = parts.length === BACKUP_PARTS.length ? 'backup' : parts.join('-')
  return `repbunny-${label}-${localDateStamp(date)}.json`
}

export function csvFileName(date = new Date()) {
  return `repbunny-sets-${localDateStamp(date)}.csv`
}

export const CSV_HEADER = [
  'date',
  'workout',
  'exercise',
  'set',
  'weight',
  'weight_unit',
  'reps',
  'rpe',
  'level',
  'duration_seconds',
  'distance',
  'distance_unit',
  'incline',
  'calories',
  // Issue #149: the workout's "How did it feel?" tags, on each of its sets.
  'sleep',
  'energy',
  'stress',
  // Issue #266: when the workout was finished, on each of its sets.
  'finished_at',
] as const

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// One row per set, oldest workout first, then by set order within it. `set`
// is 1-based per workout (set_index can have gaps after a delete).
export function buildSetsCsv(backup: Pick<BackupFile, 'workouts' | 'sets' | 'exercises' | 'workout_templates'>): string {
  const workouts = new Map(backup.workouts.map((w) => [w.id as string, w]))
  const exercises = new Map(backup.exercises.map((e) => [e.id as string, e]))
  const templates = new Map(backup.workout_templates.map((t) => [t.id as string, t]))

  const sets = backup.sets
    .filter((s) => workouts.has(s.workout_id as string))
    .sort((a, b) => {
      const wa = workouts.get(a.workout_id as string)!
      const wb = workouts.get(b.workout_id as string)!
      const byDate = String(wa.performed_at).localeCompare(String(wb.performed_at))
      if (byDate !== 0) return byDate
      if (a.workout_id !== b.workout_id) return String(a.workout_id).localeCompare(String(b.workout_id))
      return Number(a.set_index) - Number(b.set_index)
    })

  const lines = [CSV_HEADER.join(',')]
  const setNumber = new Map<string, number>()
  for (const s of sets) {
    const workout = workouts.get(s.workout_id as string)!
    const n = (setNumber.get(s.workout_id as string) ?? 0) + 1
    setNumber.set(s.workout_id as string, n)
    const template = workout.template_id ? templates.get(workout.template_id as string) : undefined
    lines.push(
      [
        workout.performed_at,
        template ? template.name : 'Freeform',
        exercises.get(s.exercise_id as string)?.name ?? '',
        n,
        s.weight,
        s.weight_unit,
        s.reps,
        s.rpe,
        s.level,
        s.duration_seconds,
        s.distance,
        s.distance_unit,
        s.incline,
        s.calories,
        workout.sleep,
        workout.energy,
        workout.stress,
        workout.finished_at,
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

export function measurementsCsvFileName(date = new Date()) {
  return `repbunny-measurements-${localDateStamp(date)}.csv`
}

export const MEASUREMENTS_CSV_HEADER = ['date', 'unit', 'waist', 'chest', 'hips', 'arms', 'thighs', 'neck'] as const

// Issue #139: one row per measurement entry, oldest first, in the unit it
// was logged in. Blank cells are sites that entry left out.
export function buildMeasurementsCsv(backup: Pick<BackupFile, 'body_measurements'>): string {
  const rows = [...(backup.body_measurements ?? [])].sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)))
  const lines = [MEASUREMENTS_CSV_HEADER.join(',')]
  for (const row of rows) {
    lines.push(MEASUREMENTS_CSV_HEADER.map((key) => csvCell(row[key === 'date' ? 'recorded_at' : key])).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

// Issue #457: the native WebViews don't act on Web Share files or blob
// downloads, so write the file to the cache directory and open the system
// share sheet on it. Resolves to false when the user dismissed the sheet.
async function deliverNative(file: File): Promise<boolean> {
  const { uri } = await Filesystem.writeFile({ path: file.name, data: await blobToBase64(file), directory: Directory.Cache })
  try {
    await Share.share({ title: file.name, files: [uri] })
    return true
  } catch (e) {
    if (/cancel|dismiss/i.test(e instanceof Error ? e.message : String(e))) return false
    throw e
  }
}

// Hands the file to the system share sheet in the native apps and to the browser's
// share sheet when the browser can share files, otherwise downloads it.
// Resolves to false when the user dismissed the share sheet, so the caller
// doesn't claim it was saved. Throws when nothing could deliver it, and logs
// that to the client error log (#457).
export async function deliverFile(name: string, type: string, contents: BlobPart, native = Capacitor.isNativePlatform()): Promise<boolean> {
  try {
    const file = new File([contents], name, { type })
    if (native) return await deliverNative(file)
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return true
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return false
        // Anything else (e.g. share not allowed here): fall back to a download.
      }
    }
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch (e) {
    logClientError({
      kind: 'error',
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? (e.stack ?? null) : null,
      context: { operation: 'file.deliver', type, platform: Capacitor.getPlatform() },
    })
    throw e instanceof Error ? e : new Error(String(e))
  }
}

// Parses a picked file on the device. Returns null for anything that isn't
// JSON or isn't a RepBunny backup; missing arrays count as empty.
export function parseBackup(text: string): BackupFile | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || (data as Row).format !== 'repbunny-backup') return null
  const backup = data as BackupFile
  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(backup[table])) backup[table] = []
  }
  return backup
}

export type BackupSummary = {
  workouts: number
  sets: number
  exercises: number
  templates: number
  weighIns: number
  measurements: number
  hasHeight: boolean
  firstWorkout: string | null
  lastWorkout: string | null
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const dates = backup.workouts.map((w) => String(w.performed_at)).sort()
  return {
    workouts: backup.workouts.length,
    sets: backup.sets.length,
    exercises: backup.exercises.length,
    templates: backup.workout_templates.length,
    weighIns: backup.body_weight_entries.length,
    measurements: (backup.body_measurements ?? []).length,
    hasHeight: backup.profile?.height !== null && backup.profile?.height !== undefined,
    firstWorkout: dates[0] ?? null,
    lastWorkout: dates[dates.length - 1] ?? null,
  }
}

// Current account's counts, for the "replaces everything … right now" warning.
export function countCurrentData(): Promise<{ workouts: number; sets: number }> {
  return repos.backup.countWorkoutsAndSets()
}

// A full backup replaces everything; a partial one (issue #93) merges in.
export async function restoreBackup(backup: BackupFile) {
  const result = await (isFullBackup(backup) ? repos.backup.restore(backup) : repos.backup.merge(backup))
  // Unlocked stays unlocked (#153): a restore only ever adds to the list.
  if (!result.error && Array.isArray(backup.milestones_seen)) {
    addSeenTiers(backup.milestones_seen.filter((id) => typeof id === 'string'))
  }
  // Trial passes (#155) merge the same way: nothing earned or used is lost.
  if (!result.error && backup.trial_passes) restoreTrialState(backup.trial_passes)
  if (!result.error && typeof backup.milestone_moments === 'boolean') setMilestoneMomentsOn(backup.milestone_moments)
  if (!result.error && (backup.record_celebrations === 'big' || backup.record_celebrations === 'all')) setRecordCelebrations(backup.record_celebrations)
  return result
}

// What merging a partial file would add right now, for the preview.
export async function previewMerge(backup: BackupFile): Promise<MergePlan> {
  const [exercises, templates, templateExercises] = await Promise.all([
    repos.backup.listAll('exercises'),
    repos.backup.listAll('workout_templates'),
    repos.backup.listAll('workout_template_exercises'),
  ])
  const plan = planMerge(backup, existingDataFrom(exercises, templates, templateExercises), () => '')
  // Preferences the account already has aren't news (#486).
  if (plan.profile) {
    try {
      const current = (await repos.backup.getProfile()) as Record<string, unknown>
      const changed = Object.entries(plan.profile).filter(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value))
      plan.profile = changed.length > 0 ? (Object.fromEntries(changed) as typeof plan.profile) : null
    } catch {
      // Keep the full patch: saying "updates your preferences" is the safe side.
    }
  }
  return plan
}

// Issue #1: the Account sheet's "Reset my data". Clears training data only;
// auth.users, profiles.id, and passkeys are untouched, so the session stays.
export function resetMyData() {
  return repos.backup.reset()
}
