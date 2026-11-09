// Issue #154: Extras, the cosmetic rewards milestones (#153) unlock. Premium
// only (#190): each reward belongs to one milestone tier, and Premium unlocks
// it once this device has that tier (seen, or reached now), so history earned
// while free counts the moment Premium starts. Free users see them marked
// Premium and earn trial passes instead; a trial pass doesn't unlock them.
// Picks are per device, like the theme. The marks and confetti are drawn in code; the
// sounds are short clips in public/sounds/ (#184). Mockup:
// docs/design/issue-154-milestone-rewards.html, option B.
//
// This file must not import milestones.ts: milestones.ts builds its tier table
// from REWARDS at load time, so a cycle would read REWARDS before it exists.
import { ref } from 'vue'
import {
  RECENT_LIMIT,
  asPersonality,
  plainRestLineFor,
  recapLineFor,
  restLineFor,
  sampleLines,
  type LineContext,
  type RecapFacts,
  type RestFacts,
} from './bunnyLines'

// 'lines' is the bunny personality (#183; "Bunny lines" before). The kind id
// stays 'lines' so stored picks keep their key.
export type ExtraKind = 'weekMark' | 'confetti' | 'chime' | 'fanfare' | 'lines'

export type WeekMarkExtra = 'star' | 'heart' | 'dumbbell'
export type ConfettiExtra = 'hearts' | 'stars' | 'plates'
export type ChimeExtra = 'boxing-bell' | 'whistle' | 'boing' | 'bike-bell'
export type FanfareExtra = 'air-horn' | 'cheer' | 'tada-horns'
export type LinesExtra = 'punny' | 'coach' | 'hype'

export interface Reward {
  // Stable; stored in the viewed list.
  id: string
  kind: ExtraKind
  // What a pick stores.
  value: string
  name: string
  // The milestone tier id (`${track}-${count}`) that unlocks it.
  tier: string
}

// Early tiers get the most wanted ones, so the first weeks feel rewarding.
// Three trial-pass tiers (#155: workouts 10 and 50, strong weeks 12) also
// carry a rest chime (#184): Premium gets the chime there, free users the pass.
export const REWARDS: Reward[] = [
  { id: 'mark-stars', kind: 'weekMark', value: 'star', name: 'Stars', tier: 'workouts-1' },
  { id: 'confetti-hearts', kind: 'confetti', value: 'hearts', name: 'Hearts', tier: 'workouts-5' },
  { id: 'fanfare-air-horn', kind: 'fanfare', value: 'air-horn', name: 'Air horn', tier: 'records-1' },
  { id: 'personality-punny', kind: 'lines', value: 'punny', name: 'Punny', tier: 'strongWeeks-4' },
  { id: 'chime-boing', kind: 'chime', value: 'boing', name: 'Cartoon boing', tier: 'workouts-10' },
  { id: 'mark-hearts', kind: 'weekMark', value: 'heart', name: 'Hearts', tier: 'workouts-25' },
  { id: 'confetti-stars', kind: 'confetti', value: 'stars', name: 'Stars', tier: 'records-10' },
  { id: 'chime-whistle', kind: 'chime', value: 'whistle', name: 'Coach whistle', tier: 'workouts-50' },
  { id: 'chime-bike-bell', kind: 'chime', value: 'bike-bell', name: 'Bike bell', tier: 'strongWeeks-12' },
  { id: 'personality-coach', kind: 'lines', value: 'coach', name: 'Coach', tier: 'records-25' },
  { id: 'chime-boxing-bell', kind: 'chime', value: 'boxing-bell', name: 'Boxing bell', tier: 'workouts-100' },
  { id: 'mark-dumbbells', kind: 'weekMark', value: 'dumbbell', name: 'Dumbbells', tier: 'strongWeeks-26' },
  { id: 'confetti-plates', kind: 'confetti', value: 'plates', name: 'Plates', tier: 'records-50' },
  { id: 'fanfare-tada-horns', kind: 'fanfare', value: 'tada-horns', name: 'Ta-da', tier: 'workouts-200' },
  { id: 'personality-hype', kind: 'lines', value: 'hype', name: 'Hype', tier: 'workouts-300' },
  { id: 'fanfare-cheer', kind: 'fanfare', value: 'cheer', name: 'Crowd cheer', tier: 'strongWeeks-52' },
]

// The sound values with a clip in public/sounds/ (restChime.ts plays
// `/sounds/<value>.mp3`). A pick of a sound since removed (bells, marimba,
// tada, trumpets) fails validPick, so it reads as the default.
export const EXTRA_SOUND_VALUES: string[] = REWARDS.filter((r) => r.kind === 'chime' || r.kind === 'fanfare').map((r) => r.value)

