<script setup lang="ts">
import { themeArt } from '../lib/theme'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { playRestChime } from '../lib/restChime'
import { plainRestLine } from '../lib/extras'
import { openRestAlertSettings, REST_ALERT_DIRECTIONS, restSettingsFailed } from '../lib/restLive'
import { formatSecondsAsClock } from '../lib/timedInput'
import { useExercisesStore } from '../stores/exercises'
import { useRestStore } from '../stores/rest'
import SmallWinChip from './SmallWinChip.vue'
import type { SmallWin } from '../lib/smallWins'

// Backlog item 28: in-app rest screen shown after logging a set for an
// exercise with rest_seconds configured. Distinct from the phone's own rest
// alert (src/lib/restAlert.ts), which covers the app going to the background
// during the rest period.
//
// `endsAt` (not `restSeconds` alone) is passed in from WorkoutLogger.vue so
// both this screen and that visibility-fallback check compute the same
// "time left" off one fixed timestamp, rather than each starting its own
// clock a tick apart.

const props = defineProps<{
  exerciseName: string
  endsAt: number
  totalSeconds: number
  // Backlog item 104: set when this rest follows an exercise's final planned
  // set and the deck will move on to another exercise once it ends.
  upNextName?: string | null
  // Issue #183: picked by WorkoutLogger.vue when the set was logged.
  headline?: string | null
  // Issue #475: the small wins of the set that started this rest, one line
  // each (lib/smallWins.ts).
  wins?: SmallWin[]
}>()

const emit = defineEmits<{
  (e: 'dismiss'): void
  // The countdown ran out on its own, as opposed to Skip (`dismiss`); the
  // phone's rest alert (#78) is only cancelled for the latter.
  (e: 'finish'): void
  (e: 'minimize'): void
  (e: 'adjust', deltaSeconds: number): void
  // Issue #429: the source line's links. The rest keeps running.
  (e: 'editExerciseRest', exerciseId: string): void
  (e: 'editDefaultRest'): void
}>()

function secondsLeft(): number {
  return Math.max(0, Math.round((props.endsAt - Date.now()) / 1000))
}

// Backlog item 29: rotating encouragement copy, deliberately split out from
// item 28 so the core rest screen didn't grow scope creep from a
// copy-rotation system. Picked once per mount (i.e. once per rest period,
// since WorkoutLogger.vue's `v-if="activeRest"` remounts this component
// fresh for each rest) rather than re-picked on a timer, so the headline
// doesn't change mid-rest. Issue #183: the line is picked once per rest when
// the set is logged (it talks about that set, in the picked bunny
// personality's voice) and kept on the rest, so minimizing and coming back
// shows the same one. A rest without one (brought back from the lock
// screen) gets a plain line.
const headline = props.headline ?? plainRestLine()

const rest = useRestStore()

const remaining = ref(secondsLeft())
let intervalId: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  intervalId = setInterval(() => {
    remaining.value = secondsLeft()
    if (remaining.value <= 0) {
      clearInterval(intervalId)
      navigator.vibrate?.(200)
      playRestChime()
      emit('finish')
    }
  }, 250)
})

onUnmounted(() => {
  clearInterval(intervalId)
})

