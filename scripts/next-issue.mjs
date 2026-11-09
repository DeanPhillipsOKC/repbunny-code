// Backlog item 122: the backlog lives in GitHub Issues. Prints the open
// issues the next-item skill may work, best first, as JSON; `--top` prints
// just the winner (or nothing when none is eligible).
//
// Eligible: open, has both an `effort:N` and a `value:N` label, has none of
// `status:blocked`, `status:needs-review`, `status:verify`, `verify:iphone`, `support`, `awaiting-dean`, `dean-replied` (nor `human`, by default; see below), is not claimed
// by a run in progress (see Claims), and has no open "blocked by" issue (GitHub's issue
// dependencies). Order: ROI (value / effort) descending, then value descending, then oldest
// issue first.
//
//   node scripts/next-issue.mjs              # ranked list
//   node scripts/next-issue.mjs --top        # just the pick
//   node scripts/next-issue.mjs --top --no-ux  # best pick without the `ux-intensive` label
//   node scripts/next-issue.mjs --top --include-human  # human issues compete on the same ranking
//   node scripts/next-issue.mjs --human      # only the scored, unblocked human issues
//   node scripts/next-issue.mjs --snoozed    # issues waiting on a not-before date, with date and reason
//
// Snoozes (#749): an issue whose body or latest comment carries `<!-- not-before: YYYY-MM-DD |
// reason -->` is skipped (and never dispatched) while today (UTC) is before that date, then
// eligible again with no label change. Written by scripts/snooze-issue.mjs.
//
// Human issues (label `human`, only the user can do them) are skipped by default. With
// --include-human or --human they're ranked like the rest and carry `human: true`, so an
// interactive next-item can offer to work one with the user before it goes stale. Issues labeled
// `interaction-required` (an agent can do most of it, but finishing needs the user: a device
// test, a native build the cloud can't run) are treated the same way and carry
// `interactionRequired: true`.
//
// Each entry carries `uxIntensive: true` when labeled `ux-intensive` (layout/visual-heavy work the
// user prefers to route to a frontier model; next-item warns before starting one).
//
// Issue #236, backlog lanes (docs/backlog-runner.md > Backlog lanes): every entry also carries
// its `lane` and the `model` that works it.
//
//   node scripts/next-issue.mjs --top --lane features                 # best pick in one lane
//   node scripts/next-issue.mjs --top --lane features --model sonnet  # ...that this model may work
//
// Lane: a `lane:<name>` label pins it; otherwise `ux-intensive` > `bug` > `feature` > everything
// else (`tooling` and other technical work), so each issue belongs to exactly one lane. Model: a
// `model:opus` / `model:sonnet` label pins it; otherwise ux is always opus, and every other lane
// is sonnet below effort 5 and opus at 5 or more (owner decisions 2026-10-10, 2026-10-12).
//
// Claims: so two runs never work the same issue, and so the lane dispatcher
// (scripts/dispatch-lanes.mjs, #250) can tell a lane is busy, a run (or the dispatcher) claims a
// pick with the `status:in-progress` label (`--claim <N>`) and drops it if it stops without
// shipping (`--release <N>`; a shipped issue closes, which ends the claim). A claim older than
// CLAIM_STALE_HOURS is treated as a run that died, and the issue is eligible again.
//
// The dispatcher marks the issue it fires a routine for with `status:dispatched` (`--dispatch
// <N>`) instead. A dispatched issue is hidden like a claim, except from a lane pick
// (`--top --lane L --model M`) in its own lane and model, where it comes first: the run the
// dispatcher started picks it up with its normal pick, then `--claim` swaps the label for
// `status:in-progress`. (A run that only learned its issue from the fire payload could pick
// something else and strand the claim, which happened on #175.)
//
//   node scripts/next-issue.mjs --claim 224
//   node scripts/next-issue.mjs --release 224
//   node scripts/next-issue.mjs --dispatch 224  # the dispatcher's mark (#250)
//   node scripts/next-issue.mjs --claims     # live claims and dispatches with lane and model
//
// Review (#374, #680): every lane PR waits for the /review-pr routine before it merges. An issue whose
// open PR is labeled `review:requested` is skipped (the review is running or about to), and so is
// one labeled `review:asked-owner` (the review asked the owner what to do). An issue whose PR is
// labeled `review:changes-requested` or `review:approved` carries `reviewPr` and `reviewState` and
// comes first in its lane, right after a dispatched one: next-item then finishes that PR (fixes
// the blockers, or brings in a moved `main` and merges) instead of starting over. A PR is matched
// to its issue by a `Fixes #N` or `Issue: #N` line in its body (the second for a change the
// owner verifies before it closes, docs/backlog.md > Owner check), or a Dependabot PR by its "Gate and merge
// Dependabot PR #P" issue.
//
// Everything goes through the repo's REST API with explicit page numbers: cloud sessions'
// GitHub access refuses GraphQL (#238) and the next-page links `gh api --paginate` follows (#224).
import { execFileSync } from 'node:child_process'
import { delimiter } from 'node:path'
import { LANES, MODELS, laneOf, modelOf } from './lib/lanes.mjs'
import { isSnoozed, latestNotBefore } from './snooze-issue.mjs'
import { backlogApi, issueRefSource } from './backlog-repo.mjs'

