#!/usr/bin/env node
// Sprint review, replies (#607, #664): turns the owner's comments on a `Sprint review:` issue into
// accepted changes, follow-up issues, and a status line. It only files issues and edits or closes
// the review issue; it never reverts code or cuts a release. The /sprint-review-reply skill drives
// it and decides what each comment means; this only records the actions.
//
//   node scripts/demo-video/review/review-reply.mjs plan <review#>
//   node scripts/demo-video/review/review-reply.mjs accept <review#> <issue#> [--said T] [--comment ID]
//   node scripts/demo-video/review/review-reply.mjs accept-rest <review#> --said T [--comment ID]
//   node scripts/demo-video/review/review-reply.mjs change <review#> <issue#> --effort E --value V [--title T] [--said T] [--comment ID]
//   node scripts/demo-video/review/review-reply.mjs pull <review#> <issue#> [--effort E] [--said T] [--comment ID]
//   node scripts/demo-video/review/review-reply.mjs ask <review#> [<issue#>] --question Q [--said T] [--comment ID]
//   node scripts/demo-video/review/review-reply.mjs read <review#> --comment ID
//   node scripts/demo-video/review/review-reply.mjs status <review#>
//
// `plan` prints the owner's comments (whole, each marked new, held, or read), every change with
// its title and release note, its latest `#N` line, and what was already done. `accept-rest`
// accepts every change with no verdict yet ("looks good", or what a comment didn't mention);
// running it again changes nothing. `change` files a scored issue the lanes can take at once;
// `pull` files a revert at value 13 so it ships before the release; `ask` asks the owner on the
// review issue (awaiting-dean) and never guesses, about one change or, without `<issue#>`, about
// the comment as a whole. `--said` is the owner's words about that change when they aren't a `#N`
// line. `--comment ID` marks that comment read (`ask` marks it held, so the next run comes back to
// it, and only `read` or `accept-rest` releases it); `read` does only that. Every command ends by rewriting the status line and Outcome list,
// and closes the review once it's ready to release. Run `status` alone to refresh them after a
// follow-up ships.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { acceptRest, classify, readActions, readSeen, ready, refreshBody, sayings, writeActions, writeSeen } from './review-state.mjs'
import { backlogApi } from '../../backlog-repo.mjs'

const MARK = /<!-- sprint-review: (\{.*?\}) -->/
const FIBONACCI = new Set(['1', '2', '3', '5', '8', '13'])