export interface KindInfo {
  kind: ExtraKind
  title: string
  // The always-available option every kind starts on.
  defaultValue: string
  defaultName: string
  // Shown on the picker under the title.
  blurb: string
  // How a reward reads on the recap: "Stars week mark".
  noun: string
}

export const KINDS: KindInfo[] = [
  {
    kind: 'weekMark',
    title: 'Week mark',
    defaultValue: 'match',
    defaultName: 'Match theme',
    blurb: "The mark for each day you trained on Home's This week tracker.",
    noun: 'week mark',
  },
  {
    kind: 'confetti',
    title: 'Confetti',
    defaultValue: 'match',
    defaultName: 'Match theme',
    blurb: 'What falls when you set a record.',
    noun: 'confetti',
  },
  {
    kind: 'chime',
    title: 'Rest chime',
    defaultValue: 'classic',
    defaultName: 'Classic',
    blurb: 'The sound when rest ends. Tap one to hear it.',
    noun: 'rest chime',
  },
  {
    kind: 'fanfare',
    title: 'Record fanfare',
    defaultValue: 'off',
    defaultName: 'Off',
    blurb: 'A sound when you set a record. Tap one to hear it.',
    noun: 'record fanfare',
  },
  {
    kind: 'lines',
    title: 'Bunny personality',
    defaultValue: 'classic',
    defaultName: 'Classic',
    blurb: 'How the bunny talks on the rest timer and the workout recap. Every personality knows what you just lifted.',
    noun: 'bunny personality',
  },
]

export function kindInfo(kind: ExtraKind): KindInfo {
  return KINDS.find((k) => k.kind === kind)!
}

export function rewardsOf(kind: ExtraKind): Reward[] {
  return REWARDS.filter((r) => r.kind === kind)
}

export function rewardForTier(tierId: string): Reward | undefined {
  return REWARDS.find((r) => r.tier === tierId)
}

// "Stars week mark", for the recap and the Milestones screen.
export function rewardLabel(reward: Reward): string {
  return `${reward.name} ${kindInfo(reward.kind).noun}`
}

// A reward is unlocked with Premium once its tier is (#190): this device has
// shown it (it stays unlocked even if deletes lower the count) or the count
// reaches it now. Reactive on Premium when called from a computed.
export function isUnlocked(reward: Reward, unlockedTiers: ReadonlySet<string>): boolean {
  return extrasPremium() && unlockedTiers.has(reward.tier)
}

// premium.ts registers its isPremium here. This file can't import premium.ts:
// the Node unit specs load extras.ts, and premium.ts reads import.meta.env.
let extrasPremium: () => boolean = () => false

export function setExtrasPremiumSource(source: () => boolean) {
  extrasPremium = source
}

// The tiers this device has shown (milestones.ts MILESTONES_SEEN_KEY, which
// lives here so this file needn't import milestones.ts).
export const MILESTONES_SEEN_KEY = 'repbunny-milestones-seen'

