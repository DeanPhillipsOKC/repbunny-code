import { test, expect } from '@playwright/test'
import { buildProgressSeries, epley, filterByRange, mostUsedWeightUnit } from '../src/lib/progressSeries'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from '../src/lib/exerciseHistory'
import { liftProgressRows, topLiftTrend, type ProgressExercise } from '../src/lib/progressHub'

// Issue #21's pure series math, same "no separate unit-test runner"
// reasoning as assisted-load-type-unit.spec.ts: these never touch `page`.

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

test('epley: 185 x 8 is 234, a 1-rep set is its own weight, a 13-rep set is excluded', () => {
  expect(Math.round(epley(185, 8))).toBe(234)
  expect(epley(200, 1)).toBe(200)

  const onlyHighReps = [
    workout('2026-09-01T00:00:00Z', [set({ reps: 13, weight: 135 })]),
    workout('2026-09-08T00:00:00Z', [set({ reps: 8, weight: 185 }), set({ reps: 13, weight: 225 })]),
  ]
  const { points } = buildProgressSeries(onlyHighReps, 'e1rm')
  // The first session has no eligible set and is skipped; the second's 13-rep
  // set would win if it counted (225 x 13 -> 322).
  expect(points).toHaveLength(1)
  expect(points[0].value).toBe(234)
  expect(points[0].set.reps).toBe(8)
})

test('buildProgressSeries: one point per session, oldest first, each the session best', () => {
  // Store order is newest first.
  const history = [
    workout('2026-09-08T00:00:00Z', [set({ reps: 5, weight: 200 }), set({ reps: 10, weight: 150 })]),
    workout('2026-09-01T00:00:00Z', [set({ reps: 8, weight: 185 }), set({ reps: 8, weight: 190 })]),
  ]
  const e1rm = buildProgressSeries(history, 'e1rm')
  expect(e1rm.points.map((p) => p.performedAt)).toEqual(['2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z'])
  // 190 x 8 -> 241; 200 x 5 -> 233 beats 150 x 10 -> 200.
  expect(e1rm.points.map((p) => p.value)).toEqual([241, 233])

  expect(buildProgressSeries(history, 'heaviest').points.map((p) => p.value)).toEqual([190, 200])
  expect(buildProgressSeries(history, 'volume').points.map((p) => p.value)).toEqual([8 * 185 + 8 * 190, 5 * 200 + 10 * 150])
})

test('mixed units: convert to the most-used unit, the most recent set breaks a tie', () => {
  const mostlyLb = [
    workout('2026-09-08T00:00:00Z', [set({ weight: 100, weight_unit: 'kg' })]),
    workout('2026-09-01T00:00:00Z', [set({ weight: 200, weight_unit: 'lb' }), set({ weight: 210, weight_unit: 'lb' })]),
  ]
  expect(mostUsedWeightUnit(mostlyLb)).toBe('lb')
  const heaviest = buildProgressSeries(mostlyLb, 'heaviest')
  expect(heaviest.unit).toBe('lb')
  expect(heaviest.points[1].value).toBeCloseTo(220.462, 3)
  expect(heaviest.points[0].converted).toBe(false)
  expect(heaviest.points[1].converted).toBe(true)

  // Two lb sets, two kg sets: the newest set (kg) wins the tie.
  const tied = [
    workout('2026-09-08T00:00:00Z', [set({ weight: 80, weight_unit: 'kg' }), set({ weight: 82.5, weight_unit: 'kg' })]),
    workout('2026-09-01T00:00:00Z', [set({ weight: 185, weight_unit: 'lb' }), set({ weight: 190, weight_unit: 'lb' })]),
  ]
  expect(mostUsedWeightUnit(tied)).toBe('kg')
  // Flip which one is newer and lb wins instead.
  const tiedLbNewer = [
    workout('2026-09-08T00:00:00Z', [set({ weight: 185, weight_unit: 'lb' }), set({ weight: 190, weight_unit: 'lb' })]),
    workout('2026-09-01T00:00:00Z', [set({ weight: 80, weight_unit: 'kg' }), set({ weight: 82.5, weight_unit: 'kg' })]),
  ]
  expect(mostUsedWeightUnit(tiedLbNewer)).toBe('lb')
})

test('assisted: least assist is each session best', () => {
  const history = [
    workout('2026-09-08T00:00:00Z', [set({ weight: 30 }), set({ weight: 20 })]),
    workout('2026-09-01T00:00:00Z', [set({ weight: 40 }), set({ weight: 50 })]),
  ]
  const { points } = buildProgressSeries(history, 'assist')
  expect(points.map((p) => p.value)).toEqual([40, 20])
})

test('filterByRange: counted back from today, All keeps everything', () => {
  const now = new Date('2026-09-29T12:00:00Z')
  const points = [
    { performedAt: '2025-06-01T00:00:00Z' },
    { performedAt: '2026-05-01T00:00:00Z' },
    { performedAt: '2026-08-15T00:00:00Z' },
    { performedAt: '2026-09-20T00:00:00Z' },
  ]
  expect(filterByRange(points, '1M', now)).toHaveLength(1)
  expect(filterByRange(points, '3M', now)).toHaveLength(2)
  expect(filterByRange(points, '1Y', now)).toHaveLength(3)
  expect(filterByRange(points, 'All', now)).toHaveLength(4)
})

test('liftProgressRows: a one-workout lift gets a row with no trend; the top-lift tile still needs two', () => {
  const now = new Date('2026-09-20T12:00:00Z')
  const exercise = (id: string): ProgressExercise => ({ id, name: id, load_type: 'weight', tracks_distance: false, muscle_group: null })
  const histories = new Map([
    ['once', [workout('2026-09-15T00:00:00Z', [set({ reps: 10, weight: 200 })])]],
    ['twice', [workout('2026-09-08T00:00:00Z', [set({ reps: 8, weight: 190 })]), workout('2026-09-01T00:00:00Z', [set({ reps: 8, weight: 185 })])]],
  ])
  const exercises = [exercise('once'), exercise('twice'), exercise('never')]

  const rows = liftProgressRows(exercises, histories, now)
  expect(rows.map((r) => r.name)).toEqual(['once', 'twice'])
  const [once, twice] = rows
  expect(once.oneSession).toBe(true)
  expect(once.pill).toBeNull()
  expect(once.spark).toHaveLength(1)
  expect(once.headline).toBe('267 lb')
  expect(twice.oneSession).toBe(false)
  expect(twice.pill?.trend).toBe('up')

  expect(topLiftTrend(exercises, histories, now)?.exercise.id).toBe('twice')
})
