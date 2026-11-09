<script setup lang="ts">
import { computed } from 'vue'
import type { LoadType } from '../lib/types'

// Design source: private canvas mockup "RepBunny Load Types" (see
// docs/backlog.md's mockup pointer). Replaces the plain <select> that used to
// carry this field in both the create form and the per-exercise edit flyout
// (ExerciseList.vue) — those two callers are why this lives in its own
// component instead of being written out twice.
const props = defineProps<{
  modelValue: LoadType
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: LoadType]
}>()

const options: { value: LoadType; label: string; description: string; note: string; fullWidth?: boolean }[] = [
  {
    value: 'weight',
    label: 'Weight',
    description: 'Plates, dumbbells, a stack',
    note: 'Counts toward workout volume as reps × weight.',
  },
  {
    value: 'level',
    label: 'Level',
    description: 'A difficulty setting, 1, 2, 3…',
    note: "Level sets track your progress but don't count toward workout volume.",
  },
  {
    value: 'bodyweight',
    label: 'Bodyweight',
    description: 'Push-ups, pull-ups, dips',
    note: 'Counts toward volume using your logged body weight, plus any added weight.',
  },
  {
    value: 'assisted',
    label: 'Assisted',
    description: 'A counterweight helps you up',
    note: 'Counts toward volume using your body weight minus the assist amount.',
  },
  {
    value: 'timed',
    label: 'Timed',
    description: 'Planks, treadmill, stair stepper',
    note: "Timed sets don't count toward workout volume.",
    fullWidth: true,
  },
]

const currentOption = computed(() => options.find((option) => option.value === props.modelValue) ?? options[0])
</script>

<template>
  <fieldset class="load-type-field">
    <legend>How is it loaded?</legend>

    <div v-if="disabled" class="load-type-locked">
      <span class="load-type-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <span class="load-type-locked-label">{{ currentOption.label }}</span>
      <span class="load-type-locked-pill">Locked</span>
    </div>

    <template v-else>
      <div class="load-type-grid">
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="load-type-card"
          :class="{ 'load-type-card-selected': modelValue === option.value, 'load-type-card-wide': option.fullWidth }"
          :aria-pressed="modelValue === option.value"
          :aria-label="option.label"
          @click="$emit('update:modelValue', option.value)"
        >
          <span class="load-type-icon" aria-hidden="true">
            <svg v-if="option.value === 'weight'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="8" width="3" height="8" rx="1" />
              <rect x="19" y="8" width="3" height="8" rx="1" />
              <rect x="7" y="6" width="2" height="12" rx="1" />
              <rect x="15" y="6" width="2" height="12" rx="1" />
              <line x1="9" y1="12" x2="15" y2="12" />
            </svg>
            <svg v-else-if="option.value === 'level'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="18" x2="5" y2="14" />
              <line x1="12" y1="18" x2="12" y2="9" />
              <line x1="19" y1="18" x2="19" y2="5" />
            </svg>
            <svg v-else-if="option.value === 'bodyweight'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="5" r="2.4" />
              <path d="M12 8v6M8 11l4-3 4 3M9 20l3-5 3 5" />
            </svg>
            <svg v-else-if="option.value === 'assisted'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="8" cy="5" r="2.2" />
              <path d="M8 8v6M5 11l3-3 3 3M6 20l2-5 2 5" />
              <path d="M18 15V9M15.5 11.5 18 9l2.5 2.5" />
            </svg>
            <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="13.5" r="7.5" />
              <path d="M12 13.5V10M10 2.5h4M18.5 6.5l1.5-1.5" />
            </svg>
          </span>
          <span class="load-type-title">{{ option.label }}</span>
          <span class="load-type-desc">{{ option.description }}</span>
        </button>
      </div>
      <p class="load-type-note">{{ currentOption.note }}</p>
    </template>
  </fieldset>
</template>

<style scoped>
.load-type-field {
  margin: 12px 0 4px;
  padding: 0;
  border: none;
}

.load-type-field legend {
  padding: 0;
  font-size: 0.85rem;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.load-type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.load-type-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-height: 0;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
  font-weight: 400;
}

.load-type-card-selected {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  border-color: var(--accent);
}

.load-type-card-wide {
  grid-column: 1 / -1;
}

.load-type-icon {
  display: flex;
  color: var(--text-dim);
}

.load-type-card-selected .load-type-icon {
  color: var(--accent);
}

.load-type-title {
  font-weight: 700;
  font-size: 0.9rem;
}

.load-type-card-selected .load-type-title {
  color: var(--accent);
}

.load-type-desc {
  font-size: 0.75rem;
  color: var(--text-dim);
}

.load-type-note {
  margin: 6px 0 0;
  font-size: 0.75rem;
}

.load-type-locked {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-dim);
}

.load-type-locked-label {
  font-weight: 700;
  color: var(--text);
  flex: 1;
}

.load-type-locked-pill {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface);
  font-size: 0.7rem;
  font-weight: 700;
}
</style>
