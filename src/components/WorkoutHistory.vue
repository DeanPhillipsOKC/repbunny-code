<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkoutsStore } from '../stores/workouts'
import { useExercisesStore } from '../stores/exercises'
import { useTemplatesStore } from '../stores/templates'
import { useBodyWeightStore } from '../stores/bodyWeight'
import { useProfileStore } from '../stores/profile'
import { claimLastTemplateHint, lastTemplateHintOpen, openPremiumSheet, showPremiumNudges } from '../lib/premium'
import { findFirstPrSets } from '../lib/progress'
import { formatSetLabel } from '../lib/setLabel'
import { convertSetWeight, convertWeight } from '../lib/bodyStats'
import { setVolume, workoutVolume } from '../lib/volume'
import { formatNumber } from '../lib/finishRecap'
import { checkSetEntry, isCheckConstraintError, previousHeaviestInHistory, SET_EDIT_FAILED_MESSAGE } from '../lib/setValidation'
import { suggestTemplateName, templateRowsFromSets } from '../lib/templateFromWorkout'
import { formatDurationDigits, formatSecondsAsClock, parseDurationLabel } from '../lib/timedInput'
import { dateTimeInputToIso, defaultPastWorkoutTime, toDateTimeInputValue, workoutDateProblem } from '../lib/workoutDate'
import PageHeader from './PageHeader.vue'
import SkeletonRows from './SkeletonRows.vue'
import AddExerciseSheet from './AddExerciseSheet.vue'
import LastTemplateHint from './LastTemplateHint.vue'
import WeightTypoWarning from './WeightTypoWarning.vue'
import WorkoutStory from './WorkoutStory.vue'
import ExerciseHistoryDetail from './ExerciseHistoryDetail.vue'
import { storyLines } from '../lib/workoutEvents'
import WorkoutFeelPicker from './WorkoutFeelPicker.vue'
import { formatWorkoutLength, workoutMinutes } from '../lib/workoutDuration'
import { formatLogDateTime, formatLogTime, groupWorkoutDays } from '../lib/workoutLogDays'
import WorkoutLogDay from './WorkoutLogDay.vue'
import { feelOf, feelSummary, isTagged, type WorkoutFeel } from '../lib/workoutFeel'
import type { DistanceUnit, LoadType, SetWithExercise, WeightUnit, WorkoutWithSets } from '../lib/types'

const workout = useWorkoutsStore()
const exercises = useExercisesStore()
const templates = useTemplatesStore()
const bodyWeight = useBodyWeightStore()
const profile = useProfileStore()
const router = useRouter()
const route = useRoute()
const errorMessage = ref('')

// Backlog item 31 (revised by item 110): the workout awaiting delete
// confirmation, shown in a centered modal instead of inline at the bottom of
// the card — on a long workout the inline prompt rendered a full screen or
// more below the trigger button. Holds the whole entry (not just an id) so
// the dialog can show its name/date/set count without re-finding it.
const deletingEntry = ref<WorkoutWithSets | null>(null)

function deleteDialogWorkoutName(entry: WorkoutWithSets): string {
  return entry.workout_templates?.name ?? 'Freeform workout'
}

function handleDeleteDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && deletingEntry.value) {
    deletingEntry.value = null
  }
}

onMounted(() => document.addEventListener('keydown', handleDeleteDialogKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleDeleteDialogKeydown))

// Backlog item 32: fix a wrong rep/weight/RPE entry, remove a set, or edit
// the notes on an already-finished workout — same inline-toggle pattern as
// WorkoutLogger.vue's active-workout set editor (item 13), pointed at
// history's DB writes instead. Scoped to sets that already exist; adding a
// brand-new set to a past workout is out of scope (see docs/backlog.md item 32).
const editingSetId = ref<string | null>(null)
const editReps = ref<number | null>(null)
const editWeight = ref<number | null>(null)
const editWeightUnit = ref<WeightUnit>(profile.defaultWeightUnit)
const editRpe = ref<number | null>(null)
const editLevel = ref<number | null>(null)
// Backlog item 93: a timed set's edit form swaps reps/weight for these.
const editDurationInput = ref('')
const editDistance = ref<number | null>(null)
const editDistanceUnit = ref<DistanceUnit>('mi')
const editIncline = ref<number | null>(null)
const editCalories = ref<number | null>(null)
// Issue #336: the set checks' block message and "Save anyway?" question for
// the open editor; `editConfirmed` skips the question once it's answered.
const editNotice = ref('')
const editConfirm = ref('')
const editConfirmed = ref(false)

function clearEditCheck() {
  editNotice.value = ''
  editConfirm.value = ''
  editConfirmed.value = false
}

const editingNotesId = ref<string | null>(null)
const notesDraft = ref('')

// Backlog item 45: only the most recent workout starts expanded to full
// detail (see the "History" artboard) — everything else renders as a
// condensed summary until tapped open. Re-seeded whenever the newest
// workout's id changes (initial load, or the current newest gets deleted
// and an older one takes its place) so "most recent" always starts open.
const expandedIds = ref<Set<string>>(new Set())
watch(
  () => workout.history[0]?.id,
  (id) => {
    if (id) expandedIds.value.add(id)
  },
  { immediate: true },
)

// Issue #137: the training calendar opens a day's workout here with
// ?workout=<id>, expanded and scrolled to, once the log has loaded.
// Issue #179: waits for this mount's own fetch, not just any cached history.
// Focusing on cached history scrolled a timeline that the fetch's skeleton
// then replaced, so every tap landed back at the newest workout.
const historyFetched = ref(false)
const focusId = computed(() => (typeof route.query.workout === 'string' ? route.query.workout : null))
let focusedId: string | null = null
watch(
  () => (historyFetched.value && !workout.loading ? workout.history.find((w) => w.id === focusId.value)?.id : undefined),
  async (id) => {
    if (!id || focusedId === id) return
    focusedId = id
    expandedIds.value.add(id)
    await nextTick()
    document.querySelector(`[data-workout-id="${id}"]`)?.scrollIntoView({ block: 'start' })
  },
  { immediate: true },
)
watch(focusId, () => {
  focusedId = null
})

function toggleExpanded(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  } else {
    expandedIds.value.add(id)
  }
}

// Backlog item 45: distinct timeline marker for a workout that contained a
// record at the time it was logged — replayed across the full history
// rather than just "was this the most recent workout" (see lib/progress.ts).
const prSets = computed(() => findFirstPrSets(workout.history, bodyWeight.entries))
const prWorkoutIds = computed(() => new Set(prSets.value.keys()))
const days = computed(() => groupWorkoutDays(workout.history))

// Issue #579: tapping "PR set this workout" opens that lift's history on the
// record check for its first record set.
const recordCheckFor = ref<{ exerciseId: string; setId: string } | null>(null)
function openPrRecordCheck(workoutId: string) {
  const pr = prSets.value.get(workoutId)
  if (pr) recordCheckFor.value = { exerciseId: pr.exerciseId, setId: pr.setId }
}

