<script setup lang="ts">
// Issue #44: Lift progress (screen 2 of docs/design/issue-44-progress-hub.html),
// opened from the Progress hub. Every exercise with a logged workout, most
// recently trained first, each with a sparkline and its headline number (a
// one-workout lift shows "1 session" instead of a trend, #156).
// Tapping one opens the same history sheet (and #21's chart) the Exercises
// tab does.
import { computed, onMounted, ref } from 'vue'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import { historiesByExercise, liftProgressRows } from '../lib/progressHub'
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_TINTS, MUSCLE_GROUPS, type MuscleGroup } from '../lib/muscleGroups'
import PageHeader from './PageHeader.vue'
import Sparkline from './Sparkline.vue'
import SkeletonRows from './SkeletonRows.vue'
import ExerciseHistoryDetail from './ExerciseHistoryDetail.vue'
import PremiumMark from './PremiumMark.vue'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'
import { hasPremium } from '../lib/premium'

const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const profile = useProfileStore()

onMounted(() => {
  if (!workout.progressSetsFetched) workout.fetchProgressSets()
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
})

const rows = computed(() => liftProgressRows(exercises.exercises, historiesByExercise(workout.progressSets), undefined, profile.weightUnit))

const query = ref('')
// Same muscle chips as the Add exercise sheet; null is "All". Only groups
// that have a row here are offered.
const chip = ref<MuscleGroup | null>(null)
const chipGroups = computed(() => MUSCLE_GROUPS.filter((g) => rows.value.some((r) => r.muscleGroup === g)))

const visibleRows = computed(() => {
  const q = query.value.trim().toLowerCase()
  return rows.value.filter(
    (r) => (chip.value === null || r.muscleGroup === chip.value) && (!q || r.name.toLowerCase().includes(q)),
  )
})

const historyExerciseId = ref<string | null>(null)

// Issue #133: everyone sees a flat lift's chip. With Premium it opens the
// lift's chart (where the tip lives); without, a Premium preview under the row.
const previewExerciseId = ref<string | null>(null)

function tapFlatChip(exerciseId: string) {
  if (hasPremium('progress')) historyExerciseId.value = exerciseId
  else previewExerciseId.value = previewExerciseId.value === exerciseId ? null : exerciseId
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="lift-progress">
    <router-link :to="{ name: 'progress' }" class="back-link" aria-label="Back to Progress"><span aria-hidden="true">‹</span>Progress</router-link>
    <PageHeader title="Lift progress" />

    <label class="search">
      <span class="sr-only">Search exercises</span>
      <input v-model="query" type="search" placeholder="Search exercises" />
    </label>

    <div v-if="chipGroups.length > 0" class="chip-row" role="group" aria-label="Filter by muscle group">
      <button
        type="button"
        class="chip"
        :class="{ 'chip-selected': chip === null }"
        style="--c: var(--text-dim)"
        :aria-pressed="chip === null"
        @click="chip = null"
      >
        All
      </button>
      <button
        v-for="group in chipGroups"
        :key="group"
        type="button"
        class="chip"
        :class="{ 'chip-selected': chip === group }"
        :style="{ '--c': MUSCLE_GROUP_TINTS[group] }"
        :aria-pressed="chip === group"
        @click="chip = group"
      >
        <span class="chip-dot" aria-hidden="true"></span>{{ MUSCLE_GROUP_LABELS[group] }}
      </button>
    </div>

    <SkeletonRows v-if="!workout.progressSetsFetched" :rows="3" />
    <template v-else>
      <p v-if="rows.length === 0" class="empty">Log a workout to see your lifts here.</p>
      <p v-else-if="visibleRows.length === 0" class="empty">No matching exercises.</p>
      <template v-else>
        <div class="section-label">Recently trained</div>
        <ul class="lift-list">
          <li v-for="row in visibleRows" :key="row.exerciseId" class="lift-card">
            <button type="button" class="lift-row" :class="{ 'has-chip': row.flatSince }" @click="historyExerciseId = row.exerciseId">
              <span class="lift-text">
                <span class="lift-name">{{ row.name }}</span>
                <span class="lift-meta">{{ row.metricLabel }} · {{ formatShortDate(row.lastPerformedAt) }}</span>
              </span>
              <Sparkline
                v-if="row.spark.length > 1"
                class="lift-spark"
                :class="{ flat: row.pill && row.pill.trend !== 'up' }"
                :values="row.spark"
                :flipped="row.flipped"
                :width="70"
                :height="28"
              />
              <span class="lift-value">
                <b>{{ row.headline }}</b>
                <span v-if="row.pill" :class="row.pill.trend === 'up' ? 'up' : 'flat'">{{ row.pill.text }}</span>
                <span v-else-if="row.oneSession" class="flat">1 session</span>
              </span>
            </button>
            <button v-if="row.flatSince" type="button" class="flat-chip" @click="tapFlatChip(row.exerciseId)">
              Flat since {{ formatShortDate(row.flatSince) }}<PremiumMark v-if="!hasPremium('progress')" />
            </button>
            <div v-if="previewExerciseId === row.exerciseId && !hasPremium('progress')" class="flat-preview">
              <PremiumPreviewPanel
                feature="progress"
                title="Plateau calls are part of Premium"
                body="See when a lift has stalled, and one change to try to get it moving."
                @back="previewExerciseId = null"
              />
            </div>
          </li>
        </ul>
      </template>
    </template>

    <ExerciseHistoryDetail
      v-if="historyExerciseId"
      :exercise-id="historyExerciseId"
      @dismiss="historyExerciseId = null"
    />
  </div>
</template>

<style scoped>
.search {
  display: block;
  margin-bottom: 10px;
}

.search input {
  width: 100%;
  height: 44px;
  box-sizing: border-box;
  padding: 0 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 1rem;
}

.chip-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  margin: 0 -16px 12px;
  padding: 0 16px 2px;
  scrollbar-width: none;
}

.chip-row::-webkit-scrollbar {
  display: none;
}

.chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 0 11px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-dim);
}

.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c);
}

.chip-selected {
  background: color-mix(in srgb, var(--c) 22%, var(--surface));
  border-color: var(--c);
  color: var(--text);
}

.section-label {
  margin: 4px 2px 8px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.lift-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lift-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.lift-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: auto;
  padding: 11px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  text-align: left;
}

.lift-row.has-chip {
  padding-bottom: 6px;
}

.flat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
  margin: 0 12px 10px;
  padding: 0 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--secondary) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--secondary) 35%, transparent);
  color: var(--secondary);
  font-size: 0.72rem;
  font-weight: 800;
}

.flat-preview {
  display: flex;
  justify-content: center;
  padding: 0 12px 12px;
}

.lift-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.lift-name {
  font-size: 0.93rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.lift-meta {
  margin-top: 1px;
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-dim);
}

.lift-spark {
  color: var(--accent);
}

.lift-spark.flat {
  color: var(--text-dim);
}

.lift-value {
  flex-shrink: 0;
  min-width: 64px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.lift-value b {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text);
  white-space: nowrap;
}

.up,
.flat {
  font-size: 0.7rem;
  font-weight: 800;
  white-space: nowrap;
}

.up {
  color: var(--success);
}

.flat {
  color: var(--text-dim);
}

.empty {
  text-align: center;
  padding: 24px 0;
  color: var(--text-dim);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 360px) {
  .lift-row {
    gap: 8px;
  }

  .lift-spark {
    width: 48px;
    height: 20px;
  }
}
</style>
