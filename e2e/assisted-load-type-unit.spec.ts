import { test, expect } from '@playwright/test'
import { formatSetLabel } from '../src/lib/setLabel'
import { beatsBest, computeEffectiveLoad, ZERO_MARKER, type SetMarker } from '../src/lib/progress'
import { workoutVolume } from '../src/lib/volume'
import { leastAssistByUnit } from '../src/lib/exerciseHistory'
import type { WorkoutWithSets } from '../src/lib/types'

// Backlog item 79's pure math, same "no separate unit-test runner" reasoning
// as bodyweight-load-type-unit.spec.ts: these never touch `page`.

test('formatSetLabel: assisted renders "X × Y lb assist"', () => {
  expect(formatSetLabel('assisted', 10, 40, 'lb', null)).toBe('10 × 40 lb assist')
  expect(formatSetLabel('assisted', 8, 0, 'lb', null)).toBe('8 × 0 lb assist')
})

test('computeEffectiveLoad: assisted is body weight minus assist, clamped at 0, null when no body weight is on file', () => {
  const entries = [{ weight: 180, weight_unit: 'lb' as const, recorded_at: '2026-01-01T00:00:00Z' }]
  expect(computeEffectiveLoad('assisted', 40, 'lb', '2026-02-01T00:00:00Z', entries)).toBe(140)
  // Assist can't exceed body weight -- clamped at 0, not negative.
  expect(computeEffectiveLoad('assisted', 200, 'lb', '2026-02-01T00:00:00Z', entries)).toBe(0)
  expect(computeEffectiveLoad('assisted', 40, 'lb', '2026-02-01T00:00:00Z', [])).toBeNull()
})

test('beatsBest: assisted compares effective-load volume when known, falls back to reps then less-assist otherwise', () => {
  const known = (reps: number, effectiveLoad: number): SetMarker => ({
    loadType: 'assisted',
    level: null,
    reps,
    weight: 0,
    weightUnit: 'lb',
    effectiveLoad,
  })
  // 10 reps at 140 effective (1400) beats 10 reps at 130 effective (1300).
  expect(beatsBest(known(10, 140), known(10, 130))).toBe(true)
  expect(beatsBest(known(10, 130), known(10, 140))).toBe(false)

  const unknown = (reps: number, weight: number): SetMarker => ({
    loadType: 'assisted',
    level: null,
    reps,
    weight,
    weightUnit: 'lb',
    effectiveLoad: null,
  })
  // No body weight on file for either side: most reps wins.
  expect(beatsBest(unknown(10, 40), unknown(8, 40))).toBe(true)
  // Same reps: LESS assist is the win (inverted vs. bodyweight's added weight).
  expect(beatsBest(unknown(10, 20), unknown(10, 40))).toBe(true)
  expect(beatsBest(unknown(10, 40), unknown(10, 20))).toBe(false)

  // First-ever set for the exercise always beats ZERO_MARKER.
  expect(beatsBest(known(1, 1), ZERO_MARKER)).toBe(true)
  expect(beatsBest(unknown(1, 40), ZERO_MARKER)).toBe(true)
})

function makeWorkout(id: string, performedAt: string, sets: WorkoutWithSets['sets']): WorkoutWithSets {
  return { id, user_id: 'u', template_id: null, performed_at: performedAt, notes: null, sets, workout_templates: null }
}

test('workoutVolume: assisted volume = reps * max(body weight - assist, 0), excluded (not zeroed) when unknown', () => {
  const bodyWeightEntries = [{ weight: 180, weight_unit: 'lb' as const, recorded_at: '2026-01-01T00:00:00Z' }]

  const withKnownWeight = makeWorkout('w1', '2026-02-01T00:00:00Z', [
    {
      id: 's1',
      workout_id: 'w1',
      exercise_id: 'e1',
      set_index: 0,
      reps: 10,
      weight: 40,
      weight_unit: 'lb',
      rpe: null,
      level: null,
      exercises: { name: 'Assisted pull-up', load_type: 'assisted' },
    },
  ])
  // 10 * max(180 - 40, 0) = 1400.
  expect(workoutVolume(withKnownWeight.sets, withKnownWeight.performed_at, bodyWeightEntries, 'lb').total).toBe(1400)

  const withUnknownWeight = makeWorkout('w2', '2025-01-01T00:00:00Z', [
    {
      id: 's2',
      workout_id: 'w2',
      exercise_id: 'e1',
      set_index: 0,
      reps: 10,
      weight: 40,
      weight_unit: 'lb',
      rpe: null,
      level: null,
      exercises: { name: 'Assisted pull-up', load_type: 'assisted' },
    },
  ])
  expect(workoutVolume(withUnknownWeight.sets, withUnknownWeight.performed_at, [], 'lb').total).toBe(0)
})

test('leastAssistByUnit: minimum assist per unit (less assist is the better set)', () => {
  const workouts = [
    { workoutId: 'w1', performedAt: '2026-01-01T00:00:00Z', sets: [{ id: 's1', reps: 10, weight: 40, weight_unit: 'lb' as const, rpe: null, level: null }] },
    { workoutId: 'w2', performedAt: '2026-01-08T00:00:00Z', sets: [{ id: 's2', reps: 10, weight: 25, weight_unit: 'lb' as const, rpe: null, level: null }] },
  ]
  expect(leastAssistByUnit(workouts)).toEqual({ lb: 25 })
})
