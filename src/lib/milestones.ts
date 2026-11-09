// Issue #153: milestones. Training unlocks rewards directly; there's no
// currency or balance and never a streak. Progress is derived from workout
// history every time (no stored progress), so editing or deleting a workout
// adjusts it and backups need nothing new for it. The only stored state is
// which tiers this device has already shown as unlocked, so a reward, once
// seen, stays unlocked even if deletes later lower the count.
import { ref } from 'vue'
import type { LoadType, WeightUnit } from './types'
import type { BodyWeightEntryLike } from './bodyStats'
import { beatsBest, computeEffectiveLoad, type SetMarker } from './progress'
import { startOfWeek } from './progressHub'
import { TRIAL_PASS_LABEL, TRIAL_PASS_TIERS, earnTrialPasses } from './trialPass'
import { MILESTONES_SEEN_KEY, REWARDS, refreshSeenTiers, rewardLabel } from './extras'

export type MilestoneTrack = 'workouts' | 'records' | 'strongWeeks'

export interface MilestoneTier {
  // Stable, stored in the seen list and backups: `${track}-${count}`.
  id: string
  track: MilestoneTrack
  count: number
  // An Extras reward (#154). A tier without one still counts and shows.
  reward?: { id: string; label: string }
}

export interface TrackInfo {
  track: MilestoneTrack
  title: string
  // How the count reads: "18 workouts".
  noun: [singular: string, plural: string]
  rule: string
}

// "Plateaus broken" (1, 5, 15) joins once plateau calls (#133) exist.
export const TRACKS: TrackInfo[] = [
  {
    track: 'workouts',
    title: 'Workouts finished',
    noun: ['workout', 'workouts'],
    rule: 'Workouts with 3 or more sets. Up to 2 a day count.',
  },
  {
    track: 'records',
    title: 'Records',
    noun: ['record', 'records'],
    rule: 'Sets that beat your best on that exercise.',
  },
  {
    track: 'strongWeeks',
    title: 'Strong weeks',
    noun: ['strong week', 'strong weeks'],
    rule: 'Weeks with 2 or more workouts. They add up; missing a week never costs you one.',
  },
]

const TIER_COUNTS: Record<MilestoneTrack, number[]> = {
  workouts: [1, 5, 10, 25, 50, 100, 150, 200, 300, 500],
  records: [1, 10, 25, 50, 100],
  strongWeeks: [4, 12, 26, 52],
}

// Rewards per tier id: the Extras cosmetics (#154, lib/extras.ts). Trial
// passes (#155) are only for free users, so they come from tierRewardLabel,
// not this table.
const TIER_REWARDS: Record<string, MilestoneTier['reward']> = Object.fromEntries(
  REWARDS.map((r) => [r.tier, { id: r.id, label: rewardLabel(r) }]),
)

export const TIERS: MilestoneTier[] = TRACKS.flatMap(({ track }) =>
  TIER_COUNTS[track].map((count) => {
    const id = `${track}-${count}`
    const reward = TIER_REWARDS[id]
    return reward ? { id, track, count, reward } : { id, track, count }
  }),
)

export const MIN_SETS_PER_WORKOUT = 3
export const MAX_WORKOUTS_PER_DAY = 2
export const STRONG_WEEK_WORKOUTS = 2

export interface MilestoneSetRow {
  exercise_id: string
  workout_id: string
  performed_at: string
  // Order within a workout; a later set can beat an earlier one.
  set_index?: number
  reps: number | null
  weight: number
  weight_unit: WeightUnit
  level: number | null
  // The workout came from an import (#462).
  imported?: boolean
}

export type MilestoneCounts = Record<MilestoneTrack, number>

function localDayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// The workouts that count toward "Workouts finished", oldest first: 3+ sets,
// and only the first 2 on any calendar day.
export function countedWorkouts(rows: MilestoneSetRow[]): { id: string; performedAt: string }[] {
  const byWorkout = new Map<string, { id: string; performedAt: string; sets: number }>()
  for (const row of rows) {
    const w = byWorkout.get(row.workout_id)
    if (w) w.sets++
    else byWorkout.set(row.workout_id, { id: row.workout_id, performedAt: row.performed_at, sets: 1 })
  }
  const qualifying = [...byWorkout.values()]
    .filter((w) => w.sets >= MIN_SETS_PER_WORKOUT)
    .sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime())
  const perDay = new Map<string, number>()
  const counted: { id: string; performedAt: string }[] = []
  for (const w of qualifying) {
    const day = localDayKey(w.performedAt)
    const n = perDay.get(day) ?? 0
    if (n >= MAX_WORKOUTS_PER_DAY) continue
    perDay.set(day, n + 1)
    counted.push({ id: w.id, performedAt: w.performedAt })
  }
  return counted
}

