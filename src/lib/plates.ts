import { libraryEntry } from './exerciseLibrary'
import type { BarType, Exercise, WeightUnit } from './types'

// Issue #22: the plate calculator. Design source:
// docs/design/issue-22-plate-calculator.html.

// Every plate size the "Plates at my gym" grid offers, heaviest first. The
// defaults (profiles.plates_lb/plates_kg) are a subset of these.
export const ALL_PLATES: Record<WeightUnit, number[]> = {
  lb: [55, 45, 35, 25, 10, 5, 2.5, 1.25],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
}

export const DEFAULT_PLATES: Record<WeightUnit, number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
}

export const BAR_OPTIONS: { value: Exclude<BarType, 'custom'>; label: string; lb: number; kg: number }[] = [
  { value: 'standard', label: 'Standard', lb: 45, kg: 20 },
  { value: 'womens', label: "Women's", lb: 35, kg: 15 },
  { value: 'ez', label: 'EZ curl', lb: 25, kg: 10 },
]

// Same size order as ALL_PLATES, so a 45 lb and a 20 kg plate (the
// "standard" plate in each unit) share a color, as do their neighbors.
const PLATE_STYLES = [
  { color: 'var(--danger)', height: 100, width: 15 },
  { color: 'var(--accent)', height: 96, width: 14 },
  { color: 'var(--highlight)', height: 86, width: 12 },
  { color: 'var(--secondary)', height: 74, width: 11 },
  { color: 'var(--success)', height: 56, width: 9 },
  { color: 'var(--text-dim)', height: 42, width: 7 },
  { color: '#e8dcef', height: 32, width: 6 },
  { color: '#8b7896', height: 24, width: 5 },
]

export function plateStyle(plate: number, unit: WeightUnit) {
  const index = ALL_PLATES[unit].indexOf(plate)
  return PLATE_STYLES[index === -1 ? PLATE_STYLES.length - 1 : index]
}

// Issue #461: a custom exercise has no library entry, so its name decides.
// A whole word for a bar ("Romanian Deadlift (Barbell)", "Trap Bar Deadlift",
// "Smith Squat") means yes; dumbbells, kettlebells, cables, and machines
// (other than Smith) mean no, and "X or Y" is undecided like the library.
export function nameSuggestsBarbell(name: string): boolean {
  const words = ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
  if (words.includes(' or ')) return false
  if (/ (dumbbell|dumbbells|kettlebell|kettlebells|cable|cables) /.test(words)) return false
  if (words.includes(' machine ') && !words.includes(' smith ')) return false
  return / (barbell|ez bar|ez curl bar|trap bar|hex bar|smith) /.test(words)
}

// "Uses a barbell" when the user hasn't decided yet (uses_barbell null):
// a library exercise whose equipment is a bar, or a custom exercise whose
// name says so. "Barbell or dumbbells" style entries don't count, since
// either could be in use.
export function guessUsesBarbell(libraryId: string | null, name = ''): boolean {
  const entry = libraryId ? libraryEntry(libraryId) : null
  if (!entry) return nameSuggestsBarbell(name)
  if (entry.loadType !== 'weight') return false
  const equipment = entry.equipment.toLowerCase()
  if (equipment.includes(' or ')) return false
  return /^(barbell|ez-curl bar|ez-bar|trap bar|smith machine)/.test(equipment)
}

export function usesBarbell(exercise: Pick<Exercise, 'load_type' | 'uses_barbell' | 'library_id' | 'name'>): boolean {
  if (exercise.load_type !== 'weight') return false
  return exercise.uses_barbell ?? guessUsesBarbell(exercise.library_id, exercise.name)
}

const LB_PER_KG = 2.20462

