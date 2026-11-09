import { onMounted, onUnmounted, ref } from 'vue'
import { isPremium, loadPremiumPrice, purchasePremium, restorePremium, showPremiumToast } from './premium'
import { PENDING_NOTE, STORE_ACCOUNT_NAME, getPremiumStore } from './premiumStore'

// Issue #531: the one place Premium is bought, restored, or redeemed. Both
// surfaces that sell it (PremiumSheet and the Account sheet's Premium card)
// render PremiumUnlockActions.vue, which runs on this. A new button, new copy,
// or another store is a change here and there, not in two sheets.
export function usePremiumUnlock(onUnlocked: () => void) {
  const busy = ref(false)
  const error = ref('')
  const note = ref('')
  // Set once the surface closes: a failure that lands after that goes to a toast.
  let closed = false

  function fail(e: unknown) {
    const message = e instanceof Error ? e.message : 'Something went wrong. Try again.'
    if (closed) showPremiumToast(message)
    else error.value = message
  }

  function reset() {
    error.value = ''
    note.value = ''
    busy.value = true
  }

  async function unlock() {
    reset()
    try {
      // A cancelled purchase leaves the surface open with nothing said.
      const result = await purchasePremium()
      if (result === 'purchased') onUnlocked()
      else if (result === 'pending') note.value = PENDING_NOTE
    } catch (e) {
      fail(e)
    } finally {
      busy.value = false
    }
  }

  async function restore() {
    reset()
    try {
      if (await restorePremium()) onUnlocked()
      else note.value = `No Premium purchase was found for this ${STORE_ACCOUNT_NAME}.`
    } catch (e) {
      fail(e)
    } finally {
      busy.value = false
    }
  }

  // #506: Google Play's redeem screen for a promo code, beside Restore. Only a
  // store with one (the Play build) and only while Premium is locked. Coming
  // back to the app runs the same check as Restore, which also acknowledges a
  // purchase made outside the app, so Premium turns on without another tap.
  const redeemUrl = getPremiumStore().redeemUrl ?? null
  let redeemOpened = false

  function openRedeem() {
    redeemOpened = true
  }

  async function checkRedeemed() {
    if (!redeemOpened || closed || document.visibilityState !== 'visible') return
    redeemOpened = false
    reset()
    try {
      if (await restorePremium()) {
        showPremiumToast('Code redeemed. Premium is yours.')
        onUnlocked()
      }
    } catch {
      // quiet: Restore Purchases is still there to try again
    } finally {
      busy.value = false
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', checkRedeemed)
    void loadPremiumPrice()
  })
  onUnmounted(() => {
    closed = true
    document.removeEventListener('visibilitychange', checkRedeemed)
  })

  return { busy, error, note, redeemUrl, showRedeem: () => !!redeemUrl && !isPremium.value, unlock, restore, openRedeem }
}
