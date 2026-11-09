// Issue #341: the rolling "Android QA batch" issue. Shipped work that only a real
// Android device can check is queued here as a checklist, so the owner knows what
// changed natively since the last pass and when enough has piled up to cut a build.
//
//   node scripts/qa-batch.mjs --add TC-DEV-001 --issue 123 --summary "Back button closes the sheet" [--dry-run]
//   node scripts/qa-batch.mjs --status
//
// --add finds the open issue labeled `android-qa-batch` (or creates one), appends
// `- [ ] TC-XXX-000 (P1) summary, from #N (YYYY-MM-DD)`, or updates the line when the
// TC is already listed, then asks the owner once through ask-dean.mjs when 10+
// cases are queued or a P1 line is over 7 days old. --dry-run prints the REST calls
// instead of making the writes. REST only (`gh api`), so it works in cloud sessions
// (#335). The owner closes the batch after testing a build; the next --add starts a
// new one. See docs/qa-procedure.md > Android QA batches.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { backlogApi } from './backlog-repo.mjs'

export const LABEL = 'android-qa-batch'
export const ASKED_MARKER = '<!-- qa-batch-asked -->'
export const MAX_CASES = 10
export const P1_DAYS = 7
const LINE = /^- \[( |x)\] (TC-[A-Z]+-\d+) \((P\d)\) (.*?)(?:, from #(\d+))?(?: \((\d{4}-\d{2}-\d{2})\))?$/

export function parseCases(body) {
  return (body ?? '').split(/\r?\n/).flatMap((text) => {
    const m = text.match(LINE)
    return m ? [{ done: m[1] === 'x', id: m[2], priority: m[3], summary: m[4], issue: m[5] ?? '', date: m[6] ?? '' }] : []
  })
}

export function formatLine({ done = false, id, priority, summary, issue, date }) {
  return `- [${done ? 'x' : ' '}] ${id} (${priority}) ${summary}${issue ? `, from #${issue}` : ''}${date ? ` (${date})` : ''}`
}

const INTRO = [
  'Manual Android checks for work shipped since the last tested build. Lanes append here (`node scripts/qa-batch.mjs --add`); full test cases live in `scripts/qa/procedure.mjs`.',
  'Close this issue after testing a build. Bugs found get their own issues, so closing means "this build was tested", not "all passed".',
].join('\n\n')

// The body with this case added, or its existing line replaced (keeping its tick and date).
export function upsertCase(body, entry) {
  const lines = (body || INTRO).split(/\r?\n/)
  const i = lines.findIndex((l) => LINE.test(l) && l.match(LINE)[2] === entry.id)
  if (i >= 0) {
    const old = lines[i].match(LINE)
    lines[i] = formatLine({ ...entry, done: old[1] === 'x', date: old[6] ?? entry.date })
  } else {
    let last = lines.findLastIndex((l) => LINE.test(l))
    if (last < 0) last = lines.length - 1
    lines.splice(last + 1, 0, ...(last === lines.length - 1 && !LINE.test(lines[last]) ? ['', formatLine(entry)] : [formatLine(entry)]))
  }
  return lines.join('\n')
}

const days = (from, to) => Math.floor((Date.parse(to) - Date.parse(from)) / 86400000)

// Why a build is due, or '' when it isn't yet. Ticked lines were already tested.
export function dueReason(cases, today) {
  const open = cases.filter((c) => !c.done)
  const p1 = open.filter((c) => c.priority === 'P1')
  const old = p1.some((c) => c.date && days(c.date, today) >= P1_DAYS)
  return open.length >= MAX_CASES || old ? `${open.length} Android cases due (${p1.length} P1)` : ''
}

function gh(args, { write = false, dryRun = false } = {}) {
  if (write && dryRun) {
    console.log(`[dry-run] gh api ${args.join(' ')}`)
    return ''
  }
  return execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
}

function openBatch() {
  const items = JSON.parse(gh([`${backlogApi()}/issues?state=open&labels=${LABEL}&per_page=100&page=1`]))
  return items.filter((i) => !i.pull_request).sort((a, b) => a.number - b.number)[0] ?? null
}

function batchComments(n) {
  return JSON.parse(gh([`${backlogApi()}/issues/${n}/comments?per_page=100&page=1`]))
}

async function testCase(id) {
  const { TEST_CASES } = await import('./qa/procedure.mjs')
  const tc = TEST_CASES.find((t) => t.id === id)
  if (!tc) throw new Error(`${id} is not in scripts/qa/procedure.mjs; add the test case first`)
  return tc
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--status') args.status = true
    else if (a === '--dry-run') args.dryRun = true
    else if (['--add', '--issue', '--summary'].includes(a)) args[a.slice(2)] = argv[++i]
    else throw new Error(`unknown argument: ${a}`)
  }
  return args
}

