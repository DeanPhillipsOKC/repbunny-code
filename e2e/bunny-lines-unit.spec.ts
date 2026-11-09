import { test, expect } from '@playwright/test'
import {
  DIP_CHANCE,
  PERSONALITIES,
  compareSet,
  pickFresh,
  recapLineFor,
  restLineFor,
  sampleLines,
  type LineSet,
  type RecapFacts,
  type RestFacts,
} from '../src/lib/bunnyLines'
import { REWARDS, rewardsOf } from '../src/lib/extras'

// Issue #183: workout-aware bunny lines and personalities (src/lib/bunnyLines.ts).

const set = (reps: number | null, weight: number, extra: Partial<LineSet> = {}): LineSet => ({
  reps,
  weight,
  weight_unit: 'lb',
  level: null,
  rpe: null,
  ...extra,
})

const rest = (over: Partial<RestFacts> = {}): RestFacts => ({
  exerciseName: 'Leg Press',
  loadType: 'weight',
  set: set(10, 200),
  last: set(8, 200),
  lastSetName: null,
  dipShown: false,
  ...over,
})

const fixed = (value: number) => () => value
const ctx = (value = 0, recent: string[] = []) => ({ rand: fixed(value), recent })

test('compareSet states only comparisons the data supports', () => {
  expect(compareSet('weight', set(10, 200), set(8, 200))).toEqual({ kind: 'moreReps', n: 2 })
  expect(compareSet('weight', set(8, 210), set(8, 200))).toEqual({ kind: 'load', amount: '10 lb more' })
  expect(compareSet('weight', set(8, 202.5), set(8, 200))).toEqual({ kind: 'load', amount: '2.5 lb more' })
  expect(compareSet('weight', set(8, 200, { rpe: 7 }), set(8, 200, { rpe: 8 }))).toEqual({ kind: 'easier', rpe: 7, was: 8 })
  expect(compareSet('weight', set(8, 200), set(8, 200))).toEqual({ kind: 'matched' })
  expect(compareSet('weight', set(6, 200), set(8, 200))).toEqual({ kind: 'dip' })
  expect(compareSet('weight', set(8, 180), set(8, 200))).toEqual({ kind: 'dip' })
  // Heavier with fewer reps, or lighter with more, isn't apples to apples.
  expect(compareSet('weight', set(6, 220), set(8, 200))).toBeNull()
  expect(compareSet('weight', set(12, 180), set(8, 200))).toBeNull()
  // First-ever set, timed sets, and mixed units say nothing.
  expect(compareSet('weight', set(8, 200), null)).toBeNull()
  expect(compareSet('timed', set(null, 0, { }), set(null, 0))).toBeNull()
  expect(compareSet('weight', set(8, 100, { weight_unit: 'kg' }), set(8, 200))).toBeNull()
  // Assisted: more assistance is the dip, less is progress.
  expect(compareSet('assisted', set(8, 40), set(8, 50))).toEqual({ kind: 'load', amount: '10 lb less assist' })
  expect(compareSet('assisted', set(8, 60), set(8, 50))).toEqual({ kind: 'dip' })
  // Bodyweight with no added weight compares reps, whatever the unit.
  expect(compareSet('bodyweight', set(12, 0, { weight_unit: 'kg' }), set(10, 0))).toEqual({ kind: 'moreReps', n: 2 })
  expect(compareSet('bodyweight', set(10, 10), set(10, 0))).toEqual({ kind: 'load', amount: '10 lb more added weight' })
  // Level.
  expect(compareSet('level', set(10, 0, { level: 6 }), set(10, 0, { level: 5 }))).toEqual({ kind: 'levelUp', n: 1 })
  expect(compareSet('level', set(8, 0, { level: 5 }), set(10, 0, { level: 5 }))).toEqual({ kind: 'dip' })
})

