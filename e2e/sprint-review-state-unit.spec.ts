import { test, expect } from '@playwright/test'
import { emailCard, issueBody } from '../scripts/demo-video/review/review-issue.mjs'
import { acceptRest, readActions, readSeen, ready, refreshBody, statusText, writeActions, writeSeen } from '../scripts/demo-video/review/review-state.mjs'

// #664: one free-form comment reviews the whole release. The issue shows a read-only Outcome
// list, "looks good" accepts everything not settled, a settled review closes, and a closed review
// never reads as waiting. No page needed.

const release = {
  version: '1.4.0',
  bump: 'minor',
  tag: 'store/v1.3.0',
  upNext: [],
  changes: [
    { issue: 535, title: 'PDF export', notes: ['Export your log as a PDF.'], clip: true },
    { issue: 536, title: 'Calendar guide', notes: ['A new guide <b>for</b> the calendar.'], clip: false, reason: 'native-only' },
    { issue: 547, title: 'Rest tweak', notes: ['Rest timer tweak.'], clip: false, trivial: true },
  ],
}
const video = { duration: 66, clips: [{ issue: 535, at: 5 }] }
const body = issueBody(release, video, '[sprint-review.mp4](https://x/v.mp4)', 'run')
const shipped = new Set<number>()
const isClosed = (n?: number) => (n ? shipped.has(n) : false)
const issues = [535, 536, 547]

test('issue body has a read-only Outcome list and the one-comment reply', () => {
  expect(body).toContain('## Outcome')
  expect(body).not.toContain('## Verdicts')
  expect(body).not.toMatch(/- \[[ x]\]/)
  expect(body).toContain('- #535 PDF export: waiting on your review')
  expect(body).toContain("Comment once: say it looks good, or say what you don't like. Anything you don't mention counts as good.")
  expect(body).toContain('`#N ...` lines still work')
  // The marker carries titles and notes for the reply routine, and a note can't end the comment.
  const mark = JSON.parse(body.match(/<!-- sprint-review: (\{.*?\}) -->/)![1])
  expect(mark.issues).toEqual(issues)
  expect(mark.changes[1]).toEqual({ issue: 536, title: 'Calendar guide', note: 'A new guide <b>for</b> the calendar.' })
  expect(body.split('\n').find((l) => l.startsWith('<!-- sprint-review: '))).not.toContain('<b>')
})

test('email card gives the same one-line instruction', () => {
  expect(emailCard(release, 'https://x/662', 'https://x/v.mp4')).toContain("Comment once: say it looks good, or say what you don't like. Anything you don't mention counts as good.")
})

test('accepting everything unsettled is ready to release, and a second run changes nothing', () => {
  const asked = writeActions(body, { 536: { v: 'change', said: 'hard to find', f: 601 } })
  const first = acceptRest(issues, readActions(asked), 'looks good')
  expect(Object.keys(first)).toEqual(['535', '547'])
  const actions = { ...readActions(asked), ...first }
  expect(acceptRest(issues, actions, 'looks good')).toEqual({})
  expect(ready(issues, actions, isClosed)).toBe(false)
  const refreshed = refreshBody(writeActions(asked, actions), '1.4.0', isClosed)
  expect(refreshed).toContain('**Status:** v1.4.0 candidate (minor): 2 accepted, 1 change requested (#601). Release after #601 ships.')
  expect(refreshed).toContain('- #535 PDF export: accepted')
  expect(refreshed).toContain('- #536 Calendar guide: change filed as #601')
  shipped.add(601)
  expect(ready(issues, actions, isClosed)).toBe(true)
  const done = refreshBody(refreshed, '1.4.0', isClosed)
  expect(done).toContain('Ready to release.')
  expect(done).toContain('- #536 Calendar guide: change filed as #601, shipped')
  // Refreshing again keeps one outcome per line.
  expect(refreshBody(done, '1.4.0', isClosed)).toBe(done)
  shipped.clear()
})

test('a change with a question out stays waiting after looks good', () => {
  const actions = { 547: { v: 'asked', said: 'hmm' } }
  expect(Object.keys(acceptRest(issues, actions, 'looks good'))).toEqual(['535', '536'])
  expect(ready(issues, { ...actions, ...acceptRest(issues, actions, 'ok') }, isClosed)).toBe(false)
})

test('an old Verdicts checklist becomes the Outcome list', () => {
  const old = '**Status:** v1.4.0 candidate (minor), 1 change. Waiting on your review.\n\n## Verdicts\n\n- [x] #535 PDF export · accepted\n\n## Up next\n\n- #540 Thing\n\n<!-- sprint-review: {"version":"1.4.0","issues":[535]} -->'
  const out = refreshBody(writeActions(old, { 535: { v: 'accepted', said: 'good' } }), '1.4.0', isClosed)
  expect(out).toContain('## Outcome\n\n- #535 PDF export: accepted')
  expect(out).toContain('- #540 Thing')
  expect(out).toContain('Ready to release.')
})

test('read comments are kept in the body', () => {
  const seen = writeSeen(writeSeen(body, { 11: 'held' }), { 11: 'read', 12: 'read' })
  expect(readSeen(seen)).toEqual({ 11: 'read', 12: 'read' })
  expect(seen.match(/sprint-review-read/g)).toHaveLength(1)
})

test('status line for a closed review never says waiting', () => {
  const url = 'https://x/662'
  const all = { 535: { v: 'accepted' }, 536: { v: 'accepted' }, 547: { v: 'accepted' } }
  expect(statusText({ url, state: 'closed' }, issues, all, isClosed)).toBe(`Sprint review: ${url} (closed, ready to release)`)
  const some = { 535: { v: 'accepted' }, 536: { v: 'asked' } }
  expect(statusText({ url, state: 'closed' }, issues, some, isClosed)).toBe(`Sprint review: ${url} (closed by you, 2 not reviewed)`)
  expect(statusText({ url, state: 'closed' }, issues, {}, isClosed)).toBe(`Sprint review: ${url} (closed by you, 3 not reviewed)`)
  expect(statusText({ url, state: 'open' }, issues, some, isClosed)).toContain('Waiting on your review.')
})
