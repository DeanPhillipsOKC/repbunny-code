<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #874 (design docs/design/issue-874-automatic-copy.html, C): the honest
// warning before the automatic copy turns off, from setup's copy step and
// Account > Your data > Automatic copy. Keep a copy is the default.
const emit = defineEmits<{ keep: []; off: [] }>()

useEscapeClose(() => emit('keep'))

const keepButton = ref<HTMLButtonElement | null>(null)
onMounted(() => keepButton.value?.focus())
</script>

<template>
  <div class="scrim" @click.self="emit('keep')">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="copy-off-title" aria-describedby="copy-off-text">
      <h3 id="copy-off-title" class="title">Turn off the copy?</h3>
      <p id="copy-off-text" class="text">
        Everything is stored only on this phone. If it's lost, reset, or the app is deleted, your workouts are gone for good, and we
        can't get them back.
      </p>
      <button ref="keepButton" type="button" class="btn-accent action" @click="emit('keep')">Keep a copy</button>
      <button type="button" class="action action-off" @click="emit('off')">Turn it off</button>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, var(--shade) 55%, transparent);
}

.dialog {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface-2);
}

.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.15;
  text-transform: none;
  letter-spacing: normal;
  color: var(--text);
}

.text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.action {
  width: 100%;
  min-height: 48px;
}

.action-off {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--danger);
}
</style>
