import { test, expect } from '@playwright/test'
import {
  addWeeks,
  availableMetrics,
  completeWeekAverage,
  completeWeekSum,
  countsForWeek,
  formatTime,
  formatVolume,
  muscleContributions,
  muscleWeekBars,
  volumeUnit,
  weeklyMuscleTotals,
  type MuscleExercise,
  type MuscleSetRow,
} from '../src/lib/muscleVolume'
import { startOfWeek } from '../src/lib/progressHub'
import type { LoadType, WeightUnit } from '../src/lib/types'

// Issue #50: per-muscle volume and time, same "no separate unit-test runner"
// reasoning as progress-series-unit.spec.ts: these never touch `page`.

const NOW = new Date(2026, 8, 30, 12)
const THIS_WEEK = startOfWeek(NOW)
const AT = new Date(2026, 8, 29, 18).toISOString()

function ex(id: string, load_type: LoadType, muscle_group: MuscleExercise['muscle_group'], also_works: MuscleExercise['also_works'] = []): MuscleExercise {
  return { id, name: id, load_type, muscle_group, also_works }
}

function row(exercise_id: string, reps: number | null, weight: number, weight_unit: WeightUnit = 'lb', duration_seconds: number | null = null, performed_at = AT): MuscleSetRow {
  return { exercise_id, performed_at, reps, weight, weight_unit, duration_seconds }
}

const EXERCISES = [
  ex('squat', 'weight', 'legs'),
  ex('rdl', 'weight', 'back', ['legs']),
  ex('split', 'bodyweight', 'legs'),
  ex('assisted', 'assisted', 'legs'),
  ex('press', 'level', 'legs'),
  ex('plank', 'timed', 'core'),
  ex('carry', 'timed', 'arms', ['core']),
]
const BODY = [{ weight: 150, weight_unit: 'lb' as const, recorded_at: new Date(2026, 8, 1).toISOString() }]

test('volume: main muscle gets full reps × weight, "also works" gets half', () => {
  const rows = [row('squat', 5, 200), row('rdl', 8, 100)]
  const legs = countsForWeek(weeklyMuscleTotals(rows, EXERCISES, 'volume', BODY), THIS_WEEK).legs
  expect(legs).toBe(1000 + 400)
  const back = countsForWeek(weeklyMuscleTotals(rows, EXERCISES, 'volume', BODY), THIS_WEEK).back
  expect(back).toBe(800)
})

test('volume: bodyweight and assisted use body weight; level and timed add none', () => {
  const rows = [row('split', 10, 0), row('assisted', 10, 50), row('press', 10, 7), row('plank', null, 0, 'lb', 60)]
  const counts = countsForWeek(weeklyMuscleTotals(rows, EXERCISES, 'volume', BODY), THIS_WEEK)
  expect(counts.legs).toBe(1500 + 1000)
  expect(counts.core).toBe(0)
  // No body weight on file: bodyweight/assisted are left out, not zeroed.
  expect(countsForWeek(weeklyMuscleTotals(rows, EXERCISES, 'volume', []), THIS_WEEK).legs).toBe(0)
})

test('volume: kg sets are summed in lb and shown in the most-used unit', () => {
  const rows = [row('squat', 5, 100, 'kg'), row('squat', 5, 100, 'kg'), row('squat', 5, 220.462, 'lb')]
  const lb = countsForWeek(weeklyMuscleTotals(rows, EXERCISES, 'volume', BODY), THIS_WEEK).legs
  expect(volumeUnit(rows, EXERCISES, 'legs', BODY)).toBe('kg')
  expect(formatVolume(lb, 'kg')).toBe('1,500')
  expect(formatVolume(lb, 'lb')).toBe('3,307')
  expect(volumeUnit([], EXERCISES, 'legs', BODY)).toBe('lb')
})

