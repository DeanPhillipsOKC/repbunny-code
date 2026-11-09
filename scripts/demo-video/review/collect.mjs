#!/usr/bin/env node
// Sprint review, step 1 (#606): what's going out in the next store release, and the clip for each
// change. Reads the release-note files added since the latest store/v* tag (the same set
// /release's preview and collect-release-notes.mjs count), then for each note's issue reads its
// closing comments for the `Clip:` or `No clip: <reason>` line lanes write (#605, README.md >
// Ship it), and copies the clip's segment.mp4 and poster.jpg out of the claude/issue-assets
// branch into logs/demo-video/review/<issue>/. Nothing is recorded here, so it runs on a GitHub
// runner with no dev server.
//
//   node scripts/demo-video/review/collect.mjs [--version 1.2.3] [--since store/v1.2.0]
//
// Writes logs/demo-video/review/release.json:
//   { tag, version, changes: [{ issue, title, notes, clip, reason, trivial, spec }], upNext }
// `clip` is true when a segment was found; otherwise `reason` says why not. `version` is the
// next store version: minor when any change is a `feature` or `ux-intensive` issue, else patch,
// as /release picks it, unless --version overrides it. --since reviews from an older tag (a dry
// run against changes that already shipped).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { backlogApi } from '../../backlog-repo.mjs'
import { isPreCutoverTag, PRE_CUTOVER_NOTES, sinceTagRange, storeTags, tagBuild } from '../../lib/history.mjs'

