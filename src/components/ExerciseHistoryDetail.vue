<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useExercisesStore } from '../stores/exercises'
import { useWorkoutsStore } from '../stores/workouts'
import { useProfileStore } from '../stores/profile'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { bestLevelSet, farthestDistanceByUnit, heaviestSetByUnit, leastAssistByUnit, longestDuration } from '../lib/exerciseHistory'
import {
  buildProgressSeries,
  filterByRange,
  isFlippedMetric,
  isFreeMetric,
  isFreeRange,
  PROGRESS_RANGES,
  METRIC_LABELS,
  metricFormatter,
  metricsFor,
  metricUnitLabel,
  type ChartPoint,
  type ProgressMetric,
  type ProgressPoint,
  type ProgressRange,
} from '../lib/progressSeries'
import { buildSessionTable, findRecordSetIds, SESSION_PAGE_SIZE, summarizeSession } from '../lib/sessionTable'
import { formatSecondsAsClock } from '../lib/timedInput'
import { libraryEntry } from '../lib/exerciseLibrary'
import HowToSection from './HowToSection.vue'
import SkeletonRows from './SkeletonRows.vue'
import ProgressChart from './ProgressChart.vue'
import OneRepMaxExplainer from './OneRepMaxExplainer.vue'
import RepRecords from './RepRecords.vue'
import { buildRepRecords, progressionFor } from '../lib/repRecords'
import { buildSmartTarget, decideLighterWeek, lighterWeekDecisions, targetsOffIds } from '../lib/smartTarget'
import { usesBarbell } from '../lib/plates'
import { hasPremium } from '../lib/premium'
import { flatSince, plateauTip } from '../lib/plateau'
import PremiumMark from './PremiumMark.vue'
import TrialNote from './TrialNote.vue'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'
import { eventsForExercise, storyLines } from '../lib/workoutEvents'
import { isWeightMetric, loggedLoad, METRIC_RULES, pointMath, previousLine, setMetricValue } from '../lib/pointReceipt'
import { numberReportText } from '../lib/bugReport'
import { openNumberReport } from '../lib/accountSheet'
import { explainRecord, ruleText, type RecordCheckRef } from '../lib/recordCheck'
import RecordCheckSheet from './RecordCheckSheet.vue'
import type { WeightUnit } from '../lib/types'
import type { ExerciseHistorySet } from '../lib/exerciseHistory'

// Backlog item 1: focused per-exercise history, opened from the Exercises
// tab (ExerciseList.vue) and the active logger (WorkoutLogger.vue) so the
// prior session for one exercise is findable without scanning the whole
// History timeline. A full-screen overlay rather than a route -- same
// pattern as RestTimer.vue/RecordCelebration.vue -- so opening it mid-workout
// doesn't unmount WorkoutLogger.vue and lose whatever's still unsaved in its
// local draft-row state.
// recordSetId (#579): open the record check for this set once history loads,
// for the Workout log's "PR set this workout".
const props = defineProps<{ exerciseId: string; recordSetId?: string | null }>()

const emit = defineEmits<{
  (e: 'dismiss'): void
}>()

const exercises = useExercisesStore()
const workout = useWorkoutsStore()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()

// `exercises.exercises` (not `activeExercises`) so an archived exercise
// still resolves to its name/notes here -- its past sets don't stop existing
// just because logging new ones against it is no longer offered.
const exercise = computed(() => exercises.exercises.find((e) => e.id === props.exerciseId) ?? null)

// Issue #39: an exercise added from (or matched to) the library gets its
// how-to steps.
const howToSteps = computed(() => {
  const libraryId = exercise.value?.library_id
  return libraryId ? (libraryEntry(libraryId)?.howTo ?? []) : []
})

const isLevelExercise =computed(() => exercise.value?.load_type === 'level')
// Backlog item 79: an assisted exercise's weight column is assist, not load —
// a rising number there is an easier set, not a "heaviest" one.
const isAssistedExercise = computed(() => exercise.value?.load_type === 'assisted')
// Backlog item 93: a timed exercise's weight column is always 0 -- none of
// the summaries above are meaningful for one. Item 94 adds its own
// Longest/Farthest summary below instead.
const isTimedExercise = computed(() => exercise.value?.load_type === 'timed')

