import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { repos } from '../data'
import { FREE_TEMPLATE_LIMIT, isPremium, noteTemplateCreated } from '../lib/premium'
import { templateCategory, type TemplateCategory } from '../lib/templateCategory'
import type { Exercise, TemplateExerciseWithName, WorkoutTemplate } from '../lib/types'
import { findLibraryMatch } from '../lib/exerciseLibrary'
import { starterLiftEntry, starterRestSeconds, uniqueTemplateName, type StarterProgram } from '../lib/starterPrograms'
import type { RoutineChange } from '../lib/routineUpdate'
import { useExercisesStore } from './exercises'

// Templates sit above workouts/sets (docs/backlog.md item 2): a named,
// ordered list of exercises that a logged workout can be an instance of.
export const useTemplatesStore = defineStore('templates', () => {
  const exercisesStore = useExercisesStore()
  const templates = ref<WorkoutTemplate[]>([])
  const exercisesByTemplate = ref<Record<string, TemplateExerciseWithName[]>>({})
  const loading = ref(false)
  const fetched = ref(false)
  const errorMessage = ref('')

  // Issue #418: set when a starter program is added from first run, so Home can
  // say what happened and highlight the program's first routine. Cleared when
  // the user dismisses the note.
  const programWelcome = ref<{ programName: string; firstTemplateId: string } | null>(null)

  // Backlog item 63: fetchTemplateExercises (kicked off by toggleExpand) and
  // addExerciseToTemplate (kicked off by the "Add" form right after expand)
  // both write to exercisesByTemplate[templateId] and can be in flight at
  // the same time. If the fetch's SELECT started before the add's INSERT
  // committed, it resolves with a stale, exercise-missing list and
  // overwrites the add's own optimistic update with it, briefly (or
  // permanently) hiding the just-added `.exercise-row`. Bumped by every
  // mutation below; fetchTemplateExercises only applies its result if
  // nothing else touched this template's list while it was in flight.
  const exercisesVersion = ref<Record<string, number>>({})
  function bumpExercisesVersion(templateId: string): number {
    const next = (exercisesVersion.value[templateId] ?? 0) + 1
    exercisesVersion.value[templateId] = next
    return next
  }

  // Issue #49: reorderExercises upserts every row of the list by id, so an
  // upsert still in flight when a remove's delete lands puts the removed row
  // back. Reorders and removes for one template go through this queue, one
  // at a time, and each reorder builds its rows when its turn comes.
  const writeChains = new Map<string, Promise<unknown>>()
  function enqueueWrite<T>(templateId: string, write: () => Promise<T>): Promise<T> {
    const run = (writeChains.get(templateId) ?? Promise.resolve()).then(write)
    writeChains.set(templateId, run.catch(() => undefined))
    return run
  }

  const activeTemplates = computed(() => templates.value.filter((t) => !t.is_archived))
  const archivedTemplates = computed(() => templates.value.filter((t) => t.is_archived))

  // Backlog item 111: the category icon on Home tiles and Templates rows.
  // Prefers the live exercisesByTemplate list (kept current by the add/remove
  // mutations below) over fetchTemplates' exercise_refs snapshot, and looks
  // names up in the exercises store so a rename is reflected immediately.
  function categoryOf(template: WorkoutTemplate): TemplateCategory {
    const ids =
      exercisesByTemplate.value[template.id]?.map((te) => te.exercise_id) ??
      template.exercise_refs?.map((ref) => ref.exercise_id) ??
      []
    const known = ids
      .map((id) => exercisesStore.exercises.find((e) => e.id === id))
      .filter((e): e is Exercise => e !== undefined)
    return templateCategory(template.category, template.name, known)
  }

  // Issue #174: Home's WorkoutLogger and TemplateManager can each start a
  // fetch, so two can be in flight at once. Only the latest one may apply its
  // rows or clear `loading`; otherwise an older fetch resolving late ends the
  // skeleton while the newer fetch is still pending and shows its stale rows.
  let fetchSeq = 0
  async function fetchTemplates() {
    const seq = ++fetchSeq
    loading.value = true
    errorMessage.value = ''
    const { data, error } = await repos.templates.list()
    if (seq !== fetchSeq) return
    if (error) {
      errorMessage.value = error.message
    } else {
      templates.value = data
      fetched.value = true
    }
    loading.value = false
  }

  // Issue #104: without Premium (local mode only, see lib/premium.ts), a new
  // template needs fewer than FREE_TEMPLATE_LIMIT active ones. Templates past
  // the limit (e.g. from a restore) are never locked or hidden; this only
  // gates creating another. History may not have loaded the list yet, so it
  // fetches first.
  async function canCreateTemplate(): Promise<boolean> {
    if (isPremium.value) return true
    if (!fetched.value) await fetchTemplates()
    return activeTemplates.value.length < FREE_TEMPLATE_LIMIT
  }

  // Issue #209: the same rule for a starter program's templates, all or
  // nothing, so a program is never partly added.
  async function canAddProgram(program: StarterProgram): Promise<boolean> {
    if (isPremium.value) return true
    if (!fetched.value) await fetchTemplates()
    return activeTemplates.value.length + program.templates.length <= FREE_TEMPLATE_LIMIT
  }

  async function createTemplate(name: string) {
    const { data, error } = await repos.templates.create(name)

    if (!error && data) {
      templates.value.push(data)
      noteTemplateCreated(activeTemplates.value.length)
    }
    return { data, error }
  }

  // Item 89: "Save as routine" on a History workout card. Builds a new
  // template from a workout's own distinct exercises, in first-performed
  // order, with target_sets set to however many sets were actually logged
  // for each — never touches the source workout or (for a templated
  // workout) its originating template.
  async function createTemplateFromWorkout(name: string, rows: { exerciseId: string; targetSets: number }[]) {
    const { data: template, error: templateError } = await repos.templates.create(name)
    if (templateError || !template) return { data: null, error: templateError }

    templates.value.push({
      ...template,
      workout_template_exercises: [{ count: rows.length }],
      exercise_refs: rows.map((row) => ({ exercise_id: row.exerciseId })),
    })
    noteTemplateCreated(activeTemplates.value.length)

    if (rows.length > 0) {
      const { error: exercisesError } = await repos.templates.insertExercises(
        rows.map((row, index) => ({
          template_id: template.id,
          exercise_id: row.exerciseId,
          position: index,
          target_sets: row.targetSets,
        })),
      )
      if (exercisesError) return { data: template, error: exercisesError }
    }

    return { data: template, error: null }
  }

  // Issue #148: a starter program becomes ordinary templates. Each lift reuses
  // the user's exercise for that library entry (by library_id or name, the
  // same "owned" rule as the library) or adds it from the library with a rest
  // time; an exercise the user already has keeps its own settings. Template
  // names get " (2)" when taken, so adding a program twice never collides.
  async function addStarterProgram(program: StarterProgram) {
    if (!exercisesStore.fetched) await exercisesStore.fetchExercises()
    if (!fetched.value) await fetchTemplates()

    const exerciseIds = new Map<string, string>()
    for (const lift of program.templates.flatMap((t) => t.lifts)) {
      if (exerciseIds.has(lift.libraryId)) continue
      const owned =
        exercisesStore.activeExercises.find((e) => e.library_id === lift.libraryId) ??
        exercisesStore.activeExercises.find((e) => findLibraryMatch(e.name)?.id === lift.libraryId)
      if (owned) {
        exerciseIds.set(lift.libraryId, owned.id)
        continue
      }
      const entry = starterLiftEntry(lift)
      const { data, error } = await exercisesStore.addFromLibrary(entry, starterRestSeconds(entry))
      if (error || !data) return { data: null, error: error ?? new Error(`Could not add ${entry.name}.`) }
      exerciseIds.set(lift.libraryId, data.id)
    }

    const created: WorkoutTemplate[] = []
    for (const starter of program.templates) {
      const name = uniqueTemplateName(
        starter.name,
        activeTemplates.value.map((t) => t.name),
      )
      const { data, error } = await createTemplateFromWorkout(
        name,
        starter.lifts.map((lift) => ({ exerciseId: exerciseIds.get(lift.libraryId)!, targetSets: lift.sets })),
      )
      if (error || !data) return { data: created, error: error ?? new Error(`Could not add ${name}.`) }
      await updateTemplateCategory(data.id, starter.category)
      created.push(data)
    }
    return { data: created, error: null }
  }

  async function archiveTemplate(id: string) {
    const { error } = await repos.templates.update(id, { is_archived: true })
    if (!error) {
      const template = templates.value.find((t) => t.id === id)
      if (template) template.is_archived = true
    }
    return { error }
  }

  // Issue #3: rename in place so history/progress attached to this template
  // id survives, unlike archive-and-recreate. Mutates the in-memory template
  // (not just the DB) so Home tiles, the Templates row, and an in-progress
  // workout's header — which all read off this same array — pick up the new
  // name immediately.
  // Issue #495: undo archiveTemplate. Its exercises were never touched, so
  // clearing the flag brings the routine back whole.
  async function restoreTemplate(id: string) {
    const { error } = await repos.templates.update(id, { is_archived: false })
    if (!error) {
      const template = templates.value.find((t) => t.id === id)
      if (template) template.is_archived = false
    }
    return { error }
  }

  async function updateTemplateName(id: string, name: string) {
    const { error } = await repos.templates.update(id, { name })
    if (!error) {
      const template = templates.value.find((t) => t.id === id)
      if (template) template.name = name
    }
    return { error }
  }

  // Issue #2: null clears the pick so the keyword guess tracks the template's
  // name and exercises again.
  async function updateTemplateCategory(id: string, category: TemplateCategory | null) {
    const { error } = await repos.templates.update(id, { category })
    if (!error) {
      const template = templates.value.find((t) => t.id === id)
      if (template) template.category = category
    }
    return { error }
  }

  async function fetchTemplateExercises(templateId: string) {
    const requestVersion = bumpExercisesVersion(templateId)
    const { data, error } = await repos.templates.listExercises(templateId)

    if (!error && exercisesVersion.value[templateId] === requestVersion) {
      exercisesByTemplate.value[templateId] = data
    }
    return { error }
  }

  async function addExerciseToTemplate(templateId: string, exerciseId: string, targetSets: number | null) {
    const list = exercisesByTemplate.value[templateId] ?? []
    const position = list.length === 0 ? 0 : Math.max(...list.map((e) => e.position)) + 1

    const { data, error } = await repos.templates.addExercise({
      template_id: templateId,
      exercise_id: exerciseId,
      position,
      target_sets: targetSets,
    })

    if (!error && data) {
      exercisesByTemplate.value[templateId] = [...list, data]
      bumpExercisesVersion(templateId)
    }
    return { data, error }
  }

  // Backlog item 14: change a routine's target set count without removing
  // and re-adding the exercise (which would lose its position).
  async function updateTemplateExercise(templateId: string, templateExerciseId: string, targetSets: number | null) {
    const { error } = await repos.templates.updateExerciseTargetSets(templateExerciseId, targetSets)
    if (!error) {
      const list = exercisesByTemplate.value[templateId] ?? []
      const te = list.find((e) => e.id === templateExerciseId)
      if (te) te.target_sets = targetSets
      bumpExercisesVersion(templateId)
    }
    return { error }
  }

  async function removeExerciseFromTemplate(templateId: string, templateExerciseId: string) {
    const { error } = await enqueueWrite(templateId, () => repos.templates.removeExercise(templateExerciseId))
    if (!error) {
      const list = exercisesByTemplate.value[templateId] ?? []
      exercisesByTemplate.value[templateId] = list.filter((e) => e.id !== templateExerciseId)
      bumpExercisesVersion(templateId)
    }
    return { error }
  }

  // Swaps this exercise's position with its neighbor in `direction` and
  // persists both rows. The template editor (issue #6) uses
  // reorderExercises below instead, for its drag and keyboard reordering.
  async function moveExercise(templateId: string, templateExerciseId: string, direction: 'up' | 'down') {
    const list = exercisesByTemplate.value[templateId] ?? []
    const index = list.findIndex((e) => e.id === templateExerciseId)
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (index === -1 || swapWith < 0 || swapWith >= list.length) return { error: null }

    const a = list[index]
    const b = list[swapWith]
    const [aPos, bPos] = [b.position, a.position]

    const { error } = await repos.templates.saveExercises([
      { id: a.id, template_id: templateId, exercise_id: a.exercise_id, position: aPos, target_sets: a.target_sets },
      { id: b.id, template_id: templateId, exercise_id: b.exercise_id, position: bPos, target_sets: b.target_sets },
    ])

    if (!error) {
      a.position = aPos
      b.position = bPos
      list.sort((x, y) => x.position - y.position)
      exercisesByTemplate.value[templateId] = [...list]
      bumpExercisesVersion(templateId)
    }
    return { error }
  }

  // Issue #6: the editor's drag reorder (and remove-Undo) can move an
  // exercise any distance, which moveExercise's neighbor swap would need
  // many round trips for. Applies the new order locally first so a dropped
  // card doesn't snap back while the upsert is in flight, then writes every
  // row's position in one request, queued behind any earlier reorder or
  // remove (see enqueueWrite). Rows are read from the list at write time, so
  // a row removed in the meantime is never written back. Refetches the saved
  // order if the write fails.
  async function reorderExercises(templateId: string, orderedIds: string[]) {
    const previous = exercisesByTemplate.value[templateId] ?? []
    const byId = new Map(previous.map((te) => [te.id, te]))
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((te): te is TemplateExerciseWithName => te !== undefined)
    if (ordered.length !== previous.length) return { error: null }

    ordered.forEach((te, index) => {
      te.position = index
    })
    exercisesByTemplate.value[templateId] = ordered
    bumpExercisesVersion(templateId)

    const { error } = await enqueueWrite(templateId, () =>
      repos.templates.saveExercises(
        (exercisesByTemplate.value[templateId] ?? []).map((te) => ({
          id: te.id,
          template_id: templateId,
          exercise_id: te.exercise_id,
          position: te.position,
          target_sets: te.target_sets,
        })),
      ),
    )
    if (error) await fetchTemplateExercises(templateId)
    return { error }
  }

  // Issue #263: the finish recap's "Update <routine>?" card. Applies only
  // the lines the lifter ticked: target set changes and removals edit their
  // row, a swap repoints its row at the new exercise (keeping its place),
  // and additions are appended in the order they were logged. Stops at the
  // first failed write, then reloads the routine's saved list either way.
  async function applyRoutineChanges(templateId: string, changes: RoutineChange[]) {
    if (!exercisesByTemplate.value[templateId]) {
      const { error } = await fetchTemplateExercises(templateId)
      if (error) return { error }
    }
    let failed: { message: string } | null = null
    for (const change of changes) {
      const list = exercisesByTemplate.value[templateId] ?? []
      const row = list.find((te) => te.id === change.templateExerciseId)
      let result: { error: { message: string } | null } = { error: null }
      if (change.kind === 'add') {
        result = await addExerciseToTemplate(templateId, change.exerciseId, change.toSets)
      } else if (!row) {
        continue
      } else if (change.kind === 'sets') {
        result = await updateTemplateExercise(templateId, row.id, change.toSets)
      } else if (change.kind === 'remove') {
        result = await removeExerciseFromTemplate(templateId, row.id)
      } else {
        result = await enqueueWrite(templateId, () =>
          repos.templates.saveExercises([
            { id: row.id, template_id: templateId, exercise_id: change.exerciseId, position: row.position, target_sets: change.toSets },
          ]),
        )
      }
      if (result.error) {
        failed = result.error
        break
      }
    }
    await fetchTemplateExercises(templateId)
    const template = templates.value.find((t) => t.id === templateId)
    const refreshed = exercisesByTemplate.value[templateId]
    if (template && refreshed) {
      template.exercise_refs = refreshed.map((te) => ({ exercise_id: te.exercise_id }))
      template.workout_template_exercises = [{ count: refreshed.length }]
    }
    return { error: failed }
  }

  // Item 84: cleared before a refetch (lib/refetchAccountData.ts), the same
  // app-lifetime-singleton concern as exercises.ts's resetExercisesState.
  // TemplateManager.vue's own mount fetch is unconditional, but
  // WorkoutLogger.vue's exercisesByTemplate reads for the active template
  // aren't refetched on their own, so a stale entry could otherwise surface.
  function resetTemplatesState() {
    templates.value = []
    fetched.value = false
    exercisesByTemplate.value = {}
    exercisesVersion.value = {}
    errorMessage.value = ''
  }

  return {
    templates,
    activeTemplates,
    archivedTemplates,
    categoryOf,
    exercisesByTemplate,
    loading,
    fetched,
    errorMessage,
    programWelcome,
    fetchTemplates,
    canCreateTemplate,
    createTemplate,
    createTemplateFromWorkout,
    canAddProgram,
    addStarterProgram,
    archiveTemplate,
    restoreTemplate,
    updateTemplateName,
    updateTemplateCategory,
    fetchTemplateExercises,
    addExerciseToTemplate,
    updateTemplateExercise,
    removeExerciseFromTemplate,
    moveExercise,
    reorderExercises,
    applyRoutineChanges,
    resetTemplatesState,
  }
})
