// File-size ratchet (#626): no .ts/.vue file under src/ is over 800 lines, and the
// files already over (scripts/file-size-baseline.json) never grow.
// Usage: node scripts/check-file-size.mjs [--update] [--self-test]
//   --update     rewrite the baseline: lower shrunk counts, drop files back under the limit
//                (never adds a file; that takes an owner OK and a hand edit)
//   --self-test  check the rule against fixtures
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIMIT = 800
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = join(root, 'scripts', 'file-size-baseline.json')

function lineCount(text) {
  if (text === '') return 0
  const n = text.split('\n').length
  return text.endsWith('\n') ? n - 1 : n
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(e.name)) out.push(p)
  }
  return out
}

// sizes: { path: lines } for every src file; baseline: { path: lines }.
export function evaluate(sizes, baseline) {
  const errors = []
  const lowered = {}
  const dropped = []
  for (const [file, n] of Object.entries(sizes)) {
    const allowed = baseline[file]
    if (allowed === undefined) {
      if (n > LIMIT) errors.push(`${file} is ${n} lines (limit ${LIMIT}); split it into a new component or composable`)
    } else if (n > allowed) {
      errors.push(`${file} grew to ${n} lines (baseline ${allowed}); put new code in a new component or composable beside it`)
    } else if (n <= LIMIT) dropped.push(file)
    else if (n < allowed) lowered[file] = n
  }
  for (const file of Object.keys(baseline)) {
    if (!(file in sizes)) dropped.push(file)
  }
  return { errors, lowered, dropped }
}

function selfTest() {
  const base = { 'src/big.vue': 1000 }
  const cases = [
    ['unchanged passes', { 'src/big.vue': 1000 }, base, 0],
    ['listed file grows by one', { 'src/big.vue': 1001 }, base, 1],
    ['new 801-line file', { 'src/big.vue': 1000, 'src/new.ts': 801 }, base, 1],
    ['new 800-line file ok', { 'src/big.vue': 1000, 'src/new.ts': 800 }, base, 0],
    ['shrunk file passes', { 'src/big.vue': 900 }, base, 0],
  ]
  let bad = 0
  for (const [name, sizes, b, want] of cases) {
    const got = evaluate(sizes, b).errors.length
    if (got !== want) { console.error(`self-test FAIL: ${name} (errors ${got}, want ${want})`); bad++ }
  }
  const r = evaluate({ 'src/big.vue': 900, 'src/small.ts': 100 }, { 'src/big.vue': 1000, 'src/small.ts': 900 })
  if (r.lowered['src/big.vue'] !== 900 || !r.dropped.includes('src/small.ts')) { console.error('self-test FAIL: lower/drop'); bad++ }
  if (bad) process.exit(1)
  console.log('check-file-size self-test passed')
}

if (process.argv.includes('--self-test')) {
  selfTest()
} else {
  const sizes = {}
  for (const f of walk(join(root, 'src'))) {
    sizes[relative(root, f).split('\\').join('/')] = lineCount(readFileSync(f, 'utf8'))
  }
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : {}
  const { errors, lowered, dropped } = evaluate(sizes, baseline)
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  if (Object.keys(lowered).length || dropped.length) {
    if (process.argv.includes('--update')) {
      const next = { ...baseline, ...lowered }
      for (const f of dropped) delete next[f]
      writeFileSync(baselinePath, JSON.stringify(next, null, 2) + '\n')
      console.log('baseline updated; commit scripts/file-size-baseline.json')
    } else {
      for (const [f, n] of Object.entries(lowered)) console.log(`${f} shrank to ${n}; run npm run check:size -- --update to lower the baseline`)
      for (const f of dropped) console.log(`${f} is under ${LIMIT} lines now; run npm run check:size -- --update to remove it from the baseline`)
    }
  }
  console.log('check:size ok')
}
