import { WebPlugin } from '@capacitor/core'
import type { BackupFolderFile, BackupFolderInfo, BackupFolderPlugin } from './backupFolder'

// Issue #432: the browser stand-in for the native backup folder, used only by
// the e2e suite's browser local mode. The "folder" is a localStorage entry
// outside the repbunny- prefix, because a real folder survives Erase all data.
// Tests steer it with more keys: backup-folder-web-pick ('cancel', or a JSON
// folder info), backup-folder-web-default (the app's own folder's JSON info,
// #874) and backup-folder-web-unreachable ('1'). The app's own folder keeps
// its files apart, under backup-folder-web-default-files, the way iCloud
// Drive › RepBunny outlives a deleted app.
const FILES = 'backup-folder-web-files'
const DEFAULT_FILES = 'backup-folder-web-default-files'
const PICK = 'backup-folder-web-pick'
const PICKED = 'backup-folder-web-picked'
const DEFAULT = 'backup-folder-web-default'
const UNREACHABLE = 'backup-folder-web-unreachable'

type Files = Record<string, { text: string; modified: number }>

function get(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function set(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the stand-in just forgets.
  }
}

// The picked folder's files, or the app's own folder's when none is picked.
function store() {
  return get(PICKED) ? FILES : DEFAULT_FILES
}

function files(): Files {
  try {
    return JSON.parse(get(store()) ?? '{}') as Files
  } catch {
    return {}
  }
}

function defaultInfo(): BackupFolderInfo {
  const info = get(DEFAULT)
  return info ? (JSON.parse(info) as BackupFolderInfo) : { name: 'iCloud Drive › RepBunny', local: false }
}

export class BackupFolderWeb extends WebPlugin implements BackupFolderPlugin {
  async pick(): Promise<BackupFolderInfo> {
    const pick = get(PICK)
    if (pick === 'cancel') throw new Error('Folder pick cancelled')
    const info: BackupFolderInfo = pick ? (JSON.parse(pick) as BackupFolderInfo) : { name: 'RepBunny', local: false }
    set(PICKED, JSON.stringify(info))
    return info
  }

  async useDefault(): Promise<BackupFolderInfo> {
    set(PICKED, null)
    return defaultInfo()
  }

  async status() {
    const picked = get(PICKED)
    const info = picked ? (JSON.parse(picked) as BackupFolderInfo) : defaultInfo()
    return { reachable: get(UNREACHABLE) !== '1', ...info }
  }

  private reachable() {
    if (get(UNREACHABLE) === '1') throw new Error('The backup folder is not reachable')
  }

  async write({ name, text }: { name: string; text: string }) {
    this.reachable()
    set(store(), JSON.stringify({ ...files(), [name]: { text, modified: Date.now() } }))
  }

  async read({ name }: { name: string }) {
    this.reachable()
    const file = files()[name]
    if (!file) throw new Error('No such file in the backup folder')
    return { text: file.text }
  }

  async list(): Promise<{ files: BackupFolderFile[] }> {
    this.reachable()
    return { files: Object.entries(files()).map(([name, file]) => ({ name, modified: file.modified })) }
  }

  async remove({ name }: { name: string }) {
    this.reachable()
    const next = files()
    delete next[name]
    set(store(), JSON.stringify(next))
  }

  async clear() {
    set(PICKED, null)
  }
}
