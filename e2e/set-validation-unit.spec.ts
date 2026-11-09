import { test, expect } from '@playwright/test'
import {
  checkSetEntry,
  heaviestWeight,
  isCheckConstraintError,
  previousHeaviestInHistory,
  type SetEntryInput,
} from '../src/lib/setValidation'
import type { WorkoutWithSets } from '../src/lib/types'

// Issue #336: the pure checks behind the logger's and Workout log's set
// editors. Runs as plain Node assertions under the e2e gate, like the other
// *-unit specs.

const base: SetEntryInput = {
  loadType: 'weight',
  exerciseName: 'Barbell Bench Press',
  reps: 8,
  weight: 135,
  weightUnit: 'lb',
  level: null,
  previousHeaviest: null,
}

test('reps: 0, fractional, and blank are blocked on every load type with reps', () => {
  for (const loadType of ['weight', 'bodyweight', 'assisted', 'level'] as const) {
    for (const reps of [0, 2.5, -1, '', null]) {
      expect(checkSetEntry({ ...base, loadType, level: 3, reps })).toEqual({ block: 'Reps must be 1 or more.', confirm: null })
    }
  }
  expect(checkSetEntry({ ...base, reps: 1 })).toEqual({ block: null, confirm: null })
})

test('negative weight and bad levels are blocked', () => {
  for (const loadType of ['weight', 'bodyweight', 'assisted'] as const) {
    expect(checkSetEntry({ ...base, loadType, weight: -5 }).block).toBe("Weight can't be negative.")
  }
  expect(checkSetEntry({ ...base, loadType: 'level', level: 0 }).block).toBe('Level must be 1 or more.')
  expect(checkSetEntry({ ...base, loadType: 'level', level: 1.5 }).block).toBe('Level must be 1 or more.')
  expect(checkSetEntry({ ...base, loadType: 'level', level: 4 })).toEqual({ block: null, confirm: null })
})

test('0 weight confirms only for weight, never bodyweight, assisted, level, or timed', () => {
  expect(checkSetEntry({ ...base, weight: 0 })).toEqual({
    block: null,
    confirm: '0 lb on Barbell Bench Press? Log it anyway?',
  })
  expect(checkSetEntry({ ...base, weight: 0, action: 'save' }).confirm).toBe('0 lb on Barbell Bench Press? Save it anyway?')
  for (const loadType of ['bodyweight', 'assisted'] as const) {
    expect(checkSetEntry({ ...base, loadType, weight: 0 })).toEqual({ block: null, confirm: null })
    expect(checkSetEntry({ ...base, loadType, weight: null })).toEqual({ block: null, confirm: null })
  }
  expect(checkSetEntry({ ...base, loadType: 'level', weight: 0, level: 5 })).toEqual({ block: null, confirm: null })
  expect(checkSetEntry({ ...base, loadType: 'timed', reps: null, weight: 0 })).toEqual({ block: null, confirm: null })
})

test('more than 2x last session confirms, across lb and kg', () => {
  const withHistory = { ...base, previousHeaviest: 135 }
  expect(checkSetEntry({ ...withHistory, weight: 999 }).confirm).toBe('999 lb is a big jump from 135 lb last time. Log it anyway?')
  expect(checkSetEntry({ ...withHistory, weight: 1350 }).confirm).toBe('1350 lb is a big jump from 135 lb last time. Log it anyway?')
  expect(checkSetEntry({ ...withHistory, weight: 270 }).confirm).toBeNull()
  expect(checkSetEntry({ ...withHistory, weight: 270.5 }).confirm).not.toBeNull()

  // Last time 135 lb, now logging in kg: 135 lb is about 61 kg.
  const inKg = heaviestWeight([{ weight: 135, weight_unit: 'lb' }, { weight: 95, weight_unit: 'lb' }], 'kg')!
  expect(inKg).toBeCloseTo(61.23, 1)
  expect(checkSetEntry({ ...base, weightUnit: 'kg', weight: 120, previousHeaviest: inKg }).confirm).toBeNull()
  expect(checkSetEntry({ ...base, weightUnit: 'kg', weight: 125, previousHeaviest: inKg }).confirm).toBe(
    '125 kg is a big jump from 61 kg last time. Log it anyway?',
  )
  // Last time in kg, now in lb.
  const inLb = heaviestWeight([{ weight: 100, weight_unit: 'kg' }], 'lb')!
  expect(checkSetEntry({ ...base, weight: 440, previousHeaviest: inLb }).confirm).toBeNull()
  expect(checkSetEntry({ ...base, weight: 450, previousHeaviest: inLb }).confirm).toBe(
    '450 lb is a big jump from 220.5 lb last time. Log it anyway?',
  )
  expect(heaviestWeight([], 'lb')).toBeNull()
  expect(heaviestWeight(undefined, 'lb')).toBeNull()
})

