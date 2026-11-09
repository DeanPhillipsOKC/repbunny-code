import { ref } from 'vue'
import type { WeightUnit } from './types'

// Issue #397 (design docs/design/onboarding-wizard.html): the first-run setup
// wizard. App.vue opens it once on a fresh install (no exercises or routines,
// and this flag unset); Preferences' "Run setup again" reopens it. The flag is
// per device, like the other one-time screens (muscleCheck.ts).
export const SETUP_DONE_KEY = 'rb-setup-done'

// null: closed. 'first-run': the automatic open, starting on the welcome
// screen. 'replay': from Preferences, starting on the first step with the
// current values preselected, and never changing anything on Skip.
export type SetupWizardMode = 'first-run' | 'replay'
export const setupWizardMode = ref<SetupWizardMode | null>(null)

export function isSetupDone(): boolean {
  try {
    return localStorage.getItem(SETUP_DONE_KEY) === '1'
  } catch {
    return false
  }
}

export function markSetupDone() {
  try {
    localStorage.setItem(SETUP_DONE_KEY, '1')
  } catch {
    // Private mode or blocked storage: the wizard may show again next launch,
    // which only happens while there's still no data.
  }
}

// The countries that still weigh in pounds. Everyone else starts on kg.
const POUND_REGIONS = new Set(['US', 'LR', 'MM'])

// The unit a new user most likely lifts in, from the first locale that names
// a region ('en-GB' is kg, 'en-US' is lb). A locale with no region ('en')
// says nothing, so it falls through to the next one, then to lb.
export function unitForLocales(locales: readonly string[]): WeightUnit {
  for (const tag of locales) {
    let region: string | undefined
    try {
      region = new Intl.Locale(tag).region
    } catch {
      continue
    }
    if (!region) continue
    return POUND_REGIONS.has(region.toUpperCase()) ? 'lb' : 'kg'
  }
  return 'lb'
}

export function deviceWeightUnit(): WeightUnit {
  const locales = [...(navigator.languages ?? []), navigator.language, Intl.DateTimeFormat().resolvedOptions().locale]
  return unitForLocales(locales.filter(Boolean))
}

// Issue #399: step 3's three ways in. The wizard closes and Home acts on the
// pick: 'routine' opens the new routine name sheet, 'log' starts a freeform
// workout with Add exercise open. 'program' goes to Starter programs from
// the wizard itself, so it never lands here.
export type SetupStart = 'program' | 'routine' | 'log'
export const pendingSetupStart = ref<SetupStart | null>(null)

// Someone who picked one never needs Home's #207 welcome card, which offers
// the same three; it stays for those who skipped. Per device, like the
// "setup done" flag.
export const SETUP_START_PICKED_KEY = 'rb-setup-start-picked'

function readStartPicked(): boolean {
  try {
    return localStorage.getItem(SETUP_START_PICKED_KEY) === '1'
  } catch {
    return false
  }
}

export const setupStartPicked = ref(readStartPicked())

export function markSetupStartPicked() {
  setupStartPicked.value = true
  try {
    localStorage.setItem(SETUP_START_PICKED_KEY, '1')
  } catch {
    // best-effort; the card stays hidden for this session
  }
}
