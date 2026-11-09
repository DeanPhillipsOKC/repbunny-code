<script setup lang="ts">
// Issue #137: the training calendar (Premium), opened from the Progress
// hub's tile (design docs/design/issue-137-training-calendar.html, option B).
// The last 12 months, one square per day, shaded by sets logged. Tapping a
// past day opens its summary (#491, design docs/design/issue-491-day-summary.html,
// option A): the day's sets, volume, time, and records, with each workout as
// a link to that workout in the Workout log, or a rest-day note. The grid
// scrolls sideways on its own, starting at today; the page never does. No streaks. Without Premium it's a blurred preview with Keep it
// with Premium / Go back, like the monthly report.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { hasPremium } from '../lib/premium'
import { buildCalendar, calendarRecords, calendarTotals, daySummary, type CalendarDay } from '../lib/trainingCalendar'
import { reportUnit } from '../lib/progressReport'
import { formatWorkoutLength } from '../lib/workoutDuration'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'
import TrialNote from './TrialNote.vue'

const router = useRouter()
const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()

// Part of the progress analytics, so a Lift progress trial pass opens it too.
const isPremium = computed(() => hasPremium('progress'))

// Escape closes the day sheet, which is also how Android's back gesture
// closes it (#482).
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && picking.value) picking.value = null
}

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  workout.fetchProgressSets()
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
  if (!bodyWeight.fetched) bodyWeight.fetchEntries()
})

const ready = computed(() => workout.progressSetsFetched && exercises.fetched && bodyWeight.fetched)

// A workout still in progress joins once it's finished, like the report.
const rows = computed(() => workout.progressSets.filter((s) => s.workout_id !== workout.activeWorkoutId))
const weeks = computed(() => buildCalendar(rows.value))
const totals = computed(() => calendarTotals(weeks.value))

const scroller = ref<HTMLElement | null>(null)
watch(
  ready,
  async (isReady) => {
    if (!isReady) return
    await nextTick()
    if (scroller.value) scroller.value.scrollLeft = scroller.value.scrollWidth
  },
  { immediate: true },
)

const picking = ref<CalendarDay | null>(null)

const unit = computed(() => reportUnit(rows.value, profile.weightUnit))
const records = computed(() => calendarRecords(rows.value, exercises.exercises, bodyWeight.entries))
const summary = computed(() =>
  picking.value && picking.value.workouts.length > 0
    ? daySummary(picking.value, rows.value, records.value, exercises.exercises, bodyWeight.entries, unit.value)
    : null,
)

