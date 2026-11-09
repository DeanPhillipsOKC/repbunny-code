// Backlog item 38: pool of mascot image + phrase pairs for the record
// celebration screen. Every image is a RepBunny pose (#59 swapped out an
// earlier bear, which isn't part of the brand). Combos are picked as a fixed
// pair (not image/phrase independently) so every result stays curated. Add
// more pairs here any time more art shows up.
import type { ArtKey } from './theme'
import type { SmallWinKind } from './smallWins'

// #118: `art` is a mascot slot, so a theme can swap the image (themeArt).
export interface CelebrationVariant {
  art: ArtKey
  phrase: string
}

export const celebrationPool: CelebrationVariant[] = [
  { art: 'celebration', phrase: 'Certified strong today.' },
  { art: 'celebration-flex', phrase: "That's a PR. No notes." },
]

export const firstExercisePool: CelebrationVariant[] = [
  { art: 'celebration', phrase: 'New move unlocked.' },
  { art: 'celebration-dumbbell', phrase: 'Day one of this one.' },
]

export function pickCelebration(random: () => number = Math.random): CelebrationVariant {
  return celebrationPool[Math.floor(random() * celebrationPool.length)]
}

export function pickFirstExerciseCelebration(random: () => number = Math.random): CelebrationVariant {
  return firstExercisePool[Math.floor(random() * firstExercisePool.length)]
}

// Issue #476: the "All wins" choice opens the celebration for a small win
// (lib/smallWins.ts) too, with a phrase that fits the win instead of a PR's.
export const smallWinCelebrations: Record<SmallWinKind, CelebrationVariant> = {
  heaviest: { art: 'celebration-flex', phrase: "Heaviest you've lifted here." },
  reps: { art: 'celebration', phrase: 'More reps than ever at this weight.' },
  e1rm: { art: 'celebration-flex', phrase: 'Your estimated max went up.' },
  target: { art: 'celebration-dumbbell', phrase: 'Right on target.' },
}