// Calendar weeks (Sunday start, like the rest of the app) with 2+ counted
// workouts, in total. Not consecutive: a missed week never resets anything.
export function strongWeekCount(workouts: { performedAt: string }[]): number {
  const perWeek = new Map<number, number>()
  for (const w of workouts) {
    const week = startOfWeek(new Date(w.performedAt)).getTime()
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
  }
  return [...perWeek.values()].filter((n) => n >= STRONG_WEEK_WORKOUTS).length
}

// Sets that beat the best before them on the same exercise, replayed oldest
// first with the same rule as the record celebration (progress.ts). An
// exercise's first set sets the baseline and isn't a record itself; timed
// sets never count.
export function recordSetCount(
  rows: MilestoneSetRow[],
  loadTypeOf: (exerciseId: string) => LoadType,
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): number {
  return recordSets(rows, loadTypeOf, bodyWeightEntries).length
}

// The record sets themselves, oldest first (#134's reports list them).
export function recordSets<T extends MilestoneSetRow>(
  rows: T[],
  loadTypeOf: (exerciseId: string) => LoadType,
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): T[] {
  return recordSetsWithBeaten(rows, loadTypeOf, bodyWeightEntries).map((r) => r.set)
}

// Each record set with the set it beat (#581: the hub's records sheet says
// "Beat 8 × 150 lb").
export function recordSetsWithBeaten<T extends MilestoneSetRow>(
  rows: T[],
  loadTypeOf: (exerciseId: string) => LoadType,
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): { set: T; beaten: T }[] {
  const ordered = [...rows].sort((a, b) => {
    const byTime = new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime()
    if (byTime !== 0) return byTime
    if (a.workout_id !== b.workout_id) return a.workout_id < b.workout_id ? -1 : 1
    return (a.set_index ?? 0) - (b.set_index ?? 0)
  })
  const best = new Map<string, { marker: SetMarker; row: T }>()
  const records: { set: T; beaten: T }[] = []
  for (const s of ordered) {
    const loadType = loadTypeOf(s.exercise_id)
    if (loadType === 'timed') continue
    const marker: SetMarker = {
      loadType,
      level: s.level,
      reps: s.reps ?? 0,
      weight: s.weight,
      weightUnit: s.weight_unit,
      effectiveLoad: computeEffectiveLoad(loadType, s.weight, s.weight_unit, s.performed_at, bodyWeightEntries),
    }
    const previous = best.get(s.exercise_id)
    if (!previous) {
      best.set(s.exercise_id, { marker, row: s })
    } else if (beatsBest(marker, previous.marker)) {
      best.set(s.exercise_id, { marker, row: s })
      records.push({ set: s, beaten: previous.row })
    }
  }
  return records
}

export function milestoneCounts(
  rows: MilestoneSetRow[],
  loadTypeOf: (exerciseId: string) => LoadType,
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): MilestoneCounts {
  const workouts = countedWorkouts(rows)
  return {
    workouts: workouts.length,
    records: recordSetCount(rows, loadTypeOf, bodyWeightEntries),
    strongWeeks: strongWeekCount(workouts),
  }
}

// Issue #462: tiers whose crossing happened in an imported workout. Counting
// replays oldest first like the counts do: the nth workout, record, or strong
// week is "the crossing" for the tier at n. Those tiers show as "Before
// RepBunny" and never celebrate, grant a trial pass, or unlock an Extra.
// Records, progress, and targets still use the imported history.
export function importedTierIds(
  rows: MilestoneSetRow[],
  loadTypeOf: (exerciseId: string) => LoadType,
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): Set<string> {
  if (!rows.some((r) => r.imported)) return new Set()
  const importedWorkouts = new Set(rows.filter((r) => r.imported).map((r) => r.workout_id))
  const crossings: Record<MilestoneTrack, boolean[]> = { workouts: [], records: [], strongWeeks: [] }
  const perWeek = new Map<number, number>()
  for (const w of countedWorkouts(rows)) {
    const imported = importedWorkouts.has(w.id)
    crossings.workouts.push(imported)
    const week = startOfWeek(new Date(w.performedAt)).getTime()
    const n = (perWeek.get(week) ?? 0) + 1
    perWeek.set(week, n)
    if (n === STRONG_WEEK_WORKOUTS) crossings.strongWeeks.push(imported)
  }
  for (const s of recordSets(rows, loadTypeOf, bodyWeightEntries)) crossings.records.push(importedWorkouts.has(s.workout_id))
  return new Set(TIERS.filter((t) => crossings[t.track][t.count - 1] === true).map((t) => t.id))
}

