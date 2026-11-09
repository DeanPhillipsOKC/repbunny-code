<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProfileStore } from '../stores/profile'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { useExercisesStore } from '../stores/exercises'
import BodyStatsModal from './BodyStatsModal.vue'
import ExerciseHistoryDetail from './ExerciseHistoryDetail.vue'
import ExerciseLibraryBrowser from './ExerciseLibraryBrowser.vue'
import MuscleBadge from './MuscleBadge.vue'
import ExerciseFormSheet from './ExerciseFormSheet.vue'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'
import { needsMissingBodyWeightPrompt } from '../lib/bodyStats'
import { MUSCLE_GROUP_LABELS } from '../lib/muscleGroups'
import { dismissedLinks, pendingLinkSuggestions } from '../lib/libraryLink'
import type { Exercise, LoadType } from '../lib/types'

const exercises = useExercisesStore()
const profile = useProfileStore()
const bodyWeight = useBodyWeightStore()
const route = useRoute()
const router = useRouter()

// Issue #39: "My exercises" / "Library" segments. The Library segment lives
// in the URL (?view=library) so back from a library entry returns to it.
const showingLibrary = computed(() => route.query.view === 'library')

function showSegment(library: boolean) {
  if (library === showingLibrary.value) return
  router.replace({ query: library ? { view: 'library' } : {} })
}

// Backlog item 1: id of the exercise whose history overlay is open, null
// means none.
const viewingHistoryFor = ref<string | null>(null)
const errorMessage = ref('')

// Backlog item 78: right after creating a bodyweight/assisted exercise, with
// no body weight on file yet, prompt for one (shared trigger logic with the
// in-workout prompt via needsMissingBodyWeightPrompt — see WorkoutLogger.vue
// for the other half). Not tied to a workout, so there's no "suppress for
// the rest of this session" state here — just open/closed.
const showMissingWeightModal = ref(false)

// Issue #91: the exercise being edited in ExerciseFormSheet (null = none).
// Was an inline form expanded inside the row (item 24), roughly four screens
// long, which left you mid-list inside it.
const editingExercise = ref<Exercise | null>(null)

// Issue #42: the one-time check screen (MuscleCheckScreen.vue) can be put off
// with "Later", so this tab keeps a way back to it while anything's unset.
const needsGroupCount = computed(() => exercises.activeExercises.filter((e) => !e.muscle_group).length)

// Unlinked exercises whose names look like a library entry (libraryLink.ts).
const linkCount = computed(() => pendingLinkSuggestions(exercises.exercises, dismissedLinks.value).length)

function muscleSummary(exercise: Exercise): string {
  if (!exercise.muscle_group) return 'No muscle group yet'
  const main = MUSCLE_GROUP_LABELS[exercise.muscle_group]
  if (exercise.also_works.length === 0) return main
  return `${main} · also works ${exercise.also_works.map((g) => MUSCLE_GROUP_LABELS[g]).join(', ')}`
}
// Backlog item 24 decision (docs/backlog-archive.md, 2026-09-24): "Archive"
// had no restore path anywhere in the UI, so it behaved exactly like a
// permanent delete already — the DB still soft-deletes via `is_archived`
// (needed so removing an exercise doesn't break the FK reference from
// existing sets/workout_template_exercises rows), but the UI now calls it
// what it is and requires an explicit confirm step, same inline-toggle
// pattern as WorkoutHistory.vue's workout delete (item 31).
const confirmingDeleteId = ref<string | null>(null)

onMounted(() => {
  exercises.fetchExercises()
  if (!profile.fetched) profile.fetchProfile()
  if (!bodyWeight.fetched) bodyWeight.fetchEntries()
})

// Issue #63: the create form lives in a sheet behind "New exercise", so the
// list is the first thing on this tab. `newSheetName` prefills its Name.
const showNewSheet = ref(false)
const newSheetName = ref('')

function openNewSheet(prefill = '') {
  newSheetName.value = prefill
  showNewSheet.value = true
}

function handleCreated(loadType: LoadType) {
  showNewSheet.value = false
  if (needsMissingBodyWeightPrompt(loadType, bodyWeight.latestEntry !== null, profile.missingWeightPromptOptOut)) {
    showMissingWeightModal.value = true
  }
}

async function handleMissingWeightSave(payload: { weight: number; weightUnit: 'lb' | 'kg' }) {
  await bodyWeight.logWeight(payload.weight, payload.weightUnit)
  showMissingWeightModal.value = false
}

function closeMissingWeightModal() {
  showMissingWeightModal.value = false
}

async function handleMissingWeightOptOut() {
  await profile.updateMissingWeightPromptOptOut(true)
  showMissingWeightModal.value = false
}

// Issue #265: "You already have <name>" in the New exercise sheet.
function openExisting(exercise: Exercise) {
  showNewSheet.value = false
  editingExercise.value = exercise
}

