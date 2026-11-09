// Issue #134: the Progress hub's weekly line (free) and the monthly report
// and year recap (Premium). Pure, fed by the workouts store's all-sets fetch
// like the rest of the hub. Workouts have no stored end time, so "time" is
// the time logged on timed sets, the same number as Muscle groups' Time.
import type { LoadType, WeightUnit } from './types'
import type { BodyWeightEntryLike } from './bodyStats'
import type { ProgressSetRow } from './progressHub'
import { startOfWeek } from './progressHub'
import { recordSets, recordSetsWithBeaten } from './milestones'
import { credits, type MuscleExercise } from './muscleVolume'
import { MUSCLE_GROUPS, type MuscleGroup } from './muscleGroups'
import { setVolume } from './volume'
import { convertWeight, epley, isEpleyEligible } from './progressSeries'
import { formatSetLabel } from './setLabel'

export type ReportPeriod = { kind: 'month'; year: number; month: number } | { kind: 'year'; year: number }

export type ReportExercise = MuscleExercise

export function periodStart(p: ReportPeriod): Date {
  return p.kind === 'month' ? new Date(p.year, p.month, 1) : new Date(p.year, 0, 1)
}

// Exclusive.
export function periodEnd(p: ReportPeriod): Date {
  return p.kind === 'month' ? new Date(p.year, p.month + 1, 1) : new Date(p.year + 1, 0, 1)
}

export function shiftPeriod(p: ReportPeriod, n: number): ReportPeriod {
  if (p.kind === 'year') return { kind: 'year', year: p.year + n }
  const d = new Date(p.year, p.month + n, 1)
  return { kind: 'month', year: d.getFullYear(), month: d.getMonth() }
}

// "September 2026", "2026".
export function periodLabel(p: ReportPeriod): string {
  if (p.kind === 'year') return String(p.year)
  return periodStart(p).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// "September", the hub tile's name for it.
export function monthName(p: ReportPeriod & { kind: 'month' }): string {
  return periodStart(p).toLocaleDateString('en-US', { month: 'long' })
}

// The month that just ended: the report the hub offers from the 1st.
export function lastFullMonth(now: Date = new Date()): ReportPeriod & { kind: 'month' } {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { kind: 'month', year: d.getFullYear(), month: d.getMonth() }
}

export function lastFullYear(now: Date = new Date()): ReportPeriod & { kind: 'year' } {
  return { kind: 'year', year: now.getFullYear() - 1 }
}

// The route's query: ?month=2026-09 or ?year=2025.
export function periodQuery(p: ReportPeriod): Record<string, string> {
  return p.kind === 'year' ? { year: String(p.year) } : { month: `${p.year}-${String(p.month + 1).padStart(2, '0')}` }
}

export function parsePeriod(query: Record<string, unknown>): ReportPeriod | null {
  const year = typeof query.year === 'string' ? /^(\d{4})$/.exec(query.year) : null
  if (year) return { kind: 'year', year: Number(year[1]) }
  const month = typeof query.month === 'string' ? /^(\d{4})-(\d{2})$/.exec(query.month) : null
  if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) {
    return { kind: 'month', year: Number(month[1]), month: Number(month[2]) - 1 }
  }
  return null
}

// A finished period can be reported on; the current one can't.
export function isComplete(p: ReportPeriod, now: Date = new Date()): boolean {
  return periodEnd(p).getTime() <= now.getTime()
}

export interface ReportStats {
  workouts: number
  sets: number
  // In the report's unit; null when no set in the period adds volume.
  volume: number | null
  timedSeconds: number
  records: number
}

export interface ReportRecord {
  exerciseId: string
  name: string
  set: string
  performedAt: string
}

export interface ReportGain {
  exerciseId: string
  name: string
  gain: number
  best: number
}

export interface ReportMuscle {
  group: MuscleGroup
  sets: number
  previous: number
}

export interface ProgressReport {
  period: ReportPeriod
  unit: WeightUnit
  stats: ReportStats
  previous: ReportStats
  records: ReportRecord[]
  gains: ReportGain[]
  muscles: ReportMuscle[]
}

