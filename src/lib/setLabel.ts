import type { DistanceUnit, LoadType, WeightUnit } from './types'
import { formatSecondsAsClock } from './timedInput'

export interface TimedSetLike {
  durationSeconds: number | null
  distance: number | null
  distanceUnit: DistanceUnit | null
  incline: number | null
  calories: number | null
}

// Backlog item 76: a level exercise's set has no meaningful weight (the
// column is stored as 0 to satisfy the not-null constraint), so every place
// a set gets rendered needs to say "12 × Level 3" instead of "12 × 0 lb".
// Backlog item 78: a bodyweight set's weight column is just the optional
// added load (vest/dip belt), stored as 0 when none was entered -- "10 × BW"
// when there's no added weight, "8 × BW + 25 lb" when there is. Backlog item
// 79: an assisted set's weight column is the counterweight/assist amount --
// rendered as "10 × 40 lb assist" so it reads distinctly from a plain weight
// set (a bigger number here means an easier set, not a heavier one).
// Backlog item 93: a timed set has no reps/weight at all -- "20:00 · 2.1 mi ·
// Incline 3", "15:00 · Level 8", "1:00", depending on which fields its
// exercise tracks. `timed` is only read when `loadType` is 'timed'.
// Backlog item 98: calories has no unit and is appended last, e.g.
// "20:00 · 2.1 mi · Incline 3 · 210 cal".
export function formatSetLabel(
  loadType: LoadType,
  reps: number | null,
  weight: number,
  weightUnit: WeightUnit,
  level: number | null,
  timed?: TimedSetLike,
): string {
  if (loadType === 'timed') return formatTimedSetLabel(timed, level)
  if (loadType === 'level' && level !== null) return `${reps} × Level ${level}`
  if (loadType === 'bodyweight') return weight > 0 ? `${reps} × BW + ${weight} ${weightUnit}` : `${reps} × BW`
  if (loadType === 'assisted') return `${reps} × ${weight} ${weightUnit} assist`
  return `${reps} × ${weight} ${weightUnit}`
}

function formatTimedSetLabel(timed: TimedSetLike | undefined, level: number | null): string {
  if (!timed || timed.durationSeconds === null) return ''
  const parts = [formatSecondsAsClock(timed.durationSeconds)]
  if (timed.distance !== null) parts.push(`${timed.distance} ${timed.distanceUnit ?? 'mi'}`)
  if (timed.incline !== null) parts.push(`Incline ${timed.incline}`)
  if (level !== null) parts.push(`Level ${level}`)
  if (timed.calories !== null) parts.push(`${timed.calories} cal`)
  return parts.join(' · ')
}
