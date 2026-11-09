// Issue #558: release notes live one file per change under release-notes/, so two lanes adding
// notes at the same time never touch the same file. Each `release-notes/<issue>.json` holds one
// item: `{ "text": "...", "guide": "<slug>/", "platforms": ["android"], "theme": "halloween" }` (guide, platforms,
// and theme optional; see src/lib/releaseNotes.ts for what they mean). Nothing in the file says when it
// shipped: the commit that added it does. Its date is that commit's date, and its build is that
// commit's build (`git rev-list --count` plus the #946 offset, scripts/lib/history.mjs), the build
// number the app shows. Notes the cutover's snapshot commit brought over keep their real date and
// build from scripts/lib/pre-cutover.json. A file not committed yet
// (a local run) gets today and the next build. `release-notes/archive.json` is the frozen list
// from before #558, `{ date, build, items }` per day; never add to it.
//
// The Vite config bakes the result into the app (`__RELEASE_NOTES__`), and Node scripts and the
// e2e specs call loadReleaseNotes() directly.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureFullHistory } from './build-version.mjs'
import { buildFromCount, PRE_CUTOVER_NOTES, SNAPSHOT_COMMIT } from './history.mjs'

export const NOTES_DIR = 'release-notes'
export const ARCHIVE_FILE = 'archive.json'
export const NOTE_FILE = /^[a-z0-9-]+\.json$/
const ITEM_KEYS = ['text', 'guide', 'platforms', 'theme']
const PLATFORMS = ['pwa', 'ios', 'android']

// Throws when a note file isn't one item in the shape above, so a bad note fails the build.
export function checkItem(item, name) {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new Error(`${name}: must be one { "text": ... } object`)
  for (const key of Object.keys(item)) if (!ITEM_KEYS.includes(key)) throw new Error(`${name}: unknown key "${key}"`)
  if (typeof item.text !== 'string' || item.text.trim() === '') throw new Error(`${name}: "text" must be a non-empty string`)
  if (item.guide !== undefined && !/^[a-z0-9-]+\/$/.test(item.guide)) throw new Error(`${name}: "guide" must look like "rest-timer/"`)
  if (item.platforms !== undefined) {
    if (!Array.isArray(item.platforms) || item.platforms.length === 0) throw new Error(`${name}: "platforms" must be a non-empty list`)
    for (const p of item.platforms) if (!PLATFORMS.includes(p)) throw new Error(`${name}: unknown platform "${p}"`)
  }
  if (item.theme !== undefined && !/^[a-z0-9-]+$/.test(item.theme)) throw new Error(`${name}: "theme" must be a theme id like "halloween"`)
  // A plain note stays a plain string, like the archive's.
  return item.guide === undefined && item.platforms === undefined && item.theme === undefined ? item.text : item
}

// The archive's days plus the dated note files (`{ file, date, build, item }`), one entry per
// day, newest first. A day's newest notes come first, and its build is its newest note's (the
// in-app "new" badge). `builds` runs parallel to `items` with each item's own build, which is what
// store notes and the sprint review filter on (#610): a day's build alone would re-send the whole
// day whenever one later note landed. Archive items all share their day's build.
export function groupReleaseNotes(archive, entries) {
  const days = new Map(archive.map((day) => [day.date, { ...day, items: [...day.items], builds: day.items.map(() => day.build) }]))
  const sorted = [...entries].sort((a, b) => a.build - b.build || a.file.localeCompare(b.file))
  for (const entry of sorted) {
    const day = days.get(entry.date)
    if (day) {
      day.items.unshift(entry.item)
      day.builds.unshift(entry.build)
      day.build = Math.max(day.build, entry.build)
    } else {
      days.set(entry.date, { date: entry.date, build: entry.build, items: [entry.item], builds: [entry.build] })
    }
  }
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).trim()
}

// RELEASE_NOTES_TODAY pins the date so a test run that crosses midnight dates uncommitted notes
// the same in the spec and the dev server (#623); playwright.config.ts sets it once per run.
export function today() {
  if (process.env.RELEASE_NOTES_TODAY) return process.env.RELEASE_NOTES_TODAY
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// path -> { date, build } of the latest commit that added it.
function addedIn(cwd) {
  const added = new Map()
  let log = ''
  try {
    log = git(cwd, 'log', '--no-renames', '--diff-filter=A', '--format=%x00%H %cs', '--name-only', '--', NOTES_DIR)
  } catch {
    return added
  }
  const counts = new Map()
  for (const chunk of log.split('\0').filter(Boolean)) {
    const [head, ...paths] = chunk.trim().split('\n')
    const [sha, date] = head.split(' ')
    for (const path of paths.filter(Boolean)) {
      if (added.has(path)) continue
      if (sha === SNAPSHOT_COMMIT && PRE_CUTOVER_NOTES[path]) {
        added.set(path, PRE_CUTOVER_NOTES[path])
        continue
      }
      if (!counts.has(sha)) counts.set(sha, buildFromCount(Number(git(cwd, 'rev-list', '--count', sha))))
      added.set(path, { date, build: counts.get(sha) })
    }
  }
  return added
}

function nextBuild(cwd) {
  try {
    return buildFromCount(Number(git(cwd, 'rev-list', '--count', 'HEAD'))) + 1
  } catch {
    return 0
  }
}

export function loadReleaseNotes(cwd = process.cwd()) {
  const dir = join(cwd, NOTES_DIR)
  const archivePath = join(dir, ARCHIVE_FILE)
  const archive = existsSync(archivePath) ? JSON.parse(readFileSync(archivePath, 'utf8')) : []
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f !== ARCHIVE_FILE && f.endsWith('.json')).sort() : []
  if (files.length === 0) return groupReleaseNotes(archive, [])
  ensureFullHistory(cwd)
  const added = addedIn(cwd)
  const pending = { date: today(), build: nextBuild(cwd) }
  const entries = files.map((file) => {
    if (!NOTE_FILE.test(file)) throw new Error(`${NOTES_DIR}/${file}: name it <issue>.json (lowercase letters, digits, dashes)`)
    const item = checkItem(JSON.parse(readFileSync(join(dir, file), 'utf8')), `${NOTES_DIR}/${file}`)
    return { file, item, ...(added.get(`${NOTES_DIR}/${file}`) ?? pending) }
  })
  return groupReleaseNotes(archive, entries)
}
