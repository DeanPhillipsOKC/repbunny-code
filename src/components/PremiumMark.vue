<script setup lang="ts">
// Issue #132: a small sparkle after a locked chart tab or range. Passive (the
// #114 nudge rules): tapping the tab shows a preview, never a dead end, and
// the button's accessible name stays the plain label.
</script>

<template>
  <svg class="premium-mark" viewBox="0 0 24 24" width="9" height="9" aria-hidden="true">
    <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="currentColor" />
  </svg>
</template>

<style scoped>
.premium-mark {
  margin-left: 3px;
  vertical-align: 4px;
  color: var(--secondary);
}
</style>
