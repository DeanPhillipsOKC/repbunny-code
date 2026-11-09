// Issue #155: free users earn Premium trial passes at a few milestone tiers
// (#153). A pass gives one Premium area for TRIAL_DAYS, working exactly like
// Premium. One runs at a time; unused passes wait. When it ends the area falls
// back the same way a lost unlock does, with one gentle note. Days count by
// the device clock, with no tamper checks (the no-DRM rule).
//
// This file doesn't import premium.ts (premium.ts reads the active trial from
// here), so callers decide whether passes apply: only where Premium is off.
import { computed, ref } from 'vue'

export type TrialFeature = 'themes' | 'progress' | 'reports' | 'targets' | 'plates' | 'swap' | 'strength'

export const TRIAL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

// Milestone tier ids (milestones.ts) that each grant one pass.
export const TRIAL_PASS_TIERS: readonly string[] = ['workouts-10', 'workouts-50', 'workouts-150', 'strongWeeks-12']

export const TRIAL_PASS_LABEL = 'a 7-day Premium trial'

// The areas a pass can try, from the Premium sheet's list. Unlimited routines
// is left out: templates made during a trial would stay after it.
export const TRIAL_FEATURES: { feature: TrialFeature; label: string; detail: string }[] = [
  { feature: 'themes', label: 'Themes', detail: 'Holiday and seasonal looks, and the Minimal mascot.' },
  { feature: 'progress', label: 'Lift progress', detail: 'Est. 1RM, volume, and all-time lift charts.' },
  { feature: 'targets', label: 'Next-set targets', detail: 'Targets that adjust to your RPE.' },
  { feature: 'reports', label: 'Monthly reports', detail: 'Your month, and your year, in one report.' },
  { feature: 'strength', label: 'Strength levels', detail: 'Where your big lifts stand for your body weight.' },
  { feature: 'plates', label: 'Plate calculator', detail: 'Which plates to load for any weight.' },
  { feature: 'swap', label: 'Swap suggestions', detail: 'Another exercise when a machine is taken.' },
]

export function trialFeatureLabel(feature: TrialFeature): string {
  return TRIAL_FEATURES.find((f) => f.feature === feature)?.label ?? feature
}

export interface TrialEntry {
  feature: TrialFeature
  startedAt: string
  setup?: true
  theme?: string
}

export interface TrialState {
  // Pass tier ids already granted, so a tier grants once.
  granted: string[]
  // Every pass started, oldest first. The last one is the only one that can
  // still be running. #1002: `setup` marks the one-time Themes trial that
  // finishing setup on a Premium theme starts (no pass used), with that theme.
  trials: TrialEntry[]
  // How many trials' end notes are done (shown, or skipped by a newer start).
  endNoted: number
}

export const EMPTY_TRIAL_STATE: TrialState = { granted: [], trials: [], endNoted: 0 }

const FEATURE_IDS = new Set<string>(TRIAL_FEATURES.map((f) => f.feature))

// Anything unexpected (an old or hand-edited file) is dropped, not trusted.
export function parseTrialState(value: unknown): TrialState {
  if (!value || typeof value !== 'object') return { ...EMPTY_TRIAL_STATE }
  const raw = value as Partial<Record<keyof TrialState, unknown>>
  const granted = Array.isArray(raw.granted)
    ? [...new Set(raw.granted.filter((id): id is string => typeof id === 'string' && TRIAL_PASS_TIERS.includes(id)))]
    : []
  const trials = Array.isArray(raw.trials)
    ? raw.trials
        .filter(
          (t): t is TrialEntry =>
            !!t &&
            typeof t === 'object' &&
            FEATURE_IDS.has((t as { feature?: unknown }).feature as string) &&
            typeof (t as { startedAt?: unknown }).startedAt === 'string' &&
            !Number.isNaN(new Date((t as { startedAt: string }).startedAt).getTime()),
        )
        .map((t): TrialEntry => {
          const entry: TrialEntry = { feature: t.feature, startedAt: t.startedAt }
          if (t.setup === true && t.feature === 'themes') {
            entry.setup = true
            if (typeof t.theme === 'string' && t.theme.length <= 40) entry.theme = t.theme
          }
          return entry
        })
    : []
  const endNoted = typeof raw.endNoted === 'number' && raw.endNoted >= 0 ? Math.min(Math.floor(raw.endNoted), trials.length) : 0
  return { granted, trials, endNoted }
}

export function trialEndsAt(trial: { startedAt: string }): number {
  return new Date(trial.startedAt).getTime() + TRIAL_DAYS * DAY_MS
}

export interface ActiveTrial {
  feature: TrialFeature
  endsAt: number
  daysLeft: number
}

export function activeTrial(state: TrialState, now: number): ActiveTrial | null {
  const last = state.trials[state.trials.length - 1]
  if (!last) return null
  const endsAt = trialEndsAt(last)
  if (now >= endsAt) return null
  // "4 days left" counts part of a day as a day, and never more than the pass.
  const daysLeft = Math.min(TRIAL_DAYS, Math.max(1, Math.ceil((endsAt - now) / DAY_MS)))
  return { feature: last.feature, endsAt, daysLeft }
}

// The setup trial (#1002) isn't a pass, so it doesn't use one up.
export function unusedPasses(state: TrialState): number {
  return Math.max(0, state.granted.length - state.trials.filter((t) => !t.setup).length)
}

