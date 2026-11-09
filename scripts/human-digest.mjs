// Issue #225: a weekly email digest of the open `human` issues (things only the
// owner can do), so they don't wait until someone runs /next-item by hand.
// `interaction-required` issues (an agent can't finish them without the owner)
// are included and counted as human throughout.
// .github/workflows/human-digest.yml runs it every Monday and sends the card
// through scripts/Send-Notification.ps1.
//
//   node scripts/human-digest.mjs --out digest.html   # writes the card, prints the subject
//   node scripts/human-digest.mjs                     # prints the card to stdout
//
// Prints and writes nothing when there are no open human issues, so the
// workflow sends nothing. The card has four parts:
//   - Top 3: the scored, unblocked human issues ranked like next-issue.mjs
//     (ROI, then value, then oldest), with effort as rough time and the first
//     step from the issue body.
//   - Unblocks: human issues that block an open AI issue, since finishing one
//     frees the runner.
//   - Getting stale: no update in STALE_DAYS+ days, oldest first, max 3.
//   - On hold: the latest comment (not counting calendar sync records, #746)
//     says "on hold ... until <YYYY-MM-DD>" with a future date. These are left
//     out of the other three parts.
// See docs/backlog-runner.md > Weekly digest of human issues.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { delimiter, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isCalendarRecord } from './owner-calendar.mjs'
import { BACKLOG_REPO } from './backlog-repo.mjs'

export const STALE_DAYS = 21
const TOP = 3
const SKIP = new Set(['status:blocked', 'status:needs-review'])

const DAY_MS = 24 * 60 * 60 * 1000

// Rough time for a human issue's Fibonacci effort label.
export function effortTime(effort) {
  if (!effort) return null
  if (effort <= 1) return 'About 15 min'
  if (effort <= 2) return 'About 30 min'
  if (effort <= 3) return 'About an hour'
  if (effort <= 5) return 'An afternoon'
  return 'A day or more'
}