function within(row: { performed_at: string }, start: number, end: number): boolean {
  const at = new Date(row.performed_at).getTime()
  return at >= start && at < end
}

function loadTypes(exercises: ReportExercise[]): (id: string) => LoadType {
  const map = new Map(exercises.map((e) => [e.id, e.load_type]))
  return (id) => map.get(id) ?? 'weight'
}

function statsFor(
  rows: ProgressSetRow[],
  records: ProgressSetRow[],
  loadTypeOf: (id: string) => LoadType,
  bodyWeightEntries: BodyWeightEntryLike[],
  unit: WeightUnit,
  start: number,
  end: number,
): ReportStats {
  const workouts = new Set<string>()
  let sets = 0
  let volume = 0
  let counted = false
  let timedSeconds = 0
  for (const row of rows) {
    if (!within(row, start, end)) continue
    workouts.add(row.workout_id)
    sets++
    const loadType = loadTypeOf(row.exercise_id)
    if (loadType === 'timed') timedSeconds += row.duration_seconds ?? 0
    const v = setVolume({ ...row, exercises: { load_type: loadType } }, row.performed_at, bodyWeightEntries)
    if (v !== null) {
      volume += convertWeight(v, row.weight_unit, unit)
      counted = true
    }
  }
  return {
    workouts: workouts.size,
    sets,
    volume: counted ? volume : null,
    timedSeconds,
    records: records.filter((r) => within(r, start, end)).length,
  }
}

function muscleSets(rows: ProgressSetRow[], exercises: ReportExercise[], start: number, end: number): Record<MuscleGroup, number> {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const counts = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Record<MuscleGroup, number>
  for (const row of rows) {
    if (!within(row, start, end)) continue
    const exercise = byId.get(row.exercise_id)
    if (!exercise) continue
    for (const [g, share] of credits(exercise)) counts[g] += share
  }
  return counts
}

// Est. 1RM gain per weight lift: the period's best against the best from all
// history before it. Lifts new this period have nothing to gain on.
function e1rmGains(rows: ProgressSetRow[], exercises: ReportExercise[], unit: WeightUnit, start: number, end: number): ReportGain[] {
  const gains: ReportGain[] = []
  for (const exercise of exercises) {
    if (exercise.load_type !== 'weight') continue
    let before = -Infinity
    let during = -Infinity
    for (const row of rows) {
      if (row.exercise_id !== exercise.id || !isEpleyEligible(row)) continue
      const at = new Date(row.performed_at).getTime()
      if (at >= end) continue
      const value = Math.round(epley(convertWeight(row.weight, row.weight_unit, unit), row.reps!))
      if (at < start) before = Math.max(before, value)
      else during = Math.max(during, value)
    }
    if (Number.isFinite(before) && Number.isFinite(during) && during > before) {
      gains.push({ exerciseId: exercise.id, name: exercise.name, gain: during - before, best: during })
    }
  }
  return gains.sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name)).slice(0, 3)
}

// The unit used by the most sets; lb with none.
export function reportUnit(rows: { weight_unit: WeightUnit }[], preferred: WeightUnit | null): WeightUnit {
  if (preferred) return preferred
  let kg = 0
  for (const r of rows) if (r.weight_unit === 'kg') kg++
  return kg > rows.length - kg ? 'kg' : 'lb'
}