// The trial whose end note is due: the newest one, once it's over and its
// note hasn't been shown.
export function endedTrialToNote(state: TrialState, now: number): TrialFeature | null {
  const last = state.trials[state.trials.length - 1]
  if (!last || state.endNoted >= state.trials.length || now < trialEndsAt(last)) return null
  return last.feature
}

// Adds a pass for each pass tier in tierIds not granted before.
export function grantPasses(state: TrialState, tierIds: Iterable<string>): { state: TrialState; added: number } {
  const granted = [...state.granted]
  let added = 0
  for (const id of tierIds) {
    if (!TRIAL_PASS_TIERS.includes(id) || granted.includes(id)) continue
    granted.push(id)
    added++
  }
  return { state: added > 0 ? { ...state, granted } : state, added }
}

export function canStartTrial(state: TrialState, now: number): boolean {
  return unusedPasses(state) > 0 && !activeTrial(state, now)
}

// Starting a pass also settles any earlier end note: the new trial is the
// news now.
export function startTrial(state: TrialState, feature: TrialFeature, now: number): TrialState {
  if (!canStartTrial(state, now)) return state
  const trials = [...state.trials, { feature, startedAt: new Date(now).toISOString() }]
  return { ...state, trials, endNoted: trials.length - 1 }
}

// #1002: finishing setup on a Premium theme starts one Themes trial, once
// per device. Not while another trial runs, and never a second time (a setup
// replay, or after it ended).
export function setupTrialUsed(state: TrialState): boolean {
  return state.trials.some((t) => t.setup)
}

export function startSetupTrial(state: TrialState, theme: string, now: number): TrialState {
  if (setupTrialUsed(state) || activeTrial(state, now)) return state
  const trials: TrialEntry[] = [...state.trials, { feature: 'themes', startedAt: new Date(now).toISOString(), setup: true, theme }]
  return { ...state, trials, endNoted: trials.length - 1 }
}

export function noteTrialEnded(state: TrialState): TrialState {
  return { ...state, endNoted: state.trials.length }
}

// A restore only ever adds (like milestones' seen list): passes and trials
// from both, trials in start order.
export function mergeTrialStates(a: TrialState, b: TrialState): TrialState {
  const granted = [...new Set([...a.granted, ...b.granted])]
  const byKey = new Map<string, TrialEntry>()
  for (const t of [...a.trials, ...b.trials]) byKey.set(`${t.feature}@${t.startedAt}`, t)
  const trials = [...byKey.values()].sort((x, y) => new Date(x.startedAt).getTime() - new Date(y.startedAt).getTime())
  const endNoted = Math.min(trials.length, Math.max(a.endNoted, b.endNoted))
  return { granted, trials, endNoted }
}

// Per device, with the other local preferences. Erase all data clears it.
export const TRIAL_PASSES_KEY = 'repbunny-trial-passes'

function readStored(): TrialState {
  try {
    const raw = localStorage.getItem(TRIAL_PASSES_KEY)
    return raw === null ? { ...EMPTY_TRIAL_STATE } : parseTrialState(JSON.parse(raw))
  } catch {
    return { ...EMPTY_TRIAL_STATE }
  }
}

export const trialState = ref<TrialState>(readStored())

function save(next: TrialState) {
  trialState.value = next
  try {
    localStorage.setItem(TRIAL_PASSES_KEY, JSON.stringify(next))
  } catch {
    // best-effort; the pass still holds for this session
  }
}

// The clock trials are judged by. Ticks once a minute and when the app comes
// back to the foreground, so a trial ends without a reload.
export const trialNow = ref(Date.now())

if (typeof window !== 'undefined') {
  setInterval(() => (trialNow.value = Date.now()), 60_000)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) trialNow.value = Date.now()
  })
}

export const currentTrial = computed(() => activeTrial(trialState.value, trialNow.value))
export const unusedPassCount = computed(() => unusedPasses(trialState.value))
export const trialEndNote = computed(() => endedTrialToNote(trialState.value, trialNow.value))
// The trial behind that note, so the setup trial's note can name its theme.
export const endedTrial = computed<TrialEntry | null>(() =>
  trialEndNote.value ? (trialState.value.trials[trialState.value.trials.length - 1] ?? null) : null,
)

export function earnTrialPasses(tierIds: Iterable<string>): number {
  const { state, added } = grantPasses(readStored(), tierIds)
  if (added > 0) save(state)
  return added
}

export function startTrialPass(feature: TrialFeature): boolean {
  const now = Date.now()
  trialNow.value = now
  const current = readStored()
  if (!canStartTrial(current, now)) return false
  save(startTrial(current, feature, now))
  return true
}

export function startSetupThemeTrial(theme: string): boolean {
  const now = Date.now()
  trialNow.value = now
  const current = readStored()
  const next = startSetupTrial(current, theme, now)
  if (next === current) return false
  save(next)
  return true
}

export function dismissTrialEndNote() {
  save(noteTrialEnded(readStored()))
}

export function readTrialState(): TrialState {
  return readStored()
}

export function restoreTrialState(value: unknown) {
  save(mergeTrialStates(readStored(), parseTrialState(value)))
}

// Erase all data clears the repbunny- keys (lib/eraseAllData.ts); this puts the
// in-memory state back to match.
export function resetTrialState() {
  trialState.value = readStored()
}

// Whether the trial picker (TrialPassSheet, rendered once in App.vue) is open.
// Same shared-module pattern as premiumSheetFeature.
export const trialSheetOpen = ref(false)

export function openTrialSheet() {
  trialSheetOpen.value = true
}
