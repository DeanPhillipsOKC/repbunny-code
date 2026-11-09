import { test, expect } from '@playwright/test'
import { openSqlJsDb } from './fixtures/sqljs'
import { CLIENT_ERROR_LIMIT, createSqliteRepos } from '../src/data/sqlite/repos'
import type { ClientErrorEntry } from '../src/data/types'
import { createThrottle, setErrorSink, withRequestLogging } from '../src/lib/errorLog'

// Issue #83's client error log pieces that don't need a page: the throttle,
// the on-device table, and the repo wrapper (same "no separate unit-test
// runner" reasoning as progress-series-unit.spec.ts).

function entry(occurredAt: string, message = 'boom'): ClientErrorEntry {
  return {
    occurred_at: occurredAt,
    kind: 'error',
    message,
    stack: null,
    route: '/',
    context: { operation: 'test' },
    app_version: null,
    user_agent: null,
  }
}

test('the throttle drops a message repeated more than 5 times a minute', () => {
  let now = 0
  const allow = createThrottle(5, 60_000, () => now)
  const results = Array.from({ length: 7 }, () => allow('error:same'))
  expect(results).toEqual([true, true, true, true, true, false, false])
  expect(allow('error:other')).toBe(true)

  now = 60_000
  expect(allow('error:same')).toBe(true)
})

test('the device keeps only the newest client errors and erase clears them', async () => {
  const db = await openSqlJsDb()
  const repos = createSqliteRepos(async () => db)
  const start = Date.parse('2026-10-01T00:00:00.000Z')
  for (let i = 0; i < CLIENT_ERROR_LIMIT + 5; i++) {
    const { error } = await repos.clientErrors.insert(entry(new Date(start + i * 1000).toISOString(), `boom ${i}`))
    expect(error).toBeNull()
  }

  const { data, error } = await repos.clientErrors.list()
  expect(error).toBeNull()
  expect(data).toHaveLength(CLIENT_ERROR_LIMIT)
  expect(data[0].message).toBe(`boom ${CLIENT_ERROR_LIMIT + 4}`)
  expect(data.at(-1)!.message).toBe('boom 5')
  expect(data[0].context).toEqual({ operation: 'test' })

  await repos.backup.reset()
  expect((await repos.clientErrors.list()).data).toHaveLength(CLIENT_ERROR_LIMIT)
  await repos.backup.erase()
  expect((await repos.clientErrors.list()).data).toHaveLength(0)
})

test('a failed write is logged with its operation and ids, not the values typed', async () => {
  const db = await openSqlJsDb()
  const base = createSqliteRepos(async () => db)
  const logged: ClientErrorEntry[] = []
  setErrorSink({
    insert: async (e) => {
      logged.push(e)
      return { error: null }
    },
    list: async () => ({ data: [], error: null }),
  })
  const repos = withRequestLogging(base)

  // No such workout or exercise, so the foreign keys reject it.
  const workoutId = crypto.randomUUID()
  const exerciseId = crypto.randomUUID()
  const { error } = await repos.workouts.insertSet({
    workout_id: workoutId,
    exercise_id: exerciseId,
    set_index: 0,
    reps: 8,
    weight: 225,
    weight_unit: 'lb',
    rpe: null,
    level: null,
    duration_seconds: null,
    distance: null,
    distance_unit: null,
    incline: null,
    calories: null,
  })
  expect(error?.code).toBe('23503')
  await expect.poll(() => logged.length).toBe(1)
  expect(logged[0].kind).toBe('request')
  expect(logged[0].context).toEqual({
    operation: 'workouts.insertSet',
    table: 'sets',
    code: '23503',
    workout_id: workoutId,
    exercise_id: exerciseId,
    // Issue #938: every entry carries the action trail (src/lib/errorLog.ts).
    trail: expect.any(Array),
  })

  // Reads and successful writes aren't logged.
  await repos.workouts.listHistory()
  await repos.exercises.create({
    name: 'Bench',
    setup_notes: null,
    rest_seconds: null,
    load_type: 'weight',
    tracks_distance: false,
    tracks_incline: false,
    tracks_level: false,
    tracks_calories: false,
    muscle_group: null,
    also_works: [],
    library_id: null,
  })
  expect(logged).toHaveLength(1)
})
