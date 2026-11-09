import { test, expect } from '@playwright/test'
import { e1rmGain, type PriorSet, type RecapSet } from '../src/lib/finishRecap'

// Issue #46's est. 1RM change on finish recap records, same "no separate
// unit-test runner" reasoning as progress-series-unit.spec.ts: these never
// touch `page`.

const TODAY = '2026-09-29T12:00:00Z'

function today(fields: Partial<RecapSet>): RecapSet {
  return {
    exercise_id: 'e1',
    reps: 5,
    weight: 100,
    weight_unit: 'lb',
    level: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    calories: null,
    ...fields,
  }
}

function prior(performedAt: string, fields: Partial<RecapSet>): PriorSet {
  return { ...today(fields), workout_id: `w-${performedAt}`, performed_at: performedAt }
}

test('e1rmGain: an improvement shows the rounded delta over the best of all prior history', () => {
  // Prior bests: 5 x 100 -> 117, 3 x 105 -> 116 (the older one wins). Today 5 x 110 -> 128.
  const gain = e1rmGain(
    [today({ reps: 5, weight: 110 }), today({ reps: 8, weight: 80 })],
    [prior('2026-09-01T00:00:00Z', { reps: 5, weight: 100 }), prior('2026-09-20T00:00:00Z', { reps: 3, weight: 105 })],
    TODAY,
  )
  expect(gain).toEqual({ delta: 11, unit: 'lb' })
})

test('e1rmGain: no prior eligible set, or no improvement, gives nothing', () => {
  expect(e1rmGain([today({ reps: 5, weight: 110 })], [], TODAY)).toBeNull()
  // A 15-rep prior set is the only one, so there's nothing eligible to beat.
  expect(e1rmGain([today({ reps: 5, weight: 110 })], [prior('2026-09-01T00:00:00Z', { reps: 15, weight: 100 })], TODAY)).toBeNull()
  expect(e1rmGain([today({ reps: 5, weight: 100 })], [prior('2026-09-01T00:00:00Z', { reps: 5, weight: 100 })], TODAY)).toBeNull()
  expect(e1rmGain([today({ reps: 5, weight: 90 })], [prior('2026-09-01T00:00:00Z', { reps: 5, weight: 100 })], TODAY)).toBeNull()
})

test('e1rmGain: a 13-rep set is ignored on either side', () => {
  // Today's 13 x 120 would be 172 if it counted; only the 5 x 106 (124) does.
  const gain = e1rmGain(
    [today({ reps: 13, weight: 120 }), today({ reps: 5, weight: 106 })],
    [prior('2026-09-01T00:00:00Z', { reps: 5, weight: 100 }), prior('2026-09-01T00:00:00Z', { reps: 13, weight: 150 })],
    TODAY,
  )
  expect(gain).toEqual({ delta: 7, unit: 'lb' })
})

test('e1rmGain: mixed lb/kg converts to the most-used unit', () => {
  // Mostly kg: prior 5 x 50 kg -> 58 kg; today 5 x 60 kg -> 70 kg and a
  // 5 x 100 lb set (45.4 kg -> 53 kg) that doesn't win. Delta 12 kg.
  const gain = e1rmGain(
    [today({ reps: 5, weight: 60, weight_unit: 'kg' }), today({ reps: 5, weight: 100, weight_unit: 'lb' })],
    [prior('2026-09-01T00:00:00Z', { reps: 5, weight: 50, weight_unit: 'kg' }), prior('2026-09-02T00:00:00Z', { reps: 5, weight: 50, weight_unit: 'kg' })],
    TODAY,
  )
  expect(gain).toEqual({ delta: 12, unit: 'kg' })

  // Mostly lb: prior 5 x 60 kg (132.3 lb -> 154 lb) beats nothing today at 5 x 130 lb (152).
  expect(
    e1rmGain(
      [today({ reps: 5, weight: 130 }), today({ reps: 5, weight: 120 })],
      [prior('2026-09-01T00:00:00Z', { reps: 5, weight: 60, weight_unit: 'kg' })],
      TODAY,
    ),
  ).toBeNull()
  // ...but 5 x 140 lb (163) does, by 9 lb.
  expect(
    e1rmGain(
      [today({ reps: 5, weight: 140 }), today({ reps: 5, weight: 120 })],
      [prior('2026-09-01T00:00:00Z', { reps: 5, weight: 60, weight_unit: 'kg' })],
      TODAY,
    ),
  ).toEqual({ delta: 9, unit: 'lb' })
})