// Backlog item 94: every timed set has a duration, so this is only null with
// no sets logged yet.
const longestSummary = computed(() => longestDuration(workout.exerciseHistory))

// Distance is optional per timed set -- a duration-only exercise (e.g. a
// plank) never shows a Farthest row.
const farthestSummary = computed(() => {
  const farthest = farthestDistanceByUnit(workout.exerciseHistory)
  return (Object.entries(farthest) as [string, number][]).sort(([a], [b]) => a.localeCompare(b))
})

const heaviestSummary = computed(() => {
  const heaviest = heaviestSetByUnit(workout.exerciseHistory)
  return (Object.entries(heaviest) as [string, number][]).sort(([a], [b]) => a.localeCompare(b))
})

// Backlog item 76: a level exercise's weight is always 0, so the "heaviest
// completed set" card above is meaningless for one — show its best level
// instead.
const bestLevel = computed(() => bestLevelSet(workout.exerciseHistory))

// Backlog item 79: least assist is the best set for an assisted exercise —
// showing "heaviest" here would present the easiest set as the achievement.
const leastAssistSummary = computed(() => {
  const least = leastAssistByUnit(workout.exerciseHistory)
  return (Object.entries(least) as [string, number][]).sort(([a], [b]) => a.localeCompare(b))
})

// Issue #21: the progress chart replaces the load type's summary card once
// there are 2+ sessions. With exactly 1, the summary stays and a card says
// when the chart starts.
const sessionCount = computed(() => workout.exerciseHistory.length)
const showChart = computed(() => sessionCount.value >= 2)

const metrics = computed(() => metricsFor(exercise.value?.load_type ?? 'weight', exercise.value?.tracks_distance ?? false))
// Issue #132: without Premium the chart opens on the load type's free metric
// (Heaviest for weight), and a locked metric or range is a blurred preview
// with Keep it with Premium / Go back. Losing Premium lands on the same
// preview, so nothing errors. A Lift progress trial pass (#155) counts too.
const progressOwned = computed(() => hasPremium('progress'))
const defaultMetric = (list: ProgressMetric[]) => (progressOwned.value ? list[0] : (list.find(isFreeMetric) ?? list[0]))
const metric = ref<ProgressMetric>(defaultMetric(metrics.value))
watch(
  metrics,
  (list) => {
    if (!list.includes(metric.value)) metric.value = defaultMetric(list)
  },
  { immediate: true },
)
const range = ref<ProgressRange>('3M')
const explainerOpen = ref(false)

const lockedMetric = computed(() => !progressOwned.value && !isFreeMetric(metric.value))
const lockedRange = computed(() => !progressOwned.value && !isFreeRange(range.value))
const chartPreview = computed(() => lockedMetric.value || lockedRange.value)
const lockedRanges = computed(() => (progressOwned.value ? [] : PROGRESS_RANGES.filter((r) => !isFreeRange(r))))

// Where Go back returns to: the last free metric and range picked.
const lastFreeMetric = ref(metric.value)
const lastFreeRange = ref(range.value)
watch(metric, (m) => {
  if (isFreeMetric(m)) lastFreeMetric.value = m
})
watch(range, (r) => {
  if (isFreeRange(r)) lastFreeRange.value = r
})

function leaveChartPreview() {
  if (lockedMetric.value) metric.value = metrics.value.includes(lastFreeMetric.value) ? lastFreeMetric.value : defaultMetric(metrics.value)
  if (lockedRange.value) range.value = lastFreeRange.value
}

const chartPreviewCopy = computed(() => {
  if (lockedMetric.value) {
    return {
      title: `${METRIC_LABELS[metric.value]} is part of Premium`,
      body: `${METRIC_LABELS[defaultMetric(metrics.value)]} over 1 or 3 months stays free.`,
    }
  }
  return {
    title: `${range.value === 'All' ? 'All time' : '1 year'} is part of Premium`,
    body: '1 and 3 months stay free.',
  }
})

