<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExercisesStore } from '../stores/exercises'
import { useWorkoutsStore } from '../stores/workouts'
import LibraryEntryFacts from './LibraryEntryFacts.vue'
import MuscleBadge from './MuscleBadge.vue'
import PageHeader from './PageHeader.vue'
import { libraryEntry } from '../lib/exerciseLibrary'

// Issue #39: one starter-library entry (screen 4 of
// docs/design/issue-39-exercise-library.html), opened from a library row in
// the Exercises tab's Library view. (The Add exercise sheet shows entries in
// place since #313.)
const route = useRoute()
const router = useRouter()
const exercises = useExercisesStore()
const workout = useWorkoutsStore()

const entry = computed(() => libraryEntry(String(route.params.id)))

const owned = computed(() => !!entry.value && exercises.ownedLibrary.has(entry.value.id))
const inWorkout = computed(() => !!workout.activeWorkoutId)

onMounted(() => {
  if (!exercises.fetched && !exercises.loading) exercises.fetchExercises()
})

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push({ name: 'exercises', query: { view: 'library' } })
}

const adding = ref(false)
const errorMessage = ref('')

async function add(toWorkout: boolean) {
  if (!entry.value || adding.value) return
  errorMessage.value = ''
  adding.value = true
  const { data, error } = await exercises.addFromLibrary(entry.value)
  adding.value = false
  if (error || !data) {
    errorMessage.value = error?.message ?? 'Could not add exercise.'
    return
  }
  if (toWorkout && workout.activeWorkoutId) {
    // Same as picking it in the Add exercise sheet: an ad-hoc addition to
    // the active workout's deck, selected.
    if (!workout.adHocExerciseIds.includes(data.id)) workout.adHocExerciseIds.push(data.id)
    workout.activeExerciseId = data.id
    router.push({ name: 'home' })
  }
}
</script>

<template>
  <div class="library-detail">
    <!-- Issue #276: back link, then badge, name and Account on one row
         (PageHeader, as on Muscle detail), with the muscle line under it. -->
    <button type="button" class="back-link" aria-label="Back to Library" @click="goBack">
      <span aria-hidden="true">‹</span>Library
    </button>

    <template v-if="entry">
      <PageHeader :title="entry.name">
        <template #before><MuscleBadge :group="entry.muscleGroup" class="head-badge" /></template>
      </PageHeader>
      <LibraryEntryFacts :entry="entry" />

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

      <div v-if="exercises.fetched" class="actions">
        <p v-if="owned" class="owned-note">In your exercises</p>
        <template v-else-if="inWorkout">
          <button type="button" class="btn-accent" :disabled="adding" @click="add(true)">Add to this workout</button>
          <button type="button" class="ghost" :disabled="adding" @click="add(false)">Add to my exercises</button>
        </template>
        <button v-else type="button" class="btn-accent" :disabled="adding" @click="add(false)">
          Add to my exercises
        </button>
      </div>
    </template>

    <template v-else>
      <PageHeader title="Library" />
      <p class="empty">That exercise isn't in the library.</p>
    </template>
  </div>
</template>

<style scoped>
.head-badge.muscle-badge {
  width: 42px;
  height: 42px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

.actions .btn-accent {
  margin-top: 0;
}

.ghost {
  width: 100%;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.owned-note {
  margin: 0;
  padding: 12px;
  text-align: center;
  font-weight: 700;
  color: var(--success);
}

.error {
  color: var(--danger);
}

.empty {
  text-align: center;
  padding: 32px 0;
}
</style>
