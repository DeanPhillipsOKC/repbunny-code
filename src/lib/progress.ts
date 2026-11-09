import type { LoadType, WeightUnit } from './types'
import { bodyWeightAt, convertWeight, type BodyWeightEntryLike } from './bodyStats'

// Backlog item 76: a set's "personal record" comparison depends on its
// exercise's load type — a level exercise's weight column is always 0 (not
// linear, so no lb-equivalent scale factor), so the plain reps*weight volume
// rule from before this item would never register a level PR at all. Every
// PR comparison in this file (and checkForRecord in stores/workouts.ts, which
// shares this rule) goes through this one marker/comparator pair instead of
// each keeping its own ad hoc "best number so far".
export interface SetMarker {
  loadType: LoadType
  level: number | null
  reps: number
  weight: number
  // Issue #573: the unit weight and effectiveLoad are in, so beatsBest can
  // compare a lb set with a kg one instead of their raw numbers.
  weightUnit: WeightUnit
  // Backlog item 78: reps * effectiveLoad is a bodyweight set's real "PR"
  // volume (body weight + added weight, not just the added-weight column).
  // null when body weight wasn't on file at the time this set was logged —
  // beatsBest falls back to a reps/added-weight comparison in that case.
  // Unused (always null) for every other load type.
  effectiveLoad: number | null
  // Issue #580: when the set was logged, so the record celebration can name
  // the set it beat. Absent on candidates and the zero marker.
  performedAt?: string
}

export const ZERO_MARKER: SetMarker = { loadType: 'weight', level: null, reps: 0, weight: 0, weightUnit: 'lb', effectiveLoad: null }

// Backlog item 78: computed once here so every call site (this file's own
// findRecentPr/findPrWorkoutIds, plus stores/workouts.ts's checkForRecord/
// getBestMarker) shares the exact same "body weight at the time this set was
// logged" rule as volume.ts.
// Backlog item 79: an assisted set's effective load is body weight minus the
// assist amount (clamped at 0 -- a machine can't assist for more than the
// user's full body weight), the opposite direction from bodyweight's
// body-weight-plus-added-weight above.
export function computeEffectiveLoad(
  loadType: LoadType,
  weight: number,
  weightUnit: WeightUnit,
  performedAt: string,
  bodyWeightEntries: BodyWeightEntryLike[],
): number | null {
  if (loadType !== 'bodyweight' && loadType !== 'assisted') return null
  const bodyWeight = bodyWeightAt(bodyWeightEntries, performedAt, weightUnit)
  if (bodyWeight === null) return null
  return loadType === 'assisted' ? Math.max(bodyWeight - weight, 0) : bodyWeight + weight
}

// A level exercise's sets only ever compare against other sets of the same
// exercise (load type can't change once an exercise has logged sets — see
// docs/backlog.md item 76), so `candidate`/`previousBest` are always the
// same load type in practice; the branch below is keyed on `candidate` alone.
export function beatsBest(candidate: SetMarker, previousBest: SetMarker): boolean {
  if (candidate.loadType === 'level') {
    if (candidate.level === null) return false
    if (previousBest.level === null) return true
    if (candidate.level !== previousBest.level) return candidate.level > previousBest.level
    return candidate.reps > previousBest.reps
  }
  // Backlog item 78: PRs use effective-load volume when body weight is known
  // for both sides of the comparison; otherwise there's no meaningful
  // lb-reps number to compare at all, so fall back to most reps (added
  // weight as the tiebreak), per docs/backlog.md item 78. Backlog item 79:
  // assisted shares this effective-load comparison (a bigger number there
  // already means less assist, i.e. harder), but its fallback tiebreak
  // inverts -- less assist beats more when body weight isn't on file to
  // compare effective load at all.
  // Issue #573: compare in the candidate's unit, so a lb set and a kg set
  // are weighed by what they lift, not by their raw numbers.
  const previousWeight = convertWeight(previousBest.weight, previousBest.weightUnit, candidate.weightUnit)
  if (candidate.loadType === 'bodyweight' || candidate.loadType === 'assisted') {
    if (candidate.effectiveLoad !== null && previousBest.effectiveLoad !== null) {
      const previousLoad = convertWeight(previousBest.effectiveLoad, previousBest.weightUnit, candidate.weightUnit)
      return candidate.reps * candidate.effectiveLoad > previousBest.reps * previousLoad
    }
    if (candidate.reps !== previousBest.reps) return candidate.reps > previousBest.reps
    if (candidate.loadType === 'assisted') return candidate.weight < previousWeight
    return candidate.weight > previousWeight
  }
  return candidate.reps * candidate.weight > previousBest.reps * previousWeight
}