// Issue #549: tapping the row opens its history, and Edit and Delete sit
// behind one 44px "More" button per row (they were three 36px icons that
// pushed names onto two lines). `actionsOpenId` is the row whose Edit /
// Delete strip is showing, null means none; one at a time. The buttons'
// names stay generic (the row's name is their description) so a by-name
// lookup elsewhere on the page doesn't also hit every row.
const actionsOpenId = ref<string | null>(null)

function toggleActions(id: string) {
  actionsOpenId.value = actionsOpenId.value === id ? null : id
}

function viewHistory(id: string) {
  actionsOpenId.value = null
  viewingHistoryFor.value = id
}

function startDeleting(id: string) {
  actionsOpenId.value = null
  confirmingDeleteId.value = id
}

function startEditing(exercise: Exercise) {
  actionsOpenId.value = null
  editingExercise.value = exercise
}

// Issue #86: the Library's "Make your own" / "Create <query>" land here with
// ?new=<name> (empty from the banner). Switches to My exercises and opens
// the New exercise sheet (#63), with Name prefilled if given.
function openNewFromQuery() {
  const value = route.query.new
  if (typeof value !== 'string') return
  viewingHistoryFor.value = null
  router.replace({ query: {} })
  openNewSheet(value.trim())
}

watch(() => route.query.new, openNewFromQuery)
onMounted(openNewFromQuery)

async function confirmDelete(id: string) {
  errorMessage.value = ''
  const { error } = await exercises.archiveExercise(id)
  if (error) {
    errorMessage.value = error.message
  }
  confirmingDeleteId.value = null
}
</script>

<template>
  <div>
    <PageHeader title="Exercises" />

    <div class="segments" role="group" aria-label="Exercises view">
      <button type="button" class="segment" :aria-pressed="!showingLibrary" @click="showSegment(false)">
        My exercises
      </button>
      <button type="button" class="segment" :aria-pressed="showingLibrary" @click="showSegment(true)">Library</button>
    </div>

    <ExerciseLibraryBrowser v-if="showingLibrary" />

    <template v-else>
    <button type="button" class="new-exercise-trigger" @click="openNewSheet()">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      New exercise
    </button>

    <router-link v-if="needsGroupCount > 0" :to="{ name: 'exercise-check' }" class="needs-group-link">
      <MuscleBadge :group="null" tint="var(--highlight)" />
      <span class="needs-group-text">
        {{ needsGroupCount === 1 ? '1 exercise needs' : `${needsGroupCount} exercises need` }} a muscle group
      </span>
      <span class="needs-group-chevron" aria-hidden="true">›</span>
    </router-link>
    <router-link v-if="linkCount > 0" :to="{ name: 'library-link' }" class="needs-group-link link-banner">
      <span class="link-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
        </svg>
      </span>
      <span class="needs-group-text">
        {{ linkCount === 1 ? '1 exercise might match' : `${linkCount} exercises might match` }} the library
      </span>
      <span class="needs-group-chevron" aria-hidden="true">›</span>
    </router-link>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <SkeletonRows v-if="exercises.loading" :rows="3" />

    <ul v-else class="list">
      <li v-for="exercise in exercises.activeExercises" :key="exercise.id" class="row-wrap">
        <template v-if="confirmingDeleteId !== exercise.id">
          <div class="row">
            <button
              type="button"
              class="row-main"
              aria-label="View exercise history"
              :aria-describedby="`exercise-name-${exercise.id}`"
              @click="viewHistory(exercise.id)"
            >
              <MuscleBadge :group="exercise.muscle_group" />
              <span class="row-text">
                <span :id="`exercise-name-${exercise.id}`" class="row-title">{{ exercise.name }}</span>
                <span class="row-sub">{{ muscleSummary(exercise) }}</span>
                <span v-if="exercise.setup_notes || exercise.rest_seconds != null" class="row-tags">
                  <span v-if="exercise.setup_notes" class="tag-pill">{{ exercise.setup_notes }}</span>
                  <span v-if="exercise.rest_seconds" class="tag-pill tag-pill-accent">Rest: {{ exercise.rest_seconds }}s</span>
                  <span v-else-if="exercise.rest_seconds === 0" class="tag-pill">No rest timer</span>
                </span>
              </span>
            </button>
            <button
              type="button"
              class="more-button"
              aria-label="More options"
              :aria-describedby="`exercise-name-${exercise.id}`"
              :aria-expanded="actionsOpenId === exercise.id"
              :aria-controls="`exercise-actions-${exercise.id}`"
              @click="toggleActions(exercise.id)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </div>
          <div v-if="actionsOpenId === exercise.id" :id="`exercise-actions-${exercise.id}`" class="row-action-strip">
            <button type="button" class="strip-button" aria-label="Edit exercise" @click="startEditing(exercise)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              Edit
            </button>
            <button type="button" class="strip-button strip-button-danger" aria-label="Delete exercise" @click="startDeleting(exercise.id)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Delete
            </button>
          </div>
        </template>
        <div v-else class="row confirm-delete">
          <span class="row-sub">Remove {{ exercise.name }}? Your past workouts keep its sets.</span>
          <div class="confirm-actions">
            <button type="button" class="danger small" @click="confirmDelete(exercise.id)">Remove</button>
            <button type="button" class="ghost small" @click="confirmingDeleteId = null">Cancel</button>
          </div>
        </div>
      </li>
    </ul>
    <p v-if="!exercises.loading && exercises.activeExercises.length === 0" class="empty">
      No exercises yet. Add one with New exercise, or pick some from the Library.
    </p>
    </template>

    <ExerciseFormSheet
      v-if="showNewSheet"
      :initial-name="newSheetName"
      @created="handleCreated"
      @open-existing="openExisting"
      @dismiss="showNewSheet = false"
    />

    <ExerciseFormSheet
      v-if="editingExercise"
      :key="editingExercise.id"
      :exercise="editingExercise"
      @saved="editingExercise = null"
      @dismiss="editingExercise = null"
    />

    <ExerciseHistoryDetail
      v-if="viewingHistoryFor"
      :exercise-id="viewingHistoryFor"
      @dismiss="viewingHistoryFor = null"
    />

    <BodyStatsModal
      v-if="showMissingWeightModal"
      :weight="null"
      :weight-unit="profile.defaultWeightUnit"
      :height="null"
      :height-unit="null"
      hide-height
      heading="Add your body weight"
      intro="This exercise uses your body weight to calculate how much you lifted."
      show-not-now
      show-dont-ask-again
      @save="handleMissingWeightSave"
      @dismiss="closeMissingWeightModal"
      @opt-out="handleMissingWeightOptOut"
      @close="closeMissingWeightModal"
    />
  </div>
