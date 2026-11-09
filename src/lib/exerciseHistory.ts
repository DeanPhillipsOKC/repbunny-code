import type { DistanceUnit, WeightUnit } from './types'

// Backlog item 1: exercise-by-exercise history detail. Pure grouping/summary
// helpers kept separate from the store, same pattern as progress.ts/volume.ts.

export interface ExerciseHistorySet {
  id: string
  reps: number | null
  weight: number
  weight_unit: WeightUnit
  rpe: number | null
  level: number | null
  duration_seconds: number | null
  distance: number | null
  distance_unit: DistanceUnit | null
  incline: number | null
  calories: number | null
}

export interface ExerciseHistoryWorkout {
  workoutId: string
  performedAt: string
  // Issue #181: the session card's subtitle. Null for a freeform workout,
  // absent where a caller builds history for its own math.
  templateName?: string | null
  sets: ExerciseHistorySet[]
}

// Heaviest completed set kept separate per weight unit rather than converted
// -- lb and kg aren't otherwise converted anywhere in this app, so combining
// them into one number would silently misrepresent whichever unit lost the
// comparison. Only units actually present in the history show up in the
// result.
export function heaviestSetByUnit(workouts: ExerciseHistoryWorkout[]): Partial<Record<WeightUnit, number>> {
  const heaviest: Partial<Record<WeightUnit, number>> = {}
  for (const w of workouts) {
    for (const s of w.sets) {
      const current = heaviest[s.weight_unit]
      if (current === undefined || s.weight > current) {
        heaviest[s.weight_unit] = s.weight
      }
    }
  }
  return heaviest
}

// Backlog item 76: a level exercise's weight is always 0 (see SetEntry.level),
// so heaviestSetByUnit above is meaningless for one — ExerciseHistoryDetail.vue
// shows this summary instead. Same "higher level, or same level with more
// reps" comparison as progress.ts's beatsBest, applied here since this file
// only ever sees one exercise's own sets at a time (not the per-exercise Map
// that comparison normally keys off).
export function bestLevelSet(workouts: ExerciseHistoryWorkout[]): { level: number; reps: number } | null {
  let best: { level: number; reps: number } | null = null
  for (const w of workouts) {
    for (const s of w.sets) {
      if (s.level === null) continue
      const reps = s.reps ?? 0
      if (!best || s.level > best.level || (s.level === best.level && reps > best.reps)) {
        best = { level: s.level, reps }
      }
    }
  }
  return best
}

// Backlog item 79: an assisted exercise's weight column is how much the
// machine is helping, so heaviestSetByUnit's "bigger is better" assumption
// is inverted for it -- less assist is the harder, better set. Kept as its
// own function (not a flag on heaviestSetByUnit) since the two summaries
// read from opposite ends of the same column.
export function leastAssistByUnit(workouts: ExerciseHistoryWorkout[]): Partial<Record<WeightUnit, number>> {
  const least: Partial<Record<WeightUnit, number>> = {}
  for (const w of workouts) {
    for (const s of w.sets) {
      const current = least[s.weight_unit]
      if (current === undefined || s.weight < current) {
        least[s.weight_unit] = s.weight
      }
    }
  }
  return least
}

// Backlog item 94: a timed exercise's weight/reps columns are meaningless
// (see the item 93 comment on isTimedExercise), so it gets its own
// duration-based summary. Every timed set has a duration, so this is null
// only when there are no sets at all.
export function longestDuration(workouts: ExerciseHistoryWorkout[]): number | null {
  let longest: number | null = null
  for (const w of workouts) {
    for (const s of w.sets) {
      if (s.duration_seconds === null) continue
      if (longest === null || s.duration_seconds > longest) longest = s.duration_seconds
    }
  }
  return longest
}

// Distance is optional per timed set (only exercises with tracks_distance
// ask for it), so this stays empty for a duration-only exercise -- same
// per-unit-kept-separate reasoning as heaviestSetByUnit.
export function farthestDistanceByUnit(workouts: ExerciseHistoryWorkout[]): Partial<Record<DistanceUnit, number>> {
  const farthest: Partial<Record<DistanceUnit, number>> = {}
  for (const w of workouts) {
    for (const s of w.sets) {
      if (s.distance === null || s.distance_unit === null) continue
      const current = farthest[s.distance_unit]
      if (current === undefined || s.distance > current) {
        farthest[s.distance_unit] = s.distance
      }
    }
  }
  return farthest
}
