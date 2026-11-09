import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { repos } from '../data'
import type { Exercise, LoadType, PushPull } from '../lib/types'

export type BarbellFields = Pick<Exercise, 'uses_barbell' | 'bar_type' | 'bar_custom_weight' | 'bar_custom_unit'>
import type { MuscleGroup } from '../lib/muscleGroups'
import { useTemplatesStore } from './templates'
import { libraryEntry, ownedLibraryIds, type LibraryExercise } from '../lib/exerciseLibrary'

// Per-user exercise catalog. See docs/architecture.md#data-model for why
// exercises aren't shared between the two users.
export const useExercisesStore = defineStore('exercises', () => {
  const exercises = ref<Exercise[]>([])
  const loading = ref(false)
  const errorMessage = ref('')
  // Issue #42: App.vue's one-time muscle check waits on a completed fetch
  // (not just a non-empty array -- a brand-new account's is legitimately
  // empty) before deciding whether to open.
  const fetched = ref(false)

  // Issue #7: fetchExercises starts alphabetized, but create/update mutate the
  // in-memory array in place. Sort a copy here so every active-exercise list
  // stays alphabetical immediately, without changing the underlying array
  // used by archived-exercise lookups.
  const activeExercises = computed(() =>
    exercises.value
      .filter((e) => !e.is_archived)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
  )

  // Issue #39: library entry ids the user already has (see ownedLibraryIds).
  const ownedLibrary = computed(() => ownedLibraryIds(activeExercises.value))

  async function fetchExercises() {
    loading.value = true
    errorMessage.value = ''
    const { data, error } = await repos.exercises.list()
    if (error) {
      errorMessage.value = error.message
    } else {
      // Issue #851: a library_id naming an entry that was merged away (native
      // data, or an account the one-off SQL missed) reads as unlinked, so the
      // exercise works as a custom one and its Library match row can relink it.
      // In memory only; the stored row is left alone.
      exercises.value = (data ?? []).map((e) => (e.library_id && !libraryEntry(e.library_id) ? { ...e, library_id: null } : e))
      fetched.value = true
    }
    loading.value = false
  }

  async function createExercise(
    name: string,
    setupNotes: string | null = null,
    restSeconds: number | null = null,
    loadType: LoadType = 'weight',
    tracksDistance = false,
    tracksIncline = false,
    tracksLevel = false,
    tracksCalories = false,
    muscleGroup: MuscleGroup | null = null,
    alsoWorks: MuscleGroup[] = [],
    libraryId: string | null = null,
    pushPull: PushPull | null = null,
  ) {
    const { data, error } = await repos.exercises.create({
      name,
      setup_notes: setupNotes,
      rest_seconds: restSeconds,
      load_type: loadType,
      tracks_distance: tracksDistance,
      tracks_incline: tracksIncline,
      tracks_level: tracksLevel,
      tracks_calories: tracksCalories,
      muscle_group: muscleGroup,
      also_works: alsoWorks,
      library_id: libraryId,
      push_pull: pushPull,
    })

    if (!error && data) {
      exercises.value.push(data)
    }
    return { data, error }
  }

  // Issue #39: adding a library entry makes a normal exercise row, copied
  // from the entry. Setup notes stay unset, and rest time too unless a
  // starter program (#148) picks one.
  function addFromLibrary(entry: LibraryExercise, restSeconds: number | null = null) {
    return createExercise(
      entry.name,
      null,
      restSeconds,
      entry.loadType,
      entry.tracksDistance,
      entry.tracksIncline,
      entry.tracksLevel,
      entry.tracksCalories,
      entry.muscleGroup,
      entry.alsoWorks,
      entry.id,
    )
  }

  async function archiveExercise(id: string) {
    const { error } = await repos.exercises.update(id, { is_archived: true })
    if (!error) {
      const exercise = exercises.value.find((e) => e.id === id)
      if (exercise) exercise.is_archived = true
    }
    return { error }
  }

  // Issue #265: `fromId`'s sets and routine rows move to `intoId`, which
  // keeps its own settings; `fromId` is archived. Routines carry cached
  // exercise refs, so they are refetched too.
  async function mergeExercise(fromId: string, intoId: string) {
    const { error } = await repos.exercises.merge(fromId, intoId)
    if (!error) {
      const exercise = exercises.value.find((e) => e.id === fromId)
      if (exercise) exercise.is_archived = true
      await useTemplatesStore().fetchTemplates()
    }
    return { error }
  }

  function countWorkouts(id: string): Promise<number> {
    return repos.exercises.countWorkouts(id)
  }

  // Backlog item 24: name, setup notes, and rest timer are edited together
  // through one consolidated flyout now, so they're saved in a single write
  // instead of the three separate updateExerciseName/updateSetupNotes/
  // updateRestSeconds calls this replaced.
  async function updateExercise(
    id: string,
    name: string,
    setupNotes: string | null,
    restSeconds: number | null,
    loadType: LoadType,
    tracksDistance = false,
    tracksIncline = false,
    tracksLevel = false,
    tracksCalories = false,
    muscleGroup: MuscleGroup | null = null,
    alsoWorks: MuscleGroup[] = [],
    barbell: BarbellFields | null = null,
    // Issue #173: undefined leaves push_pull as it is.
    pushPull?: PushPull | null,
  ) {
    const { error } = await repos.exercises.update(id, {
      name,
      setup_notes: setupNotes,
      rest_seconds: restSeconds,
      load_type: loadType,
      tracks_distance: tracksDistance,
      tracks_incline: tracksIncline,
      tracks_level: tracksLevel,
      tracks_calories: tracksCalories,
      muscle_group: muscleGroup,
      also_works: alsoWorks,
      ...barbell,
      ...(pushPull !== undefined && { push_pull: pushPull }),
    })
    if (!error) {
      const exercise = exercises.value.find((e) => e.id === id)
      if (exercise) {
        exercise.name = name
        exercise.setup_notes = setupNotes
        exercise.rest_seconds = restSeconds
        exercise.load_type = loadType
        exercise.tracks_distance = tracksDistance
        exercise.tracks_incline = tracksIncline
        exercise.tracks_level = tracksLevel
        exercise.tracks_calories = tracksCalories
        exercise.muscle_group = muscleGroup
        exercise.also_works = alsoWorks
        if (barbell) Object.assign(exercise, barbell)
        if (pushPull !== undefined) exercise.push_pull = pushPull
      }
    }
    return { error }
  }

  // Issue #81: the workout screen's setup-notes sheet saves just the notes
  // (updateExercise needs every field). Blank text clears the note.
  async function updateSetupNotes(id: string, notes: string) {
    const setupNotes = notes.trim() || null
    const { error } = await repos.exercises.update(id, { setup_notes: setupNotes })
    if (!error) {
      const exercise = exercises.value.find((e) => e.id === id)
      if (exercise) exercise.setup_notes = setupNotes
    }
    return { error }
  }

  // Issue #429: the rest screen's "Keep 1:45 for Bench press" saves just the
  // rest time.
  async function updateRestSeconds(id: string, restSeconds: number | null) {
    const { error } = await repos.exercises.update(id, { rest_seconds: restSeconds })
    if (!error) {
      const exercise = exercises.value.find((e) => e.id === id)
      if (exercise) exercise.rest_seconds = restSeconds
    }
    return { error }
  }

  // Issue #22: the plate calculator sheet's "Change" bar picker saves just
  // the bar fields.
  async function updateBarbell(id: string, barbell: BarbellFields) {
    const { error } = await repos.exercises.update(id, barbell)
    if (!error) {
      const exercise = exercises.value.find((e) => e.id === id)
      if (exercise) Object.assign(exercise, barbell)
    }
    return { error }
  }

  // Issue #42: the one-time check screen (MuscleCheckScreen.vue) only sets
  // the muscle fields, plus library_id for a name that matched the library.
  async function updateMuscleGroup(
    id: string,
    muscleGroup: MuscleGroup,
    alsoWorks: MuscleGroup[],
    libraryId: string | null,
  ) {
    const { error } = await repos.exercises.update(id, { muscle_group: muscleGroup, also_works: alsoWorks, library_id: libraryId })
    if (!error) {
      const exercise = exercises.value.find((e) => e.id === id)
      if (exercise) {
        exercise.muscle_group = muscleGroup
        exercise.also_works = alsoWorks
        exercise.library_id = libraryId
      }
    }
    return { error }
  }

  // Issue #173: the push or pull fix-up screen saves just this, on tap.
  async function updatePushPull(id: string, pushPull: PushPull) {
    const { error } = await repos.exercises.update(id, { push_pull: pushPull })
    if (!error) {
      const exercise = exercises.value.find((e) => e.id === id)
      if (exercise) exercise.push_pull = pushPull
    }
    return { error }
  }

  // Links an existing exercise to a library entry, or unlinks it (null). The
  // review screen and the edit sheet's Library match row (libraryLink.ts).
  // Only library_id changes; the user's name, muscles, and history stay.
  async function setLibraryLink(id: string, libraryId: string | null) {
    const { error } = await repos.exercises.update(id, { library_id: libraryId })
    if (!error) {
      const exercise = exercises.value.find((e) => e.id === id)
      if (exercise) exercise.library_id = libraryId
    }
    return { error }
  }

  // Backlog item 76: changing load type once an exercise has logged sets
  // would make its past sets misread (a level's weight is always 0, so a
  // switch to 'weight' would look like every past set was unloaded) — the
  // edit form checks this before letting the load-type field be touched.
  function hasLoggedSets(exerciseId: string): Promise<boolean> {
    return repos.exercises.hasLoggedSets(exerciseId)
  }

  // Item 84: cleared before a refetch (lib/refetchAccountData.ts). This
  // store is an app-lifetime singleton in this SPA, so without clearing it a
  // reset or restore would leave the old exercise catalog showing until
  // fetchExercises happened to run again, and WorkoutLogger.vue's
  // mount guard (`if (exercises.exercises.length === 0)`) would skip that
  // refetch entirely since the stale array isn't empty.
  function resetExercisesState() {
    exercises.value = []
    errorMessage.value = ''
    fetched.value = false
  }

  return {
    exercises,
    activeExercises,
    ownedLibrary,
    loading,
    errorMessage,
    fetched,
    fetchExercises,
    createExercise,
    addFromLibrary,
    archiveExercise,
    mergeExercise,
    countWorkouts,
    updateExercise,
    updateSetupNotes,
    updateRestSeconds,
    updateMuscleGroup,
    updatePushPull,
    updateBarbell,
    setLibraryLink,
    hasLoggedSets,
    resetExercisesState,
  }
})