const gh = (...args) => JSON.parse(execFileSync(process.env.GH ?? 'gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }) || 'null')

function tmpFile(name, text) {
  const file = join(mkdtempSync(join(tmpdir(), 'review-reply-')), name)
  writeFileSync(file, text)
  return file
}

function loadReview(number) {
  const issue = gh(`${backlogApi()}/issues/${number}`)
  const mark = issue.body?.match(MARK)
  if (!issue.labels.some((l) => l.name === 'sprint-review') || !mark) throw new Error(`#${number} is not a sprint review issue`)
  const owner = gh(backlogApi()).owner.login
  const comments = gh(`${backlogApi()}/issues/${number}/comments?per_page=100&page=1`).filter((c) => c.user.login === owner && !c.body?.startsWith(DONE_MARK))
  const said = sayings(comments.map((c) => c.body ?? ''))
  return { issue, review: JSON.parse(mark[1]), said, comments }
}

const closedCache = new Map()
function isClosed(n) {
  if (!n) return false
  if (!closedCache.has(n)) closedCache.set(n, gh(`${backlogApi()}/issues/${n}`).state === 'closed')
  return closedCache.get(n)
}

// Overlapping runs (one per owner comment, no lock) must not drop each other's entries: re-read the
// issue body now and merge only this run's entry into its current marker (#636).
// `entries` maps change number to its new action; `comment` (with `seen`, 'read' or 'held') marks
// one owner comment as acted on. A held comment stays held until `read` or `accept-rest` (`settle`)
// says the owner's answer has been acted on, so filing another of its complaints can't release it.
function save(number, review, entries = {}, comment, seen = 'read', settle = false) {
  const issue = gh(`${backlogApi()}/issues/${number}`)
  const actions = { ...readActions(issue.body), ...entries }
  let body = writeActions(issue.body, actions)
  if (comment) {
    const marks = readSeen(body)
    if (settle || marks[comment] !== 'held') body = writeSeen(body, { ...marks, [comment]: seen })
  }
  body = refreshBody(body, review.version, isClosed)
  gh('-X', 'PATCH', `${backlogApi()}/issues/${number}`, '-F', `body=@${tmpFile('body.md', body)}`)
  console.error(`Updated #${number}: ${body.split('\n').find((l) => l.startsWith('**Status:**'))}`)
  if (issue.state === 'open' && ready(review.issues, actions, isClosed)) closeReview(number)
}

// Every change is settled: close the review as completed, then say so (#664). Closing first means
// the comment's event payload shows a closed issue, so dean-replied.yml doesn't fire another run
// (#668). The comment carries DONE_MARK so `plan` never shows it as an owner comment.
const DONE_MARK = '<!-- review-closed -->'

function closeReview(number) {
  gh('-X', 'PATCH', `${backlogApi()}/issues/${number}`, '-f', 'state=closed', '-f', 'state_reason=completed')
  try {
    gh('-X', 'DELETE', `${backlogApi()}/issues/${number}/labels/awaiting-dean`)
  } catch {
    // Not there.
  }
  gh('-X', 'POST', `${backlogApi()}/issues/${number}/comments`, '-F', `body=@${tmpFile('done.md', `${DONE_MARK}\nEvery change is settled. Ready to release, so this review is closed. \`/release\` when you want it.`)}`)
  console.error(`Closed #${number}: ready to release`)
}

function titleOf(n) {
  return gh(`${backlogApi()}/issues/${n}`).title
}

function fileIssue(title, body, labels) {
  const args = ['-X', 'POST', `${backlogApi()}/issues`, '-f', `title=${title}`, '-F', `body=@${tmpFile('issue.md', body)}`]
  for (const l of labels) args.push('-f', `labels[]=${l}`)
  return gh(...args).number
}

const quote = (text) => text.split('\n').map((l) => `> ${l}`).join('\n')

export function plan(reviewNumber) {
  const { issue, review, said, comments } = loadReview(reviewNumber)
  const actions = readActions(issue.body)
  const seen = readSeen(issue.body)
  const about = new Map((review.changes ?? []).map((c) => [c.issue, c]))
  const items = review.issues.map((n) => {
    const line = said.get(n) ?? null
    const done = actions[n]
    return {
      issue: n,
      title: about.get(n)?.title ?? titleOf(n),
      note: about.get(n)?.note ?? null,
      said: line,
      guess: line ? classify(line) : null,
      state: done?.v ?? null,
      followUp: done?.f ?? null,
      todo: line !== null && done?.said !== line,
    }
  })
  const other = [...said].filter(([n]) => !review.issues.includes(n)).map(([n, text]) => ({ issue: n, said: text }))
  const owner = comments.map((c) => ({ id: c.id, at: c.created_at, body: c.body ?? '', seen: seen[c.id] ?? null }))
  const unsettled = items.filter((i) => !i.state).map((i) => i.issue)
  return { review: reviewNumber, version: review.version, state: issue.state, comments: owner, unsettled, items, other }
}

function main(argv) {
  const [cmd, r, n, ...rest] = argv
  const flag = (name) => {
    const i = rest.indexOf(`--${name}`)
    return i >= 0 ? rest[i + 1] : undefined
  }
  if (cmd === 'plan') return console.log(JSON.stringify(plan(Number(r)), null, 2))
  const { issue, review, said } = loadReview(Number(r))
  const actions = readActions(issue.body)
  if (cmd === 'status') return save(Number(r), review)
  const args = [n, ...rest]
  const opt = (name) => {
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : undefined
  }
  const comment = opt('comment')
  if (comment && !/^\d+$/.test(comment)) throw new Error('--comment takes a comment id from plan')
  if (cmd === 'read') {
    if (!comment) throw new Error('read needs --comment')
    return save(Number(r), review, {}, comment, 'read', true)
  }
  if (cmd === 'accept-rest') {
    const line = opt('said')
    if (!line) throw new Error('accept-rest needs --said (the owner\'s words)')
    const fresh = readActions(gh(`${backlogApi()}/issues/${Number(r)}`).body)
    const entries = acceptRest(review.issues, fresh, line)
    if (!Object.keys(entries).length && !comment) return console.error('Nothing left to accept')
    for (const c of Object.keys(entries)) console.log(`#${c} accepted`)
    return save(Number(r), review, entries, comment, 'read', true)
  }
  if (cmd === 'ask' && (n === undefined || n.startsWith('--'))) {
    // A question about the comment as a whole: no change is touched, and the comment is held.
    const question = opt('question')
    if (!question) throw new Error('ask without an issue needs --question')
    execFileSync('node', ['scripts/ask-dean.mjs', '--issue', r, '--question', question], { stdio: 'inherit' })
    return save(Number(r), review, {}, comment, 'held')
  }
  const change = Number(n)
  if (!review.issues.includes(change)) throw new Error(`#${change} is not one of this review's changes`)
  const line = flag('said') ?? said.get(change)
  if (!line) throw new Error(`The owner hasn't said anything about #${change}`)
  const prev = actions[change]
  if (prev?.said === line && prev.v !== 'asked') {
    if (comment) save(Number(r), review, {}, comment)
    return console.error(`#${change} already handled for "${line}"`)
  }
  const handled = (fresh) => fresh?.said === line && fresh.v !== 'asked'
  // A run that started earlier may have saved this item since we loaded: skip rather than refile.
  if (handled(readActions(gh(`${backlogApi()}/issues/${Number(r)}`).body)[change])) {
    if (comment) save(Number(r), review, {}, comment)
    return console.error(`#${change} already handled for "${line}"`)
  }
  const reviewLink = `#${r}`
  let entry
  if (cmd === 'accept') entry = { v: 'accepted', said: line }
  else if (cmd === 'change' || cmd === 'pull') {
    const pull = cmd === 'pull'
    const effort = flag('effort') ?? (pull ? '2' : undefined)
    const value = pull ? '13' : flag('value')
    if (!FIBONACCI.has(effort) || !FIBONACCI.has(value)) throw new Error('change needs --effort and --value on the Fibonacci scale (1, 2, 3, 5, 8, 13)')
    const original = titleOf(change)
    const title = pull ? `Revert #${change}: ${original}` : (flag('title') ?? `Change #${change}: ${original}`)
    const body = pull
      ? `The owner pulled #${change} in the sprint review ${reviewLink}:\n\n${quote(line)}\n\nRevert it so it ships before the release: undo the change from #${change} (\`git log --grep "(#${change})"\`), delete its \`release-notes/${change}.json\` and any guide page, clip spec, or screenshots it added, and keep the revert one commit. Do not touch other changes in this release. Original: #${change}.`
      : `The owner asked for a change to #${change} in the sprint review ${reviewLink}:\n\n${quote(line)}\n\nOriginal: #${change} (${original}). Build what the owner asked for on top of the shipped change. Released to the lanes because the owner asked for it.`
    const labels = [pull ? 'bug' : 'feature', `effort:${effort}`, `value:${value}`]
    const followUp = fileIssue(title, body, labels)
    gh('-X', 'POST', `${backlogApi()}/issues/${change}/comments`, '-F', `body=@${tmpFile('c.md', `Sprint review ${reviewLink}: ${pull ? 'pulled' : 'change requested'} in #${followUp}.`)}`)
    entry = { v: pull ? 'pulled' : 'change', said: line, f: followUp }
    console.log(`Filed #${followUp} for #${change}`)
  } else if (cmd === 'ask') {
    const question = flag('question') ?? `#${change}: "${line}". What should I do with it?`
    execFileSync('node', ['scripts/ask-dean.mjs', '--issue', r, '--question', question, '--option', 'Accept it', '--option', 'Change it (say what in your reply)', '--option', 'Pull it from this release'], { stdio: 'inherit' })
    entry = { v: 'asked', said: line }
  } else throw new Error(`unknown command ${cmd}`)
  save(Number(r), review, { [change]: entry }, comment, cmd === 'ask' ? 'held' : 'read')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(`review-reply: ${e.message}`)
    process.exit(1)
  }
}
