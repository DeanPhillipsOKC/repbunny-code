import { repos } from '../data'
import { DEV_PREMIUM_OFF_KEY, PREMIUM_UNLOCKED_KEY } from './premium'
import { resetThemeState } from './theme'
import { resetExtrasState } from './extras'
import { strengthSex } from './strengthLevels'
import { resetTrialState } from './trialPass'
import { resetMilestoneMoments } from './milestones'
import { resetRecordCelebrations } from './recordCelebrations'

// Erase all data (Account > Reset & erase): deletes everything RepBunny keeps
// on this device and clears every one of the app's own localStorage keys (all
// prefixed `repbunny-`), so the app starts over like a first launch. The
// caller refetches the (now empty) stores. Leaves everything as it was on
// error so the caller can show what failed and let the user retry.
// Issue #938: moved here from the old sign-in store when the app went
// local-only.
export async function eraseAllData() {
  const { error } = await repos.backup.erase()
  if (error) return { error }

  try {
    // Issue #104: a Premium unlock isn't app data, so erasing keeps it.
    const staleKeys = Object.keys(localStorage).filter(
      (key) => key.startsWith('repbunny-') && key !== PREMIUM_UNLOCKED_KEY && key !== DEV_PREMIUM_OFF_KEY,
    )
    for (const key of staleKeys) localStorage.removeItem(key)
  } catch {
    // best-effort; worst case a stale flag lingers
  }
  // Issue #107: the theme is a setting, so it goes back to Classic + Full.
  resetThemeState()
  resetExtrasState()
  resetTrialState()
  resetMilestoneMoments()
  resetRecordCelebrations()
  // Issue #136: the strength-standards answer goes with the rest.
  strengthSex.value = null

  return { error: null }
}
