<script setup lang="ts">
// Issue #157: Routine progress, opened from the Progress hub. Every
// template with a finished session, most recently trained first, with its
// latest session's total volume. With Premium each row also gets a
// sparkline and a change pill (Lift progress's look); free keeps the latest
// total, and the chart behind each row is a Premium preview.
import { computed, onMounted } from 'vue'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useProfileStore } from '../stores/profile'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { templateProgressRows, templateVolumeHistories } from '../lib/templateProgress'
import { hasPremium } from '../lib/premium'
import PageHeader from './PageHeader.vue'
import PremiumMark from './PremiumMark.vue'
import SkeletonRows from './SkeletonRows.vue'
import Sparkline from './Sparkline.vue'

const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()

onMounted(() => {
  if (!workout.progressSetsFetched) workout.fetchProgressSets()
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
  if (!bodyWeight.fetched) bodyWeight.fetchEntries()
})

const owned = computed(() => hasPremium('progress'))

const rows = computed(() =>
  templateProgressRows(
    templateVolumeHistories(workout.progressSets, exercises.exercises, bodyWeight.entries, profile.weightUnit, workout.activeWorkoutId),
  ),
)

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="template-progress">
    <router-link :to="{ name: 'progress' }" class="back-link" aria-label="Back to Progress"><span aria-hidden="true">‹</span>Progress</router-link>
    <PageHeader title="Routine progress" />
    <p class="lede">Total volume of each session, routine by routine.</p>

    <SkeletonRows v-if="!workout.progressSetsFetched || !exercises.fetched" :rows="3" />
    <template v-else>
      <p v-if="rows.length === 0" class="empty">Start a workout from a routine to see it here.</p>
      <template v-else>
        <div class="section-label">Recently trained</div>
        <ul class="template-list">
          <li v-for="row in rows" :key="row.templateId">
            <router-link
              :to="{ name: 'template-progress-detail', params: { id: row.templateId } }"
              class="template-row"
              :aria-label="`${row.name}, ${row.headline ?? 'no volume'}`"
            >
              <span class="template-text">
                <span class="template-name">{{ row.name }}</span>
                <span class="template-meta">
                  {{ row.sessionCount }} {{ row.sessionCount === 1 ? 'session' : 'sessions' }} · {{ formatShortDate(row.lastPerformedAt) }}
                </span>
              </span>
              <Sparkline
                v-if="owned && row.spark.length > 1"
                class="template-spark"
                :class="{ flat: row.pill && row.pill.trend !== 'up' }"
                :values="row.spark"
                :width="70"
                :height="28"
              />
              <span class="template-value">
                <b>{{ row.headline ?? 'No volume' }}</b>
                <template v-if="owned">
                  <span v-if="row.pill" :class="row.pill.trend === 'up' ? 'up' : 'flat'">{{ row.pill.text }}</span>
                  <span v-else-if="row.headline" class="flat">latest</span>
                </template>
                <span v-else class="flat">latest<PremiumMark /></span>
              </span>
            </router-link>
          </li>
        </ul>
        <p class="note">Timed and level sets don't add volume. Freeform workouts aren't included.</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.section-label {
  margin: 4px 2px 8px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.template-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  text-decoration: none;
}

.template-row:active {
  transform: scale(0.99);
}

.template-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.template-name {
  font-size: 0.93rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.template-meta {
  margin-top: 1px;
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-dim);
}

.template-spark {
  color: var(--accent);
}

.template-spark.flat {
  color: var(--text-dim);
}

.template-value {
  flex-shrink: 0;
  min-width: 64px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.template-value b {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
}

.up,
.flat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
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

.note {
  margin: 12px 2px 0;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.empty {
  text-align: center;
  padding: 24px 0;
  color: var(--text-dim);
}

@media (max-width: 360px) {
  .template-row {
    gap: 8px;
  }

  .template-spark {
    width: 48px;
    height: 20px;
  }
}
</style>
