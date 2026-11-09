import { loadPurchasesPlugin } from './purchasesPlugin'
import { Capacitor } from '@capacitor/core'
import { logClientError } from './errorLog'

// Issue #105: the one place that talks to the App Store. Everything else
// (lib/premium.ts, the Premium sheet, Account) goes through this small
// interface, so the e2e suite can swap in a fake with setPremiumStore and the
// StoreKit plugin only loads on the iPhone.
//
// StoreKit 2's verified current entitlements are the source of truth for
// Premium; the flag in lib/premium.ts is only an offline cache of the last
// verified answer. No server-side receipt checks: local mode has no server.

export interface PremiumStore {
  // The store's localized price for the unlock, or null when it can't load.
  getPrice(): Promise<string | null>
  // Buys the unlock. 'cancelled' means the person backed out (not an error).
  // 'pending' is a Play purchase waiting on payment (cash methods, #199): not
  // unlocked yet; the launch re-check unlocks it once Play completes it.
  purchase(): Promise<'purchased' | 'cancelled' | 'pending'>
  // Syncs with the App Store, then reports whether this Apple ID owns Premium.
  restore(): Promise<boolean>
  // A verified answer on whether Premium is owned right now. Throws when the
  // store can't give one (offline, error), so callers keep the cached flag.
  hasEntitlement(): Promise<boolean>
  // #506: the store's own page for redeeming a promo code, when it has one
  // the app can link to (Google Play only). The code is typed there, never in
  // RepBunny, and becomes a real purchase that Restore finds.
  redeemUrl?: string
}

// The product ID from App Store Connect (#31). Defaults until it's posted.
export const IAP_PRODUCT_ID: string = import.meta.env.VITE_IAP_PRODUCT_ID || 'premium_unlock'

// Wording that follows the store this build talks to.
export const STORE_ACCOUNT_NAME = Capacitor.getPlatform() === 'android' ? 'Google account' : 'Apple ID'
export const STORE_NAME = Capacitor.getPlatform() === 'android' ? 'Google Play' : 'App Store'
export const RESTORE_CAPTION = `Bought Premium on another phone? Restore checks your ${STORE_ACCOUNT_NAME}.`
export const PENDING_NOTE = 'Waiting for payment. Premium unlocks as soon as Google Play confirms it.'

export const NOT_AVAILABLE_MESSAGE = "Premium isn't available on this build."

// No store on this build (the browser): the buy
// and restore controls say so plainly.
const unavailableStore: PremiumStore = {
  getPrice: async () => null,
  purchase: async () => {
    throw new Error(NOT_AVAILABLE_MESSAGE)
  },
  restore: async () => {
    throw new Error(NOT_AVAILABLE_MESSAGE)
  },
  hasEntitlement: async () => {
    throw new Error(NOT_AVAILABLE_MESSAGE)
  },
}

// #455: Play's billing service not answering (BILLING_SETUP_TIMEOUT, setup
// failed, service unavailable) gets its own plain message, so the person knows
// to update the Play Store app and try again rather than seeing a generic one.
export const STORE_UNREACHABLE_MESSAGE =
  Capacitor.getPlatform() === 'android'
    ? "Couldn't reach Google Play. Check that the Play Store app is up to date, then try again."
    : "Couldn't reach the App Store. Check your connection, then try again."

function isStoreUnreachable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /BILLING_SETUP|BILLING_UNAVAILABLE|SERVICE_UNAVAILABLE|SERVICE_DISCONNECTED|setup timed out/i.test(message)
}

const PURCHASE_FAILED_MESSAGE =
  "The purchase didn't go through, so Premium is still locked. Check your connection and try again in a moment."
const RESTORE_FAILED_MESSAGE =
  "Couldn't reach the store to restore. Check your connection and try again in a moment."

function isPending(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /pending/i.test(message)
}

function isCancel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /cancel/i.test(message)
}

let plugin = loadPurchasesPlugin

// For e2e: the specs swap in a fake plugin to exercise the real stores. Pass
// null to restore the real one.
export function setPurchasesPluginLoader(next: typeof loadPurchasesPlugin | null) {
  plugin = next ?? loadPurchasesPlugin
}

// #408: the store's real error goes to the client error log (the person still
// sees only the generic text), so a failed purchase can be diagnosed from a
// bug report. Cancels and pending purchases never reach here.
function logStoreError(error: unknown, operation: string) {
  const isError = error instanceof Error
  const raw = isError
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  logClientError({
    kind: 'error',
    message: raw || 'Unknown store error',
    stack: isError ? (error.stack ?? null) : null,
    context: { operation, platform: Capacitor.getPlatform() },
    prompt: false,
  })
}

// Once per launch: a missing product shows up as getPrice failing every time.
let priceFailureLogged = false
function logPriceFailure(error: unknown) {
  if (priceFailureLogged) return
  priceFailureLogged = true
  logStoreError(error, 'premium.price')
}

