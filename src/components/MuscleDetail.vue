<script setup lang="ts">
// Issue #40: one muscle over time (screen 3 of docs/design/issue-40-muscle-groups.html).
// Weekly sets as bars (the in-progress week lighter) with a dashed line at
// the average of the range's complete weeks, then the exercises that made up
// this week's count.
// Issue #50 (docs/design/issue-50-muscle-metrics.html): a Sets / Volume /
// Time switch on top of the card; everything on the screen follows it. A
// metric only shows when the muscle has data for it, and with Sets alone the
// switch is hidden.
// Issue #582 (docs/design/issue-582-muscle-weeks.html): tap a week's bar and
// the headline and the list follow that week; How? under the average shows
// its sum; the list ends with "This looks wrong" (#574).
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { startOfWeek } from '../lib/progressHub'
import { openNumberReport } from '../lib/accountSheet'
import { numberReportText } from '../lib/bugReport'
import {
  availableMetrics,
  completeWeekAverage,
  completeWeekSum,
  countsForWeek,
  earliestWeek,
  formatSets,
  formatTime,
  formatVolume,
  muscleContributions,
  muscleWeekBars,
  MUSCLE_RANGES,
  TARGET_SETS,
  volumeUnit,
  weekKey,
  weeklyMuscleTotals,
  type MuscleMetric,
  type MuscleRange,
} from '../lib/muscleVolume'
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_TINTS, MUSCLE_GROUPS, type MuscleGroup } from '../lib/muscleGroups'
import MuscleBadge from './MuscleBadge.vue'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'

const route = useRoute()
const router = useRouter()
const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()

const group = computed(() => {
  const g = route.params.group
  return typeof g === 'string' && (MUSCLE_GROUPS as string[]).includes(g) ? (g as MuscleGroup) : null
})

watchEffect(() => {
  if (route.name === 'muscle-detail' && !group.value) router.replace({ name: 'muscle-progress' })
})

onMounted(() => {
  if (!workout.progressSetsFetched) workout.fetchProgressSets()
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
  // Bodyweight/assisted volume needs body weight. A failed fetch still lets
  // the screen render; those sets just add no volume.
  if (bodyWeight.fetched) bodyWeightReady.value = true
  else bodyWeight.fetchEntries().finally(() => (bodyWeightReady.value = true))
})

const bodyWeightReady = ref(false)
const range = ref<MuscleRange>('12W')
const chosenMetric = ref<MuscleMetric>('sets')
const tint = computed(() => (group.value ? MUSCLE_GROUP_TINTS[group.value] : 'var(--text-dim)'))
const label = computed(() => (group.value ? MUSCLE_GROUP_LABELS[group.value] : ''))

const metrics = computed<MuscleMetric[]>(() =>
  group.value ? availableMetrics(workout.progressSets, exercises.exercises, group.value, bodyWeight.entries) : ['sets'],
)
const metric = computed<MuscleMetric>(() => (metrics.value.includes(chosenMetric.value) ? chosenMetric.value : 'sets'))
const unit = computed(() =>
  group.value ? (profile.weightUnit ?? volumeUnit(workout.progressSets, exercises.exercises, group.value, bodyWeight.entries)) : profile.defaultWeightUnit,
)

const weeks = computed(() => weeklyMuscleTotals(workout.progressSets, exercises.exercises, metric.value, bodyWeight.entries))
const thisWeek = computed(() => (group.value ? countsForWeek(weeks.value, startOfWeek())[group.value] : 0))
const bars = computed(() =>
  group.value ? muscleWeekBars(weeks.value, group.value, range.value, earliestWeek(workout.progressSets)) : [],
)
const average = computed(() => completeWeekAverage(bars.value))
const sum = computed(() => completeWeekSum(bars.value))
const showHow = ref(false)

// The past week the user tapped, by week key; null shows this week. It
// survives a metric switch, and drops when a range change hides its bar.
const pickedKey = ref<string | null>(null)
const picked = computed(() => bars.value.find((b) => !b.current && weekKey(b.week) === pickedKey.value) ?? null)
watch(bars, () => {
  if (pickedKey.value && !picked.value) pickedKey.value = null
})
const shownValue = computed(() => (picked.value ? picked.value.value : thisWeek.value))

function pickWeek(bar: { week: Date; current: boolean }) {
  const key = weekKey(bar.week)
  pickedKey.value = bar.current || key === pickedKey.value ? null : key
}

