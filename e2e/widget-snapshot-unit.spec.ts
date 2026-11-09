import { test, expect } from '@playwright/test'
import { buildWidgetSnapshot, latestRecord, pickNextTemplate, weekMarks } from '../src/lib/widgetSnapshot'
import type { ProgressSetRow } from '../src/lib/progressHub'
import type { Theme, ThemeToken } from '../src/lib/theme'
import type { LoadType } from '../src/lib/types'

// Issue #144's snapshot builder, same "no separate unit-test runner"
// reasoning as plateau-unit.spec.ts: these never touch `page`.

let nextId = 0
function row(fields: Partial<ProgressSetRow> & { workout_id: string; performed_at: string }): ProgressSetRow {
  return {
    id: `s${nextId++}`,
    exercise_id: 'bench',
    template_name: null,
    template_id: null,
    reps: 8,
    weight: 100,
    weight_unit: 'lb',
    rpe: null,
    level: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    incline: null,
    calories: null,
    ...fields,
  }
}

// Wednesday 2026-10-07, noon local. The week starts Sunday 2026-10-04.
const NOW = new Date(2026, 9, 7, 12, 0, 0)
const at = (month: number, day: number, hour = 9) => new Date(2026, month, day, hour).toISOString()

const loadTypes: Record<string, LoadType> = { bench: 'weight', crunch: 'level', plank: 'timed' }
const loadTypeOf = (id: string) => loadTypes[id] ?? 'weight'

// Stand-ins for two of lib/theme.ts's THEMES (importing it would pull in
// the app's runtime, which needs Vite).
function theme(id: string, accent: string, surface: string, decor?: Theme['decor']): Theme {
  const tokens = Object.fromEntries(
    ['--bg', '--surface', '--surface-2', '--border', '--text', '--text-dim', '--accent', '--accent-pressed', '--accent-text', '--secondary', '--highlight', '--success', '--danger', '--cardio'].map((t) => [t, '#000000']),
  ) as Record<ThemeToken, string>
  return { id, label: id, scheme: 'dark', tokens: { ...tokens, '--accent': accent, '--surface': surface }, decor }
}
const HALLOWEEN = theme('halloween', '#ff9a3c', '#211a29', { dayMark: 'candy-corn' })
const CLASSIC = theme('classic', '#f2879c', '#211829')
test('week marks: Sunday-start days with a workout, and the workout count', () => {
  const sets = [
    row({ workout_id: 'sat', performed_at: at(9, 3) }), // last Saturday
    row({ workout_id: 'sun', performed_at: at(9, 4, 0) }),
    row({ workout_id: 'sun', performed_at: at(9, 4, 0) }),
    row({ workout_id: 'tue1', performed_at: at(9, 6, 7) }),
    row({ workout_id: 'tue2', performed_at: at(9, 6, 18) }),
    row({ workout_id: 'nextSun', performed_at: at(9, 11) }),
  ]
  const week = weekMarks(sets, NOW)
  expect(week.start).toBe(new Date(2026, 9, 4).getTime())
  expect(week.count).toBe(3)
  expect(week.days).toEqual([true, false, true, false, false, false, false])
})

test('next template: the one after your last, wrapping, or the first', () => {
  const templates = [{ id: 'push' }, { id: 'pull' }, { id: 'legs' }]
  expect(pickNextTemplate([], templates)?.id).toBe('push')
  expect(pickNextTemplate([], [])).toBeNull()

  const pushThenPull = [
    row({ workout_id: 'a', performed_at: at(9, 1), template_id: 'push' }),
    row({ workout_id: 'b', performed_at: at(9, 3), template_id: 'pull' }),
    // A freeform workout after it doesn't move the pick.
    row({ workout_id: 'c', performed_at: at(9, 5), template_id: null }),
  ]
  expect(pickNextTemplate(pushThenPull, templates)?.id).toBe('legs')

  const legsLast = [...pushThenPull, row({ workout_id: 'd', performed_at: at(9, 6), template_id: 'legs' })]
  expect(pickNextTemplate(legsLast, templates)?.id).toBe('push')

  // The last template was archived since: start from the top.
  const archived = [row({ workout_id: 'e', performed_at: at(9, 6), template_id: 'old' })]
  expect(pickNextTemplate(archived, templates)?.id).toBe('push')
})

test('latest record: the newest set that beat its best, never a first set or a timed one', () => {
  expect(latestRecord([row({ workout_id: 'a', performed_at: at(9, 1) })], loadTypeOf)).toBeNull()

  const sets = [
    row({ workout_id: 'a', performed_at: at(9, 1), weight: 135 }),
    row({ workout_id: 'b', performed_at: at(9, 3), weight: 155 }),
    row({ workout_id: 'b', performed_at: at(9, 3), exercise_id: 'crunch', weight: 0, level: 5 }),
    row({ workout_id: 'c', performed_at: at(9, 5), weight: 145 }),
    row({ workout_id: 'c', performed_at: at(9, 5), exercise_id: 'plank', reps: null, duration_seconds: 60 }),
    row({ workout_id: 'd', performed_at: at(9, 6), exercise_id: 'plank', reps: null, duration_seconds: 90 }),
  ]
  const record = latestRecord(sets, loadTypeOf)
  expect(record?.workout_id).toBe('b')
  expect(record?.weight).toBe(155)
})

test('snapshot: theme colors and day mark, ready-to-draw strings, and the Premium flag', () => {
  const sets = [
    row({ workout_id: 'a', performed_at: at(9, 1), weight: 135, template_id: 'push' }),
    row({ workout_id: 'b', performed_at: at(9, 6), weight: 155, template_id: 'pull' }),
  ]
  const input = {
    now: NOW,
    premium: true,
    theme: HALLOWEEN,
    sets,
    templates: [
      { id: 'push', name: 'Push day', sub: 'Upper body' },
      { id: 'pull', name: 'Pull day', sub: 'Upper body' },
    ],
    exerciseNames: new Map([['bench', 'Bench press']]),
    loadTypeOf,
  }
  const snapshot = buildWidgetSnapshot(input)
  expect(snapshot.premium).toBe(true)
  expect(snapshot.colors.accent).toBe('#ff9a3c')
  expect(snapshot.colors.surface).toBe('#211a29')
  expect(snapshot.dayMark).toBe('candy-corn')
  expect(snapshot.week.count).toBe(1)
  expect(snapshot.week.label).toBe('workout')
  expect(snapshot.week.days[2]).toBe(true)
  expect(snapshot.next).toEqual({ templateId: 'push', name: 'Push day', sub: 'Upper body' })
  expect(snapshot.record).toEqual({ exerciseName: 'Bench press', detail: '8 × 155 lb', date: 'Oct 6' })

  const classicFree = buildWidgetSnapshot({ ...input, premium: false, theme: CLASSIC, sets: [], templates: [] })
  expect(classicFree.premium).toBe(false)
  expect(classicFree.dayMark).toBe('paw')
  expect(classicFree.colors.accent).toBe('#f2879c')
  expect(classicFree.week.label).toBe('workouts')
  expect(classicFree.next).toBeNull()
  expect(classicFree.record).toBeNull()
})
