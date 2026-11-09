// Dead-reference check for the hand-maintained docs (#112). Scans the current
// docs for references that can be verified mechanically and exits nonzero
// listing each one that no longer resolves:
//
//   - file paths in backticks (`src/lib/releaseNotes.ts`, `e2e/fixtures/auth.ts:12`)
//   - bare file names in backticks (`PremiumSheet.vue`, `progress-strip.spec.ts`),
//     which must match some tracked file's basename
//   - `npm run <script>` commands, which must exist in package.json
//
// Prose, table/column names, and UI copy aren't checked; /help-review covers
// guides. docs/backlog-archive.md is frozen history and is skipped. A line that
// cites a removed file on purpose can opt out with `<!-- docs-refs: ignore -->`.
//
// Usage: node scripts/check-docs-refs.mjs   (or npm run check:docs)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

const DOCS = [
  'CLAUDE.md',
  'README.md',
  ...readdirSync('docs')
    .filter((f) => f.endsWith('.md') && f !== 'backlog-archive.md')
    .map((f) => `docs/${f}`),
  ...(existsSync('docs/architecture') ? readdirSync('docs/architecture') : [])
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/architecture/${f}`),
  ...readdirSync('.claude/skills', { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`.claude/skills/${d.name}/SKILL.md`))
    .map((d) => `.claude/skills/${d.name}/SKILL.md`),
].filter((f) => existsSync(f))

// Top-level folders a repo-relative path can start with.
const ROOTS = new Set(
  readdirSync('.', { withFileTypes: true })
    .filter((d) => d.isDirectory() && !['node_modules', '.git'].includes(d.name))
    .map((d) => d.name),
)
// Local-only files the docs describe but git never tracks.
const UNTRACKED_OK = new Set(['.env', '.env.local', 'dist', 'logs', 'test-results'])
const EXT = /\.(ts|mts|js|mjs|cjs|vue|json|md|html|css|sql|ps1|sh|yml|yaml|toml|xml|gradle|kts|png|svg|webp|txt|pdf)$/

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
const trackedSet = new Set(tracked)
const trackedDirs = new Set()
for (const f of tracked) {
  const parts = f.split('/')
  for (let i = 1; i < parts.length; i++) trackedDirs.add(parts.slice(0, i).join('/'))
}
const basenames = new Set(tracked.map((f) => basename(f)))
const npmScripts = new Set(Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {}))

function pathExists(p) {
  const clean = p.replace(/\/$/, '')
  if (trackedSet.has(clean) || trackedDirs.has(clean)) return true
  // Generated or gitignored but present on disk (e.g. android/ build output).
  return existsSync(clean)
}

// Placeholders and globs aren't concrete references.
const isPattern = (s) => /[<>*{}$?]|\.\.\.|…|YYYY/.test(s)

function checkToken(raw) {
  // Drop :line / :line-line suffixes and #anchors.
  const tok = raw.trim().replace(/[#].*$/, '').replace(/:\d+(-\d+)?$/, '')
  if (!tok || isPattern(tok) || /\s/.test(tok) || tok.includes('://')) return null
  const first = tok.split('/')[0]
  if (UNTRACKED_OK.has(first) || UNTRACKED_OK.has(tok)) return null

  if (tok.includes('/')) {
    // Only repo-relative paths: they start at a real top-level folder or a dotfolder
    // we track (.claude/), and either have a file extension or end in '/'.
    const root = first === '.claude' ? '.claude' : ROOTS.has(first) ? first : null
    if (!root || first === '') return null
    if (!EXT.test(tok) && !tok.endsWith('/')) return null
    return pathExists(tok) ? null : `missing path: ${tok}`
  }
  // Bare file name: must match a tracked file somewhere.
  if (EXT.test(tok) && /^[\w.-]+$/.test(tok) && !tok.startsWith('.')) {
    if (basenames.has(tok) || existsSync(tok)) return null
    return `missing file: ${tok}`
  }
  return null
}

const problems = []
for (const file of DOCS) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (line.includes('docs-refs: ignore')) return
    const where = `${file}:${i + 1}`
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const msg = checkToken(m[1])
      if (msg) problems.push(`${where}  ${msg}`)
    }
    for (const m of line.matchAll(/npm run ([\w:-]+)/g)) {
      if (!npmScripts.has(m[1])) problems.push(`${where}  missing npm script: ${m[1]}`)
    }
  })
}

const unique = [...new Set(problems)]
if (unique.length) {
  console.error(`${unique.length} dead reference(s) in ${DOCS.length} docs:`)
  for (const p of unique) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`No dead references in ${DOCS.length} docs.`)
