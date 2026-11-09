import type { DistanceUnit, LoadType, WeightUnit } from './types'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from './exerciseHistory'
import { setVolume } from './volume'
import { formatSecondsAsClock } from './timedInput'

// Issue #21: the per-exercise progress chart's series math. Pure, same
// pattern as exerciseHistory.ts/volume.ts, so the Progress hub (#44) can
// reuse it. One point per workout: that session's best set for the metric.

export type ProgressMetric = 'e1rm' | 'heaviest' | 'volume' | 'reps' | 'assist' | 'level' | 'longest' | 'farthest'
export type ProgressRange = '1M' | '3M' | '1Y' | 'All'

export const PROGRESS_RANGES: ProgressRange[] = ['1M', '3M', '1Y', 'All']

export interface ProgressPoint {
  performedAt: string
  value: number
  // The set that produced `value` (for volume, the session's heaviest set).
  set: ExerciseHistorySet
  setCount: number
  // Any set in this session was logged in the other unit and converted.
  converted: boolean
}

// What ProgressChart.vue draws: a point already reduced to a number plus the
// source-set text for its sub-line and tap tooltip, e.g. "185 lb × 8".
export interface ChartPoint {
  performedAt: string
  value: number
  detail?: string
  // Issue #158: what was unusual about the session, one sentence a line.
  // A point with a story gets a marker.
  story?: string[]
  // Issue #168: the workout's note. A point with a note gets a marker too.
  note?: string
  // Issue #578: the receipt, the working behind the value and the session
  // before it, shown in the tap tooltip.
  math?: string[]
  previous?: string
}

export interface ProgressSeries {
  points: ProgressPoint[]
  // Display unit for weight/distance metrics; null for reps/level/duration.
  unit: WeightUnit | DistanceUnit | null
}

const LB_PER_KG = 2.20462
const KM_PER_MI = 1.60934

export function convertWeight(weight: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return weight
  return from === 'kg' ? weight * LB_PER_KG : weight / LB_PER_KG
}

export function convertDistance(distance: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return distance
  return from === 'mi' ? distance * KM_PER_MI : distance / KM_PER_MI
}

// Epley. A 1-rep set is its own weight (Epley alone would add 1/30).
export function epley(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

export function isEpleyEligible(set: { reps: number | null; weight: number }): boolean {
  return set.reps !== null && set.reps >= 1 && set.reps <= 12 && set.weight > 0
}

// The unit used by the most sets; on a tie, the unit of the most recent set.
// `units` is ordered oldest first.
function mostUsedUnit<U extends string>(units: U[]): U | null {
  if (units.length === 0) return null
  const counts = new Map<U, number>()
  for (const u of units) counts.set(u, (counts.get(u) ?? 0) + 1)
  const top = Math.max(...counts.values())
  const tied = [...counts.entries()].filter(([, n]) => n === top).map(([u]) => u)
  if (tied.length === 1) return tied[0]
  for (let i = units.length - 1; i >= 0; i--) if (tied.includes(units[i])) return units[i]
  return tied[0]
}

function oldestFirst(workouts: ExerciseHistoryWorkout[]): ExerciseHistoryWorkout[] {
  return [...workouts].sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime())
}

export function mostUsedWeightUnit(workouts: ExerciseHistoryWorkout[]): WeightUnit | null {
  return mostUsedUnit(oldestFirst(workouts).flatMap((w) => w.sets.map((s) => s.weight_unit)))
}

export function mostUsedDistanceUnit(workouts: ExerciseHistoryWorkout[]): DistanceUnit | null {
  return mostUsedUnit(
    oldestFirst(workouts).flatMap((w) =>
      w.sets.filter((s) => s.distance !== null && s.distance_unit !== null).map((s) => s.distance_unit as DistanceUnit),
    ),
  )
}

