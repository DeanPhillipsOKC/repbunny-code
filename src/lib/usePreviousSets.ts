import { computed, ref, watch } from 'vue'
import { repos } from '../data'
import type { SetWithExercise } from './types'
import type { useWorkoutsStore } from '../stores/workouts'

// The logger's "last time" sets, by exercise id: the routine's latest session
// (pre-fill source), item 88's fallback from the exercise's own latest
// workout, and issue #1061's session where the exercise came in today's order.
export function usePreviousSets(workout: ReturnType<typeof useWorkoutsStore>) {
  // Grouped in the order logged, so the row pre-fill can read set N off it.
  const previousSetsByExercise = computed(() => {
    const grouped: Record<string, SetWithExercise[]> = {}
    for (const set of workout.previousWorkout?.sets ?? []) {
      ;(grouped[set.exercise_id] ??= []).push(set)
    }
    return grouped
  })

  // Issue #183: item 88's fallback sets, kept so the rest line can compare a
  // set with the same set last time.
  const fallbackSetsByExercise: Record<string, SetWithExercise[]> = {}

  // Issue #1061: wins over the routine's latest session; an exercise with no
  // match keeps it. `orderSeed` is the started-exercise list each was loaded for.
  const orderedPreviousByExercise = ref<Record<string, SetWithExercise[]>>({})
  const orderSeed: Record<string, string> = {}

  watch(
    () => workout.activeWorkoutId,
    () => {
      for (const id of Object.keys(fallbackSetsByExercise)) delete fallbackSetsByExercise[id]
      for (const id of Object.keys(orderSeed)) delete orderSeed[id]
      orderedPreviousByExercise.value = {}
    },
  )

  function previousSetsFor(id: string): SetWithExercise[] | undefined {
    return orderedPreviousByExercise.value[id] ?? previousSetsByExercise.value[id]
  }

  // Exercises already started in today's workout, in the order they were started.
  function startedExerciseIds(except: string): string[] {
    const ids: string[] = []
    for (const set of workout.activeSets) if (set.exercise_id !== except && !ids.includes(set.exercise_id)) ids.push(set.exercise_id)
    return ids
  }

  // True when the started exercises changed since this exercise was last loaded.
  function orderChanged(id: string): boolean {
    return orderSeed[id] !== startedExerciseIds(id).join('|')
  }

  async function loadOrderedPrevious(id: string) {
    if (!workout.activeTemplateId) return
    const prior = startedExerciseIds(id)
    orderSeed[id] = prior.join('|')
    const { data, error } = await repos.workouts.getOrderedPreviousSets(workout.activeTemplateId, workout.activeWorkoutId, id, prior)
    const next = { ...orderedPreviousByExercise.value }
    if (!error && data && data.length > 0) next[id] = data
    else delete next[id]
    orderedPreviousByExercise.value = next
  }

  return { previousSetsByExercise, fallbackSetsByExercise, previousSetsFor, orderChanged, loadOrderedPrevious }
}
