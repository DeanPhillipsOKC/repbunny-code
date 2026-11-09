import { test, expect } from '@playwright/test'
import { DEFAULT_PROGRESSION } from '../src/lib/repRecords'
import {
  buildSetTargets,
  buildSmartTarget,
  formatTarget,
  rpeBand,
  type LighterWeekDecision,
  type SetTarget,
  type StallInput,
} from '../src/lib/smartTarget'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from '../src/lib/exerciseHistory'

// Issue #140: Premium's RPE-aware Next time target, same "no separate
// unit-test runner" reasoning as rep-records-unit.spec.ts.

let nextId = 0
function set(weight: number, reps: number, rpe: number | null = null, weight_unit: 'lb' | 'kg' = 'lb'): ExerciseHistorySet {
  return {
    id: `s${nextId++}`,
    reps,
    weight,
    weight_unit,
    rpe,
    level: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    incline: null,
    calories: null,
  }
}

function levelSet(level: number, reps: number, rpe: number | null = null): ExerciseHistorySet {
  return { ...set(0, reps, rpe), level }
}

// Noon UTC so the short date reads the same in any test-runner time zone.
function workout(day: string, sets: ExerciseHistorySet[]): ExerciseHistoryWorkout {
  return { workoutId: `w${nextId++}`, performedAt: `${day}T12:00:00Z`, sets }
}

const smart = (workouts: ExerciseHistoryWorkout[], stall: StallInput = {}) =>
  buildSmartTarget(workouts, 'weight', 'lb', DEFAULT_PROGRESSION, stall)

test('rpeBand: 7 or less is easy, 7.5 to 9 normal, 9.5 to 10 hard', () => {
  expect(rpeBand(null)).toBe('none')
  expect(rpeBand(6)).toBe('easy')
  expect(rpeBand(7)).toBe('easy')
  expect(rpeBand(7.5)).toBe('normal')
  expect(rpeBand(9)).toBe('normal')
  expect(rpeBand(9.5)).toBe('hard')
  expect(rpeBand(10)).toBe('hard')
})

test('buildSmartTarget: no RPE falls back to the usual double progression', () => {
  const t = smart([workout('2026-09-27', [set(180, 9), set(180, 8)])])!
  expect(t).toMatchObject({ band: 'none', weight: 180, reps: 10, goUp: false, best: 9, e1rm: 234, percent: 77 })
  expect(t.summary).toBe("Beat your 9 from Sep 27. Hit 12 and it's time to go up to 185.")
  expect(t.why).toEqual([
    'Last time 180 lb × 9.',
    "No RPE logged, so this is the usual step. Beat your 9 from Sep 27. Hit 12 and it's time to go up to 185.",
    'Est. 1RM 234, so 180 × 10 is about 77% of it.',
  ])
})

test('buildSmartTarget: RPE 7.5 to 9 takes the normal step and shows the math', () => {
  const t = smart([workout('2026-09-27', [set(180, 12, 8)])])!
  expect(t).toMatchObject({ band: 'normal', weight: 185, reps: 8, goUp: true, best: 0, e1rm: 252, percent: 73 })
  expect(formatTarget(t)).toBe('185 lb × 8')
  expect(t.why).toEqual([
    'Last time 180 lb × 12 at RPE 8.',
    'RPE 8 is a solid working set, so this is the usual step. You hit 12 at 180 lb on Sep 27. First time at 185, so aim for 8.',
    'Est. 1RM 252, so 185 × 8 is about 73% of it.',
  ])
})

test('buildSmartTarget: RPE 7 or less adds 2 reps, or jumps 2 steps', () => {
  // Normal would be 180 x 10; easy aims for 11.
  const reps = smart([workout('2026-09-27', [set(180, 9, 7)])])!
  expect(reps).toMatchObject({ band: 'easy', weight: 180, reps: 11, goUp: false })
  expect(reps.summary).toBe('RPE 7 left reps in the tank, so aim for 2 more reps instead of 1.')

  // Normal would go up to 185; easy goes to 190.
  const jump = smart([workout('2026-09-27', [set(180, 12, 6.5)])])!
  expect(jump).toMatchObject({ band: 'easy', weight: 190, reps: 8, goUp: true, best: 0 })
  expect(jump.summary).toBe('RPE 6.5 left reps in the tank, so this jumps 2 steps to 190 lb.')

  // 2 more reps would pass the top of the range, so go up now.
  const over = smart([workout('2026-09-27', [set(180, 11, 7)])])!
  expect(over).toMatchObject({ band: 'easy', weight: 185, reps: 8, goUp: true })
  expect(over.summary).toBe('RPE 7 left reps in the tank, so go up to 185 lb now.')
})

