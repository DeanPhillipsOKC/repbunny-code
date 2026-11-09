import type { Exercise } from './types'
import type { MuscleGroup } from './muscleGroups'
import {
  EXERCISE_LIBRARY,
  findLibraryMatch,
  libraryEntry,
  ownedLibraryIds,
  type LibraryExercise,
  type LibraryMovement,
} from './exerciseLibrary'

// Issue #150: "Try instead" when the planned machine is taken. Alternatives
// share the current exercise's target (a finer split than the muscle group,
// below) and are ranked by how close they are: same movement pattern first,
// then ones the user has logged before, then same equipment, then same load
// type. Ties go alphabetical. The user's own exercises come first as
// themselves; a library entry the user doesn't own yet is offered too and gets
// added when picked.

export const SWAP_LIMIT = 6

export type SwapExercise = Pick<Exercise, 'id' | 'name' | 'muscle_group' | 'load_type' | 'library_id'>

export interface SwapOption {
  key: string
  name: string
  // The user's exercise, or null for a library entry they don't own yet.
  exerciseId: string | null
  entry: LibraryExercise | null
  loggedBefore: boolean
  sameMovement: boolean
  sameEquipment: boolean
}

// Swap only. "Arms" mixes biceps and triceps, so a muscle group alone offered
// curls for a triceps lift. A target is the muscle group, split where one
// group holds lifts that can't stand in for each other. It never changes the
// muscle groups users pick or what Progress counts.
export type SwapTarget = string

// Per group, which movements make up each target. A group not listed here is
// one target (chest, core, cardio).
const TARGETS: Partial<Record<MuscleGroup, Record<string, LibraryMovement[]>>> = {
  arms: {
    biceps: ['biceps_curl'],
    triceps: ['triceps_extension', 'dip', 'horizontal_press'],
    forearms: ['wrist_curl', 'hang'],
  },
  shoulders: {
    front_delts: ['vertical_press', 'front_raise'],
    side_delts: ['lateral_raise', 'shrug'],
    rear_delts: ['rear_delt'],
  },
  back: {
    lats: ['vertical_pull', 'horizontal_row'],
    lower_back: ['hip_hinge'],
    traps: ['shrug'],
    rear_delts: ['rear_delt'],
  },
  legs: {
    quads: ['squat', 'lunge', 'leg_extension', 'jump'],
    hamstrings: ['leg_curl', 'hip_hinge'],
    calves: ['calf_raise'],
    adductors: ['hip_adduction'],
  },
  glutes: {
    glutes: ['hip_thrust', 'kickback', 'hip_hinge'],
    abductors: ['hip_abduction'],
  },
}

// A custom exercise has no movement, so its name decides. Checked in order,
// first match wins ("wrist curl" is forearms before "curl" makes it biceps).
const NAME_HINTS: Partial<Record<MuscleGroup, [SwapTarget, RegExp][]>> = {
  arms: [
    ['forearms', /wrist|forearm|grip|farmer|hang/],
    ['triceps', /tricep|pushdown|push down|skull|french|dip|close grip|kickback/],
    ['biceps', /bicep|curl|chin/],
  ],
  shoulders: [
    ['rear_delts', /rear|reverse|face pull/],
    ['side_delts', /lateral|side|upright/],
    ['front_delts', /press|front|military|overhead|arnold/],
  ],
  back: [
    ['traps', /shrug|trap/],
    ['rear_delts', /face pull|rear/],
    ['lower_back', /deadlift|extension|hyper|good morning/],
    ['lats', /row|pull|lat|chin/],
  ],
  legs: [
    ['calves', /calf|calves/],
    ['adductors', /adduct/],
    ['hamstrings', /curl|hamstring|rdl|romanian|stiff|good morning|deadlift/],
    ['quads', /squat|press|lunge|extension|step|split|jump|quad/],
  ],
  glutes: [
    ['abductors', /abduct|lateral walk|clam|hydrant/],
    ['glutes', /thrust|bridge|kickback|glute|hip|swing|pull through/],
  ],
}

const SCORE = { movement: 8, logged: 4, equipment: 2, loadType: 1 }

function libraryFor(exercise: Pick<Exercise, 'name' | 'library_id'>): LibraryExercise | null {
  return (exercise.library_id ? libraryEntry(exercise.library_id) : null) ?? findLibraryMatch(exercise.name)
}

