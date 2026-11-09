import { test, expect } from '@playwright/test'
import {
  RATING_ASKED_KEY,
  RATING_ASKS_KEY,
  RATING_ASK_ON_KEY,
  askForRating,
  isGoodWorkout,
  readRatingAsks,
  setRatingAskOn,
  shouldAskForRating,
  type RatingHistory,
} from '../src/lib/storeRating'

// Issues #727 and #776: the record check, the spacing rules, the opt-out and
// the old flag's migration. Pure functions plus a stubbed localStorage, so
// these never touch `page`.

type Facts = Parameters<typeof isGoodWorkout>[0]
const record = { exerciseId: 'a' } as Facts['records'][number]
const withRecord: Facts = { records: [record] }
const noRecord: Facts = { records: [] }

const DAY = 86_400_000
const now = new Date('2026-10-23T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY).toISOString()
const history = (over: Partial<RatingHistory> = {}): RatingHistory => ({ workouts: 5, firstWorkoutAt: daysAgo(7), ...over })

const store = new Map<string, string>()
test.beforeEach(() => {
  store.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  setRatingAskOn(true)
  store.clear()
})

const asks = (...days: number[]) => store.set(RATING_ASKS_KEY, JSON.stringify(days.map(daysAgo)))
const should = (recap: Facts, h: RatingHistory, platform = 'android') => shouldAskForRating(recap, h, platform, now)

test('only a workout with a record is good', () => {
  expect(isGoodWorkout(withRecord)).toBe(true)
  expect(isGoodWorkout(noRecord)).toBe(false)
})

test('happy path: a record on Android, a week and 5 workouts in, never asked', () => {
  expect(should(withRecord, history())).toBe(true)
})

test('no record, web, or too early: no ask', () => {
  expect(should(noRecord, history())).toBe(false)
  expect(should(withRecord, history(), 'web')).toBe(false)
  expect(should(withRecord, history({ firstWorkoutAt: daysAgo(6.9) }))).toBe(false)
  expect(should(withRecord, history({ firstWorkoutAt: null }))).toBe(false)
  expect(should(withRecord, history({ workouts: 4 }))).toBe(false)
})

test('at least 30 days since the last ask, at most 3 in a year', () => {
  asks(29)
  expect(should(withRecord, history())).toBe(false)
  asks(30)
  expect(should(withRecord, history())).toBe(true)
  asks(200, 100, 30)
  expect(should(withRecord, history())).toBe(false)
  // The oldest ask is more than a year old, so only two count.
  asks(366, 200, 100)
  expect(should(withRecord, history())).toBe(true)
})

test('the Preferences switch turns the ask off for good', () => {
  setRatingAskOn(false)
  expect(store.get(RATING_ASK_ON_KEY)).toBe('0')
  expect(should(withRecord, history())).toBe(false)
  setRatingAskOn(true)
  expect(should(withRecord, history())).toBe(true)
})

test('the old rb-rating-asked flag counts as one ask, dated when first read', () => {
  store.set(RATING_ASKED_KEY, '1')
  expect(readRatingAsks(now)).toEqual([now.getTime()])
  expect(store.has(RATING_ASKED_KEY)).toBe(false)
  expect(JSON.parse(store.get(RATING_ASKS_KEY)!)).toEqual([now.toISOString()])
  expect(readRatingAsks(now)).toEqual([now.getTime()])

  store.clear()
  store.set(RATING_ASKED_KEY, '1')
  expect(should(withRecord, history())).toBe(false)
})

test('asking records the date, and a failing OS call still counts', async () => {
  let calls = 0
  expect(await askForRating(withRecord, history(), async () => void calls++, 'web', now)).toBe(false)
  expect(calls).toBe(0)
  expect(store.has(RATING_ASKS_KEY)).toBe(false)

  expect(await askForRating(withRecord, history(), async () => void calls++, 'android', now)).toBe(true)
  expect(await askForRating(withRecord, history(), async () => void calls++, 'android', now)).toBe(false)
  expect(calls).toBe(1)
  expect(JSON.parse(store.get(RATING_ASKS_KEY)!)).toEqual([now.toISOString()])

  store.clear()
  const failing = async () => {
    throw new Error('no Play')
  }
  expect(await askForRating(withRecord, history(), failing, 'android', now)).toBe(true)
  expect(JSON.parse(store.get(RATING_ASKS_KEY)!)).toEqual([now.toISOString()])
})
