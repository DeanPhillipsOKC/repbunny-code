// Issue #336: sanity checks a set's numbers before they're saved. Before
// this, the database's CHECK constraints were the only guard: 0 reps came
// back as a misleading "Set not confirmed" (or raw constraint text when
// editing), and typos like 999 or 1350 lb saved silently and skewed records,
// est. 1RM, and Next-time targets.
//
// A `block` can't be saved at all; a `confirm` asks before saving (only for
// plain 'weight' exercises, where 0 or a huge number is almost always a
// typo). The database constraints stay as the backstop.
import { convertWeight } from './bodyStats'
import type { LoadType, WeightUnit, WorkoutWithSets } from './types'

// No history to compare against: anything at or above this is asked about.
const NO_HISTORY_LIMIT: Record<WeightUnit, number> = { lb: 600, kg: 270 }

export interface SetEntryInput {
  loadType: LoadType
  exerciseName: string
  // v-model.number leaves a cleared field as '', so the values are loose.
  reps: number | string | null
  weight: number | string | null
  weightUnit: WeightUnit
  level: number | string | null
  // The heaviest weight in this exercise's previous session, already in
  // weightUnit, or null when there's no previous session.
  previousHeaviest: number | null
  // 'save' when editing a logged set, so the question matches its button.
  action?: 'log' | 'save'
}

export interface SetEntryCheck {
  block: string | null
  confirm: string | null
}

function asNumber(value: number | string | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// Weights display to the 0.5 step the inputs use, so a converted 61.23 kg
// reads as 61 kg.
function formatWeight(value: number): string {
  return String(Math.round(value * 2) / 2)
}

export function checkSetEntry(input: SetEntryInput): SetEntryCheck {
  const ok: SetEntryCheck = { block: null, confirm: null }
  // Timed sets have no reps or weight to check (#336 leaves their fields
  // out of scope).
  if (input.loadType === 'timed') return ok

  const reps = asNumber(input.reps)
  if (reps === null || reps < 1 || !Number.isInteger(reps)) {
    return { block: 'Reps must be 1 or more.', confirm: null }
  }

  if (input.loadType === 'level') {
    const level = asNumber(input.level)
    if (level === null || level < 1 || !Number.isInteger(level)) {
      return { block: 'Level must be 1 or more.', confirm: null }
    }
    return ok
  }

  const weight = asNumber(input.weight)
  if (weight !== null && weight < 0) return { block: "Weight can't be negative.", confirm: null }
  // Bodyweight's added weight and assisted's assist are optional and 0 is
  // their normal value, so only a plain weighted exercise asks.
  if (input.loadType !== 'weight') return ok
  if (weight === null) return { block: 'Enter a weight.', confirm: null }

  const question = input.action === 'save' ? 'Save it anyway?' : 'Log it anyway?'
  const unit = input.weightUnit
  if (weight === 0) {
    return { block: null, confirm: `0 ${unit} on ${input.exerciseName}? ${question}` }
  }
  const previous = input.previousHeaviest
  if (previous !== null && previous > 0) {
    if (weight > previous * 2) {
      return {
        block: null,
        confirm: `${formatWeight(weight)} ${unit} is a big jump from ${formatWeight(previous)} ${unit} last time. ${question}`,
      }
    }
    return ok
  }
  if (weight >= NO_HISTORY_LIMIT[unit]) {
    return { block: null, confirm: `${formatWeight(weight)} ${unit} is a lot for ${input.exerciseName}. ${question}` }
  }
  return ok
}

// The heaviest weight among a session's sets, converted to `unit`, or null
// when there are none.
export function heaviestWeight(
  sets: readonly { weight: number; weight_unit: WeightUnit }[] | undefined,
  unit: WeightUnit,
): number | null {
  if (!sets || sets.length === 0) return null
  return Math.max(...sets.map((s) => convertWeight(s.weight, s.weight_unit, unit)))
}

// For editing a past set: the heaviest weight of that exercise in the most
// recent loaded workout performed before the set's own workout.
export function previousHeaviestInHistory(
  history: readonly WorkoutWithSets[],
  workoutId: string,
  exerciseId: string,
  unit: WeightUnit,
): number | null {
  const own = history.find((w) => w.id === workoutId)
  if (!own) return null
  let best: WorkoutWithSets | null = null
  for (const w of history) {
    if (w.id === workoutId || w.performed_at >= own.performed_at) continue
    if (!w.sets.some((s) => s.exercise_id === exerciseId)) continue
    if (!best || w.performed_at > best.performed_at) best = w
  }
  if (!best) return null
  return heaviestWeight(best.sets.filter((s) => s.exercise_id === exerciseId), unit)
}

// Issue #336: a CHECK-constraint error (Postgres 23514, or SQLite's message)
// means the numbers were out of range; its raw text never reaches the user.
export function isCheckConstraintError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '23514' || /CHECK constraint failed/i.test(error.message ?? '')
}

export const SET_EDIT_FAILED_MESSAGE = "Couldn't save that change. Try again."