function dayLabel(day: CalendarDay): string {
  return day.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function cellLabel(day: CalendarDay): string {
  if (day.workouts.length === 0) return `${dayLabel(day)}: rest day`
  const sets = `${day.sets} ${day.sets === 1 ? 'set' : 'sets'}`
  const count = day.workouts.length > 1 ? `, ${day.workouts.length} workouts` : ''
  return `${dayLabel(day)}: ${sets}${count}`
}

function openWorkout(id: string) {
  picking.value = null
  router.push({ name: 'workout-log', query: { workout: id } })
}

function tapDay(day: CalendarDay) {
  picking.value = day
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function goBack() {
  router.push({ name: 'progress' })
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']
</script>

<template>
  <div class="training-calendar">
    <router-link :to="{ name: 'progress' }" class="back-link" aria-label="Back to Progress"><span aria-hidden="true">‹</span>Progress</router-link>
    <PageHeader title="Training calendar" />
    <p class="page-lede">The last 12 months. Tap a day to see it.</p>

    <TrialNote feature="progress" class="cal-trial" />

    <SkeletonRows v-if="!ready" :rows="3" />
    <div v-else class="cal-body" :class="{ previewing: !isPremium }">
      <div class="cal-content" :class="{ blurred: !isPremium }" :inert="!isPremium" :aria-hidden="!isPremium || undefined">
        <div class="cal-card">
          <div class="cal">
            <div class="day-labels" aria-hidden="true">
              <span></span>
              <span v-for="(label, i) in DAY_LABELS" :key="i">{{ label }}</span>
            </div>
            <div ref="scroller" class="scroller" data-testid="calendar-scroller">
              <div class="grid" role="group" aria-label="Training days">
                <template v-for="(week, w) in weeks" :key="w">
                  <span class="month" aria-hidden="true">{{ week.monthLabel }}</span>
                  <template v-for="day in week.days" :key="day.key">
                    <button
                      v-if="!day.future"
                      type="button"
                      class="cell"
                      :class="[`l${day.level}`, { today: day.today, picked: picking?.key === day.key }]"
                      :aria-label="cellLabel(day)"
                      :data-day="day.key"
                      :data-level="day.level"
                      @click="tapDay(day)"
                    ></button>
                    <span
                      v-else
                      class="cell"
                      :class="{ future: day.future, today: day.today }"
                      :data-day="day.key"
                      data-level="0"
                    ></span>
                  </template>
                </template>
              </div>
            </div>
          </div>
          <div class="legend" aria-hidden="true">
            <span class="today-key"><i class="cell today"></i>Today</span>
            <span class="t">Fewer</span><i class="cell"></i><i class="cell l1"></i><i class="cell l2"></i><i class="cell l3"></i><i class="cell l4"></i><span class="t">More sets</span>
          </div>
        </div>

        <ul class="totals" aria-label="Last 12 months">
          <li class="stat" data-testid="calendar-workouts">
            <span class="stat-label">Workouts</span>
            <span class="stat-value">{{ totals.workouts.toLocaleString('en-US') }}</span>
          </li>
          <li class="stat" data-testid="calendar-days">
            <span class="stat-label">Training days</span>
            <span class="stat-value">{{ totals.days.toLocaleString('en-US') }}</span>
          </li>
        </ul>
        <p class="hint">Stronger color means more sets. Swipe the calendar to see earlier months.</p>
      </div>
      <div v-if="!isPremium" class="cal-overlay">
        <PremiumPreviewPanel
          feature="progress"
          title="The training calendar is part of Premium"
          body="Your Workout log and this week's numbers on Progress stay free."
          @back="goBack"
        />
      </div>
    </div>

    <div v-if="picking" class="sheet-overlay" @click.self="picking = null">
      <div class="sheet" role="dialog" aria-modal="true" :aria-label="dayLabel(picking)">
        <div class="sheet-handle" aria-hidden="true"></div>
        <h3 class="sheet-title">{{ dayLabel(picking) }}</h3>
        <template v-if="summary">
          <p class="intro">{{ picking.workouts.length }} {{ picking.workouts.length === 1 ? 'workout' : 'workouts' }}</p>
          <ul class="day-tiles" aria-label="Day totals">
            <li class="tile" data-testid="day-sets">
              <span class="tile-label">Sets</span>
              <span class="tile-value">{{ summary.sets.toLocaleString('en-US') }}</span>
            </li>
            <li class="tile" :class="{ none: summary.volume === null }" data-testid="day-volume">
              <span class="tile-label">Volume</span>
              <span v-if="summary.volume !== null" class="tile-value">{{ summary.volume.toLocaleString('en-US') }} <small>{{ unit }}</small></span>
              <span v-else class="tile-value" aria-label="none">–</span>
            </li>
            <li class="tile" :class="{ none: summary.minutes === null }" data-testid="day-time">
              <span class="tile-label">Time</span>
              <span v-if="summary.minutes !== null" class="tile-value">{{ formatWorkoutLength(summary.minutes) }}</span>
              <span v-else class="tile-value" aria-label="none">–</span>
            </li>
          </ul>
          <template v-if="summary.records.length > 0">
            <h4 class="sec">Records</h4>
            <ul class="records" data-testid="day-records">
              <li v-for="(r, i) in summary.records" :key="i">
                <span class="star" aria-hidden="true">★</span>
                <span class="record-name">{{ r.name }}</span>
                <span class="record-set">{{ r.set }}</span>
              </li>
            </ul>
          </template>
          <h4 class="sec">Workouts</h4>
          <ul class="picks">
            <li v-for="w in picking.workouts" :key="w.id">
              <button type="button" class="pick" @click="openWorkout(w.id)">
                <span class="pick-body">
                  <span class="pick-name">{{ w.name }}</span>
                  <span class="pick-meta">{{ timeOf(w.performedAt) }} · {{ w.sets }} {{ w.sets === 1 ? 'set' : 'sets' }}</span>
                </span>
                <span class="open" aria-hidden="true">Open ›</span>
              </button>
            </li>
          </ul>
        </template>
        <div v-else class="rest" data-testid="day-rest">
          <p class="rest-title">Rest day</p>
          <p class="rest-body">Nothing logged this day. Rest is part of the plan.</p>
        </div>
        <button type="button" class="cancel" @click="picking = null">Close</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  margin-bottom: 2px;
}

.page-lede {
  margin: 0 0 14px;
  color: var(--text-dim);
  font-size: 0.82rem;
  line-height: 1.4;
}

.cal-trial {
  margin-bottom: 12px;
}

.cal-body {
  position: relative;
}

.cal-body.previewing {
  min-height: 360px;
}

.cal-content.blurred {
  filter: blur(6px);
  opacity: 0.7;
  user-select: none;
  pointer-events: none;
}

.cal-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 48px;
}

.cal-card {
  --cell: 14px;
  --gap: 3px;
  margin-bottom: 12px;
  padding: 12px 12px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.cal {
  display: flex;
  gap: 4px;
}

.day-labels {
  flex-shrink: 0;
  width: 24px;
  display: grid;
  grid-template-rows: 16px repeat(7, var(--cell));
  row-gap: var(--gap);
  font-size: 0.62rem;
  font-weight: 700;
  line-height: var(--cell);
  color: var(--text-dim);
}

.scroller {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}

.scroller::-webkit-scrollbar {
  display: none;
}

.grid {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: 16px repeat(7, var(--cell));
  grid-auto-columns: var(--cell);
  gap: var(--gap);
  width: max-content;
  /* Room for today's outline at the right edge. */
  padding: 0 3px 0 0;
}

.month {
  font-size: 0.62rem;
  font-weight: 700;
  line-height: 14px;
  color: var(--text-dim);
  white-space: nowrap;
}

.cell {
  display: block;
  width: var(--cell);
  height: var(--cell);
  min-height: 0;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: color-mix(in srgb, var(--text-dim) 12%, var(--surface));
}

button.cell:active {
  transform: none;
}

.cell.l1 {
  background: color-mix(in srgb, var(--accent) 30%, var(--surface));
}

.cell.l2 {
  background: color-mix(in srgb, var(--accent) 55%, var(--surface));
}

.cell.l3 {
  background: color-mix(in srgb, var(--accent) 78%, var(--surface));
}

.cell.l4 {
  background: var(--accent);
}

.cell.future {
  background: transparent;
}

.cell.today {
  outline: 2px solid var(--text);
  outline-offset: 1px;
}

.cell.picked {
  outline: 2px solid var(--secondary);
  outline-offset: 1px;
}

.legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  margin-top: 10px;
  font-size: 0.66rem;
  color: var(--text-dim);
}

.legend .cell {
  --cell: 10px;
  border-radius: 2px;
}

.legend .t {
  margin: 0 3px;
}

.today-key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  padding-left: 3px;
}

