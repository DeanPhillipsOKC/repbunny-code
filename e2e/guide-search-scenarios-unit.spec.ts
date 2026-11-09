import { test, expect } from '@playwright/test'
import { buildGuideIndex } from '../scripts/lib/guide-index.mjs'
import { createGuideSearch } from '../src/lib/guideSearch'
import { SCENARIOS, type Level } from './fixtures/guide-search-scenarios'

// Issue #569: the guide search, judged the way lifters actually ask. Every
// question a guide answers must find it in the top 3; the scenarios and how
// to print the full report are in e2e/fixtures/guide-search-scenarios.ts.

const guides = buildGuideIndex('site')
const search = createGuideSearch(guides)
const slugs = new Set(guides.map((g) => g.slug))
const top3 = (q: string) => search.search(q).slice(0, 3).map((h) => h.guide.slug)

test('every scenario names real guides, and each level has at least 15 covered questions', () => {
  for (const s of SCENARIOS) if ('want' in s) for (const w of s.want) expect(slugs.has(w), `${s.query}: ${w}`).toBe(true)
  for (const level of ['beginner', 'intermediate', 'advanced'] as Level[]) {
    expect(SCENARIOS.filter((s) => s.level === level && 'want' in s).length, level).toBeGreaterThanOrEqual(15)
  }
})

for (const s of SCENARIOS) {
  if (!('want' in s)) continue
  test(`${s.level}: "${s.query}" finds ${s.want.join(' or ')} in the top 3`, () => {
    const got = top3(s.query)
    expect(got.some((g) => s.want.includes(g)), `top 3: ${got.join(', ') || 'nothing'}`).toBe(true)
  })
}

// Only with GUIDE_SEARCH_REPORT=1: prints the review instead of checking it.
if (process.env.GUIDE_SEARCH_REPORT) test('report: hit rate per level', () => {
  const lines: string[] = []
  for (const level of ['beginner', 'intermediate', 'advanced'] as Level[]) {
    const tally = { first: 0, top3: 0, wrong: 0, nothing: 0 }
    const scored = SCENARIOS.filter((s) => s.level === level)
    for (const s of scored) {
      const got = top3(s.query)
      if (!('want' in s)) {
        lines.push(`  ${level} GAP ${s.gap} "${s.query}" -> ${got.join(', ') || 'nothing'}`)
        continue
      }
      const kind = s.want.includes(got[0]) ? 'first' : got.some((g) => s.want.includes(g)) ? 'top3' : got.length ? 'wrong' : 'nothing'
      tally[kind]++
      if (kind !== 'first') lines.push(`  ${level} ${kind.toUpperCase()} "${s.query}" -> ${got.join(', ') || 'nothing'}`)
    }
    const n = tally.first + tally.top3 + tally.wrong + tally.nothing
    lines.push(`${level}: ${tally.first}/${n} first, ${tally.first + tally.top3}/${n} top 3, ${tally.wrong} wrong, ${tally.nothing} nothing`)
  }
  console.log(lines.join('\n'))
})
