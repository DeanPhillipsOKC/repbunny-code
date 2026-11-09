import { test, expect } from '@playwright/test'
import { buildWarmup, roundDownToLoadable, roundToLoadable } from '../src/lib/warmup'
import {
  BODY_WEIGHT_LABEL,
  TEST_SET_TEXT,
  bestEstimate,
  fromBodyWeight,
  pickRelatedLift,
  pickStartingWeight,
} from '../src/lib/startingWeight'
import { strengthLift } from '../src/lib/strengthLevels'

// Issue #142: the warm-up ladder and rounding, the related-lift pick, and
// the body-weight estimate. Same "no separate unit-test runner" reasoning as
// rep-records-unit.spec.ts.

const LB_BAR = { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] }
const KG_BAR = { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] }

const ladder = (sets: { weight: number; reps: number; bar: boolean }[]) => sets.map((s) => `${s.bar ? 'bar ' : ''}${s.weight}x${s.reps}`)

test('warm-up: a barbell ladder in lb rounds to the plates and starts with the bar', () => {
  // 40/60/80% of 185 = 74, 111, 148, to the nearest 5 from a 45 lb bar.
  expect(ladder(buildWarmup(185, 'barbell', 'lb', LB_BAR))).toEqual(['bar 45x10', '75x5', '110x3', '150x1'])
})

test('warm-up: a barbell ladder in kg rounds to 2.5 kg steps on a 20 kg bar', () => {
  // 40/60/80% of 100 kg = 40, 60, 80 exactly.
  expect(ladder(buildWarmup(100, 'barbell', 'kg', KG_BAR))).toEqual(['bar 20x10', '40x5', '60x3', '80x1'])
  // 82.5 kg: 33, 49.5, 66 round to 32.5, 50, 65.
  expect(ladder(buildWarmup(82.5, 'barbell', 'kg', KG_BAR))).toEqual(['bar 20x10', '32.5x5', '50x3', '65x1'])
})

test('warm-up: a light target skips lines at or below the bar, and the bar itself gets none', () => {
  // 40% of 75 is 30 (under the bar), 60% is 45 (the bar again), 80% is 60.
  expect(ladder(buildWarmup(75, 'barbell', 'lb', LB_BAR))).toEqual(['bar 45x10', '60x1'])
  expect(buildWarmup(45, 'barbell', 'lb', LB_BAR)).toEqual([])
})

test('warm-up: dumbbells round to 5 lb or 2.5 kg and have no bar line', () => {
  expect(ladder(buildWarmup(60, 'dumbbell', 'lb'))).toEqual(['25x10', '35x5', '50x2'])
  expect(ladder(buildWarmup(24, 'dumbbell', 'kg'))).toEqual(['10x10', '15x5', '20x2'])
  // Too light to step up to: 40% and 60% of 10 lb both round to 5.
  expect(ladder(buildWarmup(10, 'dumbbell', 'lb'))).toEqual(['5x10'])
})

test('rounding: nearest loadable weight, lighter on a tie; rounding down never goes under the bar', () => {
  expect(roundToLoadable(72.5, 'barbell', 'lb', LB_BAR)).toBe(70)
  expect(roundToLoadable(73, 'barbell', 'lb', LB_BAR)).toBe(75)
  expect(roundToLoadable(30, 'barbell', 'lb', LB_BAR)).toBe(45)
  // A gym whose smallest plate is 10 lb steps by 20.
  expect(roundToLoadable(100, 'barbell', 'lb', { bar: 45, plates: [45, 25, 10] })).toBe(105)
  expect(roundDownToLoadable(151.2, 'barbell', 'lb', LB_BAR)).toBe(150)
  expect(roundDownToLoadable(30, 'barbell', 'lb', LB_BAR)).toBe(45)
  expect(roundDownToLoadable(13.9, 'dumbbell', 'kg')).toBe(12.5)
  expect(roundDownToLoadable(1, null, 'lb')).toBe(5)
})

