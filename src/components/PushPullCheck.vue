<script setup lang="ts">
// Issue #173: "Set push or pull", opened from the Balance card's "not
// counted" line. Lists upper-body exercises Balance can't place yet (no
// push_pull of their own, no library movement, not chest) that are in an
// active template or were logged in the last 4 weeks. Each row saves on
// tap. Modeled on MuscleCheckScreen.vue.
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useExercisesStore } from '../stores/exercises'
import { useTemplatesStore } from '../stores/templates'
import { useWorkoutsStore } from '../stores/workouts'
import { pushPullToSet } from '../lib/balance'
import { libraryMovementOf } from '../lib/exerciseLibrary'
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from '../lib/muscleGroups'
import type { PushPull } from '../lib/types'
import MuscleBadge from './MuscleBadge.vue'
import PushPullPicker from './PushPullPicker.vue'

const exercises = useExercisesStore()
const templates = useTemplatesStore()
const workout = useWorkoutsStore()
const router = useRouter()

interface Row {
  id: string
  name: string
  group: MuscleGroup | null
  value: PushPull | null
}

const rows = ref<Row[]>([])
const loaded = ref(false)
const busyId = ref<string | null>(null)
const errorMessage = ref('')

// Snapshot once: answered rows stay on screen, marked saved, instead of
// disappearing under the user's thumb.
function buildRows() {
  const templateIds = templates.activeTemplates.flatMap((t) => t.exercise_refs?.map((r) => r.exercise_id) ?? [])
  rows.value = pushPullToSet(exercises.exercises, workout.progressSets, templateIds, libraryMovementOf).map((e) => ({
    id: e.id,
    name: e.name,
    group: e.muscle_group,
    value: null,
  }))
  loaded.value = true
}

onMounted(async () => {
  await Promise.all([
    exercises.fetched ? null : exercises.fetchExercises(),
    templates.fetched ? null : templates.fetchTemplates(),
    workout.progressSetsFetched ? null : workout.fetchProgressSets(),
  ])
  buildRows()
})

async function pick(row: Row, value: PushPull) {
  errorMessage.value = ''
  busyId.value = row.id
  const { error } = await exercises.updatePushPull(row.id, value)
  busyId.value = null
  if (error) {
    errorMessage.value = error.message
    return
  }
  row.value = value
}
</script>

<template>
  <div class="push-pull-check">
    <router-link :to="{ name: 'muscle-progress' }" class="back-link" aria-label="Back to Muscle groups">
      <span aria-hidden="true">‹</span>Muscle groups
    </router-link>
    <h2 class="check-title">Push or pull?</h2>
    <p class="check-body">
      Balance compares push and pull sets. Tell it which side these are on so they count. Presses and raises are
      push; rows, pulldowns, and curls are pull.
    </p>

    <p v-if="loaded && rows.length === 0" class="check-empty" data-testid="push-pull-empty">
      Nothing to set. Every upper-body exercise you train counts toward push or pull.
    </p>

    <ul class="check-list">
      <li v-for="row in rows" :key="row.id" class="check-row" :aria-label="row.name" data-testid="push-pull-row">
        <div class="row-head">
          <MuscleBadge :group="row.group" />
          <span class="row-name">
            {{ row.name }}
            <small v-if="row.group">{{ MUSCLE_GROUP_LABELS[row.group] }}</small>
          </span>
          <span v-if="row.value" class="saved" role="status">Saved</span>
        </div>
        <PushPullPicker
          :model-value="row.value"
          :legend="`Push or pull for ${row.name}`"
          hide-legend
          :disabled="busyId === row.id"
          @update:model-value="pick(row, $event)"
        />
      </li>
    </ul>

    <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

    <button type="button" class="btn-accent" @click="router.push({ name: 'muscle-progress' })">Done</button>
  </div>
</template>

<style scoped>
.push-pull-check {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}

.back-link {
  align-self: flex-start;
}

.check-title {
  margin: 0;
  font-family: var(--font-display, inherit);
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.2;
  /* The global h2 is a small uppercase section label; this is a title. */
  text-transform: none;
  letter-spacing: normal;
  color: var(--text);
}

.check-body,
.check-empty {
  margin: 4px 0 14px;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--text-dim);
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.check-row {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.row-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row-name {
  flex: 1;
  min-width: 0;
  font-weight: 800;
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.row-name small {
  display: block;
  font-weight: 400;
  font-size: 0.74rem;
  color: var(--text-dim);
}

.saved {
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--success);
}

.error {
  color: var(--danger);
}
</style>