export function barWeight(
  exercise: Pick<Exercise, 'bar_type' | 'bar_custom_weight' | 'bar_custom_unit'>,
  unit: WeightUnit,
): number {
  if (exercise.bar_type === 'custom' && exercise.bar_custom_weight) {
    const from = exercise.bar_custom_unit ?? unit
    if (from === unit) return exercise.bar_custom_weight
    const converted = unit === 'kg' ? exercise.bar_custom_weight / LB_PER_KG : exercise.bar_custom_weight * LB_PER_KG
    return Math.round(converted * 2) / 2
  }
  const option = BAR_OPTIONS.find((o) => o.value === exercise.bar_type) ?? BAR_OPTIONS[0]
  return option[unit]
}

export function barLabel(exercise: Pick<Exercise, 'bar_type'>): string {
  if (exercise.bar_type === 'custom') return 'custom'
  return (BAR_OPTIONS.find((o) => o.value === exercise.bar_type) ?? BAR_OPTIONS[0]).label.toLowerCase()
}

export interface PlateLoad {
  total: number
  // One side of the bar, heaviest (innermost) first.
  perSide: number[]
}

export interface PlateResult {
  exact: PlateLoad | null
  below: PlateLoad | null
  above: PlateLoad | null
}

// Every plate size here is a multiple of 0.25, so work in quarter units to
// keep the search in integers.
const Q = 4

// Fewest plates per side that add up to each reachable per-side amount, up to
// `maxUnits` (unbounded supply of each enabled plate).
function perSideTable(plates: number[], maxUnits: number): (number[] | null)[] {
  const sizes = [...plates].sort((a, b) => b - a).map((p) => Math.round(p * Q))
  const best: (number[] | null)[] = new Array(maxUnits + 1).fill(null)
  best[0] = []
  for (let amount = 1; amount <= maxUnits; amount++) {
    for (const size of sizes) {
      const rest = amount - size
      if (rest < 0) continue
      const prev = best[rest]
      if (prev && (!best[amount] || prev.length + 1 < best[amount]!.length)) {
        best[amount] = [...prev, size]
      }
    }
  }
  return best
}

function toLoad(bar: number, units: number, combo: number[]): PlateLoad {
  return {
    total: bar + (2 * units) / Q,
    perSide: combo.map((u) => u / Q).sort((a, b) => b - a),
  }
}

export function loadBar(target: number, bar: number, plates: number[]): PlateResult {
  const enabled = plates.filter((p) => p > 0)
  const perSide = (target - bar) / 2
  if (enabled.length === 0) {
    const empty: PlateLoad = { total: bar, perSide: [] }
    if (target === bar) return { exact: empty, below: null, above: null }
    return { exact: null, below: target > bar ? empty : null, above: target < bar ? empty : null }
  }
  if (perSide < 0) return { exact: null, below: null, above: { total: bar, perSide: [] } }

  const targetUnits = perSide * Q
  const maxUnits = Math.ceil(targetUnits) + Math.round(Math.max(...enabled) * Q)
  const table = perSideTable(enabled, maxUnits)

  if (Number.isInteger(targetUnits) && table[targetUnits]) {
    return { exact: toLoad(bar, targetUnits, table[targetUnits]!), below: null, above: null }
  }
  let below: PlateLoad | null = null
  for (let u = Math.floor(targetUnits); u >= 0; u--) {
    if (u === targetUnits) continue
    if (table[u]) {
      below = toLoad(bar, u, table[u]!)
      break
    }
  }
  let above: PlateLoad | null = null
  for (let u = Math.ceil(targetUnits); u <= maxUnits; u++) {
    if (u === targetUnits) continue
    if (table[u]) {
      above = toLoad(bar, u, table[u]!)
      break
    }
  }
  return { exact: null, below, above }
}

// The − / + steppers move by the smallest pair you can add.
export function plateStep(plates: number[]): number {
  const enabled = plates.filter((p) => p > 0)
  return enabled.length ? 2 * Math.min(...enabled) : 5
}

export function formatWeight(value: number): string {
  return String(Math.round(value * 100) / 100)
}
