import { test, expect } from '@playwright/test'
import {
  bmiCategory,
  bodyWeightAt,
  computeBmi,
  convertWeight,
  feetInchesToInches,
  inchesToFeetInches,
  isBigWeightChange,
  isWeighInReminderDue,
} from '../src/lib/bodyStats'

// Backlog item 77 asks for bodyWeightAt (the pure helper deciding which body
// weight was "in effect" for a set logged at a given time) and the BMI math
// to be unit-tested. This repo has no separate unit-test runner (Playwright
// e2e only, see docs/architecture.md#testing--automation) — these tests
// never touch `page`, so they run as plain Node assertions under the
// existing `npm run test:e2e` gate rather than pulling in a new tool.

test('bodyWeightAt: latest entry at or before performedAt, converted to the requested unit', () => {
  const entries = [
    { weight: 180, weight_unit: 'lb' as const, recorded_at: '2026-01-01T00:00:00Z' },
    { weight: 82, weight_unit: 'kg' as const, recorded_at: '2026-02-01T00:00:00Z' },
    { weight: 178, weight_unit: 'lb' as const, recorded_at: '2026-03-01T00:00:00Z' },
  ]

  // Between the Feb and Mar entries: Feb's kg entry is the latest one at or
  // before this date, converted to lb.
  const result = bodyWeightAt(entries, '2026-02-15T00:00:00Z', 'lb')
  expect(result).toBeCloseTo(convertWeight(82, 'kg', 'lb'), 5)

  // Exactly on an entry's own timestamp counts as "at or before".
  expect(bodyWeightAt(entries, '2026-03-01T00:00:00Z', 'lb')).toBe(178)

  // Before every entry: falls back to the earliest one on file.
  expect(bodyWeightAt(entries, '2025-06-01T00:00:00Z', 'lb')).toBe(180)

  // No entries at all: null, never a fabricated 0.
  expect(bodyWeightAt([], '2026-03-01T00:00:00Z', 'lb')).toBeNull()

  // Unordered input is sorted internally before searching.
  const shuffled = [entries[2], entries[0], entries[1]]
  expect(bodyWeightAt(shuffled, '2026-02-15T00:00:00Z', 'lb')).toBeCloseTo(convertWeight(82, 'kg', 'lb'), 5)
})

test('feet/inches <-> total inches round-trip', () => {
  expect(feetInchesToInches(5, 11)).toBe(71)
  expect(inchesToFeetInches(71)).toEqual({ feet: 5, inches: 11 })
  expect(inchesToFeetInches(72)).toEqual({ feet: 6, inches: 0 })
})

test('computeBmi and bmiCategory: standard thresholds, lb/in and kg/cm both supported', () => {
  // 185.4 lb, 5'11" (71 in) -> BMI ~25.9, matching the mockup's example.
  expect(computeBmi(185.4, 'lb', 71, 'in')).toBeCloseTo(25.9, 1)
  expect(bmiCategory(computeBmi(185.4, 'lb', 71, 'in'))).toBe('Overweight')

  // Same person in metric should read the same BMI regardless of input unit.
  const kgCm = computeBmi(convertWeight(185.4, 'lb', 'kg'), 'kg', 180.34, 'cm')
  expect(kgCm).toBeCloseTo(25.9, 1)

  expect(bmiCategory(18.4)).toBe('Underweight')
  expect(bmiCategory(18.5)).toBe('Normal')
  expect(bmiCategory(24.9)).toBe('Normal')
  expect(bmiCategory(25)).toBe('Overweight')
  expect(bmiCategory(29.9)).toBe('Overweight')
  expect(bmiCategory(30)).toBe('Obese')
})

// Backlog item 80: periodic weigh-in reminder due/snooze logic.
test('isWeighInReminderDue: cadence, missing prerequisites, and snooze', () => {
  const now = new Date('2026-03-01T00:00:00Z').getTime()
  const thirtyOneDaysAgo = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString()
  const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()

  // Monthly cadence, last weigh-in 31 days ago: due.
  expect(
    isWeighInReminderDue({
      latestEntryRecordedAt: thirtyOneDaysAgo,
      cadence: 'monthly',
      hasHeight: true,
      snoozedUntil: null,
      now,
    }),
  ).toBe(true)

  // Weekly cadence, last weigh-in 10 days ago: also due.
  expect(
    isWeighInReminderDue({
      latestEntryRecordedAt: tenDaysAgo,
      cadence: 'weekly',
      hasHeight: true,
      snoozedUntil: null,
      now,
    }),
  ).toBe(true)

  // Monthly cadence, last weigh-in only 10 days ago: not due yet.
  expect(
    isWeighInReminderDue({
      latestEntryRecordedAt: tenDaysAgo,
      cadence: 'monthly',
      hasHeight: true,
      snoozedUntil: null,
      now,
    }),
  ).toBe(false)

  // Cadence off: never due, regardless of how stale the entry is.
  expect(
    isWeighInReminderDue({
      latestEntryRecordedAt: thirtyOneDaysAgo,
      cadence: 'off',
      hasHeight: true,
      snoozedUntil: null,
      now,
    }),
  ).toBe(false)

  // No height on file: never due.
  expect(
    isWeighInReminderDue({
      latestEntryRecordedAt: thirtyOneDaysAgo,
      cadence: 'monthly',
      hasHeight: false,
      snoozedUntil: null,
      now,
    }),
  ).toBe(false)

  // No weight entry on file at all: never due (item 78/79's missing-weight
  // prompt owns that case instead).
  expect(
    isWeighInReminderDue({
      latestEntryRecordedAt: null,
      cadence: 'monthly',
      hasHeight: true,
      snoozedUntil: null,
      now,
    }),
  ).toBe(false)

  // Snoozed until a future timestamp: not due yet, even though otherwise due.
  expect(
    isWeighInReminderDue({
      latestEntryRecordedAt: thirtyOneDaysAgo,
      cadence: 'monthly',
      hasHeight: true,
      snoozedUntil: now + 24 * 60 * 60 * 1000,
      now,
    }),
  ).toBe(false)

  // Snooze already expired: due again.
  expect(
    isWeighInReminderDue({
      latestEntryRecordedAt: thirtyOneDaysAgo,
      cadence: 'monthly',
      hasHeight: true,
      snoozedUntil: now - 1000,
      now,
    }),
  ).toBe(true)
})

// Backlog item 81: a typo (18.5 instead of 185) is a >20% swing from the
// entry it's compared against, unlike a normal day-to-day fluctuation.
test('isBigWeightChange: >20% swing flags, same-unit and cross-unit, small changes do not', () => {
  expect(isBigWeightChange(18.5, 'lb', 185, 'lb')).toBe(true)
  expect(isBigWeightChange(175, 'lb', 180, 'lb')).toBe(false)
  expect(isBigWeightChange(400, 'lb', 180, 'lb')).toBe(true)

  // 185 lb -> ~83.9 kg; entering 84 kg is a normal same-weight re-entry, not
  // a typo, once converted to the same unit.
  expect(isBigWeightChange(84, 'kg', 185, 'lb')).toBe(false)
  expect(isBigWeightChange(40, 'kg', 185, 'lb')).toBe(true)

  // Exactly at the 20% boundary is not yet "big"; just past it is.
  expect(isBigWeightChange(120, 'lb', 100, 'lb')).toBe(false)
  expect(isBigWeightChange(120.1, 'lb', 100, 'lb')).toBe(true)
})
