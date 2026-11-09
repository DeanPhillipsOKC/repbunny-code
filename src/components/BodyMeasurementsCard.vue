<script setup lang="ts">
// Issue #139: the Body screen's Measurements card, below the weigh-ins.
// Premium (feature key `progress`): free users get a blurred sample under
// PremiumPreviewPanel, like Balance; weigh-ins stay free. "How to measure"
// works for everyone.
import { computed, onMounted, ref, watch } from 'vue'
import { hasPremium } from '../lib/premium'
import {
  dateInputToIso,
  lengthUnitFor,
  readMeasureUnit,
  seriesFor,
  SITE_LABELS,
  siteSummaries,
  writeMeasureUnit,
  type SiteSummary,
} from '../lib/measurements'
import type { HeightUnit, MeasurementSite, MeasurementValues } from '../lib/types'
import { useMeasurementsStore } from '../stores/measurements'
import { useProfileStore } from '../stores/profile'
import BodyWeightChart from './BodyWeightChart.vue'
import MeasureGuideSheet from './MeasureGuideSheet.vue'
import MeasurementForm from './MeasurementForm.vue'
import MeasurementHistory from './MeasurementHistory.vue'
import PremiumMark from './PremiumMark.vue'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'
import TrialNote from './TrialNote.vue'

const measurements = useMeasurementsStore()
const profile = useProfileStore()

const unlocked = computed(() => hasPremium('progress'))
const previewing = ref(false)
const showingGuide = ref(false)
const showingHistory = ref(false)
const adding = ref(false)
const saving = ref(false)
const errorMessage = ref('')

onMounted(() => {
  if (unlocked.value && !measurements.fetched) measurements.fetchEntries()
})
watch(unlocked, (on) => {
  if (on && !measurements.fetched) measurements.fetchEntries()
})

// Follows the weight unit until the user picks one here.
const pickedUnit = ref<HeightUnit | null>(readMeasureUnit())
const unit = computed<HeightUnit>(() => pickedUnit.value ?? lengthUnitFor(profile.defaultWeightUnit))

function pickUnit(next: HeightUnit) {
  pickedUnit.value = next
  writeMeasureUnit(next)
}

const summaries = computed(() => siteSummaries(measurements.entries, unit.value))
const selectedSite = ref<MeasurementSite | null>(null)
const activeSite = computed<MeasurementSite | null>(() => {
  if (selectedSite.value && summaries.value.some((s) => s.site === selectedSite.value)) return selectedSite.value
  return summaries.value[0]?.site ?? null
})
const chartPoints = computed(() =>
  activeSite.value ? seriesFor(measurements.entries, activeSite.value, unit.value).map((p) => ({ recordedAt: p.recordedAt, weight: p.value })) : [],
)

function changeText(summary: SiteSummary): string {
  if (summary.change === null) return 'First entry'
  if (summary.change === 0) return 'No change'
  return `${summary.change > 0 ? '+' : '−'}${Math.abs(summary.change)} since first`
}

async function saveNew(values: MeasurementValues, entryUnit: HeightUnit, date: string) {
  saving.value = true
  errorMessage.value = ''
  const { error } = await measurements.addEntry(values, entryUnit, dateInputToIso(date))
  saving.value = false
  if (error) {
    errorMessage.value = error.message
    return
  }
  adding.value = false
  if (entryUnit !== unit.value) pickUnit(entryUnit)
}

// The preview's sample, never the user's numbers.
const SAMPLE = [
  { label: 'Waist', value: '33.5', change: '−1.5 since first' },
  { label: 'Chest', value: '41', change: '+1 since first' },
  { label: 'Arms', value: '14.5', change: '+0.5 since first' },
  { label: 'Thighs', value: '23', change: '+1 since first' },
]
</script>

