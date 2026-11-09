import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { playablePick } from './extras'
import { REST_SOUND_VALUES, restChannelId, restChannelSound, restIosSound, staleRestChannelIds } from './restAlertChannel'

// Issue #78: in local mode (the native apps) rest timer alerts are the
// phone's own scheduled notifications, not web push (there's no server).
// WorkoutLogger.vue schedules one when a rest starts, moves it on ±15s, and
// cancels it whenever the rest ends early (Skip, finishing the workout, ...).
// A rest that runs out on its own keeps its alert unless the app is on screen.
//
// In a browser local-mode build (the e2e suite) the plugin's web fallback
// uses the Notification API, so the same code paths run there too.

// One rest runs at a time, so one fixed ID: rescheduling replaces it and
// cancel never has to track what was scheduled.
const REST_ALERT_ID = 1

// The first rest timer asks for permission on its own (not app launch).
// After that, only the Exercises card's button asks, so a "no" isn't
// re-prompted on every set.
const ASKED_KEY = 'repbunny-rest-alert-asked'

export type RestAlertPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export async function restAlertPermission(): Promise<RestAlertPermission> {
  try {
    const { display } = await LocalNotifications.checkPermissions()
    if (display === 'granted' || display === 'denied') return display
    return 'prompt'
  } catch {
    return 'unsupported'
  }
}

export async function requestRestAlertPermission(): Promise<RestAlertPermission> {
  try {
    localStorage.setItem(ASKED_KEY, '1')
  } catch {
    // Storage blocked: worst case the first rest asks again.
  }
  try {
    const { display } = await LocalNotifications.requestPermissions()
    if (display === 'granted' || display === 'denied') return display
    return 'prompt'
  } catch {
    return 'unsupported'
  }
}

function alreadyAsked() {
  try {
    return localStorage.getItem(ASKED_KEY) === '1'
  } catch {
    return false
  }
}

// Browser local mode only (the e2e suite): stands in for the phone's
// "Alarms & reminders" switch, and counts the times the app opened it.
let simulatedExact: 'granted' | 'denied' | null = null
let exactSettingOpened = 0
export function simulateExactRestAlerts(state: 'granted' | 'denied') {
  simulatedExact = state
}
export function exactRestSettingOpened() {
  return exactSettingOpened
}

// Android 12+ only fires a notification on the dot with the "Alarms &
// reminders" permission (off by default on Android 14+). Without it the
// alert is an inexact alarm the system may hold back a little. Everywhere
// else timing is already exact.
export async function exactRestAlertsAllowed(): Promise<boolean> {
  if (simulatedExact) return simulatedExact === 'granted'
  if (Capacitor.getPlatform() !== 'android') return true
  try {
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
    return exact_alarm === 'granted'
  } catch {
    return true
  }
}

export async function openExactRestAlertSetting(): Promise<boolean> {
  if (simulatedExact) {
    exactSettingOpened++
    return simulatedExact === 'granted'
  }
  try {
    const { exact_alarm } = await LocalNotifications.changeExactNotificationSetting()
    return exact_alarm === 'granted'
  } catch {
    return false
  }
}

// Issue #640: on Android 8+ the alert's sound is its channel's, so each chime
// gets a channel (high importance, vibration on) and the alert is scheduled
// on the one for the picked chime. Run at launch, native Android only; a
// failure just leaves the alert on the phone's default sound.
export async function ensureRestAlertChannels() {
  if (Capacitor.getPlatform() !== 'android') return
  try {
    for (const value of REST_SOUND_VALUES) {
      await LocalNotifications.createChannel({
        id: restChannelId(value),
        name: 'Rest is over',
        description: 'Alert when a rest ends',
        importance: 4,
        sound: restChannelSound(value),
        vibration: true,
      })
    }
    const { channels } = await LocalNotifications.listChannels()
    for (const id of staleRestChannelIds(channels.map((c) => c.id))) {
      await LocalNotifications.deleteChannel({ id })
    }
  } catch {
    // Default sound it is.
  }
}