test('buildSmartTarget: RPE 9.5 or more holds the weight for 1 more rep, until the top of the range', () => {
  const t = smart([workout('2026-09-27', [set(180, 10, 10)])])!
  expect(t).toMatchObject({ band: 'hard', weight: 180, reps: 11, goUp: false, best: 10 })
  expect(t.why).toEqual([
    'Last time 180 lb × 10 at RPE 10.',
    'RPE 10 was close to your limit, so hold the weight and aim for 1 more rep.',
    'Est. 1RM 240, so 180 × 11 is about 75% of it.',
  ])
  expect(smart([workout('2026-09-27', [set(180, 8, 9.5)])])).toMatchObject({ band: 'hard', weight: 180, reps: 9 })

  // At the top of the range, even RPE 10 goes up, so every-set-to-failure
  // logging still progresses.
  const top = smart([workout('2026-09-27', [set(180, 12, 10)])])!
  expect(top).toMatchObject({ band: 'hard', weight: 185, reps: 8, goUp: true })
  expect(top.summary).toBe('RPE 10 was close to your limit, but you hit the top of the 8 to 12 range, so go up to 185 lb.')
})

test('buildSmartTarget: reads the RPE of the last session\'s top set only', () => {
  const t = smart([
    // Newest first, like the store. The top set is 185 x 10 at RPE 9.5.
    workout('2026-09-27', [set(185, 10, 9.5), set(175, 12, 6)]),
    workout('2026-09-20', [set(185, 9, 6)]),
  ])!
  expect(t.last).toEqual({ weight: 185, reps: 10, rpe: 9.5 })
  expect(t).toMatchObject({ band: 'hard', weight: 185, reps: 11 })
})

test('buildSmartTarget: kg history targets in kg', () => {
  const t = buildSmartTarget([workout('2026-09-24', [set(57.5, 12, 8, 'kg')])], 'weight', 'kg', DEFAULT_PROGRESSION)!
  expect(t).toMatchObject({ unit: 'kg', weight: 60, reps: 8 })
  expect(formatTarget(t)).toBe('60 kg × 8')
})

test('buildSmartTarget: machine levels step by one level, with no 1RM line', () => {
  const easy = buildSmartTarget([workout('2026-09-27', [levelSet(6, 12, 7)])], 'level', 'lb', DEFAULT_PROGRESSION)!
  expect(easy).toMatchObject({ kind: 'level', unit: null, weight: 8, reps: 8, goUp: true, e1rm: null, percent: null })
  expect(formatTarget(easy)).toBe('level 8 × 8')
  expect(easy.why).toEqual([
    'Last time level 6 × 12 at RPE 7.',
    'RPE 7 left reps in the tank, so this jumps 2 steps to level 8.',
  ])

  const none = buildSmartTarget([workout('2026-09-27', [levelSet(6, 10)])], 'level', 'lb', DEFAULT_PROGRESSION)!
  expect(none).toMatchObject({ weight: 6, reps: 11 })
})

// Issue #141: 180 x 12 sets up 185 x 8; then 185 x 6 misses it, and the two
// after miss 185 x 7. Newest first, like the store.
const stalled = () => [
  workout('2026-09-27', [set(185, 6)]),
  workout('2026-09-20', [set(185, 6)]),
  workout('2026-09-13', [set(185, 6)]),
  workout('2026-09-06', [set(180, 12)]),
]

function decided(accepted: boolean, after = '2026-09-27T12:00:00Z'): LighterWeekDecision {
  return { accepted, after, kind: 'weight', unit: 'lb', weight: 185, reps: 7, lighter: 165 }
}

