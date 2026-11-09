// Backlog item 122: one-time move of docs/backlog.md's open items to GitHub
// Issues. Dry run by default (prints the plan and writes each issue body to
// logs/backlog-migration/ for review); pass --apply to create the labels and
// issues for real. Prints an old-item -> issue-number map at the end, which
// goes into the docs/backlog.md stub.
//
//   node scripts/migrate-backlog-to-issues.mjs            # dry run
//   node scripts/migrate-backlog-to-issues.mjs --apply    # create issues
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const TODAY = '2026-09-28'
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const text = readFileSync(join(root, 'docs/backlog.md'), 'utf8').replace(/\r\n/g, '\n')
const lines = text.split('\n')

// Items not carried over: 122 is this migration itself.
const SKIP_ITEMS = new Set([122])

// Discussion notes above the item list that still matter for an open item;
// matched by the note's opening words.
const CONTEXT_NOTES = { 99: 'Item 99 (2026-09-28', 112: 'Item 112 (2026-09-28' }

function paragraphStartingWith(prefix) {
  const start = lines.findIndex((l) => l.startsWith(prefix))
  if (start === -1) throw new Error(`context note not found: ${prefix}`)
  let end = start
  while (end + 1 < lines.length && lines[end + 1].trim() !== '') end++
  return lines.slice(start, end + 1).join('\n')
}

// ---- open items ------------------------------------------------------------
const sectionOf = (index) => {
  for (let i = index; i >= 0; i--) if (lines[i].startsWith('## ')) return lines[i].slice(3)
  return ''
}

const items = []
lines.forEach((line, index) => {
  const m = line.match(/^- \[ \] \*\*Item (\d+) — (.+?)\*\* ?(.*)$/)
  if (!m) return
  const number = Number(m[1])
  if (SKIP_ITEMS.has(number)) return
  let rest = m[3]
  const tag = rest.match(/\[Effort: (\d+), Value: (\d+), ROI: ([\d.]+)(?:, Status: ([^\]]+))?\]\s*$/)
  if (!tag) throw new Error(`item ${number} has no parseable tag`)
  rest = rest.slice(0, tag.index).trim()
  const [, effort, value, roi, status] = tag
  items.push({
    number,
    title: m[2].replace(/\.$/, ''),
    description: rest,
    effort: Number(effort),
    value: Number(value),
    roi,
    status: status?.trim() ?? null,
    section: sectionOf(index),
  })
})

// ---- [human] tasks -----------------------------------------------------------
const HUMAN_TITLES = [
  ['After interrupted-workout recovery', 'Device test: interrupted-workout recovery and set retry on Android and iPhone'],
  ['Interactive "fresh account" test login', 'Set up an interactive "fresh account" test login'],
  ['Backlog item 15 (per-exercise rest timer', 'Finish verifying the rest-timer push notification (iPhone, revoke CLI token)'],
  ['Hostile-read RLS test', 'Hostile-read RLS test between the two pilot accounts'],
  ['iPhone verification (secondary)', 'iPhone verification: iCloud Keychain, passkeys in the installed PWA, Add to Home Screen'],
  ['*(optional, cosmetic)* WebAuthn', 'Optional: update the WebAuthn Relying Party display name in Supabase'],
  ['Item 121: supply new rest-screen bunny', null], // merged into item 121's issue
  ['Item 122 (backlog to GitHub Issues)', null], // done: gh is installed and authenticated
  ['Custom domain vs.', 'Decide: custom domain vs. the default *.pages.dev subdomain'],
  ['*(optional, only if needed)* Resend', 'Optional: Resend account if Supabase magic-link email hits rate limits'],
  ['Drop the now-unused `category` column', 'Drop the unused exercises.category column from the live database'],
]

const humanTasks = []
let humanRest121 = ''
lines.forEach((line, index) => {
  if (!line.startsWith('- [ ] **[human]** ')) return
  const block = [line.slice('- [ ] **[human]** '.length)]
  for (let i = index + 1; i < lines.length && /^\s+\S/.test(lines[i]); i++) block.push(lines[i].replace(/^ {2}/, ''))
  const body = block.join('\n')
  const match = HUMAN_TITLES.find(([prefix]) => body.startsWith(prefix))
  if (!match) throw new Error(`no title mapping for human task: ${body.slice(0, 60)}`)
  if (match[0].startsWith('Item 121')) humanRest121 = body
  if (!match[1]) return
  humanTasks.push({ title: match[1], body })
})

