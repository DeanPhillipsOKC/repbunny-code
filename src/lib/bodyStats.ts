// Pure body-weight/height/BMI math for backlog item 77. Kept dependency-free
// so it can be unit-tested directly (see e2e/body-stats-unit.spec.ts — this
// repo only has Playwright, no separate unit-test runner, so these run as
// plain assertions in a test that never touches `page`).
import type { HeightUnit, LoadType, WeightReminder, WeightUnit } from './types'

const LB_PER_KG = 2.20462
const IN_PER_CM = 0.393701

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  return from === 'kg' ? value * LB_PER_KG : value / LB_PER_KG
}

// Issue #57: the set editors' lb/kg toggles convert an unsaved weight
// instead of relabeling it, snapped to the 0.5 step the weight fields use.
// Empty (null, or v-model.number's '' for a cleared field) passes through.
export function convertSetWeight<T>(value: T, from: WeightUnit, to: WeightUnit): T | number {
  if (from === to || typeof value !== 'number' || !Number.isFinite(value)) return value
  return Math.round(convertWeight(value, from, to) * 2) / 2
}

export function convertHeight(value: number, from: HeightUnit, to: HeightUnit): number {
  if (from === to) return value
  return from === 'cm' ? value * IN_PER_CM : value / IN_PER_CM
}

// Backlog item 81: a mistyped weight (18.5 instead of 185) silently corrupts
// bodyweight/assisted volume for every workout after it, so every save point
// that logs or edits a weigh-in flags a >20% swing from the entry it's
// replacing/following before committing, rather than after the fact.
export function isBigWeightChange(
  newValue: number,
  newUnit: WeightUnit,
  previousValue: number,
  previousUnit: WeightUnit,
): boolean {
  const previousInNewUnit = convertWeight(previousValue, previousUnit, newUnit)
  if (previousInNewUnit === 0) return false
  return Math.abs(newValue - previousInNewUnit) / previousInNewUnit > 0.2
}

export function feetInchesToInches(feet: number, inches: number): number {
  return feet * 12 + inches
}

export function inchesToFeetInches(totalInches: number): { feet: number; inches: number } {
  const feet = Math.floor(totalInches / 12)
  const inches = Math.round(totalInches - feet * 12)
  return { feet, inches }
}

export interface BodyWeightEntryLike {
  weight: number
  weight_unit: WeightUnit
  recorded_at: string
}

// The body weight in effect for a set logged at `performedAt`: the latest
// entry recorded at or before that moment, falling back to the earliest
// entry on file if none is that old (so today's weigh-in still covers sets
// logged last week). `null` with no entries at all — docs/architecture.md's
// "excluded from volume, not counted as 0" rule for bodyweight/assisted sets
// depends on this being distinguishable from a real 0.
export function bodyWeightAt(
  entries: BodyWeightEntryLike[],
  performedAt: string,
  unit: WeightUnit,
): number | null {
  const entry = bodyWeightEntryAt(entries, performedAt)
  return entry ? convertWeight(entry.weight, entry.weight_unit, unit) : null
}

// The weigh-in bodyWeightAt uses, so the record check (#579) can say which.
export function bodyWeightEntryAt<T extends BodyWeightEntryLike>(entries: T[], performedAt: string): T | null {
  if (entries.length === 0) return null
  const sorted = [...entries].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  )
  const targetTime = new Date(performedAt).getTime()
  let candidate = sorted[0]
  for (const entry of sorted) {
    if (new Date(entry.recorded_at).getTime() <= targetTime) {
      candidate = entry
    } else {
      break
    }
  }
  return candidate
}

// kg / m^2, one decimal.
export function computeBmi(
  weight: number,
  weightUnit: WeightUnit,
  height: number,
  heightUnit: HeightUnit,
): number {
  const kg = convertWeight(weight, weightUnit, 'kg')
  const cm = convertHeight(height, heightUnit, 'cm')
  const meters = cm / 100
  return Math.round((kg / (meters * meters)) * 10) / 10
}

export type BmiCategory = 'Underweight' | 'Normal' | 'Overweight' | 'Obese'

export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'Underweight'
  if (bmi < 25) return 'Normal'
  if (bmi < 30) return 'Overweight'
  return 'Obese'
}

// Backlog items 78/79: shared "should the missing-body-weight prompt open"
// check for both items' two trigger points (right after creating a
// bodyweight/assisted exercise, and when logging the first such set in a
// workout) — one predicate so neither item re-derives its own copy of "no
// weight on file yet, and the user hasn't opted out". Never blocks the
// underlying save either way — declining just leaves the set(s) out of
// volume until a weight is on file.
export function needsMissingBodyWeightPrompt(
  loadType: LoadType,
  hasBodyWeightOnFile: boolean,
  missingWeightPromptOptOut: boolean,
): boolean {
  return (loadType === 'bodyweight' || loadType === 'assisted') && !hasBodyWeightOnFile && !missingWeightPromptOptOut
}

// Backlog item 80: periodic "update your weight" reminder, shown on Home once
// a user has both a body weight and a height on file. `snoozedUntil` is a
// per-device localStorage timestamp set by "Not now" (see WorkoutLogger.vue);
// `null` there or in `latestEntryRecordedAt` (no weight logged yet — item
// 78/79's missing-weight prompt owns that case instead) both mean "not due".
export function isWeighInReminderDue(params: {
  latestEntryRecordedAt: string | null
  cadence: WeightReminder
  hasHeight: boolean
  snoozedUntil: number | null
  now: number
}): boolean {
  const { latestEntryRecordedAt, cadence, hasHeight, snoozedUntil, now } = params
  if (cadence === 'off') return false
  if (!hasHeight || latestEntryRecordedAt === null) return false
  if (snoozedUntil !== null && now < snoozedUntil) return false
  const cadenceDays = cadence === 'weekly' ? 7 : 30
  const cadenceMs = cadenceDays * 24 * 60 * 60 * 1000
  return now - new Date(latestEntryRecordedAt).getTime() >= cadenceMs
}
