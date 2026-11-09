import { ref } from 'vue'
import type { WeightUnit } from './types'
import type { StrengthLift, StrengthSexAnswer } from './strengthLevels'
import { ONE_SIDE_SHARE } from './strengthLevels'
import { convertWeight, epley, isEpleyEligible } from './progressSeries'
import { formatWeight } from './repRecords'
import { roundDownToLoadable, type WarmupEquipment, type WarmupLoad } from './warmup'

// Issue #142 (Premium): a starting weight the first time a weight lift is
// logged, from the best source there is, always saying which:
//   1. a related lift you've logged (same muscle group and equipment), from
//      its est. 1RM, conservatively;
//   2. for a brand-new user with no related history, body weight and sex,
//      from #136's standards table at its Beginner tier (the one place
//      demographics are used, decided with the user 2026-10-05);
//   3. a test set.
// After the first logged set, part 1's targets take over for good.

export const STARTING_REPS = 10

// A related lift's est. 1RM is only a hint at the new one's, so start at 60%
// of it: about 80% of what a 10-rep set at that 1RM would be (Epley ~75%).
export const RELATED_SHARE = 0.6
// Beginner 1RM down to a comfortable 10 to 12 rep weight: a little under the
// 12-rep Epley share (~71%).
export const BODY_WEIGHT_SHARE = 0.65

export const BODY_WEIGHT_LABEL = 'A rough starting point from your body weight. Adjust after your first set.'
export const TEST_SET_TEXT = 'Pick a weight you could do about 12 times.'

export type StartingSource = 'related' | 'bodyweight' | 'test'

export interface StartingWeight {
  source: StartingSource
  // null for a test set.
  weight: number | null
  reps: number | null
  unit: WeightUnit
  // The related lift it came from.
  from: { name: string; oneRepMax: number } | null
  // Where it came from, in a sentence.
  note: string
}

export interface RelatedLift {
  name: string
  oneRepMax: number
}

export interface SetRow {
  reps: number | null
  weight: number
  weight_unit: WeightUnit
}

// Best Epley est. 1RM over a lift's sets (1 to 12 reps), in `unit`; null
// when none count.
export function bestEstimate(sets: SetRow[], unit: WeightUnit): number | null {
  let best: number | null = null
  for (const s of sets) {
    if (!isEpleyEligible(s)) continue
    const value = epley(convertWeight(s.weight, s.weight_unit, unit), s.reps!)
    if (best === null || value > best) best = value
  }
  return best
}

// The related lift to start from: the lightest est. 1RM, the conservative
// pick (a deadlift shouldn't set a row's start).
export function pickRelatedLift(lifts: RelatedLift[]): RelatedLift | null {
  let pick: RelatedLift | null = null
  for (const l of lifts) if (l.oneRepMax > 0 && (!pick || l.oneRepMax < pick.oneRepMax)) pick = l
  return pick
}

export function fromRelatedLift(
  related: RelatedLift,
  unit: WeightUnit,
  equipment: WarmupEquipment | null,
  load: WarmupLoad = {},
): StartingWeight {
  const weight = roundDownToLoadable(related.oneRepMax * RELATED_SHARE, equipment, unit, load)
  return {
    source: 'related',
    weight,
    reps: STARTING_REPS,
    unit,
    from: related,
    note: `From your ${related.name} (est. 1RM ${formatWeight(Math.round(related.oneRepMax))} ${unit}). Adjust after your first set.`,
  }
}

// Beginner mark times body weight, down to a 10 to 12 rep weight. null when
// an input is missing or the lift isn't on the table (falls through to a
// test set). `oneSided` is a one-sided machine (#136's ONE_SIDE_SHARE).
export function fromBodyWeight(
  lift: StrengthLift | null,
  sex: StrengthSexAnswer | null,
  bodyWeight: { weight: number; unit: WeightUnit } | null,
  unit: WeightUnit,
  equipment: WarmupEquipment | null,
  load: WarmupLoad = {},
  oneSided = false,
): StartingWeight | null {
  if (!lift || lift.equipment === 'bodyweight' || !bodyWeight || bodyWeight.weight <= 0) return null
  if (sex !== 'male' && sex !== 'female') return null
  const bw = convertWeight(bodyWeight.weight, bodyWeight.unit, unit)
  const oneRepMax = lift.standards[sex][0] * bw * (oneSided ? ONE_SIDE_SHARE : 1)
  return {
    source: 'bodyweight',
    weight: roundDownToLoadable(oneRepMax * BODY_WEIGHT_SHARE, equipment, unit, load),
    reps: STARTING_REPS,
    unit,
    from: null,
    note: BODY_WEIGHT_LABEL,
  }
}

export function testSet(unit: WeightUnit): StartingWeight {
  return { source: 'test', weight: null, reps: null, unit, from: null, note: TEST_SET_TEXT }
}

// The three sources in order.
export function pickStartingWeight(input: {
  related: RelatedLift[]
  lift: StrengthLift | null
  sex: StrengthSexAnswer | null
  bodyWeight: { weight: number; unit: WeightUnit } | null
  unit: WeightUnit
  equipment: WarmupEquipment | null
  load?: WarmupLoad
  oneSided?: boolean
}): StartingWeight {
  const related = pickRelatedLift(input.related)
  if (related) return fromRelatedLift(related, input.unit, input.equipment, input.load)
  return (
    fromBodyWeight(input.lift, input.sex, input.bodyWeight, input.unit, input.equipment, input.load, input.oneSided) ??
    testSet(input.unit)
  )
}

// The sex question is asked here once (step 2.2 without an answer from
// #136); after that, an unanswered question falls through to a test set.
// Per device, like the answer itself; Erase all data clears it with the
// other repbunny- keys.
export const START_SEX_ASKED_KEY = 'repbunny-start-sex-asked'

function readAsked(): boolean {
  try {
    return localStorage.getItem(START_SEX_ASKED_KEY) === '1'
  } catch {
    return false
  }
}

export const startSexAsked = ref(readAsked())

export function markStartSexAsked() {
  startSexAsked.value = true
  try {
    localStorage.setItem(START_SEX_ASKED_KEY, '1')
  } catch {
    // best-effort
  }
}
