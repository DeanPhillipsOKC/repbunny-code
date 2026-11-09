<script setup lang="ts">
// Issue #158: a workout's story (a swap, a skipped exercise, an early finish)
// in a lavender strip, one sentence a line. Shared by the chart, template
// progress's session card, and the Workout log. `date` leads the first line.
defineProps<{ lines: string[]; date?: string }>()
</script>

<template>
  <div class="workout-story" data-testid="workout-story">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 5h16v11h-9l-5 4v-4H4z" />
    </svg>
    <p>
      <template v-for="(line, i) in lines" :key="i"><br v-if="i > 0" />{{ i === 0 && date ? `${date}: ` : '' }}{{ line }}</template>
    </p>
  </div>
</template>

<style scoped>
.workout-story {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--secondary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--secondary) 35%, var(--border));
  color: var(--secondary);
  font-size: 0.8rem;
  line-height: 1.4;
}

.workout-story svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.workout-story p {
  margin: 0;
  color: var(--text);
  overflow-wrap: anywhere;
}
</style>