const contributions = computed(() =>
  group.value
    ? muscleContributions(
        workout.progressSets,
        exercises.exercises,
        group.value,
        picked.value?.week ?? startOfWeek(),
        metric.value,
        bodyWeight.entries,
      )
    : [],
)

const METRIC_LABELS: Record<MuscleMetric, string> = { sets: 'Sets', volume: 'Volume', time: 'Time' }

// The number alone: "4.5", "12,450", "6:30".
function amountText(n: number): string {
  if (metric.value === 'volume') return formatVolume(n, unit.value)
  if (metric.value === 'time') return formatTime(n)
  return formatSets(n)
}

// With its unit where it has one: "9 sets", "12,450 lb", "6:30".
function amountWithUnit(n: number): string {
  if (metric.value === 'volume') return `${formatVolume(n, unit.value)} ${unit.value}`
  if (metric.value === 'time') return formatTime(n)
  return `${formatSets(n)} ${n === 1 ? 'set' : 'sets'}`
}

const bigUnit = computed(() => {
  if (metric.value === 'volume') return unit.value
  if (metric.value === 'sets') return shownValue.value === 1 ? 'set' : 'sets'
  return ''
})

function averageText(n: number): string {
  if (metric.value === 'volume') return `${formatVolume(n, unit.value)} ${unit.value}`
  if (metric.value === 'time') return formatTime(n)
  return formatAverage(n)
}

function creditText(c: { main: boolean; usesBodyWeight: boolean; sets: number; amount: number; days: Date[] }): string {
  const days = ` · ${c.days.map(shortDate).join(', ')}`
  if (c.main) return (metric.value === 'volume' && c.usesBodyWeight ? 'main muscle · body weight' : 'main muscle') + days
  const what = metric.value === 'sets' ? `${c.sets} ${c.sets === 1 ? 'set' : 'sets'}` : amountWithUnit(c.amount)
  return `also works ${label.value.toLowerCase()} · ${what} × ½${days}`
}

const EMPTY_WORDS: Record<MuscleMetric, string> = { sets: 'sets', volume: 'volume', time: 'time' }

const AVERAGE_LABELS: Record<MuscleRange, string> = {
  '4W': '4-week average',
  '12W': '12-week average',
  '1Y': '1-year average',
  All: 'All-time average',
}
const RANGE_WORDS: Record<MuscleRange, string> = { '4W': '4 weeks', '12W': '12 weeks', '1Y': '1 year', All: 'all time' }

// Chart geometry, same box as the mockup's SVG.
const W = 326
const H = 140
const TOP = 12
// Issue #135: the Sets chart always reaches past the 10 to 20 band.
const showBand = computed(() => metric.value === 'sets')
const scaleMax = computed(() =>
  Math.max(showBand.value ? TARGET_SETS.max * 1.2 : 1, ...bars.value.map((b) => b.value), average.value ?? 0),
)
function y(v: number): number {
  return H - 4 - (v / scaleMax.value) * (H - TOP - 4)
}
const rects = computed(() => {
  const n = bars.value.length
  const gap = Math.min(6, (W / n) * 0.3)
  const bw = (W - gap * (n - 1)) / n
  return bars.value.map((b, i) => ({
    key: i,
    bar: b,
    x: i * (bw + gap),
    y: y(b.value),
    w: bw,
    h: H - 4 - y(b.value),
    current: b.current,
    picked: picked.value === b,
    // The tap area: the bar's slot across the chart's full height.
    left: `${((i * (bw + gap)) / W) * 100}%`,
    width: `${((i === n - 1 ? bw : bw + gap) / W) * 100}%`,
  }))
})

function barLabel(b: { week: Date; value: number; current: boolean }): string {
  return b.current ? `This week: ${amountWithUnit(b.value)} so far` : `Week of ${shortDate(b.week)}: ${amountWithUnit(b.value)}`
}

// "21 sets in the 11 full weeks shown ÷ 11 =" and "1.9 a week".
const howSum = computed(() => {
  const { total, weeks } = sum.value
  return `${amountWithUnit(total)} in the ${weeks} full ${weeks === 1 ? 'week' : 'weeks'} shown ÷ ${weeks} =`
})