async function add(args) {
  if (!args.add || !/^\d+$/.test(args.issue ?? '') || !args.summary?.trim()) throw new Error('--add needs <TC-ID>, --issue <N> and --summary "<one line>"')
  const today = new Date().toISOString().slice(0, 10)
  const tc = await testCase(args.add)
  const entry = { id: tc.id, priority: tc.priority, summary: args.summary.trim().replace(/\s+/g, ' '), issue: args.issue, date: today }
  const { dryRun } = args
  let batch = openBatch()
  let number
  let body
  if (!batch) {
    // A shallow clone (cloud sessions) can't count commits, so the title drops the build then.
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true'
    const build = shallow ? '' : execFileSync('git', ['rev-list', '--count', 'origin/main'], { encoding: 'utf8' }).trim()
    body = upsertCase('', entry)
    const title = build ? `Android QA batch: since build ${build}` : `Android QA batch: started ${today}`
    const labels = [LABEL, 'human', 'tooling', 'status:needs-review'].flatMap((l) => ['-f', `labels[]=${l}`])
    const out = gh(['-X', 'POST', `${backlogApi()}/issues`, '-f', `title=${title}`, '-f', `body=${body}`, ...labels], { write: true, dryRun })
    number = out ? JSON.parse(out).number : 0
    console.log(`Started "${title}"${number ? ` (#${number})` : ''} with ${tc.id}`)
  } else {
    number = batch.number
    body = upsertCase(batch.body ?? '', entry)
    gh(['-X', 'PATCH', `${backlogApi()}/issues/${number}`, '-f', `body=${body}`], { write: true, dryRun })
    console.log(`Updated batch #${number} with ${tc.id}`)
  }
  const reason = dueReason(parseCases(body), today)
  if (!reason) return
  if (number && batchComments(number).some((c) => c.body?.includes(ASKED_MARKER))) return console.log('Already asked about this batch')
  gh(['-X', 'POST', `${backlogApi()}/issues/${number || '<new>'}/comments`, '-f', `body=${ASKED_MARKER}\nAsked the owner whether to cut a build (${reason}).`], { write: true, dryRun })
  const askArgs = ['scripts/ask-dean.mjs', '--issue', String(number || '<new>'), '--question', `${reason}. Cut a build?`, '--option', "Yes, I'll build and test", '--option', 'Not yet, ask again at the next threshold']
  if (dryRun) console.log(`[dry-run] node ${askArgs.join(' ')}`)
  else execFileSync('node', askArgs, { stdio: 'inherit' })
}

function status() {
  const batch = openBatch()
  if (!batch) return console.log('No open Android QA batch.')
  const today = new Date().toISOString().slice(0, 10)
  const cases = parseCases(batch.body)
  console.log(`#${batch.number} ${batch.title} (open ${days(batch.created_at, today)} days, ${cases.filter((c) => !c.done).length} of ${cases.length} cases untested)`)
  for (const c of cases) console.log(formatLine(c))
  const reason = dueReason(cases, today)
  console.log(reason ? `Due: ${reason}.` : 'Not due yet.')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (args.status) status()
    else await add(args)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