// Premium owned by this Apple ID right now: the unlock's transaction among
// StoreKit's current entitlements (Family Sharing included), not refunded.
async function ownsPremium(): Promise<boolean> {
  const { purchases } = await (await plugin()).native.getPurchases({ onlyCurrentEntitlements: true })
  return purchases.some((p) => p.productIdentifier === IAP_PRODUCT_ID && !p.revocationDate)
}

export const storeKitStore: PremiumStore = {
  async getPrice() {
    try {
      const { product } = await (await plugin()).native.getProduct({ productIdentifier: IAP_PRODUCT_ID })
      return product.priceString || null
    } catch (error) {
      logPriceFailure(error)
      return null
    }
  },
  async purchase() {
    try {
      await (await plugin()).native.purchaseProduct({ productIdentifier: IAP_PRODUCT_ID })
      return 'purchased'
    } catch (error) {
      if (isCancel(error)) return 'cancelled'
      logStoreError(error, 'premium.purchase')
      throw new Error(PURCHASE_FAILED_MESSAGE)
    }
  },
  async restore() {
    try {
      await (await plugin()).native.restorePurchases()
      return await ownsPremium()
    } catch (error) {
      logStoreError(error, 'premium.restore')
      throw new Error(RESTORE_FAILED_MESSAGE)
    }
  },
  hasEntitlement: ownsPremium,
}

// Issue #199: Google Play Billing through the same plugin. A one-time
// (inapp) product. Only PURCHASED counts: a pending one isn't owned yet.
//
// #862: Play refunds a purchase that isn't acknowledged within 3 days. The
// plugin's own auto-acknowledge (through 8.9.6) is fire-and-forget and the plugin
// closes its billing connection right after, so it can be lost; its
// restorePurchases recovery does the same. So every check acknowledges any
// unacknowledged Premium purchase itself and waits for Play's answer. A
// failure is logged but never costs the entitlement: the next check retries.
type PlayPurchase = { productIdentifier: string; purchaseState?: string; isAcknowledged?: boolean; purchaseToken?: string }

function isOwnedPremium(p: PlayPurchase): boolean {
  return p.productIdentifier === IAP_PRODUCT_ID && (p.purchaseState === 'PURCHASED' || p.purchaseState === '1')
}

async function ownsPremiumOnPlay(): Promise<boolean> {
  const { native } = await plugin()
  const { PURCHASE_TYPE } = await import('@capgo/native-purchases')
  const { purchases } = await native.getPurchases({ productType: PURCHASE_TYPE.INAPP })
  const owned = purchases.filter(isOwnedPremium)
  for (const p of owned) {
    if (p.isAcknowledged !== false || !p.purchaseToken) continue
    try {
      await native.acknowledgePurchase({ purchaseToken: p.purchaseToken })
    } catch (error) {
      logStoreError(error, 'premium.acknowledge')
    }
  }
  return owned.length > 0
}

export const playBillingStore: PremiumStore = {
  async getPrice() {
    try {
      const { PURCHASE_TYPE } = await import('@capgo/native-purchases')
      const { product } = await (await plugin()).native.getProduct({
        productIdentifier: IAP_PRODUCT_ID,
        productType: PURCHASE_TYPE.INAPP,
      })
      return product.priceString || null
    } catch (error) {
      logPriceFailure(error)
      return null
    }
  },
  async purchase() {
    try {
      const { PURCHASE_TYPE } = await import('@capgo/native-purchases')
      await (await plugin()).native.purchaseProduct({
        productIdentifier: IAP_PRODUCT_ID,
        productType: PURCHASE_TYPE.INAPP,
      })
    } catch (error) {
      if (isCancel(error)) return 'cancelled'
      if (isPending(error)) return 'pending'
      logStoreError(error, 'premium.purchase')
      throw new Error(isStoreUnreachable(error) ? STORE_UNREACHABLE_MESSAGE : PURCHASE_FAILED_MESSAGE)
    }
    // #862: acknowledge it now. Bought is bought, so a failed read here only
    // gets logged; the launch check acknowledges it instead.
    await ownsPremiumOnPlay().catch((error) => logStoreError(error, 'premium.acknowledge'))
    return 'purchased'
  },
  async restore() {
    try {
      await (await plugin()).native.restorePurchases()
      return await ownsPremiumOnPlay()
    } catch (error) {
      logStoreError(error, 'premium.restore')
      throw new Error(isStoreUnreachable(error) ? STORE_UNREACHABLE_MESSAGE : RESTORE_FAILED_MESSAGE)
    }
  },
  hasEntitlement: ownsPremiumOnPlay,
  // Play's redeem screen (developer.android.com/google/play/billing/promo).
  // It opens in the Play Store app; one-time product codes redeem there.
  redeemUrl: 'https://play.google.com/redeem',
}

function platformStore(): PremiumStore {
  const platform = Capacitor.getPlatform()
  if (platform === 'ios') return storeKitStore
  if (platform === 'android') return playBillingStore
  return unavailableStore
}

let store: PremiumStore = platformStore()

export function getPremiumStore(): PremiumStore {
  return store
}

// For e2e: the browser has no App Store, so specs install a fake. Pass null to
// go back to the real store for this platform.
export function setPremiumStore(next: PremiumStore | null) {
  store = next ?? platformStore()
}
