import { ref } from 'vue'
import type { LoadType, WeightUnit } from './types'
import type { ProgressSetRow } from './progressHub'
import { convertWeight, epley } from './progressSeries'

// Issue #136 (Premium): strength levels for the main free-weight, machine,
// and bodyweight lifts, from each lift's best est. 1RM over the latest
// weigh-in, plus an overall score.
//
// The standards are RepBunny's own, in round body-weight multiples. The
// published tables we checked (Strength Level, ExRx, Symmetric Strength) are
// all rights reserved, so none is copied here. The numbers sit inside the
// range those tables and common coaching rules of thumb agree on: a lift's
// Beginner mark is roughly what a first few months of training reach, Elite
// roughly what competitive lifters reach. They're split by sex because every
// published table is. Bundled, so nothing goes over the network. For the
// variations added after the first five, the female row is the male row
// times 0.72 for lower-body lifts and 0.6 for upper-body ones (about the
// ratio the first five keep), rounded.

export type StrengthSex = 'male' | 'female'
// 'unspecified' is "Prefer not to say"; null means not asked yet.
export type StrengthSexAnswer = StrengthSex | 'unspecified'

export const STRENGTH_TIERS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'] as const
export type StrengthTier = (typeof STRENGTH_TIERS)[number]

// Movement groups. The overall score takes the best lift in each, so logging
// four kinds of bench doesn't tilt it toward pressing.
export type StrengthGroup = 'squat' | 'press' | 'hinge' | 'overhead' | 'row' | 'pull'

export const STRENGTH_GROUPS: { id: StrengthGroup; label: string }[] = [
  { id: 'squat', label: 'squats and leg presses' },
  { id: 'press', label: 'chest presses' },
  { id: 'hinge', label: 'deadlifts and hip thrusts' },
  { id: 'overhead', label: 'overhead presses' },
  { id: 'row', label: 'rows' },
  { id: 'pull', label: 'pull-ups and pulldowns' },
]

// 'dumbbell' marks are per dumbbell (the weight the app logs); 'bodyweight'
// lifts count body weight plus added load, or minus the assist; 'machine'
// marks are rougher, since machines vary.
export type StrengthEquipment = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight'

export interface StrengthLift {
  id: string
  name: string
  group: StrengthGroup
  equipment: StrengthEquipment
  // Library entries (src/data/exercise-library.json) that count as this lift.
  libraryIds: string[]
  // 1RM as a multiple of body weight where each tier starts, Beginner first.
  // Below the Beginner mark still reads as Beginner.
  standards: Record<StrengthSex, readonly number[]>
}

function lift(
  id: string,
  name: string,
  group: StrengthGroup,
  equipment: StrengthEquipment,
  libraryIds: string[],
  male: number[],
  female: number[],
): StrengthLift {
  return { id, name, group, equipment, libraryIds, standards: { male, female } }
}

