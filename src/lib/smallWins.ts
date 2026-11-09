import type { LoadType, WeightUnit } from './types'
import { convertWeight, epley, isEpleyEligible } from './progressSeries'
import { formatWeight } from './repRecords'

// Issue #475: small wins for a logged set, short of the full-screen record
// (lib/progress.ts beatsBest decides that one). Shown as one chip on the set
// row (the strongest win) and a line per win on the rest screen. Pure: the
// workouts store passes in every earlier set of the exercise (including
// earlier sets today) and the target the row showed, if any.
// Mockup: docs/design/issue-475-small-wins.html, option A.

export type SmallWinKind = 'heaviest' | 'reps' | 'e1rm' | 'target'

// Strongest first: the row's one chip is the first visible win.
export const SMALL_WIN_ORDER: SmallWinKind[] = ['heaviest', 'reps', 'e1rm', 'target']

export const SMALL_WIN_LABELS: Record<SmallWinKind, string> = {
  heaviest: 'Heaviest yet',
  reps: 'Rep best',
  e1rm: '1RM best',
  target: 'Target hit',
}

export interface SmallWin {
  kind: SmallWinKind
  label: string
  // The rest screen's line after the chip, e.g. "190 lb, up from 185 lb".
  detail: string
}

export interface WinSet {
  reps: number | null
  weight: number
  weight_unit: WeightUnit
  level: number | null
}

// The target the row showed when it was logged: Premium's per-set target
// (lib/smartTarget.ts) or the free Next time target (lib/repRecords.ts).
export interface WinTarget {
  kind: 'weight' | 'level'
  unit: WeightUnit | null
  weight: number
  reps: number
}

// Converted weights like 100 kg -> 220.462 lb group to one decimal, as in
// repRecords.ts.
function key(weight: number): number {
  return Math.round(weight * 10) / 10
}

function usable(s: WinSet): boolean {
  return s.reps !== null && s.reps >= 1 && s.weight > 0
}

function hitsTarget(set: WinSet, target: WinTarget): boolean {
  if (set.reps === null || set.reps < target.reps) return false
  if (target.kind === 'level') return set.level !== null && set.level >= target.weight
  if (set.weight <= 0) return false
  return key(convertWeight(set.weight, set.weight_unit, target.unit ?? set.weight_unit)) >= key(target.weight)
}

// Every win for `set`, strongest first. Heaviest, rep best and 1RM best are
// for weight exercises with earlier sets to beat (a first-ever set is the
// big record's job); a target hit is for any set logged against a target.
export function findSmallWins(set: WinSet, loadType: LoadType, prior: WinSet[], target: WinTarget | null): SmallWin[] {
  const wins: SmallWin[] = []
  const add = (kind: SmallWinKind, detail: string) => wins.push({ kind, label: SMALL_WIN_LABELS[kind], detail })

  if (loadType === 'weight' && usable(set)) {
    const unit = set.weight_unit
    const reps = set.reps as number
    const weight = key(set.weight)
    const earlier = prior.filter(usable).map((s) => ({ weight: key(convertWeight(s.weight, s.weight_unit, unit)), reps: s.reps as number }))
    if (earlier.length > 0) {
      const heaviest = Math.max(...earlier.map((s) => s.weight))
      if (weight > heaviest) add('heaviest', `${formatWeight(weight)} ${unit}, up from ${formatWeight(heaviest)} ${unit}`)

      const atWeight = earlier.filter((s) => s.weight === weight)
      if (atWeight.length > 0) {
        const best = Math.max(...atWeight.map((s) => s.reps))
        if (reps > best) add('reps', `${reps} reps at ${formatWeight(weight)} ${unit}, up from ${best}`)
      }

      const eligible = earlier.filter((s) => isEpleyEligible(s))
      if (isEpleyEligible(set) && eligible.length > 0) {
        const e1rm = epley(set.weight, reps)
        const best = Math.max(...eligible.map((s) => epley(s.weight, s.reps)))
        // Rounded first, so a gain too small to show doesn't count.
        if (key(e1rm) > key(best)) add('e1rm', `Est. 1RM ${formatWeight(Math.round(e1rm))} ${unit}`)
      }
    }
  }

  if (target && hitsTarget(set, target)) {
    const load = target.kind === 'level' ? `Level ${target.weight}` : `${formatWeight(target.weight)} ${target.unit}`
    add('target', `${load} × ${target.reps}`)
  }

  return wins.sort((a, b) => SMALL_WIN_ORDER.indexOf(a.kind) - SMALL_WIN_ORDER.indexOf(b.kind))
}

// Est. 1RM is a Premium analytic (#132), so its win only shows with Premium.
export function visibleWins(wins: SmallWin[], premium: boolean): SmallWin[] {
  return premium ? wins : wins.filter((w) => w.kind !== 'e1rm')
}

// The row's one chip.
export function topWin(wins: SmallWin[], premium: boolean): SmallWin | null {
  return visibleWins(wins, premium)[0] ?? null
}
