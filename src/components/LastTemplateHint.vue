<script setup lang="ts">
import { dismissLastTemplateHint, openPremiumSheet } from '../lib/premium'

// Issue #114: the one-time line after the last free routine is saved
// (lib/premium.ts claimLastTemplateHint). Quiet, one tap to dismiss.
</script>

<template>
  <div class="last-template-hint" role="note">
    <p class="hint-text">
      That's your last free routine. Premium gives you as many as you want.
      <button type="button" class="hint-link" @click="openPremiumSheet('templates')">Learn more</button>
    </p>
    <button type="button" class="hint-close" aria-label="Dismiss" @click="dismissLastTemplateHint">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.last-template-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 6px 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--secondary) 9%, transparent);
  border: 1px solid color-mix(in srgb, var(--secondary) 28%, var(--border));
}

.hint-text {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text);
}

.hint-link {
  display: inline;
  min-height: 0;
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  color: var(--secondary);
  font-size: inherit;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.hint-close {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  min-height: 0;
  padding: 0;
  margin: -8px 0;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
