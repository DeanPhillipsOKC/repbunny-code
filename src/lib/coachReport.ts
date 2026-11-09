// Issue #152: the progress report a user shares as a PDF with a coach or
// physio (Premium). Pure, fed by the same all-sets fetch as the monthly
// report (#134); lib/reportPdf.ts lays it out. Any date range, not just a
// calendar month, so there's no "before" column here: each lift is compared
// with itself from its first session in the range to its last.
import type { LoadType, WeightUnit } from './types'
import type { BodyWeightEntryLike } from './bodyStats'
import type { ProgressSetRow } from './progressHub'
import { recordSets } from './milestones'
import { credits, type MuscleExercise } from './muscleVolume'
import { MUSCLE_GROUPS, type MuscleGroup } from './muscleGroups'
import { convertWeight, epley, isEpleyEligible } from './progressSeries'
import { formatSetLabel } from './setLabel'
import { reportUnit } from './progressReport'

export type ShareRangeKind = 'period' | '4w' | '3m' | 'custom'

// A range of local days: `start` is the first day's midnight, `end` the
// midnight after the last day (exclusive).
export interface ShareRange {
  start: Date
  end: Date
}

function midnight(d: Date, addDays = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + addDays)
}

// The last 28 days, today included.
export function lastFourWeeks(now: Date = new Date()): ShareRange {
  return { start: midnight(now, -27), end: midnight(now, 1) }
}

// From the day after this date three months ago, through today.
export function lastThreeMonths(now: Date = new Date()): ShareRange {
  return { start: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate() + 1), end: midnight(now, 1) }
}

// "2026-09-08" for a date input.
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fromDateInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

// Both days inclusive; null when either is missing or `to` is before `from`.
export function customRange(from: string, to: string): ShareRange | null {
  const a = fromDateInput(from)
  const b = fromDateInput(to)
  if (!a || !b || b.getTime() < a.getTime()) return null
  return { start: a, end: midnight(b, 1) }
}

const DAY_MS = 24 * 60 * 60 * 1000

export function rangeDays(range: ShareRange): number {
  return Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS))
}

function longDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// "Sep 8, 2026 to Oct 5, 2026"; one day reads as just that day.
export function rangeLabel(range: ShareRange): string {
  const last = midnight(range.end, -1)
  if (last.getTime() <= range.start.getTime()) return longDate(range.start)
  return `${longDate(range.start)} to ${longDate(last)}`
}

// repbunny-report-2026-09-08-to-2026-10-05.pdf
export function reportFileName(range: ShareRange): string {
  return `repbunny-report-${toDateInput(range.start)}-to-${toDateInput(midnight(range.end, -1))}.pdf`
}

export interface CoachLift {
  exerciseId: string
  name: string
  loadType: LoadType
  sessions: number
  sets: number
  bestSet: string
  // Est. 1RM (Epley), weight lifts only: the best set of the first session in
  // the range and of the last one. null when no set qualifies (over 12 reps).
  e1rmStart: number | null
  e1rmEnd: number | null
  // The sets behind the first and last values, only with { withSets: true } (#583).
  sources?: { first: CoachSource; last: CoachSource }
}

// One set a number was read from: its day, how it reads, and the Est. 1RM it gave.
export interface CoachSource {
  performedAt: string
  set: string
  e1rm: number | null
}

export interface CoachMuscle {
  group: MuscleGroup
  sets: number
}

export interface CoachBodyWeight {
  start: number
  startAt: string
  end: number
  endAt: string
  entries: number
}

export interface CoachRecord {
  name: string
  set: string
  performedAt: string
  // The earlier set this one beat, only with { withSets: true } (#583).
  beat?: { set: string; performedAt: string }
}

export interface CoachReport {
  range: ShareRange
  unit: WeightUnit
  days: number
  workouts: number
  sets: number
  // Workouts per week over the range, one decimal.
  perWeek: number
  lifts: CoachLift[]
  muscles: CoachMuscle[]
  bodyWeight: CoachBodyWeight | null
  records: CoachRecord[]
}

type Row = ProgressSetRow

