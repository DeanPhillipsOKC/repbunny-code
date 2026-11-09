<script setup lang="ts">
import { FEEL_DIMENSIONS, type FeelKey, type WorkoutFeel } from '../lib/workoutFeel'

// Issue #149: one tap per tag, all optional. Tapping the picked option again
// clears it. Used on the finish recap and in the Workout log.
const props = defineProps<{ feel: WorkoutFeel }>()
const emit = defineEmits<{ change: [patch: Partial<WorkoutFeel>] }>()

function pick(key: FeelKey, value: string) {
  emit('change', { [key]: props.feel[key] === value ? null : value } as Partial<WorkoutFeel>)
}
</script>

<template>
  <div class="feel-picker">
    <div v-for="dimension in FEEL_DIMENSIONS" :key="dimension.key" class="feel-row" role="group" :aria-label="dimension.label">
      <span class="feel-label" aria-hidden="true">{{ dimension.label }}</span>
      <div class="feel-options">
        <button
          v-for="option in dimension.options"
          :key="option.value"
          type="button"
          class="feel-option"
          :class="{ picked: feel[dimension.key] === option.value }"
          :aria-pressed="feel[dimension.key] === option.value"
          @click="pick(dimension.key, option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feel-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Label, then the three options. Issue #492: once the options can't get
   11.5em (a large Android font size), the label takes its own line above
   them instead of squeezing them until words broke. */
.feel-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 8px;
  row-gap: 4px;
}

.feel-label {
  flex: 0 0 auto;
  min-width: 56px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dim);
}

.feel-options {
  flex: 1 1 11.5em;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.feel-option {
  min-height: 40px;
  min-width: 0;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.15;
  /* Issue #492: wraps to two lines at a large font size instead of running
     into the next option. */
  overflow-wrap: break-word;
}

.feel-option.picked {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface));
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 800;
}
</style>