test('the rest line states the fact in the picked voice', () => {
  expect(restLineFor(rest(), 'classic', ctx()).text).toBe('2 more reps than last time on Leg Press.')
  expect(restLineFor(rest(), 'punny', ctx()).text).toBe('2 more reps than last time. Hare-raising.')
  expect(restLineFor(rest(), 'coach', ctx()).text).toBe('2 more reps than last time. Same tempo next set.')
  expect(restLineFor(rest(), 'hype', ctx()).text).toBe('2 more reps than last time on Leg Press. Love that.')
  expect(restLineFor(rest({ set: set(8, 200, { rpe: 7 }), last: set(8, 200, { rpe: 8 }) }), 'classic', ctx()).text).toBe(
    'Same weight as last time, RPE 7, was 8.',
  )
  expect(restLineFor(rest({ set: set(8, 200), last: set(8, 200), lastSetName: 'Chest Press' }), 'classic', ctx()).text).toBe(
    "One more set of Chest Press. Then you're done.",
  )
})

test('with nothing notable, a plain line from the personality, never an invented comparison', () => {
  for (const personality of PERSONALITIES) {
    const first = restLineFor(rest({ last: null }), personality, ctx())
    expect(first.dip).toBe(false)
    expect(first.text).not.toMatch(/last time|than|RPE/)
    const timed = restLineFor(rest({ loadType: 'timed', set: set(null, 0), last: set(null, 0) }), personality, ctx())
    expect(timed.text).not.toMatch(/last time|than/)
  }
  expect(restLineFor(rest({ last: null }), 'classic', ctx()).text).toBe('Nice work. Take a breather.')
})

test('a dip gets a kind line on some draws, not all, and at most once per workout', () => {
  const dip = rest({ set: set(6, 200), last: set(8, 200) })
  // Shows: a draw under 1 in 3.
  const shown = restLineFor(dip, 'classic', ctx(0.1))
  expect(shown.dip).toBe(true)
  expect(shown.text).toBe('Off days happen. You still showed up.')
  // Skips: a draw at or over 1 in 3 gets the normal line, which doesn't
  // mention the dip.
  const skipped = restLineFor(dip, 'classic', ctx(DIP_CHANCE))
  expect(skipped.dip).toBe(false)
  expect(skipped.text).not.toMatch(/last time|lighter|off day/i)
  // Once per workout: after one showed, never again.
  const again = restLineFor({ ...dip, dipShown: true }, 'classic', ctx(0))
  expect(again.dip).toBe(false)
  // About 1 in 3 over many draws.
  let count = 0
  for (let i = 0; i < 300; i++) if (restLineFor(dip, 'hype', ctx(i / 300)).dip) count++
  expect(count).toBe(100)
})

