import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { estimateRunMinutes, LIST_CAP, minutesGuard, minutesThisMonth, monthlyMinutesFromEnv, overBudgetText, runsCreatedBetween } from '../scripts/run-budget.mjs'

// Issue #904: the Actions minutes guard lowers the dispatcher's daily cap as the month's minutes run
// short. No page needed (same reasoning as ask-dean-unit.spec.ts).

const run = (start: string, end: string, conclusion = 'success') => ({ conclusion, run_started_at: start, updated_at: end })

test('a run counts its wall time rounded up to a whole minute, and a skipped run counts nothing', () => {
  expect(
    estimateRunMinutes([
      run('2026-11-02T10:00:00Z', '2026-11-02T10:00:20Z'),
      run('2026-11-02T10:00:00Z', '2026-11-02T10:03:01Z'),
      run('2026-11-02T10:00:00Z', '2026-11-02T10:00:01Z', 'skipped'),
      run('2026-11-02T10:00:00Z', '2026-11-02T10:02:00Z', 'failure'),
      { conclusion: null, run_started_at: null, updated_at: '2026-11-02T10:00:00Z' },
    ]),
  ).toBe(1 + 4 + 2)
})

// A stubbed run list that behaves like GitHub's: `created=<from>..<to>` filters, pages of 100,
// `total_count` is the true count, but no query returns more than 1,000 runs. Each run is one
// minute long and created at the given times.
function stubRuns(created: string[]) {
  const calls: { range: string; page: number; jq: string }[] = []
  const gh = (args: string[]) => {
    const url = new URL(`https://x/${args[1]}`)
    const [from, to] = url.searchParams.get('created')!.split('..').map((t) => Date.parse(t))
    const page = Number(url.searchParams.get('page'))
    calls.push({ range: url.searchParams.get('created')!, page, jq: args[3] })
    const all = created.filter((c) => Date.parse(c) >= from && Date.parse(c) <= to)
    const visible = all.slice(0, LIST_CAP)
    const runs = visible.slice((page - 1) * 100, page * 100).map((c) => run(c, new Date(Date.parse(c) + 60000).toISOString()))
    return JSON.stringify({ total: all.length, runs })
  }
  return { gh, calls }
}

// `n` runs spread evenly from `from` over `hours`.
const spread = (from: string, n: number, hours: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(from) + Math.floor((i * hours * 3600000) / n)).toISOString())

test('a range over the 1,000-run list cap is split until every part fits, and every run counts', () => {
  const created = spread('2026-10-01T00:00:00Z', 2500, 24 * 12)
  const { gh, calls } = stubRuns(created)
  const runs = runsCreatedBetween(Date.parse('2026-10-01T00:00:00Z'), Date.parse('2026-10-12T23:59:59Z'), { gh })
  expect(runs).toHaveLength(2500)
  expect(calls.some((c) => c.page > LIST_CAP / 100)).toBe(false)
  // Only the three fields the estimate reads come back: a raw run object is about 14 KB.
  expect(calls[0].jq).toContain('{conclusion, run_started_at, updated_at}')
})

test('the month is counted from 00:00 UTC on the 1st, and a busy month is not cut off at 1,000 runs', () => {
  const created = [...spread('2026-09-30T12:00:00Z', 50, 11), ...spread('2026-10-01T00:00:00Z', 2400, 24 * 20)]
  const { gh } = stubRuns(created)
  expect(minutesThisMonth({ gh, now: new Date('2026-10-21T00:00:00Z') })).toBe(2400)
})

test('with a ledger, finished days are read once and kept; yesterday and today are read fresh', () => {
  const created = spread('2026-10-01T00:00:00Z', 1500, 24 * 15)
  const ledger = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'minutes-ledger.json')
  const first = stubRuns(created)
  const now = new Date('2026-10-16T00:00:00Z')
  expect(minutesThisMonth({ gh: first.gh, now, ledger })).toBe(1500)
  expect(JSON.parse(readFileSync(ledger, 'utf8'))).toEqual({ month: '2026-10', through: '2026-10-14', minutes: 1400 })

  const second = stubRuns(created)
  expect(minutesThisMonth({ gh: second.gh, now, ledger })).toBe(1500)
  expect(second.calls.every((c) => c.range.startsWith('2026-10-15T00:00:00Z..'))).toBe(true)
})

test("a ledger from last month or one that can't be read is ignored", () => {
  const created = spread('2026-11-01T00:00:00Z', 30, 24)
  const ledger = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'minutes-ledger.json')
  writeFileSync(ledger, JSON.stringify({ month: '2026-10', through: '2026-10-31', minutes: 2400 }))
  expect(minutesThisMonth({ gh: stubRuns(created).gh, now: new Date('2026-11-04T12:00:00Z'), ledger })).toBe(30)
  writeFileSync(ledger, 'not json')
  expect(minutesThisMonth({ gh: stubRuns(created).gh, now: new Date('2026-11-04T12:00:00Z'), ledger })).toBe(30)
})

test('within an even pace keeps the full cap', () => {
  // November has 30 days: by the 15th an even pace allows 1,500 of 3,000.
  const g = minutesGuard({ used: 1500, monthly: 3000, base: 10, now: new Date('2026-11-15T12:00:00Z') })
  expect(g).toMatchObject({ level: 'full', cap: 10, pace: 1500 })
})

test('ahead of the pace halves the cap, rounded down', () => {
  const g = minutesGuard({ used: 1501, monthly: 3000, base: 9, now: new Date('2026-11-15T12:00:00Z') })
  expect(g).toMatchObject({ level: 'half', cap: 4 })
})

test('90% of the allowance stops lane runs, even late in the month', () => {
  const g = minutesGuard({ used: 2700, monthly: 3000, base: 10, now: new Date('2026-11-30T23:00:00Z') })
  expect(g).toMatchObject({ level: 'stop', cap: 0 })
  expect(minutesGuard({ used: 2699, monthly: 3000, base: 10, now: new Date('2026-11-30T23:00:00Z') }).level).toBe('full')
})

test('the allowance comes from ACTIONS_MINUTES_PER_MONTH, else 3,000', () => {
  expect(monthlyMinutesFromEnv('2000')).toBe(2000)
  expect(monthlyMinutesFromEnv('')).toBe(3000)
  expect(monthlyMinutesFromEnv('lots')).toBe(3000)
  expect(monthlyMinutesFromEnv('0')).toBe(3000)
})

test('the automation-log note says when the guard set the cap', () => {
  const guarded = overBudgetText({ used: 5, budget: 5, base: 10, minutes: { level: 'half', reason: '1,600 minutes used, ahead of the 1,500 an even pace allows by today' } })
  expect(guarded).toContain('The cap is 5 today, not 10, because of the Actions minutes guard: 1,600 minutes used')
  const plain = overBudgetText({ used: 10, budget: 10, base: 10, minutes: { level: 'full', reason: '' } })
  expect(plain).toContain('set the repo variable `LANE_RUNS_PER_DAY`')
  expect(plain).not.toContain('minutes guard')
})