// Plugin calls are async and a rest can start, move, and end within a few
// milliseconds of each other, so they run one at a time, in order.
let queue: Promise<unknown> = Promise.resolve()
function enqueue(task: () => Promise<unknown>) {
  queue = queue.then(task).catch(() => {
    // A missed alert is a convenience lost, never something a set-log
    // should fail over.
  })
  return queue
}

// The first rest asks; after that a "no" stays a no. Shared with the
// lock-screen timer (lib/restLive.ts, #143), which needs the same permission.
export async function ensureRestAlertPermission(): Promise<boolean> {
  let permission = await restAlertPermission()
  if (permission === 'prompt' && !alreadyAsked()) permission = await requestRestAlertPermission()
  return permission === 'granted'
}

// Issue #339: read in line behind any scheduling, so the check can't land
// between the permission prompt and the alert it guards.
export function restAlertsDenied(): Promise<boolean> {
  return enqueue(async () => (await restAlertPermission()) === 'denied').then((denied) => denied === true)
}

// Issue #642: true once, the first time a rest has alerts allowed but the
// phone may hold them back a few seconds ("Alarms & reminders" off). Read in
// line behind any scheduling, like restAlertsDenied, so it sees the answer
// to the permission prompt. Asking marks it seen: "Not now" or ignoring the
// notice never brings it back.
const EXACT_NOTICE_KEY = 'repbunny-exact-alert-notice-seen'
export function exactAlertsNoticeDue(): Promise<boolean> {
  return enqueue(async () => {
    try {
      if (localStorage.getItem(EXACT_NOTICE_KEY) === '1') return false
    } catch {
      return false
    }
    if ((await restAlertPermission()) !== 'granted' || (await exactRestAlertsAllowed())) return false
    try {
      localStorage.setItem(EXACT_NOTICE_KEY, '1')
    } catch {
      // Storage blocked: no way to remember it, so stay quiet rather than nag.
      return false
    }
    return true
  }).then((due) => due === true)
}

export function scheduleRestAlert(exerciseName: string, endsAt: number) {
  return enqueue(async () => {
    if (!(await ensureRestAlertPermission())) return

    await LocalNotifications.cancel({ notifications: [{ id: REST_ALERT_ID }] })
    await LocalNotifications.schedule({
      notifications: [
        {
          id: REST_ALERT_ID,
          title: 'Rest is over',
          body: `Time for your next set of ${exerciseName}.`,
          schedule: { at: new Date(endsAt), allowWhileIdle: true },
          ...(Capacitor.getPlatform() === 'android' ? { channelId: restChannelId(playablePick('chime')) } : {}),
          // iOS has no channels, and a notification with no sound is silent.
          ...(Capacitor.getPlatform() === 'ios' ? { sound: restIosSound(playablePick('chime')) } : {}),
          // Left at the default (true) the plugin opens the Alarms &
          // reminders screen mid-workout on every rest until granted, so
          // only ask for an exact alarm when it's already allowed.
          isExactNotification: await exactRestAlertsAllowed(),
        },
      ],
    })
  })
}

// For a rest that ends early (Skip, finishing the workout, ...). A rest that
// runs out on its own isn't cancelled: the in-app countdown can call it up
// to half a second before the alarm, and on Android it often does so in the
// few seconds the app keeps running after the screen locks, which used to
// cancel every alert just before it fired.
export function cancelRestAlert() {
  return enqueue(async () => {
    if ((await restAlertPermission()) !== 'granted') return
    await LocalNotifications.cancel({ notifications: [{ id: REST_ALERT_ID }] })
  })
}

// For a rest that ran out while the user was looking at the app: the in-app
// screen already chimed, so drop the alert whether or not it fired yet.
export function dismissRestAlert() {
  return enqueue(async () => {
    if ((await restAlertPermission()) !== 'granted') return
    await LocalNotifications.cancel({ notifications: [{ id: REST_ALERT_ID }] })
    await LocalNotifications.removeDeliveredNotificationsById({ ids: [REST_ALERT_ID] })
  })
}