test('related lift: the lightest est. 1RM is the pick, and it starts at 60% rounded down', () => {
  const bench = { name: 'Bench Press', oneRepMax: 252 }
  const close = { name: 'Close-Grip Bench', oneRepMax: 200 }
  expect(pickRelatedLift([bench, close])).toEqual(close)
  expect(pickRelatedLift([])).toBeNull()

  const start = pickStartingWeight({
    related: [bench],
    lift: strengthLift('incline_bench'),
    sex: 'male',
    bodyWeight: { weight: 200, unit: 'lb' },
    unit: 'lb',
    equipment: 'barbell',
    load: LB_BAR,
  })
  expect(start.source).toBe('related')
  expect(start.weight).toBe(150)
  expect(start.reps).toBe(10)
  expect(start.note).toBe('From your Bench Press (est. 1RM 252 lb). Adjust after your first set.')
})

test('related lift: est. 1RM is the best Epley over 1 to 12 rep sets, in the asked unit', () => {
  const sets = [
    { reps: 12, weight: 180, weight_unit: 'lb' as const },
    { reps: 1, weight: 240, weight_unit: 'lb' as const },
    { reps: 20, weight: 200, weight_unit: 'lb' as const },
  ]
  expect(bestEstimate(sets, 'lb')).toBeCloseTo(252)
  expect(bestEstimate([{ reps: 5, weight: 100, weight_unit: 'kg' }], 'kg')).toBeCloseTo(116.67, 1)
  expect(bestEstimate([{ reps: null, weight: 100, weight_unit: 'lb' }], 'lb')).toBeNull()
})

test('body weight: Beginner mark times body weight, down to a 10 to 12 rep weight, for male and female', () => {
  const squat = strengthLift('squat')
  // Male 0.75 x 200 = 150, x 0.65 = 97.5, down to 95 on the bar.
  const male = fromBodyWeight(squat, 'male', { weight: 200, unit: 'lb' }, 'lb', 'barbell', LB_BAR)!
  expect(male.source).toBe('bodyweight')
  expect(male.weight).toBe(95)
  expect(male.reps).toBe(10)
  expect(male.note).toBe(BODY_WEIGHT_LABEL)
  // Female 0.5 x 150 = 75, x 0.65 = 48.75, down to 45 (the bar).
  expect(fromBodyWeight(squat, 'female', { weight: 150, unit: 'lb' }, 'lb', 'barbell', LB_BAR)!.weight).toBe(45)
  // A kg weigh-in for a kg lifter: female bench 0.25 x 60 = 15 x 0.65 = 9.75, under the 20 kg bar.
  expect(fromBodyWeight(strengthLift('bench'), 'female', { weight: 60, unit: 'kg' }, 'kg', 'barbell', KG_BAR)!.weight).toBe(20)
  // Dumbbells per hand: male DB bench 0.2 x 200 = 40 x 0.65 = 26, down to 25.
  expect(fromBodyWeight(strengthLift('db_bench'), 'male', { weight: 200, unit: 'lb' }, 'lb', 'dumbbell')!.weight).toBe(25)
})

test('body weight: a missing answer, weigh-in, or table entry falls through to a test set', () => {
  const squat = strengthLift('squat')
  const bw = { weight: 200, unit: 'lb' as const }
  expect(fromBodyWeight(squat, 'unspecified', bw, 'lb', 'barbell', LB_BAR)).toBeNull()
  expect(fromBodyWeight(squat, null, bw, 'lb', 'barbell', LB_BAR)).toBeNull()
  expect(fromBodyWeight(squat, 'male', null, 'lb', 'barbell', LB_BAR)).toBeNull()
  expect(fromBodyWeight(null, 'male', bw, 'lb', 'barbell', LB_BAR)).toBeNull()
  // Bodyweight lifts aren't weight lifts.
  expect(fromBodyWeight(strengthLift('pull_up'), 'male', bw, 'lb', null)).toBeNull()

  const start = pickStartingWeight({ related: [], lift: squat, sex: 'unspecified', bodyWeight: bw, unit: 'lb', equipment: 'barbell', load: LB_BAR })
  expect(start.source).toBe('test')
  expect(start.weight).toBeNull()
  expect(start.note).toBe(TEST_SET_TEXT)
})
