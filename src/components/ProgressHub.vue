<script setup lang="ts">
import { themeArt } from '../lib/theme'
// Issue #44: the Progress tab (screen 1 of docs/design/issue-44-progress-hub.html),
// replacing the History tab. A summary strip, then one big tile per section:
// the workout log (the old History screen), lift progress, and body weight
// (the old Body tab), and muscle groups (#40).
import { computed, onActivated, ref } from 'vue'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import { useBodyWeightStore } from '../stores/bodyWeight'
import {
  changeText,
  historiesByExercise,
  latestWorkout,
  newBestsListThisMonth,
  topLiftTrend,
  workoutCounts,
} from '../lib/progressHub'
import { convertWeight, METRIC_LABELS } from '../lib/progressSeries'
import { countsForWeek, formatSets, leadingMuscle, weeklyMuscleSets } from '../lib/muscleVolume'
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_TINTS, MUSCLE_GROUPS } from '../lib/muscleGroups'
import { startOfWeek } from '../lib/progressHub'
import { countText, milestoneCounts, readSeenTiers, trackProgress } from '../lib/milestones'
import { buildReport, hasHistoryBefore, lastFullMonth, lastFullYear, monthName, weekLine, weekRecords } from '../lib/progressReport'
import { hasPremium } from '../lib/premium'
import { openNumberReport } from '../lib/accountSheet'
import { numberReportText } from '../lib/bugReport'
import { templateProgressRows, templateVolumeHistories } from '../lib/templateProgress'
import { buildCalendar, calendarTotals } from '../lib/trainingCalendar'
import ExerciseHistoryDetail from './ExerciseHistoryDetail.vue'
import FeelInsightsCard from './FeelInsightsCard.vue'
import HubCountSheet, { type HubCountKind } from './HubCountSheet.vue'
import PageHeader from './PageHeader.vue'
import PremiumMark from './PremiumMark.vue'
import Sparkline from './Sparkline.vue'

const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()

// #463: kept alive between tab switches (App.vue), so this also runs on every
// return; the all-sets list is refetched only when a write has made it stale.
onActivated(() => {
  if (!workout.progressSetsFetched || workout.progressSetsStale) workout.fetchProgressSets()
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
  if (!bodyWeight.fetched) bodyWeight.fetchEntries()
})

const histories = computed(() => historiesByExercise(workout.progressSets))
const counts = computed(() => workoutCounts(workout.progressSets))
const newBestsList = computed(() => newBestsListThisMonth(exercises.exercises, histories.value, undefined, profile.weightUnit))
const newBests = computed(() => newBestsList.value.length)
const lastWorkout = computed(() => latestWorkout(workout.progressSets))
const topLift = computed(() => topLiftTrend(exercises.exercises, histories.value, undefined, profile.weightUnit))

// Issue #40: this week's sets per muscle, for the Muscle groups tile.
const muscleWeek = computed(() =>
  countsForWeek(weeklyMuscleSets(workout.progressSets, exercises.exercises), startOfWeek()),
)
const leader = computed(() => leadingMuscle(muscleWeek.value))
const muscleWeekMax = computed(() => Math.max(1, ...MUSCLE_GROUPS.map((g) => muscleWeek.value[g])))

// Issue #157: the Routine progress tile names the most recently trained
// template and its latest session's volume.
const latestTemplate = computed(
  () =>
    templateProgressRows(
      templateVolumeHistories(workout.progressSets, exercises.exercises, bodyWeight.entries, profile.weightUnit, workout.activeWorkoutId),
    )[0] ?? null,
)

// Issue #137: the Training calendar tile, with the last 8 weeks as a preview.
const calendarWeeks = computed(() => buildCalendar(finishedRows.value))
const calendarTotal = computed(() => calendarTotals(calendarWeeks.value))
const miniWeeks = computed(() => calendarWeeks.value.slice(-8))

