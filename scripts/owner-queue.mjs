// Issue #904: everything waiting on the owner, for a live session. The lanes keep working on
// their own; whatever only the owner can decide waits in one list until the owner opens a session
// and asks "what's waiting for me?" (the /waiting skill). Read-only: REST calls only (cloud
// sessions refuse GraphQL, #335), no labels or comments changed.
//
//   node scripts/owner-queue.mjs            # the full list as Markdown, with automation status
//   node scripts/owner-queue.mjs --summary  # one line, for the cloud session start hook
//   node scripts/owner-queue.mjs --json     # the queue as JSON
//
// What it lists, in order (an item shows once, in its first section):
//   - PRs waiting for the owner's approval (`review:owner-approval`, tier 3, #681)
//   - questions from agents (`awaiting-dean`, `review:asked-owner`), with the question's first line
//   - sprint reviews (`sprint-review`) and QA batches (`android-qa-batch`, `iphone-qa-batch`)
//   - merged changes to try (`status:verify` on Android, `verify:iphone` in the next TestFlight build;
//     docs/backlog.md > Owner check)
//   - open PRs whose `ci-required` check failed on the head commit (full list only)
//   - issues to prioritize (`status:needs-review`)
//   - `human` and `interaction-required` issues, ranked like the weekly digest (scripts/human-digest.mjs)
// The full list adds the automation status: paused or not, lane runs started today, and this
// month's Actions minutes with the minutes guard's level (scripts/run-budget.mjs).
// See docs/backlog-runner.md > Owner queue.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isPaused } from './automation-paused.mjs'
import { digestSections, effortTime, latestComment } from './human-digest.mjs'
import { dispatchesToday, minutesGuard, minutesThisMonth, monthlyMinutesFromEnv } from './run-budget.mjs'
import { backlogApi, issueRefSource } from './backlog-repo.mjs'

const ASK_AUTHORS = new Set(['github-actions[bot]', 'github-actions'])
const NEEDS_REVIEW_SHOWN = 5

const runGh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 })

const labelNames = (item) => (item.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name))
const labelNumber = (labels, prefix) => {
  const hit = labels.find((l) => l.startsWith(prefix))
  return hit ? Number(hit.slice(prefix.length)) : 0
}

// Pure: the issue numbers a PR body says it fixes or closes (or `Issue: #N`, an owner-check change).
export function fixedIssues(body) {
  const ref = new RegExp(`\\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|issue:)\\s+${issueRefSource()}`, 'gi')
  return [...(body ?? '').matchAll(ref)].map((m) => Number(m[1]))
}