// The order recordSets replays history in.
function replayOrder(a: Row, b: Row): number {
  const byTime = new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
  if (byTime !== 0) return byTime
  if (a.workout_id !== b.workout_id) return a.workout_id < b.workout_id ? -1 : 1
  return (a.set_index ?? 0) - (b.set_index ?? 0)
}

// Higher is better. Assisted sets: less assist, then more reps.
function setScore(loadType: LoadType, row: Row, unit: WeightUnit): [number, number] {
  const reps = row.reps ?? 0
  switch (loadType) {
    case 'weight':
      return isEpleyEligible(row)
        ? [epley(convertWeight(row.weight, row.weight_unit, unit), reps), reps]
        : [convertWeight(row.weight, row.weight_unit, unit), reps]
    case 'bodyweight':
      return [convertWeight(row.weight, row.weight_unit, unit), reps]
    case 'assisted':
      return [-convertWeight(row.weight, row.weight_unit, unit), reps]
    case 'level':
      return [row.level ?? 0, reps]
    case 'timed':
      return [row.duration_seconds ?? 0, row.distance ?? 0]
  }
}

function better(a: [number, number], b: [number, number]): boolean {
  return a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])
}

function label(loadType: LoadType, row: Row): string {
  return formatSetLabel(loadType, row.reps, row.weight, row.weight_unit, row.level, {
    durationSeconds: row.duration_seconds,
    distance: row.distance,
    distanceUnit: row.distance_unit,
    incline: row.incline,
    calories: row.calories,
  })
}

function bestE1rm(rows: Row[], unit: WeightUnit): number | null {
  let best: number | null = null
  for (const row of rows) {
    if (!isEpleyEligible(row)) continue
    const value = Math.round(epley(convertWeight(row.weight, row.weight_unit, unit), row.reps!))
    if (best === null || value > best) best = value
  }
  return best
}

// The set a session's number comes from: the best by Est. 1RM when the lift has
// any eligible set (the same one bestE1rm reads), else the best by score.
function sourceOf(loadType: LoadType, rows: Row[], unit: WeightUnit): CoachSource {
  const pool = loadType === 'weight' && rows.some(isEpleyEligible) ? rows.filter(isEpleyEligible) : rows
  let best = pool[0]
  let bestScore = setScore(loadType, best, unit)
  for (const row of pool.slice(1)) {
    const score = setScore(loadType, row, unit)
    if (better(score, bestScore)) {
      best = row
      bestScore = score
    }
  }
  return { performedAt: best.performed_at, set: label(loadType, best), e1rm: loadType === 'weight' ? bestE1rm([best], unit) : null }
}

function liftsFor(rows: Row[], exercises: MuscleExercise[], unit: WeightUnit, withSets: boolean): CoachLift[] {
  const byExercise = new Map<string, Row[]>()
  for (const row of rows) {
    const list = byExercise.get(row.exercise_id)
    if (list) list.push(row)
    else byExercise.set(row.exercise_id, [row])
  }
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const lifts: CoachLift[] = []
  for (const [exerciseId, sets] of byExercise) {
    const exercise = byId.get(exerciseId)
    const loadType = exercise?.load_type ?? 'weight'
    let best = sets[0]
    let bestScore = setScore(loadType, best, unit)
    for (const row of sets.slice(1)) {
      const score = setScore(loadType, row, unit)
      if (better(score, bestScore)) {
        best = row
        bestScore = score
      }
    }
    // Sessions in time order, each keeping its own sets.
    const sessions = new Map<string, { at: number; rows: Row[] }>()
    for (const row of sets) {
      const s = sessions.get(row.workout_id)
      if (s) s.rows.push(row)
      else sessions.set(row.workout_id, { at: new Date(row.performed_at).getTime(), rows: [row] })
    }
    const ordered = [...sessions.values()].sort((a, b) => a.at - b.at)
    const weighted = loadType === 'weight'
    lifts.push({
      exerciseId,
      name: exercise?.name ?? 'Unknown',
      loadType,
      sessions: ordered.length,
      sets: sets.length,
      bestSet: label(loadType, best),
      e1rmStart: weighted ? bestE1rm(ordered[0].rows, unit) : null,
      e1rmEnd: weighted ? bestE1rm(ordered[ordered.length - 1].rows, unit) : null,
      ...(withSets
        ? { sources: { first: sourceOf(loadType, ordered[0].rows, unit), last: sourceOf(loadType, ordered[ordered.length - 1].rows, unit) } }
        : {}),
    })
  }
  return lifts.sort((a, b) => b.sessions - a.sessions || b.sets - a.sets || a.name.localeCompare(b.name))
}

