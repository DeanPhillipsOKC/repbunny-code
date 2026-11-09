// Issue #746: dated owner steps go on the owner's Google Calendar (docs/decisions.md). Any issue
// body or comment that needs the owner on or after a date carries
//
//   <!-- owner-date: YYYY-MM-DD[THH:MM] | <short what> -->
//
// and an `On hold until YYYY-MM-DD` comment counts the same way. Whoever puts the event on the
// calendar replies with `<!-- calendar-synced: <event id> <date> -->` (this script's --synced), and
// deleting it for a closed issue leaves `<!-- calendar-removed: <event id> -->` (--removed). A
// calendar call that fails leaves `<!-- calendar-failed: YYYY-MM-DD -->` (--failed), which holds
// that entry back until the next day, so a broken connector can't refire the routine every cycle.
// This script finds what still needs doing; the Owner calendar routine (/owner-calendar headless) does
// it with the Google Calendar connector, and scripts/dispatch-calendar.mjs fires that routine only
// when something is pending. No AI here. See docs/backlog-runner.md > Owner calendar.
//
//   node scripts/owner-calendar.mjs --pending          # JSON: what the routine has to do
//   node scripts/owner-calendar.mjs --pending --dry-run  # the same, without fixing labels
//   node scripts/owner-calendar.mjs --pending --days 60  # look for unlabeled markers further back
//   node scripts/owner-calendar.mjs --synced 530 --event <id> --date 2026-10-29T09:00 --title "<event title>"
//   node scripts/owner-calendar.mjs --removed 530 --event <id>
//   node scripts/owner-calendar.mjs --failed 530 --reason "no Google Calendar connector"
//
// Issues with a live marker carry the `owner-date` label, so only they are read in full each
// cycle; new markers are found from the last few days of comments and open issue bodies.
// Everything goes through the REST API with explicit pages: cloud sessions refuse GraphQL and
// `--paginate` (#335).
import { execFileSync } from 'node:child_process'
import { delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
import { backlogApi } from './backlog-repo.mjs'

export const LABEL = 'owner-date'
export const TITLE_PREFIX = 'RepBunny: '

const OWNER_DATE = /<!--\s*owner-date:\s*(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?\s*\|\s*([^>]*?)\s*-->/g
const SYNCED = /<!--\s*calendar-synced:\s*(\S+)\s+(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)\s*-->/g
const REMOVED = /<!--\s*calendar-removed:\s*(\S+)\s*-->/g
const FAILED = /<!--\s*calendar-failed:\s*(\d{4}-\d{2}-\d{2})\s*-->/g
// The backlog's pause convention (docs/backlog.md): a line starting "On hold ... until <date>".
const ON_HOLD = /^[ \t]*on hold\b[^\n]*?\buntil\s+(?:about\s+|around\s+|~)?(\d{4}-\d{2}-\d{2})/gim

// True for a comment that only records a calendar sync, so ask-dean.mjs and dean-replied.yml
// never read it as the owner's answer (agents post as the owner).
export function isCalendarRecord(body) {
  return /<!--\s*calendar-(synced|removed|failed):/.test(body ?? '')
}

// True for a comment an agent wrote (#1009). Agents post as the owner, so the attribution footer
// or one of their HTML markers is the only tell. A reply the owner types carries neither. Keep in
// step with the `!contains(...)` list in .github/workflows/dean-replied.yml.
export function isAgentComment(body) {
  const b = body ?? ''
  return (
    /Generated (with|by) \[Claude Code\]/.test(b) ||
    /<!--\s*(next-item|review-pr|review-closed|run-cost:|run-budget|sprint-review|support-evidence|qa-batch-asked|ask-dean|not-before:)/.test(b)
  )
}

// The marker for a dated owner step. `spec` is "YYYY-MM-DD[THH:MM] | what".
export function ownerDateMarker(spec) {
  const m = /^\s*(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)\s*\|\s*(.+?)\s*$/.exec(spec ?? '')
  if (!m || Number.isNaN(Date.parse(m[1].slice(0, 10)))) throw new Error('--owner-date takes "YYYY-MM-DD[THH:MM] | what"')
  if (/-->|[<>]/.test(m[2])) throw new Error('--owner-date: the "what" can\'t contain < or >')
  return `<!-- owner-date: ${m[1]} | ${m[2]} -->`
}

export function eventTitle(what, number) {
  return `${TITLE_PREFIX}${what} (#${number})`
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

// Every marker in `items` (the issue body, then its comments, oldest first: { body, url }), in
// order.
export function markers(items, title = '') {
  const found = []
  items.forEach((item, index) => {
    const body = item.body ?? ''
    for (const m of body.matchAll(OWNER_DATE)) {
      found.push({ kind: 'date', index, at: m.index, when: m[2] ? `${m[1]}T${m[2]}` : m[1], what: m[3], url: item.url })
    }
    // Only comments: an issue body that explains the convention isn't a pause.
    if (index > 0) {
      for (const m of body.matchAll(ON_HOLD)) {
        found.push({ kind: 'date', index, at: m.index, when: m[1], what: clip(`resume ${title}`, 70), url: item.url })
      }
    }
    for (const m of body.matchAll(SYNCED)) found.push({ kind: 'synced', index, at: m.index, id: m[1], when: m[2] })
    for (const m of body.matchAll(REMOVED)) found.push({ kind: 'removed', index, at: m.index, id: m[1] })
    for (const m of body.matchAll(FAILED)) found.push({ kind: 'failed', index, at: m.index, when: m[1] })
  })
  return found.sort((a, b) => a.index - b.index || a.at - b.at)
}

const isAfter = (m, ref) => !ref || m.index > ref.index || (m.index === ref.index && m.at > ref.at)

// What the routine has to do for one issue ({ number, title, url, state }), or null, plus whether
// it should keep the `owner-date` label. `today` is YYYY-MM-DD. Each action carries `failures`,
// the failed tries since the marker or sync it's about; one recorded today holds it back.
export function calendarAction(issue, items, today) {
  const action = calendarActionUntried(issue, items, today)
  if (!action.action) return action
  const all = markers(items, issue.title)
  const ref = all.findLast((m) => m.kind === (action.action.action === 'delete' ? 'synced' : 'date'))
  const failed = all.filter((m) => m.kind === 'failed' && isAfter(m, ref))
  if (failed.at(-1)?.when >= today) return { action: null, keep: true }
  return { action: { ...action.action, failures: failed.length }, keep: true }
}

function calendarActionUntried(issue, items, today) {
  const all = markers(items, issue.title)
  const removed = new Set(all.filter((m) => m.kind === 'removed').map((m) => m.id))
  const date = all.findLast((m) => m.kind === 'date')
  const syncs = all.filter((m) => m.kind === 'synced' && !removed.has(m.id))
  const sync = syncs.at(-1)
  const future = (when) => when.slice(0, 10) >= today

  if (issue.state === 'closed') {
    // Delete every event still on the calendar for a date that hasn't passed.
    const live = [...new Map(syncs.filter((s) => future(s.when)).map((s) => [s.id, s])).values()]
    if (live.length === 0) return { action: null, keep: false }
    return {
      action: { action: 'delete', number: issue.number, title: issue.title, url: issue.url, events: live.map((s) => ({ eventId: s.id, when: s.when })) },
      keep: true,
    }
  }

  if (!date || !future(date.when)) return { action: null, keep: false }
  // A record with only a day (an interactive session's) settles a timed marker on that day.
  const sameWhen = (when) => when === date.when || when === date.when.slice(0, 10)
  const done = sync && isAfter(sync, date) && sameWhen(sync.when)
  if (done) return { action: null, keep: true }
  const [day, time = null] = date.when.split('T')
  return {
    action: {
      action: 'sync',
      number: issue.number,
      title: issue.title,
      url: issue.url,
      date: day,
      time,
      what: date.what,
      eventTitle: eventTitle(date.what, issue.number),
      source: date.url,
      // An event an earlier sync made for this issue: move it rather than add another.
      eventId: sync?.id ?? null,
    },
    keep: true,
  }
}

function gh(args) {
  const path = process.platform === 'win32' ? `${process.env.PATH}${delimiter}C:\\Program Files\\GitHub CLI` : process.env.PATH
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, PATH: path } }).trim()
}

