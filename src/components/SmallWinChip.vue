<script setup lang="ts">
import type { SmallWin } from '../lib/smallWins'

// Issue #475: a small win's pill, on a logged set row and the rest screen
// (mockup: docs/design/issue-475-small-wins.html, option A). Gold star for
// a best, green bullseye for a target hit.
defineProps<{ win: SmallWin }>()
</script>

<template>
  <span class="small-win-chip" :class="`small-win-${win.kind}`" data-testid="small-win-chip">
    <svg v-if="win.kind === 'target'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
    {{ win.label }}
  </span>
</template>

<style scoped>
.small-win-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px 3px 7px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--highlight) 50%, var(--border));
  background: color-mix(in srgb, var(--highlight) 14%, transparent);
  color: var(--highlight);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1.3;
  white-space: nowrap;
}

.small-win-chip svg {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
}

.small-win-target {
  border-color: color-mix(in srgb, var(--success) 50%, var(--border));
  background: color-mix(in srgb, var(--success) 14%, transparent);
  color: var(--success);
}
</style>
