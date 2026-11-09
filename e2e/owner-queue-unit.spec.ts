import { test, expect } from '@playwright/test'
import { buildQueue, fixedIssues, questionText, renderQueue, summaryLine } from '../scripts/owner-queue.mjs'

// Issue #904: the owner queue a live session shows with /waiting, and the count line the session
// start hook prints. No page needed (same reasoning as ask-dean-unit.spec.ts).

const TODAY = '2026-11-02'
const item = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `Item ${number}`,
  url: `https://github.com/o/r/issues/${number}`,
  labels: [] as string[],
  ...extra,
})
const human = (number: number, extra: Record<string, unknown> = {}) =>
  item(number, {
    body: '1. Do the thing',
    updatedAt: '2026-11-01T12:00:00Z',
    labels: ['human', 'effort:2', 'value:5'],
    openBlockers: 0,
    lastComment: '',
    blocking: [],
    ...extra,
  })
const empty = { approvals: [], questions: [], sprintReviews: [], qaBatches: [], redPrs: [], needsReview: [], human: [] }

test('a PR body names the issues it fixes', () => {
  expect(fixedIssues('Rework the step (#886)\n\nFixes #886, closes #12. Resolved #3')).toEqual([886, 12, 3])
  expect(fixedIssues('See #4')).toEqual([])
  expect(fixedIssues('Issue: #925')).toEqual([925])
})

test('merged changes to try say which phone they need (owner check)', () => {
  const q = buildQueue(
    {
      ...empty,
      toVerify: [
        item(1, { labels: ['status:verify'] }),
        item(2, { labels: ['status:verify', 'verify:iphone'] }),
        item(3, { labels: ['verify:iphone'] }),
      ],
    },
    TODAY,
  )
  expect(summaryLine(q)).toContain('3 changes to try')
  const md = renderQueue(q, null)
  expect(md).toContain('### Changes to try')
  const lines = md.split('\n')
  expect(lines.find((l) => l.includes('[#1]'))).toMatch(/: try it on Android \(Dev build\)$/)
  expect(lines.find((l) => l.includes('[#2]'))).toContain('then on iPhone in the next TestFlight build')
  expect(lines.find((l) => l.includes('[#3]'))).toMatch(/: try it on iPhone in the next TestFlight build$/)
})

test("a question's first line, without HTML comments or Markdown", () => {
  expect(questionText('<!-- ask-dean -->\n**Should** the [tile](https://x) be bigger?\n\nA) yes')).toBe('Should the tile be bigger?')
  expect(questionText('')).toBeNull()
  expect(questionText('word '.repeat(60))!.length).toBeLessThanOrEqual(200)
})

test('an item shows once, and a question on an issue a waiting PR fixes folds into the PR', () => {
  const q = buildQueue(
    {
      ...empty,
      approvals: [item(890, { fixes: [886] })],
      questions: [item(886), item(700)],
      qaBatches: [item(33)],
      needsReview: [item(5, { labels: ['value:2'] }), item(6, { labels: ['value:8'] })],
      human: [human(33), human(40)],
    },
    TODAY,
  )
  expect(q.approvals.map((i) => i.number)).toEqual([890])
  expect(q.questions.map((i) => i.number)).toEqual([700])
  expect(q.prioritize.map((i) => i.number)).toEqual([6, 5])
  expect(q.human.total).toBe(1)
  expect(q.human.top.map((i) => i.number)).toEqual([40])
})

test('the summary line counts each kind, or says nothing is waiting', () => {
  const q = buildQueue({ ...empty, approvals: [item(1)], questions: [item(2), item(3)], human: [human(4)] }, TODAY)
  expect(summaryLine(q)).toContain('1 PR to approve, 2 questions, 1 owner task.')
  expect(summaryLine(q)).toContain('lane and review runs ignore this')
  expect(summaryLine(buildQueue(empty, TODAY))).toContain('nothing is waiting for the owner.')
})

test('the full list shows the sections, the overflow, and the automation lines', () => {
  const q = buildQueue(
    {
      ...empty,
      questions: [item(2, { question: 'A or B?' })],
      needsReview: [1, 2, 3, 4, 5, 6, 7].map((n) => item(100 + n)),
    },
    TODAY,
  )
  const md = renderQueue(q, { paused: false, dispatched: 3, minutes: { used: 1600, monthly: 3000, pace: 1500, level: 'half' } })
  expect(md).toContain('### Questions from the agents')
  expect(md).toContain('[#2](https://github.com/o/r/issues/2) Item 2: A or B?')
  expect(md).toContain('- and 2 more issues labeled `status:needs-review`')
  expect(md).toContain('- Pause switch: off')
  expect(md).toContain('about 1,600 of 3,000 (an even pace allows 1,500 by today); the guard allows half the daily cap')
  expect(renderQueue(buildQueue(empty, TODAY), null)).toBe('Nothing is waiting for you.')
})
