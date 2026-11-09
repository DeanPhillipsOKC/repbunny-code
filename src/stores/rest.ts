import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  cancelRestAlert,
  dismissRestAlert,
  exactAlertsNoticeDue,
  exactRestAlertsAllowed,
  openExactRestAlertSetting,
  restAlertsDenied,
  scheduleRestAlert,
} from '../lib/restAlert'
import {
  endRestLive,
  onRestLiveAction,
  readRestLive,
  restLiveCopy,
  restLiveEnabled,
  setRestOverLockScreen,
  startRestLive,
  unlockForRest,
} from '../lib/restLive'
import { reconcileRest } from '../lib/restLiveState'
import { playRestChime } from '../lib/restChime'
import { markRestTipSeen, restTipSeen } from '../lib/restDefault'
import { useWorkoutsStore } from './workouts'

// Issue #80: the rest timer outlives the workout screen. It used to live in
// WorkoutLogger.vue, so leaving Home unmounted it and threw the rest away.
// WorkoutLogger starts, adjusts, and skips rests through this store; App.vue
// shows the minimized bar on every other tab.
//
// Two places tick a rest: RestTimer.vue (the full screen, only on Home) and
// this store while `minimized`. Leaving Home always minimizes (see
// WorkoutLogger's onUnmounted), so exactly one of them is ticking at a time.
export const useRestStore = defineStore('rest', () => {
  const workout = useWorkoutsStore()

  // Tracked by end time (not remaining seconds) so the screen, the bar, and
  // the visibility fallback all agree on "time left" (item 15's notes).
  // `id` tells one rest from the next when syncing with the lock screen (#143).
  // `headline` is the bunny's line for this rest (#183).
  const activeRest = ref<{ id: number; exerciseName: string; endsAt: number; totalSeconds: number; headline?: string } | null>(null)
  // Item 52: "Back to workout" keeps the rest counting in the bar.
  const minimized = ref(false)
  const remaining = ref(0)
  // Item 104: the deck move that waits for this rest to end. Kept here so a
  // rest that ends off Home still advances once the user comes back.
  const pendingAdvance = ref<{ fromId: string; toId: string } | null>(null)
  // Shown on the lock-screen timer (#143); WorkoutLogger keeps it current.
  const upNextName = ref<string | null>(null)

  // Issue #339: a small "rest alerts are off" notice on the rest screen. Shown
  // on the first rest of a workout where notifications are denied, then not
  // again for that workout, whether or not it was dismissed.
  const alertsOffNotice = ref(false)
  let noticeShownFor: string | null = null
  // Issue #642: Android only. Alerts are on but "Alarms & reminders" is off,
  // so they can arrive a few seconds late. Shown once per install.
  const exactNotice = ref(false)

  // Issue #429: where this rest's length came from, for the rest screen's
  // source line and its "Keep" offer. Kept apart from activeRest so changes
  // here don't restart the lock-screen timer. `seconds` is the length as
  // configured, `planned` that length after -15s/+15s. Null for a rest
  // brought back from the lock screen, which doesn't carry it.
  const restSource = ref<{
    restId: number
    exerciseId: string
    exerciseName: string
    kind: 'exercise' | 'default'
    seconds: number
    planned: number
    kept: boolean
  } | null>(null)
  // The rest showing the one-time tip (the first rest this device ever shows).
  const tipRestId = ref<number | null>(null)

  // A rest that ran out (vs. ended early) keeps its native alert; set just
  // before clearing activeRest.
  let ranOut = false
  let interval: ReturnType<typeof setInterval> | undefined

  // Issue #78: the phone's own notification alerts when a rest runs out.
  // Scheduled as soon as the rest starts, follows ±15s adjustments,
  // cancelled if the rest ends early. A rest that runs out keeps its alert,
  // unless the user was watching the app (visible and focused), which
  // already chimed. With Premium (#143) the lock-screen timer takes the
  // alert's place and follows the same rules.
  watch(
    () => activeRest.value && { ...activeRest.value, upNext: upNextName.value },
    (rest) => {
      const live = restLiveEnabled()
      if (rest && live) {
        startRestLive({
          id: rest.id,
          workoutId: workout.activeWorkoutId,
          exerciseName: rest.exerciseName,
          endsAt: rest.endsAt,
          totalSeconds: rest.totalSeconds,
          ...restLiveCopy(rest.exerciseName, rest.upNext),
        })
      } else if (rest) scheduleRestAlert(rest.exerciseName, rest.endsAt)
      else if (!ranOut) live ? endRestLive() : cancelRestAlert()
      else if (document.visibilityState === 'visible' && document.hasFocus()) live ? endRestLive() : dismissRestAlert()
      ranOut = false
    },
  )

  // Issue #143: +15s and Skip on the lock screen change the native copy of
  // the rest; take them on as they happen, and again whenever the app
  // wakes or a workout comes back after the app was killed, in case the
  // event was missed.
  onRestLiveAction(() => syncFromLockScreen())
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncFromLockScreen()
  })
  watch(
    () => workout.activeWorkoutId,
    (id) => {
      if (id) syncFromLockScreen()
    },
  )

  // Issue #166: the full rest screen shows over the lock screen, and only
  // while it's up (leaving Home minimizes, so this covers that too).
  watch(
    () => !!activeRest.value && !minimized.value && restLiveEnabled(),
    (over) => setRestOverLockScreen(over),
  )

  // "Back to workout" from the full rest screen. Over the lock screen
  // (#166) that leaves the rest screen for the rest of the app, so it asks to
  // unlock first and stays put if the user cancels.
  async function minimize() {
    if (restLiveEnabled() && !(await unlockForRest())) return
    if (activeRest.value) minimized.value = true
  }

  async function syncFromLockScreen() {
    if (!restLiveEnabled()) return
    const native = await readRestLive()
    const sync = reconcileRest(activeRest.value, native, workout.activeWorkoutId, Date.now())
    if (sync.kind === 'skip') skip()
    else if (sync.kind === 'update' && activeRest.value) {
      activeRest.value = { ...activeRest.value, endsAt: sync.endsAt, totalSeconds: sync.totalSeconds }
    } else if (sync.kind === 'restore') {
      // Brought back on Home, where the workout was just resumed.
      minimized.value = false
      activeRest.value = { ...sync.rest }
    }
  }

  function tick() {
    if (!activeRest.value) return
    remaining.value = Math.max(0, Math.round((activeRest.value.endsAt - Date.now()) / 1000))
    if (remaining.value <= 0) finish()
  }

  watch([minimized, activeRest], () => {
    clearInterval(interval)
    if (minimized.value && activeRest.value) {
      tick()
      interval = setInterval(tick, 250)
    }
  })

  const label = computed(() => {
    const m = Math.floor(remaining.value / 60)
    const s = remaining.value % 60
    return `${m}:${String(s).padStart(2, '0')}`
  })

  async function checkAlertsOff(restId: number) {
    const workoutId = workout.activeWorkoutId
    if (!workoutId || noticeShownFor === workoutId) return
    if (!(await restAlertsDenied())) return
    // The rest may have ended, or another begun, while the phone answered.
    if (activeRest.value?.id !== restId || noticeShownFor === workoutId) return
    noticeShownFor = workoutId
    alertsOffNotice.value = true
  }

  async function checkExactAlerts(restId: number) {
    if (!(await exactAlertsNoticeDue())) return
    if (activeRest.value?.id !== restId) return
    exactNotice.value = true
  }

  async function allowExactAlerts() {
    if (await openExactRestAlertSetting()) exactNotice.value = false
  }

  function dismissExactNotice() {
    exactNotice.value = false
  }

  // Back from the phone's settings: the notice goes once it's allowed.
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && exactNotice.value && (await exactRestAlertsAllowed())) exactNotice.value = false
  })

  function dismissAlertsOffNotice() {
    alertsOffNotice.value = false
  }

  function start(
    exerciseName: string,
    seconds: number,
    headline?: string,
    source?: { exerciseId: string; exerciseName: string; kind: 'exercise' | 'default' },
  ) {
    alertsOffNotice.value = false
    exactNotice.value = false
    minimized.value = false
    const now = Date.now()
    activeRest.value = { id: now, exerciseName, endsAt: now + seconds * 1000, totalSeconds: seconds, headline }
    restSource.value = source ? { restId: now, ...source, seconds, planned: seconds, kept: false } : null
    tipRestId.value = null
    if (source && !restTipSeen()) {
      tipRestId.value = now
      markRestTipSeen()
    }
    void checkAlertsOff(now)
    void checkExactAlerts(now)
  }

  // ±15s (item 52). Shrinking never rescales the progress bar's
  // denominator; growing extends totalSeconds only past it.
  function adjust(deltaSeconds: number) {
    if (!activeRest.value) return
    const current = Math.round((activeRest.value.endsAt - Date.now()) / 1000)
    const next = Math.max(0, current + deltaSeconds)
    activeRest.value = {
      ...activeRest.value,
      endsAt: Date.now() + next * 1000,
      totalSeconds: Math.max(activeRest.value.totalSeconds, next),
    }
    if (restSource.value?.restId === activeRest.value.id) {
      restSource.value = { ...restSource.value, planned: Math.max(0, restSource.value.planned + deltaSeconds) }
    }
  }

  // Issue #429: "Keep 1:45 for Bench press" saved the adjusted length as the
  // exercise's own rest, so this rest now counts as coming from it.
  function markKept() {
    const source = restSource.value
    if (!source) return
    restSource.value = { ...source, kind: 'exercise', seconds: source.planned, kept: true }
  }

  function dismissTip() {
    tipRestId.value = null
  }

  // Ended early (Skip): cancels the native alert.
  function skip() {
    activeRest.value = null
    restSource.value = null
    tipRestId.value = null
    alertsOffNotice.value = false
    exactNotice.value = false
    minimized.value = false
  }

  // Ran out. `alerted` is true when RestTimer.vue already vibrated and
  // chimed.
  function finish(alerted = false) {
    if (!activeRest.value) return
    if (!alerted) {
      navigator.vibrate?.(200)
      playRestChime()
    }
    ranOut = true
    skip()
  }

  // Finishing or discarding the workout ends any rest with it.
  watch(
    () => workout.activeWorkoutId,
    (id) => {
      if (id) return
      pendingAdvance.value = null
      skip()
    },
  )

  return {
    activeRest,
    minimized,
    alertsOffNotice,
    dismissAlertsOffNotice,
    exactNotice,
    allowExactAlerts,
    dismissExactNotice,
    restSource,
    tipRestId,
    markKept,
    dismissTip,
    remaining,
    label,
    pendingAdvance,
    upNextName,
    start,
    adjust,
    skip,
    finish,
    minimize,
  }
})
