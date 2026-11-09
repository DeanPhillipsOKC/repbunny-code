import { Capacitor, registerPlugin } from '@capacitor/core'
import { ref } from 'vue'
import { buildBackup, parseBackup, type BackupFile } from './backup'
import { saveRestorePoint } from './restorePoints'

// Issue #432: a copy of everything, saved after every finished workout to the
// person's own storage. Native data lives only on the phone, so this is the
// copy that survives a lost phone or a deleted app, and it never goes to us.
// Native only.
//
// Issue #874: it's on by default, in a folder the app picks (the app's iCloud
// Drive folder on iPhone, else a folder in the app's own storage;
// Documents/RepBunny on Android).
// Turning it off is the person's choice, behind a warning. A folder they pick
// (iCloud Drive, a sync app's folder) takes priority over the default.
//
// The folder access lives in the app's own BackupFolder plugin: a
// security-scoped bookmark or the app's own folders on iPhone
// (BackupFolderPlugin.swift), a persisted Storage Access Framework tree URI or
// MediaStore on Android (BackupFolderPlugin.java). The files are the same JSON
// as Back up my data, so Your copies and Restore from a backup read them.

export interface BackupFolderInfo {
  // The folder's name as the picker shows it.
  name: string
  // True when the folder is only on this phone (not iCloud or a cloud
  // provider), so it doesn't survive losing the phone.
  local: boolean
}

export interface BackupFolderFile {
  name: string
  modified: number
}

export interface BackupFolderPlugin {
  pick(): Promise<BackupFolderInfo>
  // Forgets a picked folder and returns the default one, which every other
  // call then uses.
  useDefault(): Promise<BackupFolderInfo>
  status(): Promise<{ reachable: boolean; name?: string; local?: boolean }>
  write(options: { name: string; text: string }): Promise<void>
  read(options: { name: string }): Promise<{ text: string }>
  list(): Promise<{ files: BackupFolderFile[] }>
  remove(options: { name: string }): Promise<void>
  clear(): Promise<void>
}

const BackupFolder = registerPlugin<BackupFolderPlugin>('BackupFolder', {
  web: () => import('./backupFolderWeb').then((m) => new m.BackupFolderWeb()),
})

// The web stand-in counts as available so the e2e suite's browser local mode
// runs the same path.
export const backupFolderAvailable =
  Capacitor.getPlatform() === 'web' || Capacitor.isPluginAvailable('BackupFolder')

export const LATEST_FILE = 'RepBunny backup.json'
const DATED_FILE = /^RepBunny backup (\d{4}-\d{2}-\d{2})\.json$/
// Issue #871: a copy already in a newly picked folder (the old phone's, say)
// is kept under this name before the first save, and the prune never matches it.
const KEPT_PREFIX = 'RepBunny backup kept'
// One dated copy a week, the newest few kept, so a bad save (or a phone that
// lost its data) can't overwrite the only good copy.
const DATED_EVERY_MS = 7 * 24 * 60 * 60 * 1000
export const DATED_KEEP = 4

// Under the repbunny- prefix, so Erase all data forgets the folder too and
// can't then overwrite a good copy with an empty one.
const KEY = 'repbunny-backup-folder'
// Set when the person turned the copy off (#874). Erase all data clears it,
// so an erased phone starts with the copy on again.
const OFF_KEY = 'repbunny-backup-folder-off'

interface Saved {
  name: string
  local: boolean
  lastSavedAt: string | null
  lastDatedAt: string | null
  // Set when a save failed because the folder couldn't be reached; cleared by
  // the next good save. noted marks that the finish recap already said so.
  unreachable?: boolean
  noted?: boolean
  // The name (without .json) the copy already in this folder was kept as.
  kept?: string
  // True for the folder the app picked (#874), not the person.
  auto?: boolean
}

interface FolderState {
  name: string
  local: boolean
  auto: boolean
  lastSavedAt: string | null
  kept?: string
}

export type AutoCopyState =
  | { status: 'off' }
  | ({ status: 'on' } & FolderState)
  | ({ status: 'unreachable' } & FolderState)

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Saved) : null
  } catch {
    return null
  }
}

