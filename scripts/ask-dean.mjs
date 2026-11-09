// Issue #227: ask the owner a question on a GitHub issue and pick up the answer.
// Agents act on GitHub as the owner, and GitHub never notifies anyone about
// their own comments, so the question is posted by github-actions[bot] through
// .github/workflows/ask-dean.yml. The owner's reply (on GitHub or by replying
// to the notification email) makes .github/workflows/dean-replied.yml swap
// `awaiting-dean` for `dean-replied`.
//
//   node scripts/ask-dean.mjs --issue 42 --question "Which name?" \
//     --option "Routines (recommended)" --option "Plans" [--context "..."]
//   node scripts/ask-dean.mjs --title "Pick a name" --question ... [--label tooling]
//       (opens a new issue first and asks on it)
//   node scripts/ask-dean.mjs --replies     # JSON: answered questions to act on
//   node scripts/ask-dean.mjs --done 42     # remove dean-replied/awaiting-dean once acted on
//   ... --owner-date "2026-10-29 | check Supabase egress"
//       (a dated ask: adds the owner-date marker that puts it on the owner's
//       Google Calendar, #746; scripts/owner-calendar.mjs)
//
// Everything goes through the REST API (`gh api`): cloud sessions refuse the
// GraphQL that `gh issue` and `gh repo` use (#335).
//
// List the recommended option first; it gets letter A. A reply that's unclear
// or matches no option gets asked again, never guessed. See
// docs/backlog-runner.md > Asking the owner.
import { execFileSync } from 'node:child_process'
import { delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isAgentComment, isCalendarRecord, labelIssue, ownerDateMarker } from './owner-calendar.mjs'
import { backlogApi } from './backlog-repo.mjs'

// The workflow puts this in every question it posts, so a reply can be told
// apart from the comments before it.
export const MARKER = '<!-- ask-dean -->'
const LETTERS = 'ABCDEFGHIJ'

// The question as markdown, with lettered options (A is the recommendation),
// ending with the owner-date marker when the ask is dated.
export function formatQuestion({ question, context = '', options = [], ownerDate = null }) {
  if (!question?.trim()) throw new Error('--question is required')
  if (options.length > LETTERS.length) throw new Error(`at most ${LETTERS.length} options`)
  const parts = [question.trim()]
  if (context.trim()) parts.push(context.trim())
  if (options.length) {
    parts.push(options.map((o, i) => `- **${LETTERS[i]}${i === 0 ? ' (recommended)' : ''}:** ${o.trim()}`).join('\n'))
    const letters = [...LETTERS.slice(0, options.length)]
    const list = letters.length === 1 ? letters[0] : `${letters.slice(0, -1).join(', ')}${letters.length > 2 ? ',' : ''} or ${letters.at(-1)}`
    parts.push(`Reply ${list}, plus any notes.`)
  }
  if (ownerDate) parts.push(ownerDateMarker(ownerDate))
  return parts.join('\n\n')
}

// An email reply keeps the quoted notification below an "On <date> ... wrote:"
// line (which mail clients may wrap), so cut from there, then any trailing
// "> " quote block.
export function stripQuotedEmail(body) {
  const text = body.replace(/\r\n/g, '\n')
  const m = text.match(/^On [^\n]*(\n[^\n]*)?\bwrote:[ \t]*$/m)
  return (m ? text.slice(0, m.index) : text).replace(/(\n[ \t]*>[^\n]*)+\s*$/, '').trim()
}

// The owner's comments after the latest ask-dean question, oldest first.
// Comments are { author, body, createdAt }. Returns null when nothing was
// asked, and an empty answer when the owner hasn't replied yet. A calendar
// sync record or any other agent comment (posted as the owner, #746, #1009) is never an answer.
export function findReply(comments, owner) {
  const asked = comments.findLastIndex((c) => c.author !== owner && c.body.includes(MARKER))
  if (asked < 0) return null
  const replies = comments.slice(asked + 1).filter((c) => c.author === owner && !isCalendarRecord(c.body) && !isAgentComment(c.body))
  return {
    question: comments[asked].body.replace(MARKER, '').trim(),
    askedAt: comments[asked].createdAt,
    answer: replies.map((c) => stripQuotedEmail(c.body)).join('\n\n'),
    answeredAt: replies.at(-1)?.createdAt ?? null,
  }
}

