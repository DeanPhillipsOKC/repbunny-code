<script setup lang="ts">
// Item 52's minimized rest bar ("Back to workout"). Issue #80: shared by
// WorkoutLogger's dock on Home and App.vue on every other tab.
import { useRestStore } from '../stores/rest'

defineEmits<{ resume: []; skip: [] }>()

const rest = useRestStore()
</script>

<template>
  <div v-if="rest.activeRest" class="rest-mini-bar" role="status" aria-live="polite">
    <span class="rest-mini-label">Resting {{ rest.label }} - {{ rest.activeRest.exerciseName }}</span>
    <div class="rest-mini-actions">
      <button type="button" class="rest-mini-resume" @click="$emit('resume')">Resume</button>
      <button type="button" class="rest-mini-skip" @click="$emit('skip')">Skip</button>
    </div>
  </div>
</template>

<style scoped>
.rest-mini-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--surface-2);
  border-top: 1px solid var(--border);
}

.rest-mini-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rest-mini-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.rest-mini-resume {
  background: var(--accent);
  color: var(--bg);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
}

.rest-mini-skip {
  background: var(--surface);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 0.8rem;
}
</style>
