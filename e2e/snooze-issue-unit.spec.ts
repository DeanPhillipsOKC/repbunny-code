import { test, expect } from '@playwright/test'
import { isSnoozed, latestNotBefore, snoozeMarker } from '../scripts/snooze-issue.mjs'

// Issue #749's not-before snooze. No page needed (same reasoning as ask-dean-unit.spec.ts).

test('the marker has one format and refuses bad dates', () => {
  expect(snoozeMarker('2026-10-28', 'needs a week of CI usage', '2026-10-22')).toBe('<!-- not-before: 2026-10-28 | needs a week of CI usage -->')
  expect(snoozeMarker('2026-11-21', 'edge', '2026-10-22')).toContain('2026-11-21')
  expect(() => snoozeMarker('2026-11-22', 'too far', '2026-10-22')).toThrow(/30 days/)
  expect(() => snoozeMarker('2026-10-21', 'past', '2026-10-22')).toThrow(/past/)
  expect(() => snoozeMarker('soon', 'x', '2026-10-22')).toThrow()
  expect(() => snoozeMarker('2026-10-28', ' ', '2026-10-22')).toThrow(/reason/)
  expect(() => snoozeMarker('2026-10-28', 'a --> b', '2026-10-22')).toThrow()
})

test('the latest marker wins and the issue wakes on its date', () => {
  const marker = latestNotBefore([
    'Body.\n<!-- not-before: 2026-10-28 | first -->',
    'a comment without one',
    '<!-- not-before: 2026-11-05 | later -->',
  ])
  expect(marker).toEqual({ date: '2026-11-05', reason: 'later' })
  expect(latestNotBefore(['nothing', null])).toBeNull()
  expect(isSnoozed(marker, '2026-11-04')).toBe(true)
  expect(isSnoozed(marker, '2026-11-05')).toBe(false)
  expect(isSnoozed(null, '2026-11-04')).toBe(false)
})
