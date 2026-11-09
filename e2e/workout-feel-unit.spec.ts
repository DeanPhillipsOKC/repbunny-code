import { test, expect } from '@playwright/test'
import type { ProgressSetRow } from '../src/lib/progressHub'
import type { LoadType } from '../src/lib/types'
import {
  buildFeelInsights,
  feelOf,
  feelSummary,
  MIN_GROUP_WORKOUTS,
  MIN_TAGGED_WORKOUTS,
  workoutStats,
  type FeelWorkoutRow,
} from '../src/lib/workoutFeel'

// Issue #149's "What helps you lift" math, same "no separate unit-test
// runner" reasoning as milestones-unit.spec.ts: these never touch `page`.

const weightOnly = (): LoadType => 'weight'
const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 1)

interface Seed {
  tags: Partial<Record<'sleep' | 'energy' | 'stress', string>>
  // One set per entry: [reps, weight] on 'bench'.
  sets: [number, number][]
}

function build(seeds: Seed[]): { workouts: FeelWorkoutRow[]; rows: ProgressSetRow[] } {
  const workouts: FeelWorkoutRow[] = []
  const rows: ProgressSetRow[] = []
  seeds.forEach((seed, i) => {
    const id = `w${i}`
    const performed_at = new Date(T0 + i * DAY).toISOString()
    workouts.push({ id, performed_at, sleep: null, energy: null, stress: null, ...seed.tags })
    seed.sets.forEach(([reps, weight], n) =>
      rows.push({
        id: `${id}-${n}`,
        exercise_id: 'bench',
        workout_id: id,
        set_index: n,
        performed_at,
        reps,
        weight,
        weight_unit: 'lb',
        rpe: null,
        level: null,
        duration_seconds: null,
        distance: null,
        distance_unit: null,
        incline: null,
        calories: null,
        template_id: null,
        template_name: null,
      } as ProgressSetRow),
    )
  })
  return { workouts, rows }
}

test('workoutStats counts sets, records, and the est. 1RM change against the last session', () => {
  const { rows } = build([
    { tags: {}, sets: [[5, 100], [5, 100]] },
    { tags: {}, sets: [[5, 110]] },
    { tags: {}, sets: [[5, 99]] },
  ])
  const stats = workoutStats(rows, weightOnly)
  expect(stats.get('w0')).toEqual({ records: 0, sets: 2, e1rmChange: null })
  expect(stats.get('w1')!.records).toBe(1)
  expect(stats.get('w1')!.e1rmChange).toBeCloseTo(10)
  expect(stats.get('w2')!.records).toBe(0)
  expect(stats.get('w2')!.e1rmChange).toBeCloseTo(-10)
})

test('no findings below the minimum number of tagged workouts', () => {
  // A huge sleep difference, but only 9 tagged workouts.
  const seeds: Seed[] = Array.from({ length: MIN_TAGGED_WORKOUTS - 1 }, (_, i) => ({
    tags: { sleep: i % 2 === 0 ? 'over_8' : 'under_6' },
    sets: [[5, i % 2 === 0 ? 100 + i * 10 : 50]],
  }))
  const { workouts, rows } = build(seeds)
  expect(buildFeelInsights(workouts, rows, weightOnly)).toEqual({ tagged: MIN_TAGGED_WORKOUTS - 1, findings: [] })

  // Untagged workouts don't count toward the minimum.
  const more = build([...seeds, { tags: {}, sets: [[5, 50]] }, { tags: {}, sets: [[5, 50]] }])
  expect(buildFeelInsights(more.workouts, more.rows, weightOnly).findings).toEqual([])
})

test('records: the gap is reported with both sample sizes', () => {
  const seeds: Seed[] = Array.from({ length: 12 }, (_, i) => ({
    tags: { sleep: i % 2 === 0 ? 'over_8' : 'under_6' },
    sets: [[5, i % 2 === 0 ? 100 + i * 10 : 50]],
  }))
  const { workouts, rows } = build(seeds)
  const { tagged, findings } = buildFeelInsights(workouts, rows, weightOnly)
  expect(tagged).toBe(12)
  expect(findings).toHaveLength(1)
  expect(findings[0]).toMatchObject({
    dimension: 'sleep',
    metric: 'records',
    better: { value: 'over_8', workouts: 6 },
    worse: { value: 'under_6', workouts: 6 },
    text: 'You set records after over 8 hours of sleep, and none after under 6 hours of sleep.',
    detail: '0.8 vs 0 records a workout. Based on 6 and 6 workouts.',
  })
})