function pages(path) {
  const all = []
  for (let page = 1; ; page++) {
    const items = JSON.parse(gh(['api', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`]))
    all.push(...items)
    if (items.length < 100) return all
  }
}

const hasMarker = (body) => /<!--\s*owner-date:/.test(body ?? '') || /^[ \t]*on hold\b[^\n]*?\buntil\s/im.test(body ?? '')

// Every issue with a live marker, as { issue, items }: the labeled ones, plus any whose body (open
// issues) or a comment from the last `days` days has a marker.
function candidates(days) {
  const byNumber = new Map()
  const add = (i) => !i.pull_request && byNumber.set(i.number, i)
  pages(`${backlogApi()}/issues?state=all&labels=${LABEL}`).forEach(add)
  pages(`${backlogApi()}/issues?state=open`).filter((i) => hasMarker(i.body)).forEach(add)
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const numbers = new Set(
    pages(`${backlogApi()}/issues/comments?since=${since}`)
      .filter((c) => hasMarker(c.body))
      .map((c) => Number(c.issue_url.split('/').pop())),
  )
  for (const n of numbers) if (!byNumber.has(n)) add(JSON.parse(gh(['api', `${backlogApi()}/issues/${n}`])))
  return [...byNumber.values()].map((issue) => ({
    issue,
    items: [
      { body: issue.body ?? '', url: issue.html_url },
      ...pages(`${backlogApi()}/issues/${issue.number}/comments`).map((c) => ({ body: c.body ?? '', url: c.html_url })),
    ],
  }))
}

function ensureLabel() {
  try {
    gh(['api', '-X', 'POST', `${backlogApi()}/labels`, '-f', `name=${LABEL}`, '-f', 'color=C5DEF5', '-f', 'description=Has a dated owner step for the Google Calendar (#746)'])
  } catch {
    // Already exists.
  }
}

export function labelIssue(number) {
  ensureLabel()
  gh(['api', '-X', 'POST', `${backlogApi()}/issues/${number}/labels`, '-f', `labels[]=${LABEL}`])
}

// The pending actions. Unless `dryRun`, also puts the `owner-date` label on every issue that still
// needs watching and takes it off the rest, so later cycles read only those.
export function pending({ days = 3, dryRun = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const actions = []
  for (const { issue, items } of candidates(days)) {
    const { action, keep } = calendarAction({ number: issue.number, title: issue.title, url: issue.html_url, state: issue.state }, items, today)
    if (action) actions.push(action)
    const labeled = issue.labels.some((l) => l.name === LABEL)
    if (dryRun || keep === labeled) continue
    if (keep) labelIssue(issue.number)
    else gh(['api', '-X', 'DELETE', `${backlogApi()}/issues/${issue.number}/labels/${LABEL}`])
  }
  return actions.sort((a, b) => a.number - b.number)
}

function post(number, body) {
  gh(['api', '-X', 'POST', `${backlogApi()}/issues/${number}/comments`, '-f', `body=${body}`])
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (['--pending', '--dry-run'].includes(a)) args[a.slice(2)] = true
    else if (['--synced', '--removed', '--failed', '--event', '--date', '--title', '--days', '--reason'].includes(a)) args[a.slice(2)] = argv[++i]
    else throw new Error(`unknown argument: ${a}`)
  }
  return args
}

function main(argv) {
  const args = parseArgs(argv)
  const footer = '\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_'
  if (args.pending) {
    const days = args.days === undefined ? 3 : Number(args.days)
    if (!Number.isInteger(days) || days < 1) throw new Error('--days takes a whole number of days')
    return console.log(JSON.stringify(pending({ days, dryRun: args['dry-run'] }), null, 2))
  }
  const number = args.synced ?? args.removed ?? args.failed
  if (!/^\d+$/.test(number ?? '')) throw new Error('pass --pending, --synced <N>, --removed <N>, or --failed <N>')
  if (args.failed) {
    const reason = (args.reason ?? '').trim()
    if (!reason || /[<>]/.test(reason)) throw new Error('--failed takes --reason "<short reason>" (no < or >)')
    const today = new Date().toISOString().slice(0, 10)
    post(number, `<!-- calendar-failed: ${today} -->\nCalendar: couldn't update the owner's Google Calendar (${reason}). Trying again tomorrow (#746).${footer}`)
    return console.log(`#${number}: recorded a failed calendar update for ${today}`)
  }
  if (!/^[\w-]+$/.test(args.event ?? '')) throw new Error('--event takes the calendar event id')
  if (args.synced) {
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(args.date ?? '')) throw new Error('--date takes YYYY-MM-DD[THH:MM]')
    const title = args.title ? `"${args.title}" is` : 'The event is'
    post(number, `<!-- calendar-synced: ${args.event} ${args.date} -->\nCalendar: ${title} on the owner's Google Calendar for ${args.date.replace('T', ' at ')} (#746).${footer}`)
    labelIssue(number)
    return console.log(`#${number}: recorded event ${args.event} for ${args.date}`)
  }
  post(number, `<!-- calendar-removed: ${args.event} -->\nCalendar: removed the owner's event for this closed issue (#746).${footer}`)
  console.log(`#${number}: recorded event ${args.event} as removed`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