export const STRENGTH_LIFTS: StrengthLift[] = [
  lift('squat', 'Squat', 'squat', 'barbell', ['barbell_back_squat'], [0.75, 1.25, 1.5, 2.0, 2.5], [0.5, 0.75, 1.0, 1.4, 1.8]),
  lift('front_squat', 'Front squat', 'squat', 'barbell', ['front_squat'], [0.6, 1.0, 1.25, 1.65, 2.05], [0.45, 0.7, 0.9, 1.2, 1.5]),
  lift('smith_squat', 'Smith machine squat', 'squat', 'machine', ['smith_machine_squat'], [0.7, 1.2, 1.5, 2.0, 2.5], [0.5, 0.85, 1.1, 1.45, 1.8]),
  lift('hack_squat', 'Hack squat', 'squat', 'machine', ['hack_squat'], [0.75, 1.25, 1.75, 2.5, 3.25], [0.55, 0.9, 1.25, 1.8, 2.35]),
  lift('leg_press', 'Leg press', 'squat', 'machine', ['leg_press', 'single_leg_leg_press'], [1.25, 2.0, 2.75, 3.75, 4.75], [0.9, 1.45, 2.0, 2.7, 3.4]),
  lift('goblet_squat', 'Goblet squat', 'squat', 'dumbbell', ['goblet_squat'], [0.2, 0.35, 0.5, 0.7, 0.9], [0.14, 0.25, 0.36, 0.5, 0.65]),
  lift('split_squat', 'Bulgarian split squat', 'squat', 'dumbbell', ['bulgarian_split_squat'], [0.15, 0.3, 0.45, 0.65, 0.85], [0.11, 0.22, 0.32, 0.47, 0.61]),

  lift('bench', 'Bench press', 'press', 'barbell', ['barbell_bench_press'], [0.5, 0.75, 1.0, 1.35, 1.75], [0.25, 0.45, 0.65, 0.9, 1.15]),
  lift('incline_bench', 'Incline bench press', 'press', 'barbell', ['incline_barbell_bench_press'], [0.4, 0.65, 0.85, 1.15, 1.5], [0.25, 0.4, 0.5, 0.7, 0.9]),
  lift('smith_bench', 'Smith machine bench press', 'press', 'machine', ['smith_machine_bench_press'], [0.5, 0.75, 1.0, 1.35, 1.75], [0.3, 0.45, 0.6, 0.8, 1.05]),
  lift('chest_press', 'Chest press machine', 'press', 'machine', ['chest_press_machine'], [0.5, 0.8, 1.1, 1.5, 1.9], [0.3, 0.5, 0.65, 0.9, 1.15]),
  lift('db_bench', 'Dumbbell bench press', 'press', 'dumbbell', ['dumbbell_bench_press'], [0.2, 0.3, 0.45, 0.6, 0.8], [0.12, 0.18, 0.27, 0.36, 0.48]),
  lift('incline_db', 'Incline dumbbell press', 'press', 'dumbbell', ['incline_dumbbell_press'], [0.15, 0.27, 0.4, 0.55, 0.7], [0.09, 0.16, 0.24, 0.33, 0.42]),
  lift('dip', 'Dip', 'press', 'bodyweight', ['tricep_dip', 'chest_dip', 'assisted_dip'], [1.0, 1.25, 1.5, 1.8, 2.1], [0.75, 0.95, 1.15, 1.4, 1.7]),

  lift('deadlift', 'Deadlift', 'hinge', 'barbell', ['deadlift', 'sumo_deadlift'], [1.0, 1.5, 1.75, 2.25, 2.75], [0.6, 0.9, 1.2, 1.6, 2.1]),
  lift('trap_bar', 'Trap bar deadlift', 'hinge', 'barbell', ['trap_bar_deadlift'], [1.0, 1.5, 1.9, 2.4, 2.9], [0.7, 1.1, 1.35, 1.75, 2.1]),
  lift('rdl', 'Romanian deadlift', 'hinge', 'barbell', ['romanian_deadlift'], [0.6, 1.0, 1.35, 1.75, 2.2], [0.45, 0.7, 0.95, 1.25, 1.6]),
  lift('hip_thrust', 'Hip thrust', 'hinge', 'barbell', ['barbell_hip_thrust'], [0.75, 1.25, 1.75, 2.5, 3.25], [0.55, 0.9, 1.25, 1.8, 2.35]),

  lift('ohp', 'Overhead press', 'overhead', 'barbell', ['overhead_press'], [0.35, 0.5, 0.65, 0.85, 1.05], [0.2, 0.3, 0.45, 0.6, 0.75]),
  lift('smith_ohp', 'Smith machine shoulder press', 'overhead', 'machine', ['smith_machine_shoulder_press'], [0.35, 0.5, 0.65, 0.85, 1.05], [0.2, 0.3, 0.4, 0.5, 0.65]),
  lift('shoulder_machine', 'Shoulder press machine', 'overhead', 'machine', ['shoulder_press_machine'], [0.3, 0.5, 0.7, 0.95, 1.2], [0.2, 0.3, 0.4, 0.55, 0.7]),
  lift('db_ohp', 'Dumbbell shoulder press', 'overhead', 'dumbbell', ['seated_dumbbell_shoulder_press'], [0.12, 0.2, 0.3, 0.42, 0.55], [0.07, 0.12, 0.18, 0.25, 0.33]),

  lift('row', 'Barbell row', 'row', 'barbell', ['barbell_row'], [0.4, 0.6, 0.8, 1.05, 1.3], [0.25, 0.4, 0.55, 0.75, 0.95]),
  lift('cable_row', 'Seated row', 'row', 'machine', ['seated_cable_row', 'seated_row_machine'], [0.5, 0.7, 0.95, 1.25, 1.55], [0.3, 0.4, 0.55, 0.75, 0.95]),
  lift('db_row', 'Dumbbell row', 'row', 'dumbbell', ['dumbbell_row'], [0.2, 0.35, 0.5, 0.7, 0.9], [0.12, 0.21, 0.3, 0.42, 0.54]),

  lift('pull_up', 'Pull-up', 'pull', 'bodyweight', ['pull_up', 'assisted_pull_up'], [1.0, 1.15, 1.35, 1.6, 1.85], [0.7, 0.9, 1.05, 1.25, 1.5]),
  lift('chin_up', 'Chin-up', 'pull', 'bodyweight', ['chin_up'], [1.0, 1.2, 1.4, 1.65, 1.9], [0.75, 0.95, 1.1, 1.3, 1.55]),
  lift('lat_pulldown', 'Lat pulldown', 'pull', 'machine', ['lat_pulldown', 'close_grip_lat_pulldown'], [0.5, 0.7, 0.95, 1.2, 1.5], [0.3, 0.4, 0.55, 0.7, 0.9]),
]

