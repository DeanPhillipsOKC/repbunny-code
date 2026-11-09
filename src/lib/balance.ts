import type { MuscleGroup } from './muscleGroups'
import type { MuscleExercise, MuscleSetRow } from './muscleVolume'
import type { PushPull } from './types'
import type { LibraryMovement } from './exerciseLibrary'

// Issue #138: the Muscle groups screen's Balance card (Premium, feature key
// `progress`). Sets over the last BALANCE_DAYS days, split push vs pull and
// upper vs lower. Pure, fed by the same all-sets fetch as Muscle groups.
//
// Mapping (docs/architecture.md): upper vs lower is by muscle group. Chest,
// shoulders, back, and arms are upper; glutes and legs are lower; core and
// cardio count toward neither. A set counts 1 for a side when its main
// muscle is on that side, else 0.5 when an "also works" muscle is, so a
// deadlift (back, also glutes and legs) is one upper set and half a lower.
//
// Issue #173: push vs pull is per exercise, not per muscle, since rear delt
// flyes are shoulders but pull and curls are arms but pull. Only upper-body
// exercises (by main muscle) take a side, 1 set per set, no half credit.
// An exercise's side is its own push_pull, else its library movement, else
// push for a chest exercise, else unset. Unset ones aren't counted, and the
// card links to a screen that asks.
//
// The library lookup is passed in (`movementOf`, normally
// libraryMovementOf from lib/exerciseLibrary.ts) so this file stays free of
// the bundled JSON and the *-unit specs can import it in Node.

export type BalanceSide = 'push' | 'pull' | 'upper' | 'lower'

export const UPPER_GROUPS: MuscleGroup[] = ['chest', 'shoulders', 'back', 'arms']
export const LOWER_GROUPS: MuscleGroup[] = ['glutes', 'legs']

export const BALANCE_DAYS = 28
// One side over this many times the other gets the nudge.
export const BALANCE_RATIO = 1.5
// Below this many sets on the bigger side, a gap is too small to call.
export const BALANCE_MIN_SETS = 6

const PUSH_MOVEMENTS: LibraryMovement[] = [
  'horizontal_press', 'incline_press', 'chest_fly', 'dip', 'vertical_press', 'lateral_raise', 'front_raise',
  'triceps_extension',
]
const PULL_MOVEMENTS: LibraryMovement[] = ['vertical_pull', 'horizontal_row', 'rear_delt', 'shrug', 'biceps_curl']

export function movementPushPull(movement: LibraryMovement): PushPull {
  if (PUSH_MOVEMENTS.includes(movement)) return 'push'
  if (PULL_MOVEMENTS.includes(movement)) return 'pull'
  return 'neither'
}

export interface BalanceExercise extends MuscleExercise {
  library_id?: string | null
  push_pull?: PushPull | null
}

export function isUpperBody(exercise: Pick<MuscleExercise, 'muscle_group'>): boolean {
  return exercise.muscle_group !== null && UPPER_GROUPS.includes(exercise.muscle_group)
}

// The library entry's movement for an exercise, or null when it has none.
export type MovementOf = (exercise: { name: string; library_id?: string | null }) => LibraryMovement | null

// The side with no push_pull of its own: the library movement's, else push
// for chest, else null (unset). The form pre-selects this.
export function derivedPushPull(
  exercise: Pick<BalanceExercise, 'name' | 'library_id' | 'muscle_group'>,
  movementOf: MovementOf,
): PushPull | null {
  const movement = movementOf(exercise)
  if (movement) return movementPushPull(movement)
  return exercise.muscle_group === 'chest' ? 'push' : null
}

// The side Balance counts it on; null is unset.
export function effectivePushPull(exercise: BalanceExercise, movementOf: MovementOf): PushPull | null {
  return exercise.push_pull ?? derivedPushPull(exercise, movementOf)
}

// An upper-body exercise Balance can't place yet.
export function needsPushPull(exercise: BalanceExercise, movementOf: MovementOf): boolean {
  return isUpperBody(exercise) && effectivePushPull(exercise, movementOf) === null
}

export type BalanceCounts = Record<BalanceSide, number>