</template>

<style scoped>
.segments {
  display: flex;
  padding: 3px;
  margin-bottom: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.segment {
  flex: 1;
  min-height: 38px;
  padding: 0 8px;
  background: transparent;
  border: none;
  border-radius: 9px;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dim);
}

.segment[aria-pressed='true'] {
  background: var(--surface-2);
  color: var(--text);
  box-shadow: 0 0 0 1px var(--border);
}

.new-exercise-trigger {
  width: 100%;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}

.new-exercise-trigger:active {
  background: var(--accent-pressed);
  border-color: var(--accent-pressed);
}
.error {
  color: var(--danger);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row-wrap {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 4px;
}

/* The whole row (badge, name, muscles, tags) opens the history sheet. */
.row-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
  min-height: 64px;
  padding: 12px 0 12px 14px;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  text-align: left;
  font-weight: inherit;
}

.row-main:active {
  transform: none;
  background: color-mix(in srgb, var(--surface-2) 70%, transparent);
}

.row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.row-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.more-button {
  width: 44px;
  height: 44px;
  min-height: 44px;
  flex-shrink: 0;
  padding: 0;
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  color: var(--text-dim);
}

.more-button[aria-expanded='true'] {
  background: var(--surface-2);
  color: var(--text);
}

.row-action-strip {
  display: flex;
  gap: 8px;
  padding: 0 14px 12px;
}

.strip-button {
  flex: 1;
  min-height: 44px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: transparent;
  font-size: 0.88rem;
  font-weight: 700;
}

.strip-button-danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
}

.needs-group-link {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--highlight) 10%, var(--surface));
  border: 1px dashed color-mix(in srgb, var(--highlight) 70%, transparent);
  color: var(--text);
  font-weight: 700;
  font-size: 0.9rem;
  text-decoration: none;
}

.needs-group-text {
  flex: 1;
}

.needs-group-chevron {
  color: var(--highlight);
  font-size: 1.2rem;
}

.link-banner {
  background: color-mix(in srgb, var(--secondary) 10%, var(--surface));
  border-color: color-mix(in srgb, var(--secondary) 70%, transparent);
}

.link-banner .needs-group-chevron {
  color: var(--secondary);
}

/* Same footprint as the MuscleBadge on the muscle-group banner. */
.link-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: color-mix(in srgb, var(--secondary) 18%, transparent);
  color: var(--secondary);
}

.row-sub {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.tag-pill {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 0.7rem;
  font-weight: 700;
  white-space: pre-wrap;
}

.tag-pill-accent {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.confirm-delete {
  display: flex;
  padding: 12px 14px;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.confirm-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.danger {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--accent-text);
}

.danger.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-dim);
}

.ghost.small {
  min-height: 36px;
  padding: 0 12px;
  font-size: 0.85rem;
  flex-shrink: 0;
}

.empty {
  text-align: center;
  padding: 32px 0;
}
</style>