function reportWeek() {
  const when = picked.value ? `week of ${shortDate(picked.value.week)}` : 'this week'
  openNumberReport(
    numberReportText({
      screen: `Muscle groups › ${label.value} › ${METRIC_LABELS[metric.value]}`,
      shown: `${amountWithUnit(shownValue.value)}, ${when}`,
      from: contributions.value.length
        ? contributions.value.map((c) => `${c.name}: ${amountWithUnit(c.credited)} (${creditText(c)})`).join('. ')
        : 'nothing counted',
      rule: 'A set counts 1 for its main muscle and ½ for each "also works" muscle. Weeks start Sunday.',
      extra:
        average.value !== null
          ? [`${AVERAGE_LABELS[range.value]}: ${howSum.value} ${averageText(average.value)} a week (empty weeks count as 0)`]
          : [],
      unit: metric.value === 'volume' ? unit.value : undefined,
    }),
  )
}

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// First, middle, and last week, like the mockup's three axis labels.
const axisLabels = computed(() => {
  const b = bars.value
  if (b.length === 0) return []
  const idx = [...new Set([0, Math.floor((b.length - 1) / 2), b.length - 1])]
  return idx.map((i) => shortDate(b[i].week))
})

const chartAria = computed(
  () =>
    `${label.value} ${EMPTY_WORDS[metric.value]} per week over ${RANGE_WORDS[range.value]}, ${amountWithUnit(thisWeek.value)} this week so far`,
)

function formatAverage(n: number): string {
  return String(Math.round(n * 10) / 10)
}
</script>

<template>
  <div v-if="group" class="muscle-detail" :style="{ '--c': tint }">
    <router-link :to="{ name: 'muscle-progress' }" class="back-link" aria-label="Back to Muscle groups"><span aria-hidden="true">‹</span>Muscle groups</router-link>
    <PageHeader :title="label">
      <template #before><MuscleBadge :group="group" class="head-badge" /></template>
    </PageHeader>

    <SkeletonRows v-if="!workout.progressSetsFetched || !exercises.fetched || !bodyWeightReady" :rows="3" />
    <template v-else>
      <div class="card">
        <div v-if="metrics.length > 1" class="metrics" role="group" aria-label="Chart metric">
          <button
            v-for="m in metrics"
            :key="m"
            type="button"
            :class="{ active: m === metric }"
            :aria-pressed="m === metric"
            @click="chosenMetric = m"
          >
            {{ METRIC_LABELS[m] }}
          </button>
        </div>
        <div class="k" data-testid="muscle-week-k">
          <template v-if="picked">{{ METRIC_LABELS[metric] }} · week of {{ shortDate(picked.week) }}</template>
          <template v-else>{{ METRIC_LABELS[metric] }} this week</template>
        </div>
        <div class="bign" data-testid="muscle-this-week">{{ amountText(shownValue) }}<small v-if="bigUnit">&nbsp;{{ bigUnit }}</small></div>
        <p class="sub">
          <template v-if="average !== null">
            <span data-testid="muscle-average">{{ AVERAGE_LABELS[range] }}: {{ averageText(average) }} a week</span>
            <button type="button" class="how" :aria-expanded="showHow" aria-controls="muscle-how" @click="showHow = !showHow">How?</button>
          </template>
          <template v-else>No full weeks yet</template>
        </p>
        <p v-if="showHow && average !== null" id="muscle-how" class="how-box" data-testid="muscle-how">
          {{ howSum }} <b>{{ averageText(average) }} a week</b>
          <span>Weeks with no {{ label.toLowerCase() }} work count as 0.</span>
        </p>
        <div class="chart-wrap">
          <svg class="chart" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="chartAria">
            <path
              v-if="showBand"
              data-testid="target-band"
              :d="`M0 ${y(TARGET_SETS.max)} H${W} V${y(TARGET_SETS.min)} H0 Z`"
              class="band"
            />
            <rect
              v-for="r in rects"
              :key="r.key"
              :x="r.x"
              :y="r.y"
              :width="r.w"
              :height="r.h"
              rx="4"
              class="bar"
              :class="{ picked: r.picked }"
              :opacity="r.current ? 0.5 : 1"
            />
            <line v-if="average !== null" x1="0" :x2="W" :y1="y(average)" :y2="y(average)" class="avg" />
            <line x1="0" :x2="W" :y1="H - 4" :y2="H - 4" class="base" />
          </svg>
          <button
            v-for="r in rects"
            :key="`hit-${r.key}`"
            type="button"
            class="bar-hit"
            :style="{ left: r.left, width: r.width }"
            :aria-label="barLabel(r.bar)"
            :aria-pressed="r.current ? !picked : r.picked"
            @click="pickWeek(r.bar)"
          ></button>
        </div>
        <div class="axis">
          <span v-for="(l, i) in axisLabels" :key="i">{{ l }}</span>
        </div>
        <p v-if="showBand" class="band-note" data-testid="band-label">
          <span class="swatch" aria-hidden="true"></span><b>{{ TARGET_SETS.min }}–{{ TARGET_SETS.max }} sets</b>
          <span class="why">Why {{ TARGET_SETS.min }} to {{ TARGET_SETS.max }}? It's a common weekly target for building muscle.</span>
        </p>
        <div class="ranges" role="group" aria-label="Chart range">
          <button
            v-for="r in MUSCLE_RANGES"
            :key="r"
            type="button"
            :class="{ active: r === range }"
            :aria-pressed="r === range"
            @click="range = r"
          >
            {{ r }}
          </button>
        </div>
      </div>

      <div class="list-head">
        <div class="section-label" data-testid="muscle-list-title">{{ picked ? `Week of ${shortDate(picked.week)}` : 'This week' }}</div>
        <button v-if="picked" type="button" class="back-week" @click="pickedKey = null">Back to this week</button>
      </div>
      <p v-if="contributions.length === 0" class="empty">
        <template v-if="picked">No {{ label.toLowerCase() }} {{ EMPTY_WORDS[metric] }} that week.</template>
        <template v-else>No {{ label.toLowerCase() }} {{ EMPTY_WORDS[metric] }} yet this week.</template>
      </p>
      <ul v-else class="ex-list">
        <li v-for="c in contributions" :key="c.exerciseId" class="exrow">
          <span class="ex-text">
            <span class="ex-name">{{ c.name }}</span>
            <small>{{ creditText(c) }}</small>
          </span>
          <span class="c">{{ amountText(c.credited) }}</span>
        </li>
      </ul>
      <button type="button" class="looks-wrong" @click="reportWeek">
        <span class="looks-wrong-icon" aria-hidden="true">!</span>This looks wrong
      </button>
    </template>
  </div>
