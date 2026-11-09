import { MUSCLE_GROUPS, type MuscleGroup } from './muscleGroups'
import { startOfWeek } from './progressHub'
import { setVolume } from './volume'
import { convertWeight, type BodyWeightEntryLike } from './bodyStats'
import type { LoadType, WeightUnit } from './types'

// Issue #40: sets per week per muscle group (docs/design/issue-40-muscle-groups.html).
// A set counts 1 for its exercise's main muscle and 0.5 for each "also works"
// muscle, for every load type. Weeks start Sunday, local time. Pure, fed by
// the workouts store's all-sets fetch (fetchProgressSets).
//
// Issue #50 (docs/design/issue-50-muscle-metrics.html) adds volume and time
// with the same credit rule. Volume per set is the finish recap's setVolume
// (level and timed sets, and bodyweight/assisted sets with no body weight on
// file, add none), summed in lb and converted for display. Time is a timed
// set's duration_seconds.

export interface MuscleSetRow {
  exercise_id: string
  performed_at: string
  reps: number | null
  weight: number
  weight_unit: WeightUnit
  duration_seconds: number | null
}

export interface MuscleExercise {
  id: string
  name: string
  muscle_group: MuscleGroup | null
  also_works: MuscleGroup[]
  load_type: LoadType
}

export type MuscleMetric = 'sets' | 'volume' | 'time'

export const MUSCLE_METRICS: MuscleMetric[] = ['sets', 'volume', 'time']

// One set's amount for a metric, before the half credit: 1 set, volume in
// lb, or seconds. null when the set adds nothing to that metric.
export function setAmount(
  row: MuscleSetRow,
  loadType: LoadType,
  metric: MuscleMetric,
  bodyWeightEntries: BodyWeightEntryLike[],
): number | null {
  if (metric === 'sets') return 1
  if (metric === 'time') return loadType === 'timed' && row.duration_seconds ? row.duration_seconds : null
  const v = setVolume({ ...row, exercises: { load_type: loadType } }, row.performed_at, bodyWeightEntries)
  return v === null ? null : convertWeight(v, row.weight_unit, 'lb')
}

// The muscles a set credits, with their share: 1 for the main muscle, 0.5
// for each "also works" one. Empty when the exercise has no muscle group.
export function credits(exercise: MuscleExercise): [MuscleGroup, number][] {
  if (!exercise.muscle_group) return []
  const out: [MuscleGroup, number][] = [[exercise.muscle_group, 1]]
  for (const g of exercise.also_works) if (g !== exercise.muscle_group) out.push([g, 0.5])
  return out
}

export type MuscleCounts = Record<MuscleGroup, number>

export type MuscleRange = '4W' | '12W' | '1Y' | 'All'

export const MUSCLE_RANGES: MuscleRange[] = ['4W', '12W', '1Y', 'All']

const RANGE_WEEKS: Record<Exclude<MuscleRange, 'All'>, number> = { '4W': 4, '12W': 12, '1Y': 52 }

export function emptyCounts(): MuscleCounts {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as MuscleCounts
}

// The week start `n` weeks after `week` (negative for before). Built from
// the date parts, not by adding milliseconds, so a DST change can't shift it.
export function addWeeks(week: Date, n: number): Date {
  return new Date(week.getFullYear(), week.getMonth(), week.getDate() + n * 7)
}

export function weekKey(week: Date): string {
  return `${week.getFullYear()}-${week.getMonth() + 1}-${week.getDate()}`
}

// Week key -> per-muscle totals for one metric, for every week with at
// least one counted set. Sets whose exercise has no muscle group count
// toward nothing.
export function weeklyMuscleTotals(
  rows: MuscleSetRow[],
  exercises: MuscleExercise[],
  metric: MuscleMetric,
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): Map<string, MuscleCounts> {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const weeks = new Map<string, MuscleCounts>()
  for (const row of rows) {
    const exercise = byId.get(row.exercise_id)
    if (!exercise?.muscle_group) continue
    const amount = setAmount(row, exercise.load_type, metric, bodyWeightEntries)
    if (amount === null) continue
    const key = weekKey(startOfWeek(new Date(row.performed_at)))
    let counts = weeks.get(key)
    if (!counts) weeks.set(key, (counts = emptyCounts()))
    for (const [g, share] of credits(exercise)) counts[g] += amount * share
  }
  return weeks
}

