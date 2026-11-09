import type { MuscleGroup } from './muscleGroups'

// Issue #207: "Save as routine" for a finished workout, shared by History
// (item 89) and the finish recap's first-workout offer.

type Kind = 'push' | 'pull' | 'arms' | 'lower' | 'core' | 'cardio'

const KIND_OF: Record<MuscleGroup, Kind> = {
  chest: 'push',
  shoulders: 'push',
  back: 'pull',
  // Curls pull and pressdowns push, so arms never decide between the two.
  arms: 'arms',
  legs: 'lower',
  glutes: 'lower',
  core: 'core',
  cardio: 'cardio',
}

const UPPER: Kind[] = ['push', 'pull', 'arms']

export function workoutDateName(performedAt: string): string {
  return `Workout ${new Date(performedAt).toLocaleString(undefined, { month: 'short', day: 'numeric' })}`
}

// A name from what was trained, as the user asked on #207: all push "Upper
// body push", all pull "Upper body pull", other upper "Upper body", then
// "Lower body", "Core", "Cardio", and a mix "Full body". Exercises with no
// muscle group are ignored; with none known it falls back to the date.
export function suggestTemplateName(groups: (MuscleGroup | null | undefined)[], performedAt: string): string {
  const kinds = new Set(groups.filter((g): g is MuscleGroup => !!g).map((g) => KIND_OF[g]))
  if (kinds.size === 0) return workoutDateName(performedAt)
  if ([...kinds].every((k) => UPPER.includes(k))) {
    if (kinds.has('push') && !kinds.has('pull')) return 'Upper body push'
    if (kinds.has('pull') && !kinds.has('push')) return 'Upper body pull'
    return 'Upper body'
  }
  if (kinds.size === 1) {
    if (kinds.has('lower')) return 'Lower body'
    if (kinds.has('core')) return 'Core'
    if (kinds.has('cardio')) return 'Cardio'
  }
  return 'Full body'
}

// One row per distinct exercise, in first-performed order, with as many
// target sets as were logged. Archived exercises are left out.
export function templateRowsFromSets(
  sets: { exercise_id: string }[],
  isArchived: (exerciseId: string) => boolean,
): { exerciseId: string; targetSets: number }[] {
  const rows: { exerciseId: string; targetSets: number }[] = []
  for (const set of sets) {
    if (isArchived(set.exercise_id)) continue
    const row = rows.find((r) => r.exerciseId === set.exercise_id)
    if (row) row.targetSets += 1
    else rows.push({ exerciseId: set.exercise_id, targetSets: 1 })
  }
  return rows
}
