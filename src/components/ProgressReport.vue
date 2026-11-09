<script setup lang="ts">
// Issue #134: the monthly report and year recap (Premium), opened from the
// Progress hub's "<Month> report" tile. One finished month (or year) at a
// time, each number next to the one before it in neutral colors: a lighter
// month is just a lighter month. Without Premium it's a blurred preview with
// Keep it with Premium / Go back, the same panel as lift analytics (#132).
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { hasPremium } from '../lib/premium'
import {
  buildReport,
  changeLabel,
  earliestPeriod,
  hasHistoryBefore,
  isComplete,
  lastFullMonth,
  lastFullYear,
  monthName,
  parsePeriod,
  periodLabel,
  periodQuery,
  periodEnd,
  periodStart,
  shiftPeriod,
  type ReportPeriod,
} from '../lib/progressReport'
import { MUSCLE_GROUP_LABELS } from '../lib/muscleGroups'
import { formatSets } from '../lib/muscleVolume'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'
import MuscleBadge from './MuscleBadge.vue'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'
import TrialNote from './TrialNote.vue'
import ShareReportSheet from './ShareReportSheet.vue'
import { buildCoachReport, reportFileName, type ShareRange } from '../lib/coachReport'
import { deliverFile } from '../lib/backup'

const route = useRoute()
const router = useRouter()
const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()

// A Monthly reports trial pass (#155) counts as Premium here.
const isPremium = computed(() => hasPremium('reports'))

onMounted(() => {
  workout.fetchProgressSets()
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
  if (!bodyWeight.fetched) bodyWeight.fetchEntries()
})

const ready = computed(() => workout.progressSetsFetched && exercises.fetched && bodyWeight.fetched)

// A workout still in progress joins once it's finished, like Milestones.
const rows = computed(() => workout.progressSets.filter((s) => s.workout_id !== workout.activeWorkoutId))

// Only finished periods; anything else in the URL falls back to the month
// that just ended.
const period = computed<ReportPeriod>(() => {
  const parsed = parsePeriod(route.query)
  return parsed && isComplete(parsed) ? parsed : lastFullMonth()
})

const yearOffered = computed(() => hasHistoryBefore(rows.value, lastFullYear()))

const earliest = computed(() => earliestPeriod(rows.value, period.value.kind))
const canGoBack = computed(
  () => !!earliest.value && periodStart(period.value).getTime() > periodStart(earliest.value).getTime(),
)
const canGoForward = computed(() => isComplete(shiftPeriod(period.value, 1)))

function go(p: ReportPeriod) {
  router.replace({ name: 'progress-report', query: periodQuery(p) })
}

function setKind(kind: ReportPeriod['kind']) {
  if (kind === period.value.kind) return
  go(kind === 'year' ? lastFullYear() : lastFullMonth())
}

const report = computed(() =>
  buildReport(rows.value, exercises.exercises, bodyWeight.entries, period.value, profile.weightUnit),
)

const title = computed(() =>
  period.value.kind === 'year' ? `${period.value.year} recap` : `${monthName(period.value)} report`,
)

const previousName = computed(() => {
  const p = shiftPeriod(period.value, -1)
  return p.kind === 'year' ? String(p.year) : monthName(p)
})

// Nothing to compare with before the first logged workout.
const hasPrevious = computed(() => hasHistoryBefore(rows.value, shiftPeriod(period.value, -1)))

const noun = computed(() => (period.value.kind === 'year' ? 'year' : 'month'))

function minutes(seconds: number): number {
  return Math.round(seconds / 60)
}

interface Stat {
  key: string
  label: string
  value: string
  unit: string
  change: string
}

const stats = computed<Stat[]>(() => {
  const { stats: now, previous: before, unit } = report.value
  const n = (v: number) => Math.round(v).toLocaleString('en-US')
  const list: Stat[] = [
    { key: 'workouts', label: 'Workouts', value: n(now.workouts), unit: '', change: changeLabel(now.workouts, before.workouts) },
    { key: 'sets', label: 'Sets', value: n(now.sets), unit: '', change: changeLabel(now.sets, before.sets) },
  ]
  if (now.volume !== null || before.volume !== null) {
    list.push({
      key: 'volume',
      label: 'Volume',
      value: n(now.volume ?? 0),
      unit,
      change: changeLabel(now.volume ?? 0, before.volume ?? 0, (v) => `${n(v)} ${unit}`),
    })
  }
  if (now.timedSeconds > 0 || before.timedSeconds > 0) {
    list.push({
      key: 'time',
      label: 'Timed sets',
      value: n(minutes(now.timedSeconds)),
      unit: 'min',
      change: changeLabel(minutes(now.timedSeconds), minutes(before.timedSeconds), (v) => `${n(v)} min`),
    })
  }
  list.push({ key: 'records', label: 'Records', value: n(now.records), unit: '', change: changeLabel(now.records, before.records) })
  return list
})