export function weeklyMuscleSets(rows: MuscleSetRow[], exercises: MuscleExercise[]): Map<string, MuscleCounts> {
  return weeklyMuscleTotals(rows, exercises, 'sets')
}

// Which metrics `group` has any data for across all history, in switch
// order. Sets is always there.
export function availableMetrics(
  rows: MuscleSetRow[],
  exercises: MuscleExercise[],
  group: MuscleGroup,
  bodyWeightEntries: BodyWeightEntryLike[],
): MuscleMetric[] {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const found = new Set<MuscleMetric>(['sets'])
  for (const row of rows) {
    const exercise = byId.get(row.exercise_id)
    if (!exercise || !credits(exercise).some(([g]) => g === group)) continue
    for (const metric of ['volume', 'time'] as const) {
      if (!found.has(metric) && setAmount(row, exercise.load_type, metric, bodyWeightEntries) !== null) found.add(metric)
    }
    if (found.size === MUSCLE_METRICS.length) break
  }
  return MUSCLE_METRICS.filter((m) => found.has(m))
}

// The weight unit used most by the sets that add volume to `group`; on a
// tie, the most recent such set's unit. lb with none.
export function volumeUnit(
  rows: MuscleSetRow[],
  exercises: MuscleExercise[],
  group: MuscleGroup,
  bodyWeightEntries: BodyWeightEntryLike[],
): WeightUnit {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const counts: Record<WeightUnit, number> = { lb: 0, kg: 0 }
  let latest: { at: number; unit: WeightUnit } | null = null
  for (const row of rows) {
    const exercise = byId.get(row.exercise_id)
    if (!exercise || !credits(exercise).some(([g]) => g === group)) continue
    if (setAmount(row, exercise.load_type, 'volume', bodyWeightEntries) === null) continue
    counts[row.weight_unit]++
    const at = new Date(row.performed_at).getTime()
    if (!latest || at >= latest.at) latest = { at, unit: row.weight_unit }
  }
  if (counts.lb === counts.kg) return latest?.unit ?? 'lb'
  return counts.kg > counts.lb ? 'kg' : 'lb'
}

// Issue #135: the common hypertrophy guidance of 10 to 20 sets per muscle a
// week, shaded on the sets charts. Free, like the rest of Muscle groups.
export const TARGET_SETS = { min: 10, max: 20 } as const

// The muscles with any counted set in a week before `week`. A muscle with
// none has no history to fall short of.
export function musclesWithHistoryBefore(weeks: Map<string, MuscleCounts>, week: Date): Set<MuscleGroup> {
  const found = new Set<MuscleGroup>()
  for (const [key, counts] of weeks) {
    const [y, m, d] = key.split('-').map(Number)
    if (new Date(y, m - 1, d).getTime() >= week.getTime()) continue
    for (const g of MUSCLE_GROUPS) if (counts[g] > 0) found.add(g)
  }
  return found
}

export function countsForWeek(weeks: Map<string, MuscleCounts>, week: Date): MuscleCounts {
  return weeks.get(weekKey(week)) ?? emptyCounts()
}

// The week start of the earliest logged set, or null with no sets at all.
export function earliestWeek(rows: MuscleSetRow[]): Date | null {
  let earliest: number | null = null
  for (const row of rows) {
    const at = new Date(row.performed_at).getTime()
    if (earliest === null || at < earliest) earliest = at
  }
  return earliest === null ? null : startOfWeek(new Date(earliest))
}