// A set's credit for one side: 1, 0.5, or 0.
export function sideCredit(exercise: BalanceExercise, side: BalanceSide, movementOf: MovementOf): number {
  if (!exercise.muscle_group) return 0
  if (side === 'push' || side === 'pull') {
    return isUpperBody(exercise) && effectivePushPull(exercise, movementOf) === side ? 1 : 0
  }
  const muscles = side === 'upper' ? UPPER_GROUPS : LOWER_GROUPS
  if (muscles.includes(exercise.muscle_group)) return 1
  return exercise.also_works.some((g) => muscles.includes(g)) ? 0.5 : 0
}

function inWindow(row: MuscleSetRow, now: Date): boolean {
  const at = new Date(row.performed_at).getTime()
  const end = now.getTime()
  return at >= end - BALANCE_DAYS * 24 * 60 * 60 * 1000 && at <= end
}

// Sets per side performed in the BALANCE_DAYS days up to `now`.
export function balanceCounts(
  rows: MuscleSetRow[],
  exercises: BalanceExercise[],
  movementOf: MovementOf,
  now: Date = new Date(),
): BalanceCounts {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const counts: BalanceCounts = { push: 0, pull: 0, upper: 0, lower: 0 }
  for (const row of rows) {
    if (!inWindow(row, now)) continue
    const exercise = byId.get(row.exercise_id)
    if (!exercise) continue
    for (const side of Object.keys(counts) as BalanceSide[]) counts[side] += sideCredit(exercise, side, movementOf)
  }
  return counts
}

// Ids of the unset upper-body exercises with a set in the window: the ones
// push vs pull left out.
export function uncountedExerciseIds(
  rows: MuscleSetRow[],
  exercises: BalanceExercise[],
  movementOf: MovementOf,
  now: Date = new Date(),
): Set<string> {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const out = new Set<string>()
  for (const row of rows) {
    if (out.has(row.exercise_id) || !inWindow(row, now)) continue
    const exercise = byId.get(row.exercise_id)
    if (exercise && needsPushPull(exercise, movementOf)) out.add(exercise.id)
  }
  return out
}

// The fix-up screen's list: unset upper-body exercises that are in an
// active template or have a set in the window, by name.
export function pushPullToSet<T extends BalanceExercise>(
  exercises: T[],
  rows: MuscleSetRow[],
  templateExerciseIds: Iterable<string>,
  movementOf: MovementOf,
  now: Date = new Date(),
): T[] {
  const wanted = new Set(templateExerciseIds)
  for (const row of rows) if (inWindow(row, now)) wanted.add(row.exercise_id)
  return exercises
    .filter((e) => wanted.has(e.id) && needsPushPull(e, movementOf))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

// "1 exercise isn't counted." / "3 exercises aren't counted."
export function uncountedLine(n: number): string {
  return n === 1 ? "1 exercise isn't counted." : `${n} exercises aren't counted.`
}

export interface BalancePair {
  key: 'push-pull' | 'upper-lower'
  a: BalanceSide
  b: BalanceSide
  aSets: number
  bSets: number
  // The side that's behind, when the gap is worth a nudge.
  behind: BalanceSide | null
}

export function balancePair(counts: BalanceCounts, a: BalanceSide, b: BalanceSide): BalancePair {
  const aSets = counts[a]
  const bSets = counts[b]
  let behind: BalanceSide | null = null
  if (Math.max(aSets, bSets) >= BALANCE_MIN_SETS) {
    if (aSets > bSets * BALANCE_RATIO) behind = b
    else if (bSets > aSets * BALANCE_RATIO) behind = a
  }
  return { key: `${a}-${b}` as BalancePair['key'], a, b, aSets, bSets, behind }
}

export function balancePairs(counts: BalanceCounts): BalancePair[] {
  return [balancePair(counts, 'push', 'pull'), balancePair(counts, 'upper', 'lower')]
}

export const BALANCE_LABELS: Record<BalanceSide, string> = {
  push: 'Push',
  pull: 'Pull',
  upper: 'Upper',
  lower: 'Lower',
}

// The one gentle line for a side that's behind.
export const BALANCE_NUDGES: Record<BalanceSide, string> = {
  pull: 'Pull is behind push. A few more rows or pulldowns would even it out.',
  push: 'Push is behind pull. A few more presses or push-ups would even it out.',
  lower: 'Lower body is behind upper body. A few more squats or lunges would even it out.',
  upper: 'Upper body is behind lower body. A few more presses or rows would even it out.',
}
