<script setup lang="ts">
import type { PushPull } from '../lib/types'

// Issue #173: Push / Pull / Neither for one exercise, so Balance can count
// it. Used by the exercise form and the push or pull fix-up screen.
defineProps<{
  modelValue: PushPull | null
  legend: string
  // Visually hide the legend (the fix-up screen's row already names it).
  hideLegend?: boolean
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: PushPull]
}>()

const OPTIONS: { value: PushPull; label: string }[] = [
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'neither', label: 'Neither' },
]
</script>

<template>
  <fieldset class="push-pull">
    <legend :class="{ 'visually-hidden': hideLegend }">{{ legend }}</legend>
    <div class="segments">
      <button
        v-for="option in OPTIONS"
        :key="option.value"
        type="button"
        class="segment"
        :class="{ selected: modelValue === option.value }"
        :aria-pressed="modelValue === option.value"
        :disabled="disabled"
        @click="$emit('update:modelValue', option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.push-pull {
  margin: 0;
  padding: 0;
  border: none;
  min-width: 0;
}

.push-pull legend {
  padding: 0;
  font-size: 0.85rem;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.segments {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.segment {
  min-height: 40px;
  padding: 0 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 0.86rem;
  font-weight: 700;
}

.segment.selected {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  border-color: var(--accent);
  color: var(--accent);
}
</style>