const VISIBLE_RECORDS = 10
const showAllRecords = ref(false)
const visibleRecords = computed(() =>
  showAllRecords.value ? report.value.records : report.value.records.slice(0, VISIBLE_RECORDS),
)

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function setsWord(n: number): string {
  return n === 1 ? 'set' : 'sets'
}

function goBack() {
  router.push({ name: 'progress' })
}

// Issue #152: Share as PDF, for a coach or physio.
const shareOpen = ref(false)
const sharing = ref(false)
const shareError = ref('')
const shareRange = computed<ShareRange>(() => ({ start: periodStart(period.value), end: periodEnd(period.value) }))
const sharePeriodName = computed(() => (period.value.kind === 'year' ? String(period.value.year) : periodLabel(period.value)))

function openShare() {
  shareError.value = ''
  shareOpen.value = true
}

async function shareReport(range: ShareRange, withSets = false) {
  if (!isPremium.value || sharing.value) return
  sharing.value = true
  shareError.value = ''
  try {
    const coach = buildCoachReport(rows.value, exercises.exercises, bodyWeight.entries, range, profile.weightUnit, { withSets })
    const { renderReportPdf } = await import('../lib/reportPdf')
    const pdf = await renderReportPdf(coach)
    if (await deliverFile(reportFileName(range), 'application/pdf', pdf)) shareOpen.value = false
  } catch (e) {
    shareError.value = `Couldn't make the PDF. ${e instanceof Error ? e.message : ''}`.trim()
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <div class="progress-report">
    <router-link :to="{ name: 'progress' }" class="back-link" aria-label="Back to Progress"><span aria-hidden="true">‹</span>Progress</router-link>
    <PageHeader :title="title" />
    <p class="page-lede">How the {{ noun }} went, next to the {{ noun }} before.</p>
    <button v-if="ready" type="button" class="share-pdf" @click="openShare">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </svg>
      Share as PDF
    </button>

    <TrialNote feature="reports" class="report-trial" />

    <SkeletonRows v-if="!ready" :rows="4" />
    <div v-else class="report-body" :class="{ previewing: !isPremium }">
      <div class="report-content" :class="{ blurred: !isPremium }" :inert="!isPremium" :aria-hidden="!isPremium || undefined">
        <div v-if="yearOffered" class="kinds" role="group" aria-label="Report length">
          <button type="button" :class="{ active: period.kind === 'month' }" :aria-pressed="period.kind === 'month'" @click="setKind('month')">Month</button>
          <button type="button" :class="{ active: period.kind === 'year' }" :aria-pressed="period.kind === 'year'" @click="setKind('year')">Year</button>
        </div>

        <div class="periodline">
          <button type="button" class="arrow" :aria-label="`Previous ${noun}`" :disabled="!canGoBack" @click="go(shiftPeriod(period, -1))">‹</button>
          <span class="period-text" aria-live="polite" data-testid="report-period">{{ periodLabel(period) }}</span>
          <button type="button" class="arrow" :aria-label="`Next ${noun}`" :disabled="!canGoForward" @click="go(shiftPeriod(period, 1))">›</button>
        </div>

        <p v-if="report.stats.workouts === 0" class="empty" data-testid="report-empty">
          No workouts logged in {{ periodLabel(period) }}. Any {{ noun }} is a fine one to start.
        </p>

        <template v-else>
          <ul class="stats" aria-label="Totals">
            <li v-for="s in stats" :key="s.key" class="stat" :data-testid="`report-stat-${s.key}`">
              <span class="stat-label">{{ s.label }}</span>
              <span class="stat-value" data-testid="report-stat-value">{{ s.value }}<small v-if="s.unit">&nbsp;{{ s.unit }}</small></span>
              <span v-if="hasPrevious" class="stat-change" data-testid="report-stat-change">{{ s.change }} <span class="vs">vs {{ previousName }}</span></span>
            </li>
          </ul>

          <section class="card" aria-labelledby="report-records-title">
            <h3 id="report-records-title">Records</h3>
            <p v-if="report.records.length === 0" class="card-empty">No new records this {{ noun }}.</p>
            <ul v-else class="list" data-testid="report-records">
              <li v-for="(r, i) in visibleRecords" :key="`${r.exerciseId}-${i}`" class="row" data-testid="report-record">
                <span class="row-name">{{ r.name }}</span>
                <span class="row-set">{{ r.set }}</span>
                <span class="row-date">{{ shortDate(r.performedAt) }}</span>
              </li>
            </ul>
            <button
              v-if="report.records.length > VISIBLE_RECORDS"
              type="button"
              class="more"
              @click="showAllRecords = !showAllRecords"
            >
              {{ showAllRecords ? 'Show fewer' : `Show all ${report.records.length} records` }}
            </button>
          </section>

          <section v-if="report.gains.length > 0" class="card" aria-labelledby="report-gains-title">
            <h3 id="report-gains-title">Biggest est. 1RM gains</h3>
            <ul class="list" data-testid="report-gains">
              <li v-for="g in report.gains" :key="g.exerciseId" class="row" data-testid="report-gain">
                <span class="row-name">{{ g.name }}</span>
                <span class="row-gain">+{{ g.gain.toLocaleString('en-US') }} {{ report.unit }}</span>
                <span class="row-date">now {{ g.best.toLocaleString('en-US') }}</span>
              </li>
            </ul>
          </section>

          <section v-if="report.muscles.length > 0" class="card" aria-labelledby="report-muscles-title">
            <h3 id="report-muscles-title">Most trained</h3>
            <ul class="list" data-testid="report-muscles">
              <li v-for="m in report.muscles" :key="m.group" class="row muscle-row" data-testid="report-muscle">
                <MuscleBadge :group="m.group" class="row-badge" />
                <span class="row-name">{{ MUSCLE_GROUP_LABELS[m.group] }}</span>
                <span class="row-set">{{ formatSets(m.sets) }} {{ setsWord(m.sets) }}</span>
                <span v-if="hasPrevious" class="row-date">{{ changeLabel(m.sets, m.previous, formatSets) }}</span>
              </li>
            </ul>
            <p class="card-note">"Also works" muscles count as half a set.</p>
          </section>
        </template>
      </div>
      <div v-if="!isPremium" class="report-overlay">
        <PremiumPreviewPanel
          feature="reports"
          title="Monthly reports are part of Premium"
          body="This week's numbers on Progress stay free."
          @back="goBack"
        />
      </div>
    </div>

    <ShareReportSheet
      v-if="shareOpen"
      :period-name="sharePeriodName"
      :period-range="shareRange"
      :locked="!isPremium"
      :busy="sharing"
      :error="shareError"
      @dismiss="shareOpen = false"
      @share="shareReport"
    />
  </div>
</template>

<style scoped>
.report-trial {
  margin-bottom: 12px;
}

.page-header {
  margin-bottom: 2px;
}

.page-lede {
  margin: 0 0 10px;
  color: var(--text-dim);
  font-size: 0.82rem;
  line-height: 1.4;
}

.share-pdf {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  margin: 0 0 14px;
  padding: 0 14px;
  border-radius: 999px;
  background: transparent;
  border-color: color-mix(in srgb, var(--secondary) 60%, var(--border));
  color: var(--secondary);
  font-size: 0.84rem;
  font-weight: 800;
}

.report-body {
  position: relative;
}

.report-body.previewing {
  min-height: 420px;
}

.report-content.blurred {
  filter: blur(6px);
  opacity: 0.7;
  user-select: none;
  pointer-events: none;
}

.report-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 72px;
}

.kinds {
  display: flex;
  margin-bottom: 10px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.kinds button {
  flex: 1;
  min-height: 32px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-size: 0.8rem;
  font-weight: 800;
}

.kinds button.active {
  background: var(--secondary);
  color: var(--accent-text);
}

.periodline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.arrow {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  display: grid;
  place-items: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-dim);
  font-size: 1.1rem;
  line-height: 1;
}

.arrow:disabled {
  opacity: 0.35;
}

.period-text {
  font-size: 0.9rem;
  font-weight: 800;
}

.empty {
  margin: 8px 0;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  color: var(--text-dim);
  font-size: 0.88rem;
}

.stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}

