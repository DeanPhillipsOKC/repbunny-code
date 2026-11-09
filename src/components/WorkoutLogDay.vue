<script setup lang="ts">
// Issue #820: one local day in the Workout log, its header above that day's
// workouts (WorkoutHistory.vue renders the rows into the slot).
defineProps<{ label: string; count: number }>()
</script>

<template>
  <section class="day-group" data-testid="workout-day">
    <h2 class="day-header">
      {{ label }}<span v-if="count > 1" class="day-count"> · {{ count }} workouts</span>
    </h2>
    <slot />
  </section>
</template>

<style scoped>
.day-group + .day-group {
  margin-top: 28px;
}

.day-header {
  margin: 0 0 10px;
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--text);
  text-transform: none;
  letter-spacing: 0;
}

.day-count {
  color: var(--text-dim);
  font-weight: 600;
}
</style>