export function reachedTierIds(counts: MilestoneCounts): string[] {
  return TIERS.filter((t) => counts[t.track] >= t.count).map((t) => t.id)
}

// What a tier unlocks for this user, for the recap and the Milestones screen
// (#190). Premium earns the tier's Extra; a free user earns only the trial
// pass (#155), never both. A tier that unlocks nothing for them reads as an
// achievement only. Free users only exist where passes apply (local mode).
export function tierRewardLabel(tier: MilestoneTier, premium: boolean): string | null {
  if (premium) return tier.reward?.label ?? null
  return TRIAL_PASS_TIERS.includes(tier.id) ? TRIAL_PASS_LABEL : null
}

export function tierById(id: string): MilestoneTier | undefined {
  return TIERS.find((t) => t.id === id)
}

export function trackInfo(track: MilestoneTrack): TrackInfo {
  return TRACKS.find((t) => t.track === track)!
}

export function countText(track: MilestoneTrack, n: number): string {
  const [one, many] = trackInfo(track).noun
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

// The recap's headline for a tier: "25 workouts!", "First record!".
export function tierHeadline(tier: MilestoneTier): string {
  if (tier.count === 1) return `First ${trackInfo(tier.track).noun[0]}!`
  return `${countText(tier.track, tier.count)}!`
}

// Tiers reached now that this device hasn't shown yet, in table order.
// `skip` is the tiers imported history crossed (#462), which never announce.
export function newlyReached(counts: MilestoneCounts, seen: ReadonlySet<string>, skip: ReadonlySet<string> = new Set()): MilestoneTier[] {
  return TIERS.filter((t) => counts[t.track] >= t.count && !seen.has(t.id) && !skip.has(t.id))
}

export interface TrackProgress {
  info: TrackInfo
  count: number
  tiers: (MilestoneTier & { unlocked: boolean })[]
  // null once every tier is unlocked.
  next: MilestoneTier | null
}

// One row per track for the Milestones screen. A tier is unlocked when the
// count reaches it now or this device has already shown it (deletes can lower
// the count, but never take back what was unlocked).
export function trackProgress(counts: MilestoneCounts, seen: ReadonlySet<string>): TrackProgress[] {
  return TRACKS.map((info) => {
    const tiers = TIERS.filter((t) => t.track === info.track).map((t) => ({
      ...t,
      unlocked: counts[t.track] >= t.count || seen.has(t.id),
    }))
    return { info, count: counts[info.track], tiers, next: tiers.find((t) => !t.unlocked) ?? null }
  })
}

// Issue #188: how close "close" is on each track, for the recap's next-unlock
// line.
export const CLOSE_WITHIN: Record<MilestoneTrack, number> = { workouts: 3, records: 3, strongWeeks: 1 }

export interface NextUnlock {
  tier: MilestoneTier
  remaining: number
  label: string
}

// The single nearest tier, across tracks, that unlocks something for this
// user and is within CLOSE_WITHIN of the count: an Extra for Premium, a trial
// pass for free users (#190). Tiers that unlock nothing for them are skipped
// to the next one on their track. A tie goes to the earlier track in TRACKS.
export function nextUnlock(counts: MilestoneCounts, seen: ReadonlySet<string>, premium: boolean): NextUnlock | null {
  let nearest: NextUnlock | null = null
  for (const { info, count, tiers } of trackProgress(counts, seen)) {
    const tier = tiers.find((t) => !t.unlocked && tierRewardLabel(t, premium))
    if (!tier) continue
    const remaining = tier.count - count
    if (remaining > CLOSE_WITHIN[info.track] || (nearest && remaining >= nearest.remaining)) continue
    nearest = { tier, remaining, label: tierRewardLabel(tier, premium)! }
  }
  return nearest
}

// What the recap shows (stores/workouts.ts findFinishMilestones): the tiers
// this workout crossed and the one-time history note (#153), or, when there
// are neither, the next-unlock line (#188).
export interface FinishMilestones {
  tiers: MilestoneTier[]
  intro: string | null
  next: string | null
}

// "2 workouts to your next unlock: Hearts confetti".
export function nextUnlockText({ tier, remaining, label }: NextUnlock): string {
  return `${countText(tier.track, remaining)} to your next unlock: ${label}`
}

// The one-time note for history that predates milestones: "Your 31 workouts
// already unlocked 6 rewards." Extras count as rewards only for Premium
// (extras, #190); when none of the tiers carry one (#154), it counts
// milestones instead. Trial passes the history earned (#155) are named too.
export function introMessage(workouts: number, tierIds: string[], passes = 0, extras = true): string {
  const rewards = extras ? tierIds.filter((id) => tierById(id)?.reward).length : 0
  const what = rewards > 0 ? (rewards === 1 ? '1 reward' : `${rewards} rewards`) : tierIds.length === 1 ? '1 milestone' : `${tierIds.length} milestones`
  const verb = rewards > 0 ? 'unlocked' : 'reached'
  const earned = passes > 0 ? ` and earned ${passes === 1 ? 'a Premium trial pass' : `${passes} Premium trial passes`}` : ''
  return `Your ${countText('workouts', workouts)} already ${verb} ${what}${earned}.`
}

// Per device. Absent seen list = milestones never set up here. The key lives
// in extras.ts, which reads it for its locked-pick fallback (#190).
export { MILESTONES_SEEN_KEY }
// The pending one-time note, JSON { workouts, tierIds, passes?, extras? };
// removed once read. A note without extras (stored before #190) counts them.
export const MILESTONES_INTRO_KEY = 'repbunny-milestones-intro'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage off: milestones still show, they just aren't remembered.
  }
}