// ---- labels ------------------------------------------------------------------
const FIB = [1, 2, 3, 5, 8, 13]
const LABELS = [
  ...FIB.map((n) => ({ name: `effort:${n}`, color: 'c5def5', description: 'Implementation size (Fibonacci)' })),
  ...FIB.map((n) => ({ name: `value:${n}`, color: 'bfe5bf', description: 'Worth doing (Fibonacci); ROI = value / effort' })),
  { name: 'status:blocked', color: 'e0687a', description: 'Runner skips it; reason in a comment' },
  { name: 'status:needs-review', color: 'f2c069', description: 'Runner skips it until a human decision is made' },
  { name: 'human', color: 'b79cf0', description: 'Only the user can do this (accounts, devices, artwork)' },
  { name: 'feature', color: 'f2879c', description: 'Product feature or UX change' },
  { name: 'tooling', color: 'd4c5f9', description: 'Tests, scripts, agent workflow' },
]

function itemLabels(item) {
  const labels = [`effort:${item.effort}`, `value:${item.value}`, item.section === 'Testing / tooling' ? 'tooling' : 'feature']
  if (item.number === 120) labels.push('bug')
  if (item.status?.startsWith('blocked')) labels.push('status:blocked')
  if (item.status?.startsWith('needs-review')) labels.push('status:needs-review')
  return labels
}

function itemBody(item) {
  const parts = [`_Migrated from \`docs/backlog.md\` item ${item.number} on ${TODAY}. Item numbers mentioned below are old backlog numbers; see the map in \`docs/backlog.md\`._`]
  if (CONTEXT_NOTES[item.number]) parts.push(`### Background\n\n${paragraphStartingWith(CONTEXT_NOTES[item.number])}`)
  parts.push(`### Details\n\n${item.description}`)
  if (item.number === 121 && humanRest121) parts.push(`### Human step\n\n${humanRest121}`)
  parts.push(`---\nEffort ${item.effort} · Value ${item.value} · ROI ${(item.value / item.effort).toFixed(2)}`)
  return parts.join('\n\n')
}

function blockReasonComment(item) {
  if (!item.status) return null
  const reason = item.status.replace(/^(blocked|needs-review):\s*/, '')
  return `${item.status.startsWith('blocked') ? 'Blocked' : 'Needs review'}: ${reason}`
}

// ---- plan / apply ---------------------------------------------------------------
const outDir = join(root, 'logs/backlog-migration')
mkdirSync(outDir, { recursive: true })

const plan = [
  ...items.sort((a, b) => a.number - b.number).map((item) => ({
    key: `item-${item.number}`,
    oldItem: item.number,
    title: item.title,
    labels: itemLabels(item),
    body: itemBody(item),
    comment: blockReasonComment(item),
  })),
  ...humanTasks.map((task, i) => ({
    key: `human-${i + 1}`,
    oldItem: null,
    title: task.title,
    labels: ['human'],
    body: `_Migrated from \`docs/backlog.md\`'s Human setup list on ${TODAY}._\n\n${task.body}`,
    comment: null,
  })),
]

// The repo is public: keep personal email addresses out of issue bodies.
for (const p of plan) p.body = p.body.replace(/`?[\w.+-]+@gmail\.com`?/g, 'the test account')

const gh = (args, input) =>
  execFileSync('gh', args, { cwd: root, encoding: 'utf8', input, env: { ...process.env, PATH: `${process.env.PATH};C:\\Program Files\\GitHub CLI` } }).trim()

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${plan.length} issues, ${LABELS.length} labels\n`)
for (const p of plan) {
  writeFileSync(join(outDir, `${p.key}.md`), `# ${p.title}\n\nLabels: ${p.labels.join(', ')}\n${p.comment ? `Comment: ${p.comment}\n` : ''}\n---\n\n${p.body}\n`)
  console.log(`${p.key.padEnd(10)} [${p.labels.join(', ')}] ${p.title}${p.comment ? `\n           comment: ${p.comment}` : ''}`)
}

if (!APPLY) {
  console.log(`\nBodies written to ${outDir}. Re-run with --apply to create them.`)
  process.exit(0)
}

const existing = new Set(JSON.parse(gh(['label', 'list', '--limit', '200', '--json', 'name'])).map((l) => l.name))
for (const label of LABELS) {
  if (existing.has(label.name)) continue
  gh(['label', 'create', label.name, '--color', label.color, '--description', label.description])
}

const map = []
for (const p of plan) {
  const url = gh(['issue', 'create', '--title', p.title, '--body-file', '-', ...p.labels.flatMap((l) => ['--label', l])], p.body)
  const number = Number(url.split('/').pop())
  if (p.comment) gh(['issue', 'comment', String(number), '--body', p.comment])
  map.push({ ...p, issue: number })
  console.log(`created #${number} ${p.title}`)
}
writeFileSync(join(outDir, 'map.json'), JSON.stringify(map.map(({ oldItem, issue, title, key }) => ({ key, oldItem, issue, title })), null, 2))
console.log(`\nMap written to ${join(outDir, 'map.json')}`)