function write(saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(KEY, JSON.stringify(saved))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the state below still updates for this session.
  }
  autoCopy.value = stateOf(saved)
}

function stateOf(saved: Saved | null): AutoCopyState {
  if (!saved) return { status: 'off' }
  const { name, local, lastSavedAt, kept } = saved
  return { status: saved.unreachable ? 'unreachable' : 'on', name, local, auto: !!saved.auto, lastSavedAt, kept }
}

export const autoCopy = ref<AutoCopyState>(stateOf(read()))

function turnedOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === '1'
  } catch {
    return false
  }
}

function setTurnedOff(off: boolean) {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1')
    else localStorage.removeItem(OFF_KEY)
  } catch {
    // Storage blocked: the state below still updates for this session.
  }
}

// On by default (#874): sets up the app's own folder unless the person has a
// folder or turned the copy off. Existing installs get it on their first
// launch of this version too.
let ensuring: Promise<void> | null = null
export function ensureAutoCopy(): Promise<void> {
  if (!backupFolderAvailable || read() || turnedOff()) return Promise.resolve()
  ensuring ??= useDefault()
    .catch((e) => console.warn('Could not set up the automatic copy', e))
    .finally(() => (ensuring = null))
  return ensuring
}

async function useDefault() {
  const info = await BackupFolder.useDefault()
  write({ name: info.name, local: info.local, lastSavedAt: null, lastDatedAt: null, auto: true })
}

// Checks the folder is still there (access revoked, folder deleted) when the
// Your data screen opens. The default folder's name follows the phone: iCloud
// Drive signed out moves it to the app's own folder on the iPhone.
export async function refreshAutoCopy() {
  await ensureAutoCopy()
  const saved = read()
  if (!saved || !backupFolderAvailable) return
  try {
    const status = await BackupFolder.status()
    const reachable = status.reachable
    const moved = saved.auto && reachable && status.name !== undefined && (status.name !== saved.name || status.local !== saved.local)
    if (reachable === !saved.unreachable && !moved) return
    write({
      ...saved,
      ...(moved && { name: status.name!, local: !!status.local }),
      unreachable: !reachable,
      noted: reachable ? false : saved.noted,
    })
  } catch {
    write({ ...saved, unreachable: true })
  }
}

// The one note on the next finish recap after a save failed.
export function takeUnreachableNote(): boolean {
  const saved = read()
  if (!saved?.unreachable || saved.noted) return false
  write({ ...saved, noted: true })
  return true
}

// Opens the folder picker, then saves a first copy. Resolves to false when
// the person closed the picker.
export async function chooseBackupFolder(): Promise<boolean> {
  let info: BackupFolderInfo
  try {
    info = await BackupFolder.pick()
  } catch (e) {
    if (isCancel(e)) return false
    throw new Error("Couldn't use that folder. Try another one.")
  }
  setTurnedOff(false)
  write({ name: info.name, local: info.local, lastSavedAt: null, lastDatedAt: null })
  await saveAutoCopy()
  return true
}

// Back from a picked folder to the app's own, or on again after Turn it off.
export async function useDefaultFolder() {
  setTurnedOff(false)
  try {
    await useDefault()
  } catch {
    throw new Error("Couldn't set up RepBunny's folder. Try again, or choose a folder.")
  }
  await saveAutoCopy()
}

// Only ever the person's choice, behind the warning (AutoCopyOffConfirm.vue).
export async function turnOffAutoCopy() {
  setTurnedOff(true)
  write(null)
  try {
    await BackupFolder.clear()
  } catch {
    // The app has already forgotten it; the phone's grant is harmless.
  }
}

function isCancel(e: unknown) {
  const message = e instanceof Error ? e.message : String(e)
  return /cancel/i.test(message)
}