// Which metrics each load type can chart, default first.
export function metricsFor(loadType: LoadType, tracksDistance: boolean): ProgressMetric[] {
  switch (loadType) {
    case 'weight':
      return ['e1rm', 'heaviest', 'volume']
    case 'bodyweight':
      return ['reps']
    case 'assisted':
      return ['assist']
    case 'level':
      return ['level']
    case 'timed':
      return tracksDistance ? ['longest', 'farthest'] : ['longest']
  }
}

// Issue #132: without Premium, each load type charts one plain metric over
// the FREE_PROGRESS_RANGES; every other metric (and any added later) is
// Premium. Heaviest for weight; the rest are their load type's only metric,
// or Longest for timed.
export const FREE_PROGRESS_METRICS: ProgressMetric[] = ['heaviest', 'reps', 'assist', 'level', 'longest']
export const FREE_PROGRESS_RANGES: ProgressRange[] = ['1M', '3M']

export function isFreeMetric(metric: ProgressMetric): boolean {
  return FREE_PROGRESS_METRICS.includes(metric)
}

export function isFreeRange(range: ProgressRange): boolean {
  return FREE_PROGRESS_RANGES.includes(range)
}

// Assist is the one metric where lower is better; the chart flips its axis.
export function isFlippedMetric(metric: ProgressMetric): boolean {
  return metric === 'assist'
}

export const METRIC_LABELS: Record<ProgressMetric, string> = {
  e1rm: 'Est. 1RM',
  heaviest: 'Heaviest',
  volume: 'Volume',
  reps: 'Most reps',
  assist: 'Least assist',
  level: 'Best level',
  longest: 'Longest',
  farthest: 'Farthest',
}

// The unit text after a value, e.g. "lb", "reps", "lb assist".
export function metricUnitLabel(metric: ProgressMetric, unit: ProgressSeries['unit']): string {
  if (metric === 'reps') return 'reps'
  return metric === 'assist' ? `${unit ?? ''} assist` : (unit ?? '')
}