// Pure: the first line of an agent's question, without HTML comments or Markdown, cut at a word.
export function questionText(body) {
  const lines = (body ?? '').replace(/<!--[^]*?-->/g, '').split(/\r?\n/)
  const line = lines.find((l) => l.trim() && !/^\s*(#|>|```|\||---)/.test(l))
  if (!line) return null
  const plain = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim()
  if (plain.length <= 200) return plain
  const cut = plain.slice(0, 199)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

// Pure: the queue's sections from the fetched lists. Each list holds { number, title, url, ... };
// `human` is the shape digestSections() takes. An item shows only in its first section, and a
// question on an issue whose PR is already waiting for approval is folded into that PR.
export function buildQueue(data, today) {
  const shown = new Set()
  const take = (items) => {
    const out = []
    for (const item of items ?? []) {
      if (shown.has(item.number)) continue
      shown.add(item.number)
      out.push(item)
    }
    return out
  }

  const approvals = take(data.approvals)
  for (const pr of approvals) for (const n of pr.fixes ?? []) shown.add(n)
  const questions = take(data.questions)
  const reviews = take(data.sprintReviews)
  const qa = take(data.qaBatches)
  const toTry = take(data.toVerify)
  const redCi = take(data.redPrs)
  const prioritize = take(
    [...(data.needsReview ?? [])].sort((a, b) => labelNumber(b.labels, 'value:') - labelNumber(a.labels, 'value:') || a.number - b.number),
  )

  const humanLeft = (data.human ?? []).filter((i) => !shown.has(i.number))
  const digest = digestSections(humanLeft, today)
  const human = digest
    ? {
        total: digest.total,
        top: digest.top,
        unblocks: digest.unblocks.filter((i) => !digest.top.some((t) => t.number === i.number)),
        onHold: digest.onHold,
      }
    : { total: 0, top: [], unblocks: [], onHold: [] }

  return { approvals, questions, reviews, qa, toTry, redCi, prioritize, human }
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Pure: one line for the session start hook.
export function summaryLine(queue) {
  const parts = [
    queue.approvals.length && plural(queue.approvals.length, 'PR to approve', 'PRs to approve'),
    queue.questions.length && plural(queue.questions.length, 'question'),
    queue.reviews.length && plural(queue.reviews.length, 'sprint review'),
    queue.qa.length && plural(queue.qa.length, 'QA batch', 'QA batches'),
    queue.toTry?.length && plural(queue.toTry.length, 'change to try', 'changes to try'),
    queue.redCi.length && plural(queue.redCi.length, 'PR with red CI', 'PRs with red CI'),
    queue.prioritize.length && plural(queue.prioritize.length, 'issue to prioritize', 'issues to prioritize'),
    queue.human.total && plural(queue.human.total, 'owner task'),
  ].filter(Boolean)
  const lead = 'Owner queue (tell the owner in your first reply of an interactive session; lane and review runs ignore this):'
  if (parts.length === 0) return `${lead} nothing is waiting for the owner.`
  return `${lead} ${parts.join(', ')}. The owner can say "what's waiting for me" or run /waiting for the list.`
}

// Where a change to try gets tried, from its owner-check labels.
const tryWhere = (labels) =>
  labels.includes('status:verify')
    ? labels.includes('verify:iphone')
      ? 'try it on Android (Dev build), then on iPhone in the next TestFlight build'
      : 'try it on Android (Dev build)'
    : 'try it on iPhone in the next TestFlight build'

const link = (i) => `[#${i.number}](${i.url}) ${i.title}`

// Pure: the full list as Markdown. `status` is { paused, dispatched, minutes } or null.
export function renderQueue(queue, status) {
  const out = []
  const section = (title, items, line) => {
    if (items.length === 0) return
    out.push(`### ${title}`, '', ...items.map((i) => `- ${line(i)}`), '')
  }
  section('PRs waiting for your approval', queue.approvals, (i) => `${link(i)}: approve in GitHub (Files changed > Review changes > Approve); it merges itself once CI is green`)
  section('Questions from the agents', queue.questions, (i) => `${link(i)}${i.question ? `: ${i.question}` : ''}`)
  section('Sprint reviews', queue.reviews, (i) => `${link(i)}: reply on the issue`)
  section('QA batches', queue.qa, (i) => `${link(i)}: checks on a real phone`)
  section('Changes to try', queue.toTry ?? [], (i) => `${link(i)}: ${tryWhere(i.labels ?? [])}`)
  section('PRs with red CI', queue.redCi, (i) => `${link(i)}: \`ci-required\` failed on the latest commit`)
  if (queue.prioritize.length) {
    const shown = queue.prioritize.slice(0, NEEDS_REVIEW_SHOWN)
    const more = queue.prioritize.length - shown.length
    section('Issues to prioritize', shown, (i) => link(i))
    if (more > 0) out.splice(out.length - 1, 0, `- and ${plural(more, 'more issue', 'more issues')} labeled \`status:needs-review\``)
  }
  const h = queue.human
  if (h.total) {
    out.push(`### Owner tasks (${h.total} open)`, '')
    for (const i of h.top) out.push(`- ${link(i)}${i.time ? ` (${i.time.toLowerCase()})` : ''}${i.step ? `: ${i.step}` : ''}`)
    for (const i of h.unblocks) out.push(`- ${link(i)}: unblocks ${plural(i.frees.length, 'agent issue')}`)
    for (const i of h.onHold) out.push(`- ${link(i)}: on hold until ${i.until}`)
    out.push('')
  }
  if (out.length === 0) out.push('Nothing is waiting for you.', '')

  if (status) {
    const pause = status.paused ? 'on, so no lane or review starts' : 'off'
    const dispatched = status.dispatched === null ? 'unknown' : String(status.dispatched)
    out.push('### Automation', '', `- Pause switch: ${pause}`, `- Lane runs started today (UTC): ${dispatched}`)
    const m = status.minutes
    if (m) {
      const level = { full: 'the full daily cap', half: 'half the daily cap', stop: 'no lane runs' }[m.level]
      out.push(`- Actions minutes this month: about ${m.used.toLocaleString('en-US')} of ${m.monthly.toLocaleString('en-US')} (an even pace allows ${m.pace.toLocaleString('en-US')} by today); the guard allows ${level}`)
    } else {
      out.push('- Actions minutes this month: could not be read')
    }
    out.push('')
  }
  return out.join('\n').trimEnd()
}

// ---------- GitHub (REST) ----------

// Issues come from the backlog repo; `repo` 'repos/{owner}/{repo}' reads the code repo, where PRs live (#944).
function openWithLabel(gh, label, repo = backlogApi()) {
  return JSON.parse(gh(['api', `${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`]) || '[]').map((i) => ({
    number: i.number,
    title: i.title,
    url: i.html_url,
    body: i.body ?? '',
    updatedAt: i.updated_at,
    labels: labelNames(i),
    isPr: Boolean(i.pull_request),
    deps: i.issue_dependencies_summary ?? null,
  }))
}

const comments = (gh, n) => JSON.parse(gh(['api', `${backlogApi()}/issues/${n}/comments?per_page=100`]) || '[]')

function redPrs(gh) {
  const prs = JSON.parse(gh(['api', 'repos/{owner}/{repo}/pulls?state=open&per_page=100']) || '[]')
  const red = []
  for (const pr of prs) {
    const runs = JSON.parse(gh(['api', `repos/{owner}/{repo}/commits/${pr.head.sha}/check-runs?check_name=ci-required&per_page=10`]) || '{}').check_runs ?? []
    if (runs.some((r) => r.conclusion === 'failure')) red.push({ number: pr.number, title: pr.title, url: pr.html_url })
  }
  return red
}

// `full` adds what the summary line doesn't need, to keep the session start hook quick: each
// question's text, the red CI check (one call per open PR), and the human issues' comments and
// blocking lists for the digest's ranking and on-hold dates.
export function fetchQueueData({ gh = runGh, full = true } = {}) {
  const byNumber = (lists) => [...new Map(lists.flat().map((i) => [i.number, i])).values()].sort((a, b) => a.number - b.number)

  const approvals = openWithLabel(gh, 'review:owner-approval', 'repos/{owner}/{repo}').filter((i) => i.isPr).map((i) => ({ ...i, fixes: fixedIssues(i.body) }))
  const questions = byNumber([openWithLabel(gh, 'awaiting-dean'), openWithLabel(gh, 'review:asked-owner')])
  if (full) {
    for (const q of questions) {
      const ask = comments(gh, q.number).findLast((c) => ASK_AUTHORS.has(c.user?.login))
      q.question = ask ? questionText(ask.body) : null
    }
  }
  const sprintReviews = openWithLabel(gh, 'sprint-review')
  const qaBatches = byNumber([openWithLabel(gh, 'android-qa-batch'), openWithLabel(gh, 'iphone-qa-batch')])
  const needsReview = openWithLabel(gh, 'status:needs-review').filter((i) => !i.isPr)
  const toVerify = byNumber([openWithLabel(gh, 'status:verify'), openWithLabel(gh, 'verify:iphone')]).filter((i) => !i.isPr)
  const human = byNumber([openWithLabel(gh, 'human'), openWithLabel(gh, 'interaction-required')])
    .filter((i) => !i.isPr)
    .map((i) => ({ ...i, openBlockers: i.deps?.blocked_by ?? 0, lastComment: '', blocking: [] }))
  if (full) {
    for (const i of human) {
      i.lastComment = latestComment(comments(gh, i.number).map((c) => c.body ?? ''))
      if ((i.deps?.blocking ?? 0) > 0) {
        i.blocking = JSON.parse(gh(['api', `${backlogApi()}/issues/${i.number}/dependencies/blocking?per_page=100`]) || '[]')
          .filter((b) => b.state === 'open')
          .map((b) => ({ number: b.number, title: b.title, human: labelNames(b).some((l) => l === 'human' || l === 'interaction-required') }))
      }
    }
  }
  return { approvals, questions, sprintReviews, qaBatches, redPrs: full ? redPrs(gh) : [], needsReview, toVerify, human }
}

function fetchStatus(gh) {
  const status = { paused: false, dispatched: null, minutes: null }
  try {
    status.paused = isPaused({ gh })
  } catch {
    // isPaused already warns and reads as not paused in an interactive session
  }
  try {
    status.dispatched = dispatchesToday({ gh })
  } catch {
    // shown as unknown
  }
  try {
    const monthly = monthlyMinutesFromEnv()
    const used = minutesThisMonth({ gh })
    status.minutes = { used, monthly, ...minutesGuard({ used, monthly, base: 0 }) }
  } catch {
    // shown as could not be read
  }
  return status
}

function main(argv) {
  const today = new Date().toISOString().slice(0, 10)
  if (argv.includes('--summary')) {
    try {
      console.log(summaryLine(buildQueue(fetchQueueData({ full: false }), today)))
    } catch {
      // The session start hook must never fail or slow a session down over this.
    }
    return
  }
  const queue = buildQueue(fetchQueueData(), today)
  if (argv.includes('--json')) return console.log(JSON.stringify({ queue, status: fetchStatus(runGh) }, null, 2))
  console.log(renderQueue(queue, fetchStatus(runGh)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
