import type { WeightUnit } from './types'
import { DEFAULT_WEIGHT_STEP } from './repRecords'

// Issue #142 (Premium): a warm-up guide leading to the working weight, for a
// barbell or dumbbell lift with a target. A guide only: warm-ups aren't
// logged as sets and never touch records or volume. Uses only the target
// (itself from the lifter's own sets), never demographics. Pure; no
// bundled-library import, so the e2e unit spec can load it.

export type WarmupEquipment = 'barbell' | 'dumbbell'

export interface WarmupSet {
  weight: number
  reps: number
  // The empty bar (barbell only).
  bar: boolean
}

// Share of the working weight and reps, after the empty bar for a barbell.
const BARBELL_LADDER: [number, number][] = [
  [0.4, 5],
  [0.6, 3],
  [0.8, 1],
]
const DUMBBELL_LADDER: [number, number][] = [
  [0.4, 10],
  [0.6, 5],
  [0.8, 2],
]
const BAR_REPS = 10

export interface WarmupLoad {
  // Barbell: the bar's weight and the plates at the gym, in the target's unit.
  bar?: number
  plates?: number[]
}

function key(value: number): number {
  return Math.round(value * 100) / 100
}

// The jump between loadable weights: a pair of the smallest plate on a bar
// (any multiple of it can be loaded), else 5 lb / 2.5 kg dumbbells.
export function loadStep(equipment: WarmupEquipment, unit: WeightUnit, load: WarmupLoad = {}): number {
  const plates = (load.plates ?? []).filter((p) => p > 0)
  if (equipment === 'barbell' && plates.length > 0) return key(2 * Math.min(...plates))
  return DEFAULT_WEIGHT_STEP[unit]
}

// The nearest loadable weight (the lighter one on a tie), never below the
// bar or the lightest dumbbell.
export function roundToLoadable(weight: number, equipment: WarmupEquipment, unit: WeightUnit, load: WarmupLoad = {}): number {
  const step = loadStep(equipment, unit, load)
  const base = equipment === 'barbell' ? (load.bar ?? 0) : 0
  const steps = Math.max(0, Math.ceil((weight - base) / step - 0.5 - 1e-9))
  return key(Math.max(base + steps * step, equipment === 'barbell' ? base : step))
}

// Rounded down instead (for a starting weight, where lighter is the safe side).
export function roundDownToLoadable(weight: number, equipment: WarmupEquipment | null, unit: WeightUnit, load: WarmupLoad = {}): number {
  const kind = equipment ?? 'dumbbell'
  const step = loadStep(kind, unit, load)
  const base = kind === 'barbell' ? (load.bar ?? 0) : 0
  const steps = Math.max(0, Math.floor((weight - base) / step + 1e-9))
  return key(Math.max(base + steps * step, kind === 'barbell' ? base : step))
}

// The ladder up to `working`: each line lighter than the working weight and
// heavier than the line before it, so a light target gets a shorter list.
export function buildWarmup(working: number, equipment: WarmupEquipment, unit: WeightUnit, load: WarmupLoad = {}): WarmupSet[] {
  const sets: WarmupSet[] = []
  let previous = 0
  if (equipment === 'barbell') {
    const bar = load.bar ?? 0
    if (bar <= 0 || working <= bar) return []
    sets.push({ weight: bar, reps: BAR_REPS, bar: true })
    previous = bar
  }
  for (const [share, reps] of equipment === 'barbell' ? BARBELL_LADDER : DUMBBELL_LADDER) {
    const weight = roundToLoadable(working * share, equipment, unit, load)
    if (weight <= previous || weight >= working) continue
    sets.push({ weight, reps, bar: false })
    previous = weight
  }
  return sets
}