const remainingLabel = computed(() => {
  const m = Math.floor(remaining.value / 60)
  const s = remaining.value % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

const progressPercent = computed(() => (remaining.value / props.totalSeconds) * 100)

// Issue #429: one quiet line under -15s/+15s saying where this rest's time
// came from (the exercise's own rest or the Account default), with links to
// change it. The first rest this device ever shows gets a one-time tip in
// its place. After -15s/+15s, "Keep" saves the adjusted time as the
// exercise's own rest.
const exercises = useExercisesStore()
const source = computed(() => (rest.restSource && rest.restSource.restId === rest.activeRest?.id ? rest.restSource : null))
const showTip = computed(() => !!source.value && rest.tipRestId === source.value.restId)
const showKeep = computed(() => !!source.value && source.value.planned > 0 && source.value.planned !== source.value.seconds)
// "Saved for Bench press" reads for a moment after Keep, then the line comes back.
const keptFlash = ref(false)
let keptTimeout: ReturnType<typeof setTimeout> | undefined
onUnmounted(() => clearTimeout(keptTimeout))
const keepBusy = ref(false)
const keepError = ref('')

function editExerciseRest() {
  if (!source.value) return
  rest.dismissTip()
  emit('editExerciseRest', source.value.exerciseId)
}

function editDefaultRest() {
  rest.dismissTip()
  emit('editDefaultRest')
}

async function keep() {
  const current = source.value
  if (!current || keepBusy.value) return
  keepBusy.value = true
  keepError.value = ''
  const { error } = await exercises.updateRestSeconds(current.exerciseId, current.planned)
  keepBusy.value = false
  if (error) keepError.value = `Couldn't save that rest time. ${error.message}`
  else {
    rest.markKept()
    keptFlash.value = true
    clearTimeout(keptTimeout)
    keptTimeout = setTimeout(() => (keptFlash.value = false), 2500)
  }
}
</script>

<template>
  <div class="rest-overlay" role="status" aria-live="polite">
    <div class="rest-badge">
      <span class="rest-dot"></span>
      <span class="rest-badge-label">Resting</span>
    </div>

    <div class="rest-hero">
      <div class="rest-glow-wrap mascot-art">
        <div class="rest-glow"></div>
        <img :src="themeArt('rest')" alt="" class="rest-bunny" />
      </div>

      <div class="rest-copy">
        <p class="rest-headline">{{ headline }}</p>
        <ul v-if="wins && wins.length > 0" class="rest-wins" aria-label="Small wins">
          <li v-for="win in wins" :key="win.kind">
            <SmallWinChip :win="win" />
            <span>{{ win.detail }}</span>
          </li>
        </ul>
        <p class="rest-countdown">{{ remainingLabel }}</p>
        <p v-if="upNextName" class="rest-context">Up next: {{ upNextName }}</p>
        <p v-else class="rest-context">Next: {{ exerciseName }}</p>
      </div>
    </div>

    <div class="rest-footer">
      <div class="rest-progress-track">
        <div class="rest-progress-fill" :style="{ width: `${progressPercent}%` }"></div>
      </div>
      <div class="rest-adjust-row">
        <button type="button" class="rest-adjust-btn" @click="emit('adjust', -15)">-15s</button>
        <button type="button" class="rest-adjust-btn" @click="emit('adjust', 15)">+15s</button>
      </div>
      <button v-if="showKeep && source" type="button" class="rest-keep" :disabled="keepBusy" @click="keep">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12l5 5L20 7" />
        </svg>
        Keep {{ formatSecondsAsClock(source.planned) }} for {{ source.exerciseName }}
      </button>
      <p v-else-if="keptFlash && source" class="rest-kept" role="status">Saved for {{ source.exerciseName }}</p>
      <div v-else-if="showTip && source" class="rest-tip" role="group" aria-label="Rest timer tip">
        <span class="rest-tip-icon" aria-hidden="true">⏱</span>
        <p>
          <strong>Your rest timer starts after each set.</strong> It's {{ formatSecondsAsClock(source.seconds) }} for now. Change it
          for <button type="button" class="rest-link" @click="editDefaultRest">all exercises</button> or
          <span class="rest-nowrap"><button type="button" class="rest-link" @click="editExerciseRest">just {{ source.exerciseName }}</button>.</span>
        </p>
        <button type="button" class="rest-tip-close" aria-label="Dismiss tip" @click="rest.dismissTip()">&times;</button>
      </div>
      <p v-else-if="source" class="rest-source">
        <template v-if="source.kind === 'exercise'">
          {{ source.exerciseName }} rest <b>{{ formatSecondsAsClock(source.seconds) }}</b>
          <button type="button" class="rest-link" :aria-label="`Edit rest for ${source.exerciseName}`" @click="editExerciseRest">Edit</button>
        </template>
        <template v-else>
          Default rest <b>{{ formatSecondsAsClock(source.seconds) }}</b>
          <button type="button" class="rest-link" aria-label="Edit default rest" @click="editDefaultRest">Edit</button><span
            class="rest-source-sep"
            aria-hidden="true"
            >·</span
          ><button type="button" class="rest-link" @click="editExerciseRest">Set for {{ source.exerciseName }}</button>
        </template>
      </p>
      <p v-if="keepError" class="rest-keep-error" role="alert">{{ keepError }}</p>
      <div v-if="rest.alertsOffNotice" class="rest-alerts-off" role="group" aria-label="Rest alerts are off">
        <p>Rest alerts are off, so you won't hear when rest ends with your phone locked.</p>
        <div class="rest-alerts-off-actions">
          <button v-if="!restSettingsFailed" type="button" class="rest-alerts-off-open" @click="openRestAlertSettings()">Open settings</button>
          <span v-else class="rest-alerts-off-directions">{{ REST_ALERT_DIRECTIONS }}</span>
          <button type="button" class="rest-alerts-off-close" aria-label="Dismiss" @click="rest.dismissAlertsOffNotice()">&times;</button>
        </div>
      </div>
      <div v-if="rest.exactNotice" class="rest-alerts-off rest-alerts-off-stack" role="group" aria-label="On-time rest alerts">
        <p>Your phone may send the rest alert a few seconds late. Allow on-time alerts so it arrives right as your rest ends.</p>
        <div class="rest-alerts-off-actions">
          <button type="button" class="rest-alerts-off-open" @click="rest.allowExactAlerts()">Allow on-time alerts</button>
          <button type="button" class="rest-alerts-off-open" @click="rest.dismissExactNotice()">Not now</button>
        </div>
      </div>
      <button type="button" class="rest-skip" @click="emit('dismiss')">Skip Rest</button>
      <button type="button" class="rest-back" @click="emit('minimize')">Back to workout</button>
    </div>
  </div>
</template>

<style scoped>
.rest-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--bg);
  color: var(--text);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 56px 28px 40px;
  /* A short screen or a long bunny line must scroll, not push "Back to workout" out of reach (#379). */
  overflow-y: auto;
  /* Keeps the countdown's line off the progress bar when the screen is full. */
  gap: 16px;
}

