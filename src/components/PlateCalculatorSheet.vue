<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import BarbellDrawing from './BarbellDrawing.vue'
import PlateInventory from './PlateInventory.vue'
import TrialNote from './TrialNote.vue'
import { BAR_OPTIONS, barLabel, barWeight, formatWeight, loadBar, plateStep, plateStyle } from '../lib/plates'
import type { BarType, Exercise, WeightUnit } from '../lib/types'
import { useEscapeClose } from '../lib/escapeClose'

// Issue #22: "Load the bar". Design source:
// docs/design/issue-22-plate-calculator.html, screens 2 and 3.
const props = defineProps<{ exercise: Exercise; unit: WeightUnit; initialWeight: number | null }>()
const emit = defineEmits<{ use: [weight: number]; dismiss: [] }>()

// Issue #783: Escape, and so Android back, closes this sheet.
useEscapeClose(() => emit('dismiss'))

const exercises = useExercisesStore()
const profile = useProfileStore()

const bar = computed(() => barWeight(props.exercise, props.unit))
const plates = computed(() => profile.plates[props.unit])
const step = computed(() => plateStep(plates.value))

const target = ref<number | ''>(props.initialWeight && props.initialWeight > 0 ? props.initialWeight : bar.value)
const targetNumber = computed(() => (typeof target.value === 'number' && target.value > 0 ? target.value : bar.value))

const result = computed(() => loadBar(targetNumber.value, bar.value, plates.value))

// For a weight that can't be made: which of the two closest is picked.
const picked = ref<'below' | 'above'>('below')
watch(result, (r) => {
  picked.value = r.below ? 'below' : 'above'
}, { immediate: true })

const chosen = computed(() => result.value.exact ?? (picked.value === 'below' ? result.value.below : result.value.above) ?? result.value.above)

function nudge(direction: 1 | -1) {
  const next = targetNumber.value + direction * step.value
  target.value = Math.max(bar.value, Math.round(next * 100) / 100)
}

function use() {
  if (chosen.value) emit('use', chosen.value.total)
}

// "Change" bar: an inline picker that saves to this exercise only.
const changingBar = ref(false)
const customDraft = ref<number | ''>(props.exercise.bar_type === 'custom' ? (props.exercise.bar_custom_weight ?? '') : '')
const barError = ref('')

async function pickBar(type: BarType) {
  barError.value = ''
  if (type === 'custom') {
    if (typeof customDraft.value !== 'number' || customDraft.value <= 0) return
  }
  const { error } = await exercises.updateBarbell(props.exercise.id, {
    uses_barbell: true,
    bar_type: type,
    bar_custom_weight: type === 'custom' ? (customDraft.value as number) : null,
    bar_custom_unit: type === 'custom' ? props.unit : null,
  })
  if (error) barError.value = error.message
  else changingBar.value = false
}

const currentBarType = computed<BarType>(() => props.exercise.bar_type ?? 'standard')
const showCustom = ref(props.exercise.bar_type === 'custom')

// Issue #48: "Your plates" line with an Edit link that expands the
// "Plates at my gym" box in place (docs/design/issue-20-backup-restore.html,
// screen 4). Replaces the section that used to live in the Account sheet.
const editingPlates = ref(false)
const inventoryUnit = ref<WeightUnit>(props.unit)
const platesSummary = computed(() => (plates.value.length ? plates.value.map(formatWeight).join(', ') : 'none'))

function lighterHeavier(total: number): string {
  const diff = Math.abs(total - targetNumber.value)
  return `${formatWeight(diff)} ${props.unit} ${total < targetNumber.value ? 'lighter' : 'heavier'}`
}
</script>

