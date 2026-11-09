import { test, expect } from '@playwright/test'
import {
  buildWorkoutEvents,
  eventsForExercise,
  parseWorkoutEvents,
  remapWorkoutEvents,
  storyLines,
  type WorkoutEvent,
} from '../src/lib/workoutEvents'

// Issue #158's workout stories. Pure, same "no separate unit-test runner"
// reasoning as progress-series-unit.spec.ts.

const NAMES: Record<string, string> = {
  squat: 'Back Squat',
  press: 'Leg Press',
  hack: 'Hack Squat',
  calf: 'Calf Raise',
  rdl: 'Romanian Deadlift',
}
const KNOWN = Object.entries(NAMES).map(([id, name]) => ({ id, name }))
const nameOf = (id: string) => NAMES[id]

function counts(logged: Record<string, number>) {
  return (id: string) => logged[id] ?? 0
}

test('a plain workout has no story', () => {
  const events = buildWorkoutEvents({
    plan: [
      { exerciseId: 'squat', targetSets: 3 },
      { exerciseId: 'rdl', targetSets: null },
    ],
    swaps: {},
    loggedCount: counts({ squat: 3, rdl: 1 }),
    nameOf,
  })
  expect(events).toBeNull()
})

test('a swap, a skip, and an early finish each tell their part', () => {
  const events = buildWorkoutEvents({
    // Leg Press was swapped for Hack Squat, so the plan already shows Hack Squat.
    plan: [
      { exerciseId: 'squat', targetSets: 4 },
      { exerciseId: 'hack', targetSets: 2 },
      { exerciseId: 'calf', targetSets: 3 },
      { exerciseId: 'rdl', targetSets: 3 },
    ],
    swaps: { press: { to: 'hack', targetSets: 2 } },
    loggedCount: counts({ squat: 2, hack: 2, rdl: 2 }),
    nameOf,
  })!
  expect(events).toEqual([
    { type: 'swap', from: { id: 'press', name: 'Leg Press' }, to: { id: 'hack', name: 'Hack Squat' }, sets: 2 },
    { type: 'skip', exercise: { id: 'calf', name: 'Calf Raise' } },
    {
      type: 'unfinished',
      sets: 3,
      exercises: [
        { id: 'squat', name: 'Back Squat', left: 2 },
        { id: 'rdl', name: 'Romanian Deadlift', left: 1 },
      ],
    },
  ])
  expect(storyLines(events, KNOWN)).toEqual([
    'Leg Press was taken, so you did Hack Squat (2 sets).',
    'Skipped Calf Raise.',
    'Finished with 3 planned sets left.',
  ])
})

test('singular sets, and a swap with no planned count', () => {
  const events: WorkoutEvent[] = [
    { type: 'swap', from: { id: 'press', name: 'Leg Press' }, to: { id: 'hack', name: 'Hack Squat' }, sets: 1 },
    { type: 'swap', from: { id: 'calf', name: 'Calf Raise' }, to: { id: 'rdl', name: 'Romanian Deadlift' }, sets: null },
    { type: 'unfinished', sets: 1, exercises: [{ id: 'squat', name: 'Back Squat', left: 1 }] },
  ]
  expect(storyLines(events, KNOWN)).toEqual([
    'Leg Press was taken, so you did Hack Squat (1 set).',
    'Calf Raise was taken, so you did Romanian Deadlift.',
    'Finished with 1 planned set left.',
  ])
})

test('the story uses today\'s name, or the saved one when the exercise is gone', () => {
  const events: WorkoutEvent[] = [{ type: 'skip', exercise: { id: 'calf', name: 'Calf Raise' } }]
  expect(storyLines(events, [{ id: 'calf', name: 'Standing Calf Raise' }])).toEqual(['Skipped Standing Calf Raise.'])
  expect(storyLines(events, [])).toEqual(['Skipped Calf Raise.'])
})

test('an exercise chart only gets its own part of the story', () => {
  const events = buildWorkoutEvents({
    plan: [
      { exerciseId: 'squat', targetSets: 4 },
      { exerciseId: 'hack', targetSets: 2 },
      { exerciseId: 'calf', targetSets: 3 },
    ],
    swaps: { press: { to: 'hack', targetSets: 2 } },
    loggedCount: counts({ squat: 2, hack: 2 }),
    nameOf,
  })!
  const story = (id: string) => storyLines(eventsForExercise(events, { id, name: NAMES[id] }, KNOWN), KNOWN)
  expect(story('hack')).toEqual(['Leg Press was taken, so you did Hack Squat (2 sets).'])
  expect(story('press')).toEqual(['Leg Press was taken, so you did Hack Squat (2 sets).'])
  expect(story('squat')).toEqual(['Finished with 2 planned sets left.'])
  expect(story('calf')).toEqual(['Skipped Calf Raise.'])
  expect(story('rdl')).toEqual([])
})

test('after a restore gives new ids, events match by name', () => {
  const events: WorkoutEvent[] = [{ type: 'skip', exercise: { id: 'old-calf', name: 'Calf Raise' } }]
  const known = [{ id: 'new-calf', name: 'calf raise' }]
  expect(eventsForExercise(events, known[0], known)).toHaveLength(1)
  // An id that still exists never matches by name.
  const both = [...known, { id: 'old-calf', name: 'Seated Calf' }]
  expect(eventsForExercise(events, both[0], both)).toHaveLength(0)
})

test('remapping points events at the new ids', () => {
  const events: WorkoutEvent[] = [
    { type: 'swap', from: { id: 'press', name: 'Leg Press' }, to: { id: 'hack', name: 'Hack Squat' }, sets: 2 },
    { type: 'unfinished', sets: 1, exercises: [{ id: 'squat', name: 'Back Squat', left: 1 }] },
  ]
  const ids = new Map([['press', 'p2'], ['hack', 'h2'], ['squat', 's2']])
  const remapped = remapWorkoutEvents(JSON.stringify(events), ids)!
  expect(remapped[0]).toMatchObject({ from: { id: 'p2' }, to: { id: 'h2' } })
  expect(remapped[1]).toMatchObject({ exercises: [{ id: 's2', left: 1 }] })
  expect(remapWorkoutEvents(null, ids)).toBeNull()
})

test('junk events are dropped', () => {
  expect(parseWorkoutEvents('not json')).toEqual([])
  expect(parseWorkoutEvents({ type: 'skip' })).toEqual([])
  expect(parseWorkoutEvents([{ type: 'skip', exercise: { id: 'a' } }, { type: 'nope' }, { type: 'skip', exercise: { id: 'a', name: 'A' } }])).toEqual([
    { type: 'skip', exercise: { id: 'a', name: 'A' } },
  ])
})
