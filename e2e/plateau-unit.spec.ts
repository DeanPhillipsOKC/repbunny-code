import { test, expect } from '@playwright/test'
import { flatSince } from '../src/lib/plateau'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from '../src/lib/exerciseHistory'

// Issue #133's flat rule, same "no separate unit-test runner" reasoning as
// assisted-load-type-unit.spec.ts: these never touch `page`.

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

// One workout per entry, a week apart from 2026-08-03, newest first like
// fetchExerciseHistory.
function weekly(sets: Partial<ExerciseHistorySet>[], daysApart = 7): ExerciseHistoryWorkout[] {
  const start = new Date('2026-08-03T12:00:00Z').getTime()
  return sets
    .map((fields, i) => ({
      workoutId: `w${nextId++}`,
      performedAt: new Date(start + i * daysApart * 86_400_000).toISOString(),
      sets: [set(fields)],
    }))
    .reverse()
}

test('flat: 4 sessions over 3+ weeks since the last new est. 1RM best', () => {
  const workouts = weekly([{ weight: 135 }, { weight: 185 }, { weight: 185 }, { weight: 180 }, { weight: 175 }, { weight: 185 }])
  // The best is the second session (Aug 10); matching it later isn't a new best.
  expect(flatSince('weight', false, workouts)).toBe('2026-08-10T12:00:00.000Z')
})

test('not flat: only 3 sessions since the best', () => {
  const workouts = weekly([{ weight: 135 }, { weight: 185 }, { weight: 185 }, { weight: 180 }, { weight: 175 }])
  expect(flatSince('weight', false, workouts)).toBeNull()
})

test('not flat: 4 sessions since the best, but in under 3 weeks', () => {
  const workouts = weekly([{ weight: 185 }, { weight: 180 }, { weight: 180 }, { weight: 180 }, { weight: 180 }], 5)
  // Best Aug 3, latest Aug 23: 20 days.
  expect(flatSince('weight', false, workouts)).toBeNull()
})

test('a new best inside the window clears the flag', () => {
  const flat = [{ weight: 185 }, { weight: 180 }, { weight: 180 }, { weight: 180 }, { weight: 180 }]
  expect(flatSince('weight', false, weekly(flat))).not.toBeNull()
  // Same weight for more reps is a better est. 1RM.
  expect(flatSince('weight', false, weekly([...flat, { weight: 185, reps: 9 }]))).toBeNull()
})

test('non-weight metrics: most reps, least assist, best level; timed is skipped', () => {
  const reps = weekly([{ weight: 0, reps: 12 }, { weight: 0, reps: 10 }, { weight: 0, reps: 11 }, { weight: 0, reps: 12 }, { weight: 0, reps: 9 }])
  expect(flatSince('bodyweight', false, reps)).toBe('2026-08-03T12:00:00.000Z')
  expect(flatSince('bodyweight', false, weekly([{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }, { weight: 0, reps: 10 }, { weight: 0, reps: 10 }, { weight: 0, reps: 13 }]))).toBeNull()

  // Lower assist is better, so 40 lb after 50 lb is a new best.
  const assist = weekly([{ weight: 50 }, { weight: 40 }, { weight: 45 }, { weight: 40 }, { weight: 50 }, { weight: 40 }])
  expect(flatSince('assisted', false, assist)).toBe('2026-08-10T12:00:00.000Z')
  expect(flatSince('assisted', false, weekly([{ weight: 50 }, { weight: 50 }, { weight: 50 }, { weight: 50 }, { weight: 35 }]))).toBeNull()

  const level = weekly([{ weight: 0, level: 8 }, { weight: 0, level: 8 }, { weight: 0, level: 7 }, { weight: 0, level: 8 }, { weight: 0, level: 8 }])
  expect(flatSince('level', false, level)).toBe('2026-08-03T12:00:00.000Z')

  const timed = weekly([60, 50, 50, 50, 50].map((s) => ({ weight: 0, reps: null, duration_seconds: s })))
  expect(flatSince('timed', false, timed)).toBeNull()
})
