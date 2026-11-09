import type { Exercise } from './types'
import { EXERCISE_LIBRARY, findLibraryMatch, libraryEntry, libraryMatchesSearch, librarySubline, ownedLibraryIds, type LibraryExercise } from './exerciseLibrary'
import { LINK_THRESHOLD, linkTokens, overlap } from './libraryLink'
import { MUSCLE_GROUP_LABELS } from './muscleGroups'
import { guessUsesBarbell } from './plates'
import { appLabel, type ImportApp, type ImportTarget, type SourceExercise } from './importHistory'

// Issue #208: ranking what an imported exercise name could be. The user
// confirms every name (ImportHistory.vue), so this only orders the choices:
// the user's own exercises first, then library entries they don't own yet,
// always with the same load type, scored with the "Link your exercises"
// word overlap (libraryLink.ts). An exact name or alias match scores 1.

type MyExercise = Pick<Exercise, 'id' | 'name' | 'load_type' | 'library_id' | 'is_archived' | 'muscle_group' | 'tracks_distance'>

export type ImportCandidate =
  | { kind: 'mine'; exercise: MyExercise; score: number }
  | { kind: 'library'; entry: LibraryExercise; score: number }

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function nameScore(source: string, names: string[]): number {
  const mine = linkTokens(source)
  let best = 0
  for (const name of names) {
    if (normalize(name) === normalize(source)) return 1
    best = Math.max(best, overlap(mine, linkTokens(name)))
  }
  return best
}

// Every candidate with any overlap, best first; ties go to the user's own,
// then the shorter name.
export function rankCandidates(source: SourceExercise, exercises: MyExercise[]): ImportCandidate[] {
  const sourceEntry = findLibraryMatch(source.name)
  const active = exercises.filter((e) => !e.is_archived && e.load_type === source.loadType)
  const mine: ImportCandidate[] = active.map((exercise) => {
    const linked = exercise.library_id ?? findLibraryMatch(exercise.name)?.id ?? null
    const score = sourceEntry && linked === sourceEntry.id ? 1 : nameScore(source.name, [exercise.name])
    return { kind: 'mine', exercise, score }
  })
  const owned = ownedLibraryIds(exercises.filter((e) => !e.is_archived))
  const library: ImportCandidate[] = EXERCISE_LIBRARY.filter((entry) => entry.loadType === source.loadType && !owned.has(entry.id)).map(
    (entry) => ({ kind: 'library', entry, score: sourceEntry?.id === entry.id ? 1 : nameScore(source.name, [entry.name, ...entry.aliases]) }),
  )
  return [...mine, ...library]
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || (a.kind === b.kind ? 0 : a.kind === 'mine' ? -1 : 1) || candidateName(a).length - candidateName(b).length)
}

// The guess shown on the row, or null ("No close match"). A close one of the
// user's own beats a closer library entry: "Bench Press (Barbell)" should
// land on their "Bench press", not add Barbell Bench Press beside it.
export function bestGuess(ranked: ImportCandidate[]): ImportCandidate | null {
  const close = ranked.filter((c) => c.score >= LINK_THRESHOLD)
  return close.find((c) => c.kind === 'mine') ?? close[0] ?? null
}

export function candidateName(c: ImportCandidate): string {
  return c.kind === 'mine' ? c.exercise.name : c.entry.name
}

function groupLabel(group: MyExercise['muscle_group']): string {
  return group ? MUSCLE_GROUP_LABELS[group] : ''
}

export function candidateSubline(c: ImportCandidate, setCounts: Map<string, number>): string {
  if (c.kind === 'library') return librarySubline(c.entry)
  const n = setCounts.get(c.exercise.id) ?? 0
  const logged = `${n} set${n === 1 ? '' : 's'} logged`
  const group = groupLabel(c.exercise.muscle_group)
  const parts = [equipmentLabel(c.exercise), group, logged].filter(Boolean)
  return parts.join(' · ')
}

// Issue #461: lead one of the user's own exercises with its equipment when it
// is linked to a library entry, or reads as a bar lift, so "Romanian
// Deadlift" plainly matches "Romanian Deadlift (Barbell)".
function equipmentLabel(exercise: MyExercise): string {
  const entry = exercise.library_id ? libraryEntry(exercise.library_id) : null
  if (entry) return entry.equipment
  return exercise.load_type === 'weight' && guessUsesBarbell(null, exercise.name) ? 'Barbell' : ''
}

