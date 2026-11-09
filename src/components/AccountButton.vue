<script setup lang="ts">
import { accountSheetOpen } from '../lib/accountSheet'
</script>

<template>
  <button type="button" class="account-button" aria-label="Account" @click="accountSheetOpen = true">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  </button>
</template>

<style scoped>
.account-button {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