const series = computed(() => buildProgressSeries(workout.exerciseHistory, metric.value, profile.weightUnit))

// Next-time target + best reps at each weight: weight exercises only; null
// (no cards) with no sets that have both weight and reps.
// The jump is derived from the gym's plates for a barbell (issue #60 cut
// the per-exercise jump and range).
const repRecords = computed(() => {
  const ex = exercise.value
  if (ex?.load_type !== 'weight') return null
  return buildRepRecords(workout.exerciseHistory, profile.weightUnit, progressionFor(profile.plates, usesBarbell(ex)))
})

// Issue #140: Premium's RPE-aware target, unless this exercise has Targets off.
const smartTarget = computed(() => {
  const ex = exercise.value
  if (!repRecords.value || !ex || !hasPremium('targets') || targetsOffIds.value.includes(ex.id)) return null
  // Issue #141: stalls and lighter weeks too.
  return buildSmartTarget(workout.exerciseHistory, 'weight', profile.weightUnit, progressionFor(profile.plates, usesBarbell(ex)), {
    flatSince: flatSince(ex.load_type, ex.tracks_distance, workout.exerciseHistory, profile.weightUnit),
    decision: lighterWeekDecisions.value[ex.id] ?? null,
  })
})

function chooseLighterWeek(accepted: boolean) {
  const ex = exercise.value
  if (ex && smartTarget.value) decideLighterWeek(ex.id, smartTarget.value, accepted)
}

// Issue #133: Premium's plateau call, under the chart whichever metric is up
// (flatness is judged on the default metric).
const plateauNote = computed(() => {
  const ex = exercise.value
  if (!progressOwned.value || !ex) return null
  const since = flatSince(ex.load_type, ex.tracks_distance, workout.exerciseHistory, profile.weightUnit)
  if (!since) return null
  const date = new Date(since).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `Flat since ${date}. ${plateauTip(ex.load_type)}`
})

const chartUnit = computed(() => metricUnitLabel(metric.value, series.value.unit))

function formatNumber(value: number, maxDigits: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDigits })
}

const chartFormat = computed(() => metricFormatter(metric.value))

// Weight metrics' chart unit, for a converted set's "(220.5 lb)" (#578).
const weightChartUnit = computed(() => (isWeightMetric(metric.value) ? (series.value.unit as WeightUnit | null) : null))

// The source set as it was logged, plus its conversion when the chart is in
// the other unit (#578).
function pointDetail(p: ProgressPoint): string | undefined {
  const s = p.set
  const load = loggedLoad(s, weightChartUnit.value)
  switch (metric.value) {
    case 'e1rm':
    case 'heaviest':
      return `${load} × ${s.reps}`
    case 'assist':
      return `${load} assist × ${s.reps}`
    case 'reps':
      return s.weight > 0 ? `${s.reps} reps, +${load}` : undefined
    case 'level':
      return `Level ${s.level} × ${s.reps}`
    case 'farthest':
      return s.duration_seconds !== null
        ? `${formatNumber(s.distance ?? 0, 2)} ${s.distance_unit} in ${formatSecondsAsClock(s.duration_seconds)}`
        : undefined
    default:
      return undefined
  }
}

// Issue #158: only the part of a session's story about this exercise.
const workoutIdByDate = computed(() => new Map(workout.exerciseHistory.map((w) => [w.performedAt, w.workoutId])))
function storyAt(performedAt: string): string[] {
  const ex = exercise.value
  const id = workoutIdByDate.value.get(performedAt)
  const events = id ? workout.workoutEvents[id] : undefined
  if (!ex || !events) return []
  return storyLines(eventsForExercise(events, ex, exercises.exercises), exercises.exercises)
}

// Issue #578: each point's receipt, the math and the session before it.
const workoutByDate = computed(() => new Map(workout.exerciseHistory.map((w) => [w.performedAt, w])))
const chartPoints = computed<ChartPoint[]>(() =>
  series.value.points.map((p, i) => ({
    performedAt: p.performedAt,
    value: p.value,
    detail: pointDetail(p),
    story: storyAt(p.performedAt),
    math: pointMath(p, metric.value, workoutByDate.value.get(p.performedAt), weightChartUnit.value),
    previous: previousLine(series.value.points, i, metric.value, chartUnit.value) ?? undefined,
  })),
)