// The Other… sheet's search: the user's own and the library, same load type.
export function searchCandidates(query: string, source: SourceExercise, exercises: MyExercise[]): ImportCandidate[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const mine: ImportCandidate[] = exercises
    .filter((e) => !e.is_archived && e.load_type === source.loadType && e.name.toLowerCase().includes(q))
    .map((exercise) => ({ kind: 'mine', exercise, score: 0 }))
  const owned = ownedLibraryIds(exercises.filter((e) => !e.is_archived))
  const library: ImportCandidate[] = EXERCISE_LIBRARY.filter((e) => e.loadType === source.loadType && !owned.has(e.id) && libraryMatchesSearch(e, q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({ kind: 'library', entry, score: 0 }))
  return [...mine, ...library]
}

export type ImportAnswer = { kind: 'candidate'; candidate: ImportCandidate } | { kind: 'new' }

// A new exercise keeps the file's name, unless one of the user's exercises
// already has it (with another load type, or the merge would reuse it).
export function newExerciseName(source: SourceExercise, app: ImportApp, exercises: MyExercise[]): string {
  const taken = new Set(exercises.map((e) => normalize(e.name)))
  return taken.has(normalize(source.name)) ? `${source.name} (${appLabel(app)})` : source.name
}

export function answerTarget(answer: ImportAnswer, source: SourceExercise, app: ImportApp, exercises: MyExercise[]): ImportTarget {
  if (answer.kind === 'new') {
    return { kind: 'add', row: { name: newExerciseName(source, app, exercises), load_type: source.loadType, tracks_distance: source.tracksDistance } }
  }
  const c = answer.candidate
  if (c.kind === 'mine') {
    return { kind: 'mine', exerciseId: c.exercise.id, name: c.exercise.name, loadType: c.exercise.load_type, tracksDistance: !!c.exercise.tracks_distance }
  }
  const e = c.entry
  return {
    kind: 'add',
    row: {
      name: e.name,
      library_id: e.id,
      load_type: e.loadType,
      muscle_group: e.muscleGroup,
      also_works: e.alsoWorks,
      tracks_distance: e.tracksDistance,
      tracks_incline: e.tracksIncline,
      tracks_level: e.tracksLevel,
      tracks_calories: e.tracksCalories,
    },
  }
}

// Answers from earlier imports, per app and source name, so a newer export
// from the same app doesn't ask again: the exercise's library id or name.
export const IMPORT_ANSWERS_KEY = 'repbunny-import-answers'

type Remembered = { libraryId?: string; name?: string }

function readRemembered(): Record<string, Remembered> {
  try {
    const parsed = JSON.parse(localStorage.getItem(IMPORT_ANSWERS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const rememberKey = (app: ImportApp, source: string) => `${app}:${normalize(source)}`

export function rememberAnswers(app: ImportApp, targets: Map<string, ImportTarget>) {
  const all = readRemembered()
  for (const [source, target] of targets) {
    all[rememberKey(app, source)] =
      target.kind === 'mine' ? { name: target.name } : typeof target.row.library_id === 'string' ? { libraryId: target.row.library_id } : { name: target.row.name }
  }
  try {
    localStorage.setItem(IMPORT_ANSWERS_KEY, JSON.stringify(all))
  } catch {
    // best-effort; the import itself is done
  }
}

// The remembered answer, if it still points at one of the user's exercises
// with the right load type.
export function rememberedAnswer(app: ImportApp, source: SourceExercise, exercises: MyExercise[]): ImportAnswer | null {
  const memo = readRemembered()[rememberKey(app, source.name)]
  if (!memo) return null
  const active = exercises.filter((e) => !e.is_archived && e.load_type === source.loadType)
  const exercise = memo.libraryId
    ? active.find((e) => e.library_id === memo.libraryId) ?? active.find((e) => findLibraryMatch(e.name)?.id === memo.libraryId)
    : active.find((e) => normalize(e.name) === normalize(memo.name ?? ''))
  return exercise ? { kind: 'candidate', candidate: { kind: 'mine', exercise, score: 1 } } : null
}