export function readSeenTiers(): Set<string> | null {
  const raw = read(MILESTONES_SEEN_KEY)
  if (raw === null) return null
  try {
    const ids = JSON.parse(raw)
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export function addSeenTiers(ids: Iterable<string>) {
  const seen = readSeenTiers() ?? new Set<string>()
  for (const id of ids) seen.add(id)
  write(MILESTONES_SEEN_KEY, JSON.stringify([...seen]))
  refreshSeenTiers()
}

// First time on this device: everything the history already reached counts
// as unlocked, with one note about it when there's anything to say. Premium
// gets those tiers' Extras; a free user gets the trial passes they grant
// instead (#155, #190).
export function initSeenTiers(counts: MilestoneCounts, premium = true, imported: ReadonlySet<string> = new Set()): Set<string> {
  // Tiers an import crossed (#462) stay out: no Extra, no pass, no note.
  const ids = reachedTierIds(counts).filter((id) => !imported.has(id))
  write(MILESTONES_SEEN_KEY, JSON.stringify(ids))
  refreshSeenTiers()
  const passes = premium ? 0 : earnTrialPasses(ids)
  if (ids.length > 0) write(MILESTONES_INTRO_KEY, JSON.stringify({ workouts: counts.workouts, tierIds: ids, passes, extras: premium }))
  return new Set(ids)
}

export function pendingIntro(): string | null {
  const raw = read(MILESTONES_INTRO_KEY)
  if (raw === null) return null
  try {
    const { workouts, tierIds, passes, extras } = JSON.parse(raw) as { workouts: number; tierIds: string[]; passes?: number; extras?: boolean }
    return introMessage(workouts, tierIds, typeof passes === 'number' ? passes : 0, extras !== false)
  } catch {
    return null
  }
}

export function clearIntro() {
  write(MILESTONES_INTRO_KEY, null)
}

// Issue #186: Preferences > Milestone moments, per device, on by default. Off
// hides the moments (the recap card, the next-unlock line, and later the
// unlock screen) and nothing else: counting, seen tiers, Extras, and trial
// passes carry on, so turning it back on never replays what was crossed.
export const MILESTONE_MOMENTS_OFF_KEY = 'repbunny-milestone-moments-off'

export const milestoneMomentsOn = ref(read(MILESTONE_MOMENTS_OFF_KEY) !== '1')

export function setMilestoneMomentsOn(on: boolean) {
  milestoneMomentsOn.value = on
  write(MILESTONE_MOMENTS_OFF_KEY, on ? null : '1')
}

// Erase all data clears the repbunny- keys (lib/eraseAllData.ts); this puts the
// in-memory switch back to match.
export function resetMilestoneMoments() {
  milestoneMomentsOn.value = read(MILESTONE_MOMENTS_OFF_KEY) !== '1'
}