test('buildSmartTarget: one miss changes nothing, two hold the weight for one more rep', () => {
  const one = smart(stalled().slice(2))!
  expect(one).toMatchObject({ stall: 'none', misses: 1, weight: 185, reps: 7, lighter: null })

  const two = smart(stalled().slice(1))!
  expect(two).toMatchObject({ stall: 'hold', misses: 2, weight: 185, reps: 7, goUp: false, lighter: null })
  expect(two.summary).toBe('Same weight, try for one more rep.')
  expect(two.why).toContain('You missed the target 2 sessions in a row, so hold 185 lb and try for 1 more rep.')
})

test('buildSmartTarget: hitting the target, or going heavier in the range, ends the streak', () => {
  const hit = smart([workout('2026-09-27', [set(185, 7)]), ...stalled().slice(1)])!
  expect(hit).toMatchObject({ stall: 'none', misses: 0 })
  const heavier = smart([workout('2026-09-27', [set(190, 8)]), ...stalled().slice(1)])!
  expect(heavier).toMatchObject({ stall: 'none', misses: 0 })
})

test('buildSmartTarget: three misses offer a lighter week about 10% off', () => {
  const t = smart(stalled())!
  expect(t).toMatchObject({ stall: 'offer', misses: 3, weight: 185, reps: 7, lighter: { weight: 165, reps: 7 } })
  expect(t.anchor).toBe('2026-09-27T12:00:00Z')
  expect(t.summary).toBe('Same weight, try for one more rep.')
  expect(t.why).toContain(
    "You've missed the target 3 sessions in a row, so a lighter week could help: 165 lb × 7, about 10% off for one session, then build back.",
  )
})

test('buildSmartTarget: a flat lift offers a lighter week without any misses', () => {
  const t = smart([workout('2026-09-27', [set(180, 9)])], { flatSince: '2026-09-01T12:00:00Z' })!
  expect(t).toMatchObject({ stall: 'offer', misses: 0, weight: 180, reps: 10, lighter: { weight: 160, reps: 10 } })
  expect(t.summary).toBe("Beat your 9 from Sep 27. Hit 12 and it's time to go up to 185.")
  expect(t.why).toContain(
    'This lift has been flat since Sep 1, so a lighter week could help: 160 lb × 10, about 10% off for one session, then build back.',
  )
})

test('buildSmartTarget: dismissing keeps the normal target until another session', () => {
  const t = smart(stalled(), { decision: decided(false) })!
  expect(t).toMatchObject({ stall: 'hold', weight: 185, reps: 7, lighter: null })
  // Another miss after dismissing offers it again.
  const again = smart([workout('2026-10-04', [set(185, 6)]), ...stalled()], { decision: decided(false) })!
  expect(again).toMatchObject({ stall: 'offer', lighter: { weight: 165, reps: 7 } })
})

test('buildSmartTarget: an accepted lighter week, then back to the weight before it, then normal', () => {
  const lighter = smart(stalled(), { decision: decided(true) })!
  expect(lighter).toMatchObject({ stall: 'lighter', weight: 165, reps: 7, lighter: { weight: 165, reps: 7 } })
  expect(formatTarget(lighter)).toBe('165 lb × 7')
  expect(lighter.summary).toBe('Lighter week: about 10% off for one session, then build back.')
  expect(lighter.why).toContain("Next time it's back to 185 lb × 7.")

  const deloaded = [workout('2026-10-04', [set(165, 7)]), ...stalled()]
  const back = smart(deloaded, { decision: decided(true) })!
  expect(back).toMatchObject({ stall: 'return', weight: 185, reps: 7 })
  expect(back.summary).toBe('Lighter week done, so back to 185 lb.')

  // Hitting 185 x 7 after it: the usual step, and the old misses are gone.
  const normal = smart([workout('2026-10-11', [set(185, 7)]), ...deloaded], {
    decision: decided(true),
    flatSince: '2026-09-06T12:00:00Z',
  })!
  expect(normal).toMatchObject({ stall: 'none', misses: 0, weight: 185, reps: 8, lighter: null })
})

test('buildSmartTarget: a choice made in the other unit is ignored', () => {
  const t = smart(stalled(), { decision: { ...decided(true), unit: 'kg' } })!
  expect(t.stall).toBe('offer')
})