<template>
  <div class="sheet-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Load the bar">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div>
        <h3 class="sheet-title">Load the bar</h3>
        <p class="sheet-sub">{{ exercise.name }}</p>
      </div>
      <TrialNote feature="plates" />

      <div class="target">
        <button type="button" class="step" aria-label="Decrease weight" @click="nudge(-1)">−</button>
        <label class="target-field">
          <input
            v-model.number="target"
            type="number"
            inputmode="decimal"
            min="0"
            step="any"
            aria-label="Total weight"
          />
          <span class="target-unit">{{ unit }} total</span>
        </label>
        <button type="button" class="step" aria-label="Increase weight" @click="nudge(1)">+</button>
      </div>

      <div class="bar-line">
        <span>Bar: <b>{{ formatWeight(bar) }} {{ unit }}</b> ({{ barLabel(exercise) }})</span>
        <button type="button" class="link" :aria-expanded="changingBar" @click="changingBar = !changingBar">Change</button>
      </div>
      <div v-if="changingBar" class="bar-picker" role="group" aria-label="Bar">
        <div class="bar-options">
          <button
            v-for="option in BAR_OPTIONS"
            :key="option.value"
            type="button"
            class="bar-option"
            :aria-pressed="currentBarType === option.value"
            @click="pickBar(option.value)"
          >
            {{ option[unit] }} {{ unit }}<small>{{ option.label }}</small>
          </button>
          <button
            type="button"
            class="bar-option"
            :aria-pressed="currentBarType === 'custom'"
            @click="showCustom = true"
          >
            Other
          </button>
        </div>
        <form v-if="showCustom" class="custom-bar" @submit.prevent="pickBar('custom')">
          <input v-model.number="customDraft" type="number" inputmode="decimal" min="0" step="any" :aria-label="`Bar weight (${unit})`" />
          <button type="submit" class="small">Save</button>
        </form>
        <p v-if="barError" class="error">{{ barError }}</p>
      </div>

      <div class="bar-line">
        <span>Your plates: <b>{{ platesSummary }}</b></span>
        <button type="button" class="link" :aria-expanded="editingPlates" @click="editingPlates = !editingPlates">
          {{ editingPlates ? 'Done' : 'Edit' }}
        </button>
      </div>
      <section v-if="editingPlates" class="plates-box" aria-labelledby="plates-title">
        <div class="plates-head">
          <h4 id="plates-title" class="plates-title">Plates at my gym</h4>
          <span class="plates-units" role="group" aria-label="Plate units">
            <button
              v-for="u in (['lb', 'kg'] as const)"
              :key="u"
              type="button"
              class="plates-unit"
              :aria-pressed="inventoryUnit === u"
              @click="inventoryUnit = u"
            >
              {{ u }}
            </button>
          </span>
        </div>
        <p class="plates-sub">Tap to turn off any your gym doesn't have.</p>
        <PlateInventory :unit="inventoryUnit" />
      </section>

      <template v-if="result.exact">
        <div class="bar-wrap">
          <BarbellDrawing :per-side="result.exact.perSide" :unit="unit" />
        </div>
        <div class="side">
          <span class="side-label">Each side:</span>
          <span
            v-for="(plate, i) in result.exact.perSide"
            :key="i"
            class="plate-chip"
            :style="{ background: plateStyle(plate, unit).color }"
          >{{ formatWeight(plate) }}</span>
          <span v-if="result.exact.perSide.length === 0" class="side-empty">nothing, just the bar</span>
        </div>
        <p class="math">
          <b>{{ formatWeight(bar) }}</b> bar + <b>{{ formatWeight((result.exact.total - bar) / 2) }}</b> each side =
          <b>{{ formatWeight(result.exact.total) }} {{ unit }}</b>
        </p>
      </template>

      <template v-else>
        <p class="warn">
          You can't make <b>{{ formatWeight(targetNumber) }} {{ unit }}</b> with your plates. Pick the closest:
        </p>
        <template v-for="side in (['below', 'above'] as const)" :key="side">
          <button
            v-if="result[side]"
            type="button"
            class="option"
            :aria-pressed="chosen === result[side]"
            @click="picked = side"
          >
            <span class="option-top">
              <span class="option-weight">{{ formatWeight(result[side]!.total) }} {{ unit }}</span>
              <span class="option-diff">{{ lighterHeavier(result[side]!.total) }}</span>
            </span>
            <BarbellDrawing :per-side="result[side]!.perSide" :unit="unit" :scale="0.5" />
            <span class="option-plates">
              {{ result[side]!.perSide.length ? `Each side: ${result[side]!.perSide.map(formatWeight).join(', ')}` : 'Just the bar' }}
            </span>
          </button>
        </template>
      </template>

      <button type="button" class="use" :disabled="!chosen" @click="use">
        Use {{ chosen ? formatWeight(chosen.total) : '' }} {{ unit }}
      </button>
      <button type="button" class="ghost" @click="emit('dismiss')">Close</button>
    </div>
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
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
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 18px calc(18px + env(safe-area-inset-bottom, 0px));
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

.sheet-sub {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.target {
  display: flex;
  align-items: center;
  gap: 10px;
}

.step {
  width: 46px;
  height: 54px;
  min-height: 54px;
  padding: 0;
  flex-shrink: 0;
  border-radius: 12px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 1.3rem;
  font-weight: 800;
}

.target-field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 54px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--accent);
  margin: 0;
}

.target-field input {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text);
}

.target-field input:focus {
  outline: none;
}

.target-field input::-webkit-inner-spin-button,
.target-field input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.target-field input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.target-unit {
  flex-shrink: 0;
  margin-left: 6px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dim);
}

.bar-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: -2px 2px 0;
  font-size: 0.78rem;
  color: var(--text-dim);
}

.bar-line b {
  color: var(--text);
}

.link {
  min-height: auto;
  padding: 4px 0 4px 8px;
  background: none;
  border: none;
  color: var(--secondary);
  font-size: 0.8rem;
  font-weight: 800;
}

.bar-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bar-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.bar-option {
  min-height: 0;
  padding: 8px 0;
  border-radius: 10px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1.2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.bar-option small {
  font-size: 0.64rem;
  font-weight: 700;
}

.bar-option[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.custom-bar {
  display: flex;
  gap: 8px;
}

.custom-bar input {
  flex: 1;
  min-width: 0;
}

.custom-bar .small {
  min-height: 40px;
  padding: 0 14px;
}

.plates-box {
  padding: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.plates-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 4px;
}

.plates-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
}

.plates-units {
  display: flex;
  gap: 4px;
}

.plates-unit {
  width: 38px;
  min-height: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 0.78rem;
  font-weight: 800;
}

.plates-unit[aria-pressed='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.plates-sub {
  margin: 0 0 10px;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.bar-wrap {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 12px 6px 8px;
}

.side {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.side-label {
  margin-right: 4px;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--text-dim);
}

.side-empty {
  font-size: 0.85rem;
  color: var(--text-dim);
}

.plate-chip {
  padding: 5px 11px;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--accent-text);
}

.math {
  margin: 0 0 2px;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.math b {
  color: var(--text);
}

.warn {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--highlight) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--highlight) 45%, var(--border));
  color: var(--text);
  font-size: 0.84rem;
  line-height: 1.45;
}

.option {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  min-height: 0;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  text-align: left;
  font-weight: 400;
}

.option[aria-pressed='true'] {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface-2));
}

.option-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.option-weight {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
}

.option-diff {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--text-dim);
}

.option-plates {
  font-size: 0.78rem;
  color: var(--text-dim);
}

.use {
  width: 100%;
  min-height: 50px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.ghost {
  width: 100%;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.8rem;
}
</style>
