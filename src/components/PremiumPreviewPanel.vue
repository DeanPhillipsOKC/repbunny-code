<script setup lang="ts">
import { openPremiumSheet, type PremiumFeature } from '../lib/premium'

// Issue #132: the card that sits over a blurred Premium preview (a lift
// chart's locked metric or range, the best-reps table). Same choices as the
// themes preview bar (#107): keep it with Premium, or go back. Nothing else.
defineProps<{ feature: PremiumFeature; title: string; body: string }>()
const emit = defineEmits<{ back: [] }>()
</script>

<template>
  <div class="preview-panel" role="group" :aria-label="`${title} preview`">
    <span class="eyebrow">Premium</span>
    <p class="title">{{ title }}</p>
    <p class="body">{{ body }}</p>
    <div class="actions">
      <button type="button" class="keep" @click="openPremiumSheet(feature)">Keep it with Premium</button>
      <button type="button" class="go-back" @click="emit('back')">Go back</button>
    </div>
  </div>
</template>

<style scoped>
.preview-panel {
  width: min(100%, 300px);
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: 0 8px 28px color-mix(in srgb, var(--shade, #000) 35%, transparent);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.eyebrow {
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 16%, transparent);
  color: var(--secondary);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.title {
  margin: 4px 0 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}

.body {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.actions {
  align-self: stretch;
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.keep {
  flex: 1;
  min-height: 42px;
  padding: 0 10px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-size: 0.86rem;
  font-weight: 800;
}

.keep:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.go-back {
  min-height: 42px;
  padding: 0 14px;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
  font-size: 0.86rem;
  font-weight: 700;
}
</style>
