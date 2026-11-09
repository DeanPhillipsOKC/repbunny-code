// Issue #183: what the bunny says on the rest timer and the finish recap.
// Lines state a true fact about this workout when there is one (more reps
// than last time, a record, the last set left), in the picked bunny
// personality's voice, and fall back to that personality's plain lines when
// nothing notable happened. A set under last time sometimes (DIP_CHANCE, at
// most once per workout) gets a kind line instead; it never states a cause,
// and a feel-tag line only shows when that tag was logged (#149).
//
// Pure: randomness and the recently shown lines are passed in, so the unit
// spec (e2e/bunny-lines-unit.spec.ts) can pin them. extras.ts keeps the
// recent list and the per-workout dip flag on the device.
import type { LoadType, WeightUnit } from './types'
import type { WorkoutFeel } from './workoutFeel'

export type Personality = 'classic' | 'punny' | 'coach' | 'hype'

export const PERSONALITIES: Personality[] = ['classic', 'punny', 'coach', 'hype']

export function asPersonality(value: string): Personality {
  return (PERSONALITIES as string[]).includes(value) ? (value as Personality) : 'classic'
}

// Roughly 1 in 3 qualifying dips gets a kind line.
export const DIP_CHANCE = 1 / 3
// How many recently shown lines a new pick skips.
export const RECENT_LIMIT = 8

export interface LineContext {
  // Returns [0, 1), like Math.random.
  rand: () => number
  // Most recent last.
  recent: readonly string[]
}

export interface LineSet {
  reps: number | null
  weight: number
  weight_unit: WeightUnit
  level: number | null
  rpe: number | null
}

export type SetComparison =
  | { kind: 'load'; amount: string }
  | { kind: 'moreReps'; n: number }
  | { kind: 'levelUp'; n: number }
  | { kind: 'easier'; rpe: number; was: number }
  | { kind: 'matched' }
  | { kind: 'dip' }

function formatAmount(n: number): string {
  return String(Number(n.toFixed(2)))
}

// This set against the same set last time (same exercise, same position).
// Null when the two don't compare apples to apples: no set last time, a timed
// set, mixed units, or one number up while another is down.
export function compareSet(loadType: LoadType, set: LineSet, last: LineSet | null): SetComparison | null {
  if (!last || loadType === 'timed' || set.reps === null || last.reps === null) return null
  const repsDiff = set.reps - last.reps
  const byReps = (): SetComparison => {
    if (repsDiff > 0) return { kind: 'moreReps', n: repsDiff }
    if (repsDiff < 0) return { kind: 'dip' }
    if (set.rpe !== null && last.rpe !== null && set.rpe < last.rpe) return { kind: 'easier', rpe: set.rpe, was: last.rpe }
    return { kind: 'matched' }
  }

  if (loadType === 'level') {
    if (set.level === null || last.level === null) return null
    const diff = set.level - last.level
    if (diff > 0) return repsDiff >= 0 ? { kind: 'levelUp', n: diff } : null
    if (diff < 0) return repsDiff <= 0 ? { kind: 'dip' } : null
    return byReps()
  }

  if (set.weight_unit !== last.weight_unit && !(set.weight === 0 && last.weight === 0)) return null
  // For assisted, less assistance is the better direction.
  const better = loadType === 'assisted' ? last.weight - set.weight : set.weight - last.weight
  if (better > 0) {
    if (repsDiff < 0) return null
    const amount = `${formatAmount(better)} ${set.weight_unit}`
    if (loadType === 'assisted') return { kind: 'load', amount: `${amount} less assist` }
    if (loadType === 'bodyweight') return { kind: 'load', amount: `${amount} more added weight` }
    return { kind: 'load', amount: `${amount} more` }
  }
  if (better < 0) return repsDiff <= 0 ? { kind: 'dip' } : null
  return byReps()
}

export interface RestFacts {
  exerciseName: string
  loadType: LoadType
  set: LineSet
  // The same set last time, or null.
  last: LineSet | null
  // When exactly one planned set is left in the whole workout, the exercise
  // it's on; otherwise null.
  lastSetName: string | null
  feel?: WorkoutFeel | null
  // A kind dip line already showed on this workout's rest timer.
  dipShown: boolean
}

export interface RecapFacts {
  records: { exerciseName: string; detail: string }[]
  // Exercises up on last time, and ones that came in lighter.
  upCount: number
  lighterCount: number
  weekWorkouts: number
  feel?: WorkoutFeel | null
}

