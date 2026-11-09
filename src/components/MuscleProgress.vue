<script setup lang="ts">
// Issue #40: Muscle groups (screen 2 of docs/design/issue-40-muscle-groups.html),
// opened from the Progress hub. Sets per week for every muscle, always in
// MUSCLE_GROUPS order (never ranked), with a tick at the week before. ‹ / ›
// step through past weeks. Tapping a muscle opens MuscleDetail.
import { computed, onMounted, ref } from 'vue'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { startOfWeek } from '../lib/progressHub'
import {
  addWeeks,
  countsForWeek,
  earliestWeek,
  formatSets,
  musclesWithHistoryBefore,
  TARGET_SETS,
  weeklyMuscleSets,
} from '../lib/muscleVolume'
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_TINTS, MUSCLE_GROUPS, type MuscleGroup } from '../lib/muscleGroups'
import BalanceCard from './BalanceCard.vue'
import MuscleBadge from './MuscleBadge.vue'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'

const workout = useWorkoutsStore()
const exercises = useExercisesStore()

onMounted(() => {
  workout.fetchProgressSets()
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
})

const weeks = computed(() => weeklyMuscleSets(workout.progressSets, exercises.exercises))
const first = computed(() => earliestWeek(workout.progressSets))

// 0 is this week, 1 last week, and so on.
const offset = ref(0)
const week = computed(() => addWeeks(startOfWeek(), -offset.value))
const counts = computed(() => countsForWeek(weeks.value, week.value))
const before = computed(() => countsForWeek(weeks.value, addWeeks(week.value, -1)))
const canGoBack = computed(() => first.value !== null && week.value.getTime() > first.value.getTime())

// Bars share one scale across this week and the one before, so the tick
// always lands on the track. It reaches past the 10 to 20 band (#135) so the
// band always fits with a little room after it.
const scale = computed(() =>
  Math.max(TARGET_SETS.max * 1.2, ...MUSCLE_GROUPS.map((g) => counts.value[g]), ...MUSCLE_GROUPS.map((g) => before.value[g])),
)
const band = computed(() => ({
  left: `${(TARGET_SETS.min / scale.value) * 100}%`,
  width: `${((TARGET_SETS.max - TARGET_SETS.min) / scale.value) * 100}%`,
}))

// Issue #135: a quiet note on muscles under 10 sets in the last full week,
// only on the current week's view and never on a muscle with no history.
const lastFullWeek = computed(() => countsForWeek(weeks.value, addWeeks(startOfWeek(), -1)))
const withHistory = computed(() => musclesWithHistoryBefore(weeks.value, startOfWeek()))
function underTarget(g: MuscleGroup): boolean {
  return offset.value === 0 && withHistory.value.has(g) && lastFullWeek.value[g] < TARGET_SETS.min
}
const UNDER_TEXT = `Under ${TARGET_SETS.min} sets last week`

function rowLabel(g: MuscleGroup): string {
  const base = `${MUSCLE_GROUP_LABELS[g]}, ${formatSets(counts.value[g])} ${setsWord(counts.value[g])}, ${formatSets(before.value[g])} the week before`
  return underTarget(g) ? `${base}, ${UNDER_TEXT.toLowerCase()}` : base
}

const needsGroupCount = computed(() => exercises.activeExercises.filter((e) => !e.muscle_group).length)

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const weekTitle = computed(() => {
  if (offset.value === 0) return 'This week'
  if (offset.value === 1) return 'Last week'
  return `Week of ${shortDate(week.value)}`
})

const weekRange = computed(() => {
  const w = week.value
  const lastDay = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 6)
  const range = `${shortDate(w)} – ${shortDate(lastDay)}`
  return offset.value === 0 ? `${range} · so far` : range
})

function setsWord(n: number): string {
  return n === 1 ? 'set' : 'sets'
}
</script>

