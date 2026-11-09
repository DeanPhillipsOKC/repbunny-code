import { test, expect } from '@playwright/test'
import { beatsBest, findPrWorkoutIds, type SetMarker } from '../src/lib/progress'

// Issue #573: a record comparison weighs a lb set against a kg set by what
// they lift. Pure math, never touches `page`.

const weightSet = (reps: number, weight: number, weightUnit: 'lb' | 'kg'): SetMarker => ({
  loadType: 'weight', level: null, reps, weight, weightUnit, effectiveLoad: null,
})

test('beatsBest: a kg set after lb history is judged by its converted volume', () => {
  const best = weightSet(5, 225, 'lb') // 1,125 lb-reps
  expect(beatsBest(weightSet(6, 100, 'kg'), best)).toBe(true) // 220.5 lb x 6 = 1,323
  expect(beatsBest(weightSet(5, 100, 'kg'), best)).toBe(false) // 1,102
})

test('beatsBest: an lb set after kg history is not a fake record', () => {
  const best = weightSet(5, 100, 'kg') // 220.5 lb x 5 = 1,102 lb-reps
  expect(beatsBest(weightSet(5, 135, 'lb'), best)).toBe(false) // raw 675 > 500 would have been a "record"
  expect(beatsBest(weightSet(5, 225, 'lb'), best)).toBe(true)
})

test('beatsBest: bodyweight sets with mixed units compare effective load in one unit', () => {
  const bw = (reps: number, weight: number, weightUnit: 'lb' | 'kg', effectiveLoad: number): SetMarker => ({
    loadType: 'bodyweight', level: null, reps, weight, weightUnit, effectiveLoad,
  })
  const best = bw(10, 0, 'lb', 200) // 2,000
  expect(beatsBest(bw(10, 0, 'kg', 95), best)).toBe(true) // 95 kg = 209.4 lb
  expect(beatsBest(bw(10, 0, 'kg', 85), best)).toBe(false) // 187.4 lb
})

test('findPrWorkoutIds: mixed-unit history marks only the real record', () => {
  const set = (weight: number, weight_unit: 'lb' | 'kg') => ({
    id: `${weight}${weight_unit}`, exercise_id: 'e1', reps: 5, weight, weight_unit, level: null, exercises: { load_type: 'weight' as const },
  })
  const ids = findPrWorkoutIds([
    { id: 'w1', performed_at: '2026-01-01T00:00:00Z', sets: [set(225, 'lb')] },
    { id: 'w2', performed_at: '2026-01-08T00:00:00Z', sets: [set(100, 'kg')] },
    { id: 'w3', performed_at: '2026-01-15T00:00:00Z', sets: [set(110, 'kg')] },
  ])
  expect([...ids]).toEqual(['w3'])
})
