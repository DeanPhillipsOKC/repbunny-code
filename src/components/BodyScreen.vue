<script setup lang="ts">
import { themeArt } from '../lib/theme'
// Backlog item 77: fifth bottom-nav tab for body-weight/height tracking,
// prerequisite for items 78/79's bodyweight-machine volume math. Design
// source: private canvas mockup (docs/backlog.md item 77, "Body tab" /
// "Body tab, first visit" artboards).
import { computed, onMounted, ref } from 'vue'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { useProfileStore } from '../stores/profile'
import BodyMeasurementsCard from './BodyMeasurementsCard.vue'
import BodyWeightChart from './BodyWeightChart.vue'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'
import WeightTypoWarning from './WeightTypoWarning.vue'
import WeighInHistory from './WeighInHistory.vue'
import {
  bmiCategory,
  computeBmi,
  convertHeight,
  convertWeight,
  feetInchesToInches,
  inchesToFeetInches,
  isBigWeightChange,
} from '../lib/bodyStats'
import type { HeightUnit, WeightUnit } from '../lib/types'

const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()

const errorMessage = ref('')

// Empty-state combined form (weight required, height optional).
const emptyWeight = ref<number | null>(null)
const emptyWeightUnit = ref<WeightUnit>(profile.defaultWeightUnit)
const emptyHeightUnit = ref<HeightUnit>('in')
const emptyFeet = ref<number | null>(null)
const emptyInches = ref<number | null>(null)
const emptyCm = ref<number | null>(null)

// "Log today's weight" inline form.
const loggingWeight = ref(false)
const newWeight = ref<number | null>(null)
const newWeightUnit = ref<WeightUnit>(profile.defaultWeightUnit)
const newWeightInput = ref<HTMLInputElement | null>(null)
// Backlog item 81: flag a >20% swing from the current latest entry before
// saving a new one.
const newWeightTypoConfirmed = ref(false)
const showNewWeightTypoWarning = computed(() => {
  if (newWeightTypoConfirmed.value || newWeight.value === null || bodyWeight.latestEntry === null) return false
  return isBigWeightChange(newWeight.value, newWeightUnit.value, bodyWeight.latestEntry.weight, bodyWeight.latestEntry.weight_unit)
})

// Backlog item 81: "See all weigh-ins" bottom-sheet overlay.
const viewingAllWeighIns = ref(false)

// "Edit height" inline form.
const editingHeight = ref(false)
const heightUnitDraft = ref<HeightUnit>('in')
const heightFeetDraft = ref<number | null>(null)
const heightInchesDraft = ref<number | null>(null)
const heightCmDraft = ref<number | null>(null)

onMounted(() => {
  profile.fetchProfile()
  bodyWeight.fetchEntries()
})

// Only once the weigh-ins have loaded: before that, an empty list just means
// "not fetched yet", and the empty state (scale bunny and all) flashed up
// for a moment before the real numbers replaced it.
const showEmptyState = computed(() => bodyWeight.fetched && bodyWeight.entries.length === 0)

function formatRelativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

// Only ever rendered once bodyWeight.latestEntry is known to exist (the
// weight-card block is behind `v-else="showEmptyState"`), but computed here
// with `?.`/fallbacks rather than a template `!` non-null assertion so
// vue-tsc doesn't have to reason about that across the template.
const latestLoggedText = computed(() =>
  bodyWeight.latestEntry ? formatRelativeDate(bodyWeight.latestEntry.recorded_at) : '',
)

const trend = computed(() => {
  if (bodyWeight.entries.length < 2) return null
  const ascending = [...bodyWeight.entries].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  )
  const first = ascending[0]
  const last = ascending[ascending.length - 1]
  const unit = last.weight_unit
  const delta = last.weight - convertWeight(first.weight, first.weight_unit, unit)
  const days = Math.round((new Date(last.recorded_at).getTime() - new Date(first.recorded_at).getTime()) / 86_400_000)
  const span = days < 7 ? 'the last week' : `${Math.round(days / 7)} weeks`
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat over'
  return { text: `${direction} ${Math.abs(delta).toFixed(1)} ${unit} in ${span}`, unit }
})

// All points converted to the latest entry's unit so mixed-unit history
// (someone who switched from lb to kg partway through) still plots as one
// consistent line instead of jumping when the unit changes.
const chartUnit = computed<WeightUnit>(() => bodyWeight.latestEntry?.weight_unit ?? profile.defaultWeightUnit)

