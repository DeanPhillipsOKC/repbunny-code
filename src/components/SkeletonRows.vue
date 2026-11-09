<script setup lang="ts">
// Item 73: shared loading placeholder for list screens (ExerciseList,
// TemplateManager, WorkoutHistory, ExerciseHistoryDetail), replacing a bare
// `<p>Loading…</p>` with cards shaped like the real `row-wrap` rows so the
// list doesn't jump in height once data arrives.

withDefaults(
  defineProps<{
    rows?: number
  }>(),
  { rows: 3 }
)
</script>

<template>
  <span class="sr-only" role="status" aria-live="polite">Loading…</span>
  <ul class="skeleton-list" aria-hidden="true">
    <li v-for="n in rows" :key="n" class="skeleton-row">
      <div class="skeleton-bar skeleton-bar-title"></div>
      <div class="skeleton-bar skeleton-bar-sub"></div>
    </li>
  </ul>
</template>

<style scoped>
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.skeleton-row {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
}

.skeleton-bar {
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}

.skeleton-bar-title {
  width: 55%;
}

.skeleton-bar-sub {
  width: 35%;
  height: 10px;
  margin-top: 8px;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
