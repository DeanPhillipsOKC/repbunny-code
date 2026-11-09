import { test, expect } from '@playwright/test'
import { isPaused } from '../scripts/automation-paused.mjs'

// Issue #700: in a cloud session the proxy refuses the variables API, so the pause switch reads the
// `automation:paused` label on the automation-log issue instead, trusting it only when
// github-actions[bot] set it. No page needed (same reasoning as ask-dean-unit.spec.ts).

const BOT = 'github-actions[bot]'

class GhError extends Error {
  stderr: string
  constructor(stderr: string) {
    super(stderr)
    this.stderr = stderr
  }
}

const refused = () => new GhError('gh: Access to this GitHub Actions path is not permitted through this proxy. (HTTP 403)')

function label(event: 'labeled' | 'unlabeled', actor: string, name = 'automation:paused') {
  return { event, actor: { login: actor }, label: { name } }
}

// A stubbed gh: the variables API is refused, the log issue is #9, and its timeline is `events`.
function stubGh(events: unknown[] | Error, opts: { logIssue?: boolean } = {}) {
  return (args: string[]) => {
    const path = args[1]
    if (path.includes('actions/variables')) throw refused()
    if (path.includes('/timeline')) {
      if (events instanceof Error) throw events
      return JSON.stringify(events)
    }
    if (path.includes('labels=automation-log')) return opts.logIssue === false ? '' : '9'
    throw new Error(`unexpected gh call: ${args.join(' ')}`)
  }
}

test('labeled by the workflow bot: paused', () => {
  expect(isPaused({ gh: stubGh([label('labeled', BOT)]) })).toBe(true)
})

test('unlabeled by the workflow bot, or never labeled: not paused', () => {
  expect(isPaused({ gh: stubGh([label('labeled', BOT), label('unlabeled', BOT)]) })).toBe(false)
  expect(isPaused({ gh: stubGh([]) })).toBe(false)
  expect(isPaused({ gh: stubGh([label('labeled', BOT, 'something-else')]) })).toBe(false)
  expect(isPaused({ gh: stubGh([], { logIssue: false }) })).toBe(false)
})

test('removing the label by hand still reads as paused', () => {
  expect(isPaused({ gh: stubGh([label('labeled', BOT), label('unlabeled', 'DeanPhillipsOKC')]) })).toBe(true)
})

test('a change by any other actor counts as paused, even a hand-added label', () => {
  expect(isPaused({ gh: stubGh([label('labeled', 'DeanPhillipsOKC')]) })).toBe(true)
})

test('only the latest event for the label counts', () => {
  const events = [label('labeled', BOT), label('unlabeled', BOT), label('labeled', BOT)]
  expect(isPaused({ gh: stubGh(events) })).toBe(true)
})

test('neither source readable: strict runs fail closed, interactive ones fail open', () => {
  const gh = stubGh(new GhError('gh: HTTP 403'))
  expect(isPaused({ strict: true, gh })).toBe(true)
  expect(isPaused({ strict: false, gh })).toBe(false)
})

test('the AUTOMATION_PAUSED env var still wins when set', () => {
  process.env.AUTOMATION_PAUSED = 'true'
  try {
    expect(isPaused({ gh: stubGh([]) })).toBe(true)
  } finally {
    delete process.env.AUTOMATION_PAUSED
  }
})