const chartPoints = computed(() =>
  [...bodyWeight.entries]
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    .map((e) => ({
      recordedAt: e.recorded_at,
      weight: convertWeight(e.weight, e.weight_unit, chartUnit.value),
    })),
)

const heightDisplay = computed(() => {
  if (profile.height === null || profile.heightUnit === null) return null
  if (profile.heightUnit === 'in') {
    const { feet, inches } = inchesToFeetInches(profile.height)
    return { primary: `${feet}′ ${inches}″`, secondary: `${Math.round(convertHeight(profile.height, 'in', 'cm'))} cm` }
  }
  return { primary: `${profile.height} cm`, secondary: `${Math.round(convertHeight(profile.height, 'cm', 'in'))} in` }
})

const bmi = computed(() => {
  if (profile.height === null || profile.heightUnit === null || bodyWeight.latestEntry === null) return null
  return computeBmi(bodyWeight.latestEntry.weight, bodyWeight.latestEntry.weight_unit, profile.height, profile.heightUnit)
})

const bmiCategoryLabel = computed(() => (bmi.value !== null ? bmiCategory(bmi.value) : null))

const nextReminderText = computed(() => {
  if (profile.weightReminder === 'off') return null
  if (!bodyWeight.latestEntry) return "Starts once you've saved a weight and height"
  const days = profile.weightReminder === 'weekly' ? 7 : 30
  const next = new Date(bodyWeight.latestEntry.recorded_at)
  next.setDate(next.getDate() + days)
  return `Next one around ${next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
})

async function handleEmptySave() {
  errorMessage.value = ''
  if (!emptyWeight.value || emptyWeight.value <= 0) {
    errorMessage.value = 'Enter a body weight.'
    return
  }
  const { error } = await bodyWeight.logWeight(emptyWeight.value, emptyWeightUnit.value)
  if (error) {
    errorMessage.value = error.message
    return
  }

  let heightValue: number | null = null
  if (emptyHeightUnit.value === 'in' && (emptyFeet.value !== null || emptyInches.value !== null)) {
    heightValue = feetInchesToInches(emptyFeet.value ?? 0, emptyInches.value ?? 0)
  } else if (emptyHeightUnit.value === 'cm' && emptyCm.value !== null) {
    heightValue = emptyCm.value
  }
  if (heightValue !== null) {
    await profile.updateHeight(heightValue, emptyHeightUnit.value)
  }
}

function startLoggingWeight() {
  newWeight.value = null
  newWeightUnit.value = bodyWeight.latestEntry?.weight_unit ?? profile.defaultWeightUnit
  newWeightTypoConfirmed.value = false
  loggingWeight.value = true
}

async function saveNewWeight() {
  errorMessage.value = ''
  if (!newWeight.value || newWeight.value <= 0) {
    errorMessage.value = 'Enter a body weight.'
    return
  }
  if (showNewWeightTypoWarning.value) return
  const { error } = await bodyWeight.logWeight(newWeight.value, newWeightUnit.value)
  if (error) {
    errorMessage.value = error.message
  } else {
    loggingWeight.value = false
    newWeightTypoConfirmed.value = false
  }
}

function confirmNewWeightTypo() {
  newWeightTypoConfirmed.value = true
  saveNewWeight()
}

function fixNewWeightTypo() {
  newWeightTypoConfirmed.value = false
  newWeightInput.value?.focus()
}

function startEditingHeight() {
  heightUnitDraft.value = profile.heightUnit ?? 'in'
  if (profile.height !== null && heightUnitDraft.value === 'in') {
    const { feet, inches } = inchesToFeetInches(profile.height)
    heightFeetDraft.value = feet
    heightInchesDraft.value = inches
    heightCmDraft.value = null
  } else if (profile.height !== null) {
    heightCmDraft.value = profile.height
    heightFeetDraft.value = null
    heightInchesDraft.value = null
  } else {
    heightFeetDraft.value = null
    heightInchesDraft.value = null
    heightCmDraft.value = null
  }
  editingHeight.value = true
}

async function saveHeight() {
  errorMessage.value = ''
  let heightValue: number | null = null
  if (heightUnitDraft.value === 'in' && (heightFeetDraft.value !== null || heightInchesDraft.value !== null)) {
    heightValue = feetInchesToInches(heightFeetDraft.value ?? 0, heightInchesDraft.value ?? 0)
  } else if (heightUnitDraft.value === 'cm' && heightCmDraft.value !== null) {
    heightValue = heightCmDraft.value
  }
  if (heightValue === null || heightValue <= 0) {
    errorMessage.value = 'Enter a height.'
    return
  }
  const { error } = await profile.updateHeight(heightValue, heightUnitDraft.value)
  if (error) {
    errorMessage.value = error.message
  } else {
    editingHeight.value = false
  }
}

// "Edit height" re-opens with the existing value already filled in (see
// startEditingHeight above), so without this a tap to change it inserts at
// the cursor instead of replacing — typing "10" over an existing "8" lands
// as "108" rather than "10". Selecting the value on focus makes it a
// one-keystroke overwrite instead (same fix WorkoutLogger.vue's set rows
// already apply to their own pre-filled reps/weight/RPE fields).
function selectInputText(event: FocusEvent) {
  ;(event.target as HTMLInputElement).select()
}

async function toggleMissingWeightPrompt() {
  await profile.updateMissingWeightPromptOptOut(!profile.missingWeightPromptOptOut)
}

async function setCadence(cadence: 'weekly' | 'monthly' | 'off') {
  await profile.updateWeightReminder(cadence)
}
</script>

<template>
  <div>
    <router-link :to="{ name: 'progress' }" class="back-link" aria-label="Back to Progress"><span aria-hidden="true">‹</span>Progress</router-link>
    <PageHeader title="Body" />
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <SkeletonRows v-if="!bodyWeight.fetched && bodyWeight.loading" :rows="3" />

    <form v-if="showEmptyState" class="card empty-form" @submit.prevent="handleEmptySave">
      <img :src="themeArt('body')" alt="" class="empty-bunny mascot-art" />
      <span class="empty-title">Add your stats</span>
      <p class="row-sub">
        Your weight lets push-ups, pull-ups, and assisted machines count toward workout volume.
        With height too, you'll see your BMI.
      </p>

      <label for="empty-weight">Body weight</label>
      <div class="field-row">
        <input id="empty-weight" v-model.number="emptyWeight" type="number" inputmode="decimal" placeholder="e.g. 180" />
        <div role="group" aria-label="Weight unit" class="unit-toggle">
          <button type="button" :class="{ active: emptyWeightUnit === 'lb' }" :aria-pressed="emptyWeightUnit === 'lb'" @click="emptyWeightUnit = 'lb'">lb</button>
          <button type="button" :class="{ active: emptyWeightUnit === 'kg' }" :aria-pressed="emptyWeightUnit === 'kg'" @click="emptyWeightUnit = 'kg'">kg</button>
        </div>
      </div>

      <label :for="emptyHeightUnit === 'in' ? 'empty-height-ft' : 'empty-height-cm'">Height <span class="dim">(optional, for BMI)</span></label>
      <div class="field-row">
        <template v-if="emptyHeightUnit === 'in'">
          <input id="empty-height-ft" v-model.number="emptyFeet" type="number" inputmode="numeric" placeholder="5" />
          <span class="unit-label">ft</span>
          <input v-model.number="emptyInches" type="number" inputmode="numeric" aria-label="Inches" placeholder="10" />
          <span class="unit-label">in</span>
        </template>
        <input v-else id="empty-height-cm" v-model.number="emptyCm" type="number" inputmode="numeric" placeholder="180" />
        <div role="group" aria-label="Height unit" class="unit-toggle">
          <button type="button" :class="{ active: emptyHeightUnit === 'in' }" :aria-pressed="emptyHeightUnit === 'in'" @click="emptyHeightUnit = 'in'">ft</button>
          <button type="button" :class="{ active: emptyHeightUnit === 'cm' }" :aria-pressed="emptyHeightUnit === 'cm'" @click="emptyHeightUnit = 'cm'">cm</button>
        </div>
      </div>

      <button type="submit">Save</button>
    </form>

    <div v-if="showEmptyState" class="grid-2">
      <div class="card small-card dashed">
        <span class="tile-label">BMI</span>
        <span class="medium dim">–</span>
        <span class="row-sub">Needs weight and height</span>
      </div>
      <div class="card small-card dashed">
        <span class="tile-label">Weight trend</span>
        <span class="medium dim">–</span>
        <span class="row-sub">Shows after 2 weigh-ins</span>
      </div>
    </div>

    <template v-else-if="bodyWeight.fetched">
      <div class="card weight-card">
        <span class="tile-label">Body weight</span>
        <div class="weight-value">
          <span class="big">{{ bodyWeight.latestEntry?.weight }}</span>
          <span class="unit-label">{{ bodyWeight.latestEntry?.weight_unit }}</span>
        </div>
        <span class="row-sub">
          Logged {{ latestLoggedText }}<template v-if="trend"> · {{ trend.text }}</template>
        </span>

        <button v-if="!loggingWeight" type="button" class="btn-accent" @click="startLoggingWeight">Log today's weight</button>
        <form v-else class="inline-form" @submit.prevent="saveNewWeight">
          <div class="field-row">
            <input ref="newWeightInput" v-model.number="newWeight" type="number" inputmode="decimal" placeholder="e.g. 180" aria-label="New body weight" />
            <div role="group" aria-label="Weight unit" class="unit-toggle">
              <button type="button" :class="{ active: newWeightUnit === 'lb' }" :aria-pressed="newWeightUnit === 'lb'" @click="newWeightUnit = 'lb'">lb</button>
              <button type="button" :class="{ active: newWeightUnit === 'kg' }" :aria-pressed="newWeightUnit === 'kg'" @click="newWeightUnit = 'kg'">kg</button>
            </div>
          </div>
          <WeightTypoWarning
            v-if="showNewWeightTypoWarning && bodyWeight.latestEntry"
            :previous-weight="bodyWeight.latestEntry.weight"
            :previous-unit="bodyWeight.latestEntry.weight_unit"
            @fix-it="fixNewWeightTypo"
            @save-anyway="confirmNewWeightTypo"
          />
          <div class="inline-actions">
            <button type="submit">Save</button>
            <button type="button" class="ghost" @click="loggingWeight = false">Cancel</button>
          </div>
        </form>
      </div>

      <div class="grid-2">
        <div class="card small-card">
          <div class="tile-head">
            <span class="tile-label">Height</span>
            <button type="button" class="icon-button" aria-label="Edit height" @click="startEditingHeight">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
          </div>
          <template v-if="heightDisplay">
            <span class="medium">{{ heightDisplay.primary }}</span>
            <span class="row-sub">{{ heightDisplay.secondary }}</span>
          </template>
          <span v-else class="medium dim">–</span>
        </div>

        <div class="card small-card">
          <span class="tile-label">BMI</span>
          <span class="medium" :class="{ dim: bmi === null }">{{ bmi ?? '–' }}</span>
          <span v-if="bmiCategoryLabel" class="bmi-pill">{{ bmiCategoryLabel }}</span>
          <span v-else class="row-sub">Needs weight and height</span>
        </div>
      </div>
      <p v-if="bmi !== null" class="bmi-note">
        BMI doesn't account for muscle, so people who lift often read higher than their build suggests.
      </p>

      <form v-if="editingHeight" class="card inline-form" @submit.prevent="saveHeight">
        <label :for="heightUnitDraft === 'in' ? 'edit-height-ft' : 'edit-height-cm'">Height</label>
        <div class="field-row">
          <template v-if="heightUnitDraft === 'in'">
            <input id="edit-height-ft" v-model.number="heightFeetDraft" type="number" inputmode="numeric" placeholder="5" @focus="selectInputText" />
            <span class="unit-label">ft</span>
            <input v-model.number="heightInchesDraft" type="number" inputmode="numeric" aria-label="Inches" placeholder="10" @focus="selectInputText" />
            <span class="unit-label">in</span>
          </template>
          <input v-else id="edit-height-cm" v-model.number="heightCmDraft" type="number" inputmode="numeric" placeholder="180" @focus="selectInputText" />
          <div role="group" aria-label="Height unit" class="unit-toggle">
            <button type="button" :class="{ active: heightUnitDraft === 'in' }" :aria-pressed="heightUnitDraft === 'in'" @click="heightUnitDraft = 'in'">ft</button>
            <button type="button" :class="{ active: heightUnitDraft === 'cm' }" :aria-pressed="heightUnitDraft === 'cm'" @click="heightUnitDraft = 'cm'">cm</button>
          </div>
        </div>
        <div class="inline-actions">
          <button type="submit">Save</button>
          <button type="button" class="ghost" @click="editingHeight = false">Cancel</button>
        </div>
      </form>

      <div v-if="chartPoints.length >= 2" class="card">
        <div class="tile-head">
          <span class="tile-label">Weight trend</span>
          <span v-if="trend" class="trend-chip">{{ trend.text }}</span>
        </div>
        <BodyWeightChart :points="chartPoints" :unit="chartUnit" />
      </div>
    </template>

    <BodyMeasurementsCard v-if="bodyWeight.fetched" />

    <div class="card reminders-card">
      <span class="tile-label">Reminders</span>
      <div class="reminder-row">
        <div class="reminder-text">
          <span class="reminder-title">Ask when my weight is missing</span>
          <span class="row-sub">When logging bodyweight or assisted exercises</span>
        </div>
        <button
          type="button"
          class="toggle"
          :class="{ on: !profile.missingWeightPromptOptOut }"
          :aria-pressed="!profile.missingWeightPromptOptOut"
          aria-label="Ask when my weight is missing"
          @click="toggleMissingWeightPrompt"
        >
          <span class="toggle-knob" />
        </button>
      </div>

      <div class="reminder-cadence">
        <div class="reminder-text">
          <span class="reminder-title">Weigh-in reminder</span>
          <span class="row-sub">{{ nextReminderText }}</span>
        </div>
        <div role="group" aria-label="Weigh-in reminder frequency" class="cadence-group">
          <button type="button" :class="{ active: profile.weightReminder === 'weekly' }" :aria-pressed="profile.weightReminder === 'weekly'" @click="setCadence('weekly')">Weekly</button>
          <button type="button" :class="{ active: profile.weightReminder === 'monthly' }" :aria-pressed="profile.weightReminder === 'monthly'" @click="setCadence('monthly')">Monthly</button>
          <button type="button" :class="{ active: profile.weightReminder === 'off' }" :aria-pressed="profile.weightReminder === 'off'" @click="setCadence('off')">Off</button>
        </div>
      </div>
    </div>

    <button v-if="!showEmptyState" type="button" class="see-all-link" @click="viewingAllWeighIns = true">
      See all weigh-ins
    </button>

    <WeighInHistory v-if="viewingAllWeighIns" @dismiss="viewingAllWeighIns = false" />
  </div>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
}

.error {
  color: var(--danger);
}

.dim {
  color: var(--text-dim);
}

.row-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.tile-label {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 12px;
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

.empty-form {
  display: flex;
  flex-direction: column;
}

.empty-bunny {
  align-self: center;
  height: 150px;
  width: auto;
  margin-bottom: 8px;
}

.empty-title {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 800;
}

.weight-card,
.reminders-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.weight-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.big {
  font-family: var(--font-display);
  font-size: 2.6rem;
  font-weight: 800;
  line-height: 1;
}

.medium {
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 800;
  line-height: 1.1;
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 8px;
}

.small-card {
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.small-card.dashed {
  border-style: dashed;
}

.tile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.icon-button {
  width: 32px;
  height: 32px;
  min-height: auto;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.bmi-pill {
  align-self: flex-start;
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--highlight) 16%, transparent);
  color: var(--highlight);
  font-size: 0.7rem;
  font-weight: 800;
}

.bmi-note {
  margin: -8px 2px 16px;
  font-size: 0.75rem;
  color: var(--text-dim);
}

.inline-form {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
}

.inline-actions {
  display: flex;
  gap: 8px;
}

.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.trend-chip {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text);
}

.reminder-row,
.reminder-cadence {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.reminder-cadence {
  flex-direction: column;
  align-items: stretch;
}

.reminder-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.reminder-title {
  font-size: 0.9rem;
  font-weight: 600;
}

.toggle {
  flex-shrink: 0;
  width: 48px;
  height: 28px;
  min-height: 0;
  padding: 3px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: flex;
  justify-content: flex-start;
}

.toggle.on {
  background: var(--accent);
  border-color: var(--accent);
  justify-content: flex-end;
}

.toggle-knob {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--text);
}

.toggle.on .toggle-knob {
  background: var(--accent-text);
}

.cadence-group {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.cadence-group button {
  min-height: 36px;
  padding: 0 4px;
  border-radius: 9px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 0.8rem;
  font-weight: 700;
}

.cadence-group button.active {
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 800;
}

.see-all-link {
  display: block;
  margin: 4px auto 0;
  min-height: 44px;
  padding: 0 12px;
  background: transparent;
  border: none;
  color: var(--accent);
  font-weight: 700;
}
</style>
