import { ref } from 'vue'
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { playablePick } from './extras'
import { isPremium } from './premium'
import { ensureRestAlertPermission } from './restAlert'
import { restIosSound } from './restAlertChannel'
import type { NativeRest } from './restLiveState'

// Issue #143 (Premium, native apps): the rest timer on the lock screen. On
// Android it's an ongoing notification with a live countdown and +15s / Skip
// buttons (android/app/src/main/java/app/repbunny/RestLive.java), which also
// posts the "Rest is over" alert itself, standing in for #78's one-shot
// alert (lib/restAlert.ts) so a +15s tapped while the app is asleep moves
// it too. On iPhone (#163) it's a Live Activity on the lock screen and in the
// Dynamic Island (ios/App/RestLiveWidget/), whose plugin schedules the alert
// the same way. Free users keep #78's alert.
//
// stores/rest.ts starts and ends it; the native side keeps the running rest
// so its buttons work with the app suspended or killed, and the store
// reconciles with it (lib/restLiveState.ts) whenever the app wakes.

export interface RestLiveStart {
  id: number
  workoutId: string | null
  exerciseName: string
  endsAt: number
  totalSeconds: number
  // Notification copy, kept here so the native side has no strings of its own.
  title: string
  text: string
  alertTitle: string
  alertBody: string
  // Bundled .caf for the end-of-rest alert; the native side falls back to the default sound.
  alertSound: string
}

export type RestLiveAction = 'add' | 'skip' | 'done'

export interface RestActivityPlugin {
  start(options: RestLiveStart): Promise<void>
  end(): Promise<void>
  getState(): Promise<{ rest: NativeRest | null }>
  // Issue #166: the rest screen over the lock screen.
  setShowWhenLocked(options: { enabled: boolean }): Promise<void>
  requestUnlock(): Promise<{ unlocked: boolean }>
  // Issue #339: RepBunny's notification settings screen.
  openNotificationSettings(): Promise<void>
  addListener(event: 'restAction', listener: (data: { action: RestLiveAction }) => void): Promise<PluginListenerHandle>
  // Browser local mode only (the e2e suite): stand in for a tap on the
  // lock screen's buttons, a locked phone, and what the app asked for.
  simulateAction?(options: { action: 'add' | 'skip' }): Promise<void>
  simulateLocked?(options: { locked: boolean }): Promise<void>
  simulateSettingsFail?(options: { fail: boolean }): Promise<void>
  getTestState?(): Promise<{ showWhenLocked: boolean; settingsOpened: number }>
}

const RestActivity = registerPlugin<RestActivityPlugin>('RestActivity', {
  web: () => import('./restActivityWeb').then((m) => new m.RestActivityWeb()),
})

// The web stand-in counts as available so the e2e suite's browser local mode
// runs the same path.
const available =
  Capacitor.getPlatform() === 'web' || Capacitor.isPluginAvailable('RestActivity')

export function restLiveEnabled(): boolean {
  return available && isPremium.value
}

export function restLiveCopy(exerciseName: string, upNextName: string | null) {
  return {
    title: 'Resting',
    // Same wording as the in-app rest screen (RestTimer.vue).
    text: upNextName ? `Up next: ${upNextName}` : `Next: ${exerciseName}`,
    alertTitle: 'Rest is over',
    alertSound: restIosSound(playablePick('chime')),
    alertBody: upNextName ? `Time for ${upNextName}.` : `Time for your next set of ${exerciseName}.`,
  }
}

// Same one-at-a-time queue as restAlert.ts: a rest can start, move, and end
// within a few milliseconds, and a missed lock-screen timer is never worth
// failing a set-log over.
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(task: () => Promise<T>): Promise<T | undefined> {
  const next = queue.then(task).catch(() => undefined)
  queue = next
  return next
}

export function startRestLive(options: RestLiveStart) {
  return enqueue(async () => {
    if (!(await ensureRestAlertPermission())) return
    await RestActivity.start(options)
  })
}

// Ends the countdown and drops any alert it already posted.
export function endRestLive() {
  return enqueue(() => RestActivity.end())
}

export async function readRestLive(): Promise<NativeRest | null> {
  return (await enqueue(async () => (await RestActivity.getState()).rest)) ?? null
}

export function onRestLiveAction(listener: (action: RestLiveAction) => void) {
  if (!available) return
  RestActivity.addListener('restAction', ({ action }) => listener(action)).catch(() => undefined)
}

// Issue #166 (Premium, Android): while the full rest screen is up, the app
// shows over the lock screen, so pressing power mid-rest shows the countdown
// without unlocking. Only the rest screen: stores/rest.ts turns it off the
// moment the rest is minimized or ends, and leaving the screen through "Back
// to workout" asks to unlock first. iOS has no equivalent (#163's Live
// Activity is already on the lock screen), so its plugin just resolves.
export function setRestOverLockScreen(enabled: boolean) {
  return enqueue(() => RestActivity.setShowWhenLocked({ enabled }))
}

// Issue #339: opens the phone's notification settings for RepBunny. False
// when the phone refuses, so the caller shows written directions (#832).
export const REST_ALERT_DIRECTIONS = 'Settings > Notifications > RepBunny > Allow Notifications'

export async function openRestAlertSettings(): Promise<boolean> {
  try {
    await RestActivity.openNotificationSettings()
    restSettingsFailed.value = false
    return true
  } catch {
    restSettingsFailed.value = true
    return false
  }
}

// True once the phone has refused to open its settings; the screens then swap
// the button for REST_ALERT_DIRECTIONS.
export const restSettingsFailed = ref(false)

// True when the phone isn't locked, or the user unlocked it.
export async function unlockForRest(): Promise<boolean> {
  try {
    return (await RestActivity.requestUnlock()).unlocked
  } catch {
    return true
  }
}

// For e2e specs, which reach this module with
// `await import('/src/lib/restLive.ts')` against the dev server.
export function simulateRestLiveAction(action: 'add' | 'skip') {
  return RestActivity.simulateAction?.({ action })
}

export function simulateLockedPhone(locked: boolean) {
  return RestActivity.simulateLocked?.({ locked })
}

export function simulateSettingsFail(fail: boolean) {
  return RestActivity.simulateSettingsFail?.({ fail })
}

export async function restSettingsOpened(): Promise<number> {
  return (await RestActivity.getTestState?.())?.settingsOpened ?? 0
}

export async function restOverLockScreen(): Promise<boolean> {
  return (await enqueue(async () => (await RestActivity.getTestState?.())?.showWhenLocked)) ?? false
}
