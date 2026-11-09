// Issue #158: what was unusual about a finished workout (a swap, a skipped
// exercise, planned sets left undone), saved in `workouts.events` so a dip on
// a chart can tell its story. Pure, so the e2e unit spec can import it in Node.
//
// Exercises are saved by id and by name. A restore gives every row a new id
// (restore_my_data(), #20), and the online RPC can't reach inside this JSON
// to remap it, so an id that no longer resolves falls back to the name.

export interface EventExercise {
  id: string
  name: string
}

export type WorkoutEvent =
  // `sets` is what was left of the original's planned sets when it was swapped.
  | { type: 'swap'; from: EventExercise; to: EventExercise; sets: number | null }
  | { type: 'skip'; exercise: EventExercise }
  // Planned sets left undone on exercises that got at least one set.
  | { type: 'unfinished'; sets: number; exercises: (EventExercise & { left: number })[] }

export interface PlannedExercise {
  exerciseId: string
  targetSets: number | null
}

export interface EventsInput {
  // The template's exercises as they stood at the finish, swaps applied.
  plan: PlannedExercise[]
  // Template exercise id -> what replaced it (workouts.swappedExercises).
  swaps: Record<string, { to: string; targetSets: number | null }>
  loggedCount: (exerciseId: string) => number
  nameOf: (exerciseId: string) => string
}

// Null when nothing was unusual, so a plain workout stores nothing.
export function buildWorkoutEvents(input: EventsInput): WorkoutEvent[] | null {
  const ref = (id: string): EventExercise => ({ id, name: input.nameOf(id) })
  const events: WorkoutEvent[] = []
  for (const [from, swap] of Object.entries(input.swaps)) {
    events.push({ type: 'swap', from: ref(from), to: ref(swap.to), sets: swap.targetSets })
  }
  for (const p of input.plan) {
    if (input.loggedCount(p.exerciseId) === 0) events.push({ type: 'skip', exercise: ref(p.exerciseId) })
  }
  const unfinished = input.plan
    .map((p) => ({ ...ref(p.exerciseId), left: p.targetSets === null ? 0 : p.targetSets - input.loggedCount(p.exerciseId) }))
    .filter((e) => e.left > 0 && input.loggedCount(e.id) > 0)
  if (unfinished.length > 0) {
    events.push({ type: 'unfinished', sets: unfinished.reduce((sum, e) => sum + e.left, 0), exercises: unfinished })
  }
  return events.length > 0 ? events : null
}

function isExercise(value: unknown): value is EventExercise {
  const v = value as EventExercise | null
  return typeof v?.id === 'string' && typeof v?.name === 'string'
}

// Whatever came back from the database or a backup file (an array, a JSON
// string from SQLite, or junk), as valid events only.
export function parseWorkoutEvents(raw: unknown): WorkoutEvent[] {
  let value = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.filter((e): e is WorkoutEvent => {
    if (e?.type === 'swap') return isExercise(e.from) && isExercise(e.to)
    if (e?.type === 'skip') return isExercise(e.exercise)
    if (e?.type === 'unfinished') return typeof e.sets === 'number' && Array.isArray(e.exercises) && e.exercises.every(isExercise)
    return false
  })
}

// Restore and merge give exercises new ids; this points the events at them.
export function remapWorkoutEvents(raw: unknown, exerciseIds: Map<string, string>): WorkoutEvent[] | null {
  const events = parseWorkoutEvents(raw)
  if (events.length === 0) return null
  const map = <T extends EventExercise>(e: T): T => ({ ...e, id: exerciseIds.get(e.id) ?? e.id })
  return events.map((e) => {
    if (e.type === 'swap') return { ...e, from: map(e.from), to: map(e.to) }
    if (e.type === 'skip') return { ...e, exercise: map(e.exercise) }
    return { ...e, exercises: e.exercises.map(map) }
  })
}

// The user's exercises as they are now, to show today's names and to match
// an event to an exercise whose id changed in a restore.
export interface KnownExercise {
  id: string
  name: string
}

function resolver(known: KnownExercise[]) {
  const byId = new Map(known.map((e) => [e.id, e]))
  return {
    name: (e: EventExercise) => byId.get(e.id)?.name ?? e.name,
    // The id, or for an id that's gone, the same name.
    matches: (e: EventExercise, exercise: KnownExercise) =>
      e.id === exercise.id || (!byId.has(e.id) && e.name.trim().toLowerCase() === exercise.name.trim().toLowerCase()),
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// One plain sentence per event, in the order they were saved.
export function storyLines(events: WorkoutEvent[], known: KnownExercise[]): string[] {
  const { name } = resolver(known)
  return events.map((e) => {
    if (e.type === 'swap') {
      const sets = e.sets ? ` (${plural(e.sets, 'set')})` : ''
      return `${name(e.from)} was taken, so you did ${name(e.to)}${sets}.`
    }
    if (e.type === 'skip') return `Skipped ${name(e.exercise)}.`
    return `Finished with ${plural(e.sets, 'planned set')} left.`
  })
}

// Just the part of the story about one exercise, for its own chart. An early
// finish counts only the sets that exercise left.
export function eventsForExercise(events: WorkoutEvent[], exercise: KnownExercise, known: KnownExercise[]): WorkoutEvent[] {
  const { matches } = resolver(known)
  const out: WorkoutEvent[] = []
  for (const e of events) {
    if (e.type === 'swap' && (matches(e.from, exercise) || matches(e.to, exercise))) out.push(e)
    else if (e.type === 'skip' && matches(e.exercise, exercise)) out.push(e)
    else if (e.type === 'unfinished') {
      const mine = e.exercises.filter((x) => matches(x, exercise))
      if (mine.length > 0) out.push({ type: 'unfinished', sets: mine.reduce((sum, x) => sum + x.left, 0), exercises: mine })
    }
  }
  return out
}