// One-line stand-in for a condensed card's full set list — unique exercise
// names in the order they were logged, e.g. "Chest Press, Chest Fly + 3 more".
function exerciseSummary(entry: WorkoutWithSets): string {
  const names: string[] = []
  for (const set of entry.sets) {
    const name = set.exercises?.name ?? 'Unknown'
    if (!names.includes(name)) names.push(name)
  }
  if (names.length === 0) return 'No sets logged'
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} + ${names.length - 2} more`
}

// Issue #66: an expanded workout lists each exercise once with its sets as
// compact numbered lines under it (like the finish recap), instead of one row
// per set repeating the name. Exercises keep the order they were first logged.
// Issue #535: with that exercise's note for this workout, if it has one.
interface ExerciseGroup {
  exerciseId: string
  name: string
  sets: SetWithExercise[]
  note: string | null
}

function groupSetsByExercise(entry: WorkoutWithSets): ExerciseGroup[] {
  const groups: ExerciseGroup[] = []
  for (const set of entry.sets) {
    const group = groups.find((g) => g.exerciseId === set.exercise_id)
    if (group) {
      group.sets.push(set)
    } else {
      const note = entry.exercise_notes?.find((n) => n.exercise_id === set.exercise_id)?.note ?? null
      groups.push({ exerciseId: set.exercise_id, name: set.exercises?.name ?? 'Unknown', sets: [set], note })
    }
  }
  return groups
}

// Issue #474: volume per set and per exercise, the same setVolume/workoutVolume
// math the finish recap and muscle reports use, shown in the profile's unit.
// Sets with no volume (timed, level, bodyweight without a body weight on file)
// show nothing.
function setVolumeLabel(set: SetWithExercise, performedAt: string): string | null {
  const v = setVolume(set, performedAt, bodyWeight.entries)
  if (v === null) return null
  const unit = profile.defaultWeightUnit
  return `${formatNumber(convertWeight(v, set.weight_unit, unit))} ${unit}`
}

function groupVolumeLabel(group: ExerciseGroup, performedAt: string): string | null {
  const unit = profile.defaultWeightUnit
  const { total, counted } = workoutVolume(group.sets, performedAt, bodyWeight.entries, unit)
  return counted ? `${formatNumber(total)} ${unit}` : null
}

function setLabel(set: SetWithExercise): string {
  const label = formatSetLabel(set.exercises?.load_type ?? 'weight', set.reps, set.weight, set.weight_unit, set.level, {
    durationSeconds: set.duration_seconds,
    distance: set.distance,
    distanceUnit: set.distance_unit,
    incline: set.incline,
    calories: set.calories,
  })
  return set.rpe !== null ? `${label} · RPE ${set.rpe}` : label
}

onMounted(() => {
  workout.fetchHistory().then(() => {
    historyFetched.value = true
  })
  // Issue #158: always refetched here, so a story saved on another device shows.
  workout.fetchWorkoutEvents()
  if (exercises.exercises.length === 0) exercises.fetchExercises()
  // Backlog item 78: the PR timeline marker needs body weight entries to
  // score a bodyweight set's record correctly (see lib/progress.ts).
  if (!bodyWeight.fetched) bodyWeight.fetchEntries()
})

// Backlog item 71: add a brand-new set to an already-finished workout — the
// flat set list has no exercise-scoped entry point of its own, so this opens
// the same AddExerciseSheet the active logger uses, then reveals an inline
// reps/weight form (like the edit form above) once an exercise is chosen.
const pickingExerciseForWorkoutId = ref<string | null>(null)
const exercisesForSheet = computed(() => exercises.activeExercises.map((e) => ({ id: e.id, name: e.name, muscle_group: e.muscle_group })))

const newSetWorkoutId = ref<string | null>(null)
const newSetExerciseId = ref<string | null>(null)
const newSetExerciseName = ref('')
const newSetLoadType = ref<LoadType>('weight')
const newSetReps = ref<number | null>(null)
const newSetWeight = ref<number | null>(null)
const newSetWeightUnit = ref<WeightUnit>(profile.defaultWeightUnit)
const newSetRpe = ref<number | null>(null)
const newSetLevel = ref<number | null>(null)
const newSetDurationInput = ref('')
const newSetDistance = ref<number | null>(null)
const newSetDistanceUnit = ref<DistanceUnit>('mi')
const newSetIncline = ref<number | null>(null)
const newSetCalories = ref<number | null>(null)

const newSetExercise = computed(() => exercises.exercises.find((e) => e.id === newSetExerciseId.value) ?? null)

function openAddSet(workoutId: string) {
  pickingExerciseForWorkoutId.value = workoutId
}

function handleAddSetExerciseSelect(exerciseId: string) {
  const workoutId = pickingExerciseForWorkoutId.value
  pickingExerciseForWorkoutId.value = null
  if (!workoutId) return
  const exercise = exercises.exercises.find((e) => e.id === exerciseId)
  if (!exercise) return

  newSetWorkoutId.value = workoutId
  newSetExerciseId.value = exercise.id
  newSetExerciseName.value = exercise.name
  newSetLoadType.value = exercise.load_type
  newSetReps.value = null
  newSetWeight.value = null
  newSetWeightUnit.value = profile.defaultWeightUnit
  newSetRpe.value = null
  newSetLevel.value = null
  newSetDurationInput.value = ''
  newSetDistance.value = null
  newSetDistanceUnit.value = 'mi'
  newSetIncline.value = null
  newSetCalories.value = null
}

// Issue #264: "+ Another set" under an exercise opens the same form for that
// exercise, filled in from its last set, so logging a whole past session
// doesn't mean picking the exercise again for every set.
async function openAnotherSet(workoutId: string, group: ExerciseGroup) {
  pickingExerciseForWorkoutId.value = workoutId
  handleAddSetExerciseSelect(group.exerciseId)
  const last = group.sets[group.sets.length - 1]
  if (!last || newSetWorkoutId.value !== workoutId) return
  newSetReps.value = last.reps
  newSetWeight.value = last.weight
  newSetWeightUnit.value = last.weight_unit
  newSetLevel.value = last.level
  newSetDurationInput.value = last.duration_seconds !== null ? formatSecondsAsClock(last.duration_seconds) : ''
  newSetDistance.value = last.distance
  newSetDistanceUnit.value = last.distance_unit ?? 'mi'
  newSetIncline.value = last.incline
  newSetCalories.value = last.calories
  await nextTick()
  document.querySelector(`[data-workout-id="${workoutId}"] .new-set-form`)?.scrollIntoView({ block: 'nearest' })
}

function handleDurationInput(target: HTMLInputElement, apply: (value: string) => void) {
  apply(formatDurationDigits(target.value))
}

function handleAddSetManage() {
  pickingExerciseForWorkoutId.value = null
  router.push({ name: 'exercises' })
}

function cancelAddSet() {
  newSetWorkoutId.value = null
}

async function saveNewSet() {
  errorMessage.value = ''
  if (!newSetWorkoutId.value || !newSetExerciseId.value) return
  const isLevel = newSetLoadType.value === 'level'
  const isTimed = newSetLoadType.value === 'timed'
  const exercise = newSetExercise.value

  if (isTimed) {
    const durationSeconds = parseDurationLabel(newSetDurationInput.value)
    if (durationSeconds === null) return
    const { error } = await workout.addHistorySet(
      newSetWorkoutId.value,
      newSetExerciseId.value,
      null,
      0,
      'lb',
      normalizeRpe(newSetRpe.value),
      exercise?.tracks_level ? newSetLevel.value : null,
      durationSeconds,
      exercise?.tracks_distance ? newSetDistance.value : null,
      exercise?.tracks_distance ? newSetDistanceUnit.value : null,
      exercise?.tracks_incline ? newSetIncline.value : null,
      exercise?.tracks_calories ? newSetCalories.value : null,
    )
    if (error) {
      errorMessage.value = error.message
    } else {
      newSetWorkoutId.value = null
    }
    return
  }

  if (newSetReps.value === null) return
  if (isLevel && newSetLevel.value === null) return
  if (!isLevel && newSetWeight.value === null) return

  const { error } = await workout.addHistorySet(
    newSetWorkoutId.value,
    newSetExerciseId.value,
    newSetReps.value,
    isLevel ? 0 : newSetWeight.value!,
    newSetWeightUnit.value,
    normalizeRpe(newSetRpe.value),
    isLevel ? newSetLevel.value : null,
  )
  if (error) {
    errorMessage.value = error.message
  } else {
    newSetWorkoutId.value = null
  }
}

// Issue #266: "52 min" once the workout has a finish time, else nothing.
function lengthOf(entry: { performed_at: string; finished_at?: string | null }): string {
  const minutes = workoutMinutes(entry.performed_at, entry.finished_at)
  return minutes === null ? '' : formatWorkoutLength(minutes)
}

// Item 89: "Save as routine" turns a finished workout (templated or
// freeform) into a reusable routine without silently changing the workout's
// own source template.
const savingTemplateId = ref<string | null>(null)
const templateNameDraft = ref('')
const templateSaveError = ref('')
const templateSavedForWorkoutId = ref<string | null>(null)
const savedTemplateName = ref('')

// Issue #207: a freeform workout is named for what it trained.
function defaultTemplateName(entry: WorkoutWithSets): string {
  if (entry.workout_templates) return `${entry.workout_templates.name} copy`
  return suggestTemplateName(
    entry.sets.map((set) => exercises.exercises.find((e) => e.id === set.exercise_id)?.muscle_group),
    entry.performed_at,
  )
}

// Issue #104: past the free template limit this opens the Premium sheet.
async function openSaveAsTemplate(entry: WorkoutWithSets) {
  if (!(await templates.canCreateTemplate())) {
    openPremiumSheet('templates')
    return
  }
  templateSaveError.value = ''
  templateSavedForWorkoutId.value = null
  templateNameDraft.value = defaultTemplateName(entry)
  savingTemplateId.value = entry.id
}

function cancelSaveAsTemplate() {
  savingTemplateId.value = null
}

async function confirmSaveAsTemplate(entry: WorkoutWithSets) {
  templateSaveError.value = ''
  const name = templateNameDraft.value.trim()
  if (!name) return

  const rows = templateRowsFromSets(entry.sets, (id) => !!exercises.exercises.find((e) => e.id === id)?.is_archived)

  const { error } = await templates.createTemplateFromWorkout(name, rows)
  if (error) {
    templateSaveError.value = error.message
  } else {
    savingTemplateId.value = null
    templateSavedForWorkoutId.value = entry.id
    savedTemplateName.value = name
    // Issue #114: the 3rd free template adds the one-time hint under this.
    claimLastTemplateHint(!!workout.activeWorkoutId)
  }
}

async function confirmDelete(id: string) {
  errorMessage.value = ''
  const { error } = await workout.deleteWorkout(id)
  if (error) {
    errorMessage.value = error.message
  }
  deletingEntry.value = null
}

// Issue #57: changing the unit converts the weight in the field instead of
// just relabeling it (same rule as the logger's toggles).
function changeEditWeightUnit(event: Event) {
  const unit = (event.target as HTMLSelectElement).value as WeightUnit
  editWeight.value = convertSetWeight(editWeight.value, editWeightUnit.value, unit)
  editWeightUnit.value = unit
}

function changeNewSetWeightUnit(event: Event) {
  const unit = (event.target as HTMLSelectElement).value as WeightUnit
  newSetWeight.value = convertSetWeight(newSetWeight.value, newSetWeightUnit.value, unit)
  newSetWeightUnit.value = unit
}

// Issue #66: tapping a set line opens its editor; tapping the same line again
// closes it, like Cancel.
function toggleEditingSet(set: SetWithExercise) {
  confirmingDeleteSetId.value = null
  if (editingSetId.value === set.id) {
    editingSetId.value = null
    return
  }
  startEditingSet(set)
}

function cancelEditingSet() {
  editingSetId.value = null
  confirmingDeleteSetId.value = null
}

function startEditingSet(set: SetWithExercise) {
  clearEditCheck()
  editingSetId.value = set.id
  editReps.value = set.reps
  editWeight.value = set.weight
  editWeightUnit.value = set.weight_unit
  editRpe.value = set.rpe
  editLevel.value = set.level
  editDurationInput.value = set.duration_seconds !== null ? formatSecondsAsClock(set.duration_seconds) : ''
  editDistance.value = set.distance
  editDistanceUnit.value = set.distance_unit ?? 'mi'
  editIncline.value = set.incline
  editCalories.value = set.calories
}

// RPE is optional — v-model.number leaves an emptied field as '' rather
// than null, and that goes straight through to Postgres's numeric column.
function normalizeRpe(value: number | null): number | null {
  return (value as unknown) === '' ? null : value
}

async function saveSetEdit(set: SetWithExercise) {
  errorMessage.value = ''
  const loadType = set.exercises?.load_type ?? 'weight'
  const isLevel = loadType === 'level'
  const isTimed = loadType === 'timed'

  if (isTimed) {
    const exercise = exercises.exercises.find((e) => e.id === set.exercise_id)
    const durationSeconds = parseDurationLabel(editDurationInput.value)
    if (durationSeconds === null) return
    const { error } = await workout.updateHistorySet(
      set.id,
      null,
      0,
      'lb',
      normalizeRpe(editRpe.value),
      exercise?.tracks_level ? editLevel.value : null,
      durationSeconds,
      exercise?.tracks_distance ? editDistance.value : null,
      exercise?.tracks_distance ? editDistanceUnit.value : null,
      exercise?.tracks_incline ? editIncline.value : null,
      exercise?.tracks_calories ? editCalories.value : null,
    )
    if (error) {
      errorMessage.value = isCheckConstraintError(error) ? SET_EDIT_FAILED_MESSAGE : error.message
    } else {
      editingSetId.value = null
    }
    return
  }

  // Issue #336: the form is novalidate so these checks, not the browser's
  // bubbles, explain what's wrong.
  const check = checkSetEntry({
    loadType,
    exerciseName: set.exercises?.name ?? 'this exercise',
    reps: editReps.value,
    weight: editWeight.value,
    weightUnit: editWeightUnit.value,
    level: editLevel.value,
    previousHeaviest: previousHeaviestInHistory(workout.history, set.workout_id, set.exercise_id, editWeightUnit.value),
    action: 'save',
  })
  editNotice.value = check.block ?? ''
  editConfirm.value = check.block || editConfirmed.value ? '' : (check.confirm ?? '')
  if (editNotice.value || editConfirm.value) return
  // Bodyweight's added weight and assisted's assist may be left blank (0).
  const weight = typeof editWeight.value === 'number' ? editWeight.value : 0
  const { error } = await workout.updateHistorySet(
    set.id,
    editReps.value,
    isLevel ? 0 : weight,
    editWeightUnit.value,
    normalizeRpe(editRpe.value),
    isLevel ? editLevel.value : null,
  )
  if (error) {
    errorMessage.value = isCheckConstraintError(error) ? SET_EDIT_FAILED_MESSAGE : error.message
  } else {
    editingSetId.value = null
  }
}

// Backlog item 51: same inline confirm pattern as the whole-workout delete
// above — a logged set has no undo, so deleting it shouldn't be a single
// accidental tap. Issue #66: Delete lives inside the set's edit form now.
const confirmingDeleteSetId = ref<string | null>(null)

async function handleDeleteSet(id: string) {
  errorMessage.value = ''
  if (editingSetId.value === id) editingSetId.value = null
  confirmingDeleteSetId.value = null
  const { error } = await workout.deleteHistorySet(id)
  if (error) errorMessage.value = error.message
}

function startEditingNotes(entry: WorkoutWithSets) {
  editingNotesId.value = entry.id
  notesDraft.value = entry.notes ?? ''
}

// Issue #149: "How did it feel?" tags, saved on each tap like the recap.
const editingFeelId = ref<string | null>(null)

async function saveFeel(id: string, patch: Partial<WorkoutFeel>) {
  errorMessage.value = ''
  const { error } = await workout.updateWorkoutFeel(id, patch)
  if (error) errorMessage.value = error.message
}

// Issue #264: the expanded card's date opens a "When" field that moves the
// workout to when it really happened. Never later than now.
const editingDateId = ref<string | null>(null)
const dateDraft = ref('')
const dateError = ref('')
const nowInputValue = ref(toDateTimeInputValue(new Date()))

function startEditingDate(entry: WorkoutWithSets) {
  nowInputValue.value = toDateTimeInputValue(new Date())
  dateDraft.value = toDateTimeInputValue(entry.performed_at)
  dateError.value = ''
  editingDateId.value = entry.id
}

async function scrollToWorkout(id: string) {
  await nextTick()
  document.querySelector(`[data-workout-id="${id}"]`)?.scrollIntoView({ block: 'start' })
}

async function saveDate(id: string) {
  dateError.value = workoutDateProblem(dateDraft.value) ?? ''
  if (dateError.value) return
  const { error } = await workout.updateWorkoutDate(id, dateTimeInputToIso(dateDraft.value)!)
  if (error) {
    dateError.value = error.message
    return
  }
  editingDateId.value = null
  await scrollToWorkout(id)
}

// Issue #264: "Log a past workout" creates one on an earlier date, then
// opens the exercise picker on it. It never starts the live logger.
const loggingPast = ref(false)
const pastDraft = ref('')
const pastTemplateId = ref('')
const pastError = ref('')
const savingPast = ref(false)
const routineOptions = computed(() => [...templates.activeTemplates].sort((a, b) => a.name.localeCompare(b.name)))

function openLogPast() {
  nowInputValue.value = toDateTimeInputValue(new Date())
  pastDraft.value = defaultPastWorkoutTime()
  pastTemplateId.value = ''
  pastError.value = ''
  loggingPast.value = true
  if (!templates.fetched) templates.fetchTemplates()
}

async function confirmLogPast() {
  pastError.value = workoutDateProblem(pastDraft.value) ?? ''
  if (pastError.value || savingPast.value) return
  savingPast.value = true
  const { id, error } = await workout.logPastWorkout(dateTimeInputToIso(pastDraft.value)!, pastTemplateId.value || null)
  savingPast.value = false
  if (error || !id) {
    pastError.value = error?.message ?? 'Could not log that workout.'
    return
  }
  loggingPast.value = false
  expandedIds.value.add(id)
  await scrollToWorkout(id)
  openAddSet(id)
}

async function saveNotes(id: string) {
  errorMessage.value = ''
  const { error } = await workout.updateWorkoutNotes(id, notesDraft.value.trim() || null)
  if (error) {
    errorMessage.value = error.message
  } else {
    editingNotesId.value = null
  }
}
</script>

<template>
  <div>
    <router-link :to="{ name: 'progress' }" class="back-link" aria-label="Back to Progress"><span aria-hidden="true">‹</span>Progress</router-link>
    <PageHeader title="Workout log" />
    <p class="lede">Tap a workout to review or fix it.</p>
    <button v-if="!loggingPast" type="button" class="ghost small log-past-trigger" @click="openLogPast">+ Log a past workout</button>
    <form v-else class="past-form" novalidate aria-label="Log a past workout" @submit.prevent="confirmLogPast">
      <h2 class="past-form-title">Log a past workout</h2>
      <p class="past-form-hint">For a session you didn't track live. You'll add its exercises and sets next.</p>
      <label for="past-workout-when">When</label>
      <input id="past-workout-when" v-model="pastDraft" type="datetime-local" :max="nowInputValue" required />
      <label for="past-workout-routine">Routine (optional)</label>
      <select id="past-workout-routine" v-model="pastTemplateId">
        <option value="">None (freeform)</option>
        <option v-for="t in routineOptions" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <p v-if="pastError" class="error">{{ pastError }}</p>
      <div class="set-edit-actions">
        <button type="button" class="ghost" @click="loggingPast = false">Cancel</button>
        <button type="submit" :disabled="savingPast">Add exercises</button>
      </div>
    </form>
    <!-- Issue #180: a user asked what the glowing dots meant. Only shown
         when the list has one, so it never explains something that isn't there. -->
    <p v-if="!workout.loading && prWorkoutIds.size > 0" class="dot-key" data-testid="record-dot-key">
      <span class="dot-key-dot" aria-hidden="true"></span>Set a record
    </p>

    <SkeletonRows v-if="workout.loading" :rows="3" />
    <p v-if="workout.errorMessage" class="error">{{ workout.errorMessage }}</p>
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <p v-if="!workout.loading && workout.history.length === 0" class="empty">No workouts logged yet.</p>

    <div v-if="!workout.loading" class="timeline">
      <WorkoutLogDay v-for="day in days" :key="day.key" :label="day.label" :count="day.entries.length">
        <div v-for="(entry, index) in day.entries" :key="entry.id" class="timeline-row" :data-workout-id="entry.id">
          <div class="rail">
            <span v-if="prWorkoutIds.has(entry.id)" class="dot dot-pr" role="img" aria-label="Set a record"></span>
            <span v-else class="dot" aria-hidden="true"></span>
            <span v-if="index < day.entries.length - 1" class="rail-line"></span>
          </div>

          <div class="card" :class="{ 'card-condensed': !expandedIds.has(entry.id) }">
            <button
              v-if="!expandedIds.has(entry.id)"
              type="button"
              class="condensed-trigger"
              @click="toggleExpanded(entry.id)"
            >
              <div class="entry-header">
                <h3>{{ formatLogTime(entry.performed_at) }}<span v-if="lengthOf(entry)" class="entry-length" data-testid="workout-length"> · {{ lengthOf(entry) }}</span></h3>
                <span v-if="entry.workout_templates" class="template-tag">{{ entry.workout_templates.name }}</span>
              </div>
              <p class="condensed-summary">{{ exerciseSummary(entry) }}</p>
              <svg class="condensed-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none">
                <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>

            <template v-else>
              <div class="entry-header">
                <h3>
                  <button
                    type="button"
                    class="date-button"
                    :aria-label="`Change date and time, ${formatLogDateTime(entry.performed_at)}`"
                    :aria-expanded="editingDateId === entry.id"
                    @click="editingDateId === entry.id ? (editingDateId = null) : startEditingDate(entry)"
                  >
                    {{ formatLogTime(entry.performed_at) }}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </button>
                  <span v-if="lengthOf(entry)" class="entry-length" data-testid="workout-length"> · {{ lengthOf(entry) }}</span>
                </h3>
                <div class="entry-header-actions">
                  <span v-if="entry.workout_templates" class="template-tag">{{ entry.workout_templates.name }}</span>
                  <button
                    type="button"
                    class="icon-button"
                    aria-label="Collapse details"
                    @click="toggleExpanded(entry.id)"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                      <path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="icon-button delete-trigger"
                    aria-label="Delete workout"
                    @click="deletingEntry = entry"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>

              <form v-if="editingDateId === entry.id" class="notes-form" novalidate @submit.prevent="saveDate(entry.id)">
                <label :for="`history-date-${entry.id}`">When</label>
                <input
                  :id="`history-date-${entry.id}`"
                  v-model="dateDraft"
                  type="datetime-local"
                  :max="nowInputValue"
                  required
                />
                <p v-if="dateError" class="error">{{ dateError }}</p>
                <div class="set-edit-actions">
                  <button type="button" class="ghost" @click="editingDateId = null">Cancel</button>
                  <button type="submit">Save</button>
                </div>
              </form>

              <button v-if="prSets.has(entry.id)" type="button" class="pr-marker" @click="openPrRecordCheck(entry.id)">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  <ellipse cx="12" cy="16" rx="5.5" ry="4.2" fill="var(--highlight)" />
                  <ellipse cx="6" cy="9" rx="2.1" ry="2.6" fill="var(--highlight)" />
                  <ellipse cx="11" cy="6.5" rx="2.1" ry="2.6" fill="var(--highlight)" />
                  <ellipse cx="16.2" cy="7.5" rx="2" ry="2.5" fill="var(--highlight)" />
                  <ellipse cx="19" cy="11.5" rx="1.8" ry="2.3" fill="var(--highlight)" />
                </svg>
                <span>PR set this workout</span>
                <span class="pr-marker-why" aria-hidden="true">›</span>
              </button>

              <WorkoutStory
                v-if="workout.workoutEvents[entry.id]"
                class="entry-story"
                :lines="storyLines(workout.workoutEvents[entry.id], exercises.exercises)"
              />

              <!-- Issue #487: named, not an icon, so a first-time user finds it. -->
              <div v-if="savingTemplateId !== entry.id" class="card-actions">
                <button type="button" class="ghost small save-routine-btn" @click="openSaveAsTemplate(entry)">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                  </svg>
                  Save as routine
                </button>
              </div>

              <form
                v-if="savingTemplateId === entry.id"
                class="notes-form"
                @submit.prevent="confirmSaveAsTemplate(entry)"
              >
                <label :for="`save-template-name-${entry.id}`">Routine name</label>
                <input
                  :id="`save-template-name-${entry.id}`"
                  v-model="templateNameDraft"
                  type="text"
                  required
                  autofocus
                />
                <p v-if="templateSaveError" class="error">{{ templateSaveError }}</p>
                <div class="notes-actions">
                  <button type="submit">Save</button>
                  <button type="button" class="ghost small" @click="cancelSaveAsTemplate">Cancel</button>
                </div>
              </form>

              <div v-if="templateSavedForWorkoutId === entry.id" class="template-saved-banner">
                <span>Saved as "{{ savedTemplateName }}".</span>
                <router-link :to="{ name: 'templates' }" class="template-saved-link">View in Routines</router-link>
              </div>
              <LastTemplateHint
                v-if="templateSavedForWorkoutId === entry.id && lastTemplateHintOpen && showPremiumNudges"
                class="saved-last-hint"
              />

              <div v-if="editingNotesId !== entry.id" class="notes-row">
                <p v-if="entry.notes" class="notes">{{ entry.notes }}</p>
                <button type="button" class="ghost small" @click="startEditingNotes(entry)">
                  {{ entry.notes ? 'Edit notes' : 'Add notes' }}
                </button>
              </div>
              <form v-else class="notes-form" @submit.prevent="saveNotes(entry.id)">
                <label :for="`history-notes-${entry.id}`">Notes</label>
                <textarea :id="`history-notes-${entry.id}`" v-model="notesDraft" rows="2" />
                <div class="notes-actions">
                  <button type="submit">Save</button>
                  <button type="button" class="ghost small" @click="editingNotesId = null">Cancel</button>
                </div>
              </form>

              <div v-if="editingFeelId !== entry.id" class="notes-row" data-testid="history-feel">
                <p v-if="isTagged(feelOf(entry))" class="notes">{{ feelSummary(feelOf(entry)) }}</p>
                <button type="button" class="ghost small" @click="editingFeelId = entry.id">
                  {{ isTagged(feelOf(entry)) ? 'Edit how it felt' : 'Add how it felt' }}
                </button>
              </div>
              <div v-else class="notes-form" data-testid="history-feel-form">
                <span class="feel-title">How did it feel?</span>
                <WorkoutFeelPicker :feel="feelOf(entry)" @change="saveFeel(entry.id, $event)" />
                <div class="notes-actions">
                  <button type="button" class="ghost small" @click="editingFeelId = null">Done</button>
                </div>
              </div>

              <ul class="list">
                <li v-for="group in groupSetsByExercise(entry)" :key="group.exerciseId" class="exercise-group">
                  <div class="group-head">
                    <p :id="`group-title-${entry.id}-${group.exerciseId}`" class="group-title">{{ group.name }}</p>
                    <span v-if="groupVolumeLabel(group, entry.performed_at)" class="group-volume" data-testid="group-volume">Volume {{ groupVolumeLabel(group, entry.performed_at) }}</span>
                  </div>
                  <ol class="set-lines">
                    <li v-for="(set, setIndex) in group.sets" :key="set.id" class="row-wrap">
                      <button
                        type="button"
                        class="set-line"
                        :class="{ 'set-line-active': editingSetId === set.id }"
                        :aria-label="`Edit set ${setIndex + 1}, ${setLabel(set)}`"
                        :aria-expanded="editingSetId === set.id"
                        @click="toggleEditingSet(set)"
                      >
                        <span class="set-number" aria-hidden="true">{{ setIndex + 1 }}</span>
                        <span class="set-detail">{{ setLabel(set) }}</span>
                        <span v-if="setVolumeLabel(set, entry.performed_at)" class="set-volume" data-testid="set-volume">{{ setVolumeLabel(set, entry.performed_at) }}</span>
                        <svg class="set-line-pencil" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      </button>

                      <form
                        v-if="editingSetId === set.id"
                        class="set-edit-form"
                        :novalidate="set.exercises?.load_type !== 'timed'"
                        @submit.prevent="saveSetEdit(set)"
                        @input="clearEditCheck"
                      >
                        <template v-if="set.exercises?.load_type === 'timed'">
                          <div class="grid-2">
                            <div>
                              <label :for="`history-edit-duration-${set.id}`">Time</label>
                              <input
                                :id="`history-edit-duration-${set.id}`"
                                :value="editDurationInput"
                                type="text"
                                inputmode="numeric"
                                placeholder="0:00"
                                required
                                @input="handleDurationInput($event.target as HTMLInputElement, (v) => (editDurationInput = v))"
                              />
                            </div>
                            <div v-if="exercises.exercises.find((e) => e.id === set.exercise_id)?.tracks_level">
                              <label :for="`history-edit-level-${set.id}`">Level</label>
                              <input
                                :id="`history-edit-level-${set.id}`"
                                v-model.number="editLevel"
                                type="number"
                                inputmode="numeric"
                                min="1"
                                step="1"
                              />
                            </div>
                            <div v-else-if="!exercises.exercises.find((e) => e.id === set.exercise_id)?.tracks_incline">
                              <label :for="`history-edit-rpe-${set.id}`">RPE (optional)</label>
                              <input
                                :id="`history-edit-rpe-${set.id}`"
                                v-model.number="editRpe"
                                type="number"
                                inputmode="decimal"
                                min="0"
                                max="10"
                                step="0.5"
                              />
                            </div>
                          </div>
                          <div v-if="exercises.exercises.find((e) => e.id === set.exercise_id)?.tracks_distance" class="grid-2">
                            <div>
                              <label :for="`history-edit-distance-${set.id}`">Distance</label>
                              <input
                                :id="`history-edit-distance-${set.id}`"
                                v-model.number="editDistance"
                                type="number"
                                inputmode="decimal"
                                min="0"
                                step="0.1"
                              />
                            </div>
                            <div>
                              <label :for="`history-edit-distance-unit-${set.id}`">Unit</label>
                              <select :id="`history-edit-distance-unit-${set.id}`" v-model="editDistanceUnit">
                                <option value="mi">mi</option>
                                <option value="km">km</option>
                              </select>
                            </div>
                          </div>
                          <div v-if="exercises.exercises.find((e) => e.id === set.exercise_id)?.tracks_incline" class="grid-2">
                            <div>
                              <label :for="`history-edit-incline-${set.id}`">Incline</label>
                              <input
                                :id="`history-edit-incline-${set.id}`"
                                v-model.number="editIncline"
                                type="number"
                                inputmode="decimal"
                                min="0"
                                step="0.5"
                              />
                            </div>
                            <div>
                              <label :for="`history-edit-rpe-timed-${set.id}`">RPE (optional)</label>
                              <input
                                :id="`history-edit-rpe-timed-${set.id}`"
                                v-model.number="editRpe"
                                type="number"
                                inputmode="decimal"
                                min="0"
                                max="10"
                                step="0.5"
                              />
                            </div>
                          </div>
                          <div v-if="exercises.exercises.find((e) => e.id === set.exercise_id)?.tracks_calories" class="grid-2">
                            <div>
                              <label :for="`history-edit-calories-${set.id}`">Calories</label>
                              <input
                                :id="`history-edit-calories-${set.id}`"
                                v-model.number="editCalories"
                                type="number"
                                inputmode="decimal"
                                min="0"
                                step="1"
                              />
                            </div>
                            <div v-if="exercises.exercises.find((e) => e.id === set.exercise_id)?.tracks_level && !exercises.exercises.find((e) => e.id === set.exercise_id)?.tracks_incline">
                              <label :for="`history-edit-rpe-calories-${set.id}`">RPE (optional)</label>
                              <input
                                :id="`history-edit-rpe-calories-${set.id}`"
                                v-model.number="editRpe"
                                type="number"
                                inputmode="decimal"
                                min="0"
                                max="10"
                                step="0.5"
                              />
                            </div>
                          </div>
                        </template>
                        <template v-else>
                          <div class="grid-2">
                            <div>
                              <label :for="`history-edit-reps-${set.id}`">Reps</label>
                              <input
                                :id="`history-edit-reps-${set.id}`"
                                v-model.number="editReps"
                                type="number"
                                inputmode="numeric"
                                min="1"
                                required
                              />
                            </div>
                            <div v-if="set.exercises?.load_type === 'level'">
                              <label :for="`history-edit-level-${set.id}`">Level</label>
                              <input
                                :id="`history-edit-level-${set.id}`"
                                v-model.number="editLevel"
                                type="number"
                                inputmode="numeric"
                                min="1"
                                step="1"
                                required
                              />
                            </div>
                            <div v-else>
                              <label :for="`history-edit-weight-${set.id}`">Weight</label>
                              <input
                                :id="`history-edit-weight-${set.id}`"
                                v-model.number="editWeight"
                                type="number"
                                inputmode="decimal"
                                min="0"
                                step="0.5"
                                required
                              />
                            </div>
                          </div>
                          <div class="grid-2">
                            <div v-if="set.exercises?.load_type !== 'level'">
                              <label :for="`history-edit-unit-${set.id}`">Unit</label>
                              <select :id="`history-edit-unit-${set.id}`" :value="editWeightUnit" @change="changeEditWeightUnit">
                                <option value="lb">lb</option>
                                <option value="kg">kg</option>
                              </select>
                            </div>
                            <div>
                              <label :for="`history-edit-rpe-${set.id}`">RPE (optional)</label>
                              <input
                                :id="`history-edit-rpe-${set.id}`"
                                v-model.number="editRpe"
                                type="number"
                                inputmode="decimal"
                                min="0"
                                max="10"
                                step="0.5"
                              />
                            </div>
                          </div>
                        </template>
                        <p v-if="editNotice" class="error edit-check-error">{{ editNotice }}</p>
                        <WeightTypoWarning
                          v-if="editConfirm"
                          :message="editConfirm"
                          save-label="Save anyway"
                          @fix-it="editConfirm = ''"
                          @save-anyway="editConfirmed = true; editConfirm = ''; saveSetEdit(set)"
                        />
                        <!-- One row of equal buttons: Delete away from Save on
                             the left. The confirm step swaps in for the row. -->
                        <div v-if="confirmingDeleteSetId === set.id" class="confirm-delete">
                          <span class="row-sub">Delete this set? This can't be undone.</span>
                          <div class="set-edit-actions">
                            <button type="button" class="danger" @click="handleDeleteSet(set.id)">Confirm delete</button>
                            <button type="button" class="ghost" @click="confirmingDeleteSetId = null">Cancel</button>
                          </div>
                        </div>
                        <div v-else class="set-edit-actions">
                          <button
                            type="button"
                            class="ghost delete-set-btn"
                            aria-label="Delete set"
                            @click="confirmingDeleteSetId = set.id"
                          >
                            Delete
                          </button>
                          <button type="button" class="ghost" @click="cancelEditingSet">Cancel</button>
                          <button type="submit">Save</button>
                        </div>
                      </form>
                    </li>
                  </ol>
                  <p v-if="group.note" class="exercise-note" data-testid="exercise-note">{{ group.note }}</p>
                  <button
                    type="button"
                    class="another-set"
                    :aria-describedby="`group-title-${entry.id}-${group.exerciseId}`"
                    @click="openAnotherSet(entry.id, group)"
                  >
                    + Another set
                  </button>
                </li>
              </ul>

              <div v-if="newSetWorkoutId !== entry.id" class="add-set-row">
                <button type="button" class="ghost small" @click="openAddSet(entry.id)">+ Add exercise</button>
              </div>

              <form v-else class="set-edit-form new-set-form" @submit.prevent="saveNewSet">
                <p class="row-title">{{ newSetExerciseName }}</p>
                <template v-if="newSetLoadType === 'timed'">
                  <div class="grid-2">
                    <div>
                      <label :for="`history-new-duration-${entry.id}`">Time</label>
                      <input
                        :id="`history-new-duration-${entry.id}`"
                        :value="newSetDurationInput"
                        type="text"
                        inputmode="numeric"
                        placeholder="0:00"
                        required
                        @input="handleDurationInput($event.target as HTMLInputElement, (v) => (newSetDurationInput = v))"
                      />
                    </div>
                    <div v-if="newSetExercise?.tracks_level">
                      <label :for="`history-new-level-${entry.id}`">Level</label>
                      <input
                        :id="`history-new-level-${entry.id}`"
                        v-model.number="newSetLevel"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        step="1"
                      />
                    </div>
                    <div v-else-if="!newSetExercise?.tracks_incline">
                      <label :for="`history-new-rpe-${entry.id}`">RPE (optional)</label>
                      <input
                        :id="`history-new-rpe-${entry.id}`"
                        v-model.number="newSetRpe"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        max="10"
                        step="0.5"
                      />
                    </div>
                  </div>
                  <div v-if="newSetExercise?.tracks_distance" class="grid-2">
                    <div>
                      <label :for="`history-new-distance-${entry.id}`">Distance</label>
                      <input
                        :id="`history-new-distance-${entry.id}`"
                        v-model.number="newSetDistance"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.1"
                      />
                    </div>
                    <div>
                      <label :for="`history-new-distance-unit-${entry.id}`">Unit</label>
                      <select :id="`history-new-distance-unit-${entry.id}`" v-model="newSetDistanceUnit">
                        <option value="mi">mi</option>
                        <option value="km">km</option>
                      </select>
                    </div>
                  </div>
                  <div v-if="newSetExercise?.tracks_incline" class="grid-2">
                    <div>
                      <label :for="`history-new-incline-${entry.id}`">Incline</label>
                      <input
                        :id="`history-new-incline-${entry.id}`"
                        v-model.number="newSetIncline"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.5"
                      />
                    </div>
                    <div>
                      <label :for="`history-new-rpe-timed-${entry.id}`">RPE (optional)</label>
                      <input
                        :id="`history-new-rpe-timed-${entry.id}`"
                        v-model.number="newSetRpe"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        max="10"
                        step="0.5"
                      />
                    </div>
                  </div>
                  <div v-if="newSetExercise?.tracks_calories" class="grid-2">
                    <div>
                      <label :for="`history-new-calories-${entry.id}`">Calories</label>
                      <input
                        :id="`history-new-calories-${entry.id}`"
                        v-model.number="newSetCalories"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="1"
                      />
                    </div>
                    <div v-if="newSetExercise?.tracks_level && !newSetExercise?.tracks_incline">
                      <label :for="`history-new-rpe-calories-${entry.id}`">RPE (optional)</label>
                      <input
                        :id="`history-new-rpe-calories-${entry.id}`"
                        v-model.number="newSetRpe"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        max="10"
                        step="0.5"
                      />
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="grid-2">
                    <div>
                      <label :for="`history-new-reps-${entry.id}`">Reps</label>
                      <input
                        :id="`history-new-reps-${entry.id}`"
                        v-model.number="newSetReps"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        required
                      />
                    </div>
                    <div v-if="newSetLoadType === 'level'">
                      <label :for="`history-new-level-${entry.id}`">Level</label>
                      <input
                        :id="`history-new-level-${entry.id}`"
                        v-model.number="newSetLevel"
                        type="number"
                        inputmode="numeric"
                        min="1"
                        step="1"
                        required
                      />
                    </div>
                    <div v-else>
                      <label :for="`history-new-weight-${entry.id}`">Weight</label>
                      <input
                        :id="`history-new-weight-${entry.id}`"
                        v-model.number="newSetWeight"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.5"
                        required
                      />
                    </div>
                  </div>
                  <div class="grid-2">
                    <div v-if="newSetLoadType !== 'level'">
                      <label :for="`history-new-unit-${entry.id}`">Unit</label>
                      <select :id="`history-new-unit-${entry.id}`" :value="newSetWeightUnit" @change="changeNewSetWeightUnit">
                        <option value="lb">lb</option>
                        <option value="kg">kg</option>
                      </select>
                    </div>
                    <div>
                      <label :for="`history-new-rpe-${entry.id}`">RPE (optional)</label>
                      <input
                        :id="`history-new-rpe-${entry.id}`"
                        v-model.number="newSetRpe"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        max="10"
                        step="0.5"
                      />
                    </div>
                  </div>
                </template>
                <div class="set-edit-actions">
                  <button type="button" class="ghost" @click="cancelAddSet">Cancel</button>
                  <button type="submit">Save</button>
                </div>
              </form>

            </template>
          </div>
        </div>
      </WorkoutLogDay>
    </div>

    <div
      v-if="deletingEntry"
      class="delete-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Delete this workout?"
      @click.self="deletingEntry = null"
    >
      <div class="delete-dialog">
        <h3 class="delete-dialog-title">Delete this workout?</h3>
        <p class="delete-dialog-summary">
          {{ deleteDialogWorkoutName(deletingEntry) }} · {{ formatLogDateTime(deletingEntry.performed_at) }} ·
          {{ deletingEntry.sets.length }} {{ deletingEntry.sets.length === 1 ? 'set' : 'sets' }}
        </p>
        <p class="delete-dialog-warning">This can't be undone.</p>
        <div class="delete-dialog-actions">
          <button type="button" class="danger small" @click="confirmDelete(deletingEntry.id)">Confirm delete</button>
          <button type="button" class="ghost small" @click="deletingEntry = null">Cancel</button>
        </div>
      </div>
    </div>

    <AddExerciseSheet
      v-if="pickingExerciseForWorkoutId"
      :exercises="exercisesForSheet"
      :recent-ids="workout.recentlyLoggedExerciseIds"
      @select="handleAddSetExerciseSelect"
      @dismiss="pickingExerciseForWorkoutId = null"
      @manage="handleAddSetManage"
    />

    <ExerciseHistoryDetail
      v-if="recordCheckFor"
      :key="recordCheckFor.setId"
      :exercise-id="recordCheckFor.exerciseId"
      :record-set-id="recordCheckFor.setId"
      @dismiss="recordCheckFor = null"
    />
  </div>
</template>

<style scoped>
.timeline-row {
  display: flex;
  gap: 14px;
  margin-bottom: 10px;
}

.timeline-row:last-child {
  margin-bottom: 0;
}

.rail {
  width: 2px;
  flex-shrink: 0;
  position: relative;
}

.dot {
  position: absolute;
  top: 6px;
  left: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text) 20%, transparent);
}

.dot-pr {
  background: var(--highlight);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--highlight) 18%, transparent);
}

.dot-key {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -8px 0 16px;
  color: var(--text-dim);
  font-size: 0.78rem;
}

.dot-key-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--highlight);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--highlight) 18%, transparent);
}

.rail-line {
  display: block;
  width: 2px;
  height: 100%;
  background: var(--border);
}

.card {
  position: relative;
  flex: 1;
  min-width: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}

.card-condensed {
  opacity: 0.65;
}

.condensed-trigger {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  min-height: auto;
  cursor: pointer;
  position: relative;
}

.condensed-chevron {
  position: absolute;
  top: 2px;
  right: 0;
  color: var(--text-dim);
}

.condensed-summary {
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.entry-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 24px;
  flex-wrap: wrap;
  margin-bottom: 4px;
  padding-right: 24px;
}

.entry-header h3 {
  margin: 0;
  color: var(--text);
}

.entry-length {
  font-weight: 500;
  color: var(--text-dim);
}

/* Issue #264: the expanded card's date is the button that changes it. */
.date-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.date-button svg {
  flex-shrink: 0;
  color: var(--text-dim);
}

.log-past-trigger {
  margin: -4px 0 16px;
}

.past-form {
  margin: -4px 0 16px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
}

.past-form-title {
  margin: 0 0 4px;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
  color: var(--text);
}

.past-form-hint {
  margin: 0 0 12px;
  color: var(--text-dim);
  font-size: 0.82rem;
}

.another-set {
  min-height: 36px;
  margin: 2px 0 0 8px;
  padding: 0;
  background: none;
  border: none;
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 700;
}

.entry-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.template-tag {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border-radius: 999px;
  padding: 4px 10px;
  flex-shrink: 0;
}

.entry-story {
  margin-top: 8px;
}

.pr-marker {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  margin: -8px 0 -14px;
  padding: 0;
  background: none;
  border: none;
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--highlight);
}

.pr-marker-why {
  font-size: 0.9rem;
  line-height: 1;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 0;
}

.save-routine-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}

.notes-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin: 12px 0;
}

.notes {
  margin: 0;
}

.notes-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 12px 0;
}

.notes-actions {
  display: flex;
  gap: 8px;
}

.feel-title {
  font-size: 0.85rem;
  font-weight: 700;
}

.template-saved-banner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
  font-size: 0.85rem;
}

.saved-last-hint {
  margin: -4px 0 12px;
}

.template-saved-link {
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 4px;
}

.exercise-group {
  padding: 10px 0 6px;
  border-top: 1px solid var(--border);
}

.exercise-group:first-child {
  border-top: none;
}

.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.group-head .group-title {
  min-width: 0;
  overflow-wrap: anywhere;
}

.group-volume {
  flex-shrink: 0;
  font-weight: 500;
  font-size: 0.85rem;
  color: var(--text-dim);
}

.set-volume {
  flex-shrink: 0;
  font-size: 0.8rem;
  color: var(--text-dim);
}

.group-title {
  margin: 0 0 4px;
  font-weight: 700;
  color: var(--text);
}

/* Issue #535: the exercise's note for this workout, under its sets. */
.exercise-note {
  margin: 6px 0 0;
  padding: 6px 10px;
  border-left: 3px solid var(--accent);
  border-radius: var(--radius);
  background: var(--surface-2);
  font-size: 0.85rem;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.set-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Issue #66: the whole line is the edit target -- no per-set buttons. */
.set-line {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 6px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);
  color: var(--text);
  font-weight: 400;
  text-align: left;
}

.set-line:hover,
.set-line:focus-visible,
.set-line-active {
  background: var(--surface-2);
}

.set-line-active {
  border-color: var(--border);
}

.set-number {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-dim);
  font-size: 0.7rem;
  font-weight: 700;
}

.set-line:hover .set-number,
.set-line:focus-visible .set-number,
.set-line-active .set-number {
  background: var(--surface);
}

.set-detail {
  flex: 1;
  min-width: 0;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}

.set-line-pencil {
  flex-shrink: 0;
  color: var(--text-dim);
}

.row-title {
  font-weight: 600;
}

.row-sub {
  font-size: 0.85rem;
  color: var(--text-dim);
}

.ghost.delete-set-btn {
  color: var(--danger);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.set-edit-form {
  margin: 6px 0 10px;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.add-set-row {
  margin-top: 8px;
}

.set-edit-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* Every button in the row gets the same width and height, including Save,
   which otherwise takes the global full-width submit style. */
.set-edit-actions button {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
  min-height: 44px;
  margin: 0;
  padding: 0 8px;
  font-size: 0.9rem;
  white-space: nowrap;
}

.error {
  color: var(--danger);
}

.edit-check-error {
  margin: 0;
  font-size: 0.85rem;
}

.empty {
  text-align: center;
  padding: 32px 0;
}

.icon-button {
  width: 30px;
  height: 30px;
  min-height: auto;
  padding: 0;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-button:hover,
.icon-button:focus-visible {
  color: var(--text);
}

.delete-trigger:hover,
.delete-trigger:focus-visible {
  color: var(--danger);
}

.confirm-delete {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.confirm-delete .set-edit-actions {
  margin-top: 0;
}

.delete-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.delete-dialog {
  width: 100%;
  max-width: 400px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.delete-dialog-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
  text-transform: none;
  letter-spacing: normal;
}

.delete-dialog-summary {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-dim);
}

.delete-dialog-warning {
  margin: 0;
  font-weight: 700;
  color: var(--text);
}

.delete-dialog-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
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
</style>
