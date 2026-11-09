// Backlog item 6 (volume), reworked by item 106: the post-finish recap's
// volume numbers. Pure computation, kept separate from the store so the
// per-load-type rule is readable on its own.
import type { LoadType, WeightUnit } from './types'
import { bodyWeightAt, convertWeight, type BodyWeightEntryLike } from './bodyStats'

// A workout's sets should all share one unit in practice, but nothing
// enforces that — take whichever unit appears most often so a stray mixed
// entry can't flip the whole label. Defaults to 'lb' for a zero-set list.
export function modeWeightUnit(sets: { weight_unit: WeightUnit }[]): WeightUnit {
  if (sets.length === 0) return 'lb'
  const counts = new Map<WeightUnit, number>()
  for (const s of sets) counts.set(s.weight_unit, (counts.get(s.weight_unit) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

export type VolumeSet = { reps: number | null; weight: number; weight_unit: WeightUnit; exercises?: { load_type: LoadType } | null }

// Backlog item 76: level exercises are excluded from volume entirely
// (difficulty levels aren't linear, so there's no "each level ≈ X lb" scale
// factor) — not counted as 0, which would make a level-only set look like a
// volume collapse. Backlog item 78: a bodyweight set's real load is body
// weight (at the workout's performed_at, item 77's bodyWeightAt) plus its own
// added-weight column — also excluded (not 0) when no body weight is on file
// yet for that moment, same "skip, don't zero" rule as level. Backlog item
// 79: an assisted set's real load is body weight minus its assist column
// (clamped at 0), same "skip, don't zero" exclusion when body weight isn't
// on file. Backlog item 93: a timed set has no reps/weight at all (both are
// null/0), same exclusion.
export function setVolume(s: VolumeSet, performedAt: string, bodyWeightEntries: BodyWeightEntryLike[]): number | null {
  const loadType = s.exercises?.load_type ?? 'weight'
  if (loadType === 'level' || loadType === 'timed') return null
  if (loadType === 'bodyweight' || loadType === 'assisted') {
    const bodyWeight = bodyWeightAt(bodyWeightEntries, performedAt, s.weight_unit)
    if (bodyWeight === null) return null
    return (s.reps ?? 0) * (loadType === 'assisted' ? Math.max(bodyWeight - s.weight, 0) : bodyWeight + s.weight)
  }
  return (s.reps ?? 0) * s.weight
}

// Total volume of one workout, plus whether any set counted at all — a
// level/timed-only workout is "no volume", not "0 lb". Each set is converted
// into `unit` first, so a lb history shown to a kg user (issue #53) or a
// mixed-unit workout adds up correctly.
export function workoutVolume(
  sets: VolumeSet[],
  performedAt: string,
  bodyWeightEntries: BodyWeightEntryLike[],
  unit: WeightUnit,
): { total: number; counted: boolean } {
  let total = 0
  let counted = false
  for (const s of sets) {
    const v = setVolume(s, performedAt, bodyWeightEntries)
    if (v === null) continue
    total += convertWeight(v, s.weight_unit, unit)
    counted = true
  }
  return { total, counted }
}
