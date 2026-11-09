<script setup lang="ts">
import { computed, ref } from 'vue'
import ExerciseFormSheet from './ExerciseFormSheet.vue'
import LibraryEntryFacts from './LibraryEntryFacts.vue'
import LibraryRow from './LibraryRow.vue'
import MuscleBadge from './MuscleBadge.vue'
import { useExercisesStore } from '../stores/exercises'
import { useEscapeClose } from '../lib/escapeClose'
import { useProgressiveList } from '../lib/progressiveList'
import { LIBRARY_BY_NAME, libraryMatchesSearch, type LibraryExercise } from '../lib/exerciseLibrary'
import {
  MUSCLE_GROUP_ADJECTIVES,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_TINTS,
  MUSCLE_GROUPS,
  type MuscleGroup,
} from '../lib/muscleGroups'

// Redesign item 67: replaces the suggested-exercise chip row and the
// exercise <select> with a bottom sheet opened from the carousel's
// persistent "+". Ranks its default (no search text) list by recency.
// Issue #39 added muscle chips and the starter library below the user's own
// exercises (screen 2 of docs/design/issue-39-exercise-library.html).
// `exercises` is already scoped by the caller to whatever isn't in the
// active workout's carousel deck yet -- including exercises outside the
// active template, since the "+" is deliberately how an ad-hoc addition to a
// templated workout happens now (superseding item 21's stricter dropdown
// scoping, which only ever applied to the auto-populated deck).
const props = defineProps<{
  exercises: { id: string; name: string; muscle_group: MuscleGroup | null }[]
  recentIds: string[]
  // Item 90: creating an exercise from here only makes sense for a freeform
  // workout -- a templated workout's deck is deliberately scoped to the
  // template's own exercises (item 21), so a brand-new exercise would have
  // nowhere to go there. The caller passes `!workout.activeTemplateId`.
  allowCreate?: boolean
  // Issue #6: the template editor keeps the sheet open across several picks.
  // `showDone` swaps the close X for a "Done" text button; `added` maps each
  // exercise already in the template to its target sets, and those rows stay
  // listed but greyed out and unpickable. Both default to the logger's
  // behavior.
  showDone?: boolean
  added?: Record<string, number | null>
  // Issue #43: the logger keeps the sheet open across picks too, but its
  // "✓ Added" rows stay tappable (tapping one emits `deselect` to un-pick
  // it), and a floating "{N} added · Done" bar appears after the first pick.
  multiPick?: boolean
  // Issue #207: the user has no exercises yet, so the list is the library.
  firstRun?: boolean
  // Issue #313: the in-sheet library detail's add button.
  addLabel?: string
}>()

function isAdded(id: string): boolean {
  return props.added !== undefined && id in props.added
}

// An added row is greyed out and unpickable in the template editor, but a
// toggle in multi-pick mode.
function isRowDisabled(id: string): boolean {
  return isAdded(id) && !props.multiPick
}

function pickRow(id: string) {
  if (props.multiPick && isAdded(id)) emit('deselect', id)
  else emit('select', id)
}

const addedCount = computed(() => Object.keys(props.added ?? {}).length)

function addedLabel(id: string): string {
  const sets = props.added?.[id]
  return sets ? `✓ Added · ${sets} set${sets === 1 ? '' : 's'}` : '✓ Added'
}

const emit = defineEmits<{
  select: [id: string]
  deselect: [id: string]
  dismiss: []
  manage: []
}>()

const query = ref('')
const exercisesStore = useExercisesStore()

// Issue #39: muscle chips under the search box. null is "All".
const chip = ref<MuscleGroup | null>(null)

function matchesChip(group: MuscleGroup | null): boolean {
  return chip.value === null || group === chip.value
}

// Issue #781: New exercise opens ExerciseFormSheet on top of this sheet, so
// no part of the list shows behind the form. Name prefills from the search.
const newExerciseName = ref<string | null>(null)

function startNewExercise() {
  newExerciseName.value = query.value.trim()
}

// ExerciseFormSheet saved it already; pick it like any row, back on the list.
function pickNew(id: string) {
  newExerciseName.value = null
  emit('select', id)
}

const filteredResults = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return props.exercises.filter((e) => e.name.toLowerCase().includes(q) && matchesChip(e.muscle_group))
})

// Issue #39: the selected group's own exercises, alphabetical like the rest.
const groupExercises = computed(() => props.exercises.filter((e) => matchesChip(e.muscle_group)))

