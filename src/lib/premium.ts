import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { getPremiumStore, STORE_ACCOUNT_NAME } from './premiumStore'
import { setExtrasPremiumSource } from './extras'
import { currentTrial, type TrialFeature } from './trialPass'
import type { ChartTeaser } from './finishRecap'

// Issue #104: the App Store build is a free download with a one-time Premium
// unlock (#30). Free keeps logging, every exercise type, the rest timer,
// backup and export, and up to FREE_TEMPLATE_LIMIT templates; Premium adds
// unlimited templates (so the starter programs bigger than the free limit,
// #148 and #209, lib/starterPrograms.ts), the plate calculator, themes (lib/theme.ts, #107),
// swap suggestions in the logger (#150), lift progress analytics (#132:
// every chart metric but the free one per load type, the 1Y and All ranges,
// and the best-reps table; see FREE_PROGRESS_METRICS in progressSeries.ts),
// the monthly report and year recap (#134) with its PDF for a coach (#152,
// lib/coachReport.ts), RPE-aware next-set targets
// (#140, lib/smartTarget.ts), strength levels (#136,
// lib/strengthLevels.ts), and the rest timer on the lock screen (#143,
// lib/restLive.ts), body measurements (#139, lib/measurements.ts), and home
// screen widgets (#144, lib/homeWidgets.ts). The Lift progress list, the hub's weekly line,
// and the plain Next time card stay free.
//
// Premium is on when any of these hold:
// - the build sets VITE_PREMIUM_UNLOCKED=true (the personal Android build,
//   #68). Read through import.meta.env only, so it's a build-time constant.
//   It's the default, not a hard unlock: the personal build's Premium (dev)
//   switch (#784) can turn it off with a stored override (DEV_PREMIUM_OFF_KEY);
// - the device has a stored entitlement (setPremiumUnlocked: a purchase or
//   restore sets it, and the launch re-check keeps it in step with StoreKit,
//   #105).
//
// Nothing here goes on `window` (light tamper resistance, per the issue).
// e2e specs reach it with `await import('/src/lib/premium.ts')` against the
// dev server.

export const FREE_TEMPLATE_LIMIT = 3

// Kept on the device with the other local preferences. Erase all data leaves
// it alone (lib/eraseAllData.ts), since a purchase isn't app data.
export const PREMIUM_UNLOCKED_KEY = 'repbunny-premium-unlocked'

function readStoredUnlock(): boolean {
  try {
    return localStorage.getItem(PREMIUM_UNLOCKED_KEY) === 'true'
  } catch {
    return false
  }
}

// #784: set by the dev switch to turn off the build-time unlock. Only the
// personal build (VITE_DEV_TOOLS) can write it; store builds never read it as
// they have no build-time unlock to turn off.
export const DEV_PREMIUM_OFF_KEY = 'repbunny-premium-dev-off'

function readDevOff(): boolean {
  try {
    return localStorage.getItem(DEV_PREMIUM_OFF_KEY) === 'true'
  } catch {
    return false
  }
}

const storedUnlock = ref(readStoredUnlock())
const devOff = ref(readDevOff())

export const isPremium = computed(
  () => (import.meta.env.VITE_PREMIUM_UNLOCKED === 'true' && !devOff.value) || storedUnlock.value,
)

// Issue #190: Extras are Premium, earned through milestones (a trial pass
// doesn't open them).
setExtrasPremiumSource(() => isPremium.value)

// Issue #155: Premium, or a running trial pass for that area. Gates that a
// pass can open check this instead of isPremium; reactive when called from a
// template or computed.
export function hasPremium(feature: TrialFeature): boolean {
  return isPremium.value || currentTrial.value?.feature === feature
}

export function setPremiumUnlocked(unlocked: boolean) {
  storedUnlock.value = unlocked
  try {
    if (unlocked) localStorage.setItem(PREMIUM_UNLOCKED_KEY, 'true')
    else localStorage.removeItem(PREMIUM_UNLOCKED_KEY)
  } catch {
    // best-effort; the unlock still holds for this session
  }
}

// #784: the Premium (dev) switch. Off also overrides the build-time unlock and
// any stored entitlement; on clears the override and stores the unlock.
export function setDevPremium(on: boolean) {
  devOff.value = !on
  try {
    if (on) localStorage.removeItem(DEV_PREMIUM_OFF_KEY)
    else localStorage.setItem(DEV_PREMIUM_OFF_KEY, 'true')
  } catch {
    // best-effort; the switch still holds for this session
  }
  setPremiumUnlocked(on)
}

