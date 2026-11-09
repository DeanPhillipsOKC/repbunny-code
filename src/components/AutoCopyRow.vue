<script setup lang="ts">
import { onMounted } from 'vue'
import './account-rows.css'
import { autoCopy, backupFolderAvailable, ensureAutoCopy } from '../lib/backupFolder'

// Issue #432: Your data's row for the automatic copy, with its state as the
// caption. Opens AutoCopySheet.vue. Issue #874: and Your copies (YourCopies.vue),
// the in-app list to restore one from, blocked like the other restores during
// a workout.
defineProps<{ disabled?: boolean; blocked?: boolean }>()
defineEmits<{ open: [view: 'auto-copy' | 'copies'] }>()

onMounted(() => void ensureAutoCopy())
</script>

<template>
  <template v-if="backupFolderAvailable">
    <button type="button" class="data-item" style="--c: var(--success)" :disabled="disabled" @click="$emit('open', 'auto-copy')">
      <span class="data-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <path d="M9 13l2 2 4-4"></path>
        </svg>
      </span>
      <span class="data-text">
        <span class="data-title">Automatic copy</span>
        <span class="data-caption" data-testid="auto-copy-row-caption">{{
          autoCopy.status === 'off'
            ? 'Off'
            : autoCopy.status === 'unreachable'
              ? `Can't reach ${autoCopy.name}`
              : `Saving to ${autoCopy.name} after every workout`
        }}</span>
      </span>
      <span class="data-chevron" aria-hidden="true">›</span>
    </button>
    <button type="button" class="data-item" style="--c: var(--secondary)" :disabled="disabled || blocked" @click="$emit('open', 'copies')">
      <span class="data-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="7" width="13" height="13" rx="2"></rect>
          <path d="M8 4h10a2 2 0 0 1 2 2v10"></path>
        </svg>
      </span>
      <span class="data-text">
        <span class="data-title">Your copies</span>
        <span class="data-caption">Bring back your data from one of the automatic copies</span>
      </span>
      <span class="data-chevron" aria-hidden="true">›</span>
    </button>
  </template>
</template>
