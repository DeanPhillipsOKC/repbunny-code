<script setup lang="ts">
// Backlog item 81: bottom-sheet overlay over the Body tab listing every
// body_weight_entries row, newest first, with inline edit/delete — same
// shell pattern as ExerciseHistoryDetail.vue (dimmed backdrop, rounded-top
// panel, close button) so opening it doesn't feel like a new screen.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { convertWeight, isBigWeightChange } from '../lib/bodyStats'
import SkeletonRows from './SkeletonRows.vue'
import WeightTypoWarning from './WeightTypoWarning.vue'
import type { BodyWeightEntry, WeightUnit } from '../lib/types'

const emit = defineEmits<{
  (e: 'dismiss'): void
}>()

const bodyWeight = useBodyWeightStore()

const errorMessage = ref('')

onMounted(() => {
  if (!bodyWeight.fetched) bodyWeight.fetchEntries()
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('dismiss')
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// entries is already newest-first (stores/bodyWeight.ts's fetchEntries/
// updateEntry both sort descending by recorded_at), so each row's "previous"
// weigh-in -- for both the shown delta and the typo-check baseline below --
// is simply the next entry in the array.
const rows = computed(() =>
  bodyWeight.entries.map((entry, index) => {
    const older = bodyWeight.entries[index + 1] ?? null
    const delta = older ? entry.weight - convertWeight(older.weight, older.weight_unit, entry.weight_unit) : null
    return { entry, older, delta }
  }),
)

const oldestDateLabel = computed(() => {
  const oldest = bodyWeight.entries[bodyWeight.entries.length - 1]
  return oldest ? formatShortDate(oldest.recorded_at) : ''
})

// Editing (one row at a time).
const editingId = ref<string | null>(null)
const editWeight = ref<number | null>(null)
const editUnit = ref<WeightUnit>('lb')
const editDate = ref('')
const editTypoConfirmed = ref(false)
const editWeightInput = ref<HTMLInputElement | null>(null)

function toDateInputValue(iso: string): string {
  const d = new Date(iso)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startEditing(entry: BodyWeightEntry) {
  errorMessage.value = ''
  confirmingDeleteId.value = null
  editingId.value = entry.id
  editWeight.value = entry.weight
  editUnit.value = entry.weight_unit
  editDate.value = toDateInputValue(entry.recorded_at)
  editTypoConfirmed.value = false
}

const editingPrevious = computed(() => rows.value.find((r) => r.entry.id === editingId.value)?.older ?? null)

const showEditTypoWarning = computed(() => {
  if (editTypoConfirmed.value || editWeight.value === null || !editingPrevious.value) return false
  return isBigWeightChange(editWeight.value, editUnit.value, editingPrevious.value.weight, editingPrevious.value.weight_unit)
})

async function saveEdit(id: string) {
  errorMessage.value = ''
  if (editWeight.value === null || editWeight.value <= 0) {
    errorMessage.value = 'Enter a body weight.'
    return
  }
  if (!editDate.value) {
    errorMessage.value = 'Enter a date.'
    return
  }
  if (showEditTypoWarning.value) return

  const entry = bodyWeight.entries.find((e) => e.id === id)
  if (!entry) return
  // Only the date field is editable here -- keep the original time-of-day so
  // fixing a date doesn't reorder same-day entries or shift by a timezone's
  // worth of hours.
  const recordedAt = new Date(entry.recorded_at)
  const [year, month, day] = editDate.value.split('-').map(Number)
  recordedAt.setFullYear(year, month - 1, day)

  const { error } = await bodyWeight.updateEntry(id, editWeight.value, editUnit.value, recordedAt.toISOString())
  if (error) {
    errorMessage.value = error.message
  } else {
    editingId.value = null
    editTypoConfirmed.value = false
  }
}

function confirmEditTypo(id: string) {
  editTypoConfirmed.value = true
  saveEdit(id)
}

function fixEditTypo() {
  editTypoConfirmed.value = false
  editWeightInput.value?.focus()
}

// Deleting.
const confirmingDeleteId = ref<string | null>(null)

function startDeleting(id: string) {
  errorMessage.value = ''
  editingId.value = null
  confirmingDeleteId.value = id
}

async function confirmDelete(id: string) {
  errorMessage.value = ''
  const { error } = await bodyWeight.deleteEntry(id)
  if (error) {
    errorMessage.value = error.message
  }
  confirmingDeleteId.value = null
}
</script>

<template>
  <div class="weigh-in-overlay" role="dialog" aria-modal="true" aria-labelledby="weigh-in-title" @click.self="emit('dismiss')">
    <div class="weigh-in-panel">
      <div class="weigh-in-header">
        <div class="weigh-in-heading">
          <h2 id="weigh-in-title">Weigh-ins</h2>
          <span class="row-sub">
            {{ bodyWeight.entries.length }} {{ bodyWeight.entries.length === 1 ? 'entry' : 'entries' }}
            <template v-if="oldestDateLabel"> since {{ oldestDateLabel }}</template>
          </span>
        </div>
        <button type="button" class="icon-button" aria-label="Close weigh-ins" @click="emit('dismiss')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <SkeletonRows v-if="bodyWeight.loading" :rows="2" />
      <p v-else-if="bodyWeight.entries.length === 0" class="empty">No weigh-ins logged yet.</p>

      <ul v-else class="weigh-in-list">
        <li v-for="row in rows" :key="row.entry.id" class="weigh-in-row">
          <form v-if="editingId === row.entry.id" class="edit-form" @submit.prevent="saveEdit(row.entry.id)">
            <span class="edit-label">Editing weigh-in</span>

            <label :for="`edit-weight-${row.entry.id}`">Weight</label>
            <div class="field-row">
              <input
                :id="`edit-weight-${row.entry.id}`"
                :ref="(el) => (editWeightInput = el as HTMLInputElement | null)"
                v-model.number="editWeight"
                type="number"
                inputmode="decimal"
                step="0.1"
              />
              <div role="group" aria-label="Weight unit" class="unit-toggle">
                <button type="button" :class="{ active: editUnit === 'lb' }" :aria-pressed="editUnit === 'lb'" @click="editUnit = 'lb'">lb</button>
                <button type="button" :class="{ active: editUnit === 'kg' }" :aria-pressed="editUnit === 'kg'" @click="editUnit = 'kg'">kg</button>
              </div>
            </div>

            <label :for="`edit-date-${row.entry.id}`">Date</label>
            <input :id="`edit-date-${row.entry.id}`" v-model="editDate" type="date" />

            <WeightTypoWarning
              v-if="showEditTypoWarning && editingPrevious"
              :previous-weight="editingPrevious.weight"
              :previous-unit="editingPrevious.weight_unit"
              @fix-it="fixEditTypo"
              @save-anyway="confirmEditTypo(row.entry.id)"
            />

            <div class="edit-actions">
              <button type="submit">Save</button>
              <button type="button" class="ghost small" @click="editingId = null">Cancel</button>
            </div>
          </form>

          <div v-else-if="confirmingDeleteId === row.entry.id" class="confirm-delete">
            <span class="row-sub">
              Delete the {{ formatShortDate(row.entry.recorded_at) }} weigh-in ({{ row.entry.weight }} {{ row.entry.weight_unit }})?
              Volume for workouts that used it will be recalculated.
            </span>
            <div class="confirm-actions">
              <button type="button" class="danger small" @click="confirmDelete(row.entry.id)">Confirm delete</button>
              <button type="button" class="ghost small" @click="confirmingDeleteId = null">Cancel</button>
            </div>
          </div>

          <div v-else class="row">
            <div class="row-main">
              <span class="row-date">{{ formatShortDate(row.entry.recorded_at) }}</span>
              <span class="row-weight">
                {{ row.entry.weight }} {{ row.entry.weight_unit }}
                <span v-if="row.delta !== null" class="row-delta">{{ row.delta > 0 ? '+' : '' }}{{ row.delta.toFixed(1) }}</span>
              </span>
            </div>
            <button
              type="button"
              class="icon-button"
              :aria-label="`Edit ${row.entry.weight}${row.entry.weight_unit} weigh-in from ${formatShortDate(row.entry.recorded_at)}`"
              @click="startEditing(row.entry)"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
            <button
              type="button"
              class="icon-button icon-button-danger"
              :aria-label="`Delete ${row.entry.weight}${row.entry.weight_unit} weigh-in from ${formatShortDate(row.entry.recorded_at)}`"
              @click="startDeleting(row.entry.id)"
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
.weigh-in-overlay {
  position: fixed;
  inset: 0;
  z-index: 65;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.weigh-in-panel {
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

.weigh-in-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.weigh-in-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.weigh-in-heading h2 {
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

.weigh-in-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.weigh-in-row {
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

.row-weight {
  font-size: 1.05rem;
  font-weight: 700;
}

.row-delta {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-dim);
}

.edit-form {
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edit-label {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-row input {
  flex-grow: 1;
  min-width: 0;
}

.unit-toggle {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.unit-toggle button {
  min-height: 48px;
  width: 44px;
  padding: 0;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-weight: 700;
}

.unit-toggle button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.edit-actions,
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
  flex-shrink: 0;
}

.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--accent-text);
}

.confirm-delete {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
