// Issue #746: starts the "Owner calendar" routine (/owner-calendar headless) only when a dated
// owner step needs adding, moving, or deleting on the owner's Google Calendar, so a cycle with
// nothing pending costs no routine run. No AI here. .github/workflows/dispatch-calendar.yml runs it
// every 2 hours; scripts/owner-calendar.mjs finds the work. docs/backlog-runner.md > Owner calendar.
//
//   node scripts/dispatch-calendar.mjs            # check, fix labels, fire if anything is pending
//   node scripts/dispatch-calendar.mjs --dry-run  # print what it would do, change nothing
//
// Needs CALENDAR_ROUTINE_ID and CALENDAR_ROUTINE_TOKEN (the routine's API trigger). With either
// unset it still checks and prints what's pending, but fires nothing: that's the off switch.
// Skips the fire when this workflow already fired in the last hour (the routine may still be
// running), and fires nothing while AUTOMATION_PAUSED is `true` (#682).
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { isPaused } from './automation-paused.mjs'
import { pending } from './owner-calendar.mjs'

const dryRun = process.argv.includes('--dry-run')
const { CALENDAR_ROUTINE_ID, CALENDAR_ROUTINE_TOKEN } = process.env
// The workflow's "Routine fired" step only runs when this script wrote fired=true.
const FIRE_STEP = 'Routine fired'

if (isPaused()) {
  console.log('calendar: paused (AUTOMATION_PAUSED is true), nothing fired')
  process.exit(0)
}

const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }))

// True when a run of dispatch-calendar.yml other than this one actually fired in the last hour.
function firedRecently() {
  if (!process.env.GITHUB_REPOSITORY) return false
  const since = new Date(Date.now() - 3600_000).toISOString()
  const runs = gh(
    `repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/dispatch-calendar.yml/runs?per_page=20&created=>${since}`,
  ).workflow_runs
  for (const run of runs) {
    if (String(run.id) === process.env.GITHUB_RUN_ID) continue
    const jobs = gh(`repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${run.id}/jobs`).jobs
    if (jobs.some((j) => j.steps?.some((s) => s.name === FIRE_STEP && s.conclusion === 'success'))) return true
  }
  return false
}

const actions = pending({ dryRun })
for (const a of actions) {
  console.log(`calendar: #${a.number} ${a.action === 'sync' ? `sync "${a.eventTitle}" on ${a.date}${a.time ? ` ${a.time}` : ''}` : `delete ${a.events.length} event(s)`}`)
}
if (actions.length === 0) {
  console.log('calendar: nothing pending')
  process.exit(0)
}
if (!CALENDAR_ROUTINE_ID || !CALENDAR_ROUTINE_TOKEN) {
  console.log('calendar: CALENDAR_ROUTINE_ID or CALENDAR_ROUTINE_TOKEN isn\'t set (routine off)')
  process.exit(0)
}
if (firedRecently()) {
  console.log('calendar: the routine was fired in the last hour; not firing again')
  process.exit(0)
}
if (dryRun) {
  console.log(`calendar: would fire the Owner calendar routine for ${actions.length} item(s)`)
  process.exit(0)
}

const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${CALENDAR_ROUTINE_ID}/fire`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${CALENDAR_ROUTINE_TOKEN}`,
    'anthropic-beta': 'experimental-cc-routine-2026-04-01',
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ text: `${actions.length} calendar item(s) pending: ${actions.map((a) => `#${a.number}`).join(', ')}` }),
})
const body = await res.text()
if (!res.ok) {
  console.error(`calendar: firing failed, HTTP ${res.status}: ${body.slice(0, 300)}`)
  process.exit(1)
}
console.log(`calendar: fired ${JSON.parse(body).claude_code_session_url}`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'fired=true\n')