test('time: timed sets add their seconds, half for "also works"', () => {
  const rows = [row('plank', null, 0, 'lb', 60), row('plank', null, 0, 'lb', 45), row('carry', null, 0, 'lb', 90), row('squat', 5, 100)]
  const counts = countsForWeek(weeklyMuscleTotals(rows, EXERCISES, 'time', BODY), THIS_WEEK)
  expect(counts.core).toBe(105 + 45)
  expect(counts.arms).toBe(90)
  expect(counts.legs).toBe(0)
  expect(formatTime(counts.core)).toBe('2:30')
  expect(formatTime(3900)).toBe('1:05:00')
  expect(formatTime(22.5)).toBe('0:23')
})

test('sets still count every load type, 1 main and ½ also works', () => {
  const rows = [row('squat', 5, 100), row('press', 10, 7), row('rdl', 8, 100), row('plank', null, 0, 'lb', 60)]
  const counts = countsForWeek(weeklyMuscleTotals(rows, EXERCISES, 'sets'), THIS_WEEK)
  expect(counts.legs).toBe(2.5)
  expect(counts.core).toBe(1)
})

test('available metrics: only what the muscle has data for, across all history', () => {
  const old = new Date(2025, 0, 5).toISOString()
  const rows = [row('press', 10, 7), row('carry', null, 0, 'lb', 60, old), row('squat', 5, 100, 'lb', null, old)]
  expect(availableMetrics(rows, EXERCISES, 'legs', BODY)).toEqual(['sets', 'volume'])
  expect(availableMetrics(rows, EXERCISES, 'core', BODY)).toEqual(['sets', 'time'])
  expect(availableMetrics([row('press', 10, 7)], EXERCISES, 'legs', BODY)).toEqual(['sets'])
  expect(availableMetrics([row('split', 10, 0)], EXERCISES, 'legs', [])).toEqual(['sets'])
})

test('contributions follow the metric and flag body-weight exercises', () => {
  const rows = [row('squat', 5, 200), row('rdl', 8, 100), row('rdl', 8, 100), row('split', 10, 0), row('press', 10, 7)]
  const volume = muscleContributions(rows, EXERCISES, 'legs', THIS_WEEK, 'volume', BODY)
  expect(volume.map((c) => [c.name, c.credited, c.amount, c.usesBodyWeight])).toEqual([
    ['split', 1500, 1500, true],
    ['squat', 1000, 1000, false],
    ['rdl', 800, 1600, false],
  ])
  const sets = muscleContributions(rows, EXERCISES, 'legs', THIS_WEEK)
  expect(sets.map((c) => [c.name, c.credited])).toEqual([
    ['press', 1],
    ['rdl', 1],
    ['split', 1],
    ['squat', 1],
  ])
})

// Issue #582: each row lists the days it was done, and How? shows the
// average's total and the week count it divides by.
test('contributions list each day once, oldest first', () => {
  const monday = new Date(2026, 8, 28, 9).toISOString()
  const rows = [row('squat', 5, 200), row('squat', 5, 200, 'lb', null, monday), row('squat', 5, 200)]
  const [squat] = muscleContributions(rows, EXERCISES, 'legs', THIS_WEEK)
  expect(squat.days.map((d) => d.getTime())).toEqual([new Date(2026, 8, 28).getTime(), new Date(2026, 8, 29).getTime()])
})

test('the average is the complete weeks\' total over their count, empty weeks as 0', () => {
  const rows = [row('squat', 5, 200, 'lb', null, addWeeks(THIS_WEEK, -2).toISOString()), row('rdl', 5, 200, 'lb', null, addWeeks(THIS_WEEK, -1).toISOString()), row('squat', 5, 200)]
  const bars = muscleWeekBars(weeklyMuscleTotals(rows, EXERCISES, 'sets'), 'legs', '4W', null, NOW)
  expect(completeWeekSum(bars)).toEqual({ total: 1.5, weeks: 3 })
  expect(completeWeekAverage(bars)).toBe(0.5)
  expect(completeWeekSum(bars.filter((b) => b.current))).toEqual({ total: 0, weeks: 0 })
})
