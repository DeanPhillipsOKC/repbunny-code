<script setup lang="ts">
import { computed } from 'vue'
import MuscleIcon from './MuscleIcon.vue'
import { MUSCLE_GROUP_TINTS, type MuscleGroup } from '../lib/muscleGroups'

// Issue #42: the design's `.badge` (docs/design/issue-39-exercise-library.html),
// a 40px rounded square with the group's tint at 18% behind its MuscleIcon.
// An exercise with no group yet gets a neutral "?". Decorative: the row it
// sits in names the exercise, and the group label is shown as text wherever
// the group itself matters. `tint` overrides the "?" badge's neutral color
// (the check screen and the Exercises tab prompt use the highlight yellow).
const props = defineProps<{ group: MuscleGroup | null; tint?: string }>()

const color = computed(() => (props.group ? MUSCLE_GROUP_TINTS[props.group] : (props.tint ?? 'var(--text-dim)')))
</script>

<template>
  <span class="muscle-badge" :style="{ '--c': color }" aria-hidden="true">
    <MuscleIcon v-if="group" :group="group" />
    <span v-else class="muscle-badge-unknown">?</span>
  </span>
</template>

<style scoped>
.muscle-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--c) 18%, transparent);
  color: var(--c);
}

.muscle-badge :deep(.muscle-icon) {
  width: 30px;
  height: 30px;
}

.muscle-badge-unknown {
  font-weight: 800;
  font-size: 1rem;
}
</style>
