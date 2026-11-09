import { ref, type Ref } from 'vue'
import type { LoadType } from './types'
import type { MuscleGroup } from './muscleGroups'

// Issue #42: shared by both muscle-first create forms (ExerciseList.vue and
// AddExerciseSheet.vue). Picking Cardio suggests the Timed load type unless
// the user already picked a load type by hand; other groups leave the load
// type alone. The main group is never also an "also works" group.
export function useMuscleFirstFields(loadType: Ref<LoadType>) {
  const muscleGroup = ref<MuscleGroup | null>(null)
  const alsoWorks = ref<MuscleGroup[]>([])
  let loadTypeTouched = false

  function pickMuscleGroup(group: MuscleGroup) {
    muscleGroup.value = group
    alsoWorks.value = alsoWorks.value.filter((g) => g !== group)
    if (group === 'cardio' && !loadTypeTouched) loadType.value = 'timed'
  }

  function pickLoadType(value: LoadType) {
    loadTypeTouched = true
    loadType.value = value
  }

  function resetMuscleFields() {
    muscleGroup.value = null
    alsoWorks.value = []
    loadTypeTouched = false
  }

  return { muscleGroup, alsoWorks, pickMuscleGroup, pickLoadType, resetMuscleFields }
}
