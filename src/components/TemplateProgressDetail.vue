<script setup lang="ts">
// Issue #157: one template's total volume per session over time, with the
// exercise charts' range picker (3M by default). Below the chart, the
// session a point stands for (the latest until one is tapped): its date,
// volume, and each exercise's top set. Premium (feature key `progress`, the
// same call as #132's volume charts); without it the chart is blurred under
// PremiumPreviewPanel and only the latest total shows.
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { formatVolume, templateVolumeHistories, volumePoints } from '../lib/templateProgress'
import { formatNumber } from '../lib/finishRecap'
import type { ChartPoint, ProgressRange } from '../lib/progressSeries'
import { hasPremium } from '../lib/premium'
import PageHeader from './PageHeader.vue'
import PremiumPreviewPanel from './PremiumPreviewPanel.vue'
import ProgressChart from './ProgressChart.vue'
import SkeletonRows from './SkeletonRows.vue'
import WorkoutStory from './WorkoutStory.vue'
import { storyLines } from '../lib/workoutEvents'

const route = useRoute()
const router = useRouter()
const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()

const bodyWeightReady = ref(false)

onMounted(() => {
  if (!workout.progressSetsFetched) workout.fetchProgressSets()
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
  // Issue #158: the story markers. The chart draws without them until they land.
  if (!workout.workoutEventsFetched) workout.fetchWorkoutEvents()
  // Issue #168: the note markers, same as the story ones.
  if (!workout.workoutNotesFetched) workout.fetchWorkoutNotes()
  // Bodyweight/assisted volume needs body weight; a failed fetch still
  // renders, those sets just add no volume.
  if (bodyWeight.fetched) bodyWeightReady.value = true
  else bodyWeight.fetchEntries().finally(() => (bodyWeightReady.value = true))
})

const ready = computed(() => workout.progressSetsFetched && exercises.fetched && bodyWeightReady.value)

const history = computed(() =>
  templateVolumeHistories(workout.progressSets, exercises.exercises, bodyWeight.entries, profile.weightUnit, workout.activeWorkoutId).find(
    (h) => h.templateId === route.params.id,
  ) ?? null,
)

watchEffect(() => {
  if (route.name === 'template-progress-detail' && ready.value && !history.value) router.replace({ name: 'template-progress' })
})

const owned = computed(() => hasPremium('progress'))
const range = ref<ProgressRange>('3M')
// Issue #158: a session with a story (a swap, a skip, an early finish) gets
// a marker, and its story shows in the session card below.
function storyFor(workoutId: string): string[] {
  const events = workout.workoutEvents[workoutId]
  return events ? storyLines(events, exercises.exercises) : []
}
// Issue #168: a session with a note gets a marker too, and the note leads
// its session card.
function noteFor(workoutId: string): string | undefined {
  return workout.workoutNotes[workoutId]?.trim() || undefined
}
const points = computed<ChartPoint[]>(() =>
  history.value ? volumePoints(history.value).map((p) => ({ ...p, story: storyFor(p.workoutId), note: noteFor(p.workoutId) })) : [],
)
const latestPoint = computed(() => points.value[points.value.length - 1] ?? null)

const selectedAt = ref<string | null>(null)
function onSelect(point: ChartPoint | null) {
  selectedAt.value = point?.performedAt ?? null
}

// The tapped point's session, or the latest one with volume.
const session = computed(() => {
  const sessions = history.value?.sessions ?? []
  const at = selectedAt.value ?? latestPoint.value?.performedAt
  return sessions.find((s) => s.performedAt === at) ?? null
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <div v-if="history" class="template-progress-detail">
    <router-link :to="{ name: 'template-progress' }" class="back-link" aria-label="Back to Routine progress"><span aria-hidden="true">‹</span>Routine progress</router-link>
    <PageHeader :title="history.name" />

    <SkeletonRows v-if="!ready" :rows="3" />
    <template v-else>
      <p v-if="!owned && latestPoint" class="free-latest" data-testid="template-latest-volume">
        Latest session: <b>{{ formatVolume(latestPoint.value, history.unit) }}</b> · {{ formatDate(latestPoint.performedAt) }}
      </p>

      <div class="card">
        <p v-if="points.length === 0" class="empty">No volume yet. Timed and level sets don't add volume.</p>
        <ProgressChart
          v-else
          v-model:range="range"
          :points="points"
          label="Total volume"
          :unit="history.unit"
          :format="formatNumber"
          :blurred="!owned"
          @select="onSelect"
        >
          <template #overlay>
            <PremiumPreviewPanel
              feature="progress"
              title="Routine progress is part of Premium"
              body="See every session's total volume for this routine over time, and what you lifted in each."
              @back="router.push({ name: 'template-progress' })"
            />
          </template>
        </ProgressChart>
      </div>

      <section v-if="owned && session" class="card session" aria-label="Session" data-testid="template-session">
        <div class="session-head">
          <span class="session-kicker">{{ selectedAt ? 'Selected session' : 'Latest session' }}</span>
          <span class="session-date">{{ formatDate(session.performedAt) }}</span>
          <b class="session-volume">{{ session.volume === null ? 'No volume' : formatVolume(session.volume, history.unit) }}</b>
        </div>
        <div v-if="noteFor(session.workoutId)" class="session-note" role="note" aria-label="Workout note" data-testid="workout-note">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16z" />
          </svg>
          <p>{{ noteFor(session.workoutId) }}</p>
        </div>
        <WorkoutStory v-if="storyFor(session.workoutId).length > 0" class="session-story" :lines="storyFor(session.workoutId)" />
        <ul class="session-exercises">
          <li v-for="e in session.exercises" :key="e.exerciseId">
            <span class="exercise-name">{{ e.name }}</span>
            <span class="exercise-top">
              <b>{{ e.topSet }}</b>
              <small>{{ e.sets }} {{ e.sets === 1 ? 'set' : 'sets' }}</small>
            </span>
          </li>
        </ul>
        <p v-if="!selectedAt && points.length > 1" class="hint">Tap a point to see that session.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.card {
  margin-bottom: 14px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.free-latest {
  margin: -4px 0 12px;
  font-size: 0.86rem;
  color: var(--text-dim);
}

.free-latest b {
  color: var(--text);
}

.empty {
  margin: 0;
  padding: 18px 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-dim);
}

.session-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  margin-bottom: 8px;
}

.session-kicker {
  flex-basis: 100%;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.session-date {
  font-weight: 700;
}

.session-volume {
  margin-left: auto;
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--accent);
  white-space: nowrap;
}

.session-story {
  margin-bottom: 8px;
}

.session-note {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border-left: 3px solid var(--accent);
  background: var(--surface-2);
  color: var(--accent);
  font-size: 0.8rem;
  line-height: 1.4;
}

.session-note svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.session-note p {
  margin: 0;
  color: var(--text);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.session-exercises {
  display: flex;
  flex-direction: column;
}

.session-exercises li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  border-top: 1px solid var(--border);
  font-size: 0.86rem;
}

.exercise-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.exercise-top {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.exercise-top small {
  font-size: 0.7rem;
  color: var(--text-dim);
}

.hint {
  margin: 8px 0 0;
  font-size: 0.74rem;
  color: var(--text-dim);
}
</style>