.rest-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.rest-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: rest-pulse-dot 1.6s ease-in-out infinite;
}

.rest-badge-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.rest-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}

.rest-glow-wrap {
  position: relative;
  width: 220px;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rest-glow {
  position: absolute;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent) 35%, transparent) 0%, transparent 70%);
  filter: blur(2px);
  animation: rest-breathe 4s ease-in-out infinite;
}

.rest-bunny {
  width: 168px;
  height: 168px;
  object-fit: contain;
  position: relative;
  animation: rest-breathe 4s ease-in-out infinite;
}

.rest-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.rest-wins {
  list-style: none;
  margin: 4px 0 2px;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.rest-wins li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--text);
}

.rest-headline {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text);
}

.rest-countdown {
  margin: 0;
  font-size: 4rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--text);
}

.rest-context {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-dim);
  text-align: center;
}

.rest-footer {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.rest-progress-track {
  width: 100%;
  max-width: 280px;
  height: 10px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.rest-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.25s linear;
}

.rest-adjust-row {
  display: flex;
  gap: 12px;
  width: 100%;
  max-width: 280px;
}

.rest-adjust-btn {
  flex: 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px;
  font-weight: 600;
}

.rest-source {
  margin: 0;
  max-width: 300px;
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--text-dim);
  text-align: center;
}

.rest-source b {
  color: var(--text);
  font-weight: 700;
}

.rest-source-sep {
  margin: 0 4px;
  opacity: 0.5;
}

/* Inline links, each kept on one line. A little padding widens the tap
   area without moving the text; no negative margins, so when a long name
   wraps the second link onto its own line it can't cover the first. */
.rest-link {
  display: inline;
  min-height: 0;
  margin: 0;
  padding: 4px 2px;
  white-space: nowrap;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--accent);
  font: inherit;
  font-weight: 700;
}

.rest-nowrap {
  white-space: nowrap;
}

