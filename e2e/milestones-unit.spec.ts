import { test, expect } from '@playwright/test'
import {
  countedWorkouts,
  importedTierIds,
  introMessage,
  milestoneCounts,
  newlyReached,
  nextUnlock,
  nextUnlockText,
  reachedTierIds,
  recordSetCount,
  strongWeekCount,
  tierById,
  tierHeadline,
  tierRewardLabel,
  TIERS,
  trackProgress,
  type MilestoneSetRow,
} from '../src/lib/milestones'
import { existsSync } from 'node:fs'
import { EXTRA_SOUND_VALUES, REWARDS, rewardsOf } from '../src/lib/extras'
import { TRIAL_PASS_TIERS } from '../src/lib/trialPass'
import type { LoadType } from '../src/lib/types'

// Issue #153's milestone math, same "no separate unit-test runner" reasoning
// as progress-series-unit.spec.ts: these never touch `page`.

const weightOnly = (): LoadType => 'weight'

let nextId = 0
// `sets` sets of one exercise in one workout, weights in the order given.
function workout(at: string, weights: number[], exerciseId = 'bench', workoutId = `w${nextId++}`): MilestoneSetRow[] {
  return weights.map((weight, i) => ({
    exercise_id: exerciseId,
    workout_id: workoutId,
    performed_at: at,
    set_index: i,
    reps: 5,
    weight,
    weight_unit: 'lb',
    level: null,
  }))
}

// Local-time ISO strings, so day and week boundaries are the test machine's own.
function localAt(y: number, m: number, d: number, h = 12): string {
  return new Date(y, m - 1, d, h).toISOString()
}

test('a workout counts only with 3 or more sets', () => {
  const rows = [...workout(localAt(2026, 10, 1), [100, 100]), ...workout(localAt(2026, 10, 2), [100, 100, 100])]
  expect(countedWorkouts(rows)).toHaveLength(1)
  expect(milestoneCounts(rows, weightOnly).workouts).toBe(1)
})

test('at most 2 workouts a calendar day count', () => {
  const rows = [
    ...workout(localAt(2026, 10, 1, 7), [1, 1, 1]),
    ...workout(localAt(2026, 10, 1, 12), [1, 1, 1]),
    ...workout(localAt(2026, 10, 1, 18), [1, 1, 1]),
    ...workout(localAt(2026, 10, 2, 7), [1, 1, 1]),
  ]
  const counted = countedWorkouts(rows)
  expect(counted).toHaveLength(3)
  // The earliest two of the day are the ones that count.
  expect(counted.map((w) => new Date(w.performedAt).getHours())).toEqual([7, 12, 7])
})

test('strong weeks add up without having to be in a row', () => {
  // Week of Sep 6 (2 workouts), Sep 13 (1), Sep 20 (none), Sep 27 (2).
  const workouts = [
    { performedAt: localAt(2026, 9, 7) },
    { performedAt: localAt(2026, 9, 9) },
    { performedAt: localAt(2026, 9, 14) },
    { performedAt: localAt(2026, 9, 28) },
    { performedAt: localAt(2026, 10, 3) },
  ]
  expect(strongWeekCount(workouts)).toBe(2)
})

test('records count sets that beat the best before them, never the first set', () => {
  const rows = [
    // First session: 100 is the baseline, 110 beats it, 105 doesn't.
    ...workout(localAt(2026, 9, 1), [100, 110, 105]),
    // Second session: 110 ties (not a record), 120 beats.
    ...workout(localAt(2026, 9, 3), [110, 120, 90]),
  ]
  expect(recordSetCount(rows, weightOnly)).toBe(2)
})

test('records follow set order within a workout, not row order', () => {
  const rows = workout(localAt(2026, 9, 1), [100, 110, 120]).reverse()
  expect(recordSetCount(rows, weightOnly)).toBe(2)
})

test('timed sets never count as records', () => {
  const rows = workout(localAt(2026, 9, 1), [0, 0, 0], 'run').map((s, i) => ({ ...s, reps: null, level: null, weight: i }))
  expect(recordSetCount(rows, () => 'timed')).toBe(0)
})

test('level exercises use the level rule', () => {
  const rows = workout(localAt(2026, 9, 1), [0, 0, 0], 'bike').map((s, i) => ({ ...s, level: [5, 6, 6][i] }))
  expect(recordSetCount(rows, () => 'level')).toBe(1)
})

test('tiers reached match the counts', () => {
  expect(reachedTierIds({ workouts: 25, records: 9, strongWeeks: 4 })).toEqual([
    'workouts-1',
    'workouts-5',
    'workouts-10',
    'workouts-25',
    'records-1',
    'strongWeeks-4',
  ])
  expect(reachedTierIds({ workouts: 0, records: 0, strongWeeks: 0 })).toEqual([])
})

