import { test, expect } from '@playwright/test'
import { buildProgressSeries } from '../src/lib/progressSeries'
import { buildRepRecords } from '../src/lib/repRecords'
import { workoutVolume } from '../src/lib/volume'
import { e1rmGain, type PriorSet, type RecapSet } from '../src/lib/finishRecap'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from '../src/lib/exerciseHistory'

// Issue #53 follow-up: once a default unit is picked, charts and totals show
// it, converting history logged in the other unit. Null keeps the old rule
// (the history's most-used unit). Pure math, same "no separate unit-test
// runner" reasoning as progress-series-unit.spec.ts.

let nextId = 0
function set(fields: Partial<ExerciseHistorySet>): ExerciseHistorySet {
  return {
    id: `s${nextId++}`,
    reps: 8,
    weight: 100,
    weight_unit: 'lb',
    rpe: null,
    level: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    incline: null,
    calories: null,
    ...fields,
  }
}

function workout(performedAt: string, sets: ExerciseHistorySet[]): ExerciseHistoryWorkout {
  return { workoutId: `w${nextId++}`, performedAt, sets }
}

const lbHistory = [
  workout('2026-09-01T00:00:00Z', [set({ reps: 5, weight: 220.462 })]),
  workout('2026-09-08T00:00:00Z', [set({ reps: 5, weight: 231.485 })]),
]

test('progress series: a preferred kg shows lb history in kg; null keeps lb', () => {
  const kg = buildProgressSeries(lbHistory, 'heaviest', 'kg')
  expect(kg.unit).toBe('kg')
  expect(kg.points.map((p) => Math.round(p.value * 10) / 10)).toEqual([100, 105])
  expect(buildProgressSeries(lbHistory, 'heaviest', null).unit).toBe('lb')
})

test('rep records: a preferred kg converts lb sets', () => {
  const data = buildRepRecords(lbHistory, 'kg')!
  expect(data.unit).toBe('kg')
  expect(data.records.map((r) => r.weight)).toEqual([105, 100])
  expect(buildRepRecords(lbHistory)!.unit).toBe('lb')
})

test('workout volume: converts each set into the requested unit, including mixed units', () => {
  const sets = [
    { reps: 10, weight: 100, weight_unit: 'lb' as const },
    { reps: 10, weight: 100, weight_unit: 'kg' as const },
  ]
  const at = '2026-09-01T00:00:00Z'
  expect(Math.round(workoutVolume(sets, at, [], 'kg').total)).toBe(Math.round(1000 / 2.20462 + 1000))
  expect(Math.round(workoutVolume(sets, at, [], 'lb').total)).toBe(Math.round(1000 + 1000 * 2.20462))
})

test('finish recap e1RM gain: reported in the preferred unit', () => {
  const recap = (weight: number, reps: number) => ({ reps, weight, weight_unit: 'lb' as const }) as unknown as RecapSet
  const prior = [{ ...recap(220.462, 1), workout_id: 'p', performed_at: '2026-09-01T00:00:00Z' }] as unknown as PriorSet[]
  const gain = e1rmGain([recap(231.485, 1)], prior, '2026-09-08T00:00:00Z', 'kg')
  expect(gain).toEqual({ delta: 5, unit: 'kg' })
})
