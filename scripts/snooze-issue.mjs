// Issue #749: lanes snooze date-bound issues themselves. An issue body or comment carrying
//   <!-- not-before: YYYY-MM-DD | <one-line reason> -->
// hides the issue from scripts/next-issue.mjs (and so from the lane dispatcher) until that
// date (UTC), when it becomes eligible with no label change. The latest marker wins.
//
//   node scripts/snooze-issue.mjs <N> <YYYY-MM-DD> "<reason>"   # post the marker (max 30 days out)
//
// This is the one place the format lives. A wait longer than 30 days is an owner question,
// not a snooze. Uses the REST API only (cloud sessions refuse GraphQL, #238).
import { execFileSync } from 'node:child_process'
import { delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
import { backlogApi } from './backlog-repo.mjs'

export const MAX_DAYS = 30
const NOT_BEFORE = /<!--\s*not-before:\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^>]*?)\s*-->/g

export function snoozeMarker(date, reason, today = new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || Number.isNaN(Date.parse(date))) throw new Error('the date must be YYYY-MM-DD')
  const why = (reason ?? '').trim()
  if (!why) throw new Error('a one-line reason is required')
  if (/[<>\n]/.test(why)) throw new Error('the reason must be one line without < or >')
  const days = (Date.parse(date) - Date.parse(today)) / 86_400_000
  if (days < 0) throw new Error(`${date} is in the past`)
  if (days > MAX_DAYS) throw new Error(`${date} is more than ${MAX_DAYS} days out: a longer wait is an owner question, not a snooze`)
  return `<!-- not-before: ${date} | ${why} -->`
}

// The latest marker across texts given oldest first (the body, then comments), or null.
export function latestNotBefore(texts) {
  let found = null
  for (const text of texts) for (const m of (text ?? '').matchAll(NOT_BEFORE)) found = { date: m[1], reason: m[2] }
  return found
}

// True while `today` (YYYY-MM-DD, UTC) is before the marker's date.
export const isSnoozed = (marker, today = new Date().toISOString().slice(0, 10)) => !!marker && today < marker.date

function gh(args, input) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PATH: `${process.env.PATH}${delimiter}C:\\Program Files\\GitHub CLI` },
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [number, date, reason] = process.argv.slice(2)
  try {
    if (!/^\d+$/.test(number ?? '')) throw new Error('usage: node scripts/snooze-issue.mjs <N> <YYYY-MM-DD> "<reason>"')
    const marker = snoozeMarker(date, reason)
    const body = `Snoozed until ${date}: ${reason.trim()}. The lanes skip this issue until then and pick it up on their own.\n\n${marker}`
    gh(['api', '-X', 'POST', `${backlogApi()}/issues/${number}/comments`, '-F', 'body=@-'], body)
    console.log(`#${number} snoozed until ${date}`)
  } catch (e) {
    console.error(`snooze-issue: ${e.message}`)
    process.exit(2)
  }
}
