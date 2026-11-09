import { test, expect } from '@playwright/test'
import { reviewOutcome, waitForReview } from '../scripts/wait-review.mjs'

// A lane run waits for /review-pr on its own PR and fixes a send-back in the same session, since
// the lane dispatcher is off (2026-10-22). The outcome comes from the PR's labels and state only.
// No page needed (same reasoning as automation-paused-unit.spec.ts).

const pull = (labels: string[], extra: Record<string, unknown> = {}) => ({
  state: 'open',
  merged: false,
  labels: labels.map((name) => ({ name })),
  ...extra,
})

test('labels and state map to outcomes', () => {
  expect(reviewOutcome(pull(['review:requested']))).toBeNull()
  expect(reviewOutcome(pull(['review:changes-requested']))).toBe('changes-requested')
  expect(reviewOutcome(pull(['review:approved']))).toBe('approved')
  expect(reviewOutcome(pull(['review:auto-merge']))).toBe('auto-merge')
  expect(reviewOutcome(pull(['review:owner-approval']))).toBe('owner')
  expect(reviewOutcome(pull([]))).toBe('owner')
  expect(reviewOutcome(pull([], { state: 'closed', merged: true }))).toBe('merged')
  expect(reviewOutcome(pull(['review:requested'], { state: 'closed' }))).toBe('closed')
})

// A fake clock: each sleep moves time forward instead of waiting.
function clock() {
  let t = 0
  return { now: () => t, sleep: async (ms: number) => { t += ms } }
}

test('polls until the review settles', async () => {
  const replies = [['review:requested'], ['review:requested'], ['review:changes-requested']]
  const gh = () => JSON.stringify(pull(replies.shift()!))
  const outcome = await waitForReview({ pr: 1, timeoutMs: 600_000, intervalMs: 60_000, gh, ...clock() })
  expect(outcome).toBe('changes-requested')
  expect(replies).toHaveLength(0)
})

test('gives up at the deadline', async () => {
  const gh = () => JSON.stringify(pull(['review:requested']))
  expect(await waitForReview({ pr: 1, timeoutMs: 180_000, intervalMs: 60_000, gh, ...clock() })).toBe('timeout')
})

test('rides out a few failed reads, then fails after five in a row', async () => {
  let calls = 0
  const flaky = () => {
    if (++calls < 3) throw new Error('HTTP 502')
    return JSON.stringify(pull([], { merged: true }))
  }
  expect(await waitForReview({ pr: 1, timeoutMs: 600_000, intervalMs: 60_000, gh: flaky, ...clock() })).toBe('merged')
  const broken = () => { throw new Error('HTTP 502') }
  await expect(waitForReview({ pr: 1, timeoutMs: 600_000, intervalMs: 60_000, gh: broken, ...clock() })).rejects.toThrow('502')
})
