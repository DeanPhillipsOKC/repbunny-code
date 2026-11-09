<script setup lang="ts">
// Issue #139: the add and edit form for one measurement entry. Any subset of
// the six sites, a date, and in or cm.
import { ref } from 'vue'
import { emptyValues, hasAnyValue, SITE_LABELS, toDateInputValue } from '../lib/measurements'
import { MEASUREMENT_SITES, type HeightUnit, type MeasurementValues } from '../lib/types'

const props = defineProps<{
  idPrefix: string
  title: string
  unit: HeightUnit
  values?: MeasurementValues
  recordedAt?: string
  busy?: boolean
}>()

const emit = defineEmits<{
  save: [values: MeasurementValues, unit: HeightUnit, date: string]
  cancel: []
}>()

const draft = ref<Record<string, number | null | ''>>({ ...(props.values ?? emptyValues()) })
const unit = ref<HeightUnit>(props.unit)
const date = ref(toDateInputValue(props.recordedAt ?? new Date().toISOString()))
const error = ref('')

function submit() {
  error.value = ''
  const values = emptyValues()
  for (const site of MEASUREMENT_SITES) {
    const raw = draft.value[site]
    if (raw === null || raw === '' || raw === undefined) continue
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) {
      error.value = `${SITE_LABELS[site]} needs a number above 0.`
      return
    }
    values[site] = n
  }
  if (!hasAnyValue(values)) {
    error.value = 'Fill in at least one measurement.'
    return
  }
  if (!date.value) {
    error.value = 'Enter a date.'
    return
  }
  emit('save', values, unit.value, date.value)
}
</script>

<template>
  <form class="measure-form" @submit.prevent="submit">
    <div class="form-head">
      <span class="form-title">{{ title }}</span>
      <div role="group" aria-label="Measurement unit" class="unit-toggle">
        <button type="button" :class="{ active: unit === 'in' }" :aria-pressed="unit === 'in'" @click="unit = 'in'">in</button>
        <button type="button" :class="{ active: unit === 'cm' }" :aria-pressed="unit === 'cm'" @click="unit = 'cm'">cm</button>
      </div>
    </div>
    <p class="hint">Fill in any you measured. Leave the rest blank.</p>
    <div class="site-grid">
      <div v-for="site in MEASUREMENT_SITES" :key="site" class="site-field">
        <label :for="`${idPrefix}-${site}`">{{ SITE_LABELS[site] }}</label>
        <div class="input-wrap">
          <input :id="`${idPrefix}-${site}`" v-model.number="draft[site]" type="number" inputmode="decimal" step="0.1" min="0" />
          <span class="unit-suffix" aria-hidden="true">{{ unit }}</span>
        </div>
      </div>
    </div>
    <label :for="`${idPrefix}-date`">Date</label>
    <input :id="`${idPrefix}-date`" v-model="date" type="date" class="date-input" />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="actions">
      <button type="submit" :disabled="busy">Save</button>
      <button type="button" class="ghost" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.measure-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.form-title {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

.hint {
  margin: 0 0 4px;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.site-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 10px;
  margin-bottom: 4px;
}

.site-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.site-field label {
  font-size: 0.8rem;
  font-weight: 700;
}

.input-wrap {
  position: relative;
}

.input-wrap input {
  width: 100%;
  box-sizing: border-box;
  padding-right: 34px;
}

.unit-suffix {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
  pointer-events: none;
}

.date-input {
  margin-bottom: 4px;
}

.unit-toggle {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.unit-toggle button {
  min-height: 36px;
  width: 44px;
  padding: 0;
  border-radius: 10px;
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

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.85rem;
}

.actions {
  display: flex;
  gap: 8px;
}

.actions button {
  margin: 0;
  flex: 1;
  height: 48px;
  min-height: 48px;
  padding: 0 12px;
}

.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}
</style>
