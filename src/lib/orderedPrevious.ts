// Issue #1061: which past session of a routine to pre-fill an exercise from.
// Exercises that share muscles do differently depending on what came before,
// so prefer a session where this exercise came after the same exercises.
// "Order" is when each exercise's first set was logged (set_index), not the
// routine's saved order.

export interface OrderedSet {
  exercise_id: string
}

export interface OrderedWorkout<S extends OrderedSet> {
  sets: S[] // ordered by set_index
}

// `workouts` is newest first. `priorIds` is the exercises already started in
// today's session, in the order they were started (never `exerciseId`).
// Returns the matched session's sets for `exerciseId`, or null when no
// session matches (the caller keeps its usual pre-fill).
export function matchOrderedPrevious<S extends OrderedSet>(
  workouts: OrderedWorkout<S>[],
  exerciseId: string,
  priorIds: string[],
): S[] | null {
  const prior = new Set(priorIds)
  const candidates = workouts
    .map((w) => {
      const order: string[] = []
      for (const s of w.sets) if (!order.includes(s.exercise_id)) order.push(s.exercise_id)
      const position = order.indexOf(exerciseId)
      return position < 0 ? null : { w, before: order.slice(0, position), position }
    })
    .filter((c): c is { w: OrderedWorkout<S>; before: string[]; position: number } => c !== null)

  const sameSet = candidates.find((c) => c.before.length === prior.size && c.before.every((id) => prior.has(id)))
  const match = sameSet ?? candidates.find((c) => c.position === priorIds.length)
  return match ? match.w.sets.filter((s) => s.exercise_id === exerciseId) : null
}