// Issue #181: one card per session, sets in columns, the newest 10 until
// "Show older" (same pattern as What's new).
const loadType = computed(() => exercise.value?.load_type ?? 'weight')
const sessionsShown = ref(SESSION_PAGE_SIZE)
const visibleSessions = computed(() =>
  workout.exerciseHistory.slice(0, sessionsShown.value).map((entry) => ({
    entry,
    table: buildSessionTable(loadType.value, entry.sets),
    summary: summarizeSession(loadType.value, entry.sets),
  })),
)
const hasOlderSessions = computed(() => workout.exerciseHistory.length > sessionsShown.value)
const recordSetIds = computed(() => findRecordSetIds(loadType.value, workout.exerciseHistory, bodyWeight.entries))

// Issue #579: tap a set for its record check. "Open the record set" scrolls
// to the set it names and marks that row.
const recordCheckSetId = ref<string | null>(props.recordSetId ?? null)
const recordCheck = computed(() => {
  const id = recordCheckSetId.value
  const ex = exercise.value
  if (!id || !ex || workout.exerciseHistoryLoading) return null
  const progression = progressionFor(profile.plates, ex.load_type === 'weight' && usesBarbell(ex))
  return explainRecord(ex.load_type, workout.exerciseHistory, id, bodyWeight.entries, progression, progressOwned.value)
})
const jumpedSet = ref<{ workoutId: string; setId: string } | null>(null)

function openRecordCheck(setId: string) {
  if (loadType.value !== 'timed') recordCheckSetId.value = setId
}

async function scrollToSession(workoutId: string) {
  const index = workout.exerciseHistory.findIndex((w) => w.workoutId === workoutId)
  if (index < 0) return
  if (index >= sessionsShown.value) sessionsShown.value = Math.ceil((index + 1) / SESSION_PAGE_SIZE) * SESSION_PAGE_SIZE
  await nextTick()
  const card = document.querySelector<HTMLElement>(`[data-session="${workoutId}"]`)
  card?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  card?.focus({ preventScroll: true })
}

function openRecordSet(set: RecordCheckRef) {
  recordCheckSetId.value = null
  highlight.value = null
  jumpedSet.value = { workoutId: set.workoutId, setId: set.id }
  scrollToSession(set.workoutId)
}

// "This looks wrong" (#574) from the record check.
function reportRecordCheck() {
  const check = recordCheck.value
  if (!check) return
  openNumberReport(
    numberReportText({
      screen: `${exercise.value?.name ?? 'Exercise'} › Sessions › Record check`,
      shown: check.title,
      from: check.lines.map((l) => `${l.label}: ${l.math ? `${l.math} ` : ''}${l.total}${l.sub ? ` (${l.sub})` : ''}`).join('. '),
      rule: check.note ? `${ruleText(check.rule)} ${check.note}` : ruleText(check.rule),
      extra: [
        ...(check.toBeat.length ? [`To beat it: ${check.toBeat.join(' or ')}`] : []),
        ...(check.beatBy ? [`Beat it by: ${check.beatBy}`] : []),
        ...check.wins.map((w) => `${w.label}${w.over ? ` (${w.over})` : ''}: ${w.state === 'earned' ? `earned, ${w.value}` : w.value}`),
      ],
    }),
  )
  emit('dismiss')
}

// Issue #578: "See the sets ›" scrolls to the point's session card and
// highlights the set behind it (every counted set, for Volume). Est. 1RM and
// Volume add a column with each set's value while it's highlighted.
const highlight = ref<{ workoutId: string; setIds: Set<string>; sourceId: string; metric: ProgressMetric; performedAt: string } | null>(null)
watch(metric, () => {
  highlight.value = null
})

const highlightColumn = computed(() => {
  const m = highlight.value?.metric
  return m === 'e1rm' || m === 'volume' ? METRIC_LABELS[m] : null
})

