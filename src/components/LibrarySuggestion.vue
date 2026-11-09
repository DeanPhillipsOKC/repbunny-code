<script setup lang="ts">
import MuscleBadge from './MuscleBadge.vue'
import { trackingWord, type LibraryExercise } from '../lib/exerciseLibrary'
import { MUSCLE_GROUP_LABELS } from '../lib/muscleGroups'

// Issue #39: the new-exercise forms' "Already in the library" card (screen 3
// of docs/design/issue-39-exercise-library.html). "Use it" adds the entry
// instead of creating a custom exercise; ignoring it and creating still
// works.
defineProps<{ entry: LibraryExercise; busy?: boolean }>()

const emit = defineEmits<{ use: [] }>()

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
</script>

<template>
  <div class="library-suggestion" role="status">
    <MuscleBadge :group="entry.muscleGroup" class="library-suggestion-badge" />
    <span class="library-suggestion-text">
      <b>{{ entry.name }}</b>
      Already in the library · {{ MUSCLE_GROUP_LABELS[entry.muscleGroup] }} · {{ capitalize(trackingWord(entry)) }}
    </span>
    <button type="button" class="library-suggestion-use" :disabled="busy" @click="emit('use')">Use it</button>
  </div>
</template>

<style scoped>
.library-suggestion {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--highlight) 10%, var(--surface));
  border: 1px dashed color-mix(in srgb, var(--highlight) 70%, transparent);
  font-size: 0.8rem;
  color: var(--text-dim);
}

.library-suggestion-badge.muscle-badge {
  width: 34px;
  height: 34px;
  border-radius: 9px;
}

.library-suggestion-badge :deep(.muscle-icon) {
  width: 26px;
  height: 26px;
}

.library-suggestion-text {
  flex: 1;
  min-width: 0;
}

.library-suggestion-text b {
  display: block;
  font-size: 0.88rem;
  color: var(--text);
}

.library-suggestion-use {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0 4px;
  background: transparent;
  border: none;
  color: var(--highlight);
  font-weight: 800;
}
</style>
