import { test, expect } from '@playwright/test'
import type { ProgressSetRow } from '../src/lib/progressHub'
import { templateProgressRows, templateVolumeHistories, volumePoints } from '../src/lib/templateProgress'

// Issue #157's per-session template volume. Pure, same "no separate
// unit-test runner" reasoning as progress-series-unit.spec.ts.

const EXERCISES = [
  { id: 'bench', name: 'Bench Press', load_type: 'weight' as const },
  { id: 'dip', name: 'Dip', load_type: 'bodyweight' as const },
  { id: 'pullup', name: 'Assisted Pull-up', load_type: 'assisted' as const },
  { id: 'plank', name: 'Plank Machine', load_type: 'level' as const },
  { id: 'bike', name: 'Bike', load_type: 'timed' as const },
]

let nextId = 0
function row(fields: Partial<ProgressSetRow> & Pick<ProgressSetRow, 'exercise_id' | 'workout_id' | 'performed_at'>): ProgressSetRow {
  return {
    id: `s${nextId++}`,
    reps: 10,
    weight: 100,
    weight_unit: 'lb',
    rpe: null,
    level: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    incline: null,
    calories: null,
    template_name: 'Push day',
    template_id: 't1',
    ...fields,
  }
}

const day = (n: number) => new Date(Date.UTC(2026, 8, n, 12)).toISOString()

test('mixed units add up in the preferred unit, and a level exercise adds nothing', () => {
  const rows = [
    row({ exercise_id: 'bench', workout_id: 'w1', performed_at: day(1), reps: 10, weight: 100, set_index: 0 }),
    // 50 kg × 10 is 500 kg, about 1,102 lb.
    row({ exercise_id: 'bench', workout_id: 'w1', performed_at: day(1), reps: 10, weight: 50, weight_unit: 'kg', set_index: 1 }),
    row({ exercise_id: 'plank', workout_id: 'w1', performed_at: day(1), reps: 12, weight: 0, level: 8, set_index: 2 }),
  ]
  const [history] = templateVolumeHistories(rows, EXERCISES, [], 'lb')
  expect(history.unit).toBe('lb')
  expect(history.sessions).toHaveLength(1)
  expect(history.sessions[0].volume).toBeCloseTo(1000 + 500 * 2.20462, 0)

  // The same session in kg.
  const [inKg] = templateVolumeHistories(rows, EXERCISES, [], 'kg')
  expect(inKg.sessions[0].volume).toBeCloseTo(1000 / 2.20462 + 500, 0)

  // Top sets: the heaviest bench set (converted to compare), the highest level.
  expect(history.sessions[0].exercises).toEqual([
    { exerciseId: 'bench', name: 'Bench Press', sets: 2, topSet: '10 × 50 kg' },
    { exerciseId: 'plank', name: 'Plank Machine', sets: 1, topSet: '12 × Level 8' },
  ])
})

test('bodyweight and assisted sets use the body weight on file at the workout', () => {
  const bodyWeight = [
    { weight: 180, weight_unit: 'lb' as const, recorded_at: day(1) },
    { weight: 190, weight_unit: 'lb' as const, recorded_at: day(10) },
  ]
  const rows = [
    // Before the second weigh-in: (180 + 20) × 10 + (180 - 60) × 5.
    row({ exercise_id: 'dip', workout_id: 'w1', performed_at: day(5), reps: 10, weight: 20, set_index: 0 }),
    row({ exercise_id: 'pullup', workout_id: 'w1', performed_at: day(5), reps: 5, weight: 60, set_index: 1 }),
    row({ exercise_id: 'pullup', workout_id: 'w1', performed_at: day(5), reps: 5, weight: 40, set_index: 2 }),
    // After it: 190 × 10.
    row({ exercise_id: 'dip', workout_id: 'w2', performed_at: day(12), reps: 10, weight: 0, set_index: 0 }),
  ]
  const [history] = templateVolumeHistories(rows, EXERCISES, bodyWeight, 'lb')
  expect(history.sessions.map((s) => s.volume)).toEqual([2000 + 600 + 700, 1900])
  // Least assist is the top assisted set.
  expect(history.sessions[0].exercises[1].topSet).toBe('5 × 40 lb assist')
  expect(history.sessions[0].exercises[0].topSet).toBe('10 × BW + 20 lb')

  // With no weigh-ins those sets are left out, not counted as 0.
  const [noWeight] = templateVolumeHistories(rows, EXERCISES, [], 'lb')
  expect(noWeight.sessions.map((s) => s.volume)).toEqual([null, null])
  expect(volumePoints(noWeight)).toEqual([])
})

test('freeform workouts and the workout in progress are left out; sessions sort oldest first', () => {
  const rows = [
    row({ exercise_id: 'bench', workout_id: 'w2', performed_at: day(8), weight: 110 }),
    row({ exercise_id: 'bench', workout_id: 'w1', performed_at: day(1), weight: 100 }),
    row({ exercise_id: 'bench', workout_id: 'free', performed_at: day(3), template_id: null, template_name: null }),
    row({ exercise_id: 'bench', workout_id: 'active', performed_at: day(9), weight: 500 }),
    row({ exercise_id: 'bike', workout_id: 'c1', performed_at: day(4), template_id: 't2', template_name: 'Cardio', reps: null, weight: 0, duration_seconds: 1200 }),
  ]
  const histories = templateVolumeHistories(rows, EXERCISES, [], null, 'active')
  const push = histories.find((h) => h.templateId === 't1')!
  expect(push.sessions.map((s) => s.workoutId)).toEqual(['w1', 'w2'])
  expect(push.sessions.map((s) => s.volume)).toEqual([1000, 1100])

  // A timed-only template has sessions but no volume to chart.
  const cardio = histories.find((h) => h.templateId === 't2')!
  expect(cardio.sessions[0].volume).toBeNull()
  expect(cardio.sessions[0].exercises[0].topSet).toBe('20:00')

  const listed = templateProgressRows(histories, new Date(day(10)))
  expect(listed.map((r) => r.name)).toEqual(['Push day', 'Cardio'])
  expect(listed[0]).toMatchObject({ headline: '1,100 lb', sessionCount: 2, spark: [1000, 1100], pill: { trend: 'up', text: '▲ 100' } })
  expect(listed[1]).toMatchObject({ headline: null, sessionCount: 1, pill: null })
})