// Issue #153: the Milestones tile shows the next workouts tier.
const workoutMilestone = computed(() => {
  const loadTypes = new Map(exercises.exercises.map((e) => [e.id, e.load_type]))
  const rows = workout.progressSets.filter((s) => s.workout_id !== workout.activeWorkoutId)
  const counts = milestoneCounts(rows, (id) => loadTypes.get(id) ?? 'weight', bodyWeight.entries)
  return trackProgress(counts, readSeenTiers() ?? new Set()).find((t) => t.info.track === 'workouts')!
})

// Issue #134: the free weekly line, and the report tile for the month that
// just ended (shown once there's history from before this month).
const week = computed(() => weekLine(workout.progressSets, exercises.exercises, bodyWeight.entries))
const reportMonth = lastFullMonth()
const reportYear = lastFullYear()
const finishedRows = computed(() => workout.progressSets.filter((s) => s.workout_id !== workout.activeWorkoutId))
const showReport = computed(() => hasHistoryBefore(finishedRows.value, reportMonth))
const monthReport = computed(() =>
  showReport.value ? buildReport(finishedRows.value, exercises.exercises, bodyWeight.entries, reportMonth, profile.weightUnit) : null,
)
// The year recap is announced through January, once there's a year to recap.
const yearRecapNew = computed(() => new Date().getMonth() === 0 && hasHistoryBefore(finishedRows.value, reportYear))

// Issue #581: tapping "new bests" or "records" lists what was counted. Chart
// and Check open the lift's history over the hub (Check with the record
// check for that set, #579).
const countSheet = ref<HubCountKind | null>(null)
const historyFor = ref<{ exerciseId: string; setId: string | null } | null>(null)
const weekRecordList = computed(() => weekRecords(workout.progressSets, exercises.exercises, bodyWeight.entries))
const thisMonth = new Date().toLocaleDateString(undefined, { month: 'long' })

function openHistory(exerciseId: string, setId: string | null = null) {
  countSheet.value = null
  historyFor.value = { exerciseId, setId }
}