// Issue #160: a target for each open row.
const lastBench = () => [workout('2026-09-27', [set(180, 12, 8), set(180, 11, 9), set(180, 10, 9.5)])]
const perSet = (history: ExerciseHistoryWorkout[], loggedCount: number, open: number) =>
  buildSetTargets(smart(history)!, history, loggedCount, open, DEFAULT_PROGRESSION)
const short = (targets: SetTarget[]) => targets.map((t) => formatTarget(t))

test('buildSetTargets: before any set, each row works from the same set last time', () => {
  const targets = perSet(lastBench(), 0, 3)
  // Set 1 is the session target; set 2 (RPE 9) adds a rep; set 3 (RPE 9.5) holds for 1 more.
  expect(short(targets)).toEqual(['185 lb × 8', '180 lb × 12', '180 lb × 11'])
  expect(targets[0].why[0]).toBe('Last time 180 lb × 12 at RPE 8.')
  expect(targets[1].why).toEqual(['Set 2 last time: 180 lb × 11 at RPE 9.', 'RPE 9 is a solid working set, so aim for 1 more rep.'])
  expect(targets[2].why).toEqual([
    'Set 3 last time: 180 lb × 10 at RPE 9.5.',
    'RPE 9.5 was close to your limit, so hold the weight and aim for 1 more rep.',
  ])
  expect(targets.every((t) => t.label === 'Target')).toBe(true)
})

test('buildSetTargets: per-position easy, top-of-range, and missing sets', () => {
  const history = [workout('2026-09-27', [set(180, 9, 8), set(180, 8, 6), set(180, 12, 10)])]
  const targets = perSet(history, 0, 4)
  expect(short(targets).slice(1)).toEqual(['180 lb × 10', '185 lb × 8', '185 lb × 8'])
  expect(targets[1].why[1]).toBe('RPE 6 left reps in the tank, so aim for 2 more reps.')
  expect(targets[2].why[1]).toBe('RPE 10 was close to your limit, but you hit the top of the 8 to 12 range, so go up to 185 lb.')
  expect(targets[3].why).toEqual(['No set 4 last time, so this matches set 3.'])
})

test('buildSetTargets: logging today does not move the rest; each keeps its own set from last time', () => {
  // A drop pattern, like 170 / 160 / 150. Set 1 is logged (at any RPE), so
  // the open rows are sets 2 and 3, each from its own set last time.
  const history = [workout('2026-09-27', [set(170, 8, 9), set(160, 7, 9), set(150, 7, 9)])]
  const targets = perSet(history, 1, 2)
  expect(short(targets)).toEqual(['160 lb × 8', '150 lb × 8'])
  expect(targets[0].why[0]).toBe('Set 2 last time: 160 lb × 7 at RPE 9.')
  // Same answer as before set 1 went in.
  expect(short(perSet(history, 0, 3)).slice(1)).toEqual(short(targets))
})

test('buildSetTargets: a stall holds every row to the session target, before and after set 1', () => {
  const held = buildSetTargets(smart(stalled())!, stalled(), 0, 2, DEFAULT_PROGRESSION)
  expect(short(held)).toEqual(['185 lb × 7', '185 lb × 7'])
  expect(short(buildSetTargets(smart(stalled())!, stalled(), 1, 1, DEFAULT_PROGRESSION))).toEqual(['185 lb × 7'])

  const decision: LighterWeekDecision = { accepted: true, after: '2026-09-27T12:00:00Z', kind: 'weight', unit: 'lb', weight: 185, reps: 7, lighter: 165 }
  const lighter = buildSetTargets(smart(stalled(), { decision })!, stalled(), 1, 1, DEFAULT_PROGRESSION)[0]
  expect(lighter).toMatchObject({ weight: 165, reps: 7, label: 'Lighter week' })
})

test('buildSetTargets: machine levels step by one level', () => {
  const history = [workout('2026-09-27', [levelSet(6, 10, 8), levelSet(6, 9, 6)])]
  const base = buildSmartTarget(history, 'level', 'lb', DEFAULT_PROGRESSION)!
  expect(short(buildSetTargets(base, history, 0, 2, DEFAULT_PROGRESSION))).toEqual(['level 6 × 11', 'level 6 × 11'])
})

test('buildSmartTarget: no usable sets means no target', () => {
  expect(smart([])).toBeNull()
  expect(smart([workout('2026-09-27', [set(0, 12)])])).toBeNull()
})
