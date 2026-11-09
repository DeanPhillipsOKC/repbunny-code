import { test, expect } from '@playwright/test'
import { addRestTime, reconcileRest, skipRest, type NativeRest } from '../src/lib/restLiveState'

// Issue #143's lock-screen timer rules, same "no separate unit-test runner"
// reasoning as assisted-load-type-unit.spec.ts: these never touch `page`.

const NOW = 1_000_000_000

function native(fields: Partial<NativeRest> = {}): NativeRest {
  return {
    id: 1,
    workoutId: 'w1',
    exerciseName: 'Bench Press',
    endsAt: NOW + 60_000,
    totalSeconds: 90,
    status: 'running',
    ...fields,
  }
}

test('+15s adds to the time left and grows the total only past it', () => {
  const added = addRestTime(native(), 15, NOW)
  expect(added.endsAt).toBe(NOW + 75_000)
  expect(added.totalSeconds).toBe(90)

  const pastTotal = addRestTime(native({ endsAt: NOW + 85_000 }), 15, NOW)
  expect(pastTotal.endsAt).toBe(NOW + 100_000)
  expect(pastTotal.totalSeconds).toBe(100)
})

test('+15s on a rest that already ran out counts from now', () => {
  const added = addRestTime(native({ endsAt: NOW - 5_000 }), 15, NOW)
  expect(added.endsAt).toBe(NOW + 15_000)
})

test('+15s and Skip leave a skipped or finished rest alone', () => {
  const skipped = skipRest(native())
  expect(skipped.status).toBe('skipped')
  expect(addRestTime(skipped, 15, NOW)).toEqual(skipped)
  const done = native({ status: 'done' })
  expect(skipRest(done)).toEqual(done)
})

test('the app takes on a skip or a new end time from the same rest', () => {
  const app = { id: 1, exerciseName: 'Bench Press', endsAt: NOW + 60_000, totalSeconds: 90 }
  expect(reconcileRest(app, native({ status: 'skipped' }), 'w1', NOW)).toEqual({ kind: 'skip' })
  expect(reconcileRest(app, native({ endsAt: NOW + 75_000 }), 'w1', NOW)).toEqual({
    kind: 'update',
    endsAt: NOW + 75_000,
    totalSeconds: 90,
  })
  expect(reconcileRest(app, native(), 'w1', NOW)).toEqual({ kind: 'none' })
  // The alarm already fired: the app's own countdown ends it.
  expect(reconcileRest(app, native({ status: 'done' }), 'w1', NOW)).toEqual({ kind: 'none' })
})

test('a different rest, or none at all, leaves the app alone', () => {
  const app = { id: 2, exerciseName: 'Squat', endsAt: NOW + 30_000, totalSeconds: 60 }
  expect(reconcileRest(app, native({ status: 'skipped' }), 'w1', NOW)).toEqual({ kind: 'none' })
  expect(reconcileRest(app, null, 'w1', NOW)).toEqual({ kind: 'none' })
  expect(reconcileRest(null, null, 'w1', NOW)).toEqual({ kind: 'none' })
})

test('a running rest comes back after the app was killed, for its own workout only', () => {
  expect(reconcileRest(null, native(), 'w1', NOW)).toEqual({
    kind: 'restore',
    rest: { id: 1, exerciseName: 'Bench Press', endsAt: NOW + 60_000, totalSeconds: 90 },
  })
  expect(reconcileRest(null, native(), 'w2', NOW)).toEqual({ kind: 'none' })
  expect(reconcileRest(null, native(), null, NOW)).toEqual({ kind: 'none' })
  expect(reconcileRest(null, native({ endsAt: NOW + 500 }), 'w1', NOW)).toEqual({ kind: 'none' })
  expect(reconcileRest(null, native({ status: 'skipped' }), 'w1', NOW)).toEqual({ kind: 'none' })
})