function groupOf(exercise: SwapExercise): MuscleGroup | null {
  return exercise.muscle_group ?? libraryFor(exercise)?.muscleGroup ?? null
}

function targetOf(group: MuscleGroup, entry: LibraryExercise | null, name: string): SwapTarget | null {
  const split = TARGETS[group]
  if (!split) return group
  if (entry) {
    const found = Object.entries(split).find(([, movements]) => movements.includes(entry.movement))
    if (found) return found[0]
  }
  const lower = name.toLowerCase().replace(/[^a-z]+/g, ' ')
  return NAME_HINTS[group]?.find(([, pattern]) => pattern.test(lower))?.[0] ?? null
}

// The current exercise's target, or null when neither the library nor its
// name says what it works like (the sheet then says so).
export function swapTargetFor(exercise: SwapExercise): SwapTarget | null {
  const group = groupOf(exercise)
  return group ? targetOf(group, libraryFor(exercise), exercise.name) : null
}

export function swapGroupFor(exercise: SwapExercise): MuscleGroup | null {
  return groupOf(exercise)
}

export function rankSwapOptions(params: {
  current: SwapExercise
  // Every active (unarchived) exercise the user has.
  exercises: SwapExercise[]
  // Exercises already in this workout, never offered.
  excludeIds: Iterable<string>
  // Exercises with logged sets.
  loggedIds: Set<string>
  limit?: number
  // Rank the whole muscle group instead of the target: the sheet's "Show all"
  // fallback for when the target is unknown or has no matches.
  broad?: boolean
}): SwapOption[] {
  const { current, exercises, loggedIds } = params
  const group = groupOf(current)
  if (!group) return []
  const currentEntry = libraryFor(current)
  const target = params.broad ? null : targetOf(group, currentEntry, current.name)
  // A shorter list beats a wrong one: no target, no suggestions.
  if (!params.broad && !target) return []
  const exclude = new Set(params.excludeIds)
  exclude.add(current.id)

  const fits = (candidateGroup: MuscleGroup | null, entry: LibraryExercise | null, name: string) =>
    candidateGroup === group && (target === null || targetOf(group, entry, name) === target)

  const scored: { option: SwapOption; score: number }[] = []
  function consider(option: Omit<SwapOption, 'sameMovement' | 'sameEquipment'>, loadType: string) {
    const entry = option.entry
    const sameMovement = !!entry && !!currentEntry && entry.movement === currentEntry.movement
    const sameEquipment = !!entry && !!currentEntry && entry.equipmentType === currentEntry.equipmentType
    const score =
      (sameMovement ? SCORE.movement : 0) +
      (option.loggedBefore ? SCORE.logged : 0) +
      (sameEquipment ? SCORE.equipment : 0) +
      (loadType === current.load_type ? SCORE.loadType : 0)
    scored.push({ option: { ...option, sameMovement, sameEquipment }, score })
  }

  for (const exercise of exercises) {
    if (exclude.has(exercise.id)) continue
    const entry = libraryFor(exercise)
    if (!fits(groupOf(exercise), entry, exercise.name)) continue
    consider(
      { key: exercise.id, name: exercise.name, exerciseId: exercise.id, entry, loggedBefore: loggedIds.has(exercise.id) },
      exercise.load_type,
    )
  }

  // Owned entries (the deck's included) are already covered above or excluded.
  const owned = ownedLibraryIds(exercises)
  for (const entry of EXERCISE_LIBRARY) {
    if (owned.has(entry.id) || entry.id === currentEntry?.id || !fits(entry.muscleGroup, entry, entry.name)) continue
    consider({ key: `library:${entry.id}`, name: entry.name, exerciseId: null, entry, loggedBefore: false }, entry.loadType)
  }

  return scored
    .sort((a, b) => b.score - a.score || a.option.name.localeCompare(b.option.name, undefined, { sensitivity: 'base' }))
    .slice(0, params.limit ?? SWAP_LIMIT)
    .map(({ option }) => option)
}

// The reason line under each option, e.g. "Same movement · Machine".
export function swapReason(option: SwapOption): string {
  const parts: string[] = []
  if (option.sameMovement) parts.push('Same movement')
  if (option.entry) parts.push(option.entry.equipment)
  else parts.push('Your exercise')
  return parts.join(' · ')
}
