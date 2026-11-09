import { test, expect } from '@playwright/test'
import { formatSetLabel } from '../src/lib/setLabel'
import { beatsBest, computeEffectiveLoad, ZERO_MARKER, type SetMarker } from '../src/lib/progress'
import { workoutVolume } from '../src/lib/volume'
import type { WorkoutWithSets } from '../src/lib/types'

// Backlog item 78's pure math, same "no separate unit-test runner" reasoning
// as body-stats-unit.spec.ts: these never touch `page`.

test('formatSetLabel: bodyweight renders "BW" with no added weight, "BW + Xlb" with some', () => {
  expect(formatSetLabel('bodyweight', 10, 0, 'lb', null)).toBe('10 × BW')
  expect(formatSetLabel('bodyweight', 8, 25, 'lb', null)).toBe('8 × BW + 25 lb')
})

test('computeEffectiveLoad: body weight + added weight, null when no body weight is on file', () => {
  const entries = [{ weight: 180, weight_unit: 'lb' as const, recorded_at: '2026-01-01T00:00:00Z' }]
  expect(computeEffectiveLoad('bodyweight', 25, 'lb', '2026-02-01T00:00:00Z', entries)).toBe(205)
  expect(computeEffectiveLoad('bodyweight', 25, 'lb', '2026-02-01T00:00:00Z', [])).toBeNull()
  // Non-bodyweight load types never have an effective load.
  expect(computeEffectiveLoad('weight', 100, 'lb', '2026-02-01T00:00:00Z', entries)).toBeNull()
})

test('beatsBest: bodyweight compares effective-load volume when known, falls back to reps/added-weight otherwise', () => {
  const known = (reps: number, effectiveLoad: number): SetMarker => ({
    loadType: 'bodyweight',
    level: null,
    reps,
    weight: 0,
    weightUnit: 'lb',
    effectiveLoad,
  })
  // 10 reps at 205 effective (1st) vs 8 reps at 200 effective (2050 > 1600).
  expect(beatsBest(known(10, 205), known(8, 200))).toBe(true)
  expect(beatsBest(known(8, 200), known(10, 205))).toBe(false)

  const unknown = (reps: number, weight: number): SetMarker => ({
    loadType: 'bodyweight',
    level: null,
    reps,
    weight,
    weightUnit: 'lb',
    effectiveLoad: null,
  })
  // No body weight on file for either side: most reps wins.
  expect(beatsBest(unknown(10, 0), unknown(8, 0))).toBe(true)
  // Same reps: added weight is the tiebreak.
  expect(beatsBest(unknown(10, 25), unknown(10, 10))).toBe(true)
  expect(beatsBest(unknown(10, 10), unknown(10, 25))).toBe(false)

  // First-ever set for the exercise always beats ZERO_MARKER.
  expect(beatsBest(known(1, 1), ZERO_MARKER)).toBe(true)
  expect(beatsBest(unknown(1, 0), ZERO_MARKER)).toBe(true)
})

function makeWorkout(id: string, performedAt: string, sets: WorkoutWithSets['sets']): WorkoutWithSets {
  return { id, user_id: 'u', template_id: null, performed_at: performedAt, notes: null, sets, workout_templates: null }
}

test('workoutVolume: bodyweight volume = reps * (body weight + added weight), excluded (not zeroed) when unknown', () => {
  const bodyWeightEntries = [{ weight: 180, weight_unit: 'lb' as const, recorded_at: '2026-01-01T00:00:00Z' }]

  const withKnownWeight = makeWorkout('w1', '2026-02-01T00:00:00Z', [
    {
      id: 's1',
      workout_id: 'w1',
      exercise_id: 'e1',
      set_index: 0,
      reps: 10,
      weight: 25,
      weight_unit: 'lb',
      rpe: null,
      level: null,
      exercises: { name: 'Push-up', load_type: 'bodyweight' },
    },
  ])
  // 10 * (180 + 25) = 2050.
  expect(workoutVolume(withKnownWeight.sets, withKnownWeight.performed_at, bodyWeightEntries, 'lb').total).toBe(2050)

  const withUnknownWeight = makeWorkout('w2', '2025-01-01T00:00:00Z', [
    {
      id: 's2',
      workout_id: 'w2',
      exercise_id: 'e1',
      set_index: 0,
      reps: 10,
      weight: 25,
      weight_unit: 'lb',
      rpe: null,
      level: null,
      exercises: { name: 'Push-up', load_type: 'bodyweight' },
    },
  ])
  // No body weight entries at all: excluded (0 contribution), never a
  // fabricated 0lb body weight.
  expect(workoutVolume(withUnknownWeight.sets, withUnknownWeight.performed_at, [], 'lb').total).toBe(0)
})
