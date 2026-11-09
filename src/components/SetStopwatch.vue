<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { playRestChime } from '../lib/restChime'
import { formatSecondsAsClock } from '../lib/timedInput'
import { themeArt } from '../lib/theme'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #85: a count-up stopwatch for a timed set, styled like the rest
// screen (RestTimer.vue). The row's Time value at Start is the goal (null
// for a plain stopwatch). Timed off `startedAt` rather than counting ticks,
// so a throttled tab still reads right. Stop hands the elapsed whole seconds
// back to WorkoutLogger.vue, which writes them into the row without logging.

// Issue #191: the name is a display-font heading (title case on display only,
// so "RDL" stays "RDL"), with the set number and last time under it, and the
// dumbbell bunny along on screens tall enough to fit her.

const props = defineProps<{
  exerciseName: string
  startedAt: number
  goalSeconds: number | null
  setLabel?: string | null
  lastTimeLabel?: string | null
}>()

const emit = defineEmits<{
  (e: 'stop', elapsedSeconds: number): void
  (e: 'cancel'): void
}>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('cancel'))

function elapsedNow(): number {
  return Math.max(0, Math.floor((Date.now() - props.startedAt) / 1000))
}

const elapsed = ref(elapsedNow())
const goalHit = ref(props.goalSeconds !== null && elapsed.value >= props.goalSeconds)
let intervalId: ReturnType<typeof setInterval> | undefined

function tick() {
  elapsed.value = elapsedNow()
  if (!goalHit.value && props.goalSeconds !== null && elapsed.value >= props.goalSeconds) {
    goalHit.value = true
    navigator.vibrate?.(200)
    playRestChime()
  }
}

// Keep the screen on mid-set. Unsupported or refused requests are fine to
// ignore.
let wakeLock: WakeLockSentinel | null = null
let unmounted = false

async function requestWakeLock() {
  try {
    const lock = await navigator.wakeLock?.request('screen')
    if (!lock) return
    if (unmounted) void lock.release()
    else wakeLock = lock
  } catch {
    // Not available here (e.g. no secure context or battery saver).
  }
}

onMounted(() => {
  intervalId = setInterval(tick, 250)
  void requestWakeLock()
})

onUnmounted(() => {
  unmounted = true
  clearInterval(intervalId)
  void wakeLock?.release().catch(() => {})
})

const clockLabel = computed(() => formatSecondsAsClock(elapsed.value))
const overLabel = computed(() =>
  props.goalSeconds === null ? '' : `+${formatSecondsAsClock(Math.max(0, elapsed.value - props.goalSeconds))}`,
)

const RING_RADIUS = 100
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const ringOffset = computed(() => {
  if (props.goalSeconds === null) return RING_CIRCUMFERENCE
  const fraction = Math.min(1, elapsed.value / props.goalSeconds)
  return RING_CIRCUMFERENCE * (1 - fraction)
})

function stop() {
  emit('stop', elapsedNow())
}
</script>

