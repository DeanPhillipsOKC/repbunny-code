// Issue #250: starts a backlog lane routine only when its lane has work, so an empty backlog costs
// no routine runs (every run is a full cloud session that counts toward the plan's usage).
// .github/workflows/dispatch-lanes.yml runs it every 2 hours and when an issue closes; docs/backlog-runner.md > Backlog lanes.
//
// For each lane and model pair below whose routine token is set (ROUTINE_TOKEN_<LANE>_<MODEL>):
// skip it while a run holds a live claim or dispatch in that pair (one run per pair at a time);
// otherwise mark the pair's top pick `status:dispatched` and fire its routine with "Work issue #N".
// The fired run's own lane pick returns the dispatched issue first (scripts/next-issue.mjs >
// Claims), so it doesn't depend on the run reading the payload. Marking before firing means a
// later check can't start a second run for the same pair. A failed fire drops the mark. A pair
// with no token is never fired: that's how a lane is turned off. While the repo variable
// AUTOMATION_PAUSED is `true` nothing is claimed or fired (#682). Once LANE_RUNS_PER_DAY routines
// (default 30) have been dispatched today (UTC) it fires nothing more and tells the owner (#698).
// The Actions minutes guard can lower that cap for the day (#904, scripts/run-budget.mjs); it's
// checked only when a lane would fire, and a run never fires more lanes than the cap has room for.
//
//   node scripts/dispatch-lanes.mjs            # claim and fire
//   node scripts/dispatch-lanes.mjs --dry-run  # print what it would do, change nothing
import { execFileSync } from 'node:child_process'
import { isPaused } from './automation-paused.mjs'
import { minutesCap, noteOverBudget, runBudget } from './run-budget.mjs'

// One routine per pair, each with an API trigger and no schedule (claude.ai/code/routines).
const ROUTINES = {
  'ux-opus': 'trig_01Xd6QNFEDhAkcg4xGfF3mRy',
  'features-sonnet': 'trig_01193gGD6PYh1E2HoFoPVV5S',
  'features-opus': 'trig_01V9E7HoL14jRRPsaUSpfzcg',
  'bugs-sonnet': 'trig_011VnviPSFisWK6tcFaVc2BV',
  'bugs-opus': 'trig_01GzD7BxnaHPWmx2KVKxGG31',
  'tech-sonnet': 'trig_014n2ytWgqWwGq6fa55bzZjz',
  'tech-opus': 'trig_017ZBnAGLebPqD9LHmFaPqtS',
}

const dryRun = process.argv.includes('--dry-run')
const nextIssue = (...args) => execFileSync('node', ['scripts/next-issue.mjs', ...args], { encoding: 'utf8' })
const tokenName = (pair) => `ROUTINE_TOKEN_${pair.replace('-', '_').toUpperCase()}`

async function fire(routineId, token, text) {
  const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${routineId}/fire`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body).claude_code_session_url
}

if (isPaused()) {
  console.log('paused: AUTOMATION_PAUSED is true, no lane fired')
  process.exit(0)
}

function overBudget(spent, why) {
  console.log(`over budget: ${spent.used} of ${spent.budget} runs dispatched today (${why}), no lane fired`)
  if (dryRun) return
  try {
    if (noteOverBudget(spent)) console.log('over budget: noted on the automation-log issue')
  } catch (error) {
    console.error(`over budget: could not note it on the automation-log issue: ${error.message}`)
  }
}

// The daily count first: it's one cheap call. The minutes guard reads the month's run list, which
// is slow, so it runs only when a lane is about to fire (#904).
const spent = runBudget({ minutes: false })
if (spent !== null && spent.used >= spent.budget) {
  overBudget(spent, 'LANE_RUNS_PER_DAY')
  process.exit(0)
}
const ranked = JSON.parse(nextIssue())
const busy = new Set(JSON.parse(nextIssue('--claims')).map((c) => `${c.lane}-${c.model}`))
const ready = []

for (const [pair, routineId] of Object.entries(ROUTINES)) {
  const pick = ranked.find((i) => `${i.lane}-${i.model}` === pair)
  const token = process.env[tokenName(pair)]
  if (busy.has(pair)) {
    console.log(`${pair}: busy (a run holds a claim or dispatch)${pick ? `; #${pick.number} waits` : ''}`)
  } else if (!pick) {
    console.log(`${pair}: no work`)
  } else if (!token) {
    console.log(`${pair}: #${pick.number} waiting, but ${tokenName(pair)} isn't set (lane off)`)
  } else {
    ready.push({ pair, routineId, pick, token })
  }
}

// The minutes guard can lower today's cap; never fire more lanes than the cap has room for.
let room = ready.length
if (spent !== null && ready.length > 0) {
  const minutes = minutesCap(spent.base, { ledger: process.env.MINUTES_LEDGER || null })
  if (minutes) {
    console.log(`minutes guard: ${minutes.level}, cap ${minutes.cap} of ${spent.base} (${minutes.reason})`)
    const capped = { ...spent, budget: minutes.cap, minutes }
    if (spent.used >= minutes.cap) {
      overBudget(capped, 'the Actions minutes guard')
      process.exit(0)
    }
    room = minutes.cap - spent.used
  } else {
    room = spent.budget - spent.used
  }
}

let failed = false
for (const [i, { pair, routineId, pick, token }] of ready.entries()) {
  if (i >= room) {
    console.log(`${pair}: #${pick.number} waits, today's cap is reached`)
  } else if (dryRun) {
    console.log(`${pair}: would claim #${pick.number} and fire ${routineId}`)
  } else {
    nextIssue('--dispatch', String(pick.number))
    try {
      const url = await fire(routineId, token, `Work issue #${pick.number}`)
      console.log(`${pair}: claimed #${pick.number}, fired ${url}`)
    } catch (error) {
      nextIssue('--release', String(pick.number))
      console.error(`${pair}: firing for #${pick.number} failed, claim released: ${error.message}`)
      failed = true
    }
  }
}

// Pairs a `model:` label can create that have no routine (e.g. a ux issue pinned to sonnet).
for (const i of ranked) {
  if (!ROUTINES[`${i.lane}-${i.model}`]) console.log(`#${i.number}: no routine for ${i.lane}-${i.model}`)
}

if (failed) process.exit(1)
