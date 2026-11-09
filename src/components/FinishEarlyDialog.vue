<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

defineProps<{
  workoutName: string
  exercises: { id: string; name: string; progress: string }[]
}>()
const emit = defineEmits<{ cancel: []; finish: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)
let trigger: HTMLElement | null = null
onMounted(() => {
  trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  dialog.value?.showModal()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  trigger?.focus()
})

function trapTab(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const buttons = dialog.value?.querySelectorAll<HTMLButtonElement>('button')
  const first = buttons?.[0]
  const last = buttons?.[buttons.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
</script>

<template>
  <dialog ref="dialog" class="finish-dialog" aria-modal="true" aria-labelledby="finish-early-title" aria-describedby="finish-early-description" @cancel.prevent="emit('cancel')" @keydown="trapTab">
    <h3 id="finish-early-title">Finish now?</h3>
    <p id="finish-early-description">
      {{ exercises.length }} {{ exercises.length === 1 ? 'exercise' : 'exercises' }} in {{ workoutName }} still {{ exercises.length === 1 ? 'has' : 'have' }} sets left. Anything you haven't logged won't be saved.
    </p>
    <ul>
      <li v-for="exercise in exercises" :key="exercise.id">
        <span class="exercise-name">{{ exercise.name }}</span>
        <span class="progress">{{ exercise.progress }}</span>
      </li>
    </ul>
    <button type="button" class="btn-accent keep-going" autofocus @click="emit('cancel')">Keep going</button>
    <button type="button" class="finish-anyway" @click="emit('finish')">Finish anyway</button>
  </dialog>
</template>

<style scoped>
.finish-dialog {
  width: calc(100% - 44px);
  max-width: 436px;
  max-height: calc(100dvh - 44px);
  margin: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 22px;
  padding: 20px 18px 16px;
}
.finish-dialog::backdrop { background: rgba(10, 6, 14, 0.66); }
h3 {
  color: var(--text);
  font-weight: 700;
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-size: 1.35rem;
  text-transform: none;
  letter-spacing: normal;
}
p { margin: 0 0 12px; font-size: 0.9rem; color: var(--text-dim); line-height: 1.45; overflow-wrap: anywhere; }
ul { margin: 0 0 16px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
li { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 0.9rem; padding: 8px 12px; background: var(--surface-2); border-radius: 10px; }
.exercise-name { min-width: 0; overflow-wrap: anywhere; }
.progress { color: var(--text-dim); flex-shrink: 0; }
.keep-going { width: 100%; min-height: 50px; margin: 0; border-radius: 14px; font-size: 1.05rem; font-weight: 800; }
.finish-anyway { width: 100%; margin-top: 6px; min-height: 42px; background: none; border: none; color: var(--text-dim); font-size: 0.92rem; font-weight: 600; }
</style>
