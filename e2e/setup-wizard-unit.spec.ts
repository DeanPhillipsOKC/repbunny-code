import { test, expect } from '@playwright/test'
import { unitForLocales } from '../src/lib/setupWizard'

// Issue #397: step 1 preselects the unit from the phone's region: kg
// everywhere but the US, Liberia, and Myanmar.
test('the first locale with a region decides the unit', () => {
  expect(unitForLocales(['en-US'])).toBe('lb')
  expect(unitForLocales(['en-LR'])).toBe('lb')
  expect(unitForLocales(['my-MM'])).toBe('lb')
  expect(unitForLocales(['en-GB'])).toBe('kg')
  expect(unitForLocales(['de-DE'])).toBe('kg')
  expect(unitForLocales(['fr-CA'])).toBe('kg')
  expect(unitForLocales(['es-419'])).toBe('kg')
  // A bare language says nothing, so the next locale decides.
  expect(unitForLocales(['en', 'en-AU'])).toBe('kg')
  expect(unitForLocales(['de', 'en-US'])).toBe('lb')
})

test('no region anywhere, or a malformed tag, falls back to lb', () => {
  expect(unitForLocales([])).toBe('lb')
  expect(unitForLocales(['en'])).toBe('lb')
  expect(unitForLocales(['not a locale!', 'en-NZ'])).toBe('kg')
})
