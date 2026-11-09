<script setup lang="ts">
import { computed, ref } from 'vue'
import { SUPPORT_EMAIL, sendFeatureRequest } from '../lib/bugReport'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #100: "Request a feature", next to Report a bug (BugReportSheet.vue)
// in Account > About. One text box and the same email path, with no error
// list. Rendered by AccountSheet.vue in its overlay.
const emit = defineEmits<{ back: []; dismiss: []; sent: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('back'))

const request = ref('')
const busy = ref(false)
const actionError = ref('')

const canSend = computed(() => !busy.value && request.value.trim() !== '')

async function send() {
  if (!canSend.value) return
  busy.value = true
  actionError.value = ''
  try {
    await sendFeatureRequest({ request: request.value, appVersion: __APP_VERSION__, now: new Date() })
    emit('sent')
  } catch (e) {
    actionError.value = `Couldn't open your email app. Email ${SUPPORT_EMAIL} instead. ${e instanceof Error ? e.message : String(e)}`
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="feature-request-title">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <button type="button" class="sheet-back" aria-label="Back to Account" @click="emit('back')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6"></path>
        </svg>
      </button>
      <h3 id="feature-request-title" class="sheet-title">Request a feature</h3>
      <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="field">
      <label for="feature-request">What would you like RepBunny to do?</label>
      <textarea
        id="feature-request"
        v-model="request"
        rows="4"
        required
        placeholder="Describe the idea and what it would help you with"
      ></textarea>
    </div>

    <p class="note">Opens your email app addressed to {{ SUPPORT_EMAIL }}. Nothing is sent until you tap Send there.</p>
    <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

    <!-- Sticky, so it stays in view above the keyboard while typing. -->
    <div class="send-dock">
      <button type="button" class="send-button" :disabled="!canSend" @click="send">
        {{ busy ? 'Opening email…' : 'Email request' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  width: 100%;
  max-width: 480px;
  max-height: min(88vh, var(--sheet-max-h, 88vh));
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sheet > * {
  flex-shrink: 0;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sheet-title {
  flex: 1;
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
  line-height: 1.15;
}

.sheet-back,
.sheet-close {
  width: 44px;
  height: 44px;
  min-height: auto;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.field label {
  margin: 0 0 6px;
}

.note {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.85rem;
}

.send-dock {
  position: sticky;
  bottom: calc(-16px - env(safe-area-inset-bottom, 0px));
  margin: 0 -16px calc(-16px - env(safe-area-inset-bottom, 0px));
  padding: 8px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  background: var(--bg);
}

.send-button {
  width: 100%;
  min-height: 50px;
  border-radius: 14px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