// Issue #105: buying and restoring go through the store (lib/premiumStore.ts).
// A cancelled or pending purchase changes nothing; a failure throws a message the caller
// shows in place.
export async function purchasePremium(): Promise<'purchased' | 'cancelled' | 'pending'> {
  const result = await getPremiumStore().purchase()
  if (result === 'purchased') setPremiumUnlocked(true)
  return result
}

// True when this store account owns Premium (and it's now unlocked), false when no
// purchase was found.
export async function restorePremium(): Promise<boolean> {
  const owned = await getPremiumStore().restore()
  if (owned) setPremiumUnlocked(true)
  return owned
}

// The store's localized price once it loads; null (a button without a price)
// until then or when it can't.
export const premiumPrice = ref<string | null>(null)

export async function loadPremiumPrice() {
  if (premiumPrice.value) return
  try {
    premiumPrice.value = await getPremiumStore().getPrice()
  } catch {
    // no price shown
  }
}

// #460: when the Premium sheet opens, quietly ask the store whether this
// account already owns Premium. Owned: unlock and say so in a toast, and the
// caller closes the sheet. Fails open and silent: an error, a timeout, or
// "not owned" leaves the sheet as it is.
const OWNED_CHECK_TIMEOUT_MS = 8000

export async function unlockIfAlreadyOwned(): Promise<boolean> {
  try {
    const owned = await Promise.race([
      getPremiumStore().hasEntitlement(),
      new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('timeout')), OWNED_CHECK_TIMEOUT_MS)),
    ])
    if (!owned) return false
    setPremiumUnlocked(true)
    showPremiumToast(`Premium is already yours on this ${STORE_ACCOUNT_NAME}.`)
    return true
  } catch {
    return false
  }
}

// On launch: quietly settle the cached flag with StoreKit's
// verified answer, in both directions (a purchase sets it; a refund or Family
// Sharing change clears it). Fails open: any error keeps the cache, shows
// nothing, and never blocks the app, so an offline phone never loses Premium.
export async function refreshPremiumEntitlement() {
  try {
    setPremiumUnlocked(await getPremiumStore().hasEntitlement())
  } catch {
    // keep the cached value
  }
}

export type PremiumFeature =
  | 'templates'
  | 'programs'
  | 'plates'
  | 'themes'
  | 'swap'
  | 'progress'
  | 'reports'
  | 'targets'
  | 'strength'
  | 'widgets'
  | 'extras'

// What Premium includes, shared by PremiumSheet and Account's Premium row
// (#114). Only features that have shipped, and (#831) only where they have:
// a line with `platforms` shows on those platforms alone. Widgets are Android's
// (#144) until iPhone gets them (#175); the app icons are the native apps'
// (#145, #841, #169 for iPhone). When one ships, add its platform to the line.
export type PremiumPlatform = 'android' | 'ios' | 'web'
type PremiumInclude = { feature: PremiumFeature | null; label: string; platforms?: PremiumPlatform[] }

const ALL_PREMIUM_INCLUDES: PremiumInclude[] = [
  { feature: 'templates', label: 'Unlimited routines' },
  { feature: 'programs', label: 'The 5-day starter programs: the machine 6-day split and the body-part split' },
  { feature: 'plates', label: 'Plate calculator' },
  { feature: 'swap', label: 'Swap suggestions when a machine is taken' },
  { feature: 'progress', label: 'Est. 1RM, volume, and all-time lift charts' },
  { feature: 'progress', label: 'Volume over time for each routine' },
  { feature: 'progress', label: 'A training calendar of the last 12 months' },
  { feature: 'progress', label: 'What helps you lift: how sleep, energy, and stress line up with your workouts' },
  { feature: 'progress', label: 'Balance: push vs pull and upper vs lower sets' },
  { feature: 'progress', label: 'Body measurements with a chart for each' },
  { feature: 'targets', label: 'Next-set targets that adjust to your RPE' },
  { feature: 'reports', label: 'Monthly reports and a year recap' },
  { feature: 'reports', label: 'A PDF progress report to share with a coach or physio' },
  { feature: 'strength', label: 'Strength levels and an overall score' },
  { feature: null, label: 'Rest timer on the lock screen, with +15s and Skip' },
  { feature: 'widgets', label: 'Home screen widgets: this week, next workout, and latest record', platforms: ['android'] },
  { feature: 'themes', label: 'Themes, matching app icons, and seasonal icons', platforms: ['android', 'ios'] },
  { feature: 'themes', label: 'Themes', platforms: ['web'] },
  { feature: 'extras', label: 'Extras you earn by training: sounds, confetti, week marks, and more' },
]

