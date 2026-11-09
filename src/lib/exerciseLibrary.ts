import type { LoadType } from './types'
import type { MuscleGroup } from './muscleGroups'
import libraryData from '../data/exercise-library.json'

// Issue #150: what swap suggestions rank alternatives by (lib/exerciseSwap.ts).
// Kept in sync with scripts/check-exercise-library.mjs.
export type LibraryEquipmentType = 'barbell' | 'dumbbell' | 'kettlebell' | 'smith' | 'cable' | 'machine' | 'bodyweight' | 'other'

export type LibraryMovement =
  | 'horizontal_press' | 'incline_press' | 'chest_fly' | 'dip' | 'vertical_pull' | 'hang' | 'horizontal_row'
  | 'rear_delt' | 'hip_hinge' | 'shrug' | 'vertical_press' | 'lateral_raise' | 'front_raise' | 'biceps_curl'
  | 'triceps_extension' | 'wrist_curl' | 'plank' | 'crunch' | 'leg_raise' | 'rotation' | 'hip_thrust'
  | 'kickback' | 'hip_abduction' | 'hip_adduction' | 'squat' | 'lunge' | 'leg_extension' | 'leg_curl'
  | 'calf_raise' | 'jump' | 'run_walk' | 'cycle' | 'cardio_machine' | 'conditioning'

// Issue #41: the bundled starter exercise library. `id` is permanent once
// shipped (exercises.library_id will store it).
export interface LibraryExercise {
  id: string
  name: string
  aliases: string[]
  muscleGroup: MuscleGroup
  alsoWorks: MuscleGroup[]
  loadType: LoadType
  tracksDistance: boolean
  tracksIncline: boolean
  tracksLevel: boolean
  tracksCalories: boolean
  equipment: string
  equipmentType: LibraryEquipmentType
  movement: LibraryMovement
  howTo: string[]
}

export const EXERCISE_LIBRARY = libraryData as LibraryExercise[]

// Same normalization as templateCategory.ts: lowercase, punctuation to spaces.
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const BY_NAME = new Map<string, LibraryExercise>()
for (const exercise of EXERCISE_LIBRARY) {
  for (const name of [exercise.name, ...exercise.aliases]) {
    BY_NAME.set(normalize(name), exercise)
  }
}

export function findLibraryMatch(name: string): LibraryExercise | null {
  return BY_NAME.get(normalize(name)) ?? null
}

const BY_ID = new Map(EXERCISE_LIBRARY.map((exercise) => [exercise.id, exercise]))

export function libraryEntry(id: string): LibraryExercise | null {
  return BY_ID.get(id) ?? null
}

// Issue #173: an exercise's library movement, for Balance's push or pull
// (lib/balance.ts takes this as its `movementOf`). By library_id first, then
// by name or alias, so an unlinked "Face Pull" still counts. A library_id
// that no longer exists falls back to the name.
export function libraryMovementOf(exercise: { name: string; library_id?: string | null }): LibraryMovement | null {
  const entry = (exercise.library_id ? libraryEntry(exercise.library_id) : null) ?? findLibraryMatch(exercise.name)
  return entry?.movement ?? null
}

// Issue #39: alphabetical, for every list the library shows.
export const LIBRARY_BY_NAME = [...EXERCISE_LIBRARY].sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
)

// Issue #39: an entry is already owned when one of the user's unarchived
// exercises carries its library_id, or has a name matching its name or an
// alias. Owned entries are never offered as addable, so adding can't
// duplicate an exercise the user already has.
export function ownedLibraryIds(exercises: { name: string; library_id: string | null }[]): Set<string> {
  const owned = new Set<string>()
  for (const exercise of exercises) {
    if (exercise.library_id) owned.add(exercise.library_id)
    const match = findLibraryMatch(exercise.name)
    if (match) owned.add(match.id)
  }
  return owned
}

// Case-insensitive substring match on the name and every alias.
export function libraryMatchesSearch(entry: LibraryExercise, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [entry.name, ...entry.aliases].some((name) => name.toLowerCase().includes(q))
}

// The new-exercise forms' "Already in the library" card: an exact name/alias
// match first, then a name/alias that starts with what's typed. Needs 3+
// characters so a couple of letters doesn't pop a card up.
export function librarySuggestion(name: string, owned: Set<string>): LibraryExercise | null {
  const typed = normalize(name)
  if (typed.length < 3) return null
  const exact = findLibraryMatch(typed)
  if (exact && !owned.has(exact.id)) return exact
  return (
    LIBRARY_BY_NAME.find(
      (entry) => !owned.has(entry.id) && [entry.name, ...entry.aliases].some((n) => normalize(n).startsWith(typed)),
    ) ?? null
  )
}

const TRACKING_WORDS: Record<LoadType, string> = {
  weight: 'weight',
  level: 'level',
  bodyweight: 'bodyweight',
  assisted: 'assisted',
  timed: 'timed',
}

export function trackingWord(entry: LibraryExercise): string {
  return TRACKING_WORDS[entry.loadType]
}

// Library row subline, "{Equipment} · {tracking}". "Bodyweight · bodyweight"
// just says "Bodyweight".
export function librarySubline(entry: LibraryExercise): string {
  const tracking = trackingWord(entry)
  if (entry.equipment.toLowerCase() === tracking) return entry.equipment
  return `${entry.equipment} · ${tracking}`
}

// The detail screen's "Tracked as" tile.
export function trackedAsLabel(entry: LibraryExercise): string {
  switch (entry.loadType) {
    case 'weight':
      return 'Weight × reps'
    case 'level':
      return 'Level × reps'
    case 'bodyweight':
      return 'Bodyweight × reps'
    case 'assisted':
      return 'Assisted × reps'
    case 'timed': {
      const extras = [
        entry.tracksDistance && 'distance',
        entry.tracksIncline && 'incline',
        entry.tracksLevel && 'level',
        entry.tracksCalories && 'calories',
      ].filter(Boolean)
      return extras.length ? `Time + ${extras.join(', ')}` : 'Time'
    }
  }
}
