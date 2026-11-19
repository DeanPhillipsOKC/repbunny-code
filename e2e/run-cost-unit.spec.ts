import { test, expect } from '@playwright/test'
import { contextStats } from '../scripts/run-cost-lib.mjs'

// Issue #1051: run-cost reports the starting context and the cache rewrites after an idle gap.

const MIN = 60 * 1000
const PRICES = { m: [2, 10, 0.2] as number[] }
const turn = (t: number, input: number, write5m: number, read: number, write1h = 0) => ({ t, model: 'm', input, write5m, write1h, read })

test('starting context is the first turn input, cached or not', () => {
  const s = contextStats([turn(0, 10, 12000, 3000), turn(MIN, 5, 100, 15000)], PRICES)
  expect(s.startContext).toBe(15010)
  expect(s.rewrites).toBe(0)
})

test('no turns gives zeros', () => {
  expect(contextStats([], PRICES)).toEqual({ startContext: 0, rewrites: 0, rewriteTokens: 0, rewriteUsd: 0 })
})

test('a big cache write after a 5 minute gap counts as a rewrite and is priced', () => {
  const s = contextStats([turn(0, 10, 20000, 0), turn(6 * MIN, 5, 20000, 100)], PRICES)
  expect(s.rewrites).toBe(1)
  expect(s.rewriteTokens).toBe(20000)
  expect(s.rewriteUsd).toBe(0.05)
})

test('1 hour writes price at 2x; a short gap or a small write is not a rewrite', () => {
  const s = contextStats(
    [turn(0, 10, 20000, 0), turn(MIN, 5, 20000, 100), turn(20 * MIN, 5, 100, 20000), turn(30 * MIN, 0, 0, 10000, 30000)],
    PRICES,
  )
  expect(s.rewrites).toBe(1)
  expect(s.rewriteUsd).toBe(0.12)
})
