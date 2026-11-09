<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  customRange,
  lastFourWeeks,
  lastThreeMonths,
  rangeLabel,
  toDateInput,
  type ShareRange,
  type ShareRangeKind,
} from '../lib/coachReport'
import { openPremiumSheet } from '../lib/premium'
import TrialNote from './TrialNote.vue'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #152: "Share as PDF" on the monthly report. Pick a range (the report's
// own month or year, the last 4 weeks, the last 3 months, or custom dates),
// then ProgressReport.vue builds the PDF on the device and hands it to the
// share sheet. Without Premium it's a preview, like themes and swaps: the
// ranges can be tried, and the share button is replaced by Keep it with
// Premium / Go back.
const props = defineProps<{ periodName: string; periodRange: ShareRange; locked: boolean; busy: boolean; error: string }>()
const emit = defineEmits<{ dismiss: []; share: [range: ShareRange, withSets: boolean] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('dismiss'))

const kind = ref<ShareRangeKind>('period')
const fourWeeks = lastFourWeeks()
const threeMonths = lastThreeMonths()
const customFrom = ref(toDateInput(fourWeeks.start))
const customTo = ref(toDateInput(new Date()))
const today = toDateInput(new Date())
const withSets = ref(false)

const options = computed<{ kind: ShareRangeKind; title: string; caption: string }[]>(() => [
  { kind: 'period', title: props.periodName, caption: rangeLabel(props.periodRange) },
  { kind: '4w', title: 'Last 4 weeks', caption: rangeLabel(fourWeeks) },
  { kind: '3m', title: 'Last 3 months', caption: rangeLabel(threeMonths) },
  { kind: 'custom', title: 'Custom', caption: 'Pick the first and last day' },
])

const range = computed<ShareRange | null>(() => {
  switch (kind.value) {
    case 'period':
      return props.periodRange
    case '4w':
      return fourWeeks
    case '3m':
      return threeMonths
    case 'custom':
      return customRange(customFrom.value, customTo.value)
  }
})

function share() {
  if (range.value) emit('share', range.value, withSets.value)
}
</script>

<template>
  <div class="sheet-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="share-report-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <h3 id="share-report-title" class="sheet-title">Share as PDF</h3>
      <p class="intro">A printable report for a coach or physio: your lifts, sets per muscle group, body weight, and records.</p>
      <TrialNote feature="reports" />

      <div class="tiles" role="radiogroup" aria-label="Date range">
        <label v-for="o in options" :key="o.kind" class="tile" :class="{ on: kind === o.kind }">
          <input v-model="kind" type="radio" name="share-range" :value="o.kind" class="tile-input" />
          <span class="tile-dot" aria-hidden="true"></span>
          <span class="tile-text">
            <span class="tile-title">{{ o.title }}</span>
            <span class="tile-caption">{{ o.caption }}</span>
          </span>
        </label>
      </div>

      <div v-if="kind === 'custom'" class="custom">
        <label class="field">
          <span>From</span>
          <input v-model="customFrom" type="date" :max="today" />
        </label>
        <label class="field">
          <span>To</span>
          <input v-model="customTo" type="date" :max="today" />
        </label>
      </div>
      <label class="check">
        <input v-model="withSets" type="checkbox" />
        <span class="check-text">
          <span class="tile-title">Include the sets behind each number</span>
          <span class="tile-caption">Adds a section so a coach can check the figures.</span>
        </span>
      </label>
      <p v-if="kind === 'custom' && !range" class="error" role="alert">Pick a first day on or before the last day.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div v-if="locked" class="preview-bar" role="group" aria-label="Share as PDF preview">
        <p class="preview-text">Sharing a PDF report is part of <strong>Premium</strong>.</p>
        <div class="preview-actions">
          <button type="button" class="keep" @click="openPremiumSheet('reports')">Keep it with Premium</button>
          <button type="button" class="go-back" @click="emit('dismiss')">Go back</button>
        </div>
      </div>
      <template v-else>
        <button type="button" class="share-button" :disabled="!range || busy" @click="share">
          {{ busy ? 'Making the PDF…' : 'Share PDF' }}
        </button>
        <button type="button" class="cancel" :disabled="busy" @click="emit('dismiss')">Cancel</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 88vh;
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
  margin: -6px 0 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.tiles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tile {
  position: relative;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}

.tile.on {
  border-color: color-mix(in srgb, var(--secondary) 60%, var(--border));
  background: color-mix(in srgb, var(--secondary) 8%, var(--surface));
}

.tile-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
}

.tile:has(.tile-input:focus-visible) {
  outline: 2px solid var(--secondary);
  outline-offset: 2px;
}

.tile-dot {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid var(--border);
}

.tile.on .tile-dot {
  border: 6px solid var(--secondary);
}

.tile-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tile-title {
  font-weight: 800;
  color: var(--text);
}

.tile-caption {
  margin-top: 2px;
  font-size: 0.76rem;
  line-height: 1.35;
  color: var(--text-dim);
}

.check {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  cursor: pointer;
}

.check input {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  margin: 0;
}

.check-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.custom {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--text-dim);
  min-width: 0;
}

.field input {
  width: 100%;
  min-width: 0;
}

.error {
  margin: 0;
  font-size: 0.85rem;
  color: var(--danger);
}

.share-button {
  width: 100%;
  min-height: 50px;
  margin: 0;
  border-radius: 14px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.share-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel {
  width: 100%;
  margin: 0;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.preview-bar {
  position: sticky;
  bottom: 0;
  margin: 0 -16px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-text {
  margin: 0;
  font-size: 0.84rem;
  color: var(--text-dim);
}

.preview-text strong {
  color: var(--text);
}

.preview-actions {
  display: flex;
  gap: 8px;
}

.keep {
  flex: 1;
  min-height: 46px;
  margin: 0;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.keep:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}

.go-back {
  min-height: 46px;
  margin: 0;
  padding: 0 16px;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
  font-weight: 700;
}
</style>
