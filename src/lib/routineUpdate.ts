// Issue #263: the finish recap's "Update <routine>?" card. Compares what a
// routine workout actually did with the routine's plan and lists each
// difference as a change the lifter can tick. Nothing here writes; the
// templates store's applyRoutineChanges does that, only for ticked lines.

export type RoutineChangeKind = 'add' | 'sets' | 'swap' | 'remove'

export interface RoutineChange {
  key: string
  kind: RoutineChangeKind
  // add: the exercise to append. swap: the one swapped in. sets/remove: the
  // routine's own exercise.
  exerciseId: string
  // The routine row a sets, swap, or remove line changes.
  templateExerciseId: string | null
  // swap: the routine exercise it replaces.
  fromExerciseId: string | null
  fromSets: number | null
  toSets: number | null
  // Removals start unticked, since a skipped exercise is often a one-off.
  defaultChecked: boolean
}

interface PlanRow {
  id: string
  exercise_id: string
  position: number
  target_sets: number | null
}

export function routineChanges(
  plan: PlanRow[],
  sets: { exercise_id: string }[],
  // Swapped-in exercise id -> the routine exercise it replaced (#156).
  swapOrigins: Record<string, string>,
  isArchived: (exerciseId: string) => boolean,
): RoutineChange[] {
  // Logged sets per exercise, in first-performed order.
  const logged: { exerciseId: string; count: number }[] = []
  for (const set of sets) {
    const row = logged.find((r) => r.exerciseId === set.exercise_id)
    if (row) row.count += 1
    else logged.push({ exerciseId: set.exercise_id, count: 1 })
  }
  const countOf = (id: string) => logged.find((r) => r.exerciseId === id)?.count ?? 0

  const planIds = new Set(plan.map((te) => te.exercise_id))
  const extras = logged.filter((r) => !planIds.has(r.exerciseId) && !isArchived(r.exerciseId))
  const usedExtras = new Set<string>()
  const seen = new Set<string>()
  const changes: RoutineChange[] = []

  for (const te of [...plan].sort((a, b) => a.position - b.position)) {
    if (seen.has(te.exercise_id)) continue
    seen.add(te.exercise_id)
    const count = countOf(te.exercise_id)
    if (count > 0) {
      // No target means no plan to change; extra or fewer sets are fine.
      if (te.target_sets !== null && count !== te.target_sets) {
        changes.push({
          key: `sets:${te.id}`,
          kind: 'sets',
          exerciseId: te.exercise_id,
          templateExerciseId: te.id,
          fromExerciseId: null,
          fromSets: te.target_sets,
          toSets: count,
          defaultChecked: true,
        })
      }
      continue
    }
    // Skipped, but something swapped in for it got sets: that one takes its
    // place (the first logged, when it was swapped more than once).
    const swapIn = extras.find((r) => swapOrigins[r.exerciseId] === te.exercise_id && !usedExtras.has(r.exerciseId))
    if (swapIn) {
      usedExtras.add(swapIn.exerciseId)
      changes.push({
        key: `swap:${te.id}`,
        kind: 'swap',
        exerciseId: swapIn.exerciseId,
        templateExerciseId: te.id,
        fromExerciseId: te.exercise_id,
        fromSets: te.target_sets,
        toSets: te.target_sets === null ? null : swapIn.count,
        defaultChecked: true,
      })
      continue
    }
    changes.push({
      key: `remove:${te.id}`,
      kind: 'remove',
      exerciseId: te.exercise_id,
      templateExerciseId: te.id,
      fromExerciseId: null,
      fromSets: te.target_sets,
      toSets: null,
      defaultChecked: false,
    })
  }

  for (const extra of extras) {
    if (usedExtras.has(extra.exerciseId)) continue
    changes.push({
      key: `add:${extra.exerciseId}`,
      kind: 'add',
      exerciseId: extra.exerciseId,
      templateExerciseId: null,
      fromExerciseId: null,
      fromSets: null,
      toSets: extra.count,
      defaultChecked: true,
    })
  }
  return changes
}

const setsLabel = (n: number) => `${n} set${n === 1 ? '' : 's'}`

// One line of the card, split so the names can be bold.
export interface RoutineChangePart {
  text: string
  strong?: boolean
  dim?: boolean
}

export function routineChangeParts(change: RoutineChange, nameOf: (exerciseId: string) => string): RoutineChangePart[] {
  switch (change.kind) {
    case 'add':
      return [{ text: 'Add ' }, { text: nameOf(change.exerciseId), strong: true }, { text: ` (${setsLabel(change.toSets ?? 0)})`, dim: true }]
    case 'sets':
      return [{ text: nameOf(change.exerciseId), strong: true }, { text: `: ${change.fromSets} → ${setsLabel(change.toSets ?? 0)}` }]
    case 'swap': {
      const parts: RoutineChangePart[] = [
        { text: 'Swap ' },
        { text: nameOf(change.fromExerciseId ?? ''), strong: true },
        { text: ' for ' },
        { text: nameOf(change.exerciseId), strong: true },
      ]
      if (change.toSets !== null && change.toSets !== change.fromSets) parts.push({ text: ` (${setsLabel(change.toSets)})`, dim: true })
      return parts
    }
    case 'remove':
      return [{ text: 'Remove ' }, { text: nameOf(change.exerciseId), strong: true }, { text: ' (skipped today)', dim: true }]
  }
}

export function routineChangeText(change: RoutineChange, nameOf: (exerciseId: string) => string): string {
  return routineChangeParts(change, nameOf)
    .map((p) => p.text)
    .join('')
}