</template>

<style scoped>
.head-badge.muscle-badge {
  width: 42px;
  height: 42px;
}

.card {
  margin-bottom: 14px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

/* A segmented control, so it reads differently from the range pills below
   the chart. */
.metrics {
  display: flex;
  margin-bottom: 12px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
}

.metrics button {
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

.metrics button.active {
  background: var(--c);
  color: var(--accent-text);
}

.k {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.bign {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--c);
}

.bign small {
  font-size: 1rem;
}

.sub {
  margin: 0 0 8px;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.chart {
  display: block;
  width: 100%;
  height: 140px;
}

.bar {
  fill: var(--c);
}

.bar.picked {
  stroke: var(--text);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

/* Issue #582: one tap area per bar, the chart's full height (140px). */
.chart-wrap {
  position: relative;
}

.bar-hit {
  position: absolute;
  top: 0;
  height: 100%;
  min-height: 44px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
}

.bar-hit:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Inline in the average's line: the padding widens the tap area and the
   negative margin keeps the line its own height. */
.how {
  min-height: 0;
  margin: -12px -6px -12px -2px;
  padding: 12px 6px;
  background: none;
  border: none;
  color: var(--secondary);
  font-size: inherit;
  font-weight: 800;
}

.how-box {
  margin: 0 0 8px;
  padding: 8px 10px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  font-size: 0.74rem;
  line-height: 1.45;
}

.how-box span {
  display: block;
  color: var(--text-dim);
}

.band {
  fill: color-mix(in srgb, var(--text-dim) 10%, transparent);
}

.avg {
  stroke: var(--text-dim);
  stroke-width: 1.4;
  stroke-dasharray: 5 4;
  vector-effect: non-scaling-stroke;
}

.base {
  stroke: var(--border);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.band-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  margin: 6px 0 0;
  font-size: 0.7rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.swatch {
  width: 14px;
  height: 10px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--text-dim) 22%, transparent);
}

.band-note .why {
  flex-basis: 100%;
}

.axis {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 0.7rem;
  color: var(--text-dim);
}

.ranges {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.ranges button {
  flex: 1;
  min-height: 32px;
  padding: 0;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 0.74rem;
  font-weight: 800;
}

.ranges button.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.list-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.back-week {
  margin: 0 2px 8px;
  padding: 0;
  min-height: 32px;
  background: none;
  border: none;
  color: var(--secondary);
  font-size: 0.78rem;
  font-weight: 800;
}

.looks-wrong {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  min-height: 40px;
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

.section-label {
  margin: 4px 2px 8px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.ex-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.exrow {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  padding: 9px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 0.88rem;
  font-weight: 700;
}

.ex-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ex-name {
  overflow-wrap: anywhere;
}

.exrow small {
  margin-top: 1px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-dim);
}

.c {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-size: 1.05rem;
}

.empty {
  padding: 16px 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-dim);
}
</style>