// Library entries the user doesn't own yet, narrowed by chip and search
// (names and aliases).
const libraryResults = computed(() =>
  LIBRARY_BY_NAME.filter(
    (entry) =>
      !exercisesStore.ownedLibrary.has(entry.id) &&
      matchesChip(entry.muscleGroup) &&
      libraryMatchesSearch(entry, query.value),
  ),
)
const libraryShown = useProgressiveList(libraryResults)

const librarySectionLabel = computed(() =>
  chip.value ? `From the library · ${MUSCLE_GROUP_LABELS[chip.value]}` : 'From the library',
)

// "+ Add" (and the create form's "Use it") makes the entry a normal
// exercise, then picks it exactly like tapping an existing one: the caller
// adds it to the workout, template, or past workout from there.
const addingLibraryId = ref<string | null>(null)
const libraryError = ref('')

async function addLibraryEntry(entry: LibraryExercise) {
  if (addingLibraryId.value) return
  libraryError.value = ''
  addingLibraryId.value = entry.id
  const { data, error } = await exercisesStore.addFromLibrary(entry)
  addingLibraryId.value = null
  if (error || !data) {
    libraryError.value = error?.message ?? 'Could not add exercise.'
    return
  }
  viewingEntry.value = null
  emit('select', data.id)
}

// Issue #313: a library row's name shows the entry in place of the list,
// rather than routing to the Library detail screen, which dropped the sheet
// and its picks. Back (or adding it) returns to the list as it was.
const viewingEntry = ref<LibraryExercise | null>(null)

// Issue #783: Escape (and Android back) steps out of the detail or form first.
useEscapeClose(() => (viewingEntry.value ? (viewingEntry.value = null) : emit('dismiss')))

function openLibraryEntry(entry: LibraryExercise) {
  viewingEntry.value = entry
}

function isRecent(id: string): boolean {
  return props.recentIds.includes(id)
}

const RECENT_SECTION_SIZE = 5

// Recently-logged entries first (in actual recency order), then padded with
// not-yet-logged exercises so a brand-new account's sheet isn't empty.
const recentSection = computed(() => {
  const byId = new Map(props.exercises.map((e) => [e.id, e]))
  const result: { id: string; name: string; muscle_group: MuscleGroup | null; recent: boolean }[] = []

  for (const id of props.recentIds) {
    const exercise = byId.get(id)
    if (!exercise) continue
    result.push({ ...exercise, recent: true })
    if (result.length >= RECENT_SECTION_SIZE) return result
  }
  for (const exercise of props.exercises) {
    if (result.some((r) => r.id === exercise.id)) continue
    result.push({ ...exercise, recent: false })
    if (result.length >= RECENT_SECTION_SIZE) break
  }
  return result
})

const remainingSection = computed(() => {
  const shown = new Set(recentSection.value.map((r) => r.id))
  return props.exercises.filter((e) => !shown.has(e.id))
})
</script>

