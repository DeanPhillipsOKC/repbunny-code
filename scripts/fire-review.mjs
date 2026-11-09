// Issue #374: starts the "Review (Opus)" routine (/review-pr), which reviews every lane PR before
// it merges (#680: tiers from scripts/review-risk.mjs). next-item fires it from a cloud session after labeling the PR
// `review:requested`; dean-replied.yml fires it when the owner answers a review question
// (issue labeled `review:asked-owner`) or replies on a sprint review issue (#607). See docs/backlog-runner.md > Review.
//
//   node scripts/fire-review.mjs --pr 412        # "Review PR #412"
//   node scripts/fire-review.mjs --pr 412 --tier 1   # the lighter routine, when it's set up
//   node scripts/fire-review.mjs --reply 374     # "The owner replied on issue #374"
//   node scripts/fire-review.mjs --merged 412    # "PR #412 was merged" (a tier 3 PR auto-merged on the owner's approval, #681)
//   node scripts/fire-review.mjs --pr 412 --dry-run
//
// Needs REVIEW_ROUTINE_ID and REVIEW_ROUTINE_TOKEN (the routine's API trigger): environment
// variables of the cloud environment for lane runs, repo secrets for dean-replied.yml. With either
// unset it prints why and exits 3, so a lane merges as before: that's the off switch. While
// AUTOMATION_PAUSED is `true` (#682), or with `--strict` (lane runs) when the pause state
// can't be read (#700), it fires nothing and exits 4: the caller must leave its PR
// open and not merge. A failed fire exits 1. The routine works from labels, not from this text, which only shows in its
// session for the owner.
//
// A tier 1 PR (#680) may go to a cheaper "Review (light)" routine, same /review-pr prompt on a
// smaller model: set REVIEW_LIGHT_ROUTINE_ID and REVIEW_LIGHT_ROUTINE_TOKEN. Without them, or for
// tier 2 and 3, it fires the Opus routine.
import { isPaused } from './automation-paused.mjs'

const env = process.env

function arg(flag) {
  const at = process.argv.indexOf(flag)
  if (at === -1) return null
  const value = process.argv[at + 1]
  if (!/^\d+$/.test(value ?? '')) {
    console.error(`fire-review: ${flag} takes a number`)
    process.exit(2)
  }
  return value
}

const pr = arg('--pr')
const reply = arg('--reply')
const merged = arg('--merged')
const tier = arg('--tier')
if ([pr, reply, merged].filter(Boolean).length !== 1) {
  console.error('fire-review: pass one of --pr <N>, --reply <N>, or --merged <N>')
  process.exit(2)
}
const text = pr
  ? `Review PR #${pr}${tier ? ` (tier ${tier})` : ''}`
  : merged
    ? `PR #${merged} was merged`
    : `The owner replied on issue #${reply}`
const light = tier === '1' && env.REVIEW_LIGHT_ROUTINE_ID && env.REVIEW_LIGHT_ROUTINE_TOKEN
const REVIEW_ROUTINE_ID = light ? env.REVIEW_LIGHT_ROUTINE_ID : env.REVIEW_ROUTINE_ID
const REVIEW_ROUTINE_TOKEN = light ? env.REVIEW_LIGHT_ROUTINE_TOKEN : env.REVIEW_ROUTINE_TOKEN

if (isPaused({ strict: process.argv.includes('--strict') })) {
  console.log('review: paused (AUTOMATION_PAUSED is true), nothing fired')
  process.exit(4)
}
if (!REVIEW_ROUTINE_ID || !REVIEW_ROUTINE_TOKEN) {
  console.log('review: REVIEW_ROUTINE_ID or REVIEW_ROUTINE_TOKEN isn\'t set (review off)')
  process.exit(3)
}
if (process.argv.includes('--dry-run')) {
  console.log(`review: would fire ${REVIEW_ROUTINE_ID} with "${text}"`)
  process.exit(0)
}

const res = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${REVIEW_ROUTINE_ID}/fire`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${REVIEW_ROUTINE_TOKEN}`,
    'anthropic-beta': 'experimental-cc-routine-2026-04-01',
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ text }),
})
const body = await res.text()
if (!res.ok) {
  console.error(`review: firing failed, HTTP ${res.status}: ${body.slice(0, 300)}`)
  process.exit(1)
}
console.log(`review: fired ${JSON.parse(body).claude_code_session_url}`)
