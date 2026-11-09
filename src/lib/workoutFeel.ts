import type { BodyWeightEntryLike } from './bodyStats'
import { recordSets } from './milestones'
import type { ProgressSetRow } from './progressHub'
import { convertWeight, epley, isEpleyEligible } from './progressSeries'
import type { LoadType } from './types'

// Issue #149: "How did it feel?" tags on a finished workout (sleep, energy,
// stress), and the "What helps you lift" card that compares workouts by them.
// Tags are the user's record, so anyone can set them; the card is Premium.

export type SleepTag = 'under_6' | '6_to_8' | 'over_8'
export type LevelTag = 'low' | 'ok' | 'high'

export interface WorkoutFeel {
  sleep: SleepTag | null
  energy: LevelTag | null
  stress: LevelTag | null
}

export type FeelKey = keyof WorkoutFeel

export const EMPTY_FEEL: WorkoutFeel = { sleep: null, energy: null, stress: null }

export interface FeelDimension {
  key: FeelKey
  label: string
  options: { value: string; label: string; phrase: string }[]
}

// `phrase` finishes "You set more records ...".
export const FEEL_DIMENSIONS: FeelDimension[] = [
  {
    key: 'sleep',
    label: 'Sleep',
    options: [
      { value: 'under_6', label: 'Under 6 h', phrase: 'after under 6 hours of sleep' },
      { value: '6_to_8', label: '6 to 8 h', phrase: 'after 6 to 8 hours of sleep' },
      { value: 'over_8', label: 'Over 8 h', phrase: 'after over 8 hours of sleep' },
    ],
  },
  {
    key: 'energy',
    label: 'Energy',
    options: [
      { value: 'low', label: 'Low', phrase: 'when your energy was low' },
      { value: 'ok', label: 'OK', phrase: 'when your energy was OK' },
      { value: 'high', label: 'High', phrase: 'when your energy was high' },
    ],
  },
  {
    key: 'stress',
    label: 'Stress',
    options: [
      { value: 'low', label: 'Low', phrase: 'when stress was low' },
      { value: 'ok', label: 'OK', phrase: 'when stress was OK' },
      { value: 'high', label: 'High', phrase: 'when stress was high' },
    ],
  },
]

export function feelOf(row: Partial<Record<FeelKey, unknown>> | null | undefined): WorkoutFeel {
  const pick = (key: FeelKey) => {
    const value = row?.[key]
    const dimension = FEEL_DIMENSIONS.find((d) => d.key === key)!
    return dimension.options.some((o) => o.value === value) ? (value as string) : null
  }
  return { sleep: pick('sleep') as SleepTag | null, energy: pick('energy') as LevelTag | null, stress: pick('stress') as LevelTag | null }
}

export function isTagged(feel: WorkoutFeel): boolean {
  return feel.sleep !== null || feel.energy !== null || feel.stress !== null
}

// "Sleep 6 to 8 h · Energy high · Stress OK" for History.
export function feelSummary(feel: WorkoutFeel): string {
  return FEEL_DIMENSIONS.filter((d) => feel[d.key] !== null)
    .map((d) => {
      const label = optionLabel(d.key, feel[d.key]!)
      return `${d.label} ${label === 'OK' ? label : label.toLowerCase()}`
    })
    .join(' · ')
}

export function optionLabel(key: FeelKey, value: string): string {
  return FEEL_DIMENSIONS.find((d) => d.key === key)?.options.find((o) => o.value === value)?.label ?? value
}

function optionPhrase(key: FeelKey, value: string): string {
  return FEEL_DIMENSIONS.find((d) => d.key === key)?.options.find((o) => o.value === value)?.phrase ?? value
}

// --- What helps you lift -------------------------------------------------

// No card below this many tagged workouts, and no comparison between groups
// smaller than MIN_GROUP_WORKOUTS each: small samples make noise look like a
// pattern.
export const MIN_TAGGED_WORKOUTS = 10
export const MIN_GROUP_WORKOUTS = 3

// How big a difference has to be before it's worth saying.
export const MIN_RECORD_RATIO = 1.5
export const MIN_RECORD_GAP = 0.5 // records a workout
export const MIN_E1RM_GAP = 1.5 // percentage points a session
export const MIN_SETS_RATIO = 1.2
export const MIN_SETS_GAP = 2 // sets a workout

export interface FeelWorkoutRow extends Partial<Record<FeelKey, string | null>> {
  id: string
  performed_at: string
}

export interface WorkoutStats {
  records: number
  sets: number
  // Mean % change in each weight lift's best est. 1RM against that lift's
  // previous session; null when no lift in it had a previous session.
  e1rmChange: number | null
}

export type FeelMetric = 'records' | 'e1rm' | 'sets'

export interface FeelFinding {
  dimension: FeelKey
  metric: FeelMetric
  better: { value: string; average: number; workouts: number }
  worse: { value: string; average: number; workouts: number }
  text: string
  detail: string
}

export interface FeelInsights {
  tagged: number
  findings: FeelFinding[]
}