// `support` tracking issues and the ask-dean labels are never buildable work (#335): the real
// backlog item is filed separately, and the owner's label edits must not make a tracking issue eligible.
// `status:verify` / `verify:iphone` are merged work waiting for the owner to try it (docs/backlog.md > Owner check).
const SKIP = new Set(['status:blocked', 'status:needs-review', 'status:verify', 'verify:iphone', 'support', 'awaiting-dean', 'dean-replied', 'review:asked-owner'])
const CLAIM = 'status:in-progress'
const DISPATCHED = 'status:dispatched'
const REVIEW_STATES = ['requested', 'changes-requested', 'approved']
const CLAIM_STALE_HOURS = 3
const PER_PAGE = 100
const humanOnly = process.argv.includes('--human')
const includeHuman = humanOnly || process.argv.includes('--include-human')

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    // Piped, not printed: a failed call still throws with gh's message in the error.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: `${process.env.PATH}${delimiter}C:\\Program Files\\GitHub CLI` },
  })
}

// Every page of a REST list, asked for by number until a short page.
function ghPages(path) {
  const all = []
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const items = JSON.parse(gh(['api', `${path}${sep}per_page=${PER_PAGE}&page=${page}`]))
    all.push(...items)
    if (items.length < PER_PAGE) return all
  }
}

function argValue(flag, allowed) {
  const at = process.argv.indexOf(flag)
  if (at === -1) return null
  const value = process.argv[at + 1]
  if (allowed ? !allowed.includes(value) : !/^\d+$/.test(value ?? '')) {
    console.error(`next-issue: ${flag} must be ${allowed ? `one of ${allowed.join(', ')}` : 'an issue number'}.`)
    process.exit(2)
  }
  return value
}

const claimNumber = argValue('--claim')
const releaseNumber = argValue('--release')
const dispatchNumber = argValue('--dispatch')

const addLabel = (number, label) =>
  gh(['api', '-X', 'POST', `${backlogApi()}/issues/${number}/labels`, '-f', `labels[]=${label}`])
function removeLabel(number, label) {
  try {
    gh(['api', '-X', 'DELETE', `${backlogApi()}/issues/${number}/labels/${encodeURIComponent(label)}`])
  } catch {
    // Not labeled: nothing to remove.
  }
}

if (claimNumber) {
  addLabel(claimNumber, CLAIM)
  removeLabel(claimNumber, DISPATCHED)
  process.exit(0)
}
if (dispatchNumber) {
  addLabel(dispatchNumber, DISPATCHED)
  process.exit(0)
}
if (releaseNumber) {
  removeLabel(releaseNumber, CLAIM)
  removeLabel(releaseNumber, DISPATCHED)
  process.exit(0)
}

const laneFilter = argValue('--lane', LANES)
const modelFilter = argValue('--model', MODELS)

// True while the newest event adding `label` is younger than CLAIM_STALE_HOURS.
function claimIsLive(number, label) {
  const labeled = ghPages(`${backlogApi()}/issues/${number}/events`)
    .filter((e) => e.event === 'labeled' && e.label?.name === label)
    .map((e) => Date.parse(e.created_at))
  if (labeled.length === 0) return false
  return Date.now() - Math.max(...labeled) < CLAIM_STALE_HOURS * 3600_000
}

// The REST issues list rather than `gh issue list`, which can't report GitHub's issue
// dependencies. `blocked_by` counts only blockers that are still open, so a "blocked by"
// link stops skipping an issue the moment its blocker closes. The list includes pull
// requests; drop them.
const open = ghPages(`${backlogApi()}/issues?state=open`)

