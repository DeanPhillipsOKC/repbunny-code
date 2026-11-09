<script setup lang="ts">
import { autoCopy, takeUnreachableNote } from '../lib/backupFolder'

// Issue #432: on the finish recap, one note when the last save couldn't reach
// the folder. Decided when the recap opens, so it doesn't flicker away
// mid-read. Issue #874 removed the after-workout offer: the copy is on by
// default, and setup says where it goes.
const note = takeUnreachableNote()
</script>

<template>
  <section v-if="note" class="copy-card copy-note" data-testid="auto-copy-note" role="status">
    <h4 class="copy-title">Your copy didn't save</h4>
    <p class="copy-text">
      RepBunny couldn't reach {{ autoCopy.status === 'off' ? 'your folder' : autoCopy.name }}. Check it in Account › Your data.
    </p>
  </section>
</template>

<style scoped>
.copy-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--secondary) 40%, transparent);
  border-radius: 20px;
  background: var(--surface);
}

.copy-note {
  border-color: color-mix(in srgb, var(--danger) 45%, transparent);
}

.copy-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
}

.copy-text {
  margin: 0;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}
</style>
