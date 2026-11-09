// Issue #698: a daily cap on routine runs the lane dispatcher starts, so the loop where a review
// files follow-ups, a lane builds them, and the next review files more (#683) can't spend without
// limit. Dispatches are counted from the repo's `labeled status:dispatched` events since 00:00 UTC.
// The repo variable LANE_RUNS_PER_DAY sets the cap (default 30; `0` fires nothing). Reviews are
// bounded by it indirectly: each review follows a dispatched lane run. docs/backlog-runner.md > Run budget.
//
// The Actions minutes guard (#904) lowers that cap as the month's Actions minutes run short:
// half the cap once this month's minutes are ahead of an even pace through the month, none once
// they reach 90% of the allowance (the last 10% is kept for CI on open PRs and a release). The
// allowance is the repo variable ACTIONS_MINUTES_PER_MONTH (default 3,000, GitHub Pro's included
// minutes). Minutes are estimated from the repo's own run list, because a repo token can't read
// the billing page: each run that wasn't skipped counts its wall time rounded up to a whole minute.
// For October 2026 that gave 2,421 against about 2,384 on the billing page. The list caps a query
// at 1,000 runs, so big ranges are split (runsCreatedBetween), and finished days are kept in a
// ledger file the dispatcher caches, so a run reads only yesterday's and today's runs. That math is
// the actions-minutes-estimator package (#949); only the dispatch count and the log note live here.
//
//   node scripts/run-budget.mjs   # prints today's dispatch count, the budget, and the minutes as JSON
//
// dispatch-lanes.mjs imports `runBudget()`. The count can't be read (a refused API call) -> it
// returns null and the caller fires as before: a broken lookup must not stop the pipeline, and the
// pause switch (#682) is the hard stop. Minutes that can't be read leave the cap as set, for the
// same reason.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { BACKLOG_REPO, backlogApi } from './backlog-repo.mjs'
import { DEFAULT_MONTHLY_MINUTES, estimateRunMinutes, LIST_CAP, minutesGuard, minutesThisMonth, monthlyMinutesFromEnv, runsCreatedBetween, STOP_SHARE } from 'actions-minutes-estimator'

// The minutes estimate itself lives in the published package (#949, github.com/DeanPhillipsOKC/actions-minutes-estimator);
// this file re-exports it so the dispatcher and the owner queue keep one import.
export { DEFAULT_MONTHLY_MINUTES, estimateRunMinutes, LIST_CAP, minutesGuard, minutesThisMonth, monthlyMinutesFromEnv, runsCreatedBetween, STOP_SHARE }

export const DEFAULT_BUDGET = 30
const LOG_LABEL = 'automation-log'

// A full page of runs is large even when projected, and execFileSync's default buffer is 1 MiB.
const runGh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })

export function budgetFromEnv(value = process.env.LANE_RUNS_PER_DAY) {
  const n = Number((value ?? '').trim())
  return Number.isInteger(n) && n >= 0 && (value ?? '').trim() !== '' ? n : DEFAULT_BUDGET
}

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

// Pure: how many of these issue events are today's `status:dispatched` labelings.
export function countDispatches(events, day) {
  return events.filter((e) => e.event === 'labeled' && e.label?.name === 'status:dispatched' && e.created_at.startsWith(day)).length
}

// Events come newest first, so stop paging at the first page that reaches back before today.
export function dispatchesToday({ gh = runGh, now = new Date() } = {}) {
  const day = utcDay(now)
  let count = 0
  for (let page = 1; page <= 20; page++) {
    const events = JSON.parse(gh(['api', `${backlogApi()}/issues/events?per_page=100&page=${page}`]) || '[]')
    count += countDispatches(events, day)
    if (events.length < 100 || events.some((e) => !e.created_at.startsWith(day))) break
  }
  return count
}

// `minutes: false` skips the minutes guard (the dispatcher asks for it only when a lane would
// fire; see minutesCap). The guard's result is in `minutes`, and `budget` is the cap it allows.
export function runBudget(options = {}) {
  const base = budgetFromEnv()
  let used
  try {
    used = dispatchesToday(options)
  } catch (error) {
    console.error(`run-budget: could not count today's dispatches, not enforcing the budget: ${String(error.stderr ?? error.message).trim()}`)
    return null
  }
  const minutes = options.minutes === false ? null : minutesCap(base, options)
  return { used, budget: minutes ? minutes.cap : base, base, minutes }
}

// The minutes guard for a daily cap of `base`, or null when the minutes can't be read (the cap
// then stays as set).
export function minutesCap(base, options = {}) {
  try {
    const monthly = monthlyMinutesFromEnv()
    const spent = minutesThisMonth(options)
    return { used: spent, monthly, ...minutesGuard({ used: spent, monthly, base, now: options.now }) }
  } catch (error) {
    console.error(`run-budget: could not estimate this month's Actions minutes, keeping the cap at ${base}: ${String(error.stderr ?? error.message).trim()}`)
    return null
  }
}

// Pure: the automation-log note for a day the cap was hit, saying whether the minutes guard set it.
export function overBudgetText({ used, budget, base = budget, minutes = null }) {
  const head = `Daily run budget reached: ${used} of ${budget} routine runs started today (UTC). The dispatcher fires nothing more until 00:00 UTC.`
  if (minutes && minutes.level !== 'full') {
    return `${head} The cap is ${budget} today, not ${base}, because of the Actions minutes guard: ${minutes.reason}. It resets on the 1st (docs/backlog-runner.md > Run budget).`
  }
  return `${head} To raise it, set the repo variable \`LANE_RUNS_PER_DAY\` (docs/backlog-runner.md > Run budget). If this keeps happening, look for a loop of follow-up issues.`
}

// One comment per day on the open `automation-log` issue, so the owner sees the cap was hit.
export function noteOverBudget({ used, budget, base = budget, minutes = null }, { gh = runGh, now = new Date() } = {}) {
  const marker = `<!-- run-budget ${utcDay(now)} -->`
  let issue = gh(['api', `${backlogApi()}/issues?labels=${LOG_LABEL}&state=open&per_page=1`, '--jq', '.[0].number // empty']).trim()
  if (!issue) {
    // Same as .github/workflows/automation-pause.yml: the first writer creates the label and the issue (#720).
    try {
      gh(['label', 'create', LOG_LABEL, '-R', BACKLOG_REPO, '--color', '6E7781', '--description', 'Standing log of automation pauses and resumes'])
    } catch {
      // already exists
    }
    issue = gh([
      'api', '-X', 'POST', `${backlogApi()}/issues`, '-f', 'title=Automation log', '-f', `labels[]=${LOG_LABEL}`,
      '-f', 'body=Standing log of every pause and resume of the automation (#682) and of days the daily run budget was hit (#698). Do not close.',
      '--jq', '.number',
    ]).trim()
    if (!issue) return false
  }
  // The comments endpoint ignores sort and direction (oldest first), so `since` is what finds today's note (#721).
  const comments = gh(['api', `${backlogApi()}/issues/${issue}/comments?since=${utcDay(now)}T00:00:00Z&per_page=100&page=1`, '--jq', '.[].body'])
  if (comments.includes(marker)) return false
  const body = `${marker}\n${overBudgetText({ used, budget, base, minutes })}\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_`
  gh(['api', '-X', 'POST', `${backlogApi()}/issues/${issue}/comments`, '-f', `body=${body}`])
  return true
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(runBudget()))
}