.totals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0 0 10px;
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
}

.hint {
  margin: 0 2px;
  font-size: 0.76rem;
  color: var(--text-dim);
}

.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  max-height: 88vh;
  overflow-y: auto;
  padding: 10px 16px calc(20px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  line-height: 1.15;
}

.intro {
  margin: -8px 0 4px;
  font-size: 0.84rem;
  color: var(--text-dim);
}

.day-tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
}

.tile-label {
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.tile-value {
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.tile-value small {
  font-family: var(--font-body);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-dim);
}

.tile.none .tile-value {
  color: var(--text-dim);
}

.sec {
  margin: 2px 0 -4px;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.records {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.records li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.86rem;
}

.star {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 0.75rem;
  background: color-mix(in srgb, var(--highlight) 20%, var(--surface));
  color: var(--highlight);
}

.record-name {
  flex: 1;
  min-width: 0;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.record-set {
  font-weight: 700;
  color: var(--text-dim);
  white-space: nowrap;
}

.open {
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--accent);
  white-space: nowrap;
}

.rest {
  padding: 8px 0 4px;
  text-align: center;
}

.rest-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
}

.rest-body {
  margin: 4px 0 0;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.picks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pick {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  text-align: left;
  border-radius: 14px;
  color: var(--text-dim);
}

.pick-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.pick-name {
  font-weight: 800;
  color: var(--text);
  overflow-wrap: anywhere;
}

.pick-meta {
  margin-top: 2px;
  font-size: 0.78rem;
  font-weight: 600;
}

.cancel {
  background: transparent;
}
</style>