<template>
  <section class="card measure-card" aria-labelledby="measure-card-title" data-testid="measurements-card">
    <div class="card-head">
      <h2 id="measure-card-title" class="tile-label">Measurements<PremiumMark v-if="!unlocked" /></h2>
      <button type="button" class="link-button" @click="showingGuide = true">How to measure</button>
    </div>

    <template v-if="unlocked">
      <TrialNote feature="progress" />
      <p v-if="errorMessage || measurements.errorMessage" class="error">{{ errorMessage || measurements.errorMessage }}</p>

      <template v-if="measurements.fetched && summaries.length > 0 && !adding">
        <div class="unit-row">
          <span class="row-sub">Tap one to see its trend.</span>
          <div role="group" aria-label="Show measurements in" class="unit-toggle">
            <button type="button" :class="{ active: unit === 'in' }" :aria-pressed="unit === 'in'" @click="pickUnit('in')">in</button>
            <button type="button" :class="{ active: unit === 'cm' }" :aria-pressed="unit === 'cm'" @click="pickUnit('cm')">cm</button>
          </div>
        </div>
        <div class="site-tiles">
          <button
            v-for="summary in summaries"
            :key="summary.site"
            type="button"
            class="site-tile"
            :class="{ active: activeSite === summary.site }"
            :aria-pressed="activeSite === summary.site"
            @click="selectedSite = summary.site"
          >
            <span class="site-label">{{ SITE_LABELS[summary.site] }}</span>
            <span class="site-value">{{ summary.latest }} <small>{{ unit }}</small></span>
            <span class="site-change">{{ changeText(summary) }}</span>
          </button>
        </div>
        <div v-if="activeSite" class="chart-block">
          <BodyWeightChart v-if="chartPoints.length >= 2" :points="chartPoints" :unit="unit" :label="SITE_LABELS[activeSite]" />
          <p v-else class="row-sub">Log {{ SITE_LABELS[activeSite].toLowerCase() }} again to see a trend.</p>
        </div>
      </template>
      <p v-else-if="measurements.fetched && !adding" class="row-sub intro">
        Track waist, chest, hips, arms, thighs, and neck. Fill in as many as you like each time.
      </p>

      <MeasurementForm
        v-if="adding"
        id-prefix="new-measure"
        title="New measurements"
        :unit="unit"
        :busy="saving"
        @save="saveNew"
        @cancel="adding = false"
      />
      <template v-else>
        <button type="button" class="btn-accent" @click="adding = true">Log measurements</button>
        <button v-if="measurements.entries.length > 0" type="button" class="see-all-link" @click="showingHistory = true">
          See all measurements
        </button>
      </template>
    </template>

    <template v-else>
      <p class="row-sub intro">Track waist, chest, hips, arms, thighs, and neck, with a chart for each.</p>
      <button v-if="!previewing" type="button" class="preview-button" @click="previewing = true">Preview</button>
      <div v-else class="preview">
        <div class="sample" aria-hidden="true">
          <div class="site-tiles">
            <div v-for="tile in SAMPLE" :key="tile.label" class="site-tile">
              <span class="site-label">{{ tile.label }}</span>
              <span class="site-value">{{ tile.value }} <small>in</small></span>
              <span class="site-change">{{ tile.change }}</span>
            </div>
          </div>
        </div>
        <div class="preview-overlay">
          <PremiumPreviewPanel
            feature="progress"
            title="Measurements are part of Premium"
            body="Weigh-ins, height, and BMI stay free."
            @back="previewing = false"
          />
        </div>
      </div>
    </template>

    <MeasureGuideSheet v-if="showingGuide" @dismiss="showingGuide = false" />
    <MeasurementHistory v-if="showingHistory" @dismiss="showingHistory = false" />
  </section>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
}

.measure-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tile-label {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.link-button {
  min-height: 32px;
  padding: 0 4px;
  background: transparent;
  border: none;
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 700;
}

.row-sub {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.intro {
  line-height: 1.45;
}

.error {
  margin: 0;
  color: var(--danger);
}

.unit-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.unit-toggle {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.unit-toggle button {
  min-height: 32px;
  width: 40px;
  padding: 0;
  border-radius: 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 0.8rem;
  font-weight: 700;
}

.unit-toggle button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.site-tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.site-tile {
  min-height: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  text-align: left;
}

.site-tile.active {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.site-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-dim);
}

.site-value {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1.15;
}

.site-value small {
  font-family: var(--font-body);
  font-size: 0.7rem;
  color: var(--text-dim);
}

.site-change {
  font-size: 0.68rem;
  color: var(--text-dim);
}

.chart-block {
  margin-top: 2px;
}

.see-all-link {
  align-self: center;
  min-height: 40px;
  padding: 0 12px;
  background: transparent;
  border: none;
  color: var(--accent);
  font-weight: 700;
}

.preview-button {
  align-self: flex-start;
  min-height: 40px;
  padding: 0 16px;
  background: transparent;
  border-color: var(--border);
  color: var(--text);
  font-size: 0.86rem;
  font-weight: 700;
}

.preview {
  position: relative;
}

.sample {
  filter: blur(4px);
  user-select: none;
  min-height: 190px;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
</style>