// Records, sets, and est. 1RM change for every workout in `rows`.
export function workoutStats(
  rows: ProgressSetRow[],
  loadTypeOf: (exerciseId: string) => LoadType,
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): Map<string, WorkoutStats> {
  const stats = new Map<string, WorkoutStats>()
  const entry = (id: string) => {
    let s = stats.get(id)
    if (!s) stats.set(id, (s = { records: 0, sets: 0, e1rmChange: null }))
    return s
  }
  for (const row of rows) entry(row.workout_id).sets++
  for (const record of recordSets(rows, loadTypeOf, bodyWeightEntries)) entry(record.workout_id).records++

  // Best est. 1RM per weight lift per workout, in pounds so units compare.
  const bests = new Map<string, Map<string, { performedAt: string; best: number }>>()
  for (const row of rows) {
    if (loadTypeOf(row.exercise_id) !== 'weight' || !isEpleyEligible(row)) continue
    const value = convertWeight(epley(row.weight, row.reps!), row.weight_unit, 'lb')
    let byWorkout = bests.get(row.exercise_id)
    if (!byWorkout) bests.set(row.exercise_id, (byWorkout = new Map()))
    const current = byWorkout.get(row.workout_id)
    if (!current || value > current.best) byWorkout.set(row.workout_id, { performedAt: row.performed_at, best: value })
  }
  const changes = new Map<string, number[]>()
  for (const byWorkout of bests.values()) {
    const sessions = [...byWorkout.entries()].sort((a, b) => new Date(a[1].performedAt).getTime() - new Date(b[1].performedAt).getTime())
    for (let i = 1; i < sessions.length; i++) {
      const [workoutId, { best }] = sessions[i]
      const previous = sessions[i - 1][1].best
      const list = changes.get(workoutId) ?? []
      list.push(((best - previous) / previous) * 100)
      changes.set(workoutId, list)
    }
  }
  for (const [workoutId, list] of changes) entry(workoutId).e1rmChange = list.reduce((a, b) => a + b, 0) / list.length
  return stats
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function timesText(ratio: number): string {
  return ratio >= 1.95 ? `${round1(ratio)}x` : `${Math.round((ratio - 1) * 100)}%`
}

interface Group {
  value: string
  values: number[]
}

// The best and worst groups by average, when both are big enough.
function extremes(groups: Group[]): [Group, Group] | null {
  const big = groups.filter((g) => g.values.length >= MIN_GROUP_WORKOUTS)
  if (big.length < 2) return null
  const sorted = [...big].sort((a, b) => average(b.values) - average(a.values))
  return [sorted[0], sorted[sorted.length - 1]]
}

function findingFor(dimension: FeelKey, metric: FeelMetric, groups: Group[]): FeelFinding | null {
  const pair = extremes(groups)
  if (!pair) return null
  const [better, worse] = pair
  const hi = average(better.values)
  const lo = average(worse.values)
  const counts = `Based on ${better.values.length} and ${worse.values.length} workouts.`
  const betterPhrase = optionPhrase(dimension, better.value)
  const worsePhrase = optionPhrase(dimension, worse.value)
  let text: string
  let detail: string
  if (metric === 'records') {
    if (hi - lo < MIN_RECORD_GAP || (lo > 0 && hi / lo < MIN_RECORD_RATIO)) return null
    text =
      lo === 0
        ? `You set records ${betterPhrase}, and none ${worsePhrase}.`
        : `You set ${timesText(hi / lo)} more records ${betterPhrase} than ${worsePhrase}.`
    detail = `${round1(hi)} vs ${round1(lo)} records a workout. ${counts}`
  } else if (metric === 'e1rm') {
    if (hi - lo < MIN_E1RM_GAP) return null
    text = `Your est. 1RM rose more ${betterPhrase} than ${worsePhrase}.`
    const signed = (n: number) => `${n > 0 ? '+' : ''}${round1(n)}%`
    detail = `${signed(hi)} vs ${signed(lo)} a session, against each lift's last session. ${counts}`
  } else {
    if (hi - lo < MIN_SETS_GAP || hi / lo < MIN_SETS_RATIO) return null
    text = `You got through ${timesText(hi / lo)} more sets ${betterPhrase} than ${worsePhrase}.`
    detail = `${round1(hi)} vs ${round1(lo)} sets a workout. ${counts}`
  }
  return {
    dimension,
    metric,
    better: { value: better.value, average: hi, workouts: better.values.length },
    worse: { value: worse.value, average: lo, workouts: worse.values.length },
    text,
    detail,
  }
}

// At most one finding per tag (records first, then est. 1RM, then sets), and
// only from finished workouts that have sets. `rows` is every set logged, so
// records and est. 1RM changes count against all history, tagged or not.
export function buildFeelInsights(
  workouts: FeelWorkoutRow[],
  rows: ProgressSetRow[],
  loadTypeOf: (exerciseId: string) => LoadType,
  bodyWeightEntries: BodyWeightEntryLike[] = [],
  excludeWorkoutId: string | null = null,
): FeelInsights {
  const stats = workoutStats(rows, loadTypeOf, bodyWeightEntries)
  const tagged = workouts
    .filter((w) => w.id !== excludeWorkoutId && stats.has(w.id))
    .map((w) => ({ id: w.id, feel: feelOf(w), stats: stats.get(w.id)! }))
    .filter((w) => isTagged(w.feel))
  const findings: FeelFinding[] = []
  if (tagged.length >= MIN_TAGGED_WORKOUTS) {
    for (const dimension of FEEL_DIMENSIONS) {
      const groupsFor = (pick: (s: WorkoutStats) => number | null): Group[] =>
        dimension.options.map((option) => ({
          value: option.value,
          values: tagged
            .filter((w) => w.feel[dimension.key] === option.value)
            .map((w) => pick(w.stats))
            .filter((v): v is number => v !== null),
        }))
      const finding =
        findingFor(dimension.key, 'records', groupsFor((s) => s.records)) ??
        findingFor(dimension.key, 'e1rm', groupsFor((s) => s.e1rmChange)) ??
        findingFor(dimension.key, 'sets', groupsFor((s) => s.sets))
      if (finding) findings.push(finding)
    }
  }
  return { tagged: tagged.length, findings }
}
