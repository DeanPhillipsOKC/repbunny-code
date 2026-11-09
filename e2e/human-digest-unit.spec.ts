import { test, expect } from '@playwright/test'
import { digestEmail, digestSections, effortTime, firstStep, latestComment, onHoldUntil, STALE_DAYS } from '../scripts/human-digest.mjs'

// Issue #225's weekly digest of human issues. No page needed (same "no separate
// unit-test runner" reasoning as client-error-log-unit.spec.ts).

const TODAY = '2026-10-09'

function issue(number: number, extra: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    url: `https://github.com/o/r/issues/${number}`,
    body: '',
    updatedAt: '2026-10-08T12:00:00Z',
    labels: ['human', 'effort:2', 'value:3'],
    openBlockers: 0,
    lastComment: '',
    blocking: [] as { number: number; title: string; human: boolean }[],
    ...extra,
  }
}

test('effort labels read as rough time', () => {
  expect(effortTime(1)).toBe('About 15 min')
  expect(effortTime(3)).toBe('About an hour')
  expect(effortTime(13)).toBe('A day or more')
  expect(effortTime(null)).toBeNull()
})

test('the first step is the first numbered item, then a bullet, then prose', () => {
  expect(firstStep('## Steps\nIntro line.\n1. Open **Play Console** > [Settings](https://x).\n2. Next')).toBe(
    'Open Play Console > Settings.',
  )
  expect(firstStep('## Do\n- [ ] Claim `@repbunny`\n- Later')).toBe('Claim @repbunny')
  expect(firstStep('## Why\nJust sign the agreement.')).toBe('Just sign the agreement.')
  expect(firstStep('')).toBeNull()
  const long = firstStep(`1. ${'word '.repeat(60)}`)!
  expect(long.length).toBeLessThanOrEqual(160)
  expect(long.endsWith('…')).toBe(true)
})

test('an on-hold comment counts only while its date is in the future', () => {
  const note = "2026-10-09: on hold. The owner can't install on an iPhone until about 2026-10-16."
  expect(onHoldUntil(note, TODAY)).toBe('2026-10-16')
  expect(onHoldUntil(note, '2026-10-16')).toBeNull()
  expect(onHoldUntil('Waiting until 2026-12-01 for Apple.', TODAY)).toBeNull()
  expect(onHoldUntil('', TODAY)).toBeNull()
})

test('a calendar sync record after an on-hold comment keeps the issue on hold', () => {
  const hold = 'On hold until 2026-10-29: waiting on Apple.'
  const records = ['<!-- calendar-synced: ev1 2026-10-29 -->\nCalendar: on the calendar.', '<!-- calendar-removed: ev0 -->\nCalendar: removed.']
  expect(latestComment(['Earlier note.', hold, ...records])).toBe(hold)
  expect(latestComment([hold, 'Back on it now.'])).toBe('Back on it now.')
  expect(latestComment(records)).toBe('')
  expect(latestComment([])).toBe('')
  const s = digestSections([issue(1, { lastComment: latestComment([hold, records[0]]) })], TODAY)!
  expect(s.onHold.map((i) => i.number)).toEqual([1])
})

test('top picks rank by ROI, skip blocked and on-hold issues, and cap at three', () => {
  const s = digestSections(
    [
      issue(1, { labels: ['human', 'effort:1', 'value:3'] }),
      issue(2, { labels: ['human', 'effort:1', 'value:5'] }),
      issue(3, { labels: ['human', 'effort:1', 'value:8'], openBlockers: 1 }),
      issue(4, { labels: ['human', 'effort:1', 'value:8', 'status:blocked'] }),
      issue(5, { labels: ['human', 'effort:1', 'value:8'], lastComment: 'On hold until 2026-11-01.' }),
      issue(6, { labels: ['human'] }),
      issue(7, { labels: ['human', 'effort:2', 'value:2'] }),
      issue(8, { labels: ['human', 'effort:5', 'value:1'] }),
    ],
    TODAY,
  )!
  expect(s.total).toBe(8)
  expect(s.top.map((i) => i.number)).toEqual([2, 1, 7])
  expect(s.onHold.map((i) => [i.number, i.until])).toEqual([[5, '2026-11-01']])
})

test('stale issues are the oldest past the threshold, and unblocks name only AI issues', () => {
  const daysAgo = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86400000).toISOString()
  const s = digestSections(
    [
      issue(1, { updatedAt: daysAgo(STALE_DAYS) }),
      issue(2, { updatedAt: daysAgo(STALE_DAYS - 1) }),
      issue(3, { updatedAt: daysAgo(40) }),
      issue(4, { blocking: [{ number: 9, title: 'Human follow-up', human: true }] }),
      issue(5, {
        blocking: [
          { number: 10, title: 'AI work', human: false },
          { number: 11, title: 'Human work', human: true },
        ],
      }),
    ],
    TODAY,
  )!
  expect(s.stale.map((i) => [i.number, i.days])).toEqual([
    [3, 40],
    [1, STALE_DAYS],
  ])
  expect(s.unblocks.map((i) => [i.number, i.frees.map((b) => b.number)])).toEqual([[5, [10]]])
})

test('the email sends nothing without human issues and escapes titles', () => {
  expect(digestEmail([], TODAY)).toBeNull()
  const one = digestEmail([issue(1, { title: 'Sign <the> agreement & pay', body: '1. Open the console' })], TODAY)!
  expect(one.subject).toBe('RepBunny: 1 issue needs you this week')
  expect(one.html).toContain('#1 Sign &lt;the&gt; agreement &amp; pay')
  expect(one.html).toContain('First step: Open the console')
  expect(one.html).not.toContain('Getting stale')
  const two = digestEmail([issue(1), issue(2, { lastComment: 'On hold until 2026-10-20' })], TODAY)!
  expect(two.subject).toBe('RepBunny: 2 issues need you this week')
  expect(two.html).toContain('Until 2026-10-20')
})
