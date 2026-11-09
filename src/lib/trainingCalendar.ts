import type { LoadType, WeightUnit } from './types'
import type { BodyWeightEntryLike } from './bodyStats'
import { startOfWeek, type ProgressSetRow } from './progressHub'
import { recordSets } from './milestones'
import { setVolume } from './volume'
import { convertWeight } from './progressSeries'
import { formatSetLabel } from './setLabel'
import { workoutMinutes } from './workoutDuration'

// Issue #137: the training calendar, the last 12 months as one square per
// day (design docs/design/issue-137-training-calendar.html, option B). Pure,
// fed by the workouts store's all-sets fetch. Shade is sets logged that day
// in 4 steps; there are no streaks on purpose (the roadmap rules them out).

export const CALENDAR_WEEKS = 53

export interface CalendarWorkout {
  id: string
  name: string
  performedAt: string
  finishedAt: string | null
  sets: number
}

export interface CalendarDay {
  key: string // YYYY-MM-DD, local
  date: Date
  sets: number
  level: 0 | 1 | 2 | 3 | 4
  workouts: CalendarWorkout[]
  future: boolean
  today: boolean
}

export interface CalendarWeek {
  // The month starting in this week (its 1st falls Sunday to Saturday), for
  // the label above the column.
  monthLabel: string | null
  days: CalendarDay[]
}

export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

// 1 to 9 sets, 10 to 19, 20 to 29, 30 and up.
export function setsLevel(sets: number): CalendarDay['level'] {
  if (sets <= 0) return 0
  if (sets < 10) return 1
  if (sets < 20) return 2
  if (sets < 30) return 3
  return 4
}

// Sunday-start weeks, oldest first, ending with the week holding `now`.
export function buildCalendar(rows: ProgressSetRow[], now: Date = new Date()): CalendarWeek[] {
  const todayKey = dayKey(now)
  const first = startOfWeek(now)
  first.setDate(first.getDate() - (CALENDAR_WEEKS - 1) * 7)

  const byDay = new Map<string, Map<string, CalendarWorkout>>()
  for (const row of rows) {
    const performed = new Date(row.performed_at)
    if (performed < first) continue
    const key = dayKey(performed)
    let workouts = byDay.get(key)
    if (!workouts) byDay.set(key, (workouts = new Map()))
    let entry = workouts.get(row.workout_id)
    if (!entry) {
      entry = {
        id: row.workout_id,
        name: row.template_name ?? 'Freeform workout',
        performedAt: row.performed_at,
        finishedAt: row.finished_at ?? null,
        sets: 0,
      }
      workouts.set(row.workout_id, entry)
    }
    entry.sets++
  }

  const weeks: CalendarWeek[] = []
  const cursor = new Date(first)
  for (let w = 0; w < CALENDAR_WEEKS; w++) {
    const days: CalendarDay[] = []
    let monthLabel: string | null = null
    for (let d = 0; d < 7; d++) {
      const date = new Date(cursor)
      const key = dayKey(date)
      const workouts = [...(byDay.get(key)?.values() ?? [])].sort((a, b) => a.performedAt.localeCompare(b.performedAt))
      const sets = workouts.reduce((n, x) => n + x.sets, 0)
      if (date.getDate() === 1 && w > 0) monthLabel = date.toLocaleDateString('en-US', { month: 'short' })
      days.push({ key, date, sets, level: setsLevel(sets), workouts, future: key > todayKey, today: key === todayKey })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push({ monthLabel, days })
  }
  return weeks
}

export function calendarTotals(weeks: CalendarWeek[]): { workouts: number; days: number } {
  let workouts = 0
  let days = 0
  for (const week of weeks) {
    for (const day of week.days) {
      workouts += day.workouts.length
      if (day.workouts.length > 0) days++
    }
  }
  return { workouts, days }
}

// Issue #491: what a tapped day's sheet shows (design
// docs/design/issue-491-day-summary.html, option A). Volume is null when no
// set that day adds any (level, timed, or bodyweight with no weigh-in), and
// minutes is null when no workout that day has a finish time (#266).
// `records` are recordSets over all history, so a record is judged against
// everything before it, like the monthly report.
export interface DaySummaryRecord {
  exerciseId: string
  name: string
  set: string
}

export interface DaySummary {
  sets: number
  volume: number | null
  minutes: number | null
  records: DaySummaryRecord[]
}

export function daySummary(
  day: CalendarDay,
  rows: ProgressSetRow[],
  records: ProgressSetRow[],
  exercises: { id: string; name: string; load_type: LoadType }[],
  bodyWeightEntries: BodyWeightEntryLike[],
  unit: WeightUnit,
): DaySummary {
  const ids = new Set(day.workouts.map((w) => w.id))
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const loadTypeOf = (id: string): LoadType => byId.get(id)?.load_type ?? 'weight'

  let volume = 0
  let counted = false
  for (const row of rows) {
    if (!ids.has(row.workout_id)) continue
    const v = setVolume({ ...row, exercises: { load_type: loadTypeOf(row.exercise_id) } }, row.performed_at, bodyWeightEntries)
    if (v === null) continue
    volume += convertWeight(v, row.weight_unit, unit)
    counted = true
  }

  let minutes: number | null = null
  for (const w of day.workouts) {
    const m = workoutMinutes(w.performedAt, w.finishedAt)
    if (m !== null) minutes = (minutes ?? 0) + m
  }

  return {
    sets: day.sets,
    volume: counted ? Math.round(volume) : null,
    minutes,
    records: records
      .filter((r) => ids.has(r.workout_id))
      .map((r) => ({
        exerciseId: r.exercise_id,
        name: byId.get(r.exercise_id)?.name ?? 'Unknown',
        set: formatSetLabel(loadTypeOf(r.exercise_id), r.reps, r.weight, r.weight_unit, r.level),
      })),
  }
}

// The records a day summary picks from, worked out once for the whole list.
export function calendarRecords(
  rows: ProgressSetRow[],
  exercises: { id: string; load_type: LoadType }[],
  bodyWeightEntries: BodyWeightEntryLike[],
): ProgressSetRow[] {
  const byId = new Map(exercises.map((e) => [e.id, e.load_type]))
  return recordSets(rows, (id) => byId.get(id) ?? 'weight', bodyWeightEntries)
}