// The busiest muscle, first in MUSCLE_GROUPS order on a tie; null when
// nothing counted.
export function leadingMuscle(counts: MuscleCounts): MuscleGroup | null {
  let lead: MuscleGroup | null = null
  for (const g of MUSCLE_GROUPS) {
    if (counts[g] > 0 && (lead === null || counts[g] > counts[lead])) lead = g
  }
  return lead
}

// "6", "4.5".
export function formatSets(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// A volume total held in lb, shown in `unit`: "12,450".
export function formatVolume(lb: number, unit: WeightUnit): string {
  return Math.round(convertWeight(lb, 'lb', unit)).toLocaleString('en-US')
}

// "6:30", "1:05:00".
export function formatTime(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export interface WeekBar {
  week: Date
  value: number
  current: boolean
}

// One bar per week in the range, oldest first, ending with the current
// (in-progress) week. "All" starts at the earliest week with any set.
export function muscleWeekBars(
  weeks: Map<string, MuscleCounts>,
  group: MuscleGroup,
  range: MuscleRange,
  first: Date | null,
  now: Date = new Date(),
): WeekBar[] {
  const current = startOfWeek(now)
  let count: number
  if (range === 'All') {
    count = first ? Math.round((current.getTime() - first.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1 : 1
  } else {
    count = RANGE_WEEKS[range]
  }
  const bars: WeekBar[] = []
  for (let i = count - 1; i >= 0; i--) {
    const week = addWeeks(current, -i)
    bars.push({ week, value: countsForWeek(weeks, week)[group], current: i === 0 })
  }
  return bars
}

// The range's complete weeks (every bar but the current one): their total
// and how many there are, which the average divides by. Issue #582's How?
// box shows both.
export function completeWeekSum(bars: WeekBar[]): { total: number; weeks: number } {
  const complete = bars.filter((b) => !b.current)
  return { total: complete.reduce((sum, b) => sum + b.value, 0), weeks: complete.length }
}

// Average over the range's complete weeks; null when the range has no
// complete week yet.
export function completeWeekAverage(bars: WeekBar[]): number | null {
  const { total, weeks } = completeWeekSum(bars)
  return weeks === 0 ? null : total / weeks
}

export interface MuscleContribution {
  exerciseId: string
  name: string
  main: boolean
  // Bodyweight or assisted, so its volume comes from logged body weight.
  usesBodyWeight: boolean
  sets: number
  // The metric's amount before the half credit, then after it.
  amount: number
  credited: number
  // Issue #582: the days it was done that week (local midnight), oldest first.
  days: Date[]
}

// The exercises that counted toward `group` in `week` for `metric`, biggest
// share first.
export function muscleContributions(
  rows: MuscleSetRow[],
  exercises: MuscleExercise[],
  group: MuscleGroup,
  week: Date,
  metric: MuscleMetric = 'sets',
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): MuscleContribution[] {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const start = week.getTime()
  const end = addWeeks(week, 1).getTime()
  const found = new Map<string, MuscleContribution>()
  for (const row of rows) {
    const at = new Date(row.performed_at).getTime()
    if (at < start || at >= end) continue
    const exercise = byId.get(row.exercise_id)
    if (!exercise?.muscle_group) continue
    const main = exercise.muscle_group === group
    if (!main && !exercise.also_works.includes(group)) continue
    const amount = setAmount(row, exercise.load_type, metric, bodyWeightEntries)
    if (amount === null) continue
    let c = found.get(exercise.id)
    if (!c) {
      const usesBodyWeight = exercise.load_type === 'bodyweight' || exercise.load_type === 'assisted'
      found.set(exercise.id, (c = { exerciseId: exercise.id, name: exercise.name, main, usesBodyWeight, sets: 0, amount: 0, credited: 0, days: [] }))
    }
    const d = new Date(at)
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (!c.days.some((x) => x.getTime() === day.getTime())) {
      c.days.push(day)
      c.days.sort((a, b) => a.getTime() - b.getTime())
    }
    c.sets += 1
    c.amount += amount
    c.credited += main ? amount : amount * 0.5
  }
  return [...found.values()].sort((a, b) => b.credited - a.credited || a.name.localeCompare(b.name))
}
