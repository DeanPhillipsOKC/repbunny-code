// Issue #535: a note on one exercise for one workout ("Note for today"),
// kept apart from the exercise's permanent setup notes. Stored one per
// workout and exercise (workout_exercise_notes), at most EXERCISE_NOTE_MAX
// characters, which the database checks too.

export const EXERCISE_NOTE_MAX = 500

export interface ExerciseNote {
  exercise_id: string
  note: string
}

// The note as it's saved: trimmed and cut to the limit, or null when
// nothing's left (saving that clears the note).
export function cleanExerciseNote(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim()
  return trimmed ? trimmed.slice(0, EXERCISE_NOTE_MAX).trimEnd() : null
}

// Two notes that land on the same workout and exercise (a merge of two
// exercises, or an import's per-set notes) keep both, one per line.
export function combineExerciseNotes(a: string | null | undefined, b: string | null | undefined): string | null {
  const parts = [cleanExerciseNote(a), cleanExerciseNote(b)].filter((p): p is string => p !== null)
  const unique = parts.filter((p, i) => parts.indexOf(p) === i)
  return cleanExerciseNote(unique.join('\n'))
}

// A workout's notes by exercise id.
export function exerciseNotesById(notes: ExerciseNote[] | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const n of notes ?? []) out[n.exercise_id] = n.note
  return out
}
