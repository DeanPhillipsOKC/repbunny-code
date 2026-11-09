// Issue #681: the `main` ruleset lives in .github/rulesets/main.json so it's reviewed like code.
// This script makes GitHub match that file, or checks that it does. Needs a repo admin token (the
// owner's `gh` on the laptop); cloud sessions' tokens can't change rulesets.
//
//   node scripts/apply-ruleset.mjs --check   # exit 0 when the live ruleset and repo settings match, 1 when they drift
//   node scripts/apply-ruleset.mjs --apply   # create or update the ruleset by name, then set the repo's merge settings
//
// The repo settings it sets go with the ruleset: squash merges only (linear history), auto-merge on
// (a tier 3 PR merges itself once the owner approves), and branches deleted after merge.
// Break-glass (a temporary bypass) is a manual step on purpose: docs/architecture/commit-policy.md
// > Break-glass.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CODE_REPO } from './code-repo.mjs'

// The code repo, from this checkout's origin (#946); CODE_REPO=<owner>/<repo> overrides it.
const REPO = CODE_REPO
const FILE = new URL('../.github/rulesets/main.json', import.meta.url)
const SETTINGS = { allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, allow_auto_merge: true, delete_branch_on_merge: true }

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
const ghJson = (args) => JSON.parse(gh(args))

const wanted = JSON.parse(readFileSync(FILE, 'utf8'))

// What the file says, as GitHub would return it. GitHub adds defaults the file doesn't set
// (`required_reviewers`, `require_extra_approval_for_unattributed_changes`, ...) and orders keys its
// own way, so the check keeps only what the file sets, sorts keys, and sorts rules by type.
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]))
  return value
}

function pick(actual, shape) {
  if (Array.isArray(shape)) return Array.isArray(actual) ? actual.map((a, i) => pick(a, shape[i] ?? shape[0])) : actual
  if (shape && typeof shape === 'object' && actual && typeof actual === 'object') {
    return Object.fromEntries(Object.keys(shape).map((k) => [k, pick(actual[k], shape[k])]))
  }
  return actual
}

const byType = (rules) => [...rules].sort((a, b) => a.type.localeCompare(b.type))

export function matches(current, file = wanted) {
  const keys = ['name', 'target', 'enforcement', 'conditions', 'bypass_actors']
  const want = { ...Object.fromEntries(keys.map((k) => [k, file[k]])), rules: byType(file.rules) }
  const have = { ...Object.fromEntries(keys.map((k) => [k, current[k]])), rules: byType(current.rules ?? []) }
  if (have.rules.length !== want.rules.length) return false
  have.rules = have.rules.map((r, i) => pick(r, want.rules[i]))
  return JSON.stringify(sorted(have)) === JSON.stringify(sorted(want))
}

function live() {
  const summary = ghJson(['api', `repos/${REPO}/rulesets`]).find((r) => r.name === wanted.name)
  return summary ? ghJson(['api', `repos/${REPO}/rulesets/${summary.id}`]) : null
}

function settingsDrift() {
  const repo = ghJson(['api', `repos/${REPO}`])
  return Object.entries(SETTINGS).filter(([k, v]) => repo[k] !== v).map(([k, v]) => `${k}: ${repo[k]} (want ${v})`)
}

function check() {
  const current = live()
  const problems = []
  if (!current) problems.push(`no ruleset named "${wanted.name}" on ${REPO}`)
  else if (!matches(current)) problems.push(`ruleset ${current.id} differs from .github/rulesets/main.json (run --apply, or update the file to match)`)
  problems.push(...settingsDrift())
  if (problems.length) {
    console.log(`drift:\n- ${problems.join('\n- ')}`)
    process.exit(1)
  }
  console.log(`ruleset ${current.id} and repo settings match .github/rulesets/main.json`)
}

function apply() {
  const dir = mkdtempSync(join(tmpdir(), 'ruleset-'))
  const body = join(dir, 'ruleset.json')
  writeFileSync(body, JSON.stringify(wanted))
  const current = live()
  const result = current
    ? ghJson(['api', '-X', 'PUT', `repos/${REPO}/rulesets/${current.id}`, '--input', body])
    : ghJson(['api', '-X', 'POST', `repos/${REPO}/rulesets`, '--input', body])
  console.log(`${current ? 'updated' : 'created'} ruleset ${result.id} (${result.enforcement})`)
  const settings = join(dir, 'settings.json')
  writeFileSync(settings, JSON.stringify(SETTINGS))
  gh(['api', '-X', 'PATCH', `repos/${REPO}`, '--input', settings])
  console.log(`repo settings: ${Object.entries(SETTINGS).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  check()
}

if (process.argv.includes('--apply')) apply()
else if (process.argv.includes('--check')) check()
else {
  console.error('usage: node scripts/apply-ruleset.mjs --check | --apply')
  process.exit(2)
}