<template>
  <div class="stopwatch-overlay" role="dialog" aria-modal="true" :aria-label="`Timing ${exerciseName}`">
    <div class="stopwatch-badge">
      <span class="stopwatch-dot"></span>
      <span class="stopwatch-badge-label">Timing</span>
    </div>

    <div class="stopwatch-hero">
      <div class="stopwatch-heading">
        <img :src="themeArt('celebration-dumbbell')" alt="" class="stopwatch-bunny mascot-art" />
        <h2 class="stopwatch-name">{{ exerciseName }}</h2>
        <p v-if="setLabel" class="stopwatch-set">{{ setLabel }}</p>
        <p v-if="lastTimeLabel" class="stopwatch-last">Last time {{ lastTimeLabel }}</p>
      </div>
      <div class="stopwatch-ring-wrap" :class="{ 'stopwatch-ring-hit': goalHit }">
        <svg v-if="goalSeconds !== null" class="stopwatch-ring" viewBox="0 0 240 240" aria-hidden="true">
          <circle class="stopwatch-ring-track" cx="120" cy="120" :r="RING_RADIUS" />
          <circle
            class="stopwatch-ring-fill"
            cx="120"
            cy="120"
            :r="RING_RADIUS"
            :stroke-dasharray="RING_CIRCUMFERENCE"
            :stroke-dashoffset="ringOffset"
          />
        </svg>
        <div class="stopwatch-readout">
          <p class="stopwatch-clock">{{ clockLabel }}</p>
          <template v-if="goalSeconds !== null">
            <p v-if="goalHit" class="stopwatch-goal stopwatch-goal-hit">Goal hit <span>{{ overLabel }}</span></p>
            <p v-else class="stopwatch-goal">Goal {{ formatSecondsAsClock(goalSeconds) }}</p>
          </template>
        </div>
      </div>
    </div>

    <div class="stopwatch-footer">
      <button type="button" class="stopwatch-stop" @click="stop">Stop</button>
      <button type="button" class="stopwatch-cancel" @click="emit('cancel')">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.stopwatch-overlay {
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
}

.stopwatch-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.stopwatch-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: stopwatch-pulse-dot 1.6s ease-in-out infinite;
}

.stopwatch-badge-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.stopwatch-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.stopwatch-heading {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.stopwatch-bunny {
  width: 84px;
  height: 84px;
  object-fit: contain;
  margin-bottom: 2px;
}

.stopwatch-name {
  margin: 0;
  max-width: 100%;
  font-family: var(--font-display);
  font-size: 2.4rem;
  font-weight: 800;
  line-height: 1.1;
  text-transform: capitalize;
  overflow-wrap: anywhere;
  color: var(--text);
}

.stopwatch-set {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent);
}

.stopwatch-last {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

/* Short phones (an iPhone SE is 667px tall) keep the clock and Stop on
   screen by dropping the bunny first. */
@media (max-height: 760px) {
  .stopwatch-bunny {
    display: none;
  }

  .stopwatch-overlay {
    padding-top: 40px;
  }
}

.stopwatch-ring-wrap {
  position: relative;
  width: 240px;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stopwatch-ring {
  position: absolute;
  inset: 0;
  transform: rotate(-90deg);
}

.stopwatch-ring circle {
  fill: none;
  stroke-width: 12;
}

.stopwatch-ring-track {
  stroke: var(--surface-2);
}

.stopwatch-ring-fill {
  stroke: var(--accent);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.25s linear;
}

.stopwatch-readout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.stopwatch-clock {
  margin: 0;
  font-size: 4rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--text);
}

.stopwatch-goal {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-dim);
}

.stopwatch-goal-hit {
  color: var(--accent);
}

.stopwatch-goal-hit span {
  font-variant-numeric: tabular-nums;
}

.stopwatch-footer {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.stopwatch-stop {
  width: 100%;
  max-width: 300px;
  min-height: 64px;
  font-size: 1.25rem;
  font-weight: 800;
  background: var(--accent);
  color: var(--accent-text);
  border: none;
}

.stopwatch-cancel {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 0.85rem;
  padding: 4px;
}

@keyframes stopwatch-pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
/* #880: a phone turned sideways. The name and ring sit side by side, and the
   overlay scrolls if it still runs long, so Stop stays reachable. */
@media (orientation: landscape) and (max-height: 500px) {
  .stopwatch-overlay {
    overflow-y: auto;
    gap: 8px;
    padding: calc(10px + var(--safe-top)) max(24px, env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom, 0px))
      max(24px, env(safe-area-inset-left));
  }

  .stopwatch-hero {
    flex-direction: row;
    gap: 28px;
  }

  .stopwatch-name {
    font-size: 1.6rem;
  }

  .stopwatch-ring-wrap {
    width: 170px;
    height: 170px;
    flex-shrink: 0;
  }

  .stopwatch-clock {
    font-size: 2.6rem;
  }
}
</style>