test('dip lines never state a cause as fact; feel-tag lines only when that tag was logged', () => {
  const dip = rest({ set: set(6, 200), last: set(8, 200) })
  for (const personality of PERSONALITIES) {
    for (let i = 0; i < 20; i++) {
      const line = restLineFor(dip, personality, { rand: () => (i / 20) * DIP_CHANCE, recent: [] }).text
      expect(line).not.toMatch(/You logged/)
      expect(line).not.toMatch(/because|you didn't|you need/i)
    }
  }
  const tagged = restLineFor({ ...dip, feel: { sleep: 'under_6', energy: null, stress: null } }, 'classic', ctx(0))
  expect(tagged.text).toBe('You logged under 6 hours of sleep. Lighter days happen.')
  const untaggedSleep = restLineFor({ ...dip, feel: { sleep: '6_to_8', energy: null, stress: null } }, 'classic', ctx(0))
  expect(untaggedSleep.text).not.toMatch(/You logged/)
})

test('the same inputs never give the same line twice in a row', () => {
  const pool = ['a', 'b', 'c']
  expect(pickFresh(pool, { rand: fixed(0), recent: ['a'] })).toBe('b')
  expect(pickFresh(pool, { rand: fixed(0), recent: ['a', 'b'] })).toBe('c')
  // All shown lately: anything but the last one.
  expect(pickFresh(pool, { rand: fixed(0), recent: ['b', 'c', 'a'] })).toBe('b')
  expect(pickFresh(['only'], { rand: fixed(0), recent: ['only'] })).toBe('only')

  let recent: string[] = []
  let previous = ''
  for (let i = 0; i < 12; i++) {
    const text = restLineFor(rest(), 'punny', { rand: fixed(0), recent }).text
    expect(text).not.toBe(previous)
    previous = text
    recent = [...recent, text].slice(-8)
  }
})

const recap = (over: Partial<RecapFacts> = {}): RecapFacts => ({ records: [], upCount: 0, lighterCount: 0, weekWorkouts: 1, ...over })

test('the recap line talks about what happened', () => {
  const press = { exerciseName: 'Leg Press', detail: 'Heaviest set · was 200 lb' }
  expect(recapLineFor(recap({ records: [press, press, press, press] }), 'classic', ctx()).text).toBe('4 records today.')
  expect(recapLineFor(recap({ records: [press] }), 'classic', ctx()).text).toBe('Your heaviest Leg Press yet.')
  expect(recapLineFor(recap({ records: [{ exerciseName: 'Pull-up', detail: 'Least assist · was 50 lb' }] }), 'classic', ctx()).text).toBe(
    'Your least assisted Pull-up yet.',
  )
  expect(recapLineFor(recap({ upCount: 3 }), 'classic', ctx()).text).toBe('Up on 3 exercises from last time.')
  expect(recapLineFor(recap({ weekWorkouts: 3 }), 'classic', ctx()).text).toBe("That's your 3rd workout this week.")
  expect(recapLineFor(recap(), 'classic', ctx()).text).toBe('Nice work today.')
})

test('a lighter day sometimes gets a kind recap line, and names a logged tag', () => {
  const lighter = recap({ lighterCount: 2 })
  expect(recapLineFor(lighter, 'classic', ctx(0.1)).dip).toBe(true)
  expect(recapLineFor(lighter, 'classic', ctx(0.5)).dip).toBe(false)
  expect(recapLineFor({ ...lighter, feel: { sleep: null, energy: 'low', stress: null } }, 'classic', ctx(0.1)).text).toBe(
    'You logged low energy today. Showing up anyway is the hard part.',
  )
  // Not a dip day when anything went up.
  expect(recapLineFor({ ...lighter, upCount: 1 }, 'classic', ctx(0)).dip).toBe(false)
})

test('every line follows the brand rules: no em dashes', () => {
  const facts = [
    rest(),
    rest({ set: set(8, 210), last: set(8, 200) }),
    rest({ loadType: 'level', set: set(10, 0, { level: 6 }), last: set(10, 0, { level: 5 }) }),
    rest({ set: set(8, 200, { rpe: 7 }), last: set(8, 200, { rpe: 8 }) }),
    rest({ set: set(8, 200), last: set(8, 200) }),
    rest({ lastSetName: 'Row', last: null }),
    rest({ set: set(6, 200), last: set(8, 200) }),
    rest({ last: null }),
  ]
  for (const personality of PERSONALITIES) {
    for (const f of facts) {
      for (let i = 0; i < 10; i++) expect(restLineFor(f, personality, { rand: fixed(i / 10), recent: [] }).text).not.toMatch(/—|–/)
    }
    for (const line of sampleLines(personality)) expect(line).not.toMatch(/—|–/)
  }
})

test('personalities replace the line packs on the same tiers', () => {
  expect(rewardsOf('lines').map((r) => [r.id, r.value, r.name, r.tier])).toEqual([
    ['personality-punny', 'punny', 'Punny', 'strongWeeks-4'],
    ['personality-coach', 'coach', 'Coach', 'records-25'],
    ['personality-hype', 'hype', 'Hype', 'workouts-300'],
  ])
  expect(REWARDS.some((r) => r.id.startsWith('lines-'))).toBe(false)
})