function readSeen(): Set<string> {
  try {
    const ids = JSON.parse(localStorage.getItem(MILESTONES_SEEN_KEY) ?? '[]')
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

// Bumped by milestones.ts after it records new tiers, so playablePick's
// callers rerun.
const seenVersion = ref(0)

export function refreshSeenTiers() {
  seenVersion.value++
}

// What actually plays for a kind: the pick, or the kind's default when the
// pick is locked (no Premium, or its tier not earned yet, #190). Reads the
// seen list fresh, since anything may have written it.
export function playablePick(kind: ExtraKind): string {
  const value = extrasPicks.value[kind]
  const reward = rewardsOf(kind).find((r) => r.value === value)
  if (!reward) return value
  if (!extrasPremium()) return kindInfo(kind).defaultValue
  void seenVersion.value
  return readSeen().has(reward.tier) ? value : kindInfo(kind).defaultValue
}

// Issue #183: the bunny personality's lines (lib/bunnyLines.ts). The device
// keeps the last few lines shown, so the same workout doesn't repeat the same
// words, and which workout already got a kind dip line on the rest timer.
export const BUNNY_RECENT_KEY = 'repbunny-bunny-recent'
export const BUNNY_DIP_KEY = 'repbunny-bunny-dip'

export function readRecentLines(): string[] {
  try {
    const lines = JSON.parse(localStorage.getItem(BUNNY_RECENT_KEY) ?? '[]')
    return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === 'string') : []
  } catch {
    return []
  }
}

export function rememberLine(line: string) {
  try {
    const recent = [...readRecentLines().filter((l) => l !== line), line].slice(-RECENT_LIMIT)
    localStorage.setItem(BUNNY_RECENT_KEY, JSON.stringify(recent))
  } catch {
    // Storage off: lines may repeat sooner.
  }
}

function dipShownOn(workoutId: string | null): boolean {
  try {
    return !!workoutId && localStorage.getItem(BUNNY_DIP_KEY) === workoutId
  } catch {
    return false
  }
}

export function personalityPick() {
  return asPersonality(playablePick('lines'))
}

// The rest timer's headline for the set just logged.
export function restLine(facts: Omit<RestFacts, 'dipShown'>, workoutId: string | null, rand: () => number = Math.random): string {
  const ctx: LineContext = { rand, recent: readRecentLines() }
  const result = restLineFor({ ...facts, dipShown: dipShownOn(workoutId) }, personalityPick(), ctx)
  rememberLine(result.text)
  if (result.dip && workoutId) {
    try {
      localStorage.setItem(BUNNY_DIP_KEY, workoutId)
    } catch {
      // Storage off: another dip line may show this workout.
    }
  }
  return result.text
}

// A plain rest headline, for a rest with no set behind it (one brought back
// from the lock screen).
export function plainRestLine(): string {
  return plainRestLineFor(personalityPick(), { rand: Math.random, recent: readRecentLines() })
}

export function recapLine(facts: RecapFacts, ctx: LineContext): string {
  return recapLineFor(facts, personalityPick(), ctx).text
}

// A personality's sample lines, for the picker and the unlock screen.
export function personalitySamples(value: string): string[] {
  return sampleLines(asPersonality(value))
}

export function sampleLine(value: string): string {
  return personalitySamples(value)[0]
}

export type ExtrasPicks = Record<ExtraKind, string>

export const EXTRAS_KEY = 'repbunny-extras'
// Reward ids the picker has shown, so a just-unlocked one gets a New pill.
export const EXTRAS_VIEWED_KEY = 'repbunny-extras-viewed'

function defaults(): ExtrasPicks {
  return Object.fromEntries(KINDS.map((k) => [k.kind, k.defaultValue])) as ExtrasPicks
}

function validPick(kind: ExtraKind, value: unknown): value is string {
  return value === kindInfo(kind).defaultValue || rewardsOf(kind).some((r) => r.value === value)
}

// Issue #183: the old bunny line packs became personalities on the same
// tiers. A stored pick or viewed id from before reads as the new one.
const LEGACY_LINES: Record<string, string> = { puns: 'punny', soft: 'hype' }
const LEGACY_REWARD_IDS: Record<string, string> = {
  'lines-puns': 'personality-punny',
  'lines-coach': 'personality-coach',
  'lines-soft': 'personality-hype',
}

function readPicks(): ExtrasPicks {
  const picks = defaults()
  try {
    const raw = JSON.parse(localStorage.getItem(EXTRAS_KEY) ?? '{}') as Record<string, unknown>
    if (typeof raw.lines === 'string' && raw.lines in LEGACY_LINES) raw.lines = LEGACY_LINES[raw.lines]
    for (const { kind } of KINDS) if (validPick(kind, raw[kind])) picks[kind] = raw[kind] as string
  } catch {
    // Unreadable or storage off: the defaults.
  }
  return picks
}

export const extrasPicks = ref<ExtrasPicks>(readPicks())

export function chooseExtra(kind: ExtraKind, value: string) {
  if (!validPick(kind, value)) return
  extrasPicks.value = { ...extrasPicks.value, [kind]: value }
  try {
    localStorage.setItem(EXTRAS_KEY, JSON.stringify(extrasPicks.value))
  } catch {
    // Best effort; the pick still holds for this session.
  }
}

// Erase all data clears the repbunny- keys (lib/eraseAllData.ts); this puts the
// in-memory picks back to match.
export function resetExtrasState() {
  extrasPicks.value = readPicks()
  refreshSeenTiers()
}

// The current pick's display name: "Stars", "Match theme".
export function pickName(kind: ExtraKind): string {
  const value = playablePick(kind)
  return rewardsOf(kind).find((r) => r.value === value)?.name ?? kindInfo(kind).defaultName
}

export function readViewed(): Set<string> {
  try {
    const ids = JSON.parse(localStorage.getItem(EXTRAS_VIEWED_KEY) ?? '[]')
    return new Set(
      Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').map((id) => LEGACY_REWARD_IDS[id] ?? id) : [],
    )
  } catch {
    return new Set()
  }
}

export function markViewed(ids: Iterable<string>) {
  const viewed = readViewed()
  for (const id of ids) viewed.add(id)
  try {
    localStorage.setItem(EXTRAS_VIEWED_KEY, JSON.stringify([...viewed]))
  } catch {
    // Storage off: the New pill just shows again next time.
  }
}
