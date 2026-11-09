import { test, expect } from '@playwright/test'
import { suggestTemplateName, templateRowsFromSets, workoutDateName } from '../src/lib/templateFromWorkout'

// Issue #207: the default name for saving a freeform workout as a template.
// Same "no separate unit-test runner" reasoning as
// assisted-load-type-unit.spec.ts: these never touch `page`.

const AT = '2026-10-09T15:00:00Z'

test('all push muscle groups name it Upper body push', () => {
  expect(suggestTemplateName(['chest', 'shoulders', 'chest'], AT)).toBe('Upper body push')
  expect(suggestTemplateName(['chest', 'arms'], AT)).toBe('Upper body push')
})

test('all pull muscle groups name it Upper body pull', () => {
  expect(suggestTemplateName(['back'], AT)).toBe('Upper body pull')
  expect(suggestTemplateName(['back', 'arms'], AT)).toBe('Upper body pull')
})

test('mixed or arms-only upper body names it Upper body', () => {
  expect(suggestTemplateName(['chest', 'back'], AT)).toBe('Upper body')
  expect(suggestTemplateName(['arms', 'arms'], AT)).toBe('Upper body')
})

test('legs and glutes name it Lower body', () => {
  expect(suggestTemplateName(['legs', 'glutes'], AT)).toBe('Lower body')
})

test('core only and cardio only keep their own names', () => {
  expect(suggestTemplateName(['core'], AT)).toBe('Core')
  expect(suggestTemplateName(['cardio', 'cardio'], AT)).toBe('Cardio')
})

test('a mix of areas names it Full body', () => {
  expect(suggestTemplateName(['chest', 'back', 'legs'], AT)).toBe('Full body')
  expect(suggestTemplateName(['legs', 'core'], AT)).toBe('Full body')
  expect(suggestTemplateName(['shoulders', 'cardio'], AT)).toBe('Full body')
})

test('unknown muscle groups are ignored, and none known falls back to the date', () => {
  expect(suggestTemplateName(['back', null], AT)).toBe('Upper body pull')
  expect(suggestTemplateName([null, undefined], AT)).toBe(workoutDateName(AT))
  expect(suggestTemplateName([], AT)).toBe(workoutDateName(AT))
  expect(workoutDateName(AT)).toMatch(/^Workout .*9/)
})

test('rows count sets per exercise in first-performed order, skipping archived ones', () => {
  const sets = [{ exercise_id: 'b' }, { exercise_id: 'a' }, { exercise_id: 'b' }, { exercise_id: 'x' }, { exercise_id: 'a' }, { exercise_id: 'b' }]
  expect(templateRowsFromSets(sets, (id) => id === 'x')).toEqual([
    { exerciseId: 'b', targetSets: 3 },
    { exerciseId: 'a', targetSets: 2 },
  ])
})