<template>
  <div class="muscle-progress">
    <router-link :to="{ name: 'progress' }" class="back-link" aria-label="Back to Progress"><span aria-hidden="true">‹</span>Progress</router-link>
    <PageHeader title="Muscle groups" />
    <p class="page-lede">Sets per week. "Also works" muscles count as half a set.</p>

    <div class="weekline">
      <button type="button" class="arrow" aria-label="Previous week" :disabled="!canGoBack" @click="offset++">‹</button>
      <div class="week-text" aria-live="polite">
        <span data-testid="muscle-week-title">{{ weekTitle }}</span>
        <small>{{ weekRange }}</small>
      </div>
      <button type="button" class="arrow" aria-label="Next week" :disabled="offset === 0" @click="offset--">›</button>
    </div>

    <SkeletonRows v-if="!workout.progressSetsFetched || !exercises.fetched" :rows="4" />
    <template v-else>
      <ul class="muscle-list">
        <li v-for="g in MUSCLE_GROUPS" :key="g">
          <router-link
            :to="{ name: 'muscle-detail', params: { group: g } }"
            class="mrow"
            :style="{ '--c': MUSCLE_GROUP_TINTS[g] }"
            :aria-label="rowLabel(g)"
          >
            <MuscleBadge :group="g" class="row-badge" />
            <span class="mid">
              <span class="n">
                {{ MUSCLE_GROUP_LABELS[g] }}
                <span class="count">{{ formatSets(counts[g]) }} <small>{{ setsWord(counts[g]) }}</small></span>
              </span>
              <span class="track">
                <span class="band" data-testid="target-band" :style="band"></span>
                <span class="fill" :style="{ width: `${(counts[g] / scale) * 100}%` }"></span>
                <span class="tick" :style="{ left: `calc(${(before[g] / scale) * 100}% - 1px)` }"></span>
              </span>
              <small v-if="underTarget(g)" class="under" data-testid="under-target">{{ UNDER_TEXT }}</small>
            </span>
            <svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </router-link>
        </li>
      </ul>

      <div class="key" aria-hidden="true">
        <span><b></b>This week</span>
        <span><i></i>Last week</span>
        <span><s></s>{{ TARGET_SETS.min }}–{{ TARGET_SETS.max }} sets</span>
      </div>
      <p class="why">
        <b>Why {{ TARGET_SETS.min }} to {{ TARGET_SETS.max }}?</b> It's a common weekly target for building muscle.
      </p>

      <BalanceCard />

      <router-link v-if="needsGroupCount > 0" :to="{ name: 'exercise-check' }" class="notset">
        <MuscleBadge :group="null" tint="var(--highlight)" class="row-badge" />
        {{ needsGroupCount }} {{ needsGroupCount === 1 ? 'exercise needs' : 'exercises need' }} a muscle group
        <svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
          <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </router-link>
    </template>
  </div>
</template>

<style scoped>
/* Lede sits right under the title. */
.page-header {
  margin-bottom: 2px;
}

.page-lede {
  margin: 0 0 14px;
  color: var(--text-dim);
  font-size: 0.82rem;
  line-height: 1.4;
}

.weekline {
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

.week-text {
  text-align: center;
  font-size: 0.9rem;
  font-weight: 800;
}

.week-text small {
  display: block;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-dim);
}

.muscle-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mrow {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  text-decoration: none;
}

.mrow:active {
  transform: scale(0.99);
}

.row-badge.muscle-badge {
  width: 34px;
  height: 34px;
  border-radius: 10px;
}

.row-badge :deep(.muscle-icon) {
  width: 26px;
  height: 26px;
}

.mid {
  flex: 1;
  min-width: 0;
  display: block;
}

.n {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 5px;
  font-size: 0.9rem;
  font-weight: 700;
}

.count {
  font-family: var(--font-display);
  font-size: 1rem;
  white-space: nowrap;
}

.count small {
  font-family: var(--font-body);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-dim);
}

.track {
  position: relative;
  display: block;
  height: 8px;
  border-radius: 4px;
  background: var(--surface-2);
}

.fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 4px;
  background: var(--c);
}

/* Issue #135: the 10 to 20 sets band, under the fill. */
.band {
  position: absolute;
  top: -2px;
  bottom: -2px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--text-dim) 22%, transparent);
}

.under {
  display: block;
  margin-top: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-dim);
}

.tick {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  border-radius: 1px;
  background: var(--text-dim);
  opacity: 0.7;
}

.chev {
  flex-shrink: 0;
  color: var(--text-dim);
}

.key {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 8px 2px 0;
  font-size: 0.7rem;
  color: var(--text-dim);
}

.key b {
  display: inline-block;
  width: 16px;
  height: 6px;
  margin-right: 5px;
  border-radius: 3px;
  background: var(--secondary);
  vertical-align: middle;
}

.key i {
  display: inline-block;
  width: 2px;
  height: 12px;
  margin-right: 5px;
  border-radius: 1px;
  background: var(--text-dim);
  vertical-align: middle;
}

.key s {
  display: inline-block;
  width: 16px;
  height: 10px;
  margin-right: 5px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--text-dim) 22%, transparent);
  vertical-align: middle;
}

.why {
  margin: 6px 2px 0;
  font-size: 0.7rem;
  line-height: 1.4;
  color: var(--text-dim);
}

.notset {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding: 10px;
  border: 1px dashed color-mix(in srgb, var(--highlight) 70%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--highlight) 8%, transparent);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
  text-decoration: none;
}

.notset .chev {
  margin-left: auto;
  color: var(--highlight);
}
</style>
