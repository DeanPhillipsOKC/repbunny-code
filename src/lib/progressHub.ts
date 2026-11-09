import type { LoadType, WeightUnit } from './types'
import type { MuscleGroup } from './muscleGroups'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from './exerciseHistory'
import {
  buildProgressSeries,
  changeArrow,
  filterByRange,
  isFlippedMetric,
  METRIC_LABELS,
  metricFormatter,
  metricsFor,
  metricUnitLabel,
  summarizePoints,
  type ProgressMetric,
  type ProgressPoint,
  type ProgressSeries,
  type SeriesSummary,
} from './progressSeries'
import { flatSince } from './plateau'

// Issue #44: the Progress hub's stats, tiles, and Lift progress rows. Pure,
// same pattern as progressSeries.ts, fed by the workouts store's one
// all-sets fetch (fetchProgressSets).

export interface ProgressSetRow extends ExerciseHistorySet {
  exercise_id: string
  workout_id: string
  performed_at: string
  template_name: string | null
  // null for a freeform workout (template progress, #157).
  template_id?: string | null
  // Order within the workout (milestone records, #153).
  set_index?: number
  // The workout's last Finish tap (#266), for the calendar's day summary
  // (#491).
  finished_at?: string | null
  // The workout came from an import (#462); milestones tag its tiers.
  imported?: boolean
}

export interface ProgressExercise {
  id: string
  name: string
  load_type: LoadType
  tracks_distance: boolean
  muscle_group: MuscleGroup | null
}

// Newest workout first, like fetchExerciseHistory, so ExerciseHistoryDetail's
// shape and this one match.
export function historiesByExercise(rows: ProgressSetRow[]): Map<string, ExerciseHistoryWorkout[]> {
  const byExercise = new Map<string, Map<string, ExerciseHistoryWorkout>>()
  for (const row of rows) {
    let workouts = byExercise.get(row.exercise_id)
    if (!workouts) byExercise.set(row.exercise_id, (workouts = new Map()))
    let workout = workouts.get(row.workout_id)
    if (!workout) workouts.set(row.workout_id, (workout = { workoutId: row.workout_id, performedAt: row.performed_at, sets: [] }))
    const { exercise_id: _e, workout_id: _w, performed_at: _p, template_name: _t, template_id: _ti, set_index: _i, imported: _im, ...set } = row
    workout.sets.push(set)
  }
  const result = new Map<string, ExerciseHistoryWorkout[]>()
  for (const [id, workouts] of byExercise) {
    result.set(
      id,
      [...workouts.values()].sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()),
    )
  }
  return result
}

// Sunday 12:00 AM, local time. The app's one definition of "this week":
// the Home strip, the finish recap, the Progress hub, and muscle groups all
// use it. Sunday start since 2026-09-30 (was Monday); getDay() is 0 on Sunday.
export function startOfWeek(now: Date = new Date()): Date {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay())
  return start
}

export function startOfMonth(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

// Workouts with at least one set logged.
export function workoutCounts(rows: ProgressSetRow[], now: Date = new Date()): { week: number; month: number } {
  const week = startOfWeek(now).getTime()
  const month = startOfMonth(now).getTime()
  const weekIds = new Set<string>()
  const monthIds = new Set<string>()
  for (const row of rows) {
    const at = new Date(row.performed_at).getTime()
    if (at >= week) weekIds.add(row.workout_id)
    if (at >= month) monthIds.add(row.workout_id)
  }
  return { week: weekIds.size, month: monthIds.size }
}

export function latestWorkout(rows: ProgressSetRow[]): { name: string; performedAt: string } | null {
  let latest: ProgressSetRow | null = null
  for (const row of rows) {
    if (!latest || new Date(row.performed_at).getTime() > new Date(latest.performed_at).getTime()) latest = row
  }
  return latest ? { name: latest.template_name ?? 'Freeform workout', performedAt: latest.performed_at } : null
}

export function defaultMetric(exercise: ProgressExercise): ProgressMetric {
  return metricsFor(exercise.load_type, exercise.tracks_distance)[0]
}

// Exercises whose all-time best in their default metric was first reached
// this calendar month, beating at least one earlier session.
export function newBestsThisMonth(
  exercises: ProgressExercise[],
  histories: Map<string, ExerciseHistoryWorkout[]>,
  now: Date = new Date(),
  preferredUnit: WeightUnit | null = null,
): number {
  return newBestsListThisMonth(exercises, histories, now, preferredUnit).length
}

// Issue #581: what "new bests" counted, newest first, with the set behind
// each best, for the hub's sheet.
export interface NewBest {
  exercise: ProgressExercise
  metric: ProgressMetric
  value: number
  unit: ProgressSeries['unit']
  set: ExerciseHistorySet
  performedAt: string
}

export function newBestsListThisMonth(
  exercises: ProgressExercise[],
  histories: Map<string, ExerciseHistoryWorkout[]>,
  now: Date = new Date(),
  preferredUnit: WeightUnit | null = null,
): NewBest[] {
  const month = startOfMonth(now).getTime()
  const bests: NewBest[] = []
  for (const exercise of exercises) {
    const workouts = histories.get(exercise.id)
    if (!workouts || workouts.length < 2) continue
    const metric = defaultMetric(exercise)
    const flipped = isFlippedMetric(metric)
    const { points, unit } = buildProgressSeries(workouts, metric, preferredUnit)
    let recordIndex = 0
    points.forEach((p, i) => {
      const best = points[recordIndex].value
      if (flipped ? p.value < best : p.value > best) recordIndex = i
    })
    const point = points[recordIndex]
    if (recordIndex >= 1 && new Date(point.performedAt).getTime() >= month) {
      bests.push({ exercise, metric, value: point.value, unit, set: point.set, performedAt: point.performedAt })
    }
  }
  return bests.sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime())
}

