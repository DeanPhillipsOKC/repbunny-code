import { ref } from 'vue'
import type { WeightUnit } from './types'
import type { ExerciseHistoryWorkout } from './exerciseHistory'
import { buildRepRecords, formatDay, formatWeight, type Progression } from './repRecords'
import { convertWeight, epley, isEpleyEligible } from './progressSeries'

// Issue #140: Premium's Next time target. It starts from the free
// double-progression target (repRecords.ts) and reacts to the RPE of the
// last session's top set, and it always says why. Only the lifter's own
// logged sets go in, never demographics. Pure, apart from the per-device
// "Targets off" list and lighter-week choices at the bottom.

export type RpeBand = 'easy' | 'normal' | 'hard' | 'none'

// RPE 7 or less: there was more in the tank. 9.5 or more: close to the limit.
export function rpeBand(rpe: number | null): RpeBand {
  if (rpe === null) return 'none'
  if (rpe <= 7) return 'easy'
  if (rpe >= 9.5) return 'hard'
  return 'normal'
}

export interface SmartTarget {
  // 'level' targets a machine level instead of a weight (`unit` is null).
  kind: 'weight' | 'level'
  unit: WeightUnit | null
  weight: number
  reps: number
  goUp: boolean
  // Best reps at `weight` so far (0 if never done), for the range strip.
  best: number
  band: RpeBand
  // The last session's top set, in `unit`.
  last: { weight: number; reps: number; rpe: number | null }
  // Epley on the top set, in `unit`; null for levels or past 12 reps.
  e1rm: number | null
  // The target weight as a share of e1rm, rounded.
  percent: number | null
  // One line for the Next time card: the free card's reasoning when the step
  // is the usual one, else what the RPE changed.
  summary: string
  // "Why this?", one sentence each.
  why: string[]
  // Issue #141's stall handling (see buildSmartTarget).
  stall: StallState
  // Missed targets in a row, newest back (capped at OFFER_AFTER_MISSES).
  misses: number
  // The lighter week's load: on offer, or the one being done now.
  lighter: { weight: number; reps: number } | null
  // The newest session's performedAt, which a lighter-week choice keys off.
  anchor: string
}