<template>
  <div class="sheet-overlay" @click.self="emit('dismiss')">
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Add exercise">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div v-if="viewingEntry" class="entry-view">
        <button type="button" class="entry-back" aria-label="Back to Add exercise" @click="viewingEntry = null">
          <span aria-hidden="true">‹</span>Add exercise
        </button>
        <div class="entry-scroll">
          <div class="entry-head">
            <MuscleBadge :group="viewingEntry.muscleGroup" class="entry-badge" />
            <h3>{{ viewingEntry.name }}</h3>
          </div>
          <LibraryEntryFacts :entry="viewingEntry" />
        </div>
        <p v-if="libraryError" class="error">{{ libraryError }}</p>
        <button
          type="button"
          class="btn-accent entry-add"
          :disabled="addingLibraryId !== null"
          @click="addLibraryEntry(viewingEntry)"
        >
          {{ addLabel ?? 'Add to workout' }}
        </button>
      </div>
      <template v-else>
      <div class="sheet-header">
        <h3>Add exercise</h3>
        <button v-if="showDone" type="button" class="sheet-done" @click="emit('dismiss')">Done</button>
        <button v-else type="button" class="sheet-close" aria-label="Close" @click="emit('dismiss')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <label class="sheet-search">
        <span class="sr-only">Search exercises</span>
        <input v-model="query" type="search" placeholder="Search exercises" />
      </label>

      <div class="chip-row" role="group" aria-label="Filter by muscle group">
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
          v-for="group in MUSCLE_GROUPS"
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

      <div class="sheet-body">
        <p v-if="firstRun && !query.trim() && !chip" class="first-run-hint">
          <span class="first-run-mascot" aria-hidden="true"><img src="/icon-512.png" alt="" /></span>
          Pick your first exercise from the library, or make your own.
        </p>
        <p v-if="libraryError" class="error">{{ libraryError }}</p>

        <template v-if="query.trim()">
          <p v-if="filteredResults.length === 0 && libraryResults.length === 0" class="row-sub">
            No exercises match "{{ query }}".
          </p>
          <button v-if="allowCreate && !filteredResults.length && !libraryResults.length"
            type="button" class="btn-accent" @click="startNewExercise">
            Create "{{ query.trim() }}"
          </button>
          <div v-if="filteredResults.length > 0" class="sheet-section">
            <button
              v-for="exercise in filteredResults"
              :key="exercise.id"
              type="button"
              class="sheet-item"
              :class="{ 'sheet-item-added': isAdded(exercise.id) }"
              :aria-label="exercise.name"
              :aria-pressed="multiPick ? isAdded(exercise.id) : undefined"
              :disabled="isRowDisabled(exercise.id)"
              @click="pickRow(exercise.id)"
            >
              <MuscleBadge :group="exercise.muscle_group" />
              <span v-if="isAdded(exercise.id)" aria-hidden="true" class="sheet-item-text">
                <span class="sheet-item-name">{{ exercise.name }}</span>
                <span class="sheet-item-sub">{{ addedLabel(exercise.id) }}</span>
              </span>
              <span v-else aria-hidden="true" class="sheet-item-text">{{ exercise.name }}</span>
            </button>
          </div>
        </template>

        <template v-else-if="chip">
          <div v-if="groupExercises.length > 0" class="sheet-section">
            <span class="sheet-section-label">Your {{ MUSCLE_GROUP_ADJECTIVES[chip] }} exercises</span>
            <button
              v-for="exercise in groupExercises"
              :key="exercise.id"
              type="button"
              class="sheet-item"
              :class="{ 'sheet-item-added': isAdded(exercise.id) }"
              :aria-label="exercise.name"
              :aria-pressed="multiPick ? isAdded(exercise.id) : undefined"
              :disabled="isRowDisabled(exercise.id)"
              @click="pickRow(exercise.id)"
            >
              <MuscleBadge :group="exercise.muscle_group" />
              <span aria-hidden="true" class="sheet-item-text">
                <span class="sheet-item-name">{{ exercise.name }}</span>
                <span class="sheet-item-sub">
                  <template v-if="isAdded(exercise.id)">{{ addedLabel(exercise.id) }}</template>
                  <template v-else>{{ isRecent(exercise.id) ? 'Logged recently' : 'New · not logged yet' }}</template>
                </span>
              </span>
            </button>
          </div>
          <p v-if="groupExercises.length === 0 && libraryResults.length === 0" class="row-sub">
            Nothing left to add for {{ MUSCLE_GROUP_LABELS[chip] }}.
          </p>
        </template>

        <template v-else>
          <p v-if="exercises.length === 0 && !firstRun" class="row-sub">All your exercises are already in this workout.</p>

          <div v-if="recentSection.length > 0" class="sheet-section">
            <span class="sheet-section-label">{{ recentSection.some((r) => !r.recent) ? 'Your exercises' : 'Recently logged' }}</span>
            <button
              v-for="exercise in recentSection"
              :key="exercise.id"
              type="button"
              class="sheet-item"
              :class="{ 'sheet-item-added': isAdded(exercise.id) }"
              :aria-label="exercise.name"
              :aria-pressed="multiPick ? isAdded(exercise.id) : undefined"
              :disabled="isRowDisabled(exercise.id)"
              @click="pickRow(exercise.id)"
            >
              <MuscleBadge :group="exercise.muscle_group" />
              <span aria-hidden="true" class="sheet-item-text">
                <span class="sheet-item-name">{{ exercise.name }}</span>
                <span class="sheet-item-sub">
                  <template v-if="isAdded(exercise.id)">{{ addedLabel(exercise.id) }}</template>
                  <template v-else>{{ exercise.recent ? 'Logged recently' : 'New · not logged yet' }}</template>
                </span>
              </span>
            </button>
          </div>

          <div v-if="remainingSection.length > 0" class="sheet-section">
            <span class="sheet-section-label">All exercises</span>
            <button
              v-for="exercise in remainingSection"
              :key="exercise.id"
              type="button"
              class="sheet-item sheet-item-compact"
              :class="{ 'sheet-item-added': isAdded(exercise.id) }"
              :aria-label="exercise.name"
              :aria-pressed="multiPick ? isAdded(exercise.id) : undefined"
              :disabled="isRowDisabled(exercise.id)"
              @click="pickRow(exercise.id)"
            >
              <MuscleBadge :group="exercise.muscle_group" />
              <span v-if="isAdded(exercise.id)" aria-hidden="true" class="sheet-item-text">
                <span class="sheet-item-name">{{ exercise.name }}</span>
                <span class="sheet-item-sub">{{ addedLabel(exercise.id) }}</span>
              </span>
              <span v-else aria-hidden="true" class="sheet-item-text">{{ exercise.name }}</span>
            </button>
          </div>
        </template>

        <div v-if="libraryResults.length > 0" class="sheet-section">
          <span class="sheet-section-label">{{ librarySectionLabel }}</span>
          <LibraryRow
            v-for="entry in libraryShown"
            :key="entry.id"
            :entry="entry"
            :busy="addingLibraryId !== null"
            @add="addLibraryEntry(entry)"
            @open="openLibraryEntry(entry)"
          />
        </div>
      </div>

      <p class="sheet-manage">
        Can't find it?
        <template v-if="allowCreate">
          <button type="button" class="sheet-manage-link" @click="startNewExercise">New exercise</button>
        </template>
        <span v-if="allowCreate" aria-hidden="true"> · </span>
        <button type="button" class="sheet-manage-link sheet-manage-small" @click="emit('manage')">Manage exercises</button>
      </p>

      <!-- A flex footer rather than position: absolute, so the scrolling
           list above always ends clear of it. -->
      <div v-if="multiPick && addedCount > 0" class="pick-bar" role="status" aria-live="polite">
        <span class="pick-bar-count">
          <span class="pick-bar-check" aria-hidden="true">✓</span>{{ addedCount }} added
        </span>
        <button type="button" class="btn-accent pick-bar-done" @click="emit('dismiss')">Done</button>
      </div>
      </template>
    </div>
    <ExerciseFormSheet
      v-if="newExerciseName !== null"
      :initial-name="newExerciseName"
      @dismiss="newExerciseName = null"
      @created="(_loadType, id) => pickNew(id)"
      @open-existing="pickNew($event.id)"
    />
  </div>