// "This looks wrong" (#574).
function reportCount() {
  const kind = countSheet.value
  if (!kind) return
  const bests = kind === 'bests'
  const items = bests
    ? newBestsList.value.map((b) => `${b.exercise.name} on ${b.performedAt.slice(0, 10)}`)
    : weekRecordList.value.map((r) => `${r.name} ${r.set} on ${r.performedAt.slice(0, 10)}, beat ${r.beaten}`)
  openNumberReport(
    numberReportText({
      screen: `Progress › ${bests ? 'New bests' : 'Records this week'}`,
      shown: bests ? plural(newBests.value, 'new best') : plural(week.value.records, 'record'),
      from: items.length ? items.join('. ') : 'nothing listed',
      rule: bests
        ? "A lift's highest point ever on its default chart (Est. 1RM for weighted lifts), first reached this month"
        : 'A single set that beats the best weight × reps before it on that lift',
    }),
  )
  countSheet.value = null
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`
}

const topLiftMetric = computed(() => {
  const metric = topLift.value?.metric
  if (!metric) return ''
  return metric === 'e1rm' ? 'est. 1RM' : METRIC_LABELS[metric].toLowerCase()
})

// Last 10 weigh-ins, oldest first, in the latest entry's unit (the unit the
// Body screen shows).
const weightSpark = computed(() => {
  const latest = bodyWeight.latestEntry
  if (!latest) return []
  return bodyWeight.entries
    .slice(0, 10)
    .reverse()
    .map((e) => convertWeight(e.weight, e.weight_unit, latest.weight_unit))
})

function formatWeekdayDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="progress-hub">
    <PageHeader title="Progress" />
    <p class="page-lede">How your training is going.</p>

    <!-- Issue #124: a theme's corner decoration goes only where the top-right
         corner is empty: the hero, and Body weight before it has a sparkline. -->
    <div class="hero theme-corner theme-corner-feature">
      <img :src="themeArt('celebration')" alt="" class="hero-bunny mascot-art" />
      <div class="hero-body">
        <div class="hero-title">{{ counts.week > 0 ? "You're on a roll!" : 'Fresh week, fresh start.' }}</div>
        <div class="stats">
          <div><b data-testid="hub-week-count">{{ counts.week }}</b>this week</div>
          <div><b data-testid="hub-month-count">{{ counts.month }}</b>this month</div>
          <button type="button" class="stat-button" :aria-label="`${plural(newBests, 'new best')}, show them`" @click="countSheet = 'bests'">
            <b data-testid="hub-new-bests">{{ newBests }}</b><span class="tappable">new bests</span>
          </button>
        </div>
      </div>
    </div>

    <p v-if="workout.progressSetsFetched" class="week-line" data-testid="hub-week-line">
      This week: <b>{{ plural(week.workouts, 'workout') }}</b>, <b>{{ plural(week.sets, 'set') }}</b>,
      <button type="button" class="stat-button inline" :aria-label="`${plural(week.records, 'record')} this week, show them`" @click="countSheet = 'records'">
        <b class="tappable">{{ plural(week.records, 'record') }}</b>
      </button>
    </p>

    <HubCountSheet
      v-if="countSheet"
      :kind="countSheet"
      :bests="newBestsList"
      :records="weekRecordList"
      :month="thisMonth"
      :show-e1rm="hasPremium('progress')"
      @dismiss="countSheet = null"
      @switch="countSheet = $event"
      @chart="openHistory($event)"
      @check="openHistory"
      @report="reportCount"
    />
    <ExerciseHistoryDetail
      v-if="historyFor"
      :key="`${historyFor.exerciseId}-${historyFor.setId}`"
      :exercise-id="historyFor.exerciseId"
      :record-set-id="historyFor.setId"
      @dismiss="historyFor = null"
    />

    <router-link
      :to="{ name: 'workout-log' }"
      class="tile"
      style="--c: var(--secondary)"
      aria-labelledby="tile-log-title"
      aria-describedby="tile-log-sub"
    >
      <span class="tile-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="4" width="14" height="17" rx="2.5" />
          <path d="M9 4h6v3H9z" />
          <path d="M8.5 11.5h7M8.5 15h5" />
        </svg>
      </span>
      <span class="tile-body">
        <span id="tile-log-title" class="tile-title">Workout log</span>
        <span id="tile-log-sub" class="tile-sub">
          <!-- One line, ellipsized, so a long workout name can't make this tile taller than its neighbors. -->
          <span v-if="lastWorkout" class="tile-line">Last: <b>{{ lastWorkout.name }}</b> · {{ formatWeekdayDate(lastWorkout.performedAt) }}</span>
          <span v-else-if="workout.progressSetsFetched" class="tile-line">No workouts yet</span>
          Review or fix past workouts
        </span>
      </span>
      <svg class="tile-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </router-link>

    <router-link
      :to="{ name: 'training-calendar' }"
      class="tile"
      style="--c: var(--accent)"
      aria-labelledby="tile-calendar-title"
      aria-describedby="tile-calendar-sub"
    >
      <span class="tile-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M4 10h16M9 3v4M15 3v4" />
          <path d="M8 14h2M11 14h2M14 14h2M8 17h2M11 17h2" />
        </svg>
      </span>
      <span class="tile-body">
        <span id="tile-calendar-title" class="tile-title">Training calendar<PremiumMark v-if="!hasPremium('progress')" /></span>
        <span id="tile-calendar-sub" class="tile-sub">
          <template v-if="workout.progressSetsFetched">
            <b>{{ plural(calendarTotal.workouts, 'workout') }}</b> in 12 months<br />Every training day at a glance
          </template>
        </span>
      </span>
      <span class="mini-cal" aria-hidden="true" data-testid="hub-mini-calendar">
        <template v-for="(week, w) in miniWeeks" :key="w">
          <i v-for="day in week.days" :key="day.key" :class="[`l${day.level}`, { future: day.future }]"></i>
        </template>
      </span>
    </router-link>

    <router-link
      :to="{ name: 'lift-progress' }"
      class="tile"
      style="--c: var(--accent)"
      aria-labelledby="tile-lift-title"
      aria-describedby="tile-lift-sub"
    >
      <span class="tile-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 17 9 11 13 15 21 7" />
          <polyline points="15 7 21 7 21 13" />
        </svg>
      </span>
      <span class="tile-body">
        <span id="tile-lift-title" class="tile-title">Lift progress</span>
        <span id="tile-lift-sub" class="tile-sub">
          <template v-if="topLift && topLift.summary">
            <b>{{ topLift.exercise.name }}</b> {{ topLiftMetric }}<br />
            <span v-if="topLift.summary.improved" class="up">{{ changeText(topLift.metric, topLift.summary, topLift.unit, true) }}</span>
            <span v-else-if="topLift.summary.declined" class="flat">{{ changeText(topLift.metric, topLift.summary, topLift.unit, true) }}</span>
            <span v-else class="flat">No change</span>
            in 3 months
          </template>
          <template v-else-if="workout.progressSetsFetched">Log a lift twice to see your trend</template>
        </span>
      </span>
      <Sparkline
        v-if="topLift && topLift.recent.length > 1"
        class="tile-spark"
        :values="topLift.recent.map((p) => p.value)"
        :flipped="topLift.metric === 'assist'"
        :width="92"
        :height="34"
      />
    </router-link>

    <router-link
      :to="{ name: 'template-progress' }"
      class="tile"
      style="--c: var(--highlight)"
      aria-labelledby="tile-template-title"
      aria-describedby="tile-template-sub"
    >
      <span class="tile-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 16v-3M12 16V9M16 16v-5" />
        </svg>
      </span>
      <span class="tile-body">
        <span id="tile-template-title" class="tile-title">Routine progress<PremiumMark v-if="!hasPremium('progress')" /></span>
        <span id="tile-template-sub" class="tile-sub">
          <template v-if="latestTemplate">
            <b>{{ latestTemplate.name }}</b><template v-if="latestTemplate.headline"> · {{ latestTemplate.headline }}</template>
            <br />Volume per session over time
          </template>
          <template v-else-if="workout.progressSetsFetched">Start a workout from a routine to see it here</template>
        </span>
      </span>
      <svg class="tile-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </router-link>

    <router-link
      :to="{ name: 'body' }"
      class="tile"
      :class="{ 'theme-corner': weightSpark.length <= 1 }"
      style="--c: var(--success)"
      aria-labelledby="tile-body-title"
      aria-describedby="tile-body-sub"
    >
      <span class="tile-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="4.5" />
          <path d="M8.5 11a3.5 3.5 0 017 0" />
          <path d="M12 11l1.4-1.8" />
        </svg>
      </span>
      <span class="tile-body">
        <span id="tile-body-title" class="tile-title">Body weight</span>
        <span id="tile-body-sub" class="tile-sub">
          <template v-if="bodyWeight.latestEntry">
            <b>{{ bodyWeight.latestEntry.weight }} {{ bodyWeight.latestEntry.weight_unit }}</b> ·
            {{ formatShortDate(bodyWeight.latestEntry.recorded_at) }}<br />Opens the Body screen
          </template>
          <template v-else-if="bodyWeight.fetched">Log your first weigh-in</template>
        </span>
      </span>
      <Sparkline v-if="weightSpark.length > 1" class="tile-spark" :values="weightSpark" :width="92" :height="34" />
    </router-link>

    <router-link
      :to="{ name: 'muscle-progress' }"
      class="tile"
      style="--c: var(--highlight)"
      aria-labelledby="tile-muscle-title"
      aria-describedby="tile-muscle-sub"
    >
      <span class="tile-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="12" cy="6" r="2.5" />
          <path d="M12 9v6M8 11l4-1 4 1M10 21l2-6 2 6" />
        </svg>
      </span>
      <span class="tile-body">
        <span id="tile-muscle-title" class="tile-title">Muscle groups</span>
        <span id="tile-muscle-sub" class="tile-sub">
          <template v-if="leader">
            <!-- Issue #109: short enough for two lines beside the minibars. -->
            <b>{{ MUSCLE_GROUP_LABELS[leader] }}</b> leads<br />{{ formatSets(muscleWeek[leader]) }}
            {{ muscleWeek[leader] === 1 ? 'set' : 'sets' }} this week
          </template>
          <template v-else-if="workout.progressSetsFetched">No sets yet this week</template>
        </span>
      </span>
      <span v-if="leader" class="minibars" aria-hidden="true">
        <i
          v-for="g in MUSCLE_GROUPS"
          :key="g"
          :style="{ height: `${Math.max(3, (muscleWeek[g] / muscleWeekMax) * 34)}px`, background: MUSCLE_GROUP_TINTS[g] }"
        ></i>
      </span>
      <svg class="tile-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </router-link>

    <router-link
      :to="{ name: 'milestones' }"
      class="tile"
      style="--c: var(--accent)"
      aria-labelledby="tile-milestones-title"
      aria-describedby="tile-milestones-sub"
    >
      <span class="tile-icon" aria-hidden="true"><span class="tile-carrot" /></span>
      <span class="tile-body">
        <span id="tile-milestones-title" class="tile-title">Milestones</span>
        <span id="tile-milestones-sub" class="tile-sub">
          <template v-if="workout.progressSetsFetched && workoutMilestone.next">
            <b>{{ workoutMilestone.count.toLocaleString('en-US') }} of {{ countText('workouts', workoutMilestone.next.count) }}</b>
            <br />Training unlocks rewards
          </template>
          <template v-else-if="workout.progressSetsFetched">Every workout milestone unlocked</template>
        </span>
      </span>
      <svg class="tile-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </router-link>

    <router-link
      :to="{ name: 'strength-levels' }"
      class="tile"
      style="--c: var(--success)"
      aria-labelledby="tile-strength-title"
      aria-describedby="tile-strength-sub"
    >
      <span class="tile-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 20V14M10 20V10M15 20V7M20 20V4" />
        </svg>
      </span>
      <span class="tile-body">
        <span id="tile-strength-title" class="tile-title">Strength levels<PremiumMark v-if="!hasPremium('strength')" /></span>
        <span id="tile-strength-sub" class="tile-sub">
          Your big lifts for your body weight<br />Beginner to Elite, and what's next
        </span>
      </span>
      <svg class="tile-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </router-link>

    <FeelInsightsCard />

    <router-link
      v-if="monthReport"
      :to="{ name: 'progress-report' }"
      class="tile"
      style="--c: var(--secondary)"
      aria-labelledby="tile-report-title"
      aria-describedby="tile-report-sub"
    >
      <span class="tile-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M4 10h16M9 3v4M15 3v4" />
          <path d="M8.5 16.5l2-2 1.5 1.5 3.5-3.5" />
        </svg>
      </span>
      <span class="tile-body">
        <span id="tile-report-title" class="tile-title">{{ monthName(reportMonth) }} report<PremiumMark v-if="!hasPremium('reports')" /></span>
        <span id="tile-report-sub" class="tile-sub">
          <b>{{ plural(monthReport.stats.workouts, 'workout') }}</b> · {{ plural(monthReport.stats.records, 'record') }}
          <br />{{ yearRecapNew ? `Your ${reportYear.year} recap is in too` : 'See how the month went' }}
        </span>
      </span>
      <svg class="tile-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </router-link>
  </div>
</template>

<style scoped>
/* Lede sits right under the title. */
.page-header {
  margin-bottom: 2px;
}

.page-lede {
  margin: 0 0 16px;
  color: var(--text-dim);
  font-size: 0.84rem;
}

.hero {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--accent) 9%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
  border-radius: 16px;
}

.hero-bunny {
  flex-shrink: 0;
  width: 70px;
  height: 70px;
  object-fit: contain;
}

.hero-body {
  min-width: 0;
}

.hero-title {
  font-size: 0.95rem;
  font-weight: 800;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 6px;
}

.stats div {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-dim);
}

.stats b {
  display: block;
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--accent);
}

/* Issue #581: the counts look as before, plus a dotted underline. */
.stat-button {
  display: block;
  min-height: auto;
  padding: 0;
  background: none;
  border: none;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-dim);
  text-align: left;
}

.stat-button.inline {
  display: inline;
  font-size: inherit;
  font-weight: inherit;
  color: inherit;
}

.tappable {
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  text-decoration-color: color-mix(in srgb, var(--text-dim) 70%, transparent);
}

.week-line {
  margin: -6px 0 16px;
  font-size: 0.82rem;
  color: var(--text-dim);
}

.week-line b {
  color: var(--text);
}

.tile {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  color: var(--text);
  text-decoration: none;
}

.tile:active {
  transform: scale(0.99);
}

.tile-icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--c) 18%, transparent);
  color: var(--c);
}

.tile-icon svg {
  width: 28px;
  height: 28px;
}

.tile-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.tile-title {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.15;
}

.tile-sub {
  margin-top: 2px;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--text-dim);
}

.tile-line {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tile-sub b {
  color: var(--text);
}

.tile-carrot {
  width: 30px;
  height: 30px;
  background: var(--decor-carrot) no-repeat center / contain;
}

.tile-chevron {
  flex-shrink: 0;
  color: var(--text-dim);
}

.tile-spark {
  color: var(--c);
}

.up {
  font-weight: 800;
  color: var(--success);
}

.flat {
  font-weight: 800;
  color: var(--text-dim);
}

.minibars {
  flex-shrink: 0;
  display: flex;
  gap: 3px;
  align-items: flex-end;
  height: 34px;
}

.minibars i {
  display: block;
  width: 8px;
  border-radius: 3px 3px 1px 1px;
}

.mini-cal {
  flex-shrink: 0;
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(7, 6px);
  grid-auto-columns: 6px;
  gap: 2px;
}

.mini-cal i {
  display: block;
  border-radius: 1.5px;
  background: color-mix(in srgb, var(--text-dim) 12%, var(--surface));
}

.mini-cal i.l1 {
  background: color-mix(in srgb, var(--accent) 30%, var(--surface));
}

.mini-cal i.l2 {
  background: color-mix(in srgb, var(--accent) 55%, var(--surface));
}

.mini-cal i.l3 {
  background: color-mix(in srgb, var(--accent) 78%, var(--surface));
}

.mini-cal i.l4 {
  background: var(--accent);
}

.mini-cal i.future {
  background: transparent;
}

/* Eight bars at full width crowd the tile's title onto two lines on phones
   narrower than the mockup's 390px. */
@media (max-width: 389px) {
  .minibars {
    gap: 2px;
  }

  .minibars i {
    width: 6px;
  }
}

/* Room for the tile text next to a full-size sparkline runs out on the
   narrowest phones. */
@media (max-width: 360px) {
  .hero {
    gap: 10px;
    padding: 12px;
  }

  .hero-bunny {
    width: 52px;
    height: 52px;
  }

  .stats {
    gap: 4px 10px;
  }

  .tile {
    gap: 10px;
  }

  .tile-spark {
    width: 60px;
    height: 22px;
  }

  .mini-cal {
    grid-template-rows: repeat(7, 4px);
    grid-auto-columns: 4px;
    gap: 1.5px;
  }
}
</style>
