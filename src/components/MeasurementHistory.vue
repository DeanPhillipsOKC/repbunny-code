<script setup lang="ts">
// Issue #139: every measurement entry, newest first, with edit and delete.
// Same bottom-sheet shell as WeighInHistory.vue.
import { onMounted, onUnmounted, ref } from 'vue'
import { useMeasurementsStore } from '../stores/measurements'
import { dateInputToIso, entrySummary } from '../lib/measurements'
import MeasurementForm from './MeasurementForm.vue'
import type { BodyMeasurement, HeightUnit, MeasurementValues } from '../lib/types'

const emit = defineEmits<{ dismiss: [] }>()

const measurements = useMeasurementsStore()
const errorMessage = ref('')
const editingId = ref<string | null>(null)
const confirmingDeleteId = ref<string | null>(null)
const busy = ref(false)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('dismiss')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function valuesOf(entry: BodyMeasurement): MeasurementValues {
  return { waist: entry.waist, chest: entry.chest, hips: entry.hips, arms: entry.arms, thighs: entry.thighs, neck: entry.neck }
}

function startEditing(id: string) {
  errorMessage.value = ''
  confirmingDeleteId.value = null
  editingId.value = id
}

async function saveEdit(entry: BodyMeasurement, values: MeasurementValues, unit: HeightUnit, date: string) {
  busy.value = true
  errorMessage.value = ''
  const { error } = await measurements.updateEntry(entry.id, values, unit, dateInputToIso(date, entry.recorded_at))
  busy.value = false
  if (error) errorMessage.value = error.message
  else editingId.value = null
}

function startDeleting(id: string) {
  errorMessage.value = ''
  editingId.value = null
  confirmingDeleteId.value = id
}

async function confirmDelete(id: string) {
  errorMessage.value = ''
  const { error } = await measurements.deleteEntry(id)
  if (error) errorMessage.value = error.message
  confirmingDeleteId.value = null
}
</script>

<template>
  <div class="history-overlay" role="dialog" aria-modal="true" aria-labelledby="measurement-history-title" @click.self="emit('dismiss')">
    <div class="history-panel">
      <div class="history-header">
        <div class="history-heading">
          <h2 id="measurement-history-title">Measurements</h2>
          <span class="row-sub">{{ measurements.entries.length }} {{ measurements.entries.length === 1 ? 'entry' : 'entries' }}</span>
        </div>
        <button type="button" class="icon-button" aria-label="Close measurements" @click="emit('dismiss')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-if="measurements.entries.length === 0" class="empty">No measurements logged yet.</p>

      <ul v-else class="history-list">
        <li v-for="entry in measurements.entries" :key="entry.id" class="history-row">
          <MeasurementForm
            v-if="editingId === entry.id"
            class="edit-form"
            :id-prefix="`edit-measure-${entry.id}`"
            title="Editing measurements"
            :unit="entry.unit"
            :values="valuesOf(entry)"
            :recorded-at="entry.recorded_at"
            :busy="busy"
            @save="(values, unit, date) => saveEdit(entry, values, unit, date)"
            @cancel="editingId = null"
          />

          <div v-else-if="confirmingDeleteId === entry.id" class="confirm-delete">
            <span class="row-sub">Delete the {{ formatShortDate(entry.recorded_at) }} measurements?</span>
            <div class="confirm-actions">
              <button type="button" class="danger small" @click="confirmDelete(entry.id)">Confirm delete</button>
              <button type="button" class="ghost small" @click="confirmingDeleteId = null">Cancel</button>
            </div>
          </div>

          <div v-else class="row">
            <div class="row-main">
              <span class="row-date">{{ formatShortDate(entry.recorded_at) }}</span>
              <span class="row-values">{{ entrySummary(entry) }}</span>
            </div>
            <button type="button" class="icon-button" :aria-label="`Edit measurements from ${formatShortDate(entry.recorded_at)}`" @click="startEditing(entry.id)">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
            <button
              type="button"
              class="icon-button icon-button-danger"
              :aria-label="`Delete measurements from ${formatShortDate(entry.recorded_at)}`"
              @click="startDeleting(entry.id)"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.history-overlay {
  position: fixed;
  inset: 0;
  z-index: 65;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.history-panel {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 20px 16px calc(24px + env(safe-area-inset-bottom, 0px));
}

.history-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.history-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-heading h2 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-dim);
}

.row-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.icon-button {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  min-height: auto;
  padding: 0;
  border-radius: var(--radius);
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-button-danger:hover,
.icon-button-danger:focus-visible {
  color: var(--danger);
}

.error {
  color: var(--danger);
}

.empty {
  text-align: center;
  padding: 24px 0;
  color: var(--text-dim);
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-row {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.row {
  padding: 10px 8px 10px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-main {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.row-date {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-dim);
}

.row-values {
  font-size: 0.9rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.edit-form {
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 12px 14px;
}

.confirm-delete {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-actions {
  display: flex;
  gap: 8px;
}

.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.ghost.small,
.danger.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 0.85rem;
}

.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--accent-text);
}
</style>