function plain(markdown) {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(text, max = 160) {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  return cut.slice(0, cut.lastIndexOf(' ')) + '…'
}

// The first numbered step in the body, else the first bullet, else the first
// line of prose. Markdown is stripped and long steps are cut at a word.
export function firstStep(body) {
  const lines = (body ?? '').split(/\r?\n/)
  const numbered = lines.find((l) => /^\s*1[.)]\s+\S/.test(l))
  const bullet = lines.find((l) => /^\s*[-*]\s+(\[[ x]\]\s+)?\S/.test(l))
  const prose = lines.find((l) => l.trim() && !/^\s*(#|>|```|\|)/.test(l))
  const line = numbered?.replace(/^\s*1[.)]\s+/, '') ?? bullet?.replace(/^\s*[-*]\s+(\[[ x]\]\s+)?/, '') ?? prose
  return line ? clip(plain(line)) : null
}

// The date in "on hold ... until (about) YYYY-MM-DD" in a comment, when it's
// still in the future on `today` (a YYYY-MM-DD string). Otherwise null.
export function onHoldUntil(comment, today) {
  const match = /on hold\b[^]*?\buntil\s+(?:about\s+|around\s+|~)?(\d{4}-\d{2}-\d{2})/i.exec(comment ?? '')
  return match && match[1] > today ? match[1] : null
}

// The newest of an issue's last few comments (oldest first) that isn't a calendar sync record
// (#746): the Owner calendar routine replies to an `On hold until` comment, and that record
// mustn't hide the pause.
export function latestComment(bodies) {
  return bodies.findLast((b) => !isCalendarRecord(b)) ?? ''
}

const labelNumber = (labels, prefix) => {
  const hit = labels.find((l) => l.startsWith(prefix))
  return hit ? Number(hit.slice(prefix.length)) : null
}

// `issues` are open `human` issues: { number, title, url, body, updatedAt,
// labels: string[], openBlockers, lastComment, blocking: [{ number, title, human }] }
// where `blocking` lists only the open issues it blocks. Returns the digest's
// sections, or null when there are no issues.
export function digestSections(issues, today) {
  if (issues.length === 0) return null
  const todayMs = Date.parse(`${today}T00:00:00Z`)
  const onHold = []
  const active = []
  for (const issue of issues) {
    const until = onHoldUntil(issue.lastComment, today)
    if (until) onHold.push({ ...issue, until })
    else active.push(issue)
  }

  const top = active
    .map((i) => {
      const effort = labelNumber(i.labels, 'effort:')
      const value = labelNumber(i.labels, 'value:')
      return { ...i, effort, value, roi: effort && value ? value / effort : null }
    })
    .filter((i) => i.roi !== null && !i.labels.some((l) => SKIP.has(l)) && i.openBlockers === 0)
    .sort((a, b) => b.roi - a.roi || b.value - a.value || a.number - b.number)
    .slice(0, TOP)
    .map((i) => ({ ...i, time: effortTime(i.effort), step: firstStep(i.body) }))

  const unblocks = active
    .map((i) => ({ ...i, frees: i.blocking.filter((b) => !b.human) }))
    .filter((i) => i.frees.length > 0)
    .sort((a, b) => b.frees.length - a.frees.length || a.number - b.number)
    .slice(0, TOP)

  const stale = active
    .map((i) => ({ ...i, days: Math.floor((todayMs - Date.parse(i.updatedAt)) / DAY_MS) }))
    .filter((i) => i.days >= STALE_DAYS)
    .sort((a, b) => b.days - a.days || a.number - b.number)
    .slice(0, TOP)

  onHold.sort((a, b) => a.until.localeCompare(b.until) || a.number - b.number)
  return { total: issues.length, top, unblocks, stale, onHold }
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const row = (label, value) =>
  `<tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">${label}</td><td style="padding:5px 0;word-break:break-word;overflow-wrap:anywhere;">${value}</td></tr>`
const link = (href, text) => `<a href="${escapeHtml(href)}" style="color:#f2879c;">${escapeHtml(text)}</a>`
const list = (items) =>
  `<ul style="margin:0;padding-left:18px;">${items.map((i) => `<li style="margin:0 0 8px;">${i}</li>`).join('')}</ul>`
const muted = (text) => `<span style="color:#b9a8c2;font-size:12px;">${text}</span>`
const issueLink = (i) => link(i.url, `#${i.number} ${i.title}`)

// The digest card, in /next-item's card style (docs/brand-identity.md tokens).
// Null when there's nothing to send.
export function digestEmail(issues, today) {
  const s = digestSections(issues, today)
  if (!s) return null
  const rows = []
  if (s.top.length > 0) {
    rows.push(
      row(
        'Do next',
        list(
          s.top.map((i) => {
            const meta = [i.time, i.step && `First step: ${escapeHtml(i.step)}`].filter(Boolean)
            return `${issueLink(i)}${meta.length ? `<br>${muted(meta.join('. '))}` : ''}`
          }),
        ),
      ),
    )
  }
  if (s.unblocks.length > 0) {
    rows.push(
      row(
        'Unblocks',
        list(
          s.unblocks.map(
            (i) =>
              `${issueLink(i)}<br>${muted(`Frees the runner for ${i.frees.map((b) => `#${b.number}`).join(', ')}`)}`,
          ),
        ),
      ),
    )
  }
  if (s.stale.length > 0) {
    rows.push(row('Getting stale', list(s.stale.map((i) => `${issueLink(i)}<br>${muted(`No update in ${i.days} days`)}`))))
  }
  if (s.onHold.length > 0) {
    rows.push(row('On hold', list(s.onHold.map((i) => `${issueLink(i)}<br>${muted(`Until ${i.until}`)}`))))
  }
  const waiting = s.total === 1 ? '1 thing is' : `${s.total} things are`
  return {
    subject: `RepBunny: ${s.total} ${s.total === 1 ? 'issue needs' : 'issues need'} you this week`,
    html: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  </head>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Manrope,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:520px;width:100%;margin:0 auto;background:#211829;border-radius:14px;">
      <div style="padding:14px 20px;background:#17111c;border-radius:14px 14px 0 0;">
        <span style="font-family:'Baloo 2',ui-rounded,Segoe UI,Arial,sans-serif;color:#f2879c;font-size:14px;font-weight:700;">🐰 RepBunny</span>
      </div>
      <div style="padding:10px 20px;background:#f2879c;">
        <span style="color:#241a2c;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Waiting on you</span>
      </div>
      <div style="padding:20px;background:#211829;border-radius:0 0 14px 14px;">
        <h2 style="margin:0 0 2px;font-family:'Baloo 2',ui-rounded,Segoe UI,Arial,sans-serif;font-size:18px;color:#f2879c;word-break:break-word;overflow-wrap:anywhere;">Your week in the backlog</h2>
        <p style="margin:0 0 16px;font-size:12px;color:#b79cf0;">${waiting} waiting on you (${escapeHtml(today)})</p>
        <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:14px;color:#f5edf2;">
          ${rows.join('\n          ')}
        </table>
      </div>
    </div>
  </body>
</html>
`,
  }
}

// GraphQL rather than `gh issue list`, which can't report issue dependencies.
const query = `query($owner: String!, $repo: String!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    issues(states: OPEN, labels: ["human", "interaction-required"], first: 100, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url body updatedAt
        labels(first: 50) { nodes { name } }
        issueDependenciesSummary { blockedBy }
        blocking(first: 20) { nodes { number title state labels(first: 50) { nodes { name } } } }
        comments(last: 5) { nodes { body } }
      }
    }
  }
}`

function fetchHumanIssues() {
  // gh lives here on the owner's Windows laptop but isn't on agent shells' PATH.
  const path = process.platform === 'win32' ? `${process.env.PATH}${delimiter}C:\\Program Files\\GitHub CLI` : process.env.PATH
  const raw = execFileSync('gh', ['api', 'graphql', '--paginate', '--slurp', '-F', `owner=${BACKLOG_REPO.split('/')[0]}`, '-F', `repo=${BACKLOG_REPO.split('/')[1]}`, '-f', `query=${query}`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, PATH: path },
  })
  return JSON.parse(raw)
    .flatMap((page) => page.data.repository.issues.nodes)
    .map((i) => ({
      number: i.number,
      title: i.title,
      url: i.url,
      body: i.body,
      updatedAt: i.updatedAt,
      labels: i.labels.nodes.map((l) => l.name),
      openBlockers: i.issueDependenciesSummary.blockedBy,
      lastComment: latestComment(i.comments.nodes.map((c) => c.body)),
      blocking: i.blocking.nodes
        .filter((b) => b.state === 'OPEN')
        .map((b) => ({
          number: b.number,
          title: b.title,
          human: b.labels.nodes.some((l) => l.name === 'human' || l.name === 'interaction-required'),
        })),
    }))
}

function main(argv) {
  const i = argv.indexOf('--out')
  const out = i >= 0 ? argv[i + 1] : undefined
  const today = new Date().toISOString().slice(0, 10)
  const email = digestEmail(fetchHumanIssues(), today)
  if (!email) return
  if (!out) return console.log(email.html)
  if (dirname(out) !== '.') mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, email.html)
  console.log(email.subject)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