test('records as a multiple when both groups set some', () => {
  // High energy: 2 records a workout. Low energy: 1. Each workout starts at
  // a new best, so every set after the baseline is a record.
  let w = 100
  const seeds: Seed[] = []
  for (let i = 0; i < 10; i++) {
    const high = i % 2 === 0
    const sets: [number, number][] = high ? [[5, (w += 5)], [5, (w += 5)]] : [[5, (w += 5)]]
    seeds.push({ tags: { energy: high ? 'high' : 'low' }, sets })
  }
  // The very first set is the baseline, so put an untagged warm-up first.
  const { workouts, rows } = build([{ tags: {}, sets: [[5, 50]] }, ...seeds])
  const [finding] = buildFeelInsights(workouts, rows, weightOnly).findings
  expect(finding.metric).toBe('records')
  expect(finding.text).toBe('You set 2x more records when your energy was high than when your energy was low.')
})

test('a group smaller than the minimum is never compared', () => {
  // 10 OK-stress workouts and MIN_GROUP_WORKOUTS - 1 high-stress ones with no
  // records: the gap is big, but the high group is too small.
  const seeds: Seed[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ tags: { stress: 'ok' }, sets: [[5, 100 + i * 10]] as [number, number][] })),
    ...Array.from({ length: MIN_GROUP_WORKOUTS - 1 }, () => ({ tags: { stress: 'high' }, sets: [[5, 40]] as [number, number][] })),
  ]
  const { workouts, rows } = build(seeds)
  expect(buildFeelInsights(workouts, rows, weightOnly).findings).toEqual([])
})

test('small differences are left out, and est. 1RM or sets step in when records are even', () => {
  // Every set is the same weight, so no records and no est. 1RM change,
  // but more sets on low-stress days: 6 vs 3.
  const seeds: Seed[] = Array.from({ length: 10 }, (_, i) => ({
    tags: { stress: i % 2 === 0 ? 'low' : 'high' },
    sets: Array.from({ length: i % 2 === 0 ? 6 : 3 }, () => [5, 100] as [number, number]),
  }))
  const { workouts, rows } = build(seeds)
  const [finding] = buildFeelInsights(workouts, rows, weightOnly).findings
  expect(finding).toMatchObject({ dimension: 'stress', metric: 'sets', better: { value: 'low' }, worse: { value: 'high' } })
  expect(finding.text).toBe('You got through 2x more sets when stress was low than when stress was high.')

  // 5 vs 4.4 sets is under both thresholds: nothing to say.
  const close: Seed[] = Array.from({ length: 10 }, (_, i) => ({
    tags: { stress: i % 2 === 0 ? 'low' : 'high' },
    sets: Array.from({ length: i % 2 === 0 ? 5 : i % 4 === 1 ? 4 : 5 }, () => [5, 100] as [number, number]),
  }))
  const quiet = build(close)
  expect(buildFeelInsights(quiet.workouts, quiet.rows, weightOnly).findings).toEqual([])
})

test('the workout in progress is left out', () => {
  const seeds: Seed[] = Array.from({ length: MIN_TAGGED_WORKOUTS }, () => ({ tags: { sleep: '6_to_8' }, sets: [[5, 100]] }))
  const { workouts, rows } = build(seeds)
  expect(buildFeelInsights(workouts, rows, weightOnly, [], 'w9').tagged).toBe(MIN_TAGGED_WORKOUTS - 1)
})

test('feelOf ignores unknown values, and feelSummary reads like a sentence', () => {
  expect(feelOf({ sleep: 'lots', energy: 'high', stress: undefined })).toEqual({ sleep: null, energy: 'high', stress: null })
  expect(feelSummary({ sleep: '6_to_8', energy: 'ok', stress: 'high' })).toBe('Sleep 6 to 8 h · Energy OK · Stress high')
})
