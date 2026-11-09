import { test, expect } from '@playwright/test'
import {
  balanceCounts,
  balancePair,
  balancePairs,
  effectivePushPull,
  movementPushPull,
  needsPushPull,
  pushPullToSet,
  sideCredit,
  uncountedExerciseIds,
  uncountedLine,
  type BalanceExercise,
  type MovementOf,
} from '../src/lib/balance'
import type { LibraryMovement } from '../src/lib/exerciseLibrary'
import type { MuscleSetRow } from '../src/lib/muscleVolume'
import type { MuscleGroup } from '../src/lib/muscleGroups'
import type { PushPull } from '../src/lib/types'

// Issue #138's upper/lower mapping and ratios, and #173's push or pull per
// exercise. Same "no separate unit-test runner" reasoning as
// assisted-load-type-unit.spec.ts: these never touch `page`. The library
// lookup is a stand-in here (Node can't import the bundled JSON);
// e2e/local/balance.spec.ts checks the real libraryMovementOf.

const NOW = new Date('2026-10-06T12:00:00Z')

const BY_ID: Record<string, LibraryMovement> = { reverse_pec_deck: 'rear_delt', dumbbell_lateral_raise: 'lateral_raise' }
const BY_NAME: Record<string, LibraryMovement> = {
  'barbell bench press': 'horizontal_press',
  'tricep pushdown': 'triceps_extension',
  'dumbbell curl': 'biceps_curl',
  'face pull': 'rear_delt',
  hyperextension: 'hip_hinge',
}
const movementOf: MovementOf = (e) => (e.library_id && BY_ID[e.library_id]) || BY_NAME[e.name.toLowerCase()] || null

function ex(
  id: string,
  group: MuscleGroup | null,
  also: MuscleGroup[] = [],
  extra: { library_id?: string | null; push_pull?: PushPull | null; name?: string } = {},
): BalanceExercise {
  return { id, name: extra.name ?? id, muscle_group: group, also_works: also, load_type: 'weight', ...extra }
}

