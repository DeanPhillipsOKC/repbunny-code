import { test, expect } from '@playwright/test'
import {
  buildCoachReport,
  customRange,
  e1rmChange,
  lastFourWeeks,
  lastThreeMonths,
  rangeLabel,
  reportFileName,
} from '../src/lib/coachReport'
import type { ProgressSetRow } from '../src/lib/progressHub'
import type { MuscleExercise } from '../src/lib/muscleVolume'

// Issue #152's report data builder (the PDF for a coach or physio), same "no
// separate unit-test runner" reasoning as assisted-load-type-unit.spec.ts:
// these never touch `page`.

const EXERCISES: MuscleExercise[] = [
  { id: 'bench', name: 'Bench Press', muscle_group: 'chest', also_works: ['arms'], load_type: 'weight' },
  { id: 'dip', name: 'Dip', muscle_group: 'arms', also_works: [], load_type: 'bodyweight' },
  { id: 'plank', name: 'Plank', muscle_group: 'core', also_works: [], load_type: 'timed' },
]

let n = 0
function set(workout: string, at: Date, exercise: string, reps: number | null, weight: number, duration: number | null = null): ProgressSetRow {
  n++
  return {
    id: `s${n}`,
    workout_id: workout,
    exercise_id: exercise,
    performed_at: at.toISOString(),
    template_name: null,
    set_index: n,
    reps,
    weight,
    weight_unit: 'lb',
    rpe: null,
    level: null,
    duration_seconds: duration,
    distance: null,
    distance_unit: null,
    incline: null,
    calories: null,
  }
}

const day = (month: number, date: number) => new Date(2026, month, date, 9)

const ROWS: ProgressSetRow[] = [
  set('w0', day(7, 25), 'bench', 5, 135), // before the range: the record baseline
  set('w1', day(8, 2), 'bench', 5, 145),
  set('w1', day(8, 2), 'bench', 5, 140),
  set('w1', day(8, 2), 'plank', null, 0, 60),
  set('w2', day(8, 9), 'bench', 8, 150),
  set('w2', day(8, 9), 'dip', 10, 0),
  set('w3', day(8, 16), 'bench', 5, 160),
  set('w3', day(8, 16), 'dip', 12, 0),
  set('w4', day(9, 2), 'bench', 5, 200), // after the range
]

const WEIGH_INS = [
  { weight: 190, weight_unit: 'lb' as const, recorded_at: day(7, 1).toISOString() },
  { weight: 180, weight_unit: 'lb' as const, recorded_at: day(8, 3).toISOString() },
  { weight: 177.5, weight_unit: 'lb' as const, recorded_at: day(8, 28).toISOString() },
]

const SEPTEMBER = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) }

test('coach report: totals, per-lift rows, muscles, body weight, and records for the range', () => {
  const r = buildCoachReport(ROWS, EXERCISES, WEIGH_INS, SEPTEMBER, 'lb')
  expect(r.days).toBe(30)
  expect(r.workouts).toBe(3)
  expect(r.sets).toBe(7)
  expect(r.perWeek).toBe(0.7)

  expect(r.lifts.map((l) => [l.name, l.sessions, l.sets, l.bestSet, l.e1rmStart, l.e1rmEnd])).toEqual([
    // Best set by est. 1RM: 8 × 150 (190) beats 5 × 160 (187). First session
    // 5 × 145 is 169, last session 5 × 160 is 187.
    ['Bench Press', 3, 4, '8 × 150 lb', 169, 187],
    ['Dip', 2, 2, '12 × BW', null, null],
    ['Plank', 1, 1, '1:00', null, null],
  ])
  expect(e1rmChange(r.lifts[0], 'lb')).toBe('+18 lb')
  expect(e1rmChange(r.lifts[1], 'lb')).toBe('')

  // Arms: two dip sets, plus half of four bench sets.
  expect(r.muscles).toEqual([
    { group: 'chest', sets: 4 },
    { group: 'arms', sets: 4 },
    { group: 'core', sets: 1 },
  ])

  // Only weigh-ins inside the range.
  expect(r.bodyWeight).toMatchObject({ start: 180, end: 177.5, entries: 2 })

  // Records replay all history, so the August set is the baseline; the plank
  // (timed) never counts, and the October set is outside the range.
  expect(r.records.map((x) => [x.name, x.set])).toEqual([
    ['Bench Press', '5 × 145 lb'],
    ['Bench Press', '8 × 150 lb'],
    ['Dip', '12 × BW'],
  ])
})

test('coach report: kg history converts to the preferred unit, and an empty range is empty', () => {
  const kg = [set('k1', day(8, 2), 'bench', 5, 100), set('k2', day(8, 20), 'bench', 5, 110)].map((s) => ({ ...s, weight_unit: 'kg' as const }))
  const r = buildCoachReport(kg, EXERCISES, [], SEPTEMBER, 'kg')
  expect(r.unit).toBe('kg')
  expect(r.lifts[0]).toMatchObject({ e1rmStart: 117, e1rmEnd: 128 })
  expect(e1rmChange(r.lifts[0], 'kg')).toBe('+11 kg')
  expect(r.bodyWeight).toBeNull()

  const empty = buildCoachReport(ROWS, EXERCISES, WEIGH_INS, { start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) })
  expect(empty).toMatchObject({ workouts: 0, sets: 0, perWeek: 0, lifts: [], muscles: [], bodyWeight: null, records: [] })
})

test('coach report: range presets, custom dates, labels, and the file name', () => {
  const now = new Date(2026, 9, 5, 15)
  const four = lastFourWeeks(now)
  expect(four.start).toEqual(new Date(2026, 8, 8))
  expect(four.end).toEqual(new Date(2026, 9, 6))
  expect(rangeLabel(four)).toBe('Sep 8, 2026 to Oct 5, 2026')
  expect(reportFileName(four)).toBe('repbunny-report-2026-09-08-to-2026-10-05.pdf')

  const three = lastThreeMonths(now)
  expect(three.start).toEqual(new Date(2026, 6, 6))
  expect(three.end).toEqual(new Date(2026, 9, 6))

  expect(customRange('2026-09-01', '2026-09-30')).toEqual(SEPTEMBER)
  expect(rangeLabel(customRange('2026-09-03', '2026-09-03')!)).toBe('Sep 3, 2026')
  expect(customRange('2026-09-30', '2026-09-01')).toBeNull()
  expect(customRange('', '2026-09-01')).toBeNull()
})

test('coach report: withSets keeps the sets behind each lift and the set each record beat', () => {
  const plain = buildCoachReport(ROWS, EXERCISES, WEIGH_INS, SEPTEMBER, 'lb')
  expect(plain.lifts[0].sources).toBeUndefined()
  expect(plain.records[0].beat).toBeUndefined()

  const r = buildCoachReport(ROWS, EXERCISES, WEIGH_INS, SEPTEMBER, 'lb', { withSets: true })
  const bench = r.lifts[0].sources!
  expect([bench.first.set, bench.first.e1rm]).toEqual(['5 × 145 lb', 169])
  expect([bench.last.set, bench.last.e1rm]).toEqual(['5 × 160 lb', 187])
  expect(r.lifts[1].sources!.first.set).toBe('10 × BW')
  expect(r.lifts[1].sources!.first.e1rm).toBeNull()

  // The first record beat the August baseline, the next beat that record.
  expect(r.records.map((x) => [x.set, x.beat?.set])).toEqual([
    ['5 × 145 lb', '5 × 135 lb'],
    ['8 × 150 lb', '5 × 145 lb'],
    ['12 × BW', '10 × BW'],
  ])
})
