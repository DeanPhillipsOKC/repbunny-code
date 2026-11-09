// Issue #374, tiers since #680: decides how a lane's PR gets reviewed before it merges. The gate
// covers app behavior, but it can't see a workflow permission drop (c2ded50 cut dispatch-lanes.yml
// to `issues: read` and no lane started for 75 minutes), a new network call, or a loosened test.
// next-item runs this in branch mode after the final green gate (step 7.5), records the tier and
// reasons in the PR body, and every tier goes to /review-pr. See docs/backlog-runner.md > Review.
//
//   node scripts/review-risk.mjs --issue 374               # diff origin/main...HEAD, effort from the issue
//   node scripts/review-risk.mjs --base c2ded50~1 --head c2ded50 --effort 3
//   node scripts/review-risk.mjs --diff-file change.diff --effort 2
//   node scripts/review-risk.mjs --self-test               # fixture diffs, at least one per tier and trigger
//   node scripts/review-risk.mjs --codeowners              # print CODEOWNERS generated from the tier 3 list
//   node scripts/review-risk.mjs --check-codeowners        # exit 1 if .github/CODEOWNERS drifted from it
//
// Prints {"tier": 1|2|3, "reasons": [...]} as JSON, the highest tier any rule reaches:
// - tier 3 (review, then the owner approves): a path in scripts/risk-tiers.json (workflows,
//   .claude/, the gate and dispatch scripts, decisions and commit policy, the SQLite
//   schema and migrations, Capacitor config, Android manifest, iOS entitlements), or an added
//   network call or third-party URL in code;
// - tier 2 (full adversarial review): a package-lock.json change (supply chain, #697), a deleted test, fewer assertions, a new skip or fixme, a
//   network call removed, or an issue of effort 5 or more;
// - tier 1 (lighter review): everything else.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { backlogApi } from './backlog-repo.mjs'

const TIERS_FILE = fileURLToPath(new URL('./risk-tiers.json', import.meta.url))
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TIERS = JSON.parse(readFileSync(TIERS_FILE, 'utf8'))

