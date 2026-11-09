import { test, expect } from '@playwright/test'
import { handleBack, type BackDeps } from '../src/lib/androidBack'

// Issue #482's decision order, without a device (the Android build runs it).
function run(over: Partial<{ dialog: boolean; route: string; history: boolean }>) {
  const calls: string[] = []
  const o = { dialog: false, route: 'home', history: true, ...over }
  const deps: BackDeps = {
    topDialog: () => (o.dialog ? ({} as Element) : null),
    routeName: () => o.route,
    hasHistory: () => o.history,
    closeDialog: () => calls.push('close'),
    goBack: () => calls.push('back'),
    goHome: () => calls.push('home'),
    exitApp: () => calls.push('exit'),
  }
  return { result: handleBack(deps), calls }
}

test('back closes an open sheet before anything else', () => {
  expect(run({ dialog: true, route: 'progress' })).toEqual({ result: 'dialog', calls: ['close'] })
  expect(run({ dialog: true })).toEqual({ result: 'dialog', calls: ['close'] })
})

test('back goes up a route, or to Home with no history', () => {
  expect(run({ route: 'workout-log' })).toEqual({ result: 'back', calls: ['back'] })
  expect(run({ route: 'workout-log', history: false })).toEqual({ result: 'home', calls: ['home'] })
})

test('back leaves the app only from Home with no sheet open', () => {
  expect(run({})).toEqual({ result: 'exit', calls: ['exit'] })
})