function highlightValue(set: ExerciseHistorySet): string {
  const h = highlight.value
  const unit = series.value.unit as WeightUnit | null
  if (!h || !unit) return '–'
  const value = setMetricValue(h.metric, set, unit)
  return value === null ? '–' : metricFormatter(h.metric)(value)
}

async function showSets(point: ChartPoint) {
  const p = series.value.points.find((x) => x.performedAt === point.performedAt)
  const entry = workoutByDate.value.get(point.performedAt)
  if (!p || !entry) return
  const unit = series.value.unit as WeightUnit
  const setIds =
    metric.value === 'volume' ? entry.sets.filter((s) => setMetricValue('volume', s, unit) !== null).map((s) => s.id) : [p.set.id]
  highlight.value = { workoutId: entry.workoutId, setIds: new Set(setIds), sourceId: p.set.id, metric: metric.value, performedAt: p.performedAt }
  jumpedSet.value = null
  await scrollToSession(entry.workoutId)
}

// "This looks wrong" (#574): Report a bug, filled in with the point, its
// sets and the rule. The history sheet closes so the report is on top.
function reportPoint() {
  const h = highlight.value
  const p = h && series.value.points.find((x) => x.performedAt === h.performedAt)
  const entry = h && workoutByDate.value.get(h.performedAt)
  if (!h || !p || !entry) return
  const day = new Date(p.performedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const unit = chartUnit.value ? ` ${chartUnit.value}` : ''
  const others = entry.sets.filter((s) => s.id !== p.set.id).map((s) => loggedLoad(s, weightChartUnit.value) + (s.reps !== null ? ` × ${s.reps}` : ''))
  const math = pointMath(p, h.metric, entry, weightChartUnit.value)
  openNumberReport(
    numberReportText({
      screen: `${exercise.value?.name ?? 'Exercise'} › ${METRIC_LABELS[h.metric]} chart`,
      shown: `${metricFormatter(h.metric)(p.value)}${unit} on ${day}`,
      from: pointDetail(p),
      rule: math.length ? `${METRIC_RULES[h.metric]}. ${math.join('. ')}` : METRIC_RULES[h.metric],
      extra: others.length ? [`Other sets that day: ${others.join(', ')}`] : [],
      unit: p.converted ? `${series.value.unit} (includes converted sets)` : (series.value.unit ?? undefined),
    }),
  )
  emit('dismiss')
}

const OTHER_UNIT: Record<string, string> = { lb: 'kg', kg: 'lb', mi: 'km', km: 'mi' }

const conversionNote = computed(() => {
  const unit = series.value.unit
  if (!unit || !filterByRange(series.value.points, range.value).some((p) => p.converted)) return undefined
  return `Includes converted ${OTHER_UNIT[unit]} sets`
})

onMounted(() => {
  if (exercises.exercises.length === 0) exercises.fetchExercises()
  workout.fetchExerciseHistory(props.exerciseId)
  if (!workout.workoutEventsFetched) workout.fetchWorkoutEvents()
  if (!bodyWeight.fetched) bodyWeight.fetchEntries()
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  workout.clearExerciseHistory()
})

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('dismiss')
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
</script>

<template>
  <div
    class="history-overlay"
    role="dialog"
    aria-modal="true"
    :aria-label="`${exercise?.name ?? 'Exercise'} history`"
    @click.self="emit('dismiss')"
  >
    <div class="history-panel">
      <div class="history-header">
        <div class="history-heading">
          <h2>{{ exercise?.name ?? 'Exercise' }}</h2>
          <span v-if="exercise?.is_archived" class="tag-pill">Archived</span>
        </div>
        <button type="button" class="icon-button" aria-label="Close history" @click="emit('dismiss')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <TrialNote feature="progress" class="history-trial" />
      <TrialNote feature="targets" class="history-trial" />

      <HowToSection v-if="howToSteps.length > 0" :steps="howToSteps" class="history-how-to" />

      <div v-if="showChart" class="card chart-card">
        <div v-if="metrics.length > 1" class="metric-toggle" role="group" aria-label="Chart metric">
          <button
            v-for="m in metrics"
            :key="m"
            type="button"
            :class="{ active: m === metric }"
            :aria-pressed="m === metric"
            @click="metric = m"
          >
            {{ METRIC_LABELS[m] }}<PremiumMark v-if="!progressOwned && !isFreeMetric(m)" />
          </button>
        </div>
        <ProgressChart
          v-model:range="range"
          :points="chartPoints"
          :label="METRIC_LABELS[metric]"
          :unit="chartUnit"
          :format="chartFormat"
          :flipped="isFlippedMetric(metric)"
          :note="conversionNote"
          :blurred="chartPreview"
          :locked-ranges="lockedRanges"
          story-inline
          see-sets
          @see-sets="showSets"
        >
          <template v-if="metric === 'e1rm' && !chartPreview" #action>
            <button type="button" class="explain-link" @click="explainerOpen = true">
              <span class="explain-q" aria-hidden="true">?</span>What's est. 1RM?
            </button>
          </template>
          <template #overlay>
            <PremiumPreviewPanel
              feature="progress"
              :title="chartPreviewCopy.title"
              :body="chartPreviewCopy.body"
              @back="leaveChartPreview"
            />
          </template>
        </ProgressChart>
        <p v-if="plateauNote" class="plateau-note">{{ plateauNote }}</p>
      </div>
      <template v-else>
        <div v-if="isLevelExercise" class="card summary-card">
          <span class="summary-label">Best level</span>
          <div v-if="bestLevel" class="summary-values">
            <span class="summary-value">Level {{ bestLevel.level }} × {{ bestLevel.reps }}</span>
          </div>
        </div>
        <div v-else-if="isAssistedExercise && leastAssistSummary.length > 0" class="card summary-card">
          <span class="summary-label">Least assist</span>
          <div class="summary-values">
            <span v-for="[unit, weight] in leastAssistSummary" :key="unit" class="summary-value">
              {{ weight }}{{ unit }}
            </span>
          </div>
        </div>
        <div v-else-if="!isTimedExercise && heaviestSummary.length > 0" class="card summary-card">
          <span class="summary-label">Heaviest completed set</span>
          <div class="summary-values">
            <span v-for="[unit, weight] in heaviestSummary" :key="unit" class="summary-value">
              {{ weight }}{{ unit }}
            </span>
          </div>
        </div>
        <template v-else-if="isTimedExercise">
          <div v-if="longestSummary !== null" class="card summary-card">
            <span class="summary-label">Longest</span>
            <div class="summary-values">
              <span class="summary-value">{{ formatSecondsAsClock(longestSummary) }}</span>
            </div>
          </div>
          <div v-if="farthestSummary.length > 0" class="card summary-card">
            <span class="summary-label">Farthest</span>
            <div class="summary-values">
              <span v-for="[unit, distance] in farthestSummary" :key="unit" class="summary-value">
                {{ distance }} {{ unit }}
              </span>
            </div>
          </div>
        </template>
        <div v-if="sessionCount === 1" class="card trend-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 17 9 11 13 15 21 7" />
          </svg>
          <p><b>Log this one more time to see your trend.</b><br />Your chart starts after 2 sessions.</p>
        </div>
      </template>

      <RepRecords v-if="repRecords" :data="repRecords" :locked="!progressOwned" :smart="smartTarget" @lighter-week="chooseLighterWeek" />

      <SkeletonRows v-if="workout.exerciseHistoryLoading" :rows="2" />
      <p v-if="workout.exerciseHistoryError" class="error">{{ workout.exerciseHistoryError }}</p>
      <p v-if="!workout.exerciseHistoryLoading && workout.exerciseHistory.length === 0" class="empty">
        No sets logged for this exercise yet.
      </p>

      <template v-if="!workout.exerciseHistoryLoading && workout.exerciseHistory.length > 0">
        <h3 class="sessions-title">Sessions</h3>
        <ul class="history-list">
          <li
            v-for="{ entry, table, summary } in visibleSessions"
            :key="entry.workoutId"
            :class="['history-entry', { highlighted: highlight?.workoutId === entry.workoutId }]"
            :data-session="entry.workoutId"
            tabindex="-1"
          >
            <div class="session-head">
              <span class="session-date">{{ formatDate(entry.performedAt) }}</span>
              <span v-if="entry.templateName" class="session-template">{{ entry.templateName }}</span>
            </div>
            <p v-if="summary" class="session-summary">
              <span>{{ summary.label }} <b>{{ summary.value }}</b></span>
              <span>{{ summary.totals }}</span>
            </p>
            <table class="session-table">
              <thead>
                <tr>
                  <th v-for="col in table.columns" :key="col.key" scope="col" :class="`col-${col.key}`">{{ col.label }}</th>
                  <th v-if="highlightColumn && highlight?.workoutId === entry.workoutId" scope="col" class="col-point">{{ highlightColumn }}</th>
                  <th v-if="loadType !== 'timed'" class="col-mark"><span class="visually-hidden">Record</span></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, rowIndex) in table.rows"
                  :key="row.id"
                  :class="{
                    record: recordSetIds.has(row.id),
                    checkable: loadType !== 'timed',
                    source: (highlight?.workoutId === entry.workoutId && highlight.setIds.has(row.id)) || jumpedSet?.setId === row.id,
                  }"
                  @click="openRecordCheck(row.id)"
                >
                  <td v-for="(cell, i) in row.cells" :key="table.columns[i].key" :class="`col-${table.columns[i].key}`">
                    <button
                      v-if="i === 0 && loadType !== 'timed'"
                      type="button"
                      class="set-check"
                      :aria-label="`Record check for set ${rowIndex + 1}`"
                    >
                      {{ cell.value }}
                    </button>
                    <template v-else>{{ cell.value }}<span v-if="cell.unit" class="cell-unit">{{ cell.unit }}</span></template>
                  </td>
                  <td v-if="highlightColumn && highlight?.workoutId === entry.workoutId" class="col-point">
                    {{ highlightValue(entry.sets.find((s) => s.id === row.id)!) }}
                  </td>
                  <td v-if="loadType !== 'timed'" class="col-mark">
                    <svg v-if="recordSetIds.has(row.id)" viewBox="0 0 24 24" width="13" height="13" role="img" aria-label="Record">
                      <ellipse cx="12" cy="16" rx="5.5" ry="4.2" fill="var(--highlight)" />
                      <ellipse cx="6" cy="9" rx="2.1" ry="2.6" fill="var(--highlight)" />
                      <ellipse cx="11" cy="6.5" rx="2.1" ry="2.6" fill="var(--highlight)" />
                      <ellipse cx="16.2" cy="7.5" rx="2" ry="2.5" fill="var(--highlight)" />
                      <ellipse cx="19" cy="11.5" rx="1.8" ry="2.3" fill="var(--highlight)" />
                    </svg>
                  </td>
                </tr>
              </tbody>
            </table>
            <template v-if="highlight?.workoutId === entry.workoutId">
              <p class="point-note">
                <span class="this-point">This point</span>
                {{ highlight.metric === 'volume' ? 'Every set counted here adds to it.' : `Set ${entry.sets.findIndex((s) => s.id === highlight!.sourceId) + 1} is the one on the chart.` }}
              </p>
              <button type="button" class="looks-wrong" @click="reportPoint">
                <span class="looks-wrong-icon" aria-hidden="true">!</span>This looks wrong
              </button>
            </template>
          </li>
        </ul>
        <button v-if="hasOlderSessions" type="button" class="show-older" @click="sessionsShown += SESSION_PAGE_SIZE">Show older</button>
      </template>
    </div>
    <OneRepMaxExplainer v-if="explainerOpen" @dismiss="explainerOpen = false" />
    <RecordCheckSheet
      v-if="recordCheck"
      :check="recordCheck"
      :exercise-name="exercise?.name ?? 'Exercise'"
      @dismiss="recordCheckSetId = null"
      @open-set="openRecordSet"
      @report="reportRecordCheck"
    />
  </div>
