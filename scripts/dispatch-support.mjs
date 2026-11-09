// Issue #309: starts the "Support triage" routine (/triage-support headless) only when support
// mail is waiting, so an empty inbox costs no routine runs. No AI here.
// .github/workflows/dispatch-support.yml runs it every 6 hours; dean-replied.yml runs it with
// --force when the owner answers a `support` issue. docs/backlog-runner.md > Support triage.
//
//   node scripts/dispatch-support.mjs            # check the mail, fire if any is waiting
//   node scripts/dispatch-support.mjs --force    # fire without checking the mail
//   node scripts/dispatch-support.mjs --dry-run  # print what it would do, fire nothing
//
// Needs SUPPORT_ROUTINE_ID and SUPPORT_ROUTINE_TOKEN (the routine's API trigger). With either
// unset it does nothing: that's the off switch. The mail check also needs GMAIL_SENDER_ADDRESS and
// GMAIL_APP_PASSWORD. Skips the fire when this workflow already fired in the last hour.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { countWaiting } from './check-support-mail.mjs'
import { isPaused } from './automation-paused.mjs'

const force = process.argv.includes('--force')
const dryRun = process.argv.includes('--dry-run')
const { SUPPORT_ROUTINE_ID, SUPPORT_ROUTINE_TOKEN, GMAIL_SENDER_ADDRESS, GMAIL_APP_PASSWORD } = process.env
// The workflow's "Routine fired" step only runs when this script wrote fired=true.
const FIRE_STEP = 'Routine fired'

if (isPaused()) {
  console.log('support: paused (AUTOMATION_PAUSED is true), nothing fired')
  process.exit(0)
}

if (!SUPPORT_ROUTINE_ID || !SUPPORT_ROUTINE_TOKEN) {
  console.log('support: SUPPORT_ROUTINE_ID or SUPPORT_ROUTINE_TOKEN isn\'t set (routine off)')
  process.exit(0)
}

const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }))

// True when a run of dispatch-support.yml other than this one actually fired in the last hour.
function firedRecently() {
  if (!process.env.GITHUB_REPOSITORY) return false
  const since = new Date(Date.now() - 3600_000).toISOString()
  const runs = gh(
    `repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/dispatch-support.yml/runs?per_page=20&created=>${since}`,
  ).workflow_runs
  for (const run of runs) {
    if (String(run.id) === process.env.GITHUB_RUN_ID) continue
    const jobs = gh(`repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${run.id}/jobs`).jobs
    if (jobs.some((j) => j.steps?.some((s) => s.name === FIRE_STEP && s.conclusion === 'success'))) return true
  }
  return false
}

if (!force) {
  if (!GMAIL_SENDER_ADDRESS || !GMAIL_APP_PASSWORD) {
    console.error('support: GMAIL_SENDER_ADDRESS and GMAIL_APP_PASSWORD must be set')
    process.exit(1)
  }
  const waiting = await countWaiting(GMAIL_SENDER_ADDRESS, GMAIL_APP_PASSWORD)
  console.log(`support: ${waiting} thread(s) waiting`)
  if (waiting === 0) process.exit(0)
  if (firedRecently()) {
    console.log('support: the routine was fired in the last hour; not firing again')
    process.exit(0)
  }
}

if (dryRun) {
  console.log('support: would fire the Support triage routine')
  process.exit(0)
}

const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${SUPPORT_ROUTINE_ID}/fire`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${SUPPORT_ROUTINE_TOKEN}`,
    'anthropic-beta': 'experimental-cc-routine-2026-04-01',
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ text: force ? 'The owner replied on a support issue' : 'Support mail is waiting' }),
})
const body = await res.text()
if (!res.ok) {
  console.error(`support: firing failed, HTTP ${res.status}: ${body.slice(0, 300)}`)
  process.exit(1)
}
console.log(`support: fired ${JSON.parse(body).claude_code_session_url}`)
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'fired=true\n')