function dateStamp(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// After every finished workout: the restore point (#430), then the copy.
export async function saveCopiesAfterFinish(label: string) {
  await saveRestorePoint('workout', label)
  await saveAutoCopy()
}

let saving: Promise<void> = Promise.resolve()

// Also after every finished workout. Never throws: a failed save never interrupts
// the workout, it shows in Your data and as one note on the next recap.
export function saveAutoCopy(now = new Date()): Promise<void> {
  if (!backupFolderAvailable || turnedOff()) return saving
  saving = saving.then(() => ensureAutoCopy()).then(() => save(now))
  return saving
}

async function save(now: Date) {
  const saved = read()
  if (!saved) return
  try {
    const backup = await buildBackup()
    // Nothing to protect yet, and an empty save must never replace a good
    // copy (a reset phone, say).
    if (backup.workouts.length === 0) return
    const text = JSON.stringify(backup)
    // The first save from this phone to this folder never overwrites a copy
    // that's already there: it may hold more history than this phone.
    const kept = saved.lastSavedAt ? saved.kept : await keepExisting(now)
    await BackupFolder.write({ name: LATEST_FILE, text })
    let lastDatedAt = saved.lastDatedAt
    if (!lastDatedAt || now.getTime() - Date.parse(lastDatedAt) >= DATED_EVERY_MS) {
      await BackupFolder.write({ name: `RepBunny backup ${dateStamp(now)}.json`, text })
      lastDatedAt = now.toISOString()
      await pruneDated()
    }
    write({ ...saved, lastSavedAt: now.toISOString(), lastDatedAt, kept, unreachable: false, noted: false })
  } catch (e) {
    console.warn('Could not save the automatic copy', e)
    const current = read()
    if (current) write({ ...current, unreachable: true })
  }
}

// Copies the folder's existing RepBunny backup.json to a kept name that's
// free, and returns that name without .json (undefined when there was none).
async function keepExisting(now: Date): Promise<string | undefined> {
  const { files } = await BackupFolder.list()
  const names = new Set(files.map((file) => file.name))
  if (!names.has(LATEST_FILE)) return undefined
  const { text } = await BackupFolder.read({ name: LATEST_FILE })
  const base = `${KEPT_PREFIX} ${dateStamp(now)}`
  let name = base
  for (let n = 2; names.has(`${name}.json`); n++) name = `${base} ${n}`
  await BackupFolder.write({ name: `${name}.json`, text })
  return name
}

async function pruneDated() {
  const { files } = await BackupFolder.list()
  const dated = files
    .map((file) => ({ file, date: DATED_FILE.exec(file.name)?.[1] }))
    .filter((entry): entry is { file: BackupFolderFile; date: string } => !!entry.date)
    .sort((a, b) => b.date.localeCompare(a.date))
  for (const { file } of dated.slice(DATED_KEEP)) {
    try {
      await BackupFolder.remove({ name: file.name })
    } catch {
      // An old copy left behind is harmless.
    }
  }
}

// Issue #874: Your copies, the copies in the folder with what's in each,
// newest first. Reads the folder in use (or the default one when the copy is
// off), so a new install can list what an old one left there.
export type CopyKind = 'latest' | 'weekly' | 'kept'

export interface CopySummary {
  file: string
  kind: CopyKind
  exportedAt: string
  workouts: number
}

function kindOf(name: string): CopyKind | null {
  if (name === LATEST_FILE) return 'latest'
  if (DATED_FILE.test(name)) return 'weekly'
  if (name.startsWith(KEPT_PREFIX) && name.endsWith('.json')) return 'kept'
  return null
}

export async function listCopies(): Promise<CopySummary[]> {
  if (!backupFolderAvailable) return []
  await saving
  let files: BackupFolderFile[]
  try {
    files = (await BackupFolder.list()).files
  } catch {
    throw new Error("RepBunny can't reach the folder.")
  }
  const copies: CopySummary[] = []
  for (const file of files) {
    const kind = kindOf(file.name)
    if (!kind) continue
    const backup = await loadCopy(file.name).catch(() => null)
    if (!backup) continue
    copies.push({ file: file.name, kind, exportedAt: backup.exported_at, workouts: backup.workouts.length })
  }
  // The latest first, then by date.
  return copies.sort((a, b) => Number(b.kind === 'latest') - Number(a.kind === 'latest') || b.exportedAt.localeCompare(a.exportedAt))
}

export async function loadCopy(file: string): Promise<BackupFile | null> {
  const { text } = await BackupFolder.read({ name: file })
  return parseBackup(text)
}

export const COPY_LABELS: Record<CopyKind, string> = { latest: 'Latest copy', weekly: 'Weekly copy', kept: 'Kept copy' }