</template>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  max-height: 82vh;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 20px 20px 0 0;
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.entry-view {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.entry-back {
  align-self: flex-start;
  min-height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--accent);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
}

.entry-scroll {
  min-height: 0;
  overflow-y: auto;
}

.entry-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.entry-head h3 {
  margin: 0;
  font-family: var(--font-display, inherit);
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.entry-badge.muscle-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
}

.entry-add {
  margin-top: 0;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sheet-header h3 {
  margin: 0;
  font-family: var(--font-display, inherit);
}

.sheet-close {
  width: 34px;
  height: 34px;
  min-height: auto;
  padding: 0;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sheet-done {
  min-height: 34px;
  padding: 0 4px;
  background: transparent;
  border: none;
  color: var(--accent);
  font-weight: 700;
}

.sheet-item-added:disabled {
  opacity: 0.55;
}

.sheet-item-added .sheet-item-sub {
  color: var(--success);
}

.sheet-item-added:not(:disabled) {
  border-color: color-mix(in srgb, var(--success) 60%, var(--border));
  background: color-mix(in srgb, var(--success) 10%, var(--surface-2));
}

.pick-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 8px 8px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: 0 6px 20px color-mix(in srgb, var(--shade) 35%, transparent);
}

.pick-bar-count {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.pick-bar-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--success) 22%, transparent);
  color: var(--success);
  font-size: 0.75rem;
}

.pick-bar-done {
  width: auto;
  min-height: 40px;
  margin: 0;
  padding: 0 22px;
  border-radius: 999px;
}

.chip-row {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
  overflow-x: auto;
  margin: 0 -16px;
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

.sheet-search input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 1rem;
}

.sheet-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sheet-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.first-run-hint {
  margin: 0;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--secondary) 12%, transparent);
  font-size: 0.85rem;
  line-height: 1.4;
}

.first-run-mascot {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}

.first-run-mascot img {
  width: 24px;
  height: 24px;
  border-radius: 6px;
}

.sheet-section-label {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  color: var(--text-dim);
  text-transform: uppercase;
  padding: 0 2px;
}

.sheet-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: left;
}

.sheet-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sheet-item-compact {
  background: var(--surface);
}

.after-name {
  margin-top: 16px;
}

.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.error {
  color: var(--danger);
  font-size: 0.8rem;
}

.sheet-item-name {
  font-size: 0.95rem;
  font-weight: 700;
}

.sheet-item-sub {
  font-size: 0.72rem;
  color: var(--text-dim);
}

/* A plain text link, same look as WorkoutLogger's `.link-button` (which is
   scoped there, so it never reached this sheet and left a boxed button). */
.sheet-manage {
  flex-shrink: 0;
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-dim);
}

.sheet-manage-link {
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

.sheet-manage-small {
  font-size: 0.78rem;
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
