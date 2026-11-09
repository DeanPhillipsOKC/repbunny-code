#!/usr/bin/env node
// Sprint review, step 3 (#606): files the review issue for the video sprint-review.mjs made.
// Uploads the video to claude/issue-assets/review-<version>/ (issue-shot.mjs) so it plays from a
// phone, opens `Sprint review: v<X.Y.Z> candidate` labeled `sprint-review` and `awaiting-dean`,
// and closes any older open review issue with a link to the new one.
//
//   node scripts/demo-video/review/review-issue.mjs [--email <file.html>] [--run-url <url>]
//   node scripts/demo-video/review/review-issue.mjs --status
//
// With --email it also writes the email card and prints its subject (the workflow sends it with
// Send-Notification.ps1). --status prints the line /release adds to its preview,
// `Sprint review: <issue link> (<state>)`, for the newest review issue, or nothing.
// The owner answers with one comment about the whole release (#664): "looks good", or what they
// don't like, and anything not mentioned counts as good. `#535 good` style lines still work.
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { classify, readActions, sayings, statusText } from './review-state.mjs'
import { backlogApi } from '../../backlog-repo.mjs'

const WORK = join('logs', 'demo-video', 'review')

// The video is attached to the email when it is under this size (the workflow's "Email the link"
// step applies the same limit; Gmail allows 25 MB).
export const ATTACH_LIMIT = 20 * 1024 * 1024
const LABEL = 'sprint-review'
const MARK = /<!-- sprint-review: (\{.*?\}) -->/

const gh = (...args) => JSON.parse(execFileSync(process.env.GH ?? 'gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }) || 'null')

export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`

// The owner's verdicts from comment bodies, last word per issue wins: 'accepted', 'change', or
// 'pulled'.
export function verdicts(bodies) {
  return new Map([...sayings(bodies)].map(([n, said]) => [n, classify(said)]))
}

// The one-line reply instruction, on the issue and in the email.
export const REPLY_HOW = "Comment once: say it looks good, or say what you don't like. Anything you don't mention counts as good."

// The body's marker: the version and each change's number, title, and release note, so the reply
// routine can match the owner's prose to a change. `<` and `>` are escaped so a note can't end the
// HTML comment.
function marker(release) {
  const changes = release.changes.map((c) => ({ issue: c.issue, title: c.title, note: c.notes.join(' ') }))
  return JSON.stringify({ version: release.version, issues: release.changes.map((c) => c.issue), changes }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

export function issueBody(release, video, videoLink, runUrl) {
  const at = new Map(video.clips.map((c) => [c.issue, c.at]))
  const shown = release.changes.filter((c) => c.clip)
  const notShown = release.changes.filter((c) => !c.clip && !c.trivial)
  const trivial = release.changes.filter((c) => c.trivial)
  const lines = [
    `**Status:** v${release.version} candidate (${release.bump}), ${release.changes.length} change${release.changes.length === 1 ? '' : 's'} since \`${release.tag}\`: ${shown.length} shown in the video, ${notShown.length + trivial.length} not shown. Waiting on your review.`,
    '',
    `**Video:** ${videoLink} (${clock(video.duration)}). On a phone, play it from the email attachment or run /sprint-review in Claude.`,
    '',
  ]
  if (shown.length) {
    lines.push('## Shown in the video', '')
    for (const c of shown) {
      lines.push(`### #${c.issue} ${c.title} · ${clock(at.get(c.issue) ?? 0)}`, '')
      for (const n of c.notes) lines.push(`> ${n}`, '')
      lines.push(`[Clip: segment.mp4](https://github.com/{repo}/blob/claude/issue-assets/${c.issue}/segment.mp4) (desktop download) · starts at ${clock(at.get(c.issue) ?? 0)} in the video`, '')
    }
  }
  if (notShown.length || trivial.length) {
    lines.push('## Not shown', '')
    for (const c of notShown) lines.push(`- **#${c.issue} ${c.title}.** ${c.notes.join(' ')} _No clip: ${c.reason}._`)
    if (trivial.length) {
      lines.push('', 'Trivial:')
      for (const c of trivial) lines.push(`- #${c.issue} ${c.notes.join(' ')}`)
    }
    lines.push('')
  }
  lines.push('## Outcome', '')
  for (const c of release.changes) lines.push(`- #${c.issue} ${c.title}: waiting on your review`)
  lines.push('', '## Up next', '')
  if (release.upNext.length) for (const i of release.upNext) lines.push(`- #${i.issue} ${i.title}${i.note}`)
  else lines.push('- Nothing user-facing queued.')
  lines.push(
    '',
    '## How to reply',
    '',
    REPLY_HOW,
    '',
    '`#N ...` lines still work if you want to be specific, such as `#536: make the button bigger` or `#547 pull it`.',
    '',
    'A routine reads your comment, files an issue for each change or revert, keeps the outcome list and the status line above up to date, and closes this issue once it is ready to release.',
    '',
    `\`/release\` shows how many are accepted, and it doesn't wait on this review.${runUrl ? ` Built by [this run](${runUrl}).` : ''}`,
    '',
    `<!-- sprint-review: ${marker(release)} -->`,
    '<!-- sprint-review-actions: {} -->',
  )
  return lines.join('\n')
}