test('only tiers not seen yet are new', () => {
  const seen = new Set(['workouts-1', 'workouts-5'])
  expect(newlyReached({ workouts: 10, records: 0, strongWeeks: 0 }, seen).map((t) => t.id)).toEqual(['workouts-10'])
})

test('deleting workouts lowers progress but never re-locks a seen tier', () => {
  const seen = new Set(['workouts-1', 'workouts-5', 'workouts-10'])
  const [workouts] = trackProgress({ workouts: 8, records: 0, strongWeeks: 0 }, seen)
  expect(workouts.count).toBe(8)
  expect(workouts.tiers.find((t) => t.id === 'workouts-10')?.unlocked).toBe(true)
  expect(workouts.next?.id).toBe('workouts-25')
  // Nothing new to announce when the count climbs back past 10.
  expect(newlyReached({ workouts: 10, records: 0, strongWeeks: 0 }, seen)).toEqual([])
})

test('every track ends with no next tier once all are unlocked', () => {
  const all = new Set(TIERS.map((t) => t.id))
  for (const t of trackProgress({ workouts: 0, records: 0, strongWeeks: 0 }, all)) expect(t.next).toBeNull()
})

test('headlines and the one-time history note read naturally', () => {
  expect(tierHeadline(TIERS.find((t) => t.id === 'workouts-1')!)).toBe('First workout!')
  expect(tierHeadline(TIERS.find((t) => t.id === 'workouts-25')!)).toBe('25 workouts!')
  expect(tierHeadline(TIERS.find((t) => t.id === 'strongWeeks-4')!)).toBe('4 strong weeks!')
  // #154: once tiers carry rewards, the note counts the rewards (workouts-10's
  // is its chime, #184).
  expect(introMessage(31, ['workouts-1', 'workouts-5', 'workouts-10', 'workouts-25', 'records-1', 'strongWeeks-4'])).toBe(
    'Your 31 workouts already unlocked 6 rewards.',
  )
  expect(introMessage(1, ['workouts-1'])).toBe('Your 1 workout already unlocked 1 reward.')
  // Tiers without a reward still read as milestones.
  expect(introMessage(160, ['workouts-150', 'workouts-500'])).toBe('Your 160 workouts already reached 2 milestones.')
  // #190: Extras are Premium, so for a free user they aren't rewards.
  expect(introMessage(31, ['workouts-1', 'workouts-5'], 0, false)).toBe('Your 31 workouts already reached 2 milestones.')
})

test('every Extras reward sits on its own tier; only chimes share a trial-pass tier', () => {
  const tiers = REWARDS.map((r) => r.tier)
  expect(new Set(tiers).size).toBe(tiers.length)
  for (const tier of tiers) expect(tierById(tier), tier).toBeTruthy()
  // #184: three pass tiers also carry a rest chime; workouts-150 keeps only its pass.
  const onPassTiers = REWARDS.filter((r) => TRIAL_PASS_TIERS.includes(r.tier))
  expect(onPassTiers.map((r) => r.tier).sort()).toEqual(['strongWeeks-12', 'workouts-10', 'workouts-50'])
  for (const r of onPassTiers) expect(r.kind).toBe('chime')
  expect(tierById('workouts-150')!.reward).toBeUndefined()
  // #190: Premium earns the Extra; free users never see one named.
  expect(tierRewardLabel(tierById('workouts-1')!, true)).toBe('Stars week mark')
  expect(tierRewardLabel(tierById('records-1')!, true)).toBe('Air horn record fanfare')
  expect(tierRewardLabel(tierById('workouts-1')!, false)).toBeNull()
})

test('every Extras sound is a clip in public/sounds, and old sound picks fall back', () => {
  expect([...EXTRA_SOUND_VALUES].sort()).toEqual(['air-horn', 'bike-bell', 'boing', 'boxing-bell', 'cheer', 'tada-horns', 'whistle'])
  for (const value of EXTRA_SOUND_VALUES) expect(existsSync(`public/sounds/${value}.mp3`), value).toBe(true)
  for (const removed of ['bells', 'marimba']) expect(rewardsOf('chime').some((r) => r.value === removed)).toBe(false)
  for (const removed of ['tada', 'trumpets']) expect(rewardsOf('fanfare').some((r) => r.value === removed)).toBe(false)
})

