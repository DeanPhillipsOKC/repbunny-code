// Issue #682: the one switch that pauses all automation. The repo variable AUTOMATION_PAUSED
// (Settings > Secrets and variables > Actions > Variables) set to `true` stops every dispatcher and
// every headless skill. Flip it with the "Pause automation" workflow; runbook in
// docs/backlog-runner.md > Pausing automation.
//
//   node scripts/automation-paused.mjs            # prints PAUSED and exits 10 when paused, else exits 0
//   node scripts/automation-paused.mjs --strict   # the same, for lane, review, and headless runs
//
// Other scripts import `isPaused()`. Workflows pass `vars.AUTOMATION_PAUSED` in as the
// AUTOMATION_PAUSED environment variable (the workflow token can't read variables); anywhere else
// it reads the variable with `gh api`.
//
// Cloud sessions' GitHub proxy refuses the variables API (#700), so when the variable can't be read
// the same workflow's `automation:paused` label on the `automation-log` issue is the second signal.
// Every agent acts as the owner, so the label counts only when github-actions[bot] made its latest
// change (read from the issue timeline): any change by another actor reads as paused.
//
// If neither source can be read: strict runs (lane, review, and headless routines, which pass
// `--strict` or set AUTOMATION_STRICT=true; never inferred from the environment) fail closed and
// say why. Everything else, the owner's interactive sessions, counts as not paused with a warning:
// a broken lookup must not stop the owner's own work, and a missing variable is the normal state.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { backlogApi } from './backlog-repo.mjs'

const PAUSE_LABEL = 'automation:paused'
const WORKFLOW_ACTORS = new Set(['github-actions[bot]', 'github-actions'])

function runGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function errorText(error) {
  return `${error.stderr ?? ''}${error.message}`
}

// Latest labeled/unlabeled event for the pause label on the automation-log issue, or null.
function latestLabelEvent(gh) {
  const issue = gh(['api', `${backlogApi()}/issues?labels=automation-log&state=open&per_page=1`, '--jq', '.[0].number // empty']).trim()
  if (!issue) return null
  let latest = null
  for (let page = 1; ; page++) {
    const events = JSON.parse(gh(['api', `${backlogApi()}/issues/${issue}/timeline?per_page=100&page=${page}`]) || '[]')
    for (const e of events) {
      if ((e.event === 'labeled' || e.event === 'unlabeled') && e.label?.name === PAUSE_LABEL) latest = e
    }
    if (events.length < 100) return latest
  }
}

export function isPaused({ strict = process.env.AUTOMATION_STRICT === 'true', gh = runGh } = {}) {
  if (process.env.AUTOMATION_PAUSED !== undefined) return process.env.AUTOMATION_PAUSED.trim() === 'true'
  try {
    return gh(['api', `${backlogApi()}/actions/variables/AUTOMATION_PAUSED`, '--jq', '.value']).trim() === 'true'
  } catch (error) {
    if (/404|Not Found/.test(errorText(error))) return false
  }
  try {
    const event = latestLabelEvent(gh)
    if (!event) return false
    const actor = event.actor?.login
    if (!WORKFLOW_ACTORS.has(actor)) {
      console.error(`automation-paused: the ${PAUSE_LABEL} label was changed by ${actor ?? 'an unknown actor'}, not the Pause automation workflow, treating as paused`)
      return true
    }
    return event.event === 'labeled'
  } catch {
    if (strict) {
      console.error('automation-paused: could not read the AUTOMATION_PAUSED variable or the automation-log label, treating as paused')
      return true
    }
    console.error('automation-paused: could not read AUTOMATION_PAUSED, treating as not paused')
    return false
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (isPaused({ strict: process.argv.includes('--strict') || process.env.AUTOMATION_STRICT === 'true' })) {
    console.log('PAUSED')
    process.exit(10)
  }
}
