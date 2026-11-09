<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { repos } from '../data'
import {
  SUPPORT_EMAIL,
  buildBugReport,
  firstLine,
  formatErrorTime,
  isRecent,
  screenName,
  sendBugReport,
  type LoggedError,
} from '../lib/bugReport'
import { bugReportPrefill } from '../lib/accountSheet'
import { clearClientErrorQueue, queuedClientErrors } from '../lib/errorLog'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #84: pick logged errors (issue #83's client_errors log, plus any
// still queued to go out) and send them with an optional description. The
// last 24 hours start checked. Rendered by AccountSheet.vue in its overlay.
// Issue #234: opened from ReportPrompt.vue, `focus` is the error it offered:
// listed first, the only one checked, and carrying its action trail. "Preview report" shows the exact text,
// device lines and steps included, before anything is sent.
const props = defineProps<{ focus?: LoggedError | null }>()
const emit = defineEmits<{ back: []; dismiss: []; sent: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('back'))

// Issue #574: a receipt's "This looks wrong" writes the text; taken once.
const description = ref(bugReportPrefill.value ?? '')
const prefilled = bugReportPrefill.value !== null
bugReportPrefill.value = null
// Off by default: we reply to every report, and only email again about the
// fix when this is checked. It's a line in the report, never stored.
const followUp = ref(false)
const errors = ref<LoggedError[]>([])
const picked = ref<Record<string, boolean>>({})
const loading = ref(true)
const loadError = ref('')
const busy = ref<'' | 'send' | 'clear'>('')
const actionError = ref('')

const selected = computed(() => errors.value.filter((e) => picked.value[e.id]))
const allPicked = computed(() => errors.value.length > 0 && selected.value.length === errors.value.length)
const canSend = computed(() => !busy.value && (selected.value.length > 0 || description.value.trim() !== ''))
const previewOpen = ref(false)
const preview = computed(() =>
  buildBugReport({ description: description.value, errors: selected.value, appVersion: __APP_VERSION__, followUp: followUp.value }),
)

// Compared by instant, so "+00:00" and "Z" spellings of one time match.
function sameError(a: LoggedError, b: LoggedError) {
  return Date.parse(a.occurred_at) === Date.parse(b.occurred_at) && a.kind === b.kind && a.message === b.message
}

async function load() {
  loading.value = true
  loadError.value = ''
  const { data, error } = await repos.clientErrors.list()
  if (error) loadError.value = `Couldn't load the stored errors. ${error.message}`
  const queued = queuedClientErrors().map((entry, index) => ({ ...entry, id: `queued-${index}` }))
  const focus = props.focus ?? null
  const rest = [...data, ...queued].filter((e) => !focus || !sameError(e, focus))
  rest.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  errors.value = focus ? [focus, ...rest] : rest
  const now = new Date()
  picked.value = Object.fromEntries(errors.value.map((e) => [e.id, focus ? e.id === focus.id : isRecent(e, now)]))
  loading.value = false
}

onMounted(load)

function toggleAll() {
  const on = !allPicked.value
  picked.value = Object.fromEntries(errors.value.map((e) => [e.id, on]))
}

async function send() {
  if (!canSend.value) return
  busy.value = 'send'
  actionError.value = ''
  try {
    await sendBugReport({
      description: description.value,
      errors: selected.value,
      appVersion: __APP_VERSION__,
      now: new Date(),
      followUp: followUp.value,
    })
    emit('sent')
  } catch (e) {
    actionError.value = `Couldn't open your email app. Email ${SUPPORT_EMAIL} instead. ${e instanceof Error ? e.message : String(e)}`
  } finally {
    busy.value = ''
  }
}