// Open PRs in review, by PR number, with the issues their body says they fix (see Review).
const prReviews = new Map()
// PRs live in the code repo, this checkout's own (#944).
// Only our own PRs count (#945): a same-repo `claude/` (lane) or `dependabot/` branch. In the public
// code repo anyone can open a PR from a fork, and its body could name any issue.
const ownPr = (pr) => pr.head?.repo?.full_name === pr.base?.repo?.full_name && /^(claude|dependabot)\//.test(pr.head?.ref ?? '')
for (const pr of ghPages('repos/{owner}/{repo}/pulls?state=open')) {
  if (!ownPr(pr)) continue
  const state = REVIEW_STATES.find((s) => pr.labels.some((l) => l.name === `review:${s}`))
  if (!state) continue
  const fixes = [...(pr.body ?? '').matchAll(new RegExp(`\\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|issue:) ${issueRefSource()}`, 'gi'))].map((m) => Number(m[1]))
  prReviews.set(pr.number, { pr: pr.number, state, fixes })
}
function reviewOf(issue) {
  const dependabot = issue.title.match(/^Gate and merge Dependabot PR #(\d+)/)
  if (dependabot && prReviews.has(Number(dependabot[1]))) return prReviews.get(Number(dependabot[1]))
  return [...prReviews.values()].find((r) => r.fixes.includes(issue.number)) ?? null
}

const issues = open
  .filter((i) => !i.pull_request)
  .map((i) => ({
    number: i.number,
    title: i.title,
    labels: i.labels,
    openBlockers: i.issue_dependencies_summary?.blocked_by ?? 0,
    body: i.body,
    commentCount: i.comments,
    review: reviewOf(i),
  }))

// The not-before marker (#749) from an issue's body and comments, latest wins; cached per issue.
const snoozes = new Map()
function notBeforeOf(issue) {
  if (!snoozes.has(issue.number)) {
    const texts = [issue.body]
    if (issue.commentCount > 0) texts.push(...ghPages(`${backlogApi()}/issues/${issue.number}/comments`).map((c) => c.body))
    snoozes.set(issue.number, latestNotBefore(texts))
  }
  return snoozes.get(issue.number)
}
const issueByNumber = new Map(issues.map((i) => [i.number, i]))
const snoozeOf = (i) => {
  const marker = notBeforeOf(issueByNumber.get(i.number))
  return isSnoozed(marker) ? marker : null
}

const labelNumber = (labels, prefix) => {
  const hit = labels.find((l) => l.startsWith(prefix))
  return hit ? Number(hit.slice(prefix.length)) : null
}

const ranked = issues
  .map((issue) => {
    const labels = issue.labels.map((l) => l.name)
    const effort = labelNumber(labels, 'effort:')
    const value = labelNumber(labels, 'value:')
    const lane = laneOf(labels)
    return {
      number: issue.number,
      title: issue.title,
      labels,
      effort,
      value,
      roi: effort && value ? value / effort : null,
      uxIntensive: labels.includes('ux-intensive'),
      human: labels.includes('human'),
      interactionRequired: labels.includes('interaction-required'),
      openBlockers: issue.openBlockers,
      lane,
      model: modelOf(labels, lane, effort),
      ...(issue.review && { reviewPr: issue.review.pr, reviewState: issue.review.state }),
    }
  })
  .filter((i) => i.roi !== null && !i.labels.some((l) => SKIP.has(l)) && i.openBlockers === 0)
  .filter((i) => i.reviewState !== 'requested')
  .filter((i) => {
    const needsUser = i.human || i.interactionRequired
    return humanOnly ? needsUser : includeHuman || !needsUser
  })
  .filter((i) => !(process.argv.includes('--no-ux') && i.uxIntensive))
  .filter((i) => !laneFilter || i.lane === laneFilter)
  .filter((i) => !modelFilter || i.model === modelFilter)
  // Snoozed issues (#749); comments are read only for issues that survive the cheap filters.
  .filter((i) => !snoozeOf(i))
  // Last, so only the few claimed issues that survive the cheap filters cost an events call.
  .filter((i) => !i.labels.includes(CLAIM) || !claimIsLive(i.number, CLAIM))
  .map((i) => ({ ...i, dispatched: i.labels.includes(DISPATCHED) && claimIsLive(i.number, DISPATCHED) }))
  // A dispatched issue is only for the lane run the dispatcher started (see Claims).
  .filter((i) => !i.dispatched || (laneFilter && modelFilter))
  .sort((a, b) => b.dispatched - a.dispatched || !!b.reviewPr - !!a.reviewPr || b.roi - a.roi || b.value - a.value || a.number - b.number)
  .map((i) => ({ ...i, roi: Math.round(i.roi * 100) / 100 }))

// #749: `--snoozed` lists the issues waiting on a not-before date, so they stay visible.
if (process.argv.includes('--snoozed')) {
  const waiting = issues
    .filter((i) => /not-before:/.test(i.body ?? '') || i.commentCount > 0)
    .map((i) => ({ number: i.number, title: i.title, marker: notBeforeOf(i) }))
    .filter((i) => isSnoozed(i.marker))
    .map((i) => ({ number: i.number, title: i.title, until: i.marker.date, reason: i.marker.reason }))
    .sort((a, b) => a.until.localeCompare(b.until) || a.number - b.number)
  console.log(JSON.stringify(waiting, null, 2))
  process.exit(0)
}

// #250: `--claims` lists the issues a run is working or about to work (live claims and
// dispatches), with their lane and model, so scripts/dispatch-lanes.mjs can leave a busy lane alone.
if (process.argv.includes('--claims')) {
  const claims = issues
    .map((issue) => ({ number: issue.number, labels: issue.labels.map((l) => l.name) }))
    .filter((i) => [CLAIM, DISPATCHED].some((label) => i.labels.includes(label) && claimIsLive(i.number, label)))
    .map((i) => {
      const lane = laneOf(i.labels)
      return { number: i.number, lane, model: modelOf(i.labels, lane, labelNumber(i.labels, 'effort:')) }
    })
  console.log(JSON.stringify(claims))
} else if (process.argv.includes('--top')) {
  if (ranked.length > 0) console.log(JSON.stringify(ranked[0]))
} else {
  console.log(JSON.stringify(ranked, null, 2))
}
