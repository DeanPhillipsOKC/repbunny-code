<script setup lang="ts">
import MuscleBadge from './MuscleBadge.vue'
import { librarySubline, type LibraryExercise } from '../lib/exerciseLibrary'

// Issue #39: one starter-library entry, as listed in the Add exercise sheet
// and the Exercises tab's Library view (screen 2 of
// docs/design/issue-39-exercise-library.html). The name opens the entry's
// detail; the pill adds it. `owned` swaps the pill for a quiet "Added".
defineProps<{ entry: LibraryExercise; owned?: boolean; busy?: boolean }>()

const emit = defineEmits<{ add: []; open: [] }>()
</script>

<template>
  <div class="library-row">
    <button type="button" class="library-row-open" :aria-label="`View ${entry.name}`" @click="emit('open')">
      <MuscleBadge :group="entry.muscleGroup" />
      <span class="library-row-text" aria-hidden="true">
        <span class="library-row-name">{{ entry.name }}</span>
        <span class="library-row-sub">{{ librarySubline(entry) }}</span>
      </span>
    </button>
    <span v-if="owned" class="library-row-added">Added</span>
    <button
      v-else
      type="button"
      class="library-row-add"
      :aria-label="`Add ${entry.name}`"
      :disabled="busy"
      @click="emit('add')"
    >
      + Add
    </button>
  </div>
</template>

<style scoped>
.library-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 0 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.library-row-open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0 10px 12px;
  background: transparent;
  border: none;
  text-align: left;
}

.library-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.library-row-name {
  font-size: 0.95rem;
  font-weight: 700;
}

.library-row-sub {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-dim);
}

.library-row-add {
  flex-shrink: 0;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
  color: var(--accent);
  font-size: 0.78rem;
  font-weight: 800;
  white-space: nowrap;
}

.library-row-added {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--success);
}
</style>
