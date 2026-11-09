import { test, expect } from '@playwright/test'
import { TRAIL_LIMIT, actionTrail, clearActionTrail, recordAction, scrubLabel } from '../src/lib/actionTrail'
import { buildBugReport, buildNumber, deviceModel, osName, type LoggedError } from '../src/lib/bugReport'
import { logClientError, reportPrompt, resetReportPrompt, setErrorSink } from '../src/lib/errorLog'

// Issue #234's pieces that don't need a page: the trail, the once-per-session
// report offer, and the report's steps and device lines (same "no separate
// unit-test runner" reasoning as client-error-log-unit.spec.ts).

test.beforeEach(() => {
  clearActionTrail()
  resetReportPrompt()
  setErrorSink({ insert: async () => ({ error: null }), list: async () => ({ data: [], error: null }) })
})

test('a label keeps the words but never numbers or the user\'s own names', () => {
  const names = ['Bench Press', 'Push Day A']
  expect(scrubLabel('Add set', names)).toBe('Add set')
  expect(scrubLabel('  Delete   bench press  ', names)).toBe('Delete [name]')
  expect(scrubLabel('Start Push Day A', names)).toBe('Start [name]')
  expect(scrubLabel('8 reps × 225.5 lb', names)).toBe('# reps × # lb')
  expect(scrubLabel('Rest 1:30', names)).toBe('Rest #')
  expect(scrubLabel('x'.repeat(80), names)).toHaveLength(40)
})

test('the trail keeps the last 20 steps and skips a repeat', () => {
  for (let i = 0; i < TRAIL_LIMIT + 5; i++) recordAction(`Screen s${i}`)
  recordAction(`Screen s${TRAIL_LIMIT + 4}`)
  const trail = actionTrail()
  expect(trail).toHaveLength(TRAIL_LIMIT)
  expect(trail[0]).toBe('Screen s5')
  expect(trail.at(-1)).toBe(`Screen s${TRAIL_LIMIT + 4}`)
})

test('an error offers a report once per kind and message, with the trail', () => {
  recordAction('Screen home')
  recordAction('Tap "Add set"')
  logClientError({ kind: 'error', message: 'boom' })
  expect(reportPrompt.value?.message).toBe('boom')
  expect(reportPrompt.value?.context).toEqual({ trail: ['Screen home', 'Tap "Add set"'] })

  reportPrompt.value = null
  logClientError({ kind: 'error', message: 'boom' })
  expect(reportPrompt.value).toBeNull()
  logClientError({ kind: 'rejection', message: 'boom' })
  expect(reportPrompt.value?.kind).toBe('rejection')

  reportPrompt.value = null
  logClientError({ kind: 'request', message: 'TypeError: Failed to fetch', prompt: false })
  logClientError({ kind: 'error', message: 'ResizeObserver loop completed with undelivered notifications.' })
  expect(reportPrompt.value).toBeNull()
})

// Issue #938: the log is always on the device, so every entry keeps the trail
// beside its own context.
test('the on-device log stores the trail with each entry', async () => {
  const stored: unknown[] = []
  const sink = { insert: async (e: { context: unknown }) => (stored.push(e.context), { error: null }), list: async () => ({ data: [], error: null }) }
  recordAction('Tap "Finish"')

  setErrorSink(sink)
  logClientError({ kind: 'error', message: 'render', context: { vue: 'render' } })
  logClientError({ kind: 'error', message: 'device' })

  await expect.poll(() => stored.length).toBe(2)
  expect(stored[0]).toEqual({ vue: 'render', trail: ['Tap "Finish"'] })
  expect(stored[1]).toEqual({ trail: ['Tap "Finish"'] })
})

test('the report lists the steps and the device and app info', () => {
  const error: LoggedError = {
    id: 'p',
    occurred_at: '2026-10-09T18:42:00.000Z',
    kind: 'error',
    message: 'boom',
    stack: null,
    route: '/',
    context: { vue: 'render', trail: ['Screen home', 'Tap "Add set"'] },
    app_version: 'v812+abc1234',
    user_agent: null,
  }
  const report = buildBugReport({ description: '', errors: [error], appVersion: 'v812+abc1234' })
  expect(report).toContain('App version: v812+abc1234\nBuild: 812\nPlatform: ')
  expect(report).toMatch(/\nOS: .+\nDevice model: .+\nStorage: On this device\n/)
  expect(report).toContain('Context: {"vue":"render"}')
  expect(report).toContain('Steps before it:\n  1. Screen home\n  2. Tap "Add set"\n')

  expect(buildNumber('dev')).toBe('unknown')
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15'
  expect(osName(iphone)).toBe('iOS 17.5.1')
  expect(deviceModel(iphone)).toBe('iPhone')
  const pixel = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36'
  expect(osName(pixel)).toBe('Android 14')
  expect(deviceModel(pixel)).toBe('Pixel 8')
  expect(deviceModel('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36')).toBe('K')
  expect(osName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows')
})