// Issue #188: the recap's next-unlock line.
test('the next unlock shows only within 3 workouts or records, or 1 strong week', () => {
  const seen = new Set(['workouts-1', 'records-1'])
  const close = nextUnlock({ workouts: 2, records: 2, strongWeeks: 0 }, seen, true)!
  expect(close.tier.id).toBe('workouts-5')
  expect(nextUnlockText(close)).toBe('3 workouts to your next unlock: Hearts confetti')
  // 4 workouts, 8 records, and 4 strong weeks away: nothing is close.
  expect(nextUnlock({ workouts: 1, records: 2, strongWeeks: 0 }, seen, true)).toBeNull()
  // 2 strong weeks away is not close; 1 is, and reads singular.
  expect(nextUnlock({ workouts: 5, records: 2, strongWeeks: 2 }, new Set(), true)).toBeNull()
  const week = nextUnlock({ workouts: 5, records: 2, strongWeeks: 3 }, new Set(), true)!
  expect(nextUnlockText(week)).toBe('1 strong week to your next unlock: Punny bunny personality')
})

test('the single nearest unlock across tracks wins, and a tie goes to workouts', () => {
  const nearer = nextUnlock({ workouts: 3, records: 9, strongWeeks: 0 }, new Set(), true)!
  expect(nextUnlockText(nearer)).toBe('1 record to your next unlock: Stars confetti')
  const tie = nextUnlock({ workouts: 4, records: 9, strongWeeks: 0 }, new Set(), true)!
  expect(tie.tier.id).toBe('workouts-5')
  expect(nextUnlockText(tie)).toBe('1 workout to your next unlock: Hearts confetti')
  // records-10 and strongWeeks-4 are both 1 away: records comes first.
  expect(nextUnlock({ workouts: 0, records: 9, strongWeeks: 3 }, new Set(['workouts-1']), true)!.tier.id).toBe('records-10')
})

test('the next unlock skips tiers that unlock nothing for this user', () => {
  // workouts-10 carries a chime and a trial pass (#184). #190: Premium is
  // told about the chime, a free user about the pass, never both.
  expect(nextUnlockText(nextUnlock({ workouts: 8, records: 2, strongWeeks: 0 }, new Set(), true)!)).toBe(
    '2 workouts to your next unlock: Cartoon boing rest chime',
  )
  expect(nextUnlockText(nextUnlock({ workouts: 8, records: 2, strongWeeks: 0 }, new Set(), false)!)).toBe(
    '2 workouts to your next unlock: a 7-day Premium trial',
  )
  // workouts-150 has only a pass. For Premium it unlocks nothing, so the next
  // is workouts-200: not close.
  expect(nextUnlockText(nextUnlock({ workouts: 148, records: 2, strongWeeks: 0 }, new Set(), false)!)).toBe(
    '2 workouts to your next unlock: a 7-day Premium trial',
  )
  expect(nextUnlock({ workouts: 148, records: 2, strongWeeks: 0 }, new Set(), true)).toBeNull()
  // A tier this device already showed stays unlocked, even below its count.
  expect(nextUnlock({ workouts: 8, records: 2, strongWeeks: 0 }, new Set(['workouts-10']), false)).toBeNull()
  // Free users earn no Extras, so Extra-only tiers are never their next unlock.
  expect(nextUnlock({ workouts: 4, records: 9, strongWeeks: 3 }, new Set(), false)).toBeNull()
  expect(nextUnlockText(nextUnlock({ workouts: 4, records: 9, strongWeeks: 3 }, new Set(), true)!)).toBe(
    '1 workout to your next unlock: Hearts confetti',
  )
})

test('tiers crossed by imported workouts are tagged, and the first RepBunny one is not', () => {
  const imported = (rows: MilestoneSetRow[]) => rows.map((r) => ({ ...r, imported: true }))
  const rows = [
    ...imported(workout(localAt(2026, 9, 1), [100, 100, 100])),
    ...imported(workout(localAt(2026, 9, 2), [100, 100, 100])),
    ...imported(workout(localAt(2026, 9, 3), [100, 100, 100])),
    ...imported(workout(localAt(2026, 9, 4), [100, 100, 100])),
    ...imported(workout(localAt(2026, 9, 5), [100, 100, 100])),
    // In RepBunny: the 6th workout beats the imported best, a first record.
    ...workout(localAt(2026, 10, 1), [110, 100, 100]),
  ]
  const tagged = importedTierIds(rows, weightOnly)
  // One strong week (all five in one week) is below the first strong-weeks tier.
  expect([...tagged].sort()).toEqual(['workouts-1', 'workouts-5'])
  expect(tagged.has('records-1')).toBe(false)
  // No imported rows, nothing tagged.
  expect(importedTierIds(workout(localAt(2026, 10, 1), [1, 1, 1]), weightOnly).size).toBe(0)
})
