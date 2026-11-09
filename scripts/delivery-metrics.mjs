// Issue #685: delivery quality metrics for /process-review. Cost per change was already tracked
// (#628); this adds how often agent changes break something. From GitHub data only, per month
// (the month a change merged) and per lane and model:
//
//   change failure rate   shipped issues later reverted on main, or named by a later `bug` issue
//                         ("Caused by #N", "regression from #N", "introduced by #N" or a commit sha)
//   review catch rate     PRs where /review-pr found a blocker, out of PRs it reviewed, and how many
//                         sent-back PRs passed the next round after the lane's fix
//   first-pass CI         PRs whose first `ci-required` check run was green
//   lead time             ready (last of: created, scored, `status:needs-review` removed) to merged,
//                         and PR opened to merged, in hours (medians)
//   cost per change       sum of the issue's `<!-- run-cost: ... -->` lines (scripts/run-cost.mjs), median
//
// and per month (the month a bug was filed) where product bugs came from: escaped (owner, tester,
// support) versus caught (gate, review, audit). Definitions: docs/backlog-runner.md > Delivery metrics.
//
//   node scripts/delivery-metrics.mjs              # last 60 days, markdown tables
//   node scripts/delivery-metrics.mjs --days 130   # a longer window (three complete months for the trend)
//   node scripts/delivery-metrics.mjs --json       # the per-change rows and the tables as JSON
//
// REST only with explicit page numbers: cloud sessions refuse GraphQL (#238) and the next-page
// links `gh api --paginate` follows (#224).
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
import { laneOf, modelOf as defaultModelOf } from './lib/lanes.mjs'
import { BACKLOG_REPO, backlogApi, issueRefSource, subjectIssueNumbers } from './backlog-repo.mjs'
import { CODE_REPO } from './code-repo.mjs'

const run = promisify(execFile)
const PER_PAGE = 100
const CI_CHECK = 'ci-required'
const DAY = 24 * 3600 * 1000

async function gh(path) {
  const { stdout } = await run('gh', ['api', path], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATH: `${process.env.PATH}${delimiter}C:\\Program Files\\GitHub CLI` },
  })
  return JSON.parse(stdout)
}

// Pages of a REST list until a short page, or until `stop(lastItemOfPage)` says the rest is older.
async function ghPages(path, stop = () => false) {
  const all = []
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const items = await gh(`${path}${sep}per_page=${PER_PAGE}&page=${page}`)
    all.push(...items)
    if (items.length < PER_PAGE || stop(items.at(-1))) return all
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const k = next++
      out[k] = await fn(items[k])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// The model that did the work: the close-out's Cost line names it ("(claude-sonnet-5-5)"). Without
// one, the shared rule in scripts/lib/lanes.mjs.
export function modelOf(labels, comments) {
  const named = comments
    .map((c) => c.match(/^Cost:.*\(claude-(opus|sonnet|haiku|fable)[^)]*\)/m)?.[1])
    .filter(Boolean)
    .at(-1)
  if (named) return named === 'haiku' ? 'sonnet' : named === 'fable' ? 'opus' : named
  const effort = Number(labels.find((l) => l.startsWith('effort:'))?.slice('effort:'.length) ?? 0)
  return defaultModelOf(labels, laneOf(labels), effort)
}

// Where a bug came from, from the markers the filers write (triage-support's "Source: support
// email", the skills' "Filed by /<skill>", next-item's "Filed by next-item ... gate").
export function bugSource(body, labels) {
  const text = body ?? ''
  if (/Filed by \/review-pr|from the review of PR/i.test(text)) return 'review'
  if (/Filed by \/?next-item|while gating|from the gate/i.test(text)) return 'gate'
  if (/Filed by \/(ux|pm|process|help|accessibility)-review|Filed by \/security-audit|Filed by \/expiry-radar/i.test(text)) return 'audit'
  if (/closed testing|(iPhone|Android|pilot) tester/i.test(text)) return 'tester'
  if (/owner QA pass|Found in TC-/i.test(text)) return 'owner'
  if (labels.includes('support') || /Source: support email|mail\.google\.com/i.test(text)) return 'support'
  // Hand-filed (from the phone) issues carry no agent footer.
  if (!/Generated (by|with) \[Claude Code\]/.test(text)) return 'owner'
  return 'other'
}

export const ESCAPED = ['owner', 'tester', 'support']

