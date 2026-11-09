import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  STRENGTH_GROUPS,
  STRENGTH_LIFTS,
  STRENGTH_TIERS,
  bestOneRepMaxes,
  convertsOneSided,
  isOneSidedName,
  liftForExercise,
  overallStrength,
  rateLift,
  strengthLift,
  type StrengthLift,
} from '../src/lib/strengthLevels'
import type { LoadType } from '../src/lib/types'

// Issue #136's rating math against rows of the bundled table. Same "no
// separate unit-test runner" reasoning as plateau-unit.spec.ts.

const lift = (id: string) => strengthLift(id)!

test('every lift has five rising marks per sex, a known group, and real library ids', () => {
  const library = JSON.parse(readFileSync('src/data/exercise-library.json', 'utf8')) as { id: string }[]
  const ids = new Set(library.map((e) => e.id))
  const groups = new Set(STRENGTH_GROUPS.map((g) => g.id))
  const seen = new Set<string>()
  for (const l of STRENGTH_LIFTS) {
    expect(groups.has(l.group), l.id).toBe(true)
    for (const sex of ['male', 'female'] as const) {
      const marks = l.standards[sex]
      expect(marks, `${l.id} ${sex}`).toHaveLength(STRENGTH_TIERS.length)
      for (let i = 1; i < marks.length; i++) expect(marks[i], `${l.id} ${sex}`).toBeGreaterThan(marks[i - 1])
    }
    for (const id of l.libraryIds) {
      expect(ids.has(id), `${l.id}: ${id}`).toBe(true)
      expect(seen.has(id), `${id} counts as two lifts`).toBe(false)
      seen.add(id)
    }
  }
})

test('a lift exactly on a mark is that tier, with the gap to the next one', () => {
  // Male squat: Intermediate starts at 1.5x, Advanced at 2.0x.
  const r = rateLift(lift('squat'), 300, 200, 'lb', 'male')
  expect(STRENGTH_TIERS[r.tier]).toBe('Intermediate')
  expect(r.position).toBe(2)
  expect(r.next).toEqual({ tier: 'Advanced', weightToGo: 100 })
})

test('between marks: position interpolates and the gap rounds up to a 5 lb or 2.5 kg step', () => {
  // Male bench: 1.1667x sits between Intermediate (1.0) and Advanced (1.35).
  const r = rateLift(lift('bench'), 233.33, 200, 'lb', 'male')
  expect(STRENGTH_TIERS[r.tier]).toBe('Intermediate')
  expect(r.position).toBeCloseTo(2 + (233.33 / 200 - 1) / 0.35, 5)
  expect(r.next).toEqual({ tier: 'Advanced', weightToGo: 40 })

  // Female overhead press, kg: 0.3x is Novice, Intermediate at 0.45x of 60 kg = 27 kg.
  const kg = rateLift(lift('ohp'), 20, 60, 'kg', 'female')
  expect(STRENGTH_TIERS[kg.tier]).toBe('Novice')
  expect(kg.next).toEqual({ tier: 'Intermediate', weightToGo: 7.5 })

  // Dumbbell marks are per dumbbell: a 70 lb dumbbell bench at 200 lb is 0.35x, Novice.
  expect(STRENGTH_TIERS[rateLift(lift('db_bench'), 70, 200, 'lb', 'male').tier]).toBe('Novice')
})

test('below Beginner reads as Beginner with Novice next; past Elite caps at the top', () => {
  const low = rateLift(lift('deadlift'), 100, 200, 'lb', 'male')
  expect(low.tier).toBe(0)
  expect(low.position).toBe(0)
  expect(low.next).toEqual({ tier: 'Novice', weightToGo: 200 })

  const top = rateLift(lift('deadlift'), 600, 200, 'lb', 'male')
  expect(STRENGTH_TIERS[top.tier]).toBe('Elite')
  expect(top.position).toBe(4)
  expect(top.next).toBeNull()
})

test('the same lift rates by the table for the chosen sex', () => {
  expect(STRENGTH_TIERS[rateLift(lift('squat'), 300, 200, 'lb', 'female').tier]).toBe('Advanced')
})

test('overall averages the best lift in each movement group as a level and a 0 to 100 score', () => {
  const ratings = [
    rateLift(lift('squat'), 300, 200, 'lb', 'male'),
    rateLift(lift('bench'), 233.33, 200, 'lb', 'male'),
    rateLift(lift('deadlift'), 600, 200, 'lb', 'male'),
  ]
  expect(overallStrength(ratings)).toEqual({ tier: 'Intermediate', score: 71, groups: 3 })
  // A weaker second press doesn't pull the press group down.
  const withIncline = [...ratings, rateLift(lift('incline_bench'), 80, 200, 'lb', 'male')]
  expect(overallStrength(withIncline)).toEqual({ tier: 'Intermediate', score: 71, groups: 3 })
  expect(overallStrength([])).toBeNull()
  expect(overallStrength([rateLift(lift('row'), 400, 200, 'lb', 'male')])).toEqual({ tier: 'Elite', score: 100, groups: 1 })
})

