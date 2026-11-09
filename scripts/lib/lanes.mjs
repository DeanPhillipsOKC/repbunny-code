// Issue #706: the backlog lane and model rules (docs/backlog-runner.md > Backlog lanes), shared by
// scripts/next-issue.mjs and scripts/delivery-metrics.mjs so the two can't drift apart.

export const LANES = ['ux', 'features', 'bugs', 'tech']
export const MODELS = ['opus', 'sonnet']

// A `lane:` label pins the lane; otherwise the kind labels decide.
export function laneOf(labels) {
  const pinned = labels.find((l) => l.startsWith('lane:'))?.slice('lane:'.length)
  if (LANES.includes(pinned)) return pinned
  if (labels.includes('ux-intensive')) return 'ux'
  if (labels.includes('bug')) return 'bugs'
  if (labels.includes('feature')) return 'features'
  return 'tech'
}

// The model that works an issue: a `model:` label pins it; ux is always opus; the rest are sonnet
// below effort 5 and opus at 5 or more.
export function modelOf(labels, lane, effort) {
  const pinned = labels.find((l) => l.startsWith('model:'))?.slice('model:'.length)
  if (MODELS.includes(pinned)) return pinned
  if (lane === 'ux') return 'opus'
  return (effort ?? 0) >= 5 ? 'opus' : 'sonnet'
}
