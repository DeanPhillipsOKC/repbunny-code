// Pure helpers for scripts/run-cost.mjs (#1051): how much of a run is its starting context and
// cache rewrites after an idle gap. Kept apart so the unit spec can import them without running
// the CLI.

export const GAP_MS = 5 * 60 * 1000

// turns: one transcript's deduped API turns in time order, each
//   { t (ms), model, input, write5m, write1h, read } (token counts from the usage block).
// prices: { [model]: [input, output, cache read] } in $ per million tokens.
// A rewrite is a turn that follows a gap of 5 minutes or more and writes more than half of its
// context to the cache (the cache expired and the whole context was written again).
export function contextStats(turns, prices = {}) {
  const ctx = (u) => u.input + u.write5m + u.write1h + u.read
  const startContext = turns.length ? ctx(turns[0]) : 0
  let rewrites = 0
  let rewriteTokens = 0
  let rewriteUsd = 0
  for (let i = 1; i < turns.length; i++) {
    const u = turns[i]
    const written = u.write5m + u.write1h
    if (u.t - turns[i - 1].t < GAP_MS) continue
    if (written * 2 <= ctx(u)) continue
    rewrites++
    rewriteTokens += written
    const p = prices[u.model]
    if (p) rewriteUsd += (u.write5m * p[0] * 1.25 + u.write1h * p[0] * 2) / 1e6
  }
  return { startContext, rewrites, rewriteTokens, rewriteUsd: +rewriteUsd.toFixed(2) }
}
