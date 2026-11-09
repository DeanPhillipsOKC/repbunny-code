import type { WeightUnit } from './types'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from './exerciseHistory'
import { changeArrow, convertWeight, epley, isEpleyEligible, metricFormatter, type ProgressMetric, type ProgressPoint } from './progressSeries'

// Issue #578: a chart point's "receipt", the math behind the number so a
// skeptical lifter can check it. Pure, same pattern as progressSeries.ts.

function formatNumber(value: number, maxDigits: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const WEIGHT_METRICS: ProgressMetric[] = ['e1rm', 'heaviest', 'volume', 'assist']

// The set's weight as logged, plus its conversion when the chart is in the
// other unit: "100 kg (220.5 lb)".
export function loggedLoad(s: ExerciseHistorySet, chartUnit: WeightUnit | null): string {
  const load = `${formatNumber(s.weight, 1)} ${s.weight_unit}`
  if (!chartUnit || s.weight_unit === chartUnit) return load
  return `${load} (${formatNumber(convertWeight(s.weight, s.weight_unit, chartUnit), 1)} ${chartUnit})`
}

// The number one set adds to the point, in the chart's unit: its Est. 1RM,
// or its volume. Null when the set doesn't count (over 12 reps, no reps).
export function setMetricValue(metric: ProgressMetric, s: ExerciseHistorySet, chartUnit: WeightUnit): number | null {
  const weight = convertWeight(s.weight, s.weight_unit, chartUnit)
  if (metric === 'e1rm') return isEpleyEligible(s) ? Math.round(epley(weight, s.reps!)) : null
  if (metric === 'volume') return s.reps && weight > 0 ? s.reps * weight : null
  return null
}

// The working, line by line: Epley for Est. 1RM, the sum for Volume. Other
// metrics are the set itself, which the tooltip already shows.
export function pointMath(point: ProgressPoint, metric: ProgressMetric, workout: ExerciseHistoryWorkout | undefined, chartUnit: WeightUnit | null): string[] {
  if (!chartUnit) return []
  const format = metricFormatter(metric)
  if (metric === 'e1rm') {
    const s = point.set
    const lines = [
      s.reps === 1
        ? "A single, so it's the weight itself"
        : `${formatNumber(convertWeight(s.weight, s.weight_unit, chartUnit), 1)} × (1 + ${s.reps} ÷ 30) = ${format(point.value)}`,
    ]
    if (workout?.sets.some((x) => x.weight > 0 && (x.reps ?? 0) > 12)) lines.push('Sets over 12 reps are left out')
    return lines
  }
  if (metric === 'volume' && workout) {
    const parts = workout.sets.map((s) => setMetricValue('volume', s, chartUnit)).filter((v): v is number => v !== null)
    const sets = `${parts.length} ${parts.length === 1 ? 'set' : 'sets'}`
    if (parts.length === 1) return [`${sets}: ${format(point.value)} ${chartUnit}`]
    return [`${sets}: ${parts.map((v) => formatNumber(v, 1)).join(' + ')} = ${format(point.value)} ${chartUnit}`]
  }
  return []
}

function shortSet(s: ExerciseHistorySet, metric: ProgressMetric): string {
  return metric === 'e1rm' ? `${formatNumber(s.weight, 1)} × ${s.reps}` : `${formatNumber(s.weight, 1)} ${s.weight_unit} × ${s.reps}`
}

// "Previous: 145 × 8 on Oct 9 → 184 (▲ 6)": the session before this one,
// whatever range is showing. Null for the first session.
export function previousLine(points: ProgressPoint[], index: number, metric: ProgressMetric, unitLabel: string): string | null {
  if (index <= 0) return null
  const prev = points[index - 1]
  const cur = points[index]
  const format = metricFormatter(metric)
  const diff = Math.abs(cur.value - prev.value)
  const delta = format(diff) === format(0) ? 'same' : `${changeArrow(prev.value, cur.value)} ${format(diff)}`
  const value = `${format(prev.value)}${unitLabel ? ` ${unitLabel}` : ''}`
  const date = formatDate(prev.performedAt)
  if (metric === 'e1rm') return `Previous: ${shortSet(prev.set, metric)} on ${date} → ${format(prev.value)} (${delta})`
  return `Previous: ${value} on ${date} (${delta})`
}

// How each metric picks its number, for "This looks wrong".
export const METRIC_RULES: Record<ProgressMetric, string> = {
  e1rm: 'Epley, weight × (1 + reps ÷ 30), best set of 1 to 12 reps',
  heaviest: 'Heaviest set that day',
  volume: 'Weight × reps, added up over every set that day',
  reps: 'Most reps in one set that day',
  assist: 'Least assist in one set that day',
  level: 'Highest level that day, more reps breaking a tie',
  longest: 'Longest set that day',
  farthest: 'Farthest set that day',
}

export function isWeightMetric(metric: ProgressMetric): boolean {
  return WEIGHT_METRICS.includes(metric)
}
