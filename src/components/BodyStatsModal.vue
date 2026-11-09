<script setup lang="ts">
import { themeArt } from '../lib/theme'
// Backlog item 77: reusable height + body-weight modal. Built here but not
// triggered by anything yet — items 78/79 open it from the missing-weight
// prompt (both reusing one composable, per docs/backlog.md) and item 80
// opens it in "update" mode for the periodic weigh-in reminder. This
// component only renders the form and emits which button was pressed; every
// caller decides what "Not now"/"Don't ask again" mean for its own flow, so
// `showNotNow`/`showDontAskAgain` default to hidden for a plain manual open
// (e.g. this item's own Body screen "Log weight"/"Edit height" affordances,
// which use their own inline forms instead of this modal — see
// BodyScreen.vue — so in practice today this modal has no caller at all
// until items 78-80 land).
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { HeightUnit, WeightUnit } from '../lib/types'
import { feetInchesToInches, inchesToFeetInches, isBigWeightChange } from '../lib/bodyStats'
import WeightTypoWarning from './WeightTypoWarning.vue'

const props = withDefaults(
  defineProps<{
    weight: number | null
    weightUnit: WeightUnit
    height: number | null
    heightUnit: HeightUnit | null
    hideHeight?: boolean
    heading?: string
    intro?: string
    showNotNow?: boolean
    showDontAskAgain?: boolean
    showBunny?: boolean
  }>(),
  {
    hideHeight: false,
    heading: 'Update your stats',
    intro: '',
    showNotNow: false,
    showDontAskAgain: false,
    showBunny: false,
  },
)

const emit = defineEmits<{
  (
    e: 'save',
    payload: { weight: number; weightUnit: WeightUnit; height: number | null; heightUnit: HeightUnit | null },
  ): void
  (e: 'dismiss'): void
  (e: 'optOut'): void
  (e: 'close'): void
}>()

const weightDraft = ref<number | null>(props.weight)
const weightUnitDraft = ref<WeightUnit>(props.weightUnit)
const heightUnitDraft = ref<HeightUnit>(props.heightUnit ?? 'in')
const feetDraft = ref<number | null>(null)
const inchesDraft = ref<number | null>(null)
const cmDraft = ref<number | null>(null)
const errorMessage = ref('')
const weightInput = ref<HTMLInputElement | null>(null)

// Backlog item 81: only the weigh-in-reminder caller pre-fills `weight` with
// a real previous entry (WorkoutLogger.vue) — the missing-weight prompt
// always passes null since there's nothing to compare a first-ever weight
// against.
const typoConfirmed = ref(false)
const showTypoWarning = computed(() => {
  if (typoConfirmed.value || props.weight === null || weightDraft.value === null) return false
  return isBigWeightChange(weightDraft.value, weightUnitDraft.value, props.weight, props.weightUnit)
})

