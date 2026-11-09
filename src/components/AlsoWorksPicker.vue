<script setup lang="ts">
import { computed } from 'vue'
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS, MUSCLE_GROUP_TINTS, type MuscleGroup } from '../lib/muscleGroups'

// Issue #42: "Also works (optional)" chips from screen 3 of
// docs/design/issue-39-exercise-library.html. Multi-select over every group
// except the main one (`exclude`); callers drop the main group from the
// model themselves when it changes.
const props = defineProps<{ modelValue: MuscleGroup[]; exclude: MuscleGroup | null }>()

const emit = defineEmits<{ 'update:modelValue': [value: MuscleGroup[]] }>()

const options = computed(() => MUSCLE_GROUPS.filter((group) => group !== props.exclude))

function toggle(group: MuscleGroup) {
  emit(
    'update:modelValue',
    props.modelValue.includes(group)
      ? props.modelValue.filter((g) => g !== group)
      : MUSCLE_GROUPS.filter((g) => g === group || props.modelValue.includes(g)),
  )
}
</script>

<template>
  <fieldset class="also-works">
    <legend>Also works <small>(optional)</small></legend>
    <div class="also-works-chips">
      <button
        v-for="group in options"
        :key="group"
        type="button"
        class="also-chip"
        :class="{ 'also-chip-selected': modelValue.includes(group) }"
        :style="{ '--c': MUSCLE_GROUP_TINTS[group] }"
        :aria-pressed="modelValue.includes(group)"
        @click="toggle(group)"
      >
        <span class="also-chip-dot" aria-hidden="true"></span>
        {{ MUSCLE_GROUP_LABELS[group] }}
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.also-works {
  margin: 12px 0 0;
  padding: 0;
  border: none;
  min-width: 0;
}

.also-works legend {
  padding: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.also-works legend small {
  font-weight: 600;
  opacity: 0.8;
}

.also-works-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.also-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 0;
  width: auto;
  padding: 6px 11px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
}

.also-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c);
}

.also-chip-selected {
  background: color-mix(in srgb, var(--c) 22%, var(--surface));
  border-color: var(--c);
  color: var(--text);
}
</style>
