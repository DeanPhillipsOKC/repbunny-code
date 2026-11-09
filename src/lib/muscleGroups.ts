// Issue #41: the eight friendly muscle groups the exercise library and
// (later) exercises use. Calves count as Legs, hip abductors as Glutes,
// adductors as Legs. Tints come from docs/design/issue-39-exercise-library.html.
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'core'
  | 'glutes'
  | 'legs'
  | 'cardio'

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'core',
  'glutes',
  'legs',
  'cardio',
]

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  glutes: 'Glutes',
  legs: 'Legs',
  cardio: 'Cardio',
}

// Issue #39: the add sheet's "Your leg exercises" heading.
export const MUSCLE_GROUP_ADJECTIVES: Record<MuscleGroup, string> = {
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulder',
  arms: 'arm',
  core: 'core',
  glutes: 'glute',
  legs: 'leg',
  cardio: 'cardio',
}

export const MUSCLE_GROUP_TINTS: Record<MuscleGroup, string> = {
  chest: '#f2879c',
  back: '#b79cf0',
  shoulders: '#8fc4f2',
  arms: '#f2c069',
  core: '#a9cb8d',
  glutes: '#e79ad6',
  legs: '#7fd4c1',
  cardio: '#f4a07a',
}
