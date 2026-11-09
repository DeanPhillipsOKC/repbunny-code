// Issue #678: turns Semgrep's JSON report into the CI result. ERROR findings fail the job; WARNING
// and INFO findings are listed in the job summary only, so the scan can start strict on the serious
// rules without blocking every PR on style. Allowlisting a finding: docs/architecture/commit-policy.md
// > Security scanning.
//
//   node scripts/semgrep-summary.mjs <semgrep.json>   # exits 1 when any ERROR finding exists

import { appendFileSync, readFileSync } from 'node:fs'

const [reportPath] = process.argv.slice(2)
if (!reportPath) {
  console.error('usage: node scripts/semgrep-summary.mjs <semgrep.json>')
  process.exit(2)
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const results = report.results ?? []
const scanErrors = report.errors ?? []

const line = (r) =>
  `- **${r.extra?.severity ?? '?'}** \`${r.check_id}\` at \`${r.path}:${r.start?.line ?? '?'}\`: ${(r.extra?.message ?? '').split('\n')[0]}`

const errors = results.filter((r) => r.extra?.severity === 'ERROR')
const others = results.filter((r) => r.extra?.severity !== 'ERROR')

const summary = [
  '## Semgrep',
  '',
  `${errors.length} blocking (ERROR), ${others.length} non-blocking, ${scanErrors.length} scan errors.`,
  '',
  ...(errors.length ? ['### Blocking', '', ...errors.map(line), ''] : []),
  ...(others.length ? ['### Non-blocking', '', ...others.map(line), ''] : []),
  // A scan error usually means a file Semgrep couldn't parse, so it went unscanned. Listed so a
  // gap in coverage is visible, but not blocking.
  ...(scanErrors.length
    ? ['### Scan errors (files not fully scanned)', '', ...scanErrors.map((e) => `- ${[e.type].flat().find((t) => typeof t === 'string') ?? 'error'}: \`${e.path ?? e.spans?.[0]?.file ?? '?'}\` ${(e.message ?? '').split('\n')[0].slice(0, 160)}`), '']
    : []),
].join('\n')

console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')

process.exit(errors.length ? 1 : 0)