function formatNumber(value: number, maxDigits: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

export function metricFormatter(metric: ProgressMetric): (value: number) => string {
  switch (metric) {
    case 'longest':
      return (v) => formatSecondsAsClock(Math.round(v))
    case 'e1rm':
    case 'volume':
    case 'reps':
      return (v) => formatNumber(Math.round(v), 0)
    default:
      return (v) => formatNumber(v, 1)
  }
}

// Issue #44: the headline and change pill ProgressChart.vue shows for a
// range, as plain data for the Progress hub's rows and tiles. Issue #131:
// the headline is the range's latest point and the change is latest minus
// first, signed so positive is better (first minus latest when lower is
// better). It only counts as improved or declined when it's still nonzero
// once formatted. `best` (latest wins a tie) stays for the chart's sub-line.
export interface SeriesSummary {
  first: ProgressPoint
  best: ProgressPoint
  last: ProgressPoint
  change: number
  improved: boolean
  declined: boolean
}

export function summarizePoints(points: ProgressPoint[], metric: ProgressMetric): SeriesSummary | null {
  if (points.length < 2) return null
  const flipped = isFlippedMetric(metric)
  let best = points[0]
  for (const p of points) if (flipped ? p.value <= best.value : p.value >= best.value) best = p
  const first = points[0]
  const last = points[points.length - 1]
  const change = flipped ? first.value - last.value : last.value - first.value
  const format = metricFormatter(metric)
  const visible = format(Math.abs(change)) !== format(0)
  return { first, best, last, change, improved: change > 0 && visible, declined: change < 0 && visible }
}

// The arrow follows the raw value, so less assist reads ▼ and a lighter
// day reads ▼ too; color (not the arrow) says better or worse.
export function changeArrow(first: number, last: number): string {
  return last < first ? '▼' : '▲'
}

type Best = { value: number; set: ExerciseHistorySet }

function pickBest(sets: ExerciseHistorySet[], valueOf: (s: ExerciseHistorySet) => number | null, lowerIsBetter = false): Best | null {
  let best: Best | null = null
  for (const s of sets) {
    const value = valueOf(s)
    if (value === null) continue
    if (!best || (lowerIsBetter ? value < best.value : value > best.value)) best = { value, set: s }
  }
  return best
}

export function buildProgressSeries(
  workouts: ExerciseHistoryWorkout[],
  metric: ProgressMetric,
  // Issue #53 follow-up: the profile's unit when one is picked, so a kg
  // user with old lb history still sees kg. Null = the history's most-used.
  preferredWeightUnit: WeightUnit | null = null,
): ProgressSeries {
  const weightUnit = preferredWeightUnit ?? mostUsedWeightUnit(workouts) ?? 'lb'
  const distanceUnit = mostUsedDistanceUnit(workouts) ?? 'mi'
  const toUnit = (s: ExerciseHistorySet) => convertWeight(s.weight, s.weight_unit, weightUnit)

  const points: ProgressPoint[] = []
  for (const w of oldestFirst(workouts)) {
    let best: Best | null = null
    let converted = false
    switch (metric) {
      case 'e1rm': {
        const eligible = w.sets.filter(isEpleyEligible)
        best = pickBest(eligible, (s) => Math.round(epley(toUnit(s), s.reps!)))
        converted = eligible.some((s) => s.weight_unit !== weightUnit)
        break
      }
      case 'heaviest':
        best = pickBest(w.sets, toUnit)
        converted = w.sets.some((s) => s.weight_unit !== weightUnit)
        break
      case 'volume': {
        const top = pickBest(w.sets, toUnit)
        if (top) {
          const total = w.sets.reduce(
            (sum, s) => sum + (setVolume({ reps: s.reps, weight: toUnit(s), weight_unit: weightUnit }, w.performedAt, []) ?? 0),
            0,
          )
          best = { value: total, set: top.set }
        }
        converted = w.sets.some((s) => s.weight_unit !== weightUnit)
        break
      }
      case 'reps':
        best = pickBest(w.sets, (s) => s.reps)
        break
      case 'assist':
        best = pickBest(w.sets, toUnit, true)
        converted = w.sets.some((s) => s.weight_unit !== weightUnit)
        break
      case 'level':
        // Same level with more reps is the better set (bestLevelSet's rule).
        for (const s of w.sets) {
          if (s.level === null) continue
          if (!best || s.level > best.value || (s.level === best.value && (s.reps ?? 0) > (best.set.reps ?? 0))) {
            best = { value: s.level, set: s }
          }
        }
        break
      case 'longest':
        best = pickBest(w.sets, (s) => s.duration_seconds)
        break
      case 'farthest': {
        const withDistance = w.sets.filter((s) => s.distance !== null && s.distance_unit !== null)
        best = pickBest(withDistance, (s) => convertDistance(s.distance!, s.distance_unit!, distanceUnit))
        converted = withDistance.some((s) => s.distance_unit !== distanceUnit)
        break
      }
    }
    if (best) points.push({ performedAt: w.performedAt, value: best.value, set: best.set, setCount: w.sets.length, converted })
  }

  const unit =
    metric === 'farthest' ? distanceUnit : metric === 'e1rm' || metric === 'heaviest' || metric === 'volume' || metric === 'assist' ? weightUnit : null
  return { points, unit }
}

// Counted back from today; `All` keeps everything.
export function rangeStart(range: ProgressRange, now: Date = new Date()): Date | null {
  if (range === 'All') return null
  const start = new Date(now)
  start.setMonth(start.getMonth() - (range === '1M' ? 1 : range === '3M' ? 3 : 12))
  return start
}

export function filterByRange<P extends { performedAt: string }>(points: P[], range: ProgressRange, now: Date = new Date()): P[] {
  const start = rangeStart(range, now)
  if (!start) return points
  return points.filter((p) => new Date(p.performedAt).getTime() >= start.getTime())
}