async function clearLog() {
  if (busy.value) return
  busy.value = 'clear'
  actionError.value = ''
  const { error } = await repos.clientErrors.clear()
  clearClientErrorQueue()
  busy.value = ''
  if (error) {
    actionError.value = `Couldn't clear the log. ${error.message}`
    return
  }
  errors.value = []
  picked.value = {}
}
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="bug-report-title">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-header">
      <button type="button" class="sheet-back" aria-label="Back to Account" @click="emit('back')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 6l-6 6 6 6"></path>
        </svg>
      </button>
      <h3 id="bug-report-title" class="sheet-title">Report a bug</h3>
      <button type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="field">
      <label for="bug-description">What happened? <span class="optional">(optional)</span></label>
      <textarea id="bug-description" v-model="description" rows="3" placeholder="What you tapped, what you expected, what you saw"></textarea>
      <p v-if="prefilled" class="note">You can edit or delete anything here. Nothing is sent until you tap Send in your email app.</p>
    </div>

    <div class="list-head">
      <span id="bug-errors-label" class="list-label">Logged errors</span>
      <span v-if="errors.length" class="list-actions">
        <button type="button" class="list-button" :disabled="!!busy" @click="clearLog">
          {{ busy === 'clear' ? 'Clearing…' : 'Clear log' }}
        </button>
        <button type="button" class="list-button" :aria-pressed="allPicked" @click="toggleAll">
          {{ allPicked ? 'Select none' : 'Select all' }}
        </button>
      </span>
    </div>

    <p v-if="loading" class="empty">Loading…</p>
    <p v-else-if="errors.length === 0" class="empty">No errors recorded.</p>
    <div v-else class="errors" role="group" aria-labelledby="bug-errors-label">
      <label v-for="error in errors" :key="error.id" class="error-row" :class="{ on: picked[error.id] }">
        <input v-model="picked[error.id]" type="checkbox" class="error-input" />
        <span class="error-check" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 13l4 4L19 7"></path>
          </svg>
        </span>
        <span class="error-text">
          <span class="error-meta">{{ formatErrorTime(error.occurred_at) }} · {{ screenName(error.route) }}</span>
          <span class="error-message">{{ firstLine(error.message) }}</span>
        </span>
      </label>
    </div>
    <p v-if="loadError" class="error" role="alert">{{ loadError }}</p>

    <label class="follow-row" :class="{ on: followUp }">
      <input v-model="followUp" type="checkbox" class="error-input" aria-describedby="follow-caption" />
      <span class="error-check" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 13l4 4L19 7"></path>
        </svg>
      </span>
      <span class="error-text">
        <span class="follow-title">Email me when it's fixed</span>
        <span id="follow-caption" class="error-meta">We reply to every report either way.</span>
      </span>
    </label>

    <details class="preview" @toggle="previewOpen = ($event.target as HTMLDetailsElement).open">
      <summary>Preview report</summary>
      <!-- Only built while open, so the closed sheet doesn't repeat its own text. -->
      <pre v-if="previewOpen" class="preview-text" aria-label="Report preview">{{ preview }}</pre>
    </details>

    <p class="note">Opens your email app addressed to {{ SUPPORT_EMAIL }}. Only what you check goes in, and nothing is sent until you tap Send there.</p>
    <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

    <!-- Sticky, so it stays in view above the keyboard while typing. -->
    <div class="send-dock">
      <button type="button" class="send-button" :disabled="!canSend" @click="send">
        {{ busy === 'send' ? 'Opening email…' : 'Email report' }}
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

.optional {
  color: var(--text-dim);
  opacity: 0.75;
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
}

.list-label {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.list-actions {
  display: flex;
  gap: 6px;
}

.list-button {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--secondary);
  font-size: 0.82rem;
  font-weight: 700;
}

.list-button:first-child {
  color: var(--text-dim);
}

.empty {
  margin: 0;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-dim);
  font-size: 0.9rem;
}

.errors {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.error-row {
  position: relative;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  cursor: pointer;
  color: var(--text);
  font-size: inherit;
}

.error-row:first-child {
  border-top: none;
}

.error-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  min-height: 0;
  margin: 0;
  padding: 0;
}

.follow-row {
  position: relative;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  color: var(--text);
  font-size: inherit;
}

.follow-title {
  font-size: 0.88rem;
  font-weight: 700;
}

.follow-row:has(.error-input:focus-visible),
.error-row:has(.error-input:focus-visible) {
  outline: 2px solid var(--secondary);
  outline-offset: -2px;
}

.error-check {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 7px;
  border: 1.5px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
}

.follow-row.on .error-check,
.error-row.on .error-check {
  background: var(--secondary);
  border-color: var(--secondary);
  color: var(--accent-text);
}

.error-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.error-meta {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-dim);
}

.error-message {
  margin-top: 2px;
  font-size: 0.88rem;
  font-weight: 600;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.preview {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.preview summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  cursor: pointer;
  color: var(--secondary);
  font-size: 0.88rem;
  font-weight: 700;
}

.preview-text {
  margin: 0;
  padding: 0 14px 14px;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.74rem;
  line-height: 1.45;
  color: var(--text-dim);
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