test('with no history, 600 lb / 270 kg or more confirms', () => {
  expect(checkSetEntry({ ...base, weight: 599.5 }).confirm).toBeNull()
  expect(checkSetEntry({ ...base, weight: 600 }).confirm).toBe('600 lb is a lot for Barbell Bench Press. Log it anyway?')
  expect(checkSetEntry({ ...base, weightUnit: 'kg', weight: 269.5 }).confirm).toBeNull()
  expect(checkSetEntry({ ...base, weightUnit: 'kg', weight: 270 }).confirm).toBe('270 kg is a lot for Barbell Bench Press. Log it anyway?')
  // A 0 lb history counts as none.
  expect(checkSetEntry({ ...base, weight: 600, previousHeaviest: 0 }).confirm).not.toBeNull()
})

test('previousHeaviestInHistory: the latest earlier workout with that exercise', () => {
  const set = (workoutId: string, exerciseId: string, weight: number, unit: 'lb' | 'kg' = 'lb') => ({
    id: `${workoutId}-${exerciseId}-${weight}`, workout_id: workoutId, exercise_id: exerciseId, set_index: 0,
    reps: 5, weight, weight_unit: unit, rpe: null, level: null, exercises: null,
  })
  const workout = (id: string, performedAt: string, sets: ReturnType<typeof set>[]) =>
    ({ id, performed_at: performedAt, sets }) as unknown as WorkoutWithSets
  const history = [
    workout('w4', '2026-10-04T10:00:00Z', [set('w4', 'bench', 400)]),
    workout('w3', '2026-10-03T10:00:00Z', [set('w3', 'bench', 185)]),
    workout('w2', '2026-10-02T10:00:00Z', [set('w2', 'squat', 300)]),
    workout('w1', '2026-10-01T10:00:00Z', [set('w1', 'bench', 60, 'kg'), set('w1', 'bench', 135)]),
  ]
  expect(previousHeaviestInHistory(history, 'w4', 'bench', 'lb')).toBe(185)
  expect(previousHeaviestInHistory(history, 'w3', 'bench', 'lb')).toBeCloseTo(135, 0)
  expect(previousHeaviestInHistory(history, 'w1', 'bench', 'lb')).toBeNull()
  expect(previousHeaviestInHistory(history, 'w4', 'squat', 'lb')).toBe(300)
  expect(previousHeaviestInHistory(history, 'missing', 'bench', 'lb')).toBeNull()
})

test('isCheckConstraintError: Postgres 23514 and SQLite CHECK failures', () => {
  expect(isCheckConstraintError({ code: '23514', message: 'new row violates check constraint "sets_reps_check"' })).toBe(true)
  expect(isCheckConstraintError({ message: 'CHECK constraint failed: reps IS NULL OR reps > 0' })).toBe(true)
  expect(isCheckConstraintError({ message: 'Failed to fetch' })).toBe(false)
  expect(isCheckConstraintError(null)).toBe(false)
})
