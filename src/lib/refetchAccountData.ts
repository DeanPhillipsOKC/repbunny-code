import { useBodyWeightStore } from '../stores/bodyWeight'
import { useExercisesStore } from '../stores/exercises'
import { useMeasurementsStore } from '../stores/measurements'
import { useProfileStore } from '../stores/profile'
import { useTemplatesStore } from '../stores/templates'
import { useWorkoutsStore } from '../stores/workouts'

// After restore (issue #20), reset (issue #1), or Erase all data replaces the
// data on the device: clear every store, then let each screen fetch its own,
// so nothing from before lingers in the stores.
export async function refetchAccountData() {
  const workouts = useWorkoutsStore()
  const exercises = useExercisesStore()
  const templates = useTemplatesStore()
  const profile = useProfileStore()
  const bodyWeight = useBodyWeightStore()
  const measurements = useMeasurementsStore()

  workouts.resetActiveWorkoutState()
  exercises.resetExercisesState()
  templates.resetTemplatesState()
  profile.resetProfileState()
  bodyWeight.resetBodyWeightState()
  // Fetched again by the Body screen when it opens.
  measurements.resetMeasurementsState()
  await Promise.all([
    exercises.fetchExercises(),
    templates.fetchTemplates(),
    profile.fetchProfile(),
    bodyWeight.fetchEntries(),
    workouts.fetchProgressStats(),
  ])
}