function bodyWeightFor(entries: BodyWeightEntryLike[], unit: WeightUnit, start: number, end: number): CoachBodyWeight | null {
  const inRange = entries
    .filter((e) => {
      const at = new Date(e.recorded_at).getTime()
      return at >= start && at < end
    })
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
  if (inRange.length === 0) return null
  const first = inRange[0]
  const last = inRange[inRange.length - 1]
  const round = (e: BodyWeightEntryLike) => Math.round(convertWeight(e.weight, e.weight_unit, unit) * 10) / 10
  return { start: round(first), startAt: first.recorded_at, end: round(last), endAt: last.recorded_at, entries: inRange.length }
}

export function buildCoachReport(
  allRows: Row[],
  exercises: MuscleExercise[],
  bodyWeightEntries: BodyWeightEntryLike[],
  range: ShareRange,
  preferredUnit: WeightUnit | null = null,
  options: { withSets?: boolean } = {},
): CoachReport {
  const withSets = options.withSets === true
  const start = range.start.getTime()
  const end = range.end.getTime()
  const rows = allRows.filter((r) => {
    const at = new Date(r.performed_at).getTime()
    return at >= start && at < end
  })
  const unit = reportUnit(allRows, preferredUnit)
  const days = rangeDays(range)
  const workouts = new Set(rows.map((r) => r.workout_id)).size

  const byId = new Map(exercises.map((e) => [e.id, e]))
  const muscleCounts = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>
  for (const row of rows) {
    const exercise = byId.get(row.exercise_id)
    if (exercise) for (const [g, share] of credits(exercise)) muscleCounts[g] += share
  }

  const loadTypeOf = (id: string): LoadType => byId.get(id)?.load_type ?? 'weight'
  const allRecords = recordSets(allRows, loadTypeOf, bodyWeightEntries)
  // Each record beat the exercise's previous record, or its first set (the
  // baseline) when it is the first record. Same order as recordSets replays.
  const beaten = new Map<Row, Row>()
  if (withSets) {
    const first = new Map<string, Row>()
    for (const row of [...allRows].sort(replayOrder)) if (!first.has(row.exercise_id)) first.set(row.exercise_id, row)
    const last = new Map<string, Row>()
    for (const r of allRecords) {
      const prev = last.get(r.exercise_id) ?? first.get(r.exercise_id)
      if (prev) beaten.set(r, prev)
      last.set(r.exercise_id, r)
    }
  }
  const records = allRecords
    .filter((r) => {
      const at = new Date(r.performed_at).getTime()
      return at >= start && at < end
    })
    .map((r) => {
      const prev = beaten.get(r)
      return {
        name: byId.get(r.exercise_id)?.name ?? 'Unknown',
        set: label(loadTypeOf(r.exercise_id), r),
        performedAt: r.performed_at,
        ...(prev ? { beat: { set: label(loadTypeOf(r.exercise_id), prev), performedAt: prev.performed_at } } : {}),
      }
    })

  return {
    range,
    unit,
    days,
    workouts,
    sets: rows.length,
    perWeek: Math.round((workouts / (days / 7)) * 10) / 10,
    lifts: liftsFor(rows, exercises, unit, withSets),
    muscles: MUSCLE_GROUPS.filter((g) => muscleCounts[g] > 0)
      .map((g) => ({ group: g, sets: muscleCounts[g] }))
      .sort((a, b) => b.sets - a.sets),
    bodyWeight: bodyWeightFor(bodyWeightEntries, unit, start, end),
    records,
  }
}

// "+15 lb", "-5 lb", "Same"; blank when either end is missing.
export function e1rmChange(lift: CoachLift, unit: WeightUnit): string {
  if (lift.e1rmStart === null || lift.e1rmEnd === null) return ''
  const diff = lift.e1rmEnd - lift.e1rmStart
  if (diff === 0) return 'Same'
  return `${diff > 0 ? '+' : '-'}${Math.abs(diff).toLocaleString('en-US')} ${unit}`
}