if (props.height !== null) {
  if (heightUnitDraft.value === 'in') {
    const { feet, inches } = inchesToFeetInches(props.height)
    feetDraft.value = feet
    inchesDraft.value = inches
  } else {
    cmDraft.value = props.height
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

function handleSave() {
  errorMessage.value = ''
  if (weightDraft.value === null || weightDraft.value <= 0) {
    errorMessage.value = 'Enter a weight.'
    return
  }
  if (showTypoWarning.value) return

  let heightValue: number | null = null
  if (!props.hideHeight) {
    if (heightUnitDraft.value === 'in' && (feetDraft.value !== null || inchesDraft.value !== null)) {
      heightValue = feetInchesToInches(feetDraft.value ?? 0, inchesDraft.value ?? 0)
    } else if (heightUnitDraft.value === 'cm' && cmDraft.value !== null) {
      heightValue = cmDraft.value
    }
  }

  emit('save', {
    weight: weightDraft.value,
    weightUnit: weightUnitDraft.value,
    height: heightValue,
    heightUnit: heightValue !== null ? heightUnitDraft.value : null,
  })
  typoConfirmed.value = false
}

function confirmTypo() {
  typoConfirmed.value = true
  handleSave()
}

function fixTypo() {
  typoConfirmed.value = false
  weightInput.value?.focus()
}

// The weigh-in-reminder caller pre-fills weightDraft with the real latest
// weight (and, once a caller stops passing hide-height, the height fields
// prefill the same way) -- without this, typing over that existing value
// inserts at the cursor instead of replacing it, e.g. "10" over an existing
// "180" landing as "18010". Selecting the value on focus makes it a
// one-keystroke overwrite instead (same fix WorkoutLogger.vue's set rows
// already apply to their own pre-filled fields).
function selectInputText(event: FocusEvent) {
  ;(event.target as HTMLInputElement).select()
}
</script>

<template>
  <div
    class="stats-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="heading"
    @click.self="emit('close')"
  >
    <div class="stats-panel">
      <img v-if="showBunny" :src="themeArt('body')" alt="" class="bunny mascot-art" />

      <div class="stats-header">
        <h2>{{ heading }}</h2>
        <button type="button" class="icon-button" aria-label="Close" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p v-if="intro" class="intro">{{ intro }}</p>

      <form class="stats-form" @submit.prevent="handleSave">
        <label for="stats-weight">Body weight</label>
        <div class="field-row">
          <input
            id="stats-weight"
            ref="weightInput"
            v-model.number="weightDraft"
            type="number"
            inputmode="decimal"
            step="0.1"
            placeholder="e.g. 180"
            @focus="selectInputText"
          />
          <div role="group" aria-label="Weight unit" class="unit-toggle">
            <button
              type="button"
              :aria-pressed="weightUnitDraft === 'lb'"
              :class="{ active: weightUnitDraft === 'lb' }"
              @click="weightUnitDraft = 'lb'"
            >
              lb
            </button>
            <button
              type="button"
              :aria-pressed="weightUnitDraft === 'kg'"
              :class="{ active: weightUnitDraft === 'kg' }"
              @click="weightUnitDraft = 'kg'"
            >
              kg
            </button>
          </div>
        </div>

        <template v-if="!hideHeight">
          <label :for="heightUnitDraft === 'in' ? 'stats-height-ft' : 'stats-height-cm'">Height</label>
          <div class="field-row">
            <div v-if="heightUnitDraft === 'in'" class="field-row">
              <input
                id="stats-height-ft"
                v-model.number="feetDraft"
                type="number"
                inputmode="numeric"
                placeholder="5"
                @focus="selectInputText"
              />
              <span class="unit-label">ft</span>
              <input
                v-model.number="inchesDraft"
                type="number"
                inputmode="numeric"
                aria-label="Inches"
                placeholder="10"
                @focus="selectInputText"
              />
              <span class="unit-label">in</span>
            </div>
            <input
              v-else
              id="stats-height-cm"
              v-model.number="cmDraft"
              type="number"
              inputmode="numeric"
              placeholder="180"
              @focus="selectInputText"
            />
            <div role="group" aria-label="Height unit" class="unit-toggle">
              <button
                type="button"
                :aria-pressed="heightUnitDraft === 'in'"
                :class="{ active: heightUnitDraft === 'in' }"
                @click="heightUnitDraft = 'in'"
              >
                ft
              </button>
              <button
                type="button"
                :aria-pressed="heightUnitDraft === 'cm'"
                :class="{ active: heightUnitDraft === 'cm' }"
                @click="heightUnitDraft = 'cm'"
              >
                cm
              </button>
            </div>
          </div>
        </template>

        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

        <WeightTypoWarning
          v-if="showTypoWarning && props.weight !== null"
          :previous-weight="props.weight"
          :previous-unit="props.weightUnit"
          @fix-it="fixTypo"
          @save-anyway="confirmTypo"
        />

        <div class="actions">
          <button type="submit" class="primary">Save</button>
          <button v-if="showNotNow" type="button" class="ghost" @click="emit('dismiss')">Not now</button>
          <button v-if="showDontAskAgain" type="button" class="ghost" @click="emit('optOut')">
            Don't ask again
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.stats-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.stats-panel {
  position: relative;
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

.bunny {
  position: absolute;
  top: -110px;
  right: 12px;
  height: 128px;
  width: auto;
}

.stats-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.stats-header h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.1rem;
  color: var(--text);
  text-transform: none;
  letter-spacing: 0;
}

.icon-button {
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
  flex-shrink: 0;
}

.intro {
  font-size: 0.85rem;
  color: var(--text-dim);
}

.stats-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.unit-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
  flex-shrink: 0;
}

.unit-toggle {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.unit-toggle button {
  min-height: 48px;
  width: 48px;
  padding: 0;
  border-radius: 12px;
  background: var(--surface);
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
  color: var(--danger);
}

.actions {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}
</style>
