<script setup lang="ts">
import MuscleIcon from './MuscleIcon.vue'
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, MUSCLE_GROUP_TINTS, type MuscleGroup } from '../lib/muscleGroups'

// Issue #42: the "What does it work?" 4x2 grid from screen 3 of
// docs/design/issue-39-exercise-library.html. Used by both create forms, the
// Exercises tab edit form, and the one-time check screen's per-row picker.
// A fieldset so each tile's accessible name ("Legs") can be scoped by the
// legend, since AlsoWorksPicker uses the same labels.
withDefaults(defineProps<{ modelValue: MuscleGroup | null; legend?: string }>(), {
  legend: 'What does it work?',
})

defineEmits<{ 'update:modelValue': [value: MuscleGroup] }>()
</script>

<template>
  <fieldset class="muscle-picker">
    <legend>{{ legend }}</legend>
    <div class="muscle-grid">
      <button
        v-for="group in MUSCLE_GROUPS"
        :key="group"
        type="button"
        class="muscle-tile"
        :class="{ 'muscle-tile-selected': modelValue === group }"
        :style="{ '--c': MUSCLE_GROUP_TINTS[group] }"
        :aria-pressed="modelValue === group"
        @click="$emit('update:modelValue', group)"
      >
        <MuscleIcon :group="group" />
        <span>{{ MUSCLE_GROUP_LABELS[group] }}</span>
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.muscle-picker {
  margin: 0 0 4px;
  padding: 0;
  border: none;
  min-width: 0;
}

.muscle-picker legend {
  padding: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.muscle-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.muscle-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-height: 0;
  padding: 10px 4px 8px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 0.74rem;
  font-weight: 700;
}

.muscle-tile :deep(.muscle-icon) {
  width: 30px;
  height: 30px;
  color: var(--c);
}

.muscle-tile-selected {
  background: color-mix(in srgb, var(--c) 24%, var(--surface-2));
  border-color: var(--c);
}
</style>