test('exercises count by library id or a matching name, with weight and bodyweight kept apart', () => {
  const match = (name: string) => (name === 'Back Squat' ? 'barbell_back_squat' : name === 'Assisted pull-up' ? 'assisted_pull_up' : null)
  const of = (library_id: string | null, name: string, load_type: LoadType) => liftForExercise({ library_id, name, load_type }, match)?.id ?? null
  expect(of('sumo_deadlift', 'x', 'weight')).toBe('deadlift')
  expect(of(null, 'Back Squat', 'weight')).toBe('squat')
  expect(of('leg_press', 'x', 'weight')).toBe('leg_press')
  expect(of('pull_up', 'x', 'bodyweight')).toBe('pull_up')
  expect(of(null, 'Assisted pull-up', 'assisted')).toBe('pull_up')
  // A weight lift logged as bodyweight (or the reverse) isn't rated.
  expect(of('barbell_row', 'x', 'level')).toBeNull()
  expect(of('pull_up', 'x', 'weight')).toBeNull()
  expect(of('barbell_bench_press', 'x', 'bodyweight')).toBeNull()
  expect(of('lateral_raise_machine', 'x', 'weight')).toBeNull()
})

test('best est. 1RM per lift: Epley on 1 to 12 reps, converted, with body weight for bodyweight lifts', () => {
  const at = '2026-09-01T12:00:00Z'
  const map: Record<string, { lift: StrengthLift; loadType: LoadType }> = {
    b: { lift: lift('bench'), loadType: 'weight' },
    p: { lift: lift('pull_up'), loadType: 'bodyweight' },
    a: { lift: lift('pull_up'), loadType: 'assisted' },
    d: { lift: lift('dip'), loadType: 'bodyweight' },
  }
  const best = bestOneRepMaxes(
    [
      { exercise_id: 'b', reps: 5, weight: 100, weight_unit: 'kg', performed_at: at },
      { exercise_id: 'b', reps: 1, weight: 200, weight_unit: 'lb', performed_at: at },
      { exercise_id: 'b', reps: 20, weight: 150, weight_unit: 'kg', performed_at: at },
      // 200 lb body weight, 8 bodyweight pull-ups; an assisted set at 50 lb assist is lower.
      { exercise_id: 'p', reps: 8, weight: 0, weight_unit: 'lb', performed_at: at },
      { exercise_id: 'a', reps: 10, weight: 50, weight_unit: 'lb', performed_at: at },
      // Dips with 25 lb added.
      { exercise_id: 'd', reps: 1, weight: 25, weight_unit: 'lb', performed_at: at },
      { exercise_id: 'x', reps: 1, weight: 999, weight_unit: 'lb', performed_at: at },
    ],
    (id) => map[id] ?? null,
    () => 200,
    'lb',
  )
  expect(best.get('bench')?.oneRepMax).toBeCloseTo(100 * (1 + 5 / 30) * 2.20462, 3)
  expect(best.get('pull_up')?.oneRepMax).toBeCloseTo(200 * (1 + 8 / 30), 5)
  expect(best.get('dip')).toEqual({ oneRepMax: 225, oneSided: false })
  expect([...best.keys()].sort()).toEqual(['bench', 'dip', 'pull_up'])

  // No weigh-in: bodyweight lifts are skipped, weight lifts still count.
  const none = bestOneRepMaxes([{ exercise_id: 'p', reps: 5, weight: 0, weight_unit: 'lb', performed_at: at }], (id) => map[id] ?? null, () => null, 'lb')
  expect(none.size).toBe(0)
})

test('one-sided machine sets rate as the two-sided lift, divided by the 55% share', () => {
  const match = (name: string) =>
    ({ 'leg press': 'leg_press', 'chest press': 'chest_press_machine', 'romanian deadlift': 'romanian_deadlift', 'single arm row': 'dumbbell_row' })[
      name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    ] ?? null
  const of = (name: string, library_id: string | null = null) => liftForExercise({ library_id, name, load_type: 'weight' }, match)
  expect(isOneSidedName('Single Leg Press')).toBe(true)
  expect(isOneSidedName('One-Arm Chest Press')).toBe(true)
  expect(isOneSidedName('1 leg press')).toBe(true)
  expect(isOneSidedName('Leg Press')).toBe(false)

  // Matched through the name without the one-side words, or a link.
  const legPress = of('Single Leg Press')!
  expect(legPress.id).toBe('leg_press')
  expect(convertsOneSided({ name: 'Single Leg Press' }, legPress)).toBe(true)
  expect(of('Single-Leg Press', 'leg_press')?.id).toBe('leg_press')
  expect(of('One-Arm Chest Press')?.id).toBe('chest_press')
  // A two-sided name never converts.
  expect(convertsOneSided({ name: 'Leg Press' }, legPress)).toBe(false)
  // Balance-limited one-sided lifts aren't rated against two-sided marks.
  expect(of('Single Leg Romanian Deadlift')).toBeNull()
  // Dumbbell lifts are per hand already: rated, but not converted.
  const dbRow = of('Single Arm Row')!
  expect(dbRow.id).toBe('db_row')
  expect(convertsOneSided({ name: 'Single Arm Row' }, dbRow)).toBe(false)

  // 1 x 275 on one leg is a 500 two-leg estimate: 2.5x at 200 lb, Novice (2.0 to 2.75).
  const best = bestOneRepMaxes(
    [{ exercise_id: 'sl', reps: 1, weight: 275, weight_unit: 'lb', performed_at: '2026-09-01T12:00:00Z' }],
    () => ({ lift: legPress, loadType: 'weight', oneSided: true }),
    () => 200,
    'lb',
  )
  expect(best.get('leg_press')?.oneRepMax).toBeCloseTo(500, 6)
  expect(best.get('leg_press')?.oneSided).toBe(true)
  const r = rateLift(legPress, 500, 200, 'lb', 'male', true)
  expect(STRENGTH_TIERS[r.tier]).toBe('Novice')
  expect(r.oneSided).toBe(true)
  // Intermediate at 2.75x is 550 two-leg: 50 more, or 27.5 on one leg, rounded up to 30.
  expect(r.next).toEqual({ tier: 'Intermediate', weightToGo: 30 })
})