</template>

<style scoped>
.history-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
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
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.history-heading h2 {
  margin: 0;
}

.history-trial {
  margin-bottom: 12px;
}

.history-how-to {
  margin-bottom: 20px;
}

.tag-pill {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 0.7rem;
  font-weight: 700;
}

.icon-button {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  min-height: auto;
  padding: 0;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 20px;
}

.chart-card {
  padding: 14px 14px 12px;
}

.metric-toggle {
  display: flex;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 11px;
  padding: 3px;
  margin-bottom: 12px;
}

.metric-toggle button {
  flex: 1;
  min-height: 34px;
  padding: 0 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font-size: 0.8rem;
  font-weight: 700;
}

.metric-toggle button.active {
  background: var(--accent);
  color: var(--accent-text);
}

.plateau-note {
  margin: 10px 0 0;
  padding: 9px 11px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  color: var(--text);
  font-size: 0.8rem;
  line-height: 1.45;
}

.explain-link {
  min-height: auto;
  padding: 2px 0;
  background: none;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--secondary);
  font-size: 0.76rem;
  font-weight: 700;
  white-space: nowrap;
}

.explain-q {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 1.5px solid var(--secondary);
  display: inline-grid;
  place-items: center;
  font-size: 0.6rem;
  font-weight: 800;
}

