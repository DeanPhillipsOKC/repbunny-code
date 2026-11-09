import { test, expect } from '@playwright/test'
import {
  EMPTY_TRIAL_STATE,
  activeTrial,
  canStartTrial,
  endedTrialToNote,
  grantPasses,
  mergeTrialStates,
  noteTrialEnded,
  parseTrialState,
  setupTrialUsed,
  startSetupTrial,
  startTrial,
  unusedPasses,
  type TrialState,
} from '../src/lib/trialPass'
import { introMessage, tierById, tierRewardLabel } from '../src/lib/milestones'

// Issue #155's trial pass rules, same "no separate unit-test runner" reasoning
// as milestones-unit.spec.ts: these never touch `page`.

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date(2026, 9, 5, 12).getTime()

function withPasses(...tierIds: string[]): TrialState {
  return grantPasses(EMPTY_TRIAL_STATE, tierIds).state
}

test('only the pass tiers grant, each once', () => {
  const first = grantPasses(EMPTY_TRIAL_STATE, ['workouts-1', 'workouts-10', 'records-10', 'strongWeeks-12'])
  expect(first.added).toBe(2)
  expect(first.state.granted).toEqual(['workouts-10', 'strongWeeks-12'])
  const again = grantPasses(first.state, ['workouts-10', 'workouts-50'])
  expect(again.added).toBe(1)
  expect(unusedPasses(again.state)).toBe(3)
})

test('a pass runs 7 days, counting part of a day as a day', () => {
  const state = startTrial(withPasses('workouts-10'), 'themes', T0)
  expect(activeTrial(state, T0)).toMatchObject({ feature: 'themes', daysLeft: 7 })
  expect(activeTrial(state, T0 + 3.5 * DAY)?.daysLeft).toBe(4)
  expect(activeTrial(state, T0 + 7 * DAY - 1)?.daysLeft).toBe(1)
  expect(activeTrial(state, T0 + 7 * DAY)).toBeNull()
  expect(unusedPasses(state)).toBe(0)
})

test('one pass at a time; unused passes wait their turn', () => {
  let state = withPasses('workouts-10', 'workouts-50')
  state = startTrial(state, 'themes', T0)
  expect(canStartTrial(state, T0 + DAY)).toBe(false)
  // Starting while one runs does nothing.
  expect(startTrial(state, 'reports', T0 + DAY)).toBe(state)
  expect(unusedPasses(state)).toBe(1)

  state = startTrial(state, 'reports', T0 + 8 * DAY)
  expect(activeTrial(state, T0 + 8 * DAY)?.feature).toBe('reports')
  expect(unusedPasses(state)).toBe(0)
  expect(canStartTrial(state, T0 + 20 * DAY)).toBe(false)
})

test('no pass, no trial', () => {
  expect(canStartTrial(EMPTY_TRIAL_STATE, T0)).toBe(false)
  expect(startTrial(EMPTY_TRIAL_STATE, 'themes', T0)).toBe(EMPTY_TRIAL_STATE)
})

test('the end note is due once, after the trial ends', () => {
  let state = startTrial(withPasses('workouts-10', 'workouts-50'), 'themes', T0)
  expect(endedTrialToNote(state, T0 + 6 * DAY)).toBeNull()
  expect(endedTrialToNote(state, T0 + 7 * DAY)).toBe('themes')
  state = noteTrialEnded(state)
  expect(endedTrialToNote(state, T0 + 30 * DAY)).toBeNull()

  // Starting the next pass before the note was seen skips the old note.
  let skipped = startTrial(withPasses('workouts-10', 'workouts-50'), 'themes', T0)
  skipped = startTrial(skipped, 'progress', T0 + 9 * DAY)
  expect(endedTrialToNote(skipped, T0 + 10 * DAY)).toBeNull()
  expect(endedTrialToNote(skipped, T0 + 16 * DAY)).toBe('progress')
})

test('a restore only adds: passes and trials from both sides', () => {
  const device = startTrial(withPasses('workouts-10'), 'themes', T0)
  const file = startTrial(withPasses('workouts-10', 'workouts-50'), 'reports', T0 - 20 * DAY)
  const merged = mergeTrialStates(device, noteTrialEnded(file))
  expect(merged.granted).toEqual(['workouts-10', 'workouts-50'])
  expect(merged.trials.map((t) => t.feature)).toEqual(['reports', 'themes'])
  expect(activeTrial(merged, T0 + DAY)?.feature).toBe('themes')
  expect(unusedPasses(merged)).toBe(0)
  // Merging the same file twice adds nothing.
  expect(mergeTrialStates(merged, file)).toEqual(merged)
})

