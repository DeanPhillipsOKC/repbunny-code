import { test, expect } from '@playwright/test'
import { explainRecord, ruleText } from '../src/lib/recordCheck'
import { findRecordSetIds } from '../src/lib/sessionTable'
import { findFirstPrSets } from '../src/lib/progress'
import { DEFAULT_PROGRESSION } from '../src/lib/repRecords'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from '../src/lib/exerciseHistory'
import type { LoadType } from '../src/lib/types'

// Issue #579: the record check sheet's numbers, same "no separate unit-test
// runner" reasoning as rep-records-unit.spec.ts.

function set(id: string, weight: number, reps: number, weight_unit: 'lb' | 'kg' = 'lb', level: number | null = null): ExerciseHistorySet {
  return { id, reps, weight, weight_unit, rpe: null, level, duration_seconds: null, distance: null, distance_unit: null, incline: null, calories: null }
}

function day(n: number): string {
  return `2026-10-${String(n).padStart(2, '0')}T18:00:00Z`
}

// Newest first, like fetchExerciseHistory.
function history(...sessions: [number, ExerciseHistorySet[]][]): ExerciseHistoryWorkout[] {
  return sessions.map(([d, sets]) => ({ workoutId: `w${d}`, performedAt: day(d), sets })).reverse()
}

const explain = (loadType: LoadType, h: ExerciseHistoryWorkout[], id: string, bw: { weight: number; weight_unit: 'lb' | 'kg'; recorded_at: string }[] = [], premium = true) =>
  explainRecord(loadType, h, id, bw, DEFAULT_PROGRESSION, premium)!

test('not a record: a heavier set with fewer reps', () => {
  const h = history([8, [set('a', 145, 8)]], [12, [set('b', 150, 8)]], [15, [set('c', 155, 7)]])
  const check = explain('weight', h, 'c')
  expect(check.status).toBe('not-record')
  expect(check.title).toBe('155 lb × 7: not a record, yet')
  expect(ruleText(check.rule)).toBe('A record is your most weight × reps in a single set.')
  expect(check.lines.map((l) => `${l.label}: ${l.math} ${l.total}`)).toEqual(['This set: 155 × 7 = 1,085', 'Your best: 150 × 8 = 1,200'])
  expect(check.lines[1].sub).toMatch(/^150 lb × 8 · Oct 12, set 1$/)
  expect(check.best).toMatchObject({ id: 'b', workoutId: 'w12', setNumber: 1 })
  // 155 × 8 = 1,240 and 175 × 7 = 1,225 each beat 1,200; 155 × 7 doesn't.
  expect(check.toBeat).toEqual(['155 × 8', '175 × 7'])
  expect(check.beatBy).toBeNull()
  expect(check.wins.map((w) => [w.kind, w.state, w.value])).toEqual([
    ['heaviest', 'earned', '155 lb'],
    ['reps', 'first', 'first time'],
    ['e1rm', 'earned', '191'],
  ])
})

test('a record names what it beat, and agrees with the paw marks', () => {
  const h = history([8, [set('a', 145, 8)]], [12, [set('b', 150, 8)]], [15, [set('c', 155, 7)]])
  const check = explain('weight', h, 'b')
  expect(check.status).toBe('record')
  expect(check.title).toBe('150 lb × 8: a record')
  expect(check.lines[1]).toMatchObject({ label: 'Best before it', math: '145 × 8 =', total: '1,160' })
  expect(check.beatBy).toBe('40')
  expect(check.toBeat).toEqual([])
  expect([...findRecordSetIds('weight', h)]).toEqual(['b'])
})

test('a lighter set with more reps is a record by the rule', () => {
  const h = history([12, [set('b', 150, 8)]], [15, [set('c', 120, 12)]])
  const check = explain('weight', h, 'c')
  expect(check.status).toBe('record')
  expect(check.lines.map((l) => l.total)).toEqual(['1,440', '1,200'])
})

test('a tie is not a record, and earlier sets the same day count', () => {
  const h = history([12, [set('a', 150, 8), set('b', 150, 8), set('c', 160, 8)]], [15, [set('d', 160, 8)]])
  expect(explain('weight', h, 'b').status).toBe('not-record')
  const check = explain('weight', h, 'd')
  expect(check.status).toBe('not-record')
  expect(check.best).toMatchObject({ id: 'c', setNumber: 3 })
  expect(check.toBeat).toEqual(['160 × 9', '165 × 8'])
  expect(check.wins.find((w) => w.kind === 'reps')).toMatchObject({ state: 'needs', value: 'needs 9 reps', over: 'over 8' })
})

test('first set ever is the starting point', () => {
  const check = explain('weight', history([12, [set('a', 135, 10)]]), 'a')
  expect(check.status).toBe('first')
  expect(check.title).toBe('135 lb × 10: your first set')
  expect(check.best).toBeNull()
  expect(check.lines).toHaveLength(1)
  expect(check.wins).toEqual([])
})