export const WORK = join('logs', 'demo-video', 'review')
export const ASSETS = 'claude/issue-assets'
const FACING = ['feature', 'bug', 'ux-intensive']

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 26 }).trim()
const gh = (...args) => JSON.parse(execFileSync(process.env.GH ?? 'gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }))

function pages(path) {
  const all = []
  for (let page = 1; ; page++) {
    const rows = gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    all.push(...rows)
    if (rows.length < 100) return all
  }
}

// The `Clip:` or `No clip:` line from an issue's comments, newest first. Returns
// { clip: true } or { clip: false, reason } or null when no comment has one.
export function clipLine(bodies) {
  for (const body of [...bodies].reverse()) {
    for (const line of body.split('\n')) {
      const no = line.match(/^\s*(?:[-*]\s*)?\**No clip:?\**:?\s*(.+)$/i)
      if (no) return { clip: false, reason: no[1].trim().replace(/[.\s]+$/, '') }
      if (/\[Clip: segment\.mp4\]/.test(line)) return { clip: true }
    }
  }
  return null
}

// Pure: the notes the cutover's snapshot commit brought over that shipped after a pre-cutover
// store tag's build, oldest first (#946). Their adding commit isn't in this repo.
export function preCutoverNotesAfter(build, notes = PRE_CUTOVER_NOTES) {
  return Object.entries(notes)
    .filter(([, n]) => n.build > build)
    .sort(([a, x], [b, y]) => x.build - y.build || a.localeCompare(b))
    .map(([file]) => file)
}

// release-notes/<issue>.json and <issue>-2.json added since `tag`, grouped by issue, in the order
// they shipped.
export function notesSince(tag) {
  const before = isPreCutoverTag(tag) ? preCutoverNotesAfter(tagBuild(tag)) : []
  const added = git('log', '--reverse', '--no-renames', '--diff-filter=A', '--format=', '--name-only', sinceTagRange(tag), '--', 'release-notes/')
    .split('\n')
  const files = [...before, ...added]
    .filter((f) => f && basename(f) !== 'archive.json' && existsSync(f))
  const byIssue = new Map()
  for (const file of [...new Set(files)]) {
    const issue = Number(basename(file).match(/^(\d+)/)?.[1])
    if (!issue) continue
    const item = JSON.parse(readFileSync(file, 'utf8'))
    if (!byIssue.has(issue)) byIssue.set(issue, [])
    byIssue.get(issue).push(item)
  }
  return byIssue
}

// The highest store tag, counting the ones cut before the move (#946).
function latestTag() {
  const parse = (t) => t.replace('store/v', '').split('.').map(Number)
  const cmp = (a, b) => parse(a).reduce((d, x, i) => d || x - parse(b)[i], 0)
  return storeTags().sort(cmp).at(-1) ?? null
}

export function nextVersion(tag, minor) {
  const [a, b, c] = (tag ?? 'store/v0.0.0').replace('store/v', '').split('.').map(Number)
  if (!tag) return '1.0.0'
  return minor ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`
}

// The top user-facing work in progress and queued (the end card and the issue's "Up next").
function upNext() {
  const facing = (labels) => labels.some((l) => FACING.includes(l))
  const claimed = []
  for (const label of ['status:in-progress', 'status:dispatched']) {
    for (const r of pages(`${backlogApi()}/issues?state=open&labels=${encodeURIComponent(label)}`)) {
      if (!r.pull_request && facing(r.labels.map((l) => l.name))) claimed.push({ number: r.number, title: r.title, note: ' (in progress)' })
    }
  }
  const queue = JSON.parse(execFileSync('node', ['scripts/next-issue.mjs'], { encoding: 'utf8', maxBuffer: 1 << 26 }))
  const seen = new Set(claimed.map((i) => i.number))
  return [...claimed, ...queue.filter((i) => facing(i.labels) && !seen.has(i.number))].slice(0, 3).map((i) => ({ issue: i.number, title: i.title, note: i.note ?? '' }))
}

// Copies <issue>/segment.mp4 and poster.jpg from the assets branch. True when the segment exists.
function fetchClip(issue, ref) {
  const dir = join(WORK, String(issue))
  mkdirSync(dir, { recursive: true })
  let ok = false
  for (const name of ['segment.mp4', 'poster.jpg']) {
    try {
      const data = execFileSync('git', ['show', `${ref}:${issue}/${name}`], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
      writeFileSync(join(dir, name), data)
      if (name === 'segment.mp4') ok = true
    } catch {
      // Not on the branch.
    }
  }
  return ok
}

export async function collect({ version, since } = {}) {
  const tag = since || latestTag()
  if (!tag) throw new Error('No store/v* tag yet, so there is no release to review against.')
  let ref = null
  try {
    git('fetch', '-q', 'origin', `+refs/heads/${ASSETS}:refs/remotes/origin/${ASSETS}`)
    ref = `refs/remotes/origin/${ASSETS}`
  } catch {
    console.warn(`No ${ASSETS} branch: every change is listed as not shown.`)
  }
  const changes = []
  for (const [issue, notes] of notesSince(tag)) {
    const info = gh(`${backlogApi()}/issues/${issue}`)
    const labels = info.labels.map((l) => l.name)
    const line = clipLine(pages(`${backlogApi()}/issues/${issue}/comments`).map((c) => c.body ?? ''))
    const specPath = resolve('scripts/demo-video/review/clips', `${issue}.mjs`)
    const spec = existsSync(specPath) ? (await import(pathToFileURL(specPath).href)).default : null
    const found = line?.clip === false ? false : ref ? fetchClip(issue, ref) : false
    const reason = found ? null : line?.clip === false ? line.reason : line?.clip ? "the clip isn't on the assets branch" : 'none recorded'
    changes.push({
      issue,
      title: info.title,
      labels,
      notes: notes.map((n) => (typeof n === 'string' ? n : n.text)),
      platforms: notes.flatMap((n) => n.platforms ?? []),
      clip: found,
      reason,
      trivial: !found && /^trivial\b/i.test(reason ?? ''),
      cardTitle: spec?.title ?? null,
    })
  }
  const minor = changes.some((c) => c.labels.some((l) => l === 'feature' || l === 'ux-intensive'))
  const release = { tag, version: version || nextVersion(tag, minor), bump: version ? 'exact' : minor ? 'minor' : 'patch', changes, upNext: upNext() }
  mkdirSync(WORK, { recursive: true })
  writeFileSync(join(WORK, 'release.json'), JSON.stringify(release, null, 2))
  return release
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--version')
  const version = i >= 0 ? argv[i + 1]?.replace(/^v/, '') : ''
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Version ${version} isn't MAJOR.MINOR.PATCH.`)
  const j = argv.indexOf('--since')
  const r = await collect({ version, since: j >= 0 ? argv[j + 1] : '' })
  const shown = r.changes.filter((c) => c.clip).length
  console.log(`v${r.version} (${r.bump}) since ${r.tag}: ${r.changes.length} changes, ${shown} with a clip. Wrote ${join(WORK, 'release.json')}`)
}
