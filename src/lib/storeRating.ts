import { Capacitor } from '@capacitor/core'
import { ref } from 'vue'
import type { FinishRecap } from './finishRecap'

// Issues #727 and #776: ask the OS for a store rating now and then, on the
// finish recap, after a workout that set a record. The OS prompt is the Play
// In-App Review API; Google's own sheet, no copy or reward from us, and Play
// decides whether it shows. The rules (docs/decisions.md): at least 7 days
// since the first workout and 5 workouts in, at least 30 days between asks, at
// most 3 asks in any 365 days, and a Preferences switch that turns it off. All
// per device, like rb-setup-done. Android only for now; the web build never asks,
// and the iPhone follows once the App Store build is live.

// Dates (ISO strings, oldest first) of past asks.
export const RATING_ASKS_KEY = 'rb-rating-ask-dates'
// Issue #727's one-time flag, counted as a single ask the first time it's read.
export const RATING_ASKED_KEY = 'rb-rating-asked'
// '0' = the user switched the ask off in Preferences; missing = on.
export const RATING_ASK_ON_KEY = 'rb-rating-ask-on'

// How long the recap stays on screen before the ask, so the celebration lands first.
export const RATING_ASK_DELAY_MS = 3000

export const MIN_DAYS_SINCE_FIRST_WORKOUT = 7
export const MIN_WORKOUTS = 5
export const MIN_DAYS_BETWEEN_ASKS = 30
export const MAX_ASKS_PER_YEAR = 3

const DAY_MS = 86_400_000

type RatingFacts = Pick<FinishRecap, 'records'>

// What the history says about the user: the workouts logged (this one
// included) and when the first happened.
export interface RatingHistory {
  workouts: number
  firstWorkoutAt: string | null
}

export const ratingAskOn = ref(readAskOn())

function readAskOn(): boolean {
  try {
    return localStorage.getItem(RATING_ASK_ON_KEY) !== '0'
  } catch {
    return true
  }
}

export function setRatingAskOn(on: boolean) {
  ratingAskOn.value = on
  try {
    localStorage.setItem(RATING_ASK_ON_KEY, on ? '1' : '0')
  } catch {
    // Blocked storage: the choice holds until the app restarts.
  }
}

export function isGoodWorkout(recap: RatingFacts): boolean {
  return recap.records.length > 0
}

// Past ask times in ms, oldest first. A device that has the #727 flag counts
// that as one ask, dated now, and the flag is dropped.
export function readRatingAsks(now = new Date()): number[] {
  try {
    const legacy = localStorage.getItem(RATING_ASKED_KEY) === '1'
    const parsed: unknown = JSON.parse(localStorage.getItem(RATING_ASKS_KEY) ?? '[]')
    const asks = (Array.isArray(parsed) ? parsed : [])
      .map((d) => Date.parse(String(d)))
      .filter((t) => !Number.isNaN(t))
    if (legacy) {
      asks.push(now.getTime())
      localStorage.setItem(RATING_ASKS_KEY, JSON.stringify(asks.map((t) => new Date(t).toISOString())))
      localStorage.removeItem(RATING_ASKED_KEY)
    }
    return asks.sort((a, b) => a - b)
  } catch {
    return []
  }
}

function recordRatingAsk(now: Date) {
  try {
    const asks = readRatingAsks(now).map((t) => new Date(t).toISOString())
    asks.push(now.toISOString())
    localStorage.setItem(RATING_ASKS_KEY, JSON.stringify(asks))
  } catch {
    // Blocked storage: we may ask again on a later record; the OS limits how often it shows.
  }
}

export function shouldAskForRating(
  recap: RatingFacts,
  history: RatingHistory,
  platform = Capacitor.getPlatform(),
  now = new Date(),
): boolean {
  if (platform !== 'android' || !ratingAskOn.value || !isGoodWorkout(recap)) return false
  if (history.workouts < MIN_WORKOUTS || !history.firstWorkoutAt) return false
  const first = Date.parse(history.firstWorkoutAt)
  if (Number.isNaN(first) || now.getTime() - first < MIN_DAYS_SINCE_FIRST_WORKOUT * DAY_MS) return false
  const asks = readRatingAsks(now)
  const last = asks[asks.length - 1]
  if (last !== undefined && now.getTime() - last < MIN_DAYS_BETWEEN_ASKS * DAY_MS) return false
  return asks.filter((t) => now.getTime() - t < 365 * DAY_MS).length < MAX_ASKS_PER_YEAR
}

// Marks the ask before calling the OS so a failure or a quick second finish
// can't ask twice.
export async function askForRating(
  recap: RatingFacts,
  history: RatingHistory,
  request = requestOsReview,
  platform = Capacitor.getPlatform(),
  now = new Date(),
): Promise<boolean> {
  if (!shouldAskForRating(recap, history, platform, now)) return false
  recordRatingAsk(now)
  try {
    await request()
  } catch {
    // The OS declines quietly; nothing for the user to see.
  }
  return true
}

async function requestOsReview() {
  const { InAppReview } = await import('@capacitor-community/in-app-review')
  await InAppReview.requestReview()
}