// 'hold' after 2 missed targets, 'offer' when a lighter week is on offer,
// 'lighter' for the accepted lighter session, 'return' for the one after it.
export type StallState = 'none' | 'hold' | 'offer' | 'lighter' | 'return'

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function formatRpe(rpe: number): string {
  return rpe.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

// A level exercise's level rides in `weight` (its stored weight is always 0),
// so the free target's math works on it with a step of 1.
function levelsAsWeights(workouts: ExerciseHistoryWorkout[]): ExerciseHistoryWorkout[] {
  return workouts.map((w) => ({
    ...w,
    sets: w.sets.map((s) => ({ ...s, weight: s.level ?? 0, weight_unit: 'lb' as WeightUnit })),
  }))
}

// The heaviest set of the most recent workout with a usable set (most reps on
// a tie, then the later one), with its weight in `unit`.
function lastTopSet(workouts: ExerciseHistoryWorkout[], unit: WeightUnit) {
  for (const w of newestFirst(workouts)) {
    let top: { weight: number; reps: number; rpe: number | null } | null = null
    for (const s of w.sets) {
      if (s.reps === null || s.reps < 1 || s.weight <= 0) continue
      const weight = round1(convertWeight(s.weight, s.weight_unit, unit))
      if (!top || weight > top.weight || (weight === top.weight && s.reps >= top.reps)) {
        top = { weight, reps: s.reps, rpe: s.rpe }
      }
    }
    if (top) return top
  }
  return null
}

interface Load {
  weight: number
  reps: number
  goUp: boolean
  best: number
}

const time = (iso: string) => new Date(iso).getTime()

function newestFirst(workouts: ExerciseHistoryWorkout[]): ExerciseHistoryWorkout[] {
  return [...workouts].sort((a, b) => time(b.performedAt) - time(a.performedAt))
}

// The RPE-aware target from `history` (levels already riding in `weight`),
// before any stall handling.
function rpeTarget(history: ExerciseHistoryWorkout[], isLevel: boolean, preferredUnit: WeightUnit | null, progression: Progression) {
  const records = buildRepRecords(history, preferredUnit, progression)
  if (!records?.next) return null
  const unit = records.unit
  const top = lastTopSet(history, unit)
  if (!top) return null

  const { step, range } = records
  const bestAt = (weight: number) => records.records.find((r) => r.weight === weight)?.reps ?? 0
  const show = (weight: number) => (isLevel ? `level ${weight}` : `${formatWeight(weight)} ${unit}`)
  const goUpTo = (weight: number) => {
    const best = bestAt(weight)
    return { weight, reps: best === 0 ? range.min : best + 1, goUp: true, best }
  }

  const band = rpeBand(top.rpe)
  const base = records.next
  // The free card's sentence names a weight unit, so levels get their own.
  const usual = !isLevel
    ? base.why
    : base.goUp
      ? `You topped the ${range.min} to ${range.max} range, so go up to ${show(base.weight)}.`
      : `Add a rep at ${show(base.weight)}. Hit ${range.max} and it's time to go up a level.`
  let target: Load
  let reason: string
  switch (band) {
    case 'easy':
      if (base.goUp) {
        target = goUpTo(round1(base.weight + step))
        reason = `RPE ${formatRpe(top.rpe!)} left reps in the tank, so this jumps 2 steps to ${show(target.weight)}.`
      } else if (base.reps + 1 <= range.max) {
        target = { weight: base.weight, reps: base.reps + 1, goUp: false, best: base.best }
        reason = `RPE ${formatRpe(top.rpe!)} left reps in the tank, so aim for 2 more reps instead of 1.`
      } else {
        target = goUpTo(round1(top.weight + step))
        reason = `RPE ${formatRpe(top.rpe!)} left reps in the tank, so go up to ${show(target.weight)} now.`
      }
      break
    case 'hard':
      // Holding only lasts until the top of the range, so a lifter who
      // logs every set at RPE 10 still moves up.
      if (top.reps >= range.max) {
        target = { weight: base.weight, reps: base.reps, goUp: base.goUp, best: base.best }
        reason = `RPE ${formatRpe(top.rpe!)} was close to your limit, but you hit the top of the ${range.min} to ${range.max} range, so go up to ${show(target.weight)}.`
      } else {
        target = { weight: top.weight, reps: top.reps + 1, goUp: false, best: bestAt(top.weight) }
        reason = `RPE ${formatRpe(top.rpe!)} was close to your limit, so hold the weight and aim for 1 more rep.`
      }
      break
    case 'normal':
      target = { weight: base.weight, reps: base.reps, goUp: base.goUp, best: base.best }
      reason = `RPE ${formatRpe(top.rpe!)} is a solid working set, so this is the usual step. ${usual}`
      break
    default:
      target = { weight: base.weight, reps: base.reps, goUp: base.goUp, best: base.best }
      reason = `No RPE logged, so this is the usual step. ${usual}`
  }
  const summary = band === 'easy' || band === 'hard' ? reason : usual
  return { records, unit, top, band, target, reason, summary, show, bestAt }
}

function usable(s: ExerciseHistoryWorkout['sets'][number]): boolean {
  return s.reps !== null && s.reps >= 1 && s.weight > 0
}

// A session hit its target with a set at the target weight for the target
// reps, or a heavier set within the rep range.
function hitTarget(w: ExerciseHistoryWorkout, target: Load, unit: WeightUnit, minReps: number): boolean {
  return w.sets.some((s) => {
    if (!usable(s)) return false
    const weight = round1(convertWeight(s.weight, s.weight_unit, unit))
    return (weight >= target.weight && s.reps! >= target.reps) || (weight > target.weight && s.reps! >= minReps)
  })
}

// How many sessions in a row, newest back, missed the target the sessions
// before them set (up to OFFER_AFTER_MISSES). Only sessions after a lighter
// week count, so it starts the count over, and the session after it is held
// to the weight it went back to.
function missStreak(
  sorted: ExerciseHistoryWorkout[],
  deload: { at: string; target: Load } | null,
  isLevel: boolean,
  preferredUnit: WeightUnit | null,
  progression: Progression,
): number {
  let misses = 0
  for (let i = 0; i < sorted.length - 1 && misses < OFFER_AFTER_MISSES; i++) {
    const w = sorted[i]
    if (deload && time(w.performedAt) <= time(deload.at)) break
    if (!w.sets.some(usable)) continue
    const before = rpeTarget(sorted.slice(i + 1), isLevel, preferredUnit, progression)
    if (!before) break
    const target = deload && sorted[i + 1].performedAt === deload.at ? deload.target : before.target
    if (hitTarget(w, target, before.unit, progression.range.min)) break
    misses++
  }
  return misses
}

// About 10% off, on the plate step, and always at least one step lighter.
function lighterLoad(weight: number, step: number): number {
  const off = Math.round((weight * LIGHTER_FACTOR) / step) * step
  return round1(Math.max(step, Math.min(off, weight - step)))
}

// Issue #141: stall handling. Two missed targets in a row hold the weight for
// one more rep. Three, or a lift the plateau rule calls flat, offer a lighter
// week, which the lifter accepts or dismisses (`decision`, kept per device).
// An accepted one targets about 10% off for one session, the next goes back
// to the weight before it, and the normal logic resumes after that.
export const HOLD_AFTER_MISSES = 2
export const OFFER_AFTER_MISSES = 3
export const LIGHTER_FACTOR = 0.9

export interface LighterWeekDecision {
  accepted: boolean
  // The newest session's performedAt when the lifter chose.
  after: string
  kind: 'weight' | 'level'
  unit: WeightUnit | null
  // The target before the lighter week, and the lighter weight.
  weight: number
  reps: number
  lighter: number
}

export interface StallInput {
  // flatSince() for this lift (lib/plateau.ts), null when it isn't flat.
  flatSince?: string | null
  decision?: LighterWeekDecision | null
}

export function buildSmartTarget(
  workouts: ExerciseHistoryWorkout[],
  kind: 'weight' | 'level',
  preferredUnit: WeightUnit | null,
  progression: Progression,
  stall: StallInput = {},
): SmartTarget | null {
  const isLevel = kind === 'level'
  const history = isLevel ? levelsAsWeights(workouts) : workouts
  const unitPref = isLevel ? 'lb' : preferredUnit
  const prog = isLevel ? { ...progression, step: { lb: 1, kg: 1 } } : progression
  const base = rpeTarget(history, isLevel, unitPref, prog)
  if (!base) return null
  const { records, unit, top, band, show, bestAt } = base
  const { step, range } = records
  const sorted = newestFirst(history)
  const anchor = sorted[0].performedAt

  // A choice made in another unit, or for another kind, doesn't carry over.
  const decision =
    stall.decision && stall.decision.kind === kind && stall.decision.unit === (isLevel ? null : unit) ? stall.decision : null
  const accepted = decision?.accepted ? decision : null
  const after = decision ? sorted.filter((w) => time(w.performedAt) > time(decision.after)) : []

  let target: Load = base.target
  let reason = base.reason
  let summary = base.summary
  let state: StallState = 'none'
  let misses = 0
  let lighter: { weight: number; reps: number } | null = null
  const extra: string[] = []

  if (accepted && after.length === 0) {
    state = 'lighter'
    target = { weight: accepted.lighter, reps: accepted.reps, goUp: false, best: bestAt(accepted.lighter) }
    lighter = { weight: accepted.lighter, reps: accepted.reps }
    summary = 'Lighter week: about 10% off for one session, then build back.'
    reason = `You took a lighter week, so this session is ${show(accepted.lighter)}, about 10% off ${show(accepted.weight)}.`
    extra.push(`Next time it's back to ${show(accepted.weight)} × ${accepted.reps}.`)
  } else if (accepted && after.length === 1) {
    state = 'return'
    target = { weight: accepted.weight, reps: accepted.reps, goUp: false, best: bestAt(accepted.weight) }
    summary = `Lighter week done, so back to ${show(accepted.weight)}.`
    reason = `Your lighter week is done, so this goes back to ${show(accepted.weight)} × ${accepted.reps}, where you were before it.`
    extra.push('From here the usual steps pick up again.')
  } else {
    // After a lighter week, only the sessions since it count toward a stall,
    // and a flat call waits as long as missed targets would.
    const deload = accepted
      ? { at: after[after.length - 1].performedAt, target: { weight: accepted.weight, reps: accepted.reps, goUp: false, best: 0 } }
      : null
    misses = missStreak(sorted, deload, isLevel, unitPref, prog)
    const sinceDeload = accepted ? after.length - 1 : Infinity
    const flat = stall.flatSince && sinceDeload >= OFFER_AFTER_MISSES ? stall.flatSince : null
    if (misses >= HOLD_AFTER_MISSES && top.reps < range.max) {
      state = 'hold'
      target = { weight: top.weight, reps: top.reps + 1, goUp: false, best: bestAt(top.weight) }
      summary = 'Same weight, try for one more rep.'
      reason = `You missed the target ${misses} sessions in a row, so hold ${show(top.weight)} and try for 1 more rep.`
    }
    const dismissed = decision && !decision.accepted && after.length === 0
    if ((misses >= OFFER_AFTER_MISSES || flat) && !dismissed) {
      state = 'offer'
      lighter = { weight: lighterLoad(target.weight, step), reps: target.reps }
      const cause =
        misses >= OFFER_AFTER_MISSES
          ? `You've missed the target ${misses} sessions in a row`
          : `This lift has been flat since ${formatDay(flat!)}`
      extra.push(
        `${cause}, so a lighter week could help: ${show(lighter.weight)} × ${lighter.reps}, about 10% off for one session, then build back.`,
      )
    }
  }

  const e1rm = !isLevel && isEpleyEligible(top) ? Math.round(epley(top.weight, top.reps)) : null
  const percent = e1rm ? Math.round((target.weight / e1rm) * 100) : null
  const lastLine = `Last time ${show(top.weight)} × ${top.reps}${top.rpe !== null ? ` at RPE ${formatRpe(top.rpe)}` : ''}.`
  const why = [lastLine, reason, ...extra]
  if (e1rm && percent !== null) {
    why.push(`Est. 1RM ${formatWeight(e1rm)}, so ${formatWeight(target.weight)} × ${target.reps} is about ${percent}% of it.`)
  }

  return {
    kind,
    unit: isLevel ? null : unit,
    ...target,
    band,
    last: top,
    e1rm,
    percent,
    summary,
    why,
    stall: state,
    misses,
    lighter,
    anchor,
  }
}

// Issue #160: a target for each open row. Set 1 gets the session target above
// and each later set works from the same set last time, with the same RPE
// rules. Today's logged sets don't move them: following the newest logged set
// overrode a pyramid or back-off pattern (every row copied set 1), so the
// user chose last time only. `loggedCount` is how many sets of this exercise
// are logged today, so the first open row is set loggedCount + 1.
export interface SetTarget {
  kind: 'weight' | 'level'
  unit: WeightUnit | null
  weight: number
  reps: number
  // The chip's kicker: 'Target', or 'Lighter week' during #141's lighter session.
  label: string
  why: string[]
}

export function buildSetTargets(
  base: SmartTarget,
  history: ExerciseHistoryWorkout[],
  loggedCount: number,
  openCount: number,
  progression: Progression,
): SetTarget[] {
  const isLevel = base.kind === 'level'
  const unit: WeightUnit = base.unit ?? 'lb'
  const step = isLevel ? 1 : progression.step[unit]
  const { range } = progression
  const label = base.stall === 'lighter' ? 'Lighter week' : 'Target'
  const show = (weight: number) => (isLevel ? `level ${weight}` : `${formatWeight(weight)} ${unit}`)
  const make = (weight: number, reps: number, why: string[]): SetTarget => ({
    kind: base.kind,
    unit: base.unit,
    weight,
    reps,
    label,
    why,
  })
  const fromBase = () => make(base.weight, base.reps, base.why)

  // Set 1 is the session target, and a stall (#141) holds every set to it.
  const lastSets = newestFirst(isLevel ? levelsAsWeights(history) : history).find((w) => w.sets.some(usable))?.sets ?? []
  const targets: SetTarget[] = []
  for (let i = 0; i < openCount; i++) {
    const position = loggedCount + i
    if (position === 0 || base.stall !== 'none') {
      targets.push(fromBase())
      continue
    }
    const before = lastSets[position]
    const weight = before ? round1(convertWeight(before.weight, before.weight_unit, unit)) : 0
    if (!before || before.reps === null || before.reps < 1 || weight <= 0) {
      const prev = targets[i - 1] ?? fromBase()
      targets.push({ ...prev, why: [`No set ${position + 1} last time, so this matches set ${position}.`] })
      continue
    }
    const reps = before.reps
    const lastLine = `Set ${position + 1} last time: ${show(weight)} × ${reps}${before.rpe !== null ? ` at RPE ${formatRpe(before.rpe)}` : ''}.`
    const rpe = before.rpe !== null ? `RPE ${formatRpe(before.rpe)}` : ''
    const up = round1(weight + step)
    const goUp = `so go up to ${show(up)}.`
    const atTop = `you hit the top of the ${range.min} to ${range.max} range`
    let next: { weight: number; reps: number; reason: string }
    switch (rpeBand(before.rpe)) {
      case 'easy':
        next =
          reps + 2 <= range.max
            ? { weight, reps: reps + 2, reason: `${rpe} left reps in the tank, so aim for 2 more reps.` }
            : { weight: up, reps: range.min, reason: `${rpe} left reps in the tank, ${goUp}` }
        break
      case 'hard':
        next =
          reps >= range.max
            ? { weight: up, reps: range.min, reason: `${rpe} was close to your limit, but ${atTop}, ${goUp}` }
            : { weight, reps: reps + 1, reason: `${rpe} was close to your limit, so hold the weight and aim for 1 more rep.` }
        break
      case 'normal':
        next =
          reps + 1 <= range.max
            ? { weight, reps: reps + 1, reason: `${rpe} is a solid working set, so aim for 1 more rep.` }
            : { weight: up, reps: range.min, reason: `${rpe} is a solid working set and ${atTop}, ${goUp}` }
        break
      default:
        next =
          reps + 1 <= range.max
            ? { weight, reps: reps + 1, reason: 'No RPE logged, so aim for 1 more rep.' }
            : { weight: up, reps: range.min, reason: `No RPE logged, and ${atTop}, ${goUp}` }
    }
    targets.push(make(next.weight, next.reps, [lastLine, next.reason]))
  }
  return targets
}

// "Target 185 lb × 10" / "Target level 6 × 10".
export function formatTarget(target: Pick<SmartTarget, 'kind' | 'unit' | 'weight' | 'reps'>): string {
  const load = target.kind === 'level' ? `level ${target.weight}` : `${formatWeight(target.weight)} ${target.unit}`
  return `${load} × ${target.reps}`
}

// Per exercise "Targets off" (the exercise sheet's switch), kept on the
// device like other local preferences; Erase all data clears it with the rest
// of the repbunny- keys.
export const TARGETS_OFF_KEY = 'repbunny-targets-off'

function readTargetsOff(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(TARGETS_OFF_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export const targetsOffIds = ref<string[]>(readTargetsOff())

export function setTargetsOff(exerciseId: string, off: boolean) {
  const next = targetsOffIds.value.filter((id) => id !== exerciseId)
  if (off) next.push(exerciseId)
  targetsOffIds.value = next
  try {
    localStorage.setItem(TARGETS_OFF_KEY, JSON.stringify(next))
  } catch {
    // best-effort; it still holds for this session
  }
}

// Issue #141: lighter-week choices, per exercise, kept on the device the same
// way (Erase all data clears them too).
export const LIGHTER_WEEK_KEY = 'repbunny-lighter-week'

function isDecision(value: unknown): value is LighterWeekDecision {
  const d = value as LighterWeekDecision
  return (
    !!d &&
    typeof d.accepted === 'boolean' &&
    typeof d.after === 'string' &&
    (d.kind === 'weight' || d.kind === 'level') &&
    typeof d.weight === 'number' &&
    typeof d.reps === 'number' &&
    typeof d.lighter === 'number'
  )
}

function readLighterWeek(): Record<string, LighterWeekDecision> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIGHTER_WEEK_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, d]) => isDecision(d))) as Record<string, LighterWeekDecision>
  } catch {
    return {}
  }
}

export const lighterWeekDecisions = ref<Record<string, LighterWeekDecision>>(readLighterWeek())

// Accept or dismiss the lighter week `target` offers.
export function decideLighterWeek(exerciseId: string, target: SmartTarget, accepted: boolean) {
  if (target.stall !== 'offer' || !target.lighter) return
  const decision: LighterWeekDecision = {
    accepted,
    after: target.anchor,
    kind: target.kind,
    unit: target.unit,
    weight: target.weight,
    reps: target.reps,
    lighter: target.lighter.weight,
  }
  lighterWeekDecisions.value = { ...lighterWeekDecisions.value, [exerciseId]: decision }
  try {
    localStorage.setItem(LIGHTER_WEEK_KEY, JSON.stringify(lighterWeekDecisions.value))
  } catch {
    // best-effort, as above
  }
}

// Issue #821: tapping "Take it" on the lighter-week offer also readies the open
// rows, as if each row's target chip were tapped. Rows mid-save never change.
export function fillOpenRows<R extends { key: string; saving: boolean }, T>(
  rows: R[],
  targets: Record<string, T>,
  fill: (row: R, target: T) => void,
) {
  for (const row of rows) {
    const t = targets[row.key]
    if (t && !row.saving) fill(row, t)
  }
}