function sets(exerciseId: string, n: number, daysAgo = 2): MuscleSetRow[] {
  const at = new Date(NOW.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return Array.from({ length: n }, () => ({
    exercise_id: exerciseId,
    performed_at: at,
    reps: 8,
    weight: 100,
    weight_unit: 'lb' as const,
    duration_seconds: null,
  }))
}

test('balance: muscles map to upper and lower', () => {
  for (const g of ['chest', 'shoulders', 'back', 'arms'] as const) expect(sideCredit(ex('a', g), 'upper', movementOf)).toBe(1)
  expect(sideCredit(ex('a', 'legs'), 'lower', movementOf)).toBe(1)
  expect(sideCredit(ex('a', 'glutes'), 'lower', movementOf)).toBe(1)
  // Core, cardio, and no group count toward nothing.
  for (const side of ['push', 'pull', 'upper', 'lower'] as const) {
    expect(sideCredit(ex('a', 'core'), side, movementOf)).toBe(0)
    expect(sideCredit(ex('a', 'cardio'), side, movementOf)).toBe(0)
    expect(sideCredit(ex('a', null), side, movementOf)).toBe(0)
  }
})

test('balance: library movements map to push, pull, or neither', () => {
  const push = ['horizontal_press', 'incline_press', 'chest_fly', 'dip', 'vertical_press', 'lateral_raise', 'front_raise', 'triceps_extension'] as const
  for (const m of push) expect(movementPushPull(m)).toBe('push')
  for (const m of ['vertical_pull', 'horizontal_row', 'rear_delt', 'shrug', 'biceps_curl'] as const) {
    expect(movementPushPull(m)).toBe('pull')
  }
  for (const m of ['hip_hinge', 'wrist_curl', 'hang', 'squat', 'plank'] as const) expect(movementPushPull(m)).toBe('neither')
})

test('balance: push or pull resolves own value, then library, then chest, then unset', () => {
  // Its own value wins over the library.
  expect(effectivePushPull(ex('a', 'shoulders', [], { library_id: 'dumbbell_lateral_raise', push_pull: 'pull' }), movementOf)).toBe('pull')
  expect(effectivePushPull(ex('a', 'shoulders', [], { library_id: 'reverse_pec_deck' }), movementOf)).toBe('pull')
  expect(effectivePushPull(ex('a', 'arms', [], { name: 'Tricep Pushdown' }), movementOf)).toBe('push')
  expect(effectivePushPull(ex('a', 'back', [], { name: 'Hyperextension' }), movementOf)).toBe('neither')
  // The library beats the chest default.
  expect(effectivePushPull(ex('a', 'chest', [], { name: 'Face Pull' }), movementOf)).toBe('pull')
  // A custom chest exercise is push; other custom upper-body ones are unset.
  expect(effectivePushPull(ex('a', 'chest', [], { name: 'My Chest Thing' }), movementOf)).toBe('push')
  expect(effectivePushPull(ex('a', 'shoulders', [], { name: 'My Shoulder Thing' }), movementOf)).toBeNull()
  expect(needsPushPull(ex('a', 'shoulders', [], { name: 'My Shoulder Thing' }), movementOf)).toBe(true)
  // Lower body and no group never need one; a set value never does.
  expect(needsPushPull(ex('a', 'legs', [], { name: 'My Leg Thing' }), movementOf)).toBe(false)
  expect(needsPushPull(ex('a', null, [], { name: 'Mystery' }), movementOf)).toBe(false)
  expect(needsPushPull(ex('a', 'arms', [], { name: 'Mystery', push_pull: 'neither' }), movementOf)).toBe(false)
})

test('balance: push vs pull is one set per set, no also-works half credit', () => {
  // Bench works chest and also shoulders: one push set, not one and a half.
  const bench = ex('bench', 'chest', ['shoulders', 'arms'], { name: 'Barbell Bench Press' })
  expect(sideCredit(bench, 'push', movementOf)).toBe(1)
  expect(sideCredit(bench, 'upper', movementOf)).toBe(1)
  // An "also works" back muscle doesn't make a chest exercise half a pull set.
  expect(sideCredit(ex('fly', 'chest', ['back'], { name: 'Odd Fly' }), 'pull', movementOf)).toBe(0)
  // A face pull is shoulders work but a pull set.
  expect(sideCredit(ex('fp', 'shoulders', [], { name: 'Face Pull' }), 'pull', movementOf)).toBe(1)
  expect(sideCredit(ex('fp', 'shoulders', [], { name: 'Face Pull' }), 'push', movementOf)).toBe(0)
  // A stored value on a lower-body exercise is ignored.
  expect(sideCredit(ex('sq', 'legs', [], { name: 'My Squat', push_pull: 'push' }), 'push', movementOf)).toBe(0)
  // Upper vs lower keeps the half credit: a deadlift is a full upper set and half a lower one.
  const deadlift = ex('dl', 'back', ['glutes', 'legs'], { name: 'My Deadlift', push_pull: 'pull' })
  expect(sideCredit(deadlift, 'lower', movementOf)).toBe(0.5)
  expect(balanceCounts(sets('dl', 4), [deadlift], movementOf, NOW)).toEqual({ push: 0, pull: 4, upper: 4, lower: 2 })
})

test('balance: unset exercises are left out and counted for the warning', () => {
  const press = ex('press', 'shoulders', [], { name: 'My Press' })
  const curl = ex('curl', 'arms', [], { name: 'Dumbbell Curl' })
  const legs = ex('legs', 'legs', [], { name: 'My Leg Thing' })
  const old = ex('old', 'back', [], { name: 'My Old Row' })
  const rows = [...sets('press', 3), ...sets('curl', 4), ...sets('legs', 5), ...sets('old', 2, 40)]
  const all = [press, curl, legs, old]
  expect(balanceCounts(rows, all, movementOf, NOW)).toEqual({ push: 0, pull: 4, upper: 7, lower: 5 })
  // The unset press counts; legs never do; old sets are outside the window.
  expect([...uncountedExerciseIds(rows, all, movementOf, NOW)]).toEqual(['press'])
  // Setting it moves its sets into push and clears it.
  const pressSet = { ...press, push_pull: 'push' as const }
  expect(balanceCounts(rows, [pressSet, curl, legs, old], movementOf, NOW).push).toBe(3)
  expect(uncountedExerciseIds(rows, [pressSet, curl, legs, old], movementOf, NOW).size).toBe(0)
  expect(uncountedLine(1)).toBe("1 exercise isn't counted.")
  expect(uncountedLine(3)).toBe("3 exercises aren't counted.")
})

test('balance: the fix-up list takes template and recent exercises that are unset', () => {
  const all = [
    ex('z', 'shoulders', [], { name: 'Zed Raise' }),
    ex('a', 'back', [], { name: 'Alpha Row' }),
    ex('t', 'arms', [], { name: 'Template Arms' }),
    ex('old', 'back', [], { name: 'Old Pull' }),
    ex('done', 'back', [], { name: 'Done Pull', push_pull: 'pull' }),
    ex('lib', 'back', [], { name: 'Face Pull' }),
    ex('leg', 'legs', [], { name: 'Leg Thing' }),
  ]
  const rows = [...sets('z', 1), ...sets('a', 1), ...sets('old', 1, 40), ...sets('done', 1), ...sets('lib', 1), ...sets('leg', 1)]
  expect(pushPullToSet(all, rows, ['t'], movementOf, NOW).map((e) => e.id)).toEqual(['a', 't', 'z'])
})

test('balance: only the last 28 days count', () => {
  const rows = [...sets('bench', 3, 1), ...sets('bench', 5, 27), ...sets('bench', 7, 29)]
  expect(balanceCounts(rows, [ex('bench', 'chest')], movementOf, NOW).push).toBe(8)
})

test('balance: a side over 1.5x the other gets the nudge', () => {
  const counts = { push: 12, pull: 8, upper: 20, lower: 9 }
  // 12 is exactly 1.5x 8, so no call; 20 is past 1.5x 9.
  const [pushPull, upperLower] = balancePairs(counts)
  expect(pushPull).toMatchObject({ a: 'push', b: 'pull', aSets: 12, bSets: 8, behind: null })
  expect(upperLower).toMatchObject({ a: 'upper', b: 'lower', aSets: 20, bSets: 9, behind: 'lower' })
  expect(balancePair({ ...counts, pull: 7 }, 'push', 'pull').behind).toBe('pull')
  expect(balancePair({ ...counts, push: 4, pull: 10 }, 'push', 'pull').behind).toBe('push')
  // Nothing on the other side still counts as behind.
  expect(balancePair({ ...counts, push: 6, pull: 0 }, 'push', 'pull').behind).toBe('pull')
})

test('balance: a gap under 6 sets is too small to call', () => {
  expect(balancePair({ push: 5, pull: 1, upper: 0, lower: 0 }, 'push', 'pull').behind).toBeNull()
  expect(balancePair({ push: 0, pull: 0, upper: 0, lower: 0 }, 'push', 'pull').behind).toBeNull()
})
