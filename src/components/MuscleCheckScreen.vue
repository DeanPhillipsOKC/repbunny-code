<script setup lang="ts">
import { themeArt } from '../lib/theme'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MuscleBadge from './MuscleBadge.vue'
import MuscleGroupPicker from './MuscleGroupPicker.vue'
import { useExercisesStore } from '../stores/exercises'
import { findLibraryMatch, type LibraryExercise } from '../lib/exerciseLibrary'
import { dismissMuscleCheck } from '../lib/muscleCheck'
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUP_TINTS, type MuscleGroup } from '../lib/muscleGroups'

// Issue #42: screen 6 of docs/design/issue-39-exercise-library.html. Lists
// every unarchived exercise with no muscle group yet, pre-filled from the
// library where the name matches (group, "also works", and library_id).
// Unmatched rows ask. "Looks good" saves every row that has a group; rows
// still unpicked stay null and the Exercises tab keeps a link back here.
const exercises = useExercisesStore()
const router = useRouter()

interface Row {
  id: string
  name: string
  group: MuscleGroup | null
  alsoWorks: MuscleGroup[]
  libraryId: string | null
  // The library entry this name matched, kept so a manual change away from
  // its group drops the library link (and its "also works") instead of
  // keeping a match the user just said was wrong.
  match: LibraryExercise | null
}

const rows = ref<Row[]>([])
const loaded = ref(false)
const pickingId = ref<string | null>(null)
const saving = ref(false)
const errorMessage = ref('')

// Snapshot once: saving mutates the store's exercises, and rows shouldn't
// vanish from under the user while they're still looking at the list.
function buildRows() {
  rows.value = exercises.activeExercises
    .filter((e) => !e.muscle_group)
    .map((e) => {
      const match = findLibraryMatch(e.name)
      return {
        id: e.id,
        name: e.name,
        group: match?.muscleGroup ?? null,
        alsoWorks: match ? [...match.alsoWorks] : [],
        libraryId: match?.id ?? null,
        match,
      }
    })
  loaded.value = true
}

onMounted(async () => {
  if (!exercises.fetched) await exercises.fetchExercises()
  buildRows()
})

function pick(row: Row, group: MuscleGroup) {
  row.group = group
  const keepsMatch = row.match?.muscleGroup === group
  row.alsoWorks = keepsMatch && row.match ? [...row.match.alsoWorks] : []
  row.libraryId = keepsMatch && row.match ? row.match.id : null
  pickingId.value = null
}

function leave() {
  dismissMuscleCheck()
  if (typeof router.options.history.state.back === 'string') router.back()
  else router.replace({ name: 'exercises' })
}

async function handleLooksGood() {
  errorMessage.value = ''
  saving.value = true
  const results = await Promise.all(
    rows.value
      .filter((row): row is Row & { group: MuscleGroup } => row.group !== null)
      .map((row) => exercises.updateMuscleGroup(row.id, row.group, row.alsoWorks, row.libraryId)),
  )
  saving.value = false
  const failed = results.find((r) => r.error)
  if (failed?.error) {
    errorMessage.value = failed.error.message
    return
  }
  leave()
}
</script>

<template>
  <div class="muscle-check">
    <div class="check-banner">
      <img class="check-mascot mascot-art" :src="themeArt('clipboard')" alt="" width="92" height="92" />
      <div>
        <h2 class="check-title">Exercises now know their muscles</h2>
        <p class="check-body">
          We matched yours to the library. Take a quick look so your progress counts in the right place.
        </p>
      </div>
    </div>

    <p v-if="loaded && rows.length === 0" class="row-sub">Every exercise already has a muscle group.</p>

    <ul class="check-list">
      <li v-for="row in rows" :key="row.id" class="check-row-wrap" :aria-label="row.name">
        <div class="check-row">
          <MuscleBadge :group="row.group" tint="var(--highlight)" />
          <span class="check-name">{{ row.name }}</span>
          <button
            type="button"
            class="guess-chip"
            :class="{ 'guess-chip-ask': !row.group }"
            :style="row.group ? { '--c': MUSCLE_GROUP_TINTS[row.group] } : undefined"
            :aria-expanded="pickingId === row.id"
            @click="pickingId = pickingId === row.id ? null : row.id"
          >
            {{ row.group ? MUSCLE_GROUP_LABELS[row.group] : 'Pick a group' }}
            <span aria-hidden="true">▾</span>
          </button>
        </div>
        <MuscleGroupPicker
          v-if="pickingId === row.id"
          class="check-picker"
          :model-value="row.group"
          :legend="`Muscle group for ${row.name}`"
          @update:model-value="pick(row, $event)"
        />
      </li>
    </ul>

    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

    <button type="button" class="btn-accent" :disabled="saving || !loaded" @click="handleLooksGood">Looks good</button>
    <button type="button" class="ghost" :disabled="saving" @click="leave">Later</button>
  </div>
</template>

<style scoped>
.muscle-check {
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}

.check-banner {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.check-mascot {
  width: 92px;
  height: 92px;
  flex-shrink: 0;
  object-fit: contain;
}

.check-title {
  margin: 0;
  font-family: var(--font-display, inherit);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.2;
  /* The global h2 is a small uppercase section label; this is a title. */
  text-transform: none;
  letter-spacing: normal;
  color: var(--text);
}

.check-body {
  margin: 3px 0 0;
  font-size: 0.78rem;
  color: var(--text-dim);
  line-height: 1.4;
}

.check-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-row-wrap {
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.check-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.check-name {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 0.95rem;
}

/* The user asked for every chip to be the same width, centered, never wrapping. */
.guess-chip {
  width: 116px;
  flex-shrink: 0;
  min-height: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 10px;
  white-space: nowrap;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 800;
  color: var(--text);
  background: color-mix(in srgb, var(--c) 20%, var(--surface));
  border: 1px solid var(--c);
}

.guess-chip-ask {
  --c: var(--highlight);
  border-style: dashed;
  color: var(--highlight);
  background: transparent;
}

.check-picker {
  margin-top: 10px;
}

.btn-accent {
  margin-top: 12px;
}

.ghost {
  width: 100%;
  margin-top: 8px;
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.error {
  color: var(--danger);
}
</style>
