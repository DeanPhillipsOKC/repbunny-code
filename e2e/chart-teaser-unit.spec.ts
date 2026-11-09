import { test, expect } from '@playwright/test'
import { buildFinishRecap, type PriorSet, type RecapSessionSet } from '../src/lib/finishRecap'
import type { LoadType } from '../src/lib/types'

// Issue #115: which lift the finish recap's one-time Premium chart teaser
// picks. Same "no separate unit-test runner" reasoning as
// finish-recap-e1rm-unit.spec.ts: these never touch `page`.

const TODAY = '2026-10-06T12:00:00Z'

function sessionSet(exerciseId: string, name: string, loadType: LoadType = 'weight', reps = 8, weight = 100): RecapSessionSet {
  return {
    exercise_id: exerciseId,
    reps,
    weight,
    weight_unit: 'lb',
    level: null,
    duration_seconds: loadType === 'timed' ? 60 : null,
    distance: null,
    distance_unit: null,
    calories: null,
    exercises: { name, load_type: loadType },
  }
}

// One set in each of `count` earlier workouts, a week apart.
function priorWorkouts(exerciseId: string, count: number, weight = 90): PriorSet[] {
  return Array.from({ length: count }, (_, i) => ({
    ...sessionSet(exerciseId, '', 'weight', 8, weight + i * 5),
    workout_id: `${exerciseId}-w${i}`,
    performed_at: new Date(Date.parse(TODAY) - (count - i) * 7 * 86_400_000).toISOString(),
  }))
}

function teaser(sets: RecapSessionSet[], priorSets: PriorSet[]) {
  return buildFinishRecap({
    workout: { id: 'today', performed_at: TODAY, templateName: null, sets },
    finishedAt: new Date(Date.parse(TODAY) + 3_600_000),
    priorSets,
    templateSessions: [],
    weekWorkouts: [],
    weekWorkoutCount: 0,
    bodyWeightEntries: [],
    preferredUnit: 'lb',
  }).chartTeaser
}

test('chart teaser: a weight lift in its 5th workout, with its est. 1RM per workout oldest first', () => {
  const result = teaser([sessionSet('bench', 'Bench')], priorWorkouts('bench', 4))
  expect(result).toEqual({
    exerciseId: 'bench',
    exerciseName: 'Bench',
    workoutCount: 5,
    // Epley at 8 reps: weight * (1 + 8/30), rounded.
    e1rm: [114, 120, 127, 133, 127],
  })
})

test('chart teaser: the 4th workout, a non-weight lift, or no est. 1RM points give nothing', () => {
  expect(teaser([sessionSet('bench', 'Bench')], priorWorkouts('bench', 3))).toBeNull()
  expect(teaser([sessionSet('plank', 'Plank', 'timed', 0, 0)], priorWorkouts('plank', 6))).toBeNull()
  // 15-rep sets aren't est. 1RM eligible, so there's no line to draw.
  const highRep = priorWorkouts('curl', 4).map((s) => ({ ...s, reps: 15 }))
  expect(teaser([sessionSet('curl', 'Curl', 'weight', 15, 30)], highRep)).toBeNull()
})

test('chart teaser: of several eligible lifts, the one with the most sets today wins', () => {
  const sets = [sessionSet('bench', 'Bench'), sessionSet('row', 'Row'), sessionSet('row', 'Row'), sessionSet('squat', 'Squat'), sessionSet('squat', 'Squat')]
  const prior = [...priorWorkouts('bench', 6), ...priorWorkouts('row', 4), ...priorWorkouts('squat', 4)]
  // Row and Squat tie on two sets; Row was logged first.
  expect(teaser(sets, prior)?.exerciseName).toBe('Row')
})