.trend-empty {
  text-align: center;
  padding: 26px 10px 18px;
  color: var(--text-dim);
}

.trend-empty svg {
  opacity: 0.5;
}

.trend-empty p {
  margin: 6px 0 0;
  font-size: 0.84rem;
}

.trend-empty b {
  color: var(--text);
}

.summary-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 6px;
}

.summary-values {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.summary-value {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--accent);
}

.error {
  color: var(--danger);
}

.empty {
  text-align: center;
  padding: 24px 0;
  color: var(--text-dim);
}

.sessions-title {
  margin: 0 0 8px;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-entry {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  min-width: 0;
}

.history-entry.highlighted {
  border-color: var(--highlight);
  outline: none;
}

.session-table tr.source td {
  background: color-mix(in srgb, var(--highlight) 14%, transparent);
}

.session-table tr.source td:first-child {
  box-shadow: inset 3px 0 0 var(--highlight);
  padding-left: 6px;
}

.session-table tr.checkable {
  cursor: pointer;
}

.set-check {
  min-height: auto;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  font-weight: inherit;
}

.session-table .col-point {
  color: var(--text);
}

.point-note {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.this-point {
  padding: 1px 8px;
  border: 1px solid var(--highlight);
  border-radius: 999px;
  color: var(--highlight);
  font-weight: 800;
  font-size: 0.7rem;
}

.looks-wrong {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 0.8rem;
  font-weight: 700;
}

.looks-wrong-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  display: inline-grid;
  place-items: center;
  font-size: 0.62rem;
  font-weight: 800;
}

.session-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.session-date {
  font-weight: 800;
  font-size: 0.88rem;
  white-space: nowrap;
}

.session-template {
  min-width: 0;
  color: var(--text-dim);
  font-size: 0.76rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 14px;
  margin: 6px 0 0;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.session-summary b {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  color: var(--accent);
}

.session-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-variant-numeric: tabular-nums;
}

.session-table th {
  padding: 0 0 4px;
  text-align: right;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
  white-space: nowrap;
}

.session-table td {
  padding: 6px 0 6px 8px;
  border-top: 1px solid var(--border);
  text-align: right;
  font-size: 0.86rem;
  white-space: nowrap;
}

.session-table th + th {
  padding-left: 8px;
}

.session-table .col-set {
  width: 34px;
  padding-left: 0;
  text-align: left;
}

.session-table td.col-set {
  color: var(--text-dim);
  font-weight: 700;
}

.session-table .col-mark {
  width: 21px;
}

.session-table .col-mark svg {
  display: block;
  margin-left: auto;
}

.cell-unit {
  margin-left: 2px;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.session-table tr.record td {
  color: var(--highlight);
  font-weight: 800;
}

.session-table tr.record .cell-unit {
  color: color-mix(in srgb, var(--highlight) 70%, transparent);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.show-older {
  width: 100%;
  margin-top: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  font-weight: 700;
}
</style>
