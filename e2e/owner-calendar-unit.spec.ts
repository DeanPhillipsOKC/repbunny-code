import { test, expect } from '@playwright/test'
import { calendarAction, eventTitle, isCalendarRecord, ownerDateMarker } from '../scripts/owner-calendar.mjs'

// Issue #746: which dated owner steps still need the Google Calendar. No page needed (same "no
// separate unit-test runner" reasoning as client-error-log-unit.spec.ts).

const TODAY = '2026-10-21'
const open = { number: 530, title: 'Cut Supabase egress', url: 'https://example.test/530', state: 'open' }
const closed = { ...open, state: 'closed' }
const item = (body: string, url = 'https://example.test/c') => ({ body, url })

test('the marker is built from "date | what" and rejects anything else', () => {
  expect(ownerDateMarker('2026-10-29 | check egress')).toBe('<!-- owner-date: 2026-10-29 | check egress -->')
  expect(ownerDateMarker(' 2026-10-29T09:00|check egress ')).toBe('<!-- owner-date: 2026-10-29T09:00 | check egress -->')
  expect(() => ownerDateMarker('2026-10-29')).toThrow()
  expect(() => ownerDateMarker('soon | check egress')).toThrow()
  expect(() => ownerDateMarker('2026-10-29 | close it --> now')).toThrow()
  expect(eventTitle('check egress', 530)).toBe('RepBunny: check egress (#530)')
  expect(isCalendarRecord('<!-- calendar-synced: abc 2026-10-29 -->')).toBe(true)
  expect(isCalendarRecord('<!-- calendar-failed: 2026-10-21 -->')).toBe(true)
  expect(isCalendarRecord('<!-- owner-date: 2026-10-29 | x -->')).toBe(false)
})

test('an unsynced future marker is a sync, and its record settles it', () => {
  const items = [item('Body'), item('Ask <!-- owner-date: 2026-10-29T09:00 | check egress -->', 'https://example.test/ask')]
  const { action, keep } = calendarAction(open, items, TODAY)
  expect(keep).toBe(true)
  expect(action).toEqual({
    action: 'sync',
    number: 530,
    title: 'Cut Supabase egress',
    url: 'https://example.test/530',
    date: '2026-10-29',
    time: '09:00',
    what: 'check egress',
    eventTitle: 'RepBunny: check egress (#530)',
    source: 'https://example.test/ask',
    eventId: null,
    failures: 0,
  })
  expect(calendarAction(open, [...items, item('<!-- calendar-synced: ev1 2026-10-29T09:00 -->')], TODAY)).toEqual({ action: null, keep: true })
  // The marker and its record in the same comment (an interactive session) count too.
  expect(calendarAction(open, [item('<!-- owner-date: 2026-10-29 | x -->\n<!-- calendar-synced: ev1 2026-10-29 -->')], TODAY).action).toBeNull()
  // A day-only record settles a timed marker on that day (#530's first event).
  expect(calendarAction(open, [item('<!-- owner-date: 2026-10-29T09:00 | x -->\n<!-- calendar-synced: ev1 2026-10-29 -->')], TODAY).action).toBeNull()
})

test('a later date moves the existing event', () => {
  const items = [
    item(''),
    item('<!-- owner-date: 2026-10-29 | check egress -->'),
    item('<!-- calendar-synced: ev1 2026-10-29 -->'),
    item('Pushed back. <!-- owner-date: 2026-11-05 | check egress -->'),
  ]
  const { action } = calendarAction(open, items, TODAY)
  expect(action).toMatchObject({ action: 'sync', date: '2026-11-05', time: null, eventId: 'ev1' })
})

test('an On hold until comment counts, but not in the issue body', () => {
  const { action } = calendarAction(open, [item(''), item('On hold until 2026-11-14: waiting on the quota reset.')], TODAY)
  expect(action).toMatchObject({ action: 'sync', date: '2026-11-14', what: 'resume Cut Supabase egress', eventTitle: 'RepBunny: resume Cut Supabase egress (#530)' })
  expect(calendarAction(open, [item('Comment `On hold until 2026-11-14` to pause.')], TODAY).action).toBeNull()
})

test('past dates and issues without markers need nothing', () => {
  expect(calendarAction(open, [item(''), item('<!-- owner-date: 2026-10-20 | too late -->')], TODAY)).toEqual({ action: null, keep: false })
  expect(calendarAction(open, [item('No dates here.')], TODAY)).toEqual({ action: null, keep: false })
})

test('a closed issue deletes its future events once each', () => {
  const items = [
    item('<!-- owner-date: 2026-10-29 | a -->'),
    item('<!-- calendar-synced: ev1 2026-10-29 -->'),
    item('<!-- calendar-synced: ev1 2026-11-02 -->'),
    item('<!-- calendar-synced: old 2026-10-01 -->'),
    item('<!-- calendar-synced: ev2 2026-12-01 -->'),
    item('<!-- calendar-removed: ev2 -->'),
  ]
  const { action, keep } = calendarAction(closed, items, TODAY)
  expect(keep).toBe(true)
  expect(action).toEqual({ action: 'delete', number: 530, title: 'Cut Supabase egress', url: 'https://example.test/530', events: [{ eventId: 'ev1', when: '2026-11-02' }], failures: 0 })
  expect(calendarAction(closed, [...items, item('<!-- calendar-removed: ev1 -->')], TODAY)).toEqual({ action: null, keep: false })
})

test('a failed try holds the entry back until the next day and is counted', () => {
  const ask = item('<!-- owner-date: 2026-10-29 | check egress -->')
  const failedToday = item('<!-- calendar-failed: 2026-10-21 -->\nCalendar: couldn\'t update.')
  expect(calendarAction(open, [item(''), ask, failedToday], TODAY)).toEqual({ action: null, keep: true })
  expect(calendarAction(open, [item(''), ask, failedToday], '2026-10-22').action).toMatchObject({ action: 'sync', failures: 1 })
  // A failure from before the latest marker doesn't count: a new date is tried at once.
  const moved = item('<!-- owner-date: 2026-11-05 | check egress -->')
  expect(calendarAction(open, [item(''), ask, failedToday, moved], TODAY).action).toMatchObject({ date: '2026-11-05', failures: 0 })
  // Deletes count failures since the latest sync record.
  const synced = [ask, item('<!-- calendar-synced: ev1 2026-10-29 -->')]
  expect(calendarAction(closed, [...synced, failedToday], TODAY)).toEqual({ action: null, keep: true })
  expect(calendarAction(closed, [...synced, failedToday], '2026-10-22').action).toMatchObject({ action: 'delete', failures: 1 })
})