function gh(args) {
  // gh lives here on the owner's Windows laptop but isn't on agent shells' PATH.
  const path = process.platform === 'win32' ? `${process.env.PATH}${delimiter}C:\\Program Files\\GitHub CLI` : process.env.PATH
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PATH: path } }).trim()
}

function comments(issue) {
  const pages = JSON.parse(gh(['api', '--paginate', '--slurp', `${backlogApi()}/issues/${issue}/comments`]))
  return pages.flat().map((c) => ({ author: c.user.login, body: c.body ?? '', createdAt: c.created_at }))
}

function owner() {
  return JSON.parse(gh(['api', backlogApi()])).owner.login
}

// Open issues with a label (REST pages, no PRs). Labels can be rewritten by a
// stale label edit from the GitHub app (#335), so --replies never trusts one.
function issuesLabeled(label, state = 'open') {
  const all = []
  for (let page = 1; ; page++) {
    const items = JSON.parse(gh(['api', `${backlogApi()}/issues?state=${state}&labels=${encodeURIComponent(label)}&per_page=100&page=${page}`]))
    all.push(...items.filter((i) => !i.pull_request))
    if (items.length < 100) return all
  }
}

// Answered questions: every open `support`, `awaiting-dean` or `dean-replied`
// issue (plus closed `dean-replied` ones) where the owner commented after the
// latest question, whatever its labels say.
function answeredIssues() {
  const found = new Map()
  for (const [label, state] of [['support', 'open'], ['awaiting-dean', 'open'], ['dean-replied', 'all']]) {
    for (const i of issuesLabeled(label, state)) found.set(i.number, i)
  }
  const me = owner()
  return [...found.values()]
    .sort((x, y) => x.number - y.number)
    .map((i) => ({ i, reply: findReply(comments(i.number), me) }))
    .filter(({ reply }) => reply?.answer)
    .map(({ i, reply }) => ({ number: i.number, title: i.title, url: i.html_url, ...reply }))
}

function parseArgs(argv) {
  const args = { options: [], labels: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--replies') args.replies = true
    else if (a === '--option') args.options.push(argv[++i])
    else if (a === '--label') args.labels.push(argv[++i])
    else if (a === '--owner-date') args.ownerDate = argv[++i]
    else if (['--issue', '--title', '--question', '--context', '--done'].includes(a)) args[a.slice(2)] = argv[++i]
    else throw new Error(`unknown argument: ${a}`)
  }
  return args
}

function main(argv) {
  const args = parseArgs(argv)
  if (args.replies) {
    return console.log(JSON.stringify(answeredIssues(), null, 2))
  }
  if (args.done) {
    if (!/^\d+$/.test(args.done)) throw new Error('--done takes an issue number')
    for (const label of ['dean-replied', 'awaiting-dean']) {
      try {
        gh(['api', '-X', 'DELETE', `${backlogApi()}/issues/${args.done}/labels/${label}`])
      } catch {
        // Label not on the issue: nothing to remove.
      }
    }
    return console.log(`#${args.done}: removed dean-replied and awaiting-dean`)
  }
  const question = formatQuestion(args)
  let issue = args.issue
  if (!issue) {
    if (!args.title) throw new Error('pass --issue <N>, or --title to open a new issue')
    const body = [args.context?.trim() || args.question.trim(), '_Opened by scripts/ask-dean.mjs to ask the owner (#227)._'].join('\n\n')
    const created = JSON.parse(gh(['api', '-X', 'POST', `${backlogApi()}/issues`, '-f', `title=${args.title}`, '-f', `body=${body}`, ...args.labels.flatMap((l) => ['-f', `labels[]=${l}`])]))
    issue = String(created.number)
  }
  if (!/^\d+$/.test(issue)) throw new Error('--issue takes an issue number')
  if (args.ownerDate) labelIssue(issue)
  const { default_branch: ref } = JSON.parse(gh(['api', backlogApi()]))
  gh(['api', '-X', 'POST', `${backlogApi()}/actions/workflows/ask-dean.yml/dispatches`, '-f', `ref=${ref}`, '-f', `inputs[issue]=${issue}`, '-f', `inputs[question]=${question}`])
  console.log(`#${issue}: asked through ask-dean.yml`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