test('a stored state that is broken or hand-edited is cleaned, not trusted', () => {
  expect(parseTrialState(null)).toEqual(EMPTY_TRIAL_STATE)
  expect(parseTrialState('nope')).toEqual(EMPTY_TRIAL_STATE)
  expect(
    parseTrialState({
      granted: ['workouts-10', 'workouts-10', 'records-1', 7],
      trials: [{ feature: 'themes', startedAt: new Date(T0).toISOString() }, { feature: 'templates', startedAt: 'x' }, null],
      endNoted: 9,
    }),
  ).toEqual({ granted: ['workouts-10'], trials: [{ feature: 'themes', startedAt: new Date(T0).toISOString() }], endNoted: 1 })
})

// #1002: finishing setup on a Premium theme starts one Themes trial, with no
// pass, once per device.
test('the setup trial uses no pass, runs 7 days, and starts only once', () => {
  const passes = withPasses('workouts-10')
  const started = startSetupTrial(passes, 'halloween', T0)
  expect(started.trials).toEqual([{ feature: 'themes', startedAt: new Date(T0).toISOString(), setup: true, theme: 'halloween' }])
  expect(setupTrialUsed(started)).toBe(true)
  expect(unusedPasses(started)).toBe(1)
  expect(activeTrial(started, T0 + 6 * DAY)?.feature).toBe('themes')
  expect(endedTrialToNote(started, T0 + 7 * DAY)).toBe('themes')
  // Never again, even after it ended.
  const ended = noteTrialEnded(started)
  expect(startSetupTrial(ended, 'christmas', T0 + 20 * DAY)).toBe(ended)
  // The milestone pass still works afterwards.
  expect(canStartTrial(ended, T0 + 20 * DAY)).toBe(true)
  // Not while another trial runs.
  const running = startTrial(passes, 'progress', T0)
  expect(startSetupTrial(running, 'halloween', T0 + DAY)).toBe(running)
  // It survives a save and a restore.
  expect(parseTrialState(JSON.parse(JSON.stringify(started)))).toEqual(started)
  expect(mergeTrialStates(EMPTY_TRIAL_STATE, started).trials).toEqual(started.trials)
  // A setup mark on another feature is dropped as hand-edited.
  const odd = parseTrialState({ trials: [{ feature: 'progress', startedAt: new Date(T0).toISOString(), setup: true, theme: 'x' }] })
  expect(odd.trials).toEqual([{ feature: 'progress', startedAt: new Date(T0).toISOString() }])
})

test('pass tiers name the pass only for free users', () => {
  const oneFifty = tierById('workouts-150')!
  expect(tierRewardLabel(oneFifty, false)).toBe('a 7-day Premium trial')
  expect(tierRewardLabel(oneFifty, true)).toBeNull()
  // #184/#190: workouts-10 also carries a chime. Premium earns the chime, a
  // free user the pass, never both.
  const ten = tierById('workouts-10')!
  expect(tierRewardLabel(ten, false)).toBe('a 7-day Premium trial')
  expect(tierRewardLabel(ten, true)).toBe('Cartoon boing rest chime')
  // A tier with neither a pass nor an Extras reward (#154).
  expect(tierRewardLabel(tierById('records-100')!, false)).toBeNull()
  expect(tierRewardLabel(tierById('records-100')!, true)).toBeNull()
  // A free user's history counts milestones and passes, not Extras (#190).
  expect(introMessage(31, ['workouts-1', 'workouts-5', 'workouts-10', 'workouts-25'], 1, false)).toBe(
    'Your 31 workouts already reached 4 milestones and earned a Premium trial pass.',
  )
  expect(introMessage(160, ['workouts-150', 'workouts-500'], 1, false)).toBe(
    'Your 160 workouts already reached 2 milestones and earned a Premium trial pass.',
  )
  expect(introMessage(160, ['workouts-10', 'workouts-50', 'workouts-150'], 3, false)).toBe(
    'Your 160 workouts already reached 3 milestones and earned 3 Premium trial passes.',
  )
})
