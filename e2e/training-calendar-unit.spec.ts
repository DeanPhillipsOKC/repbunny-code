import { test, expect } from '@playwright/test'
import type { ProgressSetRow } from '../src/lib/progressHub'
import { buildCalendar, calendarRecords, calendarTotals, CALENDAR_WEEKS, dayKey, daySummary, setsLevel } from '../src/lib/trainingCalendar'

// Issue #137's training calendar. Pure, same "no separate unit-test runner"
// reasoning as progress-series-unit.spec.ts.

let nextId = 0
function rows(workoutId: string, performedAt: Date, count: number, templateName: string | null = 'Push day'): ProgressSetRow[] {
  return Array.from({ length: count }, () => ({
    id: `s${nextId++}`,
    exercise_id: 'bench',
    workout_id: workoutId,
    performed_at: performedAt.toISOString(),
    reps: 10,
    weight: 100,
    weight_unit: 'lb' as const,
    rpe: null,
    level: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    incline: null,
    calories: null,
    template_name: templateName,
  }))
}

// Monday, Oct 5 2026, mid-morning local time.
const NOW = new Date(2026, 9, 5, 10)

test('53 Sunday-start weeks ending with this week, today marked and later days future', () => {
  const weeks = buildCalendar([], NOW)
  expect(weeks).toHaveLength(CALENDAR_WEEKS)
  const days = weeks.flatMap((w) => w.days)
  expect(days.every((d) => d.date.getDay() === days.indexOf(d) % 7)).toBe(true)
  expect(dayKey(days[0].date)).toBe('2025-10-05')
  const today = days.filter((d) => d.today)
  expect(today.map((d) => d.key)).toEqual(['2026-10-05'])
  expect(days.filter((d) => d.future).map((d) => d.key)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
})

test('shade steps by sets logged that day', () => {
  expect([0, 1, 9, 10, 19, 20, 29, 30, 60].map(setsLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
})

test('a day groups its workouts in time order, counts sets, and old rows fall outside', () => {
  const data = [
    ...rows('evening', new Date(2026, 8, 26, 18, 40), 6, null),
    ...rows('morning', new Date(2026, 8, 26, 8, 5), 21, 'Leg day'),
    ...rows('mon', new Date(2026, 8, 28, 9), 12),
    ...rows('old', new Date(2025, 8, 1, 9), 40),
  ]
  const weeks = buildCalendar(data, NOW)
  const days = new Map(weeks.flatMap((w) => w.days).map((d) => [d.key, d]))
  const sat = days.get('2026-09-26')!
  expect(sat.sets).toBe(27)
  expect(sat.level).toBe(3)
  expect(sat.workouts.map((w) => [w.id, w.name, w.sets])).toEqual([
    ['morning', 'Leg day', 21],
    ['evening', 'Freeform workout', 6],
  ])
  expect(days.get('2026-09-28')!.level).toBe(2)
  expect(calendarTotals(weeks)).toEqual({ workouts: 3, days: 2 })
})

test('a month is labeled over the week its 1st falls in', () => {
  const weeks = buildCalendar([], NOW)
  const labeled = weeks.filter((w) => w.monthLabel).map((w) => w.monthLabel)
  expect(labeled).toEqual(['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])
  // Oct 1 2026 is a Thursday, in the week before this one (Sep 27 to Oct 3).
  expect(weeks[weeks.length - 2].monthLabel).toBe('Oct')
  expect(weeks[weeks.length - 1].monthLabel).toBeNull()
})

// Issue #491: a tapped day's summary.
test('a day summary adds up volume in the unit asked for, time from finish times, and that day\'s records', () => {
  const finished = (list: ProgressSetRow[], minutes: number) =>
    list.map((r) => ({ ...r, finished_at: new Date(new Date(r.performed_at).getTime() + minutes * 60000).toISOString() }))
  const heavy = rows('heavy', new Date(2026, 8, 26, 8), 2).map((r) => ({ ...r, weight: 120 }))
  const plank = rows('heavy', new Date(2026, 8, 26, 8), 1).map((r) => ({ ...r, exercise_id: 'plank', reps: null, weight: 0, duration_seconds: 60 }))
  const data = [
    ...rows('before', new Date(2026, 8, 20, 9), 3),
    ...finished([...heavy, ...plank], 45),
    ...finished(rows('later', new Date(2026, 8, 26, 18), 1), 20),
  ]
  const exercises = [
    { id: 'bench', name: 'Bench Press', load_type: 'weight' as const },
    { id: 'plank', name: 'Plank', load_type: 'timed' as const },
  ]
  const day = buildCalendar(data, NOW).flatMap((w) => w.days).find((d) => d.key === '2026-09-26')!
  const records = calendarRecords(data, exercises, [])
  const lb = daySummary(day, data, records, exercises, [], 'lb')
  expect(lb).toEqual({ sets: 4, volume: 3400, minutes: 65, records: [{ exerciseId: 'bench', name: 'Bench Press', set: '10 × 120 lb' }] })
  expect(daySummary(day, data, records, exercises, [], 'kg').volume).toBe(Math.round(3400 * 0.45359237))

  // No finish time and only a timed set: no time, no volume.
  const plankOnly = rows('p', new Date(2026, 8, 27, 9), 1).map((r) => ({ ...r, exercise_id: 'plank', reps: null, weight: 0 }))
  const sun = buildCalendar(plankOnly, NOW).flatMap((w) => w.days).find((d) => d.key === '2026-09-27')!
  expect(daySummary(sun, plankOnly, [], exercises, [], 'lb')).toEqual({ sets: 1, volume: null, minutes: null, records: [] })
})
