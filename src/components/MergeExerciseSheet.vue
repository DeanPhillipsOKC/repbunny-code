<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useExercisesStore } from '../stores/exercises'
import { useKeyboardViewport } from '../lib/keyboardViewport'
import type { Exercise } from '../lib/types'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #265: merges `exercise` (a duplicate) into another of the lifter's
// exercises with the same load type. Pick the one to keep, then confirm; the
// kept exercise's settings stay, and this copy's sets and routine rows move.
const props = defineProps<{ exercise: Exercise }>()

const emit = defineEmits<{ dismiss: []; merged: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('dismiss'))

const exercises = useExercisesStore()
const query = ref('')
const target = ref<Exercise | null>(null)
const workoutCount = ref<number | null>(null)
const merging = ref(false)
const errorMessage = ref('')

const candidates = computed(() => {
  const q = query.value.trim().toLowerCase()
  return exercises.activeExercises.filter(
    (e) => e.id !== props.exercise.id && e.load_type === props.exercise.load_type && e.name.toLowerCase().includes(q),
  )
})

onMounted(async () => {
  workoutCount.value = await exercises.countWorkouts(props.exercise.id)
})

const summary = computed(() => {
  const n = workoutCount.value
  const moved =
    n === null
      ? `${props.exercise.name} moves`
      : n === 0
        ? `${props.exercise.name} has no logged workouts, so only its routine spots move`
        : `${n} ${n === 1 ? 'workout' : 'workouts'} of ${props.exercise.name} move`
  return `${moved} to ${target.value?.name}. ${props.exercise.name} is removed.`
})

async function confirmMerge() {
  if (!target.value || merging.value) return
  errorMessage.value = ''
  merging.value = true
  const { error } = await exercises.mergeExercise(props.exercise.id, target.value.id)
  merging.value = false
  if (error) {
    errorMessage.value = error.message
    return
  }
  emit('merged')
}

const { overlayStyle, sheetStyle } = useKeyboardViewport()
</script>

<template>
  <div class="sheet-overlay" :style="overlayStyle" @click.self="emit('dismiss')">
    <div class="sheet" :style="sheetStyle" role="dialog" aria-modal="true" aria-label="Merge exercise">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-header">
        <h3 class="sheet-title">Merge {{ exercise.name }}</h3>
        <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <template v-if="!target">
        <p class="merge-hint">Pick the exercise to keep. Its settings stay as they are.</p>
        <label for="merge-search">Search your exercises</label>
        <input id="merge-search" v-model="query" type="search" autocomplete="off" />
        <ul v-if="candidates.length" class="merge-list">
          <li v-for="candidate in candidates" :key="candidate.id">
            <button type="button" class="merge-option" @click="target = candidate">{{ candidate.name }}</button>
          </li>
        </ul>
        <p v-else class="merge-hint">No other exercises with the same load type.</p>
      </template>

      <template v-else>
        <p class="merge-summary" role="status">{{ summary }}</p>
        <p class="merge-hint">This can't be undone.</p>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        <div class="actions">
          <button type="button" class="cancel" @click="target = null">Back</button>
          <button type="button" class="save" :disabled="merging" @click="confirmMerge">Merge</button>
        </div>
      </template>
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
  padding: 10px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.sheet-close {
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.merge-hint {
  margin: 0 2px;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.merge-summary {
  margin: 0;
  font-size: 0.95rem;
  color: var(--text);
}

.merge-list {
  list-style: none;
  margin: 0;
  padding: 0 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.merge-option {
  width: 100%;
  text-align: left;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.8rem;
}

.actions {
  position: sticky;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px 0 calc(16px + env(safe-area-inset-bottom, 0px));
  background: var(--bg);
  border-top: 1px solid var(--border);
}

.actions .save {
  margin-top: 0;
}
</style>