.rest-keep,
.rest-kept {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 300px;
  min-height: 40px;
  margin: 0;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--success) 55%, var(--border));
  background: color-mix(in srgb, var(--success) 12%, var(--surface));
  color: var(--success);
  font-size: 0.84rem;
  font-weight: 800;
  text-align: left;
}

.rest-keep svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.rest-keep-error {
  margin: 0;
  max-width: 300px;
  font-size: 0.8rem;
  color: var(--danger);
  text-align: center;
}

.rest-tip {
  width: 100%;
  max-width: 310px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 4px 10px 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text-dim);
  text-align: left;
}

.rest-tip p {
  flex: 1;
  min-width: 0;
  margin: 0;
}

.rest-tip strong {
  color: var(--text);
}

.rest-tip-icon {
  color: var(--highlight);
  font-size: 1rem;
  line-height: 1.2;
}

.rest-tip-close {
  min-width: 44px;
  min-height: 44px;
  margin: -10px 0 -10px -6px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 1.2rem;
}

.rest-skip {
  width: 100%;
  max-width: 300px;
  background: var(--surface);
}

.rest-alerts-off {
  width: 100%;
  max-width: 300px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  font-size: 0.8rem;
  color: var(--text-dim);
}

.rest-alerts-off-stack {
  flex-direction: column;
  align-items: stretch;
}

.rest-alerts-off p {
  margin: 0;
  flex: 1;
  text-align: left;
}

.rest-alerts-off-directions {
  font-size: 0.8rem;
  font-weight: 700;
  text-align: left;
}

.rest-alerts-off-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.rest-alerts-off-open {
  min-height: 44px;
  padding: 0 10px;
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
}

.rest-alerts-off-close {
  min-width: 44px;
  min-height: 44px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 1.2rem;
}

.rest-back {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 0.85rem;
  padding: 4px;
}

/* Issue #429: the source line, Keep, and the tip add height; on a shorter
   phone the bunny shrinks so Skip Rest stays on screen. */
@media (max-height: 820px) {
  .rest-overlay {
    padding-top: 40px;
    padding-bottom: 28px;
  }

  .rest-hero {
    gap: 12px;
  }

  .rest-glow-wrap {
    width: 150px;
    height: 150px;
  }

  .rest-glow {
    width: 140px;
    height: 140px;
  }

  .rest-bunny {
    width: 116px;
    height: 116px;
  }

  .rest-countdown {
    font-size: 3.5rem;
  }

  .rest-footer {
    gap: 14px;
  }
}

@media (max-height: 700px) {
  .rest-glow-wrap {
    width: 120px;
    height: 120px;
  }

  .rest-glow {
    width: 112px;
    height: 112px;
  }

  .rest-bunny {
    width: 92px;
    height: 92px;
  }
}

@keyframes rest-breathe {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-16px) scale(1.06);
  }
}

@keyframes rest-pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
/* #880: a phone turned sideways. The bunny and countdown sit on the left and
   the controls on the right, so nothing needs scrolling to reach "Back to
   workout". The overlay still scrolls if the right side runs long. */
@media (orientation: landscape) and (max-height: 500px) {
  .rest-overlay {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto 1fr;
    column-gap: 24px;
    row-gap: 4px;
    align-items: center;
    justify-items: center;
    padding: calc(10px + var(--safe-top)) max(24px, env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom, 0px))
      max(24px, env(safe-area-inset-left));
  }

  .rest-badge {
    grid-column: 1;
    grid-row: 1;
  }

  .rest-hero {
    grid-column: 1;
    grid-row: 2;
    gap: 4px;
  }

  .rest-footer {
    grid-column: 2;
    grid-row: 1 / span 2;
    gap: 12px;
  }

  .rest-glow-wrap {
    width: 96px;
    height: 96px;
  }

  .rest-glow {
    width: 86px;
    height: 86px;
  }

  .rest-bunny {
    width: 76px;
    height: 76px;
  }

  .rest-headline {
    font-size: 1.05rem;
    text-align: center;
  }

  .rest-countdown {
    font-size: 3rem;
  }
}
</style>
