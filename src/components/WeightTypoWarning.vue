<script setup lang="ts">
// Backlog item 81: one shared typo-check warning so the Body screen's
// "Log today's weight" form, BodyStatsModal.vue (missing-weight prompt +
// weigh-in reminder), and the weigh-in list's edit form (WeighInHistory.vue)
// all render and behave identically instead of three near-copies drifting
// apart. Deciding *whether* to show it (isBigWeightChange) stays with each
// caller, since each compares against a different "previous" entry.
// Issue #336: the set editors reuse it with their own `message` and button
// label; body weight keeps the default wording.
import type { WeightUnit } from '../lib/types'

defineProps<{
  previousWeight?: number
  previousUnit?: WeightUnit
  message?: string
  saveLabel?: string
}>()

const emit = defineEmits<{
  (e: 'fix-it'): void
  (e: 'save-anyway'): void
}>()
</script>

<template>
  <div role="alert" class="typo-warning">
    <div class="typo-warning-message">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l9.5 17h-19Z" stroke="var(--highlight)" stroke-width="1.8" stroke-linejoin="round" />
        <path d="M12 10v4M12 17h.01" stroke="var(--highlight)" stroke-width="2" stroke-linecap="round" />
      </svg>
      <span>{{ message ?? `That's a big change from ${previousWeight} ${previousUnit}. Save anyway?` }}</span>
    </div>
    <div class="typo-warning-actions">
      <button type="button" class="fix-it" @click="emit('fix-it')">Fix it</button>
      <button type="button" class="save-anyway" @click="emit('save-anyway')">{{ saveLabel ?? 'Save anyway' }}</button>
    </div>
  </div>
</template>

<style scoped>
.typo-warning {
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--highlight) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--highlight) 35%, transparent);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.typo-warning-message {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 0.85rem;
  font-weight: 600;
}

.typo-warning-message svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.typo-warning-actions {
  display: flex;
  gap: 8px;
}

.typo-warning-actions button {
  flex-grow: 1;
  min-height: 44px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 700;
}

.fix-it {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.save-anyway {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--highlight) 45%, transparent);
  color: var(--highlight);
}
</style>