export function premiumIncludes(platform: string): { feature: PremiumFeature | null; label: string }[] {
  return ALL_PREMIUM_INCLUDES.filter((item) => !item.platforms || item.platforms.includes(platform as PremiumPlatform)).map(
    ({ feature, label }) => ({ feature, label }),
  )
}

export const PREMIUM_INCLUDES = premiumIncludes(Capacitor.getPlatform())

// Issue #114: the nudges (template counter, Plates tag, Account row) only
// appear for free users. Trial passes (#155) are for the same people.
export const showPremiumNudges = computed(() => !isPremium.value)

// Issue #114: the one-time "last free routine" hint. Saving the
// FREE_TEMPLATE_LIMIT-th template marks it 'pending'; the first screen that
// can show it outside a workout claims it ('shown', for good) and it stays up
// until dismissed or the app reloads. Flags for every one-time hint use the
// HINT_KEY_PREFIX, so resetPremiumHints (the dev toggle, #113) clears them all.
const HINT_KEY_PREFIX = 'repbunny-premium-hint-'
const LAST_TEMPLATE_HINT_KEY = `${HINT_KEY_PREFIX}last-template`

type HintState = 'pending' | 'shown' | null

function readHint(key: string): HintState {
  try {
    const value = localStorage.getItem(key)
    return value === 'pending' || value === 'shown' ? value : null
  } catch {
    return null
  }
}

function writeHint(key: string, state: Exclude<HintState, null>) {
  try {
    localStorage.setItem(key, state)
  } catch {
    // best-effort; worst case the hint shows again next launch
  }
}

const lastTemplateHintState = ref<HintState>(readHint(LAST_TEMPLATE_HINT_KEY))
export const lastTemplateHintOpen = ref(false)

// Called by the templates store after a template is created.
export function noteTemplateCreated(activeCount: number) {
  if (!showPremiumNudges.value || activeCount !== FREE_TEMPLATE_LIMIT || lastTemplateHintState.value) return
  lastTemplateHintState.value = 'pending'
  writeHint(LAST_TEMPLATE_HINT_KEY, 'pending')
}

// Called by a screen that can show the hint; it waits while a workout runs.
export function claimLastTemplateHint(workoutInProgress: boolean) {
  if (lastTemplateHintState.value !== 'pending' || workoutInProgress || !showPremiumNudges.value) return
  lastTemplateHintState.value = 'shown'
  writeHint(LAST_TEMPLATE_HINT_KEY, 'shown')
  lastTemplateHintOpen.value = true
}

export function dismissLastTemplateHint() {
  lastTemplateHintOpen.value = false
}

// Issue #115: the one-time chart teaser on the finish recap, for the first
// lift logged in 5 workouts (lib/finishRecap.ts findChartTeaser). The recap
// only shows once a workout is finished, so claiming it there marks it
// 'shown' for good; it stays up until Not now or the recap closes.
const CHART_TEASER_HINT_KEY = `${HINT_KEY_PREFIX}chart-teaser`
const chartTeaserHintState = ref<HintState>(readHint(CHART_TEASER_HINT_KEY))
export const chartTeaser = ref<ChartTeaser | null>(null)

export function claimChartTeaser(candidate: ChartTeaser | null) {
  if (!candidate || chartTeaserHintState.value || !showPremiumNudges.value || hasPremium('progress')) return
  chartTeaserHintState.value = 'shown'
  writeHint(CHART_TEASER_HINT_KEY, 'shown')
  chartTeaser.value = candidate
}

export function dismissChartTeaser() {
  chartTeaser.value = null
}

export function resetPremiumHints() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(HINT_KEY_PREFIX)) localStorage.removeItem(key)
  } catch {
    // best-effort
  }
  lastTemplateHintState.value = null
  lastTemplateHintOpen.value = false
  chartTeaserHintState.value = null
  chartTeaser.value = null
}

// Which locked feature PremiumSheet (rendered once, in App.vue) is open for;
// null when it's closed. Same shared-module pattern as lib/accountSheet.ts.
export const premiumSheetFeature = ref<PremiumFeature | null>(null)

export function openPremiumSheet(feature: PremiumFeature) {
  premiumSheetFeature.value = feature
}

// #455: a purchase or restore that fails after the sheet was closed says so in
// a toast (rendered once, in App.vue), so the error isn't lost.
export const premiumToast = ref<string | null>(null)
let premiumToastTimer: ReturnType<typeof setTimeout> | undefined

export function showPremiumToast(message: string) {
  premiumToast.value = message
  clearTimeout(premiumToastTimer)
  premiumToastTimer = setTimeout(() => (premiumToast.value = null), 7000)
}
