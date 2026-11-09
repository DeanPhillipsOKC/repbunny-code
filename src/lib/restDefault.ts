// Issue #429: new installs and new accounts start with a 2:00 default rest
// (the middle of Lifting basics' 1 to 3 minutes), so the rest timer shows up
// on the very first set. Existing users keep whatever they had, empty
// included: this is only written when the settings or profile row is first
// created (src/data/sqlite/schema.ts migrate and repos.ts erase), never as a
// schema default.
export const NEW_USER_REST_SECONDS = 120

// The one-time tip on the first rest timer this device ever shows. Per
// device, like the muscle check's flag.
const REST_TIP_KEY = 'rb-rest-tip-seen'

export function restTipSeen(): boolean {
  try {
    return localStorage.getItem(REST_TIP_KEY) === '1'
  } catch {
    return true
  }
}

export function markRestTipSeen() {
  try {
    localStorage.setItem(REST_TIP_KEY, '1')
  } catch {
    // Storage unavailable: the tip may show again, which is harmless.
  }
}