// Issue numbers and commit shas a bug names as its cause.
export function causesIn(text) {
  const issues = new Set()
  const shas = new Set()
  const re = /(?:caused by|regress(?:ion|ed)? (?:from|in|by)|introduced (?:by|in))[:\s]+((?:(?:#\d+|[0-9a-f]{7,40})(?:,\s*|\s+and\s+|\s+)?)+)/gi
  for (const m of (text ?? '').matchAll(re)) {
    for (const ref of m[1].match(/#\d+|\b[0-9a-f]{7,40}\b/g) ?? []) {
      if (ref.startsWith('#')) issues.add(Number(ref.slice(1)))
      else shas.add(ref)
    }
  }
  return { issues: [...issues], shas: [...shas] }
}

// A /review-pr review body: its round, verdict, and blocker count.
export function parseReview(body) {
  const head = body.match(/\*\*Review \(round (\d+)\): ([^*]+)\*\*/)
  if (!head) return null
  return {
    round: Number(head[1]),
    verdict: head[2].trim(),
    blockers: (body.match(/^\s*\d+\.\s+\*\*blocker:\*\*/gm) ?? []).length,
  }
}

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!s.length) return null
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const month = (iso) => iso.slice(0, 7)
const hours = (from, to) => (Date.parse(to) - Date.parse(from)) / 3600000
const pct = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)}%)` : 'n/a')
const num = (x, digits = 0) => (x == null ? 'n/a' : x.toFixed(digits))

async function main() {
  const at = process.argv.indexOf('--days')
  const days = at > 0 ? Number(process.argv[at + 1]) : 60
  if (!Number.isFinite(days) || days <= 0) {
    console.error('delivery-metrics: --days must be a positive number.')
    process.exit(2)
  }
  const asJson = process.argv.includes('--json')
  const now = new Date()
  const since = new Date(now.getTime() - days * DAY).toISOString()

  // Everything touched in the window, issues and PRs alike (the issues list includes PRs).
  const touched = (await ghPages(`${backlogApi()}/issues?state=all&since=${since}`)).filter((i) => !i.pull_request)
  const labelsOf = (i) => i.labels.map((l) => (typeof l === 'string' ? l : l.name))
  const commentsOf = new Map()
  const loadComments = (i) =>
    ghPages(`${backlogApi()}/issues/${i.number}/comments`).then((cs) => commentsOf.set(i.number, cs.map((c) => c.body ?? '')))

  const closedInWindow = touched.filter((i) => i.state === 'closed' && i.closed_at >= since && i.state_reason !== 'not_planned')
  // Merged but still open, waiting for the owner to try it (docs/backlog.md > Owner check).
  const verifying = touched.filter(
    (i) => i.state === 'open' && labelsOf(i).some((l) => l === 'status:verify' || l === 'verify:iphone'),
  )
  const doneInWindow = [...closedInWindow, ...verifying]
  const bugs = touched.filter((i) => labelsOf(i).includes('bug') && i.created_at >= since)
  await mapLimit([...new Map([...doneInWindow, ...bugs].map((i) => [i.number, i])).values()], 8, loadComments)

  // A shipped change: closed, or waiting on the owner check, with a next-item close-out (a
  // Verified line or a run-cost line).
  const shipped = doneInWindow.filter((i) => {
    const labels = labelsOf(i)
    if (labels.includes('human') || labels.includes('support')) return false
    return (commentsOf.get(i.number) ?? []).some((c) => /Verified via|<!-- run-cost:/.test(c))
  })

  // Commits on main since the window started: shas to issues (the "(#N)" subject), and reverts.
  const commits = await ghPages(`repos/{owner}/{repo}/commits?sha=main&since=${since}`)
  const shaToIssue = new Map()
  const reverted = new Map()
  for (const c of commits) {
    const msg = c.commit.message
    const subject = msg.split('\n')[0]
    if (/^Revert\b/i.test(subject)) {
      for (const n of msg.match(/#\d+/g) ?? []) reverted.set(Number(n.slice(1)), c.sha.slice(0, 7))
      continue
    }
    // Since the cutover (#946) a subject's trailing "(#N)" is this code repo's PR number, and the
    // issue is named "(<backlog repo>#N)"; before it, the trailing number is the one.
    const n = CODE_REPO.toLowerCase() === BACKLOG_REPO.toLowerCase() ? subject.match(/\(#(\d+)\)\s*$/)?.[1] : subjectIssueNumbers([subject], { code: CODE_REPO })[0]
    if (n) shaToIssue.set(c.sha, Number(n))
  }

  // Bugs that name a cause.
  const causedBy = new Map()
  for (const b of bugs) {
    const text = [b.body ?? '', ...(commentsOf.get(b.number) ?? [])].join('\n')
    const { issues, shas } = causesIn(text)
    const viaSha = shas.flatMap((s) => [...shaToIssue].filter(([full]) => full.startsWith(s)).map(([, n]) => n))
    for (const n of new Set([...issues, ...viaSha])) {
      if (n !== b.number) causedBy.set(n, [...(causedBy.get(n) ?? []), b.number])
    }
  }

  // Merged PRs in the window, matched to their issue by "Fixes #N" or "Issue: #N".
  const prs = (
    await ghPages(`repos/{owner}/{repo}/pulls?state=closed&sort=updated&direction=desc`, (last) => last.updated_at < since)
  ).filter((p) => p.merged_at && p.merged_at >= since)
  const prOf = new Map()
  await mapLimit(prs, 6, async (p) => {
    const issue = Number((p.body ?? '').match(new RegExp(`\\b(?:Fixes|Issue:) ${issueRefSource()}`, 'i'))?.[1])
    const reviews = (await ghPages(`repos/{owner}/{repo}/pulls/${p.number}/reviews`))
      .map((r) => parseReview(r.body ?? ''))
      .filter(Boolean)
      .sort((a, b) => a.round - b.round)
    let firstCi = null
    for (const c of await ghPages(`repos/{owner}/{repo}/pulls/${p.number}/commits`)) {
      const runs = (await gh(`repos/{owner}/{repo}/commits/${c.sha}/check-runs?check_name=${CI_CHECK}&per_page=100`)).check_runs
      const first = runs.sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''))[0]
      if (first) {
        firstCi = first.conclusion === 'success'
        break
      }
    }
    const row = { pr: p.number, issue, opened: p.created_at, merged: p.merged_at, reviews, firstCi }
    if (issue && (!prOf.has(issue) || prOf.get(issue).merged < p.merged_at)) prOf.set(issue, row)
  })

  // Ready time: the last of created, scored (effort and value), and needs-review removed.
  const readyAt = new Map()
  await mapLimit(shipped, 8, async (i) => {
    const events = await ghPages(`${backlogApi()}/issues/${i.number}/events`)
    let ready = i.created_at
    for (const e of events) {
      const name = e.label?.name ?? ''
      const counts =
        (e.event === 'labeled' && (name.startsWith('effort:') || name.startsWith('value:'))) ||
        (e.event === 'unlabeled' && name === 'status:needs-review')
      if (counts && e.created_at > ready) ready = e.created_at
    }
    readyAt.set(i.number, ready)
  })

  const changes = shipped.map((i) => {
    const labels = labelsOf(i)
    const comments = commentsOf.get(i.number) ?? []
    const pr = prOf.get(i.number)
    const merged = pr?.merged ?? i.closed_at
    const costs = new Map()
    for (const c of comments) {
      for (const m of c.matchAll(/<!-- run-cost: (\{.*?\}) -->/g)) {
        try {
          const j = JSON.parse(m[1])
          costs.set(j.session ?? m[1], j.usd)
        } catch {
          // A hand-edited line: skip it.
        }
      }
    }
    return {
      issue: i.number,
      title: i.title,
      month: month(merged),
      lane: laneOf(labels),
      model: modelOf(labels, comments),
      failedBy: [...(reverted.has(i.number) ? [`revert ${reverted.get(i.number)}`] : []), ...(causedBy.get(i.number) ?? []).map((n) => `#${n}`)],
      pr: pr?.pr ?? null,
      reviewed: pr ? pr.reviews.length > 0 : false,
      blocked: pr ? pr.reviews.some((r) => r.blockers > 0) : false,
      sentBack: pr ? pr.reviews[0]?.blockers > 0 && pr.reviews.length > 1 : false,
      fixedNextRound: pr ? pr.reviews[0]?.blockers > 0 && pr.reviews[1]?.blockers === 0 : false,
      firstCi: pr?.firstCi ?? null,
      readyHours: hours(readyAt.get(i.number) ?? i.created_at, merged),
      prHours: pr ? hours(pr.opened, pr.merged) : null,
      usd: costs.size ? [...costs.values()].reduce((a, b) => a + (b ?? 0), 0) : null,
    }
  })

  // Per month, lane and model, plus an "all" row per month.
  const groups = new Map()
  for (const c of changes) {
    for (const key of [`${c.month}|${c.lane}|${c.model}`, `${c.month}|all|all`]) {
      groups.set(key, [...(groups.get(key) ?? []), c])
    }
  }
  const perChange = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, cs]) => {
      const [m, lane, model] = key.split('|')
      const ci = cs.filter((c) => c.firstCi !== null)
      return {
        month: m,
        lane,
        model,
        shipped: cs.length,
        failed: cs.filter((c) => c.failedBy.length).length,
        reviewed: cs.filter((c) => c.reviewed).length,
        blocked: cs.filter((c) => c.blocked).length,
        sentBack: cs.filter((c) => c.sentBack).length,
        fixedNextRound: cs.filter((c) => c.fixedNextRound).length,
        ciRuns: ci.length,
        ciFirstGreen: ci.filter((c) => c.firstCi).length,
        readyHours: median(cs.map((c) => c.readyHours)),
        prHours: median(cs.filter((c) => c.prHours != null).map((c) => c.prHours)),
        usd: median(cs.filter((c) => c.usd != null).map((c) => c.usd)),
      }
    })

  // Product bugs (tooling bugs are about the pipeline, not users) by where they came from.
  const sources = ['owner', 'tester', 'support', 'gate', 'review', 'audit', 'other']
  const defects = new Map()
  for (const b of bugs) {
    const labels = labelsOf(b)
    if (labels.includes('tooling')) continue
    const m = month(b.created_at)
    const row = defects.get(m) ?? Object.fromEntries([['month', m], ...sources.map((s) => [s, 0])])
    row[bugSource(b.body, labels)]++
    defects.set(m, row)
  }
  const perMonthDefects = [...defects.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({ ...r, escaped: ESCAPED.reduce((a, s) => a + r[s], 0) }))

  // Rising two months running: each of the last three months above the one before. Only complete
  // months count: the window's first and current months are partial (fewer bugs, and less time
  // for later bugs to name a change), so they would hide a rise.
  const all = perChange.filter((r) => r.lane === 'all')
  const complete = (r) => r.month !== month(since) && r.month !== month(now.toISOString())
  const rising = (xs) => xs.length >= 3 && xs.at(-3) < xs.at(-2) && xs.at(-2) < xs.at(-1)
  const cfrRows = all.filter(complete)
  const escapedRows = perMonthDefects.filter(complete)
  const cfrSeries = cfrRows.map((r) => (r.shipped ? r.failed / r.shipped : 0))
  const escapedSeries = escapedRows.map((r) => r.escaped)
  const compared = (rows) => (rows.length >= 3 ? rows.slice(-3).map((r) => r.month).join(', ') : 'fewer than 3 complete months')
  const trend = {
    changeFailureRising: rising(cfrSeries),
    escapedRising: rising(escapedSeries),
  }

  if (asJson) {
    console.log(JSON.stringify({ since, until: now.toISOString(), perChange, perMonthDefects, trend, changes }, null, 2))
    return
  }

  const out = []
  out.push(`## Delivery metrics, ${since.slice(0, 10)} to ${now.toISOString().slice(0, 10)} (${days} days)`, '')
  out.push(`${changes.length} shipped changes, ${prs.length} merged PRs, ${bugs.length} bugs filed. Definitions: docs/backlog-runner.md > Delivery metrics.`, '')
  out.push('### Per change (month merged)', '')
  out.push('| Month | Lane | Model | Shipped | Change failure | Review found a blocker | Fixed next round | First-pass CI | Ready to merged (h, median) | PR open to merged (h, median) | Cost ($, median) |')
  out.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const r of perChange) {
    out.push(
      `| ${r.month} | ${r.lane} | ${r.model} | ${r.shipped} | ${pct(r.failed, r.shipped)} | ${pct(r.blocked, r.reviewed)} | ${pct(r.fixedNextRound, r.sentBack)} | ${pct(r.ciFirstGreen, r.ciRuns)} | ${num(r.readyHours, 1)} | ${num(r.prHours, 1)} | ${num(r.usd, 2)} |`,
    )
  }
  out.push('', '### Product bugs (month filed)', '')
  out.push('| Month | Escaped | Owner | Tester | Support | Gate | Review | Audit | Other |')
  out.push('|---|---|---|---|---|---|---|---|---|')
  for (const r of perMonthDefects) {
    out.push(`| ${r.month} | ${r.escaped} | ${r.owner} | ${r.tester} | ${r.support} | ${r.gate} | ${r.review} | ${r.audit} | ${r.other} |`)
  }
  out.push('', '### Trend', '')
  out.push(`- Change failure rate by month: ${all.map((r) => `${r.month} ${pct(r.failed, r.shipped)}`).join(', ') || 'n/a'}. Rising two months running (compared ${compared(cfrRows)}): ${trend.changeFailureRising ? 'yes' : 'no'}.`)
  out.push(`- Escaped bugs by month: ${perMonthDefects.map((r) => `${r.month} ${r.escaped}`).join(', ') || 'n/a'}. Rising two months running (compared ${compared(escapedRows)}): ${trend.escapedRising ? 'yes' : 'no'}.`)
  const failed = changes.filter((c) => c.failedBy.length)
  if (failed.length) {
    out.push('', '### Failed changes', '')
    for (const c of failed) out.push(`- #${c.issue} ${c.title}: ${c.failedBy.join(', ')}`)
  }
  if (!all.some((r) => r.ciRuns)) out.push('', `No \`${CI_CHECK}\` check runs in the window, so first-pass CI is n/a.`)
  console.log(out.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`delivery-metrics: ${e.stderr || e.message}`)
    process.exit(1)
  })
}
