<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useExercisesStore } from '../stores/exercises'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #81: add or change an exercise's setup notes (seat height, pin
// position, grip...) from the workout card, without leaving the workout for
// the Exercises tab. Same setup_notes field the Exercises edit flyout uses.
const props = defineProps<{
  exerciseId: string
  exerciseName: string
  notes: string | null
}>()

const emit = defineEmits<{
  dismiss: []
}>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('dismiss'))

const exercises = useExercisesStore()

const draft = ref(props.notes ?? '')
const saving = ref(false)
const errorMessage = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)

onMounted(() => {
  textarea.value?.focus()
})

async function save() {
  if (saving.value) return
  saving.value = true
  errorMessage.value = ''
  const { error } = await exercises.updateSetupNotes(props.exerciseId, draft.value)
  saving.value = false
  if (error) {
    errorMessage.value = `Couldn't save that. ${error.message}`
    return
  }
  emit('dismiss')
}
</script>

<template>
  <div class="sheet-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" :aria-label="`Setup notes for ${exerciseName}`">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h3 class="sheet-title">Setup notes</h3>
      <p class="intro">{{ exerciseName }}</p>

      <form @submit.prevent="save">
        <label for="workout-setup-notes" class="sr-only">Setup notes</label>
        <textarea
          id="workout-setup-notes"
          ref="textarea"
          v-model="draft"
          rows="3"
          placeholder="Seat height, pin position, grip..."
        ></textarea>
        <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
        <div class="actions">
          <button type="button" class="cancel" :disabled="saving" @click="emit('dismiss')">Cancel</button>
          <button type="submit" class="save" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

.intro {
  margin: -10px 0 0;
  font-size: 0.88rem;
  color: var(--text-dim);
  overflow-wrap: anywhere;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
}

.actions .save {
  margin-top: 0;
}

.error {
  margin: 8px 0 0;
  color: var(--danger);
  font-size: 0.8rem;
}
</style>
