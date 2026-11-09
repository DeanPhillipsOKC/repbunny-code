import { test, expect } from '@playwright/test'
import { dayLabel, groupWorkoutDays } from '../src/lib/workoutLogDays'

// Issue #820: the Workout log's day headers.

const NOW = new Date(2026, 9, 24, 9, 30)

test('dayLabel says Today and Yesterday by local day, then the weekday date', () => {
  expect(dayLabel(new Date(2026, 9, 24, 0, 5), NOW)).toBe('Today')
  expect(dayLabel(new Date(2026, 9, 23, 23, 55), NOW)).toBe('Yesterday')
  expect(dayLabel(new Date(2026, 9, 22, 12, 0), NOW)).toBe(
    new Date(2026, 9, 22).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
  )
  // Yesterday across a month boundary.
  expect(dayLabel(new Date(2026, 9, 31, 18, 0), new Date(2026, 10, 1, 7, 0))).toBe('Yesterday')
})

test('dayLabel adds the year only for another year', () => {
  const thisYear = dayLabel(new Date(2026, 0, 3, 12, 0), NOW)
  expect(thisYear).not.toContain('2026')
  const lastYear = dayLabel(new Date(2025, 11, 30, 12, 0), NOW)
  expect(lastYear).toContain('2025')
  expect(lastYear).toBe(new Date(2025, 11, 30).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))
})

test('groupWorkoutDays keeps newest-first order and groups by local day', () => {
  const at = (d: number, h: number, m = 0) => ({ performed_at: new Date(2026, 9, d, h, m).toISOString() })
  const days = groupWorkoutDays([at(24, 8), at(23, 17, 26), at(23, 16, 35), at(20, 12)], NOW)
  expect(days.map((d) => [d.label === 'Today' || d.label === 'Yesterday' ? d.label : 'other', d.entries.length])).toEqual([
    ['Today', 1],
    ['Yesterday', 2],
    ['other', 1],
  ])
  expect(days[1].entries[0].performed_at).toBe(at(23, 17, 26).performed_at)
  expect(groupWorkoutDays([], NOW)).toEqual([])
})
