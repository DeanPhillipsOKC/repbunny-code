<script setup lang="ts">
import { themeArt } from '../lib/theme'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useExercisesStore } from '../stores/exercises'
import LibraryRow from './LibraryRow.vue'
import MuscleBadge from './MuscleBadge.vue'
import { EXERCISE_LIBRARY, LIBRARY_BY_NAME, libraryMatchesSearch, type LibraryExercise } from '../lib/exerciseLibrary'
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS, type MuscleGroup } from '../lib/muscleGroups'

// Issue #39: the Exercises tab's Library view (screen 5 of
// docs/design/issue-39-exercise-library.html). Opens on the 8 group cards;
// a card lists its entries, and search lists matches across every group.
// The open group lives in the URL (?group=legs) so back from an entry's
// detail lands on the same list.
const exercises = useExercisesStore()
const route = useRoute()
const router = useRouter()

const query = ref('')

const group = computed<MuscleGroup | null>(() => {
  const value = route.query.group
  return typeof value === 'string' && (MUSCLE_GROUPS as string[]).includes(value) ? (value as MuscleGroup) : null
})

const countByGroup = computed(() => {
  const counts = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>
  for (const entry of EXERCISE_LIBRARY) counts[entry.muscleGroup]++
  return counts
})

const listed = computed(() => {
  if (query.value.trim()) return LIBRARY_BY_NAME.filter((entry) => libraryMatchesSearch(entry, query.value))
  if (group.value) return LIBRARY_BY_NAME.filter((entry) => entry.muscleGroup === group.value)
  return []
})

function openGroup(value: MuscleGroup) {
  router.push({ query: { ...route.query, group: value } })
}

// Back when the group was opened from the grid; a direct load of a group URL
// has no grid entry to go back to, so swap the URL instead.
function closeGroup() {
  if (window.history.state?.back) {
    router.back()
    return
  }
  const { group: _group, ...rest } = route.query
  router.replace({ query: rest })
}

function openEntry(entry: LibraryExercise) {
  router.push({ name: 'library-exercise', params: { id: entry.id } })
}

const addingId = ref<string | null>(null)
const errorMessage = ref('')

// Issue #86: the create form lives on My exercises; ?new=<name> opens it
// there with Name prefilled (empty for the banner link).
const trimmedQuery = computed(() => query.value.trim())

function createOwn(nameValue = '') {
  router.push({ name: 'exercises', query: { new: nameValue } })
}

async function addEntry(entry: LibraryExercise) {
  if (addingId.value) return
  errorMessage.value = ''
  addingId.value = entry.id
  const { error } = await exercises.addFromLibrary(entry)
  addingId.value = null
  if (error) errorMessage.value = error.message
}
</script>

<template>
  <div class="library">
    <div class="library-banner">
      <img class="library-mascot mascot-art" :src="themeArt('library')" alt="" width="92" height="92" />
      <div>
        <div class="library-banner-title">{{ EXERCISE_LIBRARY.length }} exercises, ready to go</div>
        <p class="library-banner-body">
          Common gym machines, free weights, bodyweight, and cardio. Anything missing?
          <button type="button" class="make-own" @click="createOwn()">+ Make your own</button>
        </p>
      </div>
    </div>

    <label class="library-search">
      <span class="sr-only">Search the library</span>
      <input v-model="query" type="search" placeholder="Search the library" />
    </label>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <template v-if="query.trim() || group">
      <div v-if="!query.trim() && group" class="library-group-heading">
        <h3>{{ MUSCLE_GROUP_LABELS[group] }}</h3>
        <button type="button" class="all-groups" @click="closeGroup">All groups</button>
      </div>
      <template v-if="listed.length === 0">
        <p class="row-sub">No library exercises match "{{ query }}".</p>
        <button v-if="trimmedQuery" type="button" class="btn-accent" @click="createOwn(trimmedQuery)">
          Create "{{ trimmedQuery }}"
        </button>
      </template>
      <div v-else class="library-list">
        <LibraryRow
          v-for="entry in listed"
          :key="entry.id"
          :entry="entry"
          :owned="exercises.ownedLibrary.has(entry.id)"
          :busy="addingId !== null"
          @add="addEntry(entry)"
          @open="openEntry(entry)"
        />
      </div>
      <p v-if="trimmedQuery && listed.length > 0" class="row-sub not-here">
        Not here?
        <button type="button" class="make-own" @click="createOwn(trimmedQuery)">Create "{{ trimmedQuery }}"</button>
      </p>
    </template>

    <div v-else class="library-groups">
      <button
        v-for="g in MUSCLE_GROUPS"
        :key="g"
        type="button"
        class="library-group-card"
        :aria-label="`${MUSCLE_GROUP_LABELS[g]}, ${countByGroup[g]} exercises`"
        @click="openGroup(g)"
      >
        <MuscleBadge :group="g" />
        <span class="library-group-text" aria-hidden="true">
          <span class="library-group-name">{{ MUSCLE_GROUP_LABELS[g] }}</span>
          <span class="library-group-count">{{ countByGroup[g] }} exercises</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.library-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.library-mascot {
  width: 92px;
  height: 92px;
  flex-shrink: 0;
  object-fit: contain;
}

.library-banner-title {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
}

.library-banner-body {
  margin: 3px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
}

.make-own {
  display: inline;
  min-height: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
}

.not-here {
  margin: 14px 0 0;
  text-align: center;
}

.library-search input {
  height: 44px;
  min-height: 44px;
  margin-bottom: 12px;
  font-size: 1rem;
}

.library-groups {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.library-group-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border-radius: 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  text-align: left;
}

.library-group-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.library-group-name {
  font-weight: 700;
  font-size: 0.92rem;
}

.library-group-count {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-dim);
}

.library-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.library-group-heading h3 {
  margin: 0;
  font-family: var(--font-display);
}

.all-groups {
  min-height: 36px;
  padding: 0 4px;
  background: transparent;
  border: none;
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 700;
}

.library-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.error {
  color: var(--danger);
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
</style>
