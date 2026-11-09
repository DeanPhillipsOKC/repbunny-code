import { test, expect } from '@playwright/test'
import { openSqlJsDb } from './fixtures/sqljs'
import { createSqliteRepos } from '../src/data/sqlite/repos'
import { buildBugReport, formatErrorTime, mailtoBody, mailtoLink, nativeBugReportEmail, screenName, trimForMailto, type LoggedError } from '../src/lib/bugReport'

// Issue #84's report pieces that don't need a page (same "no separate
// unit-test runner" reasoning as client-error-log-unit.spec.ts).

function logged(occurredAt: string, message: string): LoggedError {
  return {
    id: 'a',
    occurred_at: occurredAt,
    kind: 'request',
    message,
    stack: 'Error: x\n    at y',
    route: '/progress',
    context: { operation: 'workouts.insertSet', code: 'XX000' },
    app_version: '1.2.3',
    user_agent: null,
  }
}

test('the report has the description, version, and each picked error in full', () => {
  const report = buildBugReport({
    description: '  Sets vanished  ',
    errors: [logged('2026-10-02T18:42:00.000Z', 'insert failed')],
    appVersion: '1.2.3',
    now: new Date('2026-10-02T19:00:00.000Z'),
  })
  expect(report).toContain('What happened:\nSets vanished\n')
  expect(report).toContain('App version: 1.2.3')
  expect(report).toContain('Errors (1):')
  expect(report).toContain('1. 2026-10-02T18:42:00.000Z (request)')
  expect(report).toContain('Screen: /progress')
  expect(report).toContain('Message: insert failed')
  expect(report).toContain('Context: {"operation":"workouts.insertSet","code":"XX000"}')
  expect(report).toContain('Stack:\nError: x\n    at y')
  expect(report).not.toContain('App version then')
  expect(report.startsWith("RepBunny bug report\n\nEmail me when it's fixed: no\n\nWhat happened:")).toBe(true)

  const empty = buildBugReport({ description: '', errors: [], appVersion: null })
  expect(empty).toContain('(no description)')
  expect(empty).toContain('Errors: none included')
})

test('a long report drops stacks first, then is trimmed to fit a mailto link', () => {
  const short = 'short report'
  expect(trimForMailto(short)).toBe(short)

  const long = 'é line of a long report\n'.repeat(500)
  const trimmed = trimForMailto(long, 1800)
  expect(encodeURIComponent(trimmed).length).toBeLessThanOrEqual(1800)
  expect(trimmed).toContain('[Trimmed to fit in an email link.')
  expect(long.startsWith(trimmed.split('\n\n[Trimmed')[0])).toBe(true)

  // Stacks too big for the link go, but every error's message stays.
  const errors = [1, 2, 3].map((n) => ({ ...logged('2026-10-02T18:42:00.000Z', `boom ${n}`), stack: 'at x\n'.repeat(400) }))
  const input = { description: 'it broke', errors, appVersion: '1.2.3' }
  const body = mailtoBody(input)
  expect(body).not.toContain('Stack:')
  expect(body).not.toContain('[Trimmed')
  for (const n of [1, 2, 3]) expect(body).toContain(`Message: boom ${n}`)

  const small = { description: 'it broke', errors: [logged('2026-10-02T18:42:00.000Z', 'boom')], appVersion: '1.2.3' }
  expect(mailtoBody(small)).toContain('Stack:')
  expect(mailtoLink(small).startsWith('mailto:hello@repbunny.app?subject=RepBunny%20bug%20report&body=')).toBe(true)
})

test('error rows read as a relative day and a screen name', () => {
  const now = new Date(2026, 9, 2, 20, 0)
  expect(formatErrorTime(new Date(2026, 9, 2, 18, 42).toISOString(), now)).toMatch(/^Today 6:42\sPM$/)
  expect(formatErrorTime(new Date(2026, 9, 1, 9, 5).toISOString(), now)).toMatch(/^Yesterday 9:05\sAM$/)
  expect(formatErrorTime(new Date(2026, 8, 28, 9, 5).toISOString(), now)).toMatch(/^Sep 28, 9:05\sAM$/)

  expect(screenName('/')).toBe('Home')
  expect(screenName('/progress/workouts?x=1')).toBe('Progress')
  expect(screenName('/exercise-check')).toBe('Exercise check')
  expect(screenName(null)).toBe('Unknown screen')
})

test('clearing the on-device log empties it', async () => {
  const db = await openSqlJsDb()
  const repos = createSqliteRepos(async () => db)
  await repos.clientErrors.insert(logged('2026-10-02T18:42:00.000Z', 'boom'))
  expect((await repos.clientErrors.list()).data).toHaveLength(1)
  expect((await repos.clientErrors.clear()).error).toBeNull()
  expect((await repos.clientErrors.list()).data).toHaveLength(0)
})

test("the follow-up answer is in the report and survives a trimmed mailto body", () => {
  const input = { description: 'it broke', errors: [], appVersion: '1.2.3' }
  expect(buildBugReport(input)).toContain("Email me when it's fixed: no")
  expect(buildBugReport({ ...input, followUp: true })).toContain("Email me when it's fixed: yes")

  const long = { ...input, followUp: true, description: 'x '.repeat(10000) }
  const body = mailtoBody(long, 1800)
  expect(body).toContain('[Trimmed')
  expect(body).toContain("Email me when it's fixed: yes")
})

test('a native report with no errors picked is the email body with no attachment', () => {
  const none = nativeBugReportEmail({ description: 'Button is stuck', errors: [], appVersion: '1.2.3' })
  expect(none.attachment).toBeUndefined()
  expect(none.body).toContain('Button is stuck')
  expect(none.body).toContain("Email me when it's fixed: no")
  expect(none.body).toContain('App version:')
  expect(none.body).not.toContain('is attached')

  const one = nativeBugReportEmail({ description: 'Broke', errors: [logged('2026-01-01T00:00:00Z', 'boom')], appVersion: '1.2.3' })
  expect(one.attachment?.name).toMatch(/^repbunny-bug-report-.*\.txt$/)
  expect(one.body).toContain('The full report with 1 error is attached.')
})
