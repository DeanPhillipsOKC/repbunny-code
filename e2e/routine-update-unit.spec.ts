import { test, expect } from '@playwright/test'
import { routineChanges, routineChangeText } from '../src/lib/routineUpdate'

// Issue #263: what the finish recap's "Update <routine>?" card lists. Same
// "no separate unit-test runner" reasoning as assisted-load-type-unit.spec.ts:
// these never touch `page`.

const plan = [
  { id: 'te-bench', exercise_id: 'bench', position: 0, target_sets: 3 },
  { id: 'te-legs', exercise_id: 'legpress', position: 1, target_sets: 3 },
  { id: 'te-calf', exercise_id: 'calf', position: 2, target_sets: 2 },
  { id: 'te-open', exercise_id: 'plank', position: 3, target_sets: null },
]
const names: Record<string, string> = {
  bench: 'Bench press',
  legpress: 'Leg press',
  hack: 'Hack squat',
  calf: 'Calf raise',
  plank: 'Plank',
  fly: 'Cable fly',
  old: 'Old lift',
}
const nameOf = (id: string) => names[id] ?? id
const sets = (...ids: string[]) => ids.map((exercise_id) => ({ exercise_id }))
const notArchived = () => false

test('a workout done exactly as planned lists nothing', () => {
  const done = sets('bench', 'bench', 'bench', 'legpress', 'legpress', 'legpress', 'calf', 'calf', 'plank')
  expect(routineChanges(plan, done, {}, notArchived)).toEqual([])
})

test('more or fewer sets than planned, an addition, a swap, and a skip', () => {
  const done = sets('bench', 'bench', 'bench', 'bench', 'fly', 'hack', 'fly', 'hack', 'fly', 'hack', 'plank', 'plank', 'plank')
  const changes = routineChanges(plan, done, { hack: 'legpress' }, notArchived)
  expect(changes.map((c) => routineChangeText(c, nameOf))).toEqual([
    'Bench press: 3 → 4 sets',
    'Swap Leg press for Hack squat',
    'Remove Calf raise (skipped today)',
    'Add Cable fly (3 sets)',
  ])
  expect(changes.map((c) => c.defaultChecked)).toEqual([true, true, false, true])
  expect(changes[1]).toMatchObject({ kind: 'swap', templateExerciseId: 'te-legs', exerciseId: 'hack', toSets: 3 })
  expect(changes[3]).toMatchObject({ kind: 'add', exerciseId: 'fly', toSets: 3 })
})

test('a swap that got a different set count says so', () => {
  const done = sets('bench', 'bench', 'bench', 'hack', 'hack', 'calf', 'calf', 'plank')
  const [swap] = routineChanges(plan, done, { hack: 'legpress' }, notArchived)
  expect(routineChangeText(swap, nameOf)).toBe('Swap Leg press for Hack squat (2 sets)')
  expect(swap.toSets).toBe(2)
})

test('a swap-in for an exercise that also got sets is an addition', () => {
  const done = sets('bench', 'bench', 'bench', 'legpress', 'legpress', 'legpress', 'hack', 'calf', 'calf', 'plank')
  const changes = routineChanges(plan, done, { hack: 'legpress' }, notArchived)
  expect(changes.map((c) => routineChangeText(c, nameOf))).toEqual(['Add Hack squat (1 set)'])
})

test('archived exercises are never added, and a routine row with no target keeps none', () => {
  const done = sets('bench', 'bench', 'bench', 'legpress', 'legpress', 'legpress', 'calf', 'calf', 'old', 'old')
  const changes = routineChanges(plan, done, {}, (id) => id === 'old')
  expect(changes.map((c) => routineChangeText(c, nameOf))).toEqual(['Remove Plank (skipped today)'])
})
