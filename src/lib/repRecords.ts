import type { WeightUnit } from './types'
import type { ExerciseHistoryWorkout } from './exerciseHistory'
import { convertWeight, mostUsedWeightUnit } from './progressSeries'

// Replaces #45's rep-max table, which compared a many-rep set against an
// estimated 1RM. Both cards here only compare a weight with its own past:
// the most reps done at each weight, and a double-progression "next time"
// target. Design: docs/design/issue-45-rep-records.html. Pure, in the
// chart's unit (mixed lb/kg converted) like progressSeries.ts.

export interface RepRange {
  min: number
  max: number
}

export const DEFAULT_REP_RANGE: RepRange = { min: 8, max: 12 }
export const DEFAULT_WEIGHT_STEP: Record<WeightUnit, number> = { lb: 5, kg: 2.5 }

// The weight jump and rep range the target math uses. `step` is per unit,
// since the target is in whichever unit the history is in. Issue #60 cut
// #54's per-exercise jump and range, so these are always derived.
export interface Progression {
  step: Record<WeightUnit, number>
  range: RepRange
}

export const DEFAULT_PROGRESSION: Progression = { step: DEFAULT_WEIGHT_STEP, range: DEFAULT_REP_RANGE }

// A barbell's 2x the smallest plate at the gym (a plate goes on each side),
// else 5 lb / 2.5 kg. `barbell` is lib/plates.ts usesBarbell(exercise),
// passed in so this file stays importable without the bundled library JSON
// (the e2e unit specs).
export function weightStepFor(unit: WeightUnit, plates: Record<WeightUnit, number[]>, barbell: boolean): number {
  const list = plates[unit] ?? []
  if (barbell && list.length > 0) return key(2 * Math.min(...list))
  return DEFAULT_WEIGHT_STEP[unit]
}

export function progressionFor(plates: Record<WeightUnit, number[]>, barbell: boolean): Progression {
  return {
    step: { lb: weightStepFor('lb', plates, barbell), kg: weightStepFor('kg', plates, barbell) },
    range: DEFAULT_REP_RANGE,
  }
}

export interface WeightRecord {
  weight: number
  reps: number
  // The earliest workout where these reps were hit at this weight.
  performedAt: string
}

export interface NextTarget {
  weight: number
  reps: number
  // Going up a weight because the last one hit the top of the range.
  goUp: boolean
  // Best reps at `weight` so far (0 if never done), for the range strip.
  best: number
  why: string
}

export interface RepRecords {
  unit: WeightUnit
  // The jump (in `unit`) and range the target was worked out with.
  step: number
  range: RepRange
  // Heaviest first.
  records: WeightRecord[]
  // The heaviest weight in the most recent workout.
  lastWeight: number | null
  next: NextTarget | null
}

// Converted weights like 100 kg -> 220.462 lb group to one decimal.
function key(weight: number): number {
  return Math.round(weight * 10) / 10
}

export function formatWeight(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// `preferredUnit` is the profile's unit (issue #53); null = the history's most-used.
export function buildRepRecords(
  workouts: ExerciseHistoryWorkout[],
  preferredUnit: WeightUnit | null = null,
  progression: Progression = DEFAULT_PROGRESSION,
): RepRecords | null {
  const unit = preferredUnit ?? mostUsedWeightUnit(workouts) ?? 'lb'
  const oldestFirst = [...workouts].sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime())

  const byWeight = new Map<number, WeightRecord>()
  let lastWeight: number | null = null
  for (const w of oldestFirst) {
    let heaviest: number | null = null
    for (const s of w.sets) {
      if (s.reps === null || s.reps < 1 || s.weight <= 0) continue
      const weight = key(convertWeight(s.weight, s.weight_unit, unit))
      const current = byWeight.get(weight)
      // Strictly more reps wins, so a tie keeps the earliest date.
      if (!current || s.reps > current.reps) byWeight.set(weight, { weight, reps: s.reps, performedAt: w.performedAt })
      if (heaviest === null || weight > heaviest) heaviest = weight
    }
    if (heaviest !== null) lastWeight = heaviest
  }

  if (byWeight.size === 0) return null
  const records = [...byWeight.values()].sort((a, b) => b.weight - a.weight)
  const step = progression.step[unit]
  const { range } = progression
  return {
    unit,
    step,
    range,
    records,
    lastWeight,
    next: lastWeight === null ? null : nextTarget(byWeight, lastWeight, unit, step, range),
  }
}

function nextTarget(
  byWeight: Map<number, WeightRecord>,
  lastWeight: number,
  unit: WeightUnit,
  step: number,
  { min, max }: RepRange,
): NextTarget {
  const u = ` ${unit}`
  const atLast = byWeight.get(lastWeight)!
  if (atLast.reps < max) {
    const why =
      atLast.reps < min
        ? `Your best at ${formatWeight(lastWeight)} is ${atLast.reps}. Build up to ${min} before adding weight.`
        : `Beat your ${atLast.reps} from ${formatDay(atLast.performedAt)}. Hit ${max} and it's time to go up to ${formatWeight(key(lastWeight + step))}.`
    return { weight: lastWeight, reps: atLast.reps + 1, goUp: false, best: atLast.reps, why }
  }

  // Hit the top of the range: go up, past any heavier weight already topped.
  let from = atLast
  let weight = key(lastWeight + step)
  while ((byWeight.get(weight)?.reps ?? 0) >= max) {
    from = byWeight.get(weight)!
    weight = key(weight + step)
  }
  const best = byWeight.get(weight)?.reps ?? 0
  const hit = `You hit ${from.reps} at ${formatWeight(from.weight)}${u} on ${formatDay(from.performedAt)}.`
  const why =
    best === 0
      ? `${hit} First time at ${formatWeight(weight)}, so aim for ${min}.`
      : `${hit} Your best at ${formatWeight(weight)} is ${best}, so aim for ${best + 1}.`
  return { weight, reps: best === 0 ? min : best + 1, goUp: true, best, why }
}
