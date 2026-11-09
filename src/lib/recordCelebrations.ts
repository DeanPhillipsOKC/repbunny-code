import { ref } from 'vue'

// Issue #476: Preferences > Record celebrations, per device. "Big ones only"
// (the default) keeps the full-screen takeover for new records; "All wins"
// opens it for small wins too (lib/smallWins.ts). The chip and the rest
// screen's line show either way. Saved in backups like Milestone moments
// (#186). Mockup: docs/design/issue-476-record-celebrations.html, option A.
export type RecordCelebrations = 'big' | 'all'

export const RECORD_CELEBRATIONS_KEY = 'repbunny-record-celebrations'

function read(): RecordCelebrations {
  try {
    return localStorage.getItem(RECORD_CELEBRATIONS_KEY) === 'all' ? 'all' : 'big'
  } catch {
    return 'big'
  }
}

export const recordCelebrations = ref<RecordCelebrations>(read())

export function setRecordCelebrations(value: RecordCelebrations) {
  recordCelebrations.value = value
  try {
    if (value === 'all') localStorage.setItem(RECORD_CELEBRATIONS_KEY, 'all')
    else localStorage.removeItem(RECORD_CELEBRATIONS_KEY)
  } catch {
    // Storage off: the choice holds until the app reloads.
  }
}

// Erase all data clears the repbunny- keys (lib/eraseAllData.ts); this puts the
// in-memory choice back to match.
export function resetRecordCelebrations() {
  recordCelebrations.value = read()
}
