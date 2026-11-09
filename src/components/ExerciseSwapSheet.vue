<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useExercisesStore } from '../stores/exercises'
import { useWorkoutsStore } from '../stores/workouts'
import { rankSwapOptions, swapGroupFor, swapReason, swapTargetFor, type SwapOption } from '../lib/exerciseSwap'
import { MUSCLE_GROUP_LABELS } from '../lib/muscleGroups'
import { hasPremium, openPremiumSheet } from '../lib/premium'
import { formatSetLabel } from '../lib/setLabel'
import TrialNote from './TrialNote.vue'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #150: "Try instead" for when the planned machine is taken. Lists close
// alternatives (lib/exerciseSwap.ts); picking one swaps it in for this workout
// only. Without Premium it's a preview, like themes: the list shows, and
// picking leads to "Keep it with Premium".
const props = defineProps<{
  exerciseId: string
  // Exercises already in this workout, never offered.
  deckIds: string[]
  busy: boolean
  error: string
}>()
const emit = defineEmits<{ pick: [option: SwapOption]; dismiss: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('dismiss'))

const exercises = useExercisesStore()
const workout = useWorkoutsStore()

const current = computed(() => exercises.exercises.find((e) => e.id === props.exerciseId) ?? null)
const locked = computed(() => !hasPremium('swap'))

// Suggestions stick to the exercise's target (biceps, triceps, quads, ...).
// When that's unknown or has nothing to offer, "Show all" ranks the whole
// muscle group instead.
const broad = ref(false)
const target = computed(() => (current.value ? swapTargetFor(current.value) : null))
const group = computed(() => (current.value ? swapGroupFor(current.value) : null))

const options = computed(() => {
  if (!current.value) return []
  return rankSwapOptions({
    current: current.value,
    exercises: exercises.activeExercises,
    excludeIds: props.deckIds,
    loggedIds: new Set(workout.recentlyLoggedExerciseIds),
    broad: broad.value,
  })
})

const emptyMessage = computed(() => {
  if (!group.value) return 'Set a muscle group on this exercise to get suggestions.'
  if (!target.value && !broad.value) return `We're not sure what ${current.value?.name} works like, so there are no close matches.`
  return `No close matches for ${current.value?.name}.`
})

async function showAll() {
  broad.value = true
  await loadLastLabels()
}

// "Last: 8 × 135 lb", from the most recent workout that had the exercise.
const lastLabels = ref<Record<string, string>>({})

async function loadLastLabels() {
  for (const option of options.value) {
    const id = option.exerciseId
    if (!id || lastLabels.value[option.key]) continue
    const sets = await workout.fetchFallbackPreviousSets(id)
    const last = sets[sets.length - 1]
    const exercise = exercises.exercises.find((e) => e.id === id)
    if (!last || !exercise) continue
    const label = formatSetLabel(exercise.load_type, last.reps, last.weight, last.weight_unit, last.level, {
      durationSeconds: last.duration_seconds,
      distance: last.distance,
      distanceUnit: last.distance_unit,
      incline: last.incline,
      calories: last.calories,
    })
    if (label) lastLabels.value = { ...lastLabels.value, [option.key]: label }
  }
}

onMounted(async () => {
  await workout.fetchRecentlyLoggedExercises()
  await loadLastLabels()
})

function pick(option: SwapOption) {
  if (props.busy) return
  if (locked.value) {
    openPremiumSheet('swap')
    return
  }
  emit('pick', option)
}
</script>

<template>
  <div class="sheet-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="swap-sheet-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h3 id="swap-sheet-title" class="sheet-title">Try instead</h3>
      <p class="intro">
        Swap <strong>{{ current?.name }}</strong> for this workout. Your routine stays the same.
      </p>
      <TrialNote feature="swap" />

      <p v-if="options.length === 0" class="empty">{{ emptyMessage }}</p>
      <ul v-else class="options" aria-label="Alternatives">
        <li v-for="option in options" :key="option.key">
          <button type="button" class="option" :disabled="busy" @click="pick(option)">
            <span class="option-name">{{ option.name }}</span>
            <span class="option-sub">{{ swapReason(option) }}</span>
            <span v-if="lastLabels[option.key]" class="option-last">Last: {{ lastLabels[option.key] }}</span>
            <span v-else-if="!option.exerciseId" class="option-new">Adds it to your exercises</span>
          </button>
        </li>
      </ul>

      <button v-if="!broad && group && options.length < 3" type="button" class="show-all" @click="showAll">
        Show all {{ MUSCLE_GROUP_LABELS[group].toLowerCase() }} exercises
      </button>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div v-if="locked" class="preview-bar" role="group" aria-label="Swap preview">
        <p class="preview-text">Swapping mid-workout is part of <strong>Premium</strong>.</p>
        <div class="preview-actions">
          <button type="button" class="keep" @click="openPremiumSheet('swap')">Keep it with Premium</button>
          <button type="button" class="go-back" @click="emit('dismiss')">Go back</button>
        </div>
      </div>
      <button v-else type="button" class="cancel" :disabled="busy" @click="emit('dismiss')">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

.intro {
  margin: -6px 0 0;
  font-size: 0.88rem;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.intro strong {
  color: var(--text);
}

.empty {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-dim);
}

.options {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option {
  width: 100%;
  margin: 0;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text);
}

.option-name {
  font-size: 1rem;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.option-sub {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dim);
}

.option-last {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--accent);
}

.option-new {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--secondary);
}

.show-all {
  align-self: flex-start;
  margin: 0;
  padding: 4px 0;
  min-height: 0;
  background: none;
  border: none;
  color: var(--secondary);
  font-size: 0.88rem;
  font-weight: 800;
}

.error {
  margin: 0;
  font-size: 0.85rem;
  color: var(--danger);
}

.cancel {
  width: 100%;
  margin: 0;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.preview-bar {
  position: sticky;
  bottom: 0;
  margin: 0 -16px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-text {
  margin: 0;
  font-size: 0.84rem;
  color: var(--text-dim);
}

.preview-text strong {
  color: var(--text);
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.keep {
  flex: 1;
  min-height: 46px;
  margin: 0;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.keep:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.go-back {
  min-height: 46px;
  margin: 0;
  padding: 0 16px;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
  font-weight: 700;
}
</style>
