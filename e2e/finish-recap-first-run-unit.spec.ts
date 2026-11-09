import { test, expect } from '@playwright/test'
import { buildFinishRecap, type RecapSessionSet, type RecapWorkoutSummary } from '../src/lib/finishRecap'
import type { LoadType } from '../src/lib/types'
import type { MuscleGroup } from '../src/lib/muscleGroups'

// Issue #274: the first-run wording and what counts as cardio. Pure
// functions, so these never touch `page`.

const TODAY = '2026-10-06T12:00:00Z'

function set(name: string, loadType: LoadType, muscleGroup: MuscleGroup): RecapSessionSet {
  return {
    exercise_id: name,
    reps: loadType === 'timed' ? null : 8,
    weight: 100,
    weight_unit: 'lb',
    level: null,
    duration_seconds: loadType === 'timed' ? 600 : null,
    distance: null,
    distance_unit: null,
    calories: null,
    exercises: { name, load_type: loadType, muscle_group: muscleGroup },
  } as RecapSessionSet
}

function recap(over: { hasEarlierWorkouts?: boolean; weekWorkouts?: RecapWorkoutSummary[] }) {
  const sets = [set('Bench', 'weight', 'chest')]
  return buildFinishRecap({
    workout: { id: 'today', performed_at: TODAY, templateName: 'Push Day', sets },
    finishedAt: new Date(Date.parse(TODAY) + 3_600_000),
    priorSets: [],
    templateSessions: [],
    weekWorkouts: over.weekWorkouts ?? [],
    weekWorkoutCount: 0,
    bodyWeightEntries: [],
    preferredUnit: 'lb',
    hasEarlierWorkouts: over.hasEarlierWorkouts,
  })
}

test('first-run recap: a routine\'s first run names the routine only when earlier workouts exist', () => {
  expect(recap({ hasEarlierWorkouts: true }).firstRunRoutine).toBe('Push Day')
  expect(recap({ hasEarlierWorkouts: false }).firstRunRoutine).toBeNull()
  expect(recap({}).firstTemplateRun).toBe(true)
})

function week(loadType: LoadType, muscleGroup: MuscleGroup, seconds: number): RecapWorkoutSummary[] {
  return [
    {
      id: 'w1',
      performed_at: TODAY,
      sets: [{ reps: null, weight: 0, weight_unit: 'lb', duration_seconds: seconds, exercises: { load_type: loadType, muscle_group: muscleGroup } }],
    },
  ]
}

test('week cardio: a 60s plank is not cardio, a 10 minute treadmill set is', () => {
  expect(recap({ weekWorkouts: week('timed', 'core', 60) }).week.cardioMinutes).toBe(0)
  expect(recap({ weekWorkouts: week('timed', 'cardio', 600) }).week.cardioMinutes).toBe(10)
})