test('est. 1RM best only shows with Premium', () => {
  const h = history([12, [set('b', 150, 8)]], [15, [set('c', 155, 7)]])
  expect(explain('weight', h, 'c', [], false).wins.map((w) => w.kind)).toEqual(['heaviest', 'reps'])
})

test('mixed units compare by what they lift', () => {
  // 100 kg × 5 is about 220.5 × 5 = 1,102.3 lb; 225 × 5 = 1,125 beats it.
  const h = history([8, [set('a', 100, 5, 'kg')]], [12, [set('b', 225, 5)]])
  const check = explain('weight', h, 'b')
  expect(check.status).toBe('record')
  expect(check.lines[1]).toMatchObject({ math: '220.5 × 5 =', total: '1,102.3', sub: expect.stringMatching(/^100 kg × 5 · /) })
  expect(check.beatBy).toBe('22.7')
})

test('level: highest level, then reps', () => {
  const h = history([8, [set('a', 0, 10, 'lb', 6)]], [12, [set('b', 0, 12, 'lb', 5)]])
  const check = explain('level', h, 'b')
  expect(check.status).toBe('not-record')
  expect(ruleText(check.rule)).toBe('A record is your highest level, then the most reps at that level.')
  expect(check.lines.map((l) => l.total)).toEqual(['Level 5 × 12', 'Level 6 × 10'])
  expect(check.toBeat).toEqual(['Level 6 × 11', 'Level 7'])
  expect(check.wins).toEqual([])
})

test('bodyweight with a weigh-in uses body weight plus added weight', () => {
  const weighIns = [{ weight: 183, weight_unit: 'lb' as const, recorded_at: '2026-10-10T08:00:00Z' }]
  const h = history([12, [set('a', 10, 10)]], [15, [set('b', 25, 8)]])
  const check = explain('bodyweight', h, 'b', weighIns)
  expect(check.note).toMatch(/^Body weight 183 lb from your Oct 10 weigh-in\.$/)
  // (183 + 25) × 8 = 1,664 against 193 × 10 = 1,930.
  expect(check.title).toBe('BW + 25 lb × 8: not a record, yet')
  expect(check.lines.map((l) => `${l.math} ${l.total}`)).toEqual(['(183 + 25) × 8 = 1,664', '193 × 10 = 1,930'])
  // 208 × 10 = 2,080; at 8 reps it needs over 241.25 effective, so 60 added.
  expect(check.toBeat).toEqual(['BW + 25 lb × 10', 'BW + 60 lb × 8'])
})

test('bodyweight without a weigh-in compares reps first', () => {
  const h = history([3, [set('a', 10, 10)]], [15, [set('b', 0, 9)]])
  const check = explain('bodyweight', h, 'b')
  expect(check.status).toBe('not-record')
  expect(check.title).toBe('Body weight × 9: not a record, yet')
  expect(check.note).toBe('No weigh-in on file, so it compares reps first, then added weight.')
  expect(check.lines.map((l) => l.total)).toEqual(['9 reps', '10 reps'])
  expect(check.toBeat).toEqual(['11 reps', '10 reps with over 10 lb added'])
})

test('assisted with a weigh-in: less assist is more load', () => {
  const weighIns = [{ weight: 180, weight_unit: 'lb' as const, recorded_at: '2026-10-01T08:00:00Z' }]
  const h = history([8, [set('a', 60, 8)]], [12, [set('b', 50, 8)]])
  const check = explain('assisted', h, 'b', weighIns)
  expect(check.status).toBe('record')
  expect(check.lines.map((l) => `${l.math} ${l.total}`)).toEqual(['(180 − 50) × 8 = 1,040', '120 × 8 = 960'])
  expect(check.beatBy).toBe('80')
})

test('timed sets and unknown sets have no record check', () => {
  expect(explainRecord('timed', history([12, [set('a', 0, 0)]]), 'a', [], DEFAULT_PROGRESSION, true)).toBeNull()
  expect(explainRecord('weight', history([12, [set('a', 100, 5)]]), 'zzz', [], DEFAULT_PROGRESSION, true)).toBeNull()
})

test('findFirstPrSets: the first record set of each workout', () => {
  const s = (id: string, weight: number) => ({ id, exercise_id: 'e1', reps: 5, weight, weight_unit: 'lb' as const, level: null, exercises: { load_type: 'weight' as const } })
  const prs = findFirstPrSets([
    { id: 'w1', performed_at: day(1), sets: [s('a', 100)] },
    { id: 'w2', performed_at: day(2), sets: [s('b', 90), s('c', 110), s('d', 120)] },
  ])
  expect([...prs.entries()]).toEqual([['w2', { setId: 'c', exerciseId: 'e1' }]])
})
