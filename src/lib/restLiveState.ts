// Issue #143: the lock-screen rest timer's shared state rules. The native
// side (android/.../RestLive.java, ios/App/App/RestLiveShared.swift) keeps
// its own copy of the running rest so its +15s / Skip buttons
// work while the app is suspended or killed; stores/rest.ts reconciles with
// it whenever the app wakes. Kept free of Vue and Capacitor so
// e2e/rest-live-unit.spec.ts can run it in Node.

export type RestLiveStatus = 'running' | 'skipped' | 'done'

// The app's own rest (stores/rest.ts activeRest), as far as syncing goes.
export interface AppRest {
  id: number
  exerciseName: string
  endsAt: number
  totalSeconds: number
}

// What the native side holds for the rest it's showing.
export interface NativeRest extends AppRest {
  workoutId: string | null
  status: RestLiveStatus
}

// +15s from the lock screen. Same rule as the in-app button
// (stores/rest.ts adjust): time is added to what's left, and the progress
// bar's total only grows past it. RestLive.java and RestLiveShared.swift
// mirror this.
export function addRestTime(rest: NativeRest, seconds: number, now: number): NativeRest {
  if (rest.status !== 'running') return rest
  const endsAt = Math.max(now, rest.endsAt) + seconds * 1000
  return { ...rest, endsAt, totalSeconds: Math.max(rest.totalSeconds, Math.ceil((endsAt - now) / 1000)) }
}

export function skipRest(rest: NativeRest): NativeRest {
  return rest.status === 'running' ? { ...rest, status: 'skipped' } : rest
}

export type RestSync =
  | { kind: 'none' }
  | { kind: 'skip' }
  | { kind: 'update'; endsAt: number; totalSeconds: number }
  | { kind: 'restore'; rest: AppRest }

// A restored rest needs at least this long left to be worth showing.
const RESTORE_MIN_MS = 1000

// What the app should do so it agrees with the lock screen.
// - Same rest, skipped there: skip it here.
// - Same rest, moved there (+15s): take its end time.
// - No rest here (the app was killed and reopened), but one still running
//   there for the workout that's active again: bring it back.
// Anything else (a different rest, one that already ran out, no native
// state because alerts are off) leaves the app alone.
export function reconcileRest(
  app: AppRest | null,
  native: NativeRest | null,
  activeWorkoutId: string | null,
  now: number,
): RestSync {
  if (!native) return { kind: 'none' }
  if (app) {
    if (native.id !== app.id) return { kind: 'none' }
    if (native.status === 'skipped') return { kind: 'skip' }
    if (native.status === 'running' && (native.endsAt !== app.endsAt || native.totalSeconds !== app.totalSeconds)) {
      return { kind: 'update', endsAt: native.endsAt, totalSeconds: native.totalSeconds }
    }
    return { kind: 'none' }
  }
  if (
    native.status === 'running' &&
    activeWorkoutId !== null &&
    native.workoutId === activeWorkoutId &&
    native.endsAt - now >= RESTORE_MIN_MS
  ) {
    const { id, exerciseName, endsAt, totalSeconds } = native
    return { kind: 'restore', rest: { id, exerciseName, endsAt, totalSeconds } }
  }
  return { kind: 'none' }
}