const LIFT_BY_ID = new Map(STRENGTH_LIFTS.map((l) => [l.id, l]))

// One-sided versions of two-sided machines ("Single Leg Press", "One-Arm
// Chest Press"), common once someone maxes out the stack. Rated as the
// two-sided lift by dividing the one-side est. 1RM by ONE_SIDE_SHARE: one
// limb moves a bit more than half of what both do together (the bilateral
// deficit), and 55% is the usual rule of thumb. Only these machines, where
// one side is the same movement; a single-leg RDL or squat is mostly a
// balance lift and isn't converted. The library's Single-Leg Leg Press
// (#850) is listed under Leg press, so it converts the same way.
export const ONE_SIDE_SHARE = 0.55
const ONE_SIDE_LIFTS = new Set(['leg_press', 'chest_press', 'shoulder_machine', 'cable_row', 'lat_pulldown'])
const ONE_SIDE_WORDS = /\b(?:single|one|1)[\s-]*(?:leg(?:ged)?|arm(?:ed)?)\b|\bunilateral\b/gi

export function isOneSidedName(name: string): boolean {
  ONE_SIDE_WORDS.lastIndex = 0
  return ONE_SIDE_WORDS.test(name)
}

// The two-sided names to look up: without the side words ("One-Arm Chest
// Press" is Chest Press), and keeping the limb ("Single Leg Press" is Leg
// Press, not Press).
function withoutOneSide(name: string): string[] {
  const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()
  return [
    tidy(name.replace(ONE_SIDE_WORDS, (m) => m.replace(/^(?:single|one|1)[\s-]*/i, '').replace(/^unilateral$/i, ''))),
    tidy(name.replace(ONE_SIDE_WORDS, ' ')),
  ]
}

// Dumbbell lifts are already rated per hand, so one-arm versions compare as
// they are; other one-sided lifts only count where ONE_SIDE_LIFTS allows.
export function countsOneSided(lift: StrengthLift): boolean {
  return ONE_SIDE_LIFTS.has(lift.id)
}

export function strengthLift(id: string): StrengthLift | null {
  return LIFT_BY_ID.get(id) ?? null
}

// Which lift an exercise counts as: its library_id, or for an exercise made
// before library ids (or typed by hand) the library entry its name matches.
// Weight exercises match barbell, dumbbell, and machine lifts; bodyweight and
// assisted ones match bodyweight lifts.
export function liftForExercise(
  exercise: { library_id: string | null; name: string; load_type: LoadType },
  matchName: (name: string) => string | null,
): StrengthLift | null {
  const bodyweight = exercise.load_type === 'bodyweight' || exercise.load_type === 'assisted'
  if (exercise.load_type !== 'weight' && !bodyweight) return null
  const oneSided = isOneSidedName(exercise.name)
  const id =
    exercise.library_id ??
    matchName(exercise.name) ??
    (oneSided ? withoutOneSide(exercise.name).map(matchName).find((m) => m !== null) ?? null : null)
  if (!id) return null
  const found = STRENGTH_LIFTS.find((l) => l.libraryIds.includes(id))
  if (!found || (found.equipment === 'bodyweight') !== bodyweight) return null
  if (oneSided && found.equipment !== 'dumbbell' && !countsOneSided(found)) return null
  return found
}

// Whether an exercise's sets are one side of a two-sided lift, to convert.
export function convertsOneSided(exercise: { name: string }, lift: StrengthLift): boolean {
  return countsOneSided(lift) && isOneSidedName(exercise.name)
}

export interface BestOneRepMax {
  oneRepMax: number
  // The best came from a one-sided version, converted (ONE_SIDE_SHARE).
  oneSided: boolean
}

// Best Epley est. 1RM per lift id, in `unit`, over sets with 1 to 12 reps.
// Bodyweight lifts count the body weight on file when the set was logged
// (lib/bodyStats.ts bodyWeightAt) plus the added weight, or minus the assist.
export function bestOneRepMaxes(
  rows: Pick<ProgressSetRow, 'exercise_id' | 'reps' | 'weight' | 'weight_unit' | 'performed_at'>[],
  exerciseOf: (exerciseId: string) => { lift: StrengthLift; loadType: LoadType; oneSided?: boolean } | null,
  bodyWeightAt: (performedAt: string) => number | null,
  unit: WeightUnit,
): Map<string, BestOneRepMax> {
  const best = new Map<string, BestOneRepMax>()
  for (const row of rows) {
    const match = exerciseOf(row.exercise_id)
    if (!match || row.reps === null || row.reps < 1 || row.reps > 12) continue
    let load = convertWeight(row.weight, row.weight_unit, unit)
    if (match.loadType === 'bodyweight' || match.loadType === 'assisted') {
      const bw = bodyWeightAt(row.performed_at)
      if (bw === null) continue
      load = match.loadType === 'assisted' ? bw - load : bw + load
    }
    if (load <= 0) continue
    const oneSided = !!match.oneSided
    const value = epley(load, row.reps) / (oneSided ? ONE_SIDE_SHARE : 1)
    if (value > (best.get(match.lift.id)?.oneRepMax ?? 0)) best.set(match.lift.id, { oneRepMax: value, oneSided })
  }
  return best
}