/* An odd tile out (no volume or no timed sets) takes the full row. */
.stat:last-child:nth-child(odd) {
  grid-column: 1 / -1;
}

.stat-label {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.stat-value {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text);
  overflow-wrap: anywhere;
}

.stat-value small {
  font-size: 0.85rem;
  color: var(--text-dim);
}

/* Neutral either way (brand: never --danger for a lighter month). */
.stat-change {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--text-dim);
}

.vs {
  font-weight: 600;
}

.card {
  margin-bottom: 12px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.card h3 {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
}

.card-empty,
.card-note {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-dim);
}

.card-note {
  margin-top: 8px;
  font-size: 0.74rem;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
  font-size: 0.86rem;
}

.row:first-child {
  border-top: none;
  padding-top: 0;
}

.muscle-row .row-badge {
  width: 30px;
  height: 30px;
  border-radius: 9px;
}

.row-name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.row-set,
.row-gain {
  flex-shrink: 0;
  font-weight: 800;
  color: var(--accent);
}

.row-date {
  flex-shrink: 0;
  min-width: 52px;
  text-align: right;
  font-size: 0.76rem;
  color: var(--text-dim);
}

.more {
  width: 100%;
  margin-top: 8px;
  min-height: 36px;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
  font-size: 0.82rem;
}
</style>