// "234 lb", "Lvl 12", "1:30", "15 reps".
export function headlineText(metric: ProgressMetric, value: number, unit: ProgressSeries['unit']): string {
  const v = metricFormatter(metric)(value)
  if (metric === 'level') return `Lvl ${v}`
  if (metric === 'longest') return v
  if (metric === 'reps') return `${v} reps`
  return unit ? `${v} ${unit}` : v
}

// The pill's arrow and number, e.g. "▲ 29" or "▼ 20"; `withUnit` adds the
// chart's unit ("▲ 29 lb", "▼ 20 lb assist").
export function changeText(metric: ProgressMetric, summary: SeriesSummary, unit: ProgressSeries['unit'], withUnit: boolean): string {
  const arrow = changeArrow(summary.first.value, summary.last.value)
  const amount = metricFormatter(metric)(Math.abs(summary.change))
  if (withUnit) {
    const label = metricUnitLabel(metric, unit)
    return `${arrow} ${amount}${label ? ` ${label}` : ''}`
  }
  return metric === 'assist' ? `${arrow} ${amount} assist` : `${arrow} ${amount}`
}

export interface ExerciseTrend {
  exercise: ProgressExercise
  metric: ProgressMetric
  unit: ProgressSeries['unit']
  // Last 3 months, oldest first.
  recent: ProgressPoint[]
  summary: SeriesSummary | null
  lastPerformedAt: string
}

function trendFor(exercise: ProgressExercise, workouts: ExerciseHistoryWorkout[], now: Date, preferredUnit: WeightUnit | null): ExerciseTrend {
  const metric = defaultMetric(exercise)
  const series = buildProgressSeries(workouts, metric, preferredUnit)
  const recent = filterByRange(series.points, '3M', now)
  return {
    exercise,
    metric,
    unit: series.unit,
    recent,
    summary: summarizePoints(recent, metric),
    lastPerformedAt: workouts[0].performedAt,
  }
}

// Lift progress tile: the biggest percentage gain over the last 3 months
// among exercises with 2+ sessions in that window. A tie goes to the more
// recently trained one.
export function topLiftTrend(
  exercises: ProgressExercise[],
  histories: Map<string, ExerciseHistoryWorkout[]>,
  now: Date = new Date(),
  preferredUnit: WeightUnit | null = null,
): ExerciseTrend | null {
  let top: { trend: ExerciseTrend; pct: number } | null = null
  for (const exercise of exercises) {
    const workouts = histories.get(exercise.id)
    if (!workouts || workouts.length < 2) continue
    const trend = trendFor(exercise, workouts, now, preferredUnit)
    if (!trend.summary || trend.summary.first.value === 0) continue
    const pct = trend.summary.improved ? trend.summary.change / Math.abs(trend.summary.first.value) : 0
    if (
      !top ||
      pct > top.pct ||
      (pct === top.pct && new Date(trend.lastPerformedAt).getTime() > new Date(top.trend.lastPerformedAt).getTime())
    ) {
      top = { trend, pct }
    }
  }
  return top?.trend ?? null
}

export interface LiftRow {
  exerciseId: string
  name: string
  muscleGroup: MuscleGroup | null
  metricLabel: string
  lastPerformedAt: string
  spark: number[]
  flipped: boolean
  headline: string
  // Issue #156: a lift logged in just one workout (often a swap) still gets a
  // row, with "1 session" in place of a trend.
  oneSession: boolean
  // null when the metric has fewer than 2 points to compare at all.
  pill: { trend: Trend; text: string } | null
  // Issue #133: the last new best's date when the lift has gone flat.
  flatSince: string | null
}

export type Trend = 'up' | 'down' | 'flat'

// Better, worse, or level since the range's first point (issue #131).
export function summaryTrend(summary: SeriesSummary): Trend {
  return summary.improved ? 'up' : summary.declined ? 'down' : 'flat'
}

// Every exercise with a logged workout, most recently trained first. The
// headline is the latest session; the pill compares it to the first, covering the last 3 months like the chart's default range,
// falling back to all time when fewer than 2 of its sessions are that recent.
export function liftProgressRows(
  exercises: ProgressExercise[],
  histories: Map<string, ExerciseHistoryWorkout[]>,
  now: Date = new Date(),
  preferredUnit: WeightUnit | null = null,
): LiftRow[] {
  const rows: LiftRow[] = []
  for (const exercise of exercises) {
    const workouts = histories.get(exercise.id)
    if (!workouts || workouts.length === 0) continue
    const metric = defaultMetric(exercise)
    const series = buildProgressSeries(workouts, metric, preferredUnit)
    const recent = filterByRange(series.points, '3M', now)
    const points = recent.length >= 2 ? recent : series.points
    const summary = summarizePoints(points, metric)
    const shown = series.points[series.points.length - 1]
    const trend = summary ? summaryTrend(summary) : 'flat'
    rows.push({
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscle_group,
      metricLabel: METRIC_LABELS[metric],
      lastPerformedAt: workouts[0].performedAt,
      spark: points.map((p) => p.value),
      flipped: isFlippedMetric(metric),
      headline: shown ? headlineText(metric, shown.value, series.unit) : '',
      oneSession: workouts.length === 1,
      pill: summary
        ? { trend, text: trend === 'flat' ? 'no change' : changeText(metric, summary, series.unit, false) }
        : null,
      flatSince: flatSince(exercise.load_type, exercise.tracks_distance, workouts, preferredUnit),
    })
  }
  return rows.sort((a, b) => new Date(b.lastPerformedAt).getTime() - new Date(a.lastPerformedAt).getTime())
}
