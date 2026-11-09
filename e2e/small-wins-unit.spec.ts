import { test, expect } from '@playwright/test'
import { findSmallWins, topWin, visibleWins, type WinSet, type WinTarget } from '../src/lib/smallWins'

// Issue #475: small wins for a logged set, same "no separate unit-test
// runner" reasoning as rep-records-unit.spec.ts.

function s(weight: number, reps: number, weight_unit: 'lb' | 'kg' = 'lb', level: number | null = null): WinSet {
  return { weight, reps, weight_unit, level }
}

const kinds = (set: WinSet, prior: WinSet[], target: WinTarget | null = null, loadType: 'weight' | 'level' | 'bodyweight' = 'weight') =>
  findSmallWins(set, loadType, prior, target).map((w) => w.kind)

test('heaviest weight yet', () => {
  const wins = findSmallWins(s(190, 5), 'weight', [s(185, 8), s(180, 10)], null)
  expect(wins[0]).toMatchObject({ kind: 'heaviest', label: 'Heaviest yet', detail: '190 lb, up from 185 lb' })
})

test('heaviest compares across units', () => {
  // 100 kg is about 220.5 lb.
  expect(kinds(s(225, 3), [s(100, 3, 'kg')])).toContain('heaviest')
  expect(kinds(s(220, 3), [s(100, 3, 'kg')])).not.toContain('heaviest')
})

test('rep best at a weight already lifted', () => {
  const wins = findSmallWins(s(185, 10), 'weight', [s(185, 8), s(185, 9), s(190, 4)], null)
  expect(wins.map((w) => w.kind)).toEqual(['reps', 'e1rm'])
  expect(wins[0].detail).toBe('10 reps at 185 lb, up from 9')
})

test('no rep best at a weight never lifted before, or on a tie', () => {
  expect(kinds(s(175, 12), [s(185, 8)])).not.toContain('reps')
  expect(kinds(s(185, 8), [s(185, 8)])).toEqual([])
})

test('est. 1RM best', () => {
  // 150 x 12 = 210 est. 1RM; 185 x 5 = 215.8 beats it without being heaviest.
  const wins = findSmallWins(s(185, 5), 'weight', [s(150, 12), s(200, 1)], null)
  expect(wins.map((w) => w.kind)).toEqual(['e1rm'])
  expect(wins[0].detail).toBe('Est. 1RM 216 lb')
})

test('no est. 1RM win past 12 reps', () => {
  expect(kinds(s(150, 15), [s(150, 10)])).toEqual(['reps'])
})

test('target hit after a weight bump, with no other win', () => {
  const target: WinTarget = { kind: 'weight', unit: 'lb', weight: 190, reps: 8 }
  // Already did 190 x 10 once: no heaviest or rep best, but the target is hit.
  expect(kinds(s(190, 8), [s(185, 12), s(190, 10)], target)).toEqual(['target'])
  const [win] = findSmallWins(s(190, 8), 'weight', [s(190, 10)], target)
  expect(win).toMatchObject({ label: 'Target hit', detail: '190 lb × 8' })
})

test('target missed on reps or weight', () => {
  const target: WinTarget = { kind: 'weight', unit: 'lb', weight: 190, reps: 8 }
  expect(kinds(s(190, 7), [s(190, 10)], target)).toEqual([])
  expect(kinds(s(185, 8), [s(190, 10)], target)).toEqual([])
})

test('target in another unit', () => {
  const target: WinTarget = { kind: 'weight', unit: 'lb', weight: 185, reps: 8 }
  expect(kinds(s(84, 8, 'kg'), [s(84, 10, 'kg')], target)).toEqual(['target'])
})

test('level target', () => {
  const target: WinTarget = { kind: 'level', unit: null, weight: 6, reps: 10 }
  const [win] = findSmallWins(s(0, 10, 'lb', 6), 'level', [s(0, 12, 'lb', 6)], target)
  expect(win).toMatchObject({ kind: 'target', detail: 'Level 6 × 10' })
  expect(kinds(s(0, 10, 'lb', 5), [], target, 'level')).toEqual([])
})

test('a first-ever set has no small wins without a target', () => {
  expect(kinds(s(135, 8), [])).toEqual([])
})

test('only weight exercises get heaviest, rep and 1RM wins', () => {
  expect(kinds(s(25, 12), [s(10, 8)], null, 'bodyweight')).toEqual([])
})

test('ranking: heaviest, rep best, 1RM best, target hit', () => {
  const target: WinTarget = { kind: 'weight', unit: 'lb', weight: 190, reps: 5 }
  expect(kinds(s(200, 5), [s(190, 5)], target)).toEqual(['heaviest', 'e1rm', 'target'])
  expect(kinds(s(190, 8), [s(190, 5)], target)).toEqual(['reps', 'e1rm', 'target'])
})

test('free accounts never see the est. 1RM win', () => {
  const wins = findSmallWins(s(185, 5), 'weight', [s(150, 12)], null)
  expect(wins.map((w) => w.kind)).toEqual(['heaviest', 'e1rm'])
  expect(visibleWins(wins, false).map((w) => w.kind)).toEqual(['heaviest'])
  const only1rm = findSmallWins(s(185, 5), 'weight', [s(150, 12), s(200, 1)], null)
  expect(topWin(only1rm, false)).toBeNull()
  expect(topWin(only1rm, true)?.kind).toBe('e1rm')
})