export function buildReport(
  rows: ProgressSetRow[],
  exercises: ReportExercise[],
  bodyWeightEntries: BodyWeightEntryLike[],
  period: ReportPeriod,
  preferredUnit: WeightUnit | null = null,
): ProgressReport {
  const loadTypeOf = loadTypes(exercises)
  const unit = reportUnit(rows, preferredUnit)
  const records = recordSets(rows, loadTypeOf, bodyWeightEntries)
  const start = periodStart(period).getTime()
  const end = periodEnd(period).getTime()
  const prev = shiftPeriod(period, -1)
  const prevStart = periodStart(prev).getTime()

  const names = new Map(exercises.map((e) => [e.id, e.name]))
  const now = muscleSets(rows, exercises, start, end)
  const before = muscleSets(rows, exercises, prevStart, start)

  return {
    period,
    unit,
    stats: statsFor(rows, records, loadTypeOf, bodyWeightEntries, unit, start, end),
    previous: statsFor(rows, records, loadTypeOf, bodyWeightEntries, unit, prevStart, start),
    records: records
      .filter((r) => within(r, start, end))
      .map((r) => ({
        exerciseId: r.exercise_id,
        name: names.get(r.exercise_id) ?? 'Unknown',
        set: formatSetLabel(loadTypeOf(r.exercise_id), r.reps, r.weight, r.weight_unit, r.level),
        performedAt: r.performed_at,
      })),
    gains: e1rmGains(rows, exercises, unit, start, end),
    muscles: MUSCLE_GROUPS.filter((g) => now[g] > 0)
      .map((g) => ({ group: g, sets: now[g], previous: before[g] }))
      .sort((a, b) => b.sets - a.sets)
      .slice(0, 3),
  }
}

export interface WeekLine {
  workouts: number
  sets: number
  records: number
}

// The hub's free line for the current Sunday-start week.
export function weekLine(rows: ProgressSetRow[], exercises: ReportExercise[], bodyWeightEntries: BodyWeightEntryLike[], now: Date = new Date()): WeekLine {
  const start = startOfWeek(now).getTime()
  const workouts = new Set<string>()
  let sets = 0
  for (const row of rows) {
    if (new Date(row.performed_at).getTime() < start) continue
    workouts.add(row.workout_id)
    sets++
  }
  const records = recordSets(rows, loadTypes(exercises), bodyWeightEntries).filter(
    (r) => new Date(r.performed_at).getTime() >= start,
  ).length
  return { workouts: workouts.size, sets, records }
}

// Issue #581: the record sets the week line counted, newest first, each with
// the set it beat, for the hub's records sheet.
export interface WeekRecord {
  exerciseId: string
  name: string
  setId: string
  set: string
  beaten: string
  performedAt: string
}

export function weekRecords(
  rows: ProgressSetRow[],
  exercises: ReportExercise[],
  bodyWeightEntries: BodyWeightEntryLike[],
  now: Date = new Date(),
): WeekRecord[] {
  const start = startOfWeek(now).getTime()
  const loadTypeOf = loadTypes(exercises)
  const names = new Map(exercises.map((e) => [e.id, e.name]))
  const label = (r: ProgressSetRow) => formatSetLabel(loadTypeOf(r.exercise_id), r.reps, r.weight, r.weight_unit, r.level)
  return recordSetsWithBeaten(rows, loadTypeOf, bodyWeightEntries)
    .filter((r) => new Date(r.set.performed_at).getTime() >= start)
    .map((r) => ({
      exerciseId: r.set.exercise_id,
      name: names.get(r.set.exercise_id) ?? 'Unknown',
      setId: r.set.id,
      set: label(r.set),
      beaten: label(r.beaten),
      performedAt: r.set.performed_at,
    }))
    .reverse()
}

// "▲ 3", "▼ 1,200", "Same". Never a judgment, just the direction.
export function changeLabel(now: number, before: number, format: (n: number) => string = (n) => Math.round(n).toLocaleString('en-US')): string {
  const diff = now - before
  if (Math.abs(diff) < 0.5) return 'Same'
  return `${diff > 0 ? '▲' : '▼'} ${format(Math.abs(diff))}`
}

// Whether any workout happened before `p`'s end, so there's something to report.
export function hasHistoryBefore(rows: { performed_at: string }[], p: ReportPeriod): boolean {
  const end = periodEnd(p).getTime()
  return rows.some((r) => new Date(r.performed_at).getTime() < end)
}

export function earliestPeriod(rows: { performed_at: string }[], kind: ReportPeriod['kind']): ReportPeriod | null {
  let earliest: number | null = null
  for (const r of rows) {
    const at = new Date(r.performed_at).getTime()
    if (earliest === null || at < earliest) earliest = at
  }
  if (earliest === null) return null
  const d = new Date(earliest)
  return kind === 'year' ? { kind: 'year', year: d.getFullYear() } : { kind: 'month', year: d.getFullYear(), month: d.getMonth() }
}
