// Issue #266: how long a workout took, from its start to the last Finish tap.

// Whole minutes between start and finish, or null when there's no finish time
// (older workouts, or one that's still open) or it doesn't make sense.
export function workoutMinutes(performedAt: string, finishedAt: string | null | undefined): number | null {
  if (!finishedAt) return null
  const ms = new Date(finishedAt).getTime() - new Date(performedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.max(1, Math.round(ms / 60000))
}

// "52 min", or "1 h 5 min" from an hour up.
export function formatWorkoutLength(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