export interface LiftRating {
  lift: StrengthLift
  oneRepMax: number
  ratio: number
  // 0 (Beginner) to 4 (Elite).
  tier: number
  // Where it sits on the table, 0 to 4: the tier plus how far toward the next.
  position: number
  next: { tier: StrengthTier; weightToGo: number } | null
  // Estimated from a one-sided version (see ONE_SIDE_SHARE).
  oneSided: boolean
}

// Rounded up to a weight someone can actually add: 5 lb or 2.5 kg.
function roundUpToStep(weight: number, unit: WeightUnit): number {
  const step = unit === 'kg' ? 2.5 : 5
  return Math.max(step, Math.ceil(weight / step - 1e-9) * step)
}

export function rateLift(
  lift: StrengthLift,
  oneRepMax: number,
  bodyWeight: number,
  unit: WeightUnit,
  sex: StrengthSex,
  oneSided = false,
): LiftRating {
  const marks = lift.standards[sex]
  const ratio = oneRepMax / bodyWeight
  let tier = 0
  for (let i = 0; i < marks.length; i++) if (ratio >= marks[i]) tier = i
  let position: number
  if (ratio >= marks[marks.length - 1]) position = marks.length - 1
  else if (ratio < marks[0]) position = 0
  else position = tier + (ratio - marks[tier]) / (marks[tier + 1] - marks[tier])
  const nextIndex = tier + 1
  const next =
    nextIndex < marks.length
      ? {
          tier: STRENGTH_TIERS[nextIndex],
          // A one-sided lift's gap is what to add on one side.
          weightToGo: roundUpToStep((marks[nextIndex] * bodyWeight - oneRepMax) * (oneSided ? ONE_SIDE_SHARE : 1), unit),
        }
      : null
  return { lift, oneRepMax, ratio, tier, position, next, oneSided }
}

export interface StrengthOverall {
  // 0 to 100: the average across movement groups of each group's best
  // position, over the table's span.
  score: number
  tier: StrengthTier
  groups: number
}

export function overallStrength(ratings: LiftRating[]): StrengthOverall | null {
  const bestByGroup = new Map<StrengthGroup, number>()
  for (const r of ratings) bestByGroup.set(r.lift.group, Math.max(bestByGroup.get(r.lift.group) ?? 0, r.position))
  if (bestByGroup.size === 0) return null
  const top = STRENGTH_TIERS.length - 1
  const average = [...bestByGroup.values()].reduce((sum, p) => sum + p, 0) / bestByGroup.size
  return {
    score: Math.round((average / top) * 100),
    tier: STRENGTH_TIERS[Math.min(top, Math.floor(average + 1e-9))],
    groups: bestByGroup.size,
  }
}

// The sex answer stays on this device (localStorage), per the issue: it's
// only used to pick the standards table here and, later, #142's starting
// weights. Not in backups; Erase all data clears it with the other
// repbunny- keys.
export const STRENGTH_SEX_KEY = 'repbunny-strength-sex'

function readSex(): StrengthSexAnswer | null {
  try {
    const value = localStorage.getItem(STRENGTH_SEX_KEY)
    return value === 'male' || value === 'female' || value === 'unspecified' ? value : null
  } catch {
    return null
  }
}

export const strengthSex = ref<StrengthSexAnswer | null>(readSex())

export function setStrengthSex(value: StrengthSexAnswer | null) {
  strengthSex.value = value
  try {
    if (value) localStorage.setItem(STRENGTH_SEX_KEY, value)
    else localStorage.removeItem(STRENGTH_SEX_KEY)
  } catch {
    // best-effort; the answer still holds for this session
  }
}

// Shared by the strength screen's question and Preferences, so both say the
// same thing. If another feature starts using the answer, name it here.
export const STRENGTH_SEX_WHY =
  "Used only to pick the right strength standards, since the published tables are split by sex. It stays on this device and isn't used for anything else."
export const STRENGTH_SEX_SKIP =
  'Without this, strength levels won\'t show, and starting weights for new lifts will come from a test set instead of an estimate. Everything else works the same.'

export const STRENGTH_SEX_OPTIONS: { value: StrengthSexAnswer; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unspecified', label: 'Prefer not to say' },
]
