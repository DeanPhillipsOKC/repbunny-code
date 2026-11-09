import { test, expect } from '@playwright/test'
import { buildRepRecords, progressionFor, weightStepFor } from '../src/lib/repRecords'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from '../src/lib/exerciseHistory'

// The history sheet's "Next time" target and "Best reps at each weight"
// math, same "no separate unit-test runner" reasoning as
// progress-series-unit.spec.ts: these never touch `page`.

let nextId = 0
function set(weight: number, reps: number, weight_unit: 'lb' | 'kg' = 'lb'): ExerciseHistorySet {
  return {
    id: `s${nextId++}`,
    reps,
    weight,
    weight_unit,
    rpe: null,
    level: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    incline: null,
    calories: null,
  }
}

// Noon UTC so the short date reads the same in any test-runner time zone.
function workout(day: string, sets: ExerciseHistorySet[]): ExerciseHistoryWorkout {
  return { workoutId: `w${nextId++}`, performedAt: `${day}T12:00:00Z`, sets }
}

test('buildRepRecords: most reps per weight, heaviest first, earliest date on a tie', () => {
  // The user's Leg Extension; store order is newest first.
  const data = buildRepRecords([
    workout('2026-09-27', [set(210, 9), set(190, 10), set(190, 9)]),
    workout('2026-09-26', [set(210, 11), set(210, 8), set(190, 10)]),
  ])!
  expect(data.unit).toBe('lb')
  expect(data.records.map((r) => [r.weight, r.reps, r.performedAt.slice(0, 10)])).toEqual([
    [210, 11, '2026-09-26'],
    [190, 10, '2026-09-26'],
  ])
  expect(data.lastWeight).toBe(210)
  // Last session was 210 x 9, but the best at 210 is 11.
  expect(data.next).toMatchObject({ weight: 210, reps: 12, goUp: false, best: 11 })
  expect(data.next!.why).toBe("Beat your 11 from Sep 26. Hit 12 and it's time to go up to 215.")
})

test('buildRepRecords: top of the range means go up, aiming past any history at the new weight', () => {
  const data = buildRepRecords([
    workout('2026-09-27', [set(185, 12)]),
    workout('2026-09-19', [set(190, 9)]),
  ])!
  expect(data.next).toMatchObject({ weight: 190, reps: 10, goUp: true, best: 9 })
  expect(data.next!.why).toBe('You hit 12 at 185 lb on Sep 27. Your best at 190 is 9, so aim for 10.')

  // 190 is already topped too, so skip to 195; never done there, so aim for 8.
  const skip = buildRepRecords([
    workout('2026-09-27', [set(185, 12)]),
    workout('2026-09-19', [set(190, 13)]),
  ])!
  expect(skip.next).toMatchObject({ weight: 195, reps: 8, goUp: true, best: 0 })
  expect(skip.next!.why).toBe('You hit 13 at 190 lb on Sep 19. First time at 195, so aim for 8.')
})

test('buildRepRecords: below the range, build reps at the same weight', () => {
  const data = buildRepRecords([workout('2026-09-27', [set(225, 6), set(205, 10)])])!
  // The heaviest weight in the last session is the one the target is about.
  expect(data.next).toMatchObject({ weight: 225, reps: 7, goUp: false, best: 6 })
  expect(data.next!.why).toBe('Your best at 225 is 6. Build up to 8 before adding weight.')
})

test('buildRepRecords: kg steps by 2.5, and the other unit is converted and grouped', () => {
  const kg = buildRepRecords([
    workout('2026-09-24', [set(57.5, 12, 'kg')]),
    workout('2026-09-20', [set(55, 10, 'kg')]),
  ])!
  expect(kg.unit).toBe('kg')
  expect(kg.next).toMatchObject({ weight: 60, reps: 8, goUp: true })
  expect(kg.next!.why).toBe('You hit 12 at 57.5 kg on Sep 24. First time at 60, so aim for 8.')

  const mixed = buildRepRecords([
    workout('2026-09-24', [set(100, 5, 'kg')]),
    workout('2026-09-20', [set(100, 6, 'kg'), set(200, 8), set(185, 10)]),
    workout('2026-09-10', [set(200, 9), set(185, 8)]),
  ])!
  expect(mixed.unit).toBe('lb')
  // Both 100 kg sets land on the same converted weight.
  expect(mixed.records.map((r) => [r.weight, r.reps])).toEqual([
    [220.5, 6],
    [200, 9],
    [185, 10],
  ])
})

test('buildRepRecords: no sets with both weight and reps means no cards', () => {
  expect(buildRepRecords([])).toBeNull()
  expect(buildRepRecords([workout('2026-09-20', [set(0, 12)])])).toBeNull()
})

// The weight jump is derived (issue #60 cut #54's per-exercise jump and
// range): 2x the smallest plate for a barbell, else 5 lb / 2.5 kg.
const PLATES = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] }

test('weightStepFor: barbell from plates, and the default', () => {
  expect(weightStepFor('lb', { ...PLATES, lb: [45, 25, 10, 5, 2.5, 1.25] }, true)).toBe(2.5)
  expect(weightStepFor('lb', PLATES, true)).toBe(5)
  expect(weightStepFor('lb', PLATES, false)).toBe(5)
  expect(weightStepFor('kg', PLATES, false)).toBe(2.5)
  // No plates for that unit falls back to the default.
  expect(weightStepFor('kg', { lb: [45], kg: [] }, true)).toBe(2.5)
})

test('buildRepRecords: uses the derived jump and the 8 to 12 range', () => {
  const smallPlates = progressionFor({ ...PLATES, lb: [45, 25, 10, 5, 2.5, 1.25] }, true)
  const up = buildRepRecords([workout('2026-09-27', [set(100, 12)])], 'lb', smallPlates)!
  expect(up.step).toBe(2.5)
  expect(up.range).toEqual({ min: 8, max: 12 })
  expect(up.next).toMatchObject({ weight: 102.5, reps: 8, goUp: true })
})