export interface LineResult {
  text: string
  dip: boolean
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

interface Voice {
  rest: {
    load: (amount: string, ex: string) => string[]
    moreReps: (n: number, ex: string) => string[]
    levelUp: (n: number, ex: string) => string[]
    easier: (what: string, rpe: number, was: number) => string[]
    matched: (ex: string) => string[]
    lastSet: (ex: string) => string[]
    dip: string[]
    fallback: string[]
  }
  recap: {
    records: (n: number) => string[]
    // `phrase` reads "your heaviest Leg Press yet".
    record: (phrase: string) => string[]
    ups: (n: number) => string[]
    week: (n: number) => string[]
    dip: string[]
    fallback: string[]
  }
}

const VOICES: Record<Personality, Voice> = {
  classic: {
    rest: {
      load: (amount, ex) => [`${cap(amount)} than last time on ${ex}.`, `${ex}: ${amount} than last time.`],
      moreReps: (n, ex) => [`${n} more ${n === 1 ? 'rep' : 'reps'} than last time on ${ex}.`, `${ex}: ${n} more ${n === 1 ? 'rep' : 'reps'} than last time.`],
      levelUp: (n, ex) => [`Up ${plural(n, 'level')} from last time on ${ex}.`, `${ex}: up ${plural(n, 'level')} from last time.`],
      easier: (what, rpe, was) => [`Same ${what} as last time, RPE ${rpe}, was ${was}.`, `Same numbers as last time, and it felt easier: RPE ${rpe}, was ${was}.`],
      matched: (ex) => [`Matched last time on ${ex}.`, `Right on last time's numbers for ${ex}.`],
      lastSet: (ex) => [`One more set of ${ex}. Then you're done.`, `Last set of ${ex} next. Then you're done.`],
      dip: [
        'Off days happen. You still showed up.',
        'Lighter today is still training.',
        'Maybe sleep was short. Be easy on yourself.',
        'Bodies have weird days. This set still counts.',
        'Some days the weight feels heavier. Totally normal.',
        'A good meal and real sleep fix a lot. Keep going.',
      ],
      fallback: [
        'Nice work. Take a breather.',
        "Take a load off. You've earned it.",
        'Keep it up.',
        'Solid set. Recover up.',
        'Breathe. You’re crushing it.',
        'Great effort. Reset for the next one.',
      ],
    },
    recap: {
      records: (n) => [`${n} records today.`, `${n} new records in one workout.`],
      record: (phrase) => [`${cap(phrase)}.`, `That's ${phrase}.`],
      ups: (n) => [`Up on ${n} exercises from last time.`, `${n} exercises beat last time.`],
      week: (n) => [`That's your ${ordinal(n)} workout this week.`, `Workout number ${n} this week.`],
      dip: [
        "Not your strongest day, and that's fine. Strength isn't a straight line.",
        'A little lighter today. Rest up and see how next time feels.',
      ],
      fallback: ['Nice work today.', 'Another one logged.', 'Good session. Rest up.'],
    },
  },
  punny: {
    rest: {
      load: (amount, ex) => [`${cap(amount)} than last time on ${ex}. Some bunny's getting stronger.`, `${cap(amount)} on ${ex}. Hare-raising.`],
      moreReps: (n, ex) => [`${n} more ${n === 1 ? 'rep' : 'reps'} than last time. Hare-raising.`, `${n} more ${n === 1 ? 'rep' : 'reps'} on ${ex}. Hoppy days.`],
      levelUp: (n, ex) => [`Up ${plural(n, 'level')} on ${ex}. Hop, hop, hooray.`, `${ex}: up ${plural(n, 'level')}. Some bunny's climbing.`],
      easier: (what, rpe, was) => [`Same ${what}, RPE ${rpe}, was ${was}. Light on your paws.`, `Same numbers, RPE ${rpe}, was ${was}. Hoppy about that.`],
      matched: (ex) => [`Matched last time on ${ex}. Steady bunny.`, `Same as last time on ${ex}. Ears up, next set.`],
      lastSet: (ex) => [`One more set of ${ex}. Then it's carrot time.`, `Last hop: one more set of ${ex}.`],
      dip: ['Even bunnies have slow hops.', 'Slow hop, still a hop. This set counts.', 'Some days the carrots weigh more. Totally normal.'],
      fallback: [
        "Hop to it when the timer's done.",
        "Some bunny's getting stronger.",
        'Ears up, next set.',
        'Hare today, stronger tomorrow.',
        'Every bunny needs a breather.',
        'No bunny rushes rest.',
      ],
    },
    recap: {
      records: (n) => [`${n} records today. Hare-raising.`, `${n} records. Some bunny had a day.`],
      record: (phrase) => [`${cap(phrase)}. Hare-raising.`, `${cap(phrase)}. Some bunny's getting stronger.`],
      ups: (n) => [`Up on ${n} exercises. Hop, hop, hooray.`, `${n} exercises beat last time. Hoppy days.`],
      week: (n) => [`Workout ${n} this week. Some bunny's consistent.`, `Your ${ordinal(n)} hop to the gym this week.`],
      dip: ['Even bunnies have slow hops. Rest up and see how next time feels.', "A slower hop today, and that's fine. Strength isn't a straight line."],
      fallback: ['Hop, hop, logged.', 'Some bunny trained today.', 'Ears up. Workout done.'],
    },
  },
  coach: {
    rest: {
      load: (amount, ex) => [`${cap(amount)} than last time on ${ex}. Keep the form tight.`, `${cap(amount)} than last time. Same control next set.`],
      moreReps: (n, ex) => [`${n} more ${n === 1 ? 'rep' : 'reps'} than last time. Same tempo next set.`, `${n} more ${n === 1 ? 'rep' : 'reps'} on ${ex}. Stay tight on the next one.`],
      levelUp: (n, ex) => [`Up ${plural(n, 'level')} from last time. Hold that pace.`, `${ex}: up ${plural(n, 'level')}. Breathe and settle in.`],
      easier: (what, rpe, was) => [`Same ${what}, RPE ${rpe}, was ${was}. That's progress.`, `Same numbers, RPE ${rpe}, was ${was}. Getting easier.`],
      matched: (ex) => [`Matched last time on ${ex}. Breathe and repeat.`, 'Same as last time. Own the next one.'],
      lastSet: (ex) => [`Last set of ${ex} next. Finish strong.`, `One set of ${ex} left. Make it a clean one.`],
      dip: ['Dip noted. Sleep, food, water, then we go again.', 'Lighter set. Reset and focus on the next one.', 'Off sets happen. Breathe and go again.'],
      fallback: [
        'Breathe. Next set, same bar speed.',
        'Shake it out. Stay tight on the next one.',
        'Water, breathe, reset.',
        'Good set. Own the next one.',
        'Recover now so the next set counts.',
        'Slow breath in. Long breath out.',
      ],
    },
    recap: {
      records: (n) => [`${n} records today. Recover well tonight.`, `${n} records. That's the work paying off.`],
      record: (phrase) => [`${cap(phrase)}. Good work.`, `${cap(phrase)}. Recover well and build on it.`],
      ups: (n) => [`Up on ${n} exercises from last time. Keep stacking sessions.`, `${n} exercises beat last time. Consistent work wins.`],
      week: (n) => [`Workout ${n} this week. Consistency counts.`, `Your ${ordinal(n)} session this week. Recover well.`],
      dip: ['Dip noted. Sleep, food, water, then we go again.', 'Lighter day. Recover well and see how next time feels.'],
      fallback: ['Logged and done. Recover well tonight.', 'Consistent work wins. Same time next session.', 'Good session. Eat, sleep, come back.'],
    },
  },
  hype: {
    rest: {
      load: (amount, ex) => [`${cap(amount)} than last time on ${ex}. Look at you go.`, `${cap(amount)} than last time. Okay, that set was strong.`],
      moreReps: (n, ex) => [`${n} more ${n === 1 ? 'rep' : 'reps'} than last time on ${ex}. Love that.`, `${n} more ${n === 1 ? 'rep' : 'reps'} than last time. Look at you go.`],
      levelUp: (n, ex) => [`Up ${plural(n, 'level')} on ${ex}. Okay, wow.`, `${ex}: up ${plural(n, 'level')}. Look at you go.`],
      easier: (what, rpe, was) => [`Same ${what}, RPE ${rpe}, was ${was}. Stronger already.`, `Same numbers, RPE ${rpe}, was ${was}. Love that.`],
      matched: (ex) => [`Matched last time on ${ex}. Solid.`, "Right on last time's numbers. Next one's yours."],
      lastSet: (ex) => [`One more set of ${ex}. You've got this.`, `Last set of ${ex} next. Let's finish it.`],
      dip: ['Off day? Still here, still lifting. Love that.', "Still showed up. That's the win.", "Lighter set, same heart. Next one's yours."],
      fallback: [
        'Okay, that set was strong.',
        'Look at you go.',
        "Next one's yours.",
        "You're on a roll today.",
        "That's how it's done.",
        'Love that set. Breathe.',
      ],
    },
    recap: {
      records: (n) => [`${n} records today. Look at you go.`, `${n} records in one workout. Okay, wow.`],
      record: (phrase) => [`${cap(phrase)}. Look at you go.`, `${cap(phrase)}. Okay, that was strong.`],
      ups: (n) => [`Up on ${n} exercises from last time. Love that.`, `${n} exercises beat last time. You're on a roll.`],
      week: (n) => [`Workout ${n} this week. You're on a roll.`, `Your ${ordinal(n)} workout this week. Love that.`],
      dip: ['Off day? Still here, still lifting. Love that.', 'Lighter today, and you still showed up. That counts.'],
      fallback: ['That workout was strong.', 'Another one in the bag. Love that.', 'Look at you, all done.'],
    },
  },
}

// Kind lines that name a tag the lifter logged. Facts they told us, never a
// guess, so every personality says them plainly.
function feelLines(feel: WorkoutFeel | null | undefined): string[] {
  if (!feel) return []
  const lines: string[] = []
  if (feel.sleep === 'under_6') lines.push('You logged under 6 hours of sleep. Lighter days happen.')
  if (feel.energy === 'low') lines.push('You logged low energy today. Showing up anyway is the hard part.')
  if (feel.stress === 'high') lines.push('You logged high stress today. This workout still counts.')
  return lines
}

// A random line from the pool, skipping the recently shown ones; when every
// line was shown lately, anything but the very last one.
export function pickFresh(pool: string[], ctx: LineContext): string {
  const fresh = pool.filter((line) => !ctx.recent.includes(line))
  const lastShown = ctx.recent[ctx.recent.length - 1]
  const options = fresh.length > 0 ? fresh : pool.filter((line) => line !== lastShown)
  const from = options.length > 0 ? options : pool
  return from[Math.min(from.length - 1, Math.floor(ctx.rand() * from.length))]
}

function dipPool(voiceDip: string[], feel: WorkoutFeel | null | undefined): string[] {
  const tagged = feelLines(feel)
  return tagged.length > 0 ? tagged : voiceDip
}

export function restLineFor(facts: RestFacts, personality: Personality, ctx: LineContext): LineResult {
  const voice = VOICES[personality].rest
  const ex = facts.exerciseName
  const comparison = compareSet(facts.loadType, facts.set, facts.last)
  // Only a dip draws the random number, so the odds stay 1 in 3 per dip.
  if (comparison?.kind === 'dip' && !facts.dipShown && ctx.rand() < DIP_CHANCE) {
    return { text: pickFresh(dipPool(voice.dip, facts.feel), ctx), dip: true }
  }
  const line = (pool: string[]): LineResult => ({ text: pickFresh(pool, ctx), dip: false })
  switch (comparison?.kind) {
    case 'load':
      return line(voice.load(comparison.amount, ex))
    case 'moreReps':
      return line(voice.moreReps(comparison.n, ex))
    case 'levelUp':
      return line(voice.levelUp(comparison.n, ex))
    case 'easier':
      return line(voice.easier(facts.loadType === 'weight' ? 'weight' : 'numbers', comparison.rpe, comparison.was))
  }
  if (facts.lastSetName) return line(voice.lastSet(facts.lastSetName))
  if (comparison?.kind === 'matched') return line(voice.matched(ex))
  return line(voice.fallback)
}

// A plain line, for a rest with no set behind it.
export function plainRestLineFor(personality: Personality, ctx: LineContext): string {
  return pickFresh(VOICES[personality].rest.fallback, ctx)
}

// "your heaviest Leg Press yet", from a finish recap record's detail
// ("Heaviest set · was 200 lb").
export function recordPhrase(record: { exerciseName: string; detail: string }): string {
  const ex = record.exerciseName
  const d = record.detail
  if (d.startsWith('Heaviest')) return `your heaviest ${ex} yet`
  if (d.startsWith('Least assist')) return `your least assisted ${ex} yet`
  if (d.startsWith('Most reps')) return `your most reps on ${ex} yet`
  if (d.startsWith('Best level')) return `your best level on ${ex} yet`
  if (d.startsWith('Longest')) return `your longest ${ex} yet`
  if (d.startsWith('Farthest')) return `your farthest ${ex} yet`
  return `a new record on ${ex}`
}

export function recapLineFor(facts: RecapFacts, personality: Personality, ctx: LineContext): LineResult {
  const voice = VOICES[personality].recap
  const line = (pool: string[]): LineResult => ({ text: pickFresh(pool, ctx), dip: false })
  if (facts.records.length >= 2) return line(voice.records(facts.records.length))
  if (facts.records.length === 1) return line(voice.record(recordPhrase(facts.records[0])))
  const dipDay = facts.lighterCount > 0 && facts.upCount === 0
  if (dipDay && ctx.rand() < DIP_CHANCE) return { text: pickFresh(dipPool(voice.dip, facts.feel), ctx), dip: true }
  if (facts.upCount >= 2) return line(voice.ups(facts.upCount))
  if (facts.weekWorkouts >= 2) return line(voice.week(facts.weekWorkouts))
  return line(voice.fallback)
}

// What the picker and the unlock screen show for a personality: a sample
// workout-aware line, then a plain one.
export function sampleLines(personality: Personality): string[] {
  const voice = VOICES[personality].rest
  return [voice.moreReps(2, 'Leg Press')[0], voice.fallback[0]]
}