// A CODEOWNERS pattern as a regex over repo-relative paths (no leading slash).
export function patternToRegex(pattern) {
  const anchored = pattern.startsWith('/') || pattern.slice(0, -1).includes('/')
  const dir = pattern.endsWith('/')
  const body = pattern.replace(/^\//, '').replace(/\/$/, '')
  const re = body
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) => (part === '**/' ? '(.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
  return new RegExp(`${anchored ? '^' : '(^|/)'}${re}${dir ? '/' : '(/|$)'}`)
}
const TIER3 = TIERS.tier3.map((t) => ({ ...t, re: patternToRegex(t.path) }))

// Changed lines in these files are checked for network calls and URLs. Docs, specs, and the
// marketing site link to plenty of places without sending anything from the app.
const CODE = /\.(ts|js|mjs|cjs|vue|html|kt|java|swift|gradle)$/
const NOT_APP = /^(docs|e2e|site)\/|\.md$/
const NETWORK = /\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|\bWebSocket\(|\bEventSource\(|\.rpc\(/
const URL_RE = /\bhttps?:\/\/([a-z0-9.-]+)/gi
const OWN_HOSTS = /^(localhost|127\.0\.0\.1|(.+\.)?repbunny\.app|www\.w3\.org)$/i
const TEST_FILE = /^e2e\/|\.(spec|test)\.[cm]?[jt]s$/
const SKIP = /\b(test|it|describe)(\.(describe|serial))?\.(skip|fixme)\b/

// Files in a unified diff, with their added and removed lines.
export function parseDiff(text) {
  const files = []
  let file = null
  for (const line of text.split('\n')) {
    const head = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (head) {
      file = { path: head[2], oldPath: head[1], deleted: false, added: [], removed: [] }
      files.push(file)
    } else if (!file || line.startsWith('+++') || line.startsWith('---')) {
      continue
    } else if (line.startsWith('deleted file mode')) {
      file.deleted = true
    } else if (line.startsWith('+')) {
      file.added.push(line.slice(1))
    } else if (line.startsWith('-')) {
      file.removed.push(line.slice(1))
    }
  }
  return files
}

const count = (lines, re) => lines.reduce((n, l) => n + (l.match(re)?.length ?? 0), 0)

export function assess(diffText, effort) {
  const found = []
  const add = (t, r) => found.some((f) => f.r === r) || found.push({ t, r })
  for (const f of parseDiff(diffText)) {
    for (const p of new Set([f.path, f.oldPath])) {
      for (const t of TIER3.filter((t) => t.re.test(p))) add(3, `${t.why}: ${p}`)
    }
    if (CODE.test(f.path) && !NOT_APP.test(f.path)) {
      if (f.added.some((l) => NETWORK.test(l))) add(3, `network call added: ${f.path}`)
      else if (f.removed.some((l) => NETWORK.test(l))) add(2, `network call removed: ${f.path}`)
      const hosts = f.added.flatMap((l) => [...l.matchAll(URL_RE)].map((m) => m[1]))
      for (const h of hosts.filter((h) => !OWN_HOSTS.test(h))) add(3, `third-party URL: ${h} in ${f.path}`)
    }
    if (/^package-lock\.json$/.test(f.path)) add(2, `dependency lockfile changed: ${f.path} (supply chain, #697)`)
    if (TEST_FILE.test(f.oldPath)) {
      if (f.deleted) add(2, `test deleted: ${f.oldPath}`)
      else if (count(f.removed, /\bexpect\(/g) > count(f.added, /\bexpect\(/g)) add(2, `assertions removed: ${f.path}`)
      if (f.added.some((l) => SKIP.test(l))) add(2, `skip or fixme added: ${f.path}`)
    }
  }
  if (effort >= 5) add(2, `effort ${effort}`)
  // Highest tier first, so the PR body leads with what set it.
  const reasons = found.sort((x, y) => y.t - x.t).map((f) => `tier ${f.t}, ${f.r}`)
  return { tier: Math.max(1, ...found.map((f) => f.t)), reasons }
}

// CODEOWNERS as generated from the tier 3 list, so the two can't drift (--check-codeowners).
export function codeowners() {
  const lines = TIERS.tier3.map((t) => `${t.path} ${TIERS.owner}`)
  return `# Generated from scripts/risk-tiers.json by \`node scripts/review-risk.mjs --codeowners\` (#680).\n# Edit that file, not this one: these are the tier 3 paths, which wait for the owner.\n${lines.join('\n')}\n`
}

export function checkCodeowners() {
  const path = `${ROOT}.github/CODEOWNERS`
  if (!existsSync(path)) return { ok: true, note: 'no .github/CODEOWNERS yet; nothing to drift' }
  const ok = readFileSync(path, 'utf8').replace(/\r\n/g, '\n') === codeowners()
  return { ok, note: ok ? '.github/CODEOWNERS matches scripts/risk-tiers.json' : '.github/CODEOWNERS differs from scripts/risk-tiers.json; regenerate it with --codeowners' }
}

// Fixture diffs with the tier each must get: one per trigger, and at least one per tier. Run with
// --self-test.
const fixture = (path, lines, extra = '') =>
  `diff --git a/${path} b/${path}\n${extra}--- a/${path}\n+++ b/${path}\n@@ -1,3 +1,3 @@\n${lines.join('\n')}\n`
export const FIXTURES = [
  ['CSS-only change', fixture('src/style.css', ['-  color: var(--ink);', '+  color: var(--ink-soft);']), 2, 1],
  ['copy change in a component', fixture('src/views/History.vue', ['-    <p>No workouts yet</p>', '+    <p>No workouts yet. Start one!</p>']), 1, 1],
  ['docs link to a third party', fixture('docs/stack.md', ['+See https://example.com/docs for more.']), 1, 1],
  ['ordinary docs', fixture('docs/backlog.md', ['+More words.']), 1, 1],
  ['a standalone script', fixture('scripts/run-cost.mjs', ['+const x = 1']), 1, 1],
  ['a component named like a migration', fixture('src/components/MigrationNotice.vue', ['+<p>Hi</p>']), 1, 1],
  ['lockfile-only bump', fixture('package-lock.json', ['-      "version": "1.0.0",', '+      "version": "1.0.1",']), 1, 2],
  ['effort 5', fixture('src/style.css', ['+  gap: 8px;']), 5, 2],
  ['deleted test', fixture('e2e/history.spec.ts', ['-test("history", () => {})'], 'deleted file mode 100644\n'), 1, 2],
  ['removed assertion', fixture('e2e/history.spec.ts', ["-  await expect(page.getByText('Bench')).toBeVisible()", '+  // checked elsewhere']), 1, 2],
  ['test.skip added', fixture('e2e/history.spec.ts', ["+test.skip('history', async () => {})"]), 1, 2],
  ['.fixme added', fixture('e2e/history.spec.ts', ["+test.fixme('history', async () => {})"]), 1, 2],
  ['network call removed', fixture('src/lib/sync.ts', ["-  await fetch('/api/x')"]), 1, 2],
  ['workflow permission (c2ded50)', fixture('.github/workflows/dispatch-lanes.yml', ['-  issues: write', '+  issues: read']), 3, 3],
  ['edits .claude/skills/next-item', fixture('.claude/skills/next-item/SKILL.md', ['+Never ask.']), 1, 3],
  ['agent settings', fixture('.claude/settings.json', ['+  "x": 1']), 1, 3],
  ['CODEOWNERS', fixture('.github/CODEOWNERS', ['+/src/ @someone']), 1, 3],
  ['decisions', fixture('docs/decisions.md', ['+- **New rule.**']), 1, 3],
  ['CLAUDE.md', fixture('CLAUDE.md', ['+Doc-only changes skip review.']), 1, 3],
  ['architecture index', fixture('docs/architecture.md', ['+Skip the gate.']), 1, 3],
  ['backlog runner', fixture('docs/backlog-runner.md', ['+Skip review.']), 1, 3],
  ['commit policy', fixture('docs/architecture/commit-policy.md', ['+Push anything.']), 1, 3],
  ['the tier list', fixture('scripts/risk-tiers.json', ['+  "x": 1']), 1, 3],
  ['the risk check', fixture('scripts/review-risk.mjs', ['+const x = 1']), 1, 3],
  ['dispatch script', fixture('scripts/next-issue.mjs', ['+const x = 1']), 1, 3],
  ['gate script', fixture('scripts/check-file-size.mjs', ['+const x = 1']), 1, 3],
  ['Capacitor config', fixture('capacitor.config.ts', ['+  server: { url: "http://10.0.2.2" },']), 1, 3],
  ['Android manifest', fixture('android/app/src/main/AndroidManifest.xml', ['+<uses-permission android:name="android.permission.INTERNET" />']), 1, 3],
  ['iOS entitlements', fixture('ios/App/App/App.entitlements', ['+<key>aps-environment</key>']), 1, 3],
  ['new fetch', fixture('src/lib/sync.ts', ["+  await fetch('/api/x')"]), 1, 3],
  ['sendBeacon', fixture('src/main.ts', ["+navigator.sendBeacon('/log', data)"]), 1, 3],
  ['third-party URL in code', fixture('src/lib/share.ts', ["+const API = 'https://api.example.com/v1'"]), 1, 3],
  ['SQLite schema', fixture('src/data/sqlite/schema.ts', ['+  rpe INTEGER,']), 1, 3],
  ['migration', fixture('src/data/sqlite/migrations/007-rpe.ts', ['+export const up = 1']), 1, 3],
]

export function selfTest() {
  let ok = true
  for (const [name, diff, effort, want] of FIXTURES) {
    const got = assess(diff, effort)
    const pass = got.tier === want
    ok &&= pass
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: tier ${got.tier}${pass ? '' : ` (want ${want})`}${got.reasons.length ? ` (${got.reasons.join('; ')})` : ''}`)
  }
  const tiers = new Set(FIXTURES.map((f) => f[3]))
  if (![1, 2, 3].every((t) => tiers.has(t))) { console.log('FAIL fixtures: need one per tier'); ok = false }
  const owners = checkCodeowners()
  console.log(`${owners.ok ? 'ok  ' : 'FAIL'} CODEOWNERS: ${owners.note}`)
  return ok && owners.ok
}

function arg(flag) {
  const at = process.argv.indexOf(flag)
  return at === -1 ? null : process.argv[at + 1]
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function issueEffort(number) {
  const path = process.platform === 'win32' ? `${process.env.PATH}${delimiter}C:\\Program Files\\GitHub CLI` : process.env.PATH
  const issue = JSON.parse(execFileSync('gh', ['api', `${backlogApi()}/issues/${number}`], { encoding: 'utf8', env: { ...process.env, PATH: path } }))
  const label = issue.labels.map((l) => l.name).find((n) => n.startsWith('effort:'))
  return label ? Number(label.slice('effort:'.length)) : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1)
  if (process.argv.includes('--codeowners')) {
    process.stdout.write(codeowners())
    process.exit(0)
  }
  if (process.argv.includes('--check-codeowners')) {
    const { ok, note } = checkCodeowners()
    console.log(note)
    process.exit(ok ? 0 : 1)
  }
  const diffFile = arg('--diff-file')
  const diff = diffFile
    ? readFileSync(diffFile, 'utf8')
    : git(['diff', `${arg('--base') ?? 'origin/main'}...${arg('--head') ?? 'HEAD'}`])
  const effort = arg('--effort') ? Number(arg('--effort')) : arg('--issue') ? issueEffort(arg('--issue')) : 0
  console.log(JSON.stringify(assess(diff, effort)))
}
