import type { LoadType, WeightUnit } from './types'
import type { ExerciseHistoryWorkout } from './exerciseHistory'
import { buildProgressSeries, isFlippedMetric, metricsFor } from './progressSeries'

// Issue #133: plateau calls (Premium, under #132's progress gating). A lift is
// flat when, since its last new best on its default metric (est. 1RM for
// weight lifts, the only metric for the rest), it has logged at least
// FLAT_MIN_SESSIONS more sessions spanning at least FLAT_MIN_DAYS. Timed lifts
// are skipped. A new best moves the best forward, so it clears the flag.

export const FLAT_MIN_SESSIONS = 4
export const FLAT_MIN_DAYS = 21

const DAY_MS = 86_400_000

// The date of the last new best when the lift is flat, else null.
// `workouts` in any order (ExerciseHistoryWorkout lists are newest first).
export function flatSince(
  loadType: LoadType,
  tracksDistance: boolean,
  workouts: ExerciseHistoryWorkout[],
  preferredUnit: WeightUnit | null = null,
): string | null {
  if (loadType === 'timed') return null
  const metric = metricsFor(loadType, tracksDistance)[0]
  const flipped = isFlippedMetric(metric)
  const { points } = buildProgressSeries(workouts, metric, preferredUnit)
  if (points.length === 0) return null
  // Only a strictly better session is a new best; matching it isn't.
  let bestIndex = 0
  points.forEach((p, i) => {
    const best = points[bestIndex].value
    if (flipped ? p.value < best : p.value > best) bestIndex = i
  })
  const sessionsSince = points.length - 1 - bestIndex
  const best = points[bestIndex]
  const latest = points[points.length - 1]
  const span = new Date(latest.performedAt).getTime() - new Date(best.performedAt).getTime()
  return sessionsSince >= FLAT_MIN_SESSIONS && span >= FLAT_MIN_DAYS * DAY_MS ? best.performedAt : null
}

// The one fix to try, by load type. Plain and encouraging.
export function plateauTip(loadType: LoadType): string {
  switch (loadType) {
    case 'bodyweight':
      return 'Try a slow 3-second lowering on every rep for 3 weeks.'
    case 'assisted':
      return 'Try a lighter week with a little more assist, then work back down.'
    case 'level':
      return 'Try a lighter week a level or two down, then build back up.'
    default:
      return 'Try a lighter week (about 10% off), or switch to 5 to 8 reps for 3 weeks.'
  }
}