// The code repo: issue-shot.mjs puts the clips on its claude/issue-assets branch (#944).
function repoName() {
  return gh('repos/{owner}/{repo}').full_name
}

function reviewIssues(state) {
  return gh(`${backlogApi()}/issues?state=${state}&labels=${LABEL}&sort=created&direction=desc&per_page=100&page=1`).filter((i) => !i.pull_request)
}

// `Sprint review: <link> (<state>)` for the newest review issue, or '' when there's none.
export function statusLine() {
  const issue = reviewIssues('open')[0] ?? reviewIssues('all')[0]
  if (!issue) return ''
  const mark = issue.body?.match(MARK)
  const changes = mark ? JSON.parse(mark[1]).issues : []
  const actions = readActions(issue.body)
  const closed = new Map()
  const isClosed = (n) => {
    if (!n) return false
    if (!closed.has(n)) closed.set(n, gh(`${backlogApi()}/issues/${n}`).state === 'closed')
    return closed.get(n)
  }
  if (Object.keys(actions).length || issue.state === 'closed') return statusText({ url: issue.html_url, state: issue.state }, changes, actions, isClosed)
  // Nothing acted on yet: count the owner's `#N` lines the routine hasn't read.
  const owner = gh(backlogApi()).owner.login
  const bodies = gh(`${backlogApi()}/issues/${issue.number}/comments?per_page=100&page=1`).filter((c) => c.user.login === owner).map((c) => c.body ?? '')
  const said = verdicts(bodies)
  const accepted = changes.filter((n) => said.get(n) === 'accepted').length
  const pulled = changes.filter((n) => said.get(n) === 'pulled').length
  const asked = changes.filter((n) => said.get(n) === 'change').length
  const extra = [asked && `${asked} with changes asked`, pulled && `${pulled} pulled`].filter(Boolean).join(', ')
  return `Sprint review: ${issue.html_url} (${accepted} of ${changes.length} accepted${extra ? `; ${extra}` : ''})`
}

export function emailCard(release, url, videoUrl, attached = false) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const shown = release.changes.filter((c) => c.clip).length
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;color:#1f1b24">
<h2 style="margin:0 0 8px">Sprint review: v${esc(release.version)} candidate</h2>
<p style="margin:0 0 12px">${release.changes.length} change${release.changes.length === 1 ? '' : 's'} since ${esc(release.tag)}, ${shown} shown in the video.</p>
${attached ? '<p style="margin:0 0 12px">The video is attached to this email.</p>\n' : ''}<p style="margin:0 0 8px"><a href="${esc(attached ? url : videoUrl)}" style="background:#f2879c;color:#17111c;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">${attached ? 'Open the review' : 'Watch the review'}</a></p>
<p style="margin:12px 0 0">Then reply on <a href="${esc(url)}">the review issue</a>. ${esc(REPLY_HOW)}</p>
</div>`
}

function main(argv) {
  if (argv.includes('--status')) {
    const line = statusLine()
    if (line) console.log(line)
    return
  }
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const release = JSON.parse(readFileSync(join(WORK, 'release.json'), 'utf8'))
  const video = JSON.parse(readFileSync(join(WORK, 'sprint-review.json'), 'utf8'))
  const folder = `review-${release.version}`
  const link = execFileSync('node', ['scripts/issue-shot.mjs', folder, join(WORK, 'sprint-review.mp4')], { encoding: 'utf8' }).trim().split('\n').at(-1)
  const videoUrl = link.match(/\((https:[^)]+)\)/)[1]
  const body = issueBody(release, video, link, arg('run-url')).replaceAll('{repo}', repoName())
  try {
    gh('-X', 'POST', `${backlogApi()}/labels`, '-f', `name=${LABEL}`, '-f', 'color=b79cf0', '-f', 'description=A sprint review of the next store release (#606)')
  } catch {
    // Already there.
  }
  const older = reviewIssues('open')
  const file = join(WORK, 'review-issue.md')
  writeFileSync(file, body)
  const created = gh('-X', 'POST', `${backlogApi()}/issues`, '-f', `title=Sprint review: v${release.version} candidate`, '-F', `body=@${file}`, '-f', `labels[]=${LABEL}`, '-f', 'labels[]=awaiting-dean')
  for (const old of older) {
    const note = join(WORK, 'review-close.md')
    writeFileSync(note, `Replaced by #${created.number}, the review for v${release.version}.`)
    gh('-X', 'POST', `${backlogApi()}/issues/${old.number}/comments`, '-F', `body=@${note}`)
    gh('-X', 'PATCH', `${backlogApi()}/issues/${old.number}`, '-f', 'state=closed', '-f', 'state_reason=not_planned')
  }
  console.error(`Filed ${created.html_url}${older.length ? `, closed ${older.map((o) => `#${o.number}`).join(', ')}` : ''}`)
  const email = arg('email')
  if (email) {
    writeFileSync(email, emailCard(release, created.html_url, videoUrl, statSync(join(WORK, 'sprint-review.mp4')).size < ATTACH_LIMIT))
    console.log(`Sprint review: v${release.version} candidate`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
