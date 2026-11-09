// Waits for /review-pr to finish with a PR, so the lane run that opened it can fix a send-back in
// the same session (next-item step 7.5 item 5). Since 2026-10-22 the lane dispatcher is off, so a
// send-back no longer starts a new lane run; the run that's still open does the fix instead.
//
//   node scripts/wait-review.mjs --pr 806                  # poll every 60 s, give up after 30 min
//   node scripts/wait-review.mjs --pr 806 --timeout-min 45 --interval-sec 90
//
// Reads only the PR (REST, no GraphQL, so it works through the cloud proxy) and prints one JSON
// line, then exits 0: {"pr": 806, "outcome": "<outcome>"}. The outcome comes from the labels
// /review-pr sets, never from review text:
//   merged             it merged (auto-merge after the review, or the owner)
//   auto-merge         review:auto-merge (tier 1 or 2 passed, #1020): GitHub merges it once CI is
//                      green and the review routine posts the close-out; the lane is done
//   changes-requested  review:changes-requested (round 1 send-back): fix it now, next-item step 2e
//   approved           review:approved (passed, but main moved): merge main in, step 2e item 3
//   owner              review:owner-approval (tier 3), or review:requested gone with no other
//                      review label (round 2 asked the owner): nothing more for the lane to do
//   closed             closed without merging
//   timeout            still review:requested at the deadline; a later run picks it up
// Exits 1 after 5 failed reads in a row, 2 on bad arguments.
import { execFileSync } from 'node:child_process'
import { delimiter } from 'node:path'
import { fileURLToPath } from 'node:url'

function runGh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: `${process.env.PATH}${delimiter}C:\\Program Files\\GitHub CLI` },
  })
}

// The outcome for a PR as `GET /pulls/<P>` returns it, or null while the review is still going.
export function reviewOutcome(pull) {
  if (pull.merged || pull.merged_at) return 'merged'
  if (pull.state === 'closed') return 'closed'
  const labels = new Set((pull.labels ?? []).map((l) => l.name))
  if (labels.has('review:changes-requested')) return 'changes-requested'
  if (labels.has('review:approved')) return 'approved'
  if (labels.has('review:auto-merge')) return 'auto-merge'
  if (labels.has('review:owner-approval')) return 'owner'
  if (labels.has('review:requested')) return null
  return 'owner'
}

export async function waitForReview({ pr, timeoutMs, intervalMs, gh = runGh, sleep, now = Date.now }) {
  const deadline = now() + timeoutMs
  let failures = 0
  for (;;) {
    try {
      const pull = JSON.parse(gh(['api', `repos/{owner}/{repo}/pulls/${pr}`]))
      failures = 0
      const outcome = reviewOutcome(pull)
      if (outcome) return outcome
    } catch (error) {
      failures++
      console.error(`wait-review: read failed (${failures}/5): ${error.stderr ?? error.message}`)
      if (failures >= 5) throw error
    }
    if (now() >= deadline) return 'timeout'
    await sleep(intervalMs)
  }
}

function numberArg(flag, fallback) {
  const at = process.argv.indexOf(flag)
  if (at === -1) return fallback
  const value = process.argv[at + 1]
  if (!/^\d+$/.test(value ?? '')) {
    console.error(`wait-review: ${flag} takes a number`)
    process.exit(2)
  }
  return Number(value)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pr = numberArg('--pr', null)
  if (!pr) {
    console.error('wait-review: pass --pr <N>')
    process.exit(2)
  }
  try {
    const outcome = await waitForReview({
      pr,
      timeoutMs: numberArg('--timeout-min', 30) * 60_000,
      intervalMs: numberArg('--interval-sec', 60) * 1000,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    })
    console.log(JSON.stringify({ pr, outcome }))
  } catch {
    process.exit(1)
  }
}