// Backlog item 19: Log home screen's "recent PR" stat. Recomputed on load
// from the most recent workout's sets rather than persisted (see
// docs/backlog.md#19 for why) — pure computation, kept separate from the
// store so it's readable/testable on its own, same pattern as volume.ts.
export interface RecentSet {
  exerciseId: string
  exerciseName: string
  reps: number
  weight: number
  weightUnit: WeightUnit
  loadType: LoadType
  level: number | null
  performedAt: string
}

export interface HistoricalSet {
  exerciseId: string
  reps: number
  weight: number
  weightUnit: WeightUnit
  loadType: LoadType
  level: number | null
  performedAt: string
}

export interface RecentPr {
  exerciseName: string
  reps: number
  weight: number
  weightUnit: WeightUnit
  loadType: LoadType
  level: number | null
}

// Same "strictly beats the prior best" rule as checkForRecord in
// stores/workouts.ts (backlog item 4), just replayed against the most
// recent workout's sets instead of reacting to a single insert. Returns the
// first set (in set order) that beat its prior all-time best — item 44's
// celebratory PR tile needs the reps/weight themselves, not just the
// exercise name — or null if nothing in the workout was a record.
export function findRecentPr(
  recentSets: RecentSet[],
  historicalSets: HistoricalSet[],
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): RecentPr | null {
  const bestHistorical = new Map<string, SetMarker>()
  for (const s of historicalSets) {
    const marker: SetMarker = {
      loadType: s.loadType,
      level: s.level,
      reps: s.reps,
      weight: s.weight,
      weightUnit: s.weightUnit,
      effectiveLoad: computeEffectiveLoad(s.loadType, s.weight, s.weightUnit, s.performedAt, bodyWeightEntries),
    }
    const previous = bestHistorical.get(s.exerciseId)
    if (!previous) {
      bestHistorical.set(s.exerciseId, marker)
    } else if (beatsBest(marker, previous)) {
      bestHistorical.set(s.exerciseId, marker)
    }
  }

  for (const s of recentSets) {
    const marker: SetMarker = {
      loadType: s.loadType,
      level: s.level,
      reps: s.reps,
      weight: s.weight,
      weightUnit: s.weightUnit,
      effectiveLoad: computeEffectiveLoad(s.loadType, s.weight, s.weightUnit, s.performedAt, bodyWeightEntries),
    }
    const previous = bestHistorical.get(s.exerciseId)
    if (!previous) {
      bestHistorical.set(s.exerciseId, marker)
      continue
    }
    if (beatsBest(marker, previous)) {
      return {
        exerciseName: s.exerciseName,
        reps: s.reps,
        weight: s.weight,
        weightUnit: s.weightUnit,
        loadType: s.loadType,
        level: s.level,
      }
    }
  }
  return null
}

export interface HistoryWorkoutForPr {
  id: string
  performed_at: string
  sets: {
    id: string
    exercise_id: string
    reps: number | null
    weight: number
    weight_unit: WeightUnit
    level: number | null
    exercises?: { load_type: LoadType } | null
  }[]
}

// Backlog item 45: History's timeline PR marker. Same "strictly beats the
// prior best" rule as checkForRecord/findRecentPr above, replayed
// chronologically across the whole history (oldest first, since a set can
// only be a record relative to what came before it) to mark every workout
// that contained one, not just the most recent.
export function findPrWorkoutIds(
  workouts: HistoryWorkoutForPr[],
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): Set<string> {
  return new Set(findFirstPrSets(workouts, bodyWeightEntries).keys())
}

// Issue #579: the first record set in each workout that had one, so the
// Workout log's "PR set this workout" can open that set's record check.
export function findFirstPrSets(
  workouts: HistoryWorkoutForPr[],
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): Map<string, { setId: string; exerciseId: string }> {
  const chronological = [...workouts].sort(
    (a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
  )

  const bestSoFar = new Map<string, SetMarker>()
  const firstPrs = new Map<string, { setId: string; exerciseId: string }>()
  for (const w of chronological) {
    for (const s of w.sets) {
      const loadType = s.exercises?.load_type ?? 'weight'
      // Backlog item 93: no record celebration/marker for timed sets in v1
      // (they have no reps to compare against a prior best).
      if (loadType === 'timed') continue
      const marker: SetMarker = {
        loadType,
        level: s.level,
        reps: s.reps ?? 0,
        weight: s.weight,
        weightUnit: s.weight_unit,
        effectiveLoad: computeEffectiveLoad(loadType, s.weight, s.weight_unit, w.performed_at, bodyWeightEntries),
      }
      const previous = bestSoFar.get(s.exercise_id)
      if (!previous) {
        bestSoFar.set(s.exercise_id, marker)
      } else if (beatsBest(marker, previous)) {
        bestSoFar.set(s.exercise_id, marker)
        if (!firstPrs.has(w.id)) firstPrs.set(w.id, { setId: s.id, exerciseId: s.exercise_id })
      }
    }
  }
  return firstPrs
}
