// Issue #42: the one-time "check your exercises" screen auto-opens once per
// device. Either of its buttons sets this key. localStorage can throw
// (private mode, blocked site data), and then the screen just never
// auto-opens; it stays reachable from the Exercises tab.
export const MUSCLE_CHECK_DISMISSED_KEY = 'rb-muscle-check-dismissed'

// null means localStorage isn't usable here.
export function isMuscleCheckDismissed(): boolean | null {
  try {
    return localStorage.getItem(MUSCLE_CHECK_DISMISSED_KEY) !== null
  } catch {
    return null
  }
}

export function dismissMuscleCheck() {
  try {
    localStorage.setItem(MUSCLE_CHECK_DISMISSED_KEY, '1')
  } catch {
    // Nothing to remember it in; the screen won't auto-open anyway.
  }
}
