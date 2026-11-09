import type { LoadType, WeightUnit } from './types'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from './exerciseHistory'
import { beatsBest, computeEffectiveLoad, type SetMarker } from './progress'
import { bodyWeightEntryAt, convertWeight, type BodyWeightEntryLike } from './bodyStats'
import { findSmallWins, type SmallWinKind, type WinSet } from './smallWins'
import { epley, isEpleyEligible } from './progressSeries'
import { formatDay, formatWeight, type Progression } from './repRecords'

// Issue #579: "Why wasn't this a record?" The record check sheet
// (RecordCheckSheet.vue) for one set of a lift's history: the rule, this set
// and the best before it with both numbers worked out, what would have beaten
// it, and the small wins it did and didn't earn. Replays the same beatsBest
// as findRecordSetIds (lib/sessionTable.ts), so it can't drift from the paw
// marks. Mockup: docs/design/issue-579-record-check.html, option A.

export type RecordStatus = 'record' | 'not-record' | 'first'

export interface RecordCheckRef {
  id: string
  workoutId: string
  performedAt: string
  // 1-based, within its session.
  setNumber: number
  // As logged, e.g. "150 lb × 8".
  label: string
}

export interface RecordCheckLine {
  label: string
  sub?: string
  // "155 × 7 =" before the bold total; empty when the total says it all.
  math: string
  total: string
}

export interface RecordCheckWin {
  kind: SmallWinKind
  label: string
  over?: string
  state: 'earned' | 'needs' | 'first'
  value: string
}

export interface RecordCheck {
  status: RecordStatus
  set: RecordCheckRef
  title: string
  // Rendered as `${lead} <b>${key}</b>${tail}`.
  rule: { lead: string; key: string; tail: string }
  note: string | null
  lines: RecordCheckLine[]
  toBeat: string[]
  beatBy: string | null
  best: RecordCheckRef | null
  wins: RecordCheckWin[]
}

interface Placed {
  set: ExerciseHistorySet
  ref: RecordCheckRef
  marker: SetMarker
}

const EPS = 1e-9
const fmt = formatWeight

function loadLabel(loadType: LoadType, s: { weight: number; weight_unit: WeightUnit; level: number | null }): string {
  switch (loadType) {
    case 'level':
      return `Level ${s.level ?? 0}`
    case 'bodyweight':
      return s.weight > 0 ? `BW + ${fmt(s.weight)} ${s.weight_unit}` : 'Body weight'
    case 'assisted':
      return `${fmt(s.weight)} ${s.weight_unit} assist`
    default:
      return `${fmt(s.weight)} ${s.weight_unit}`
  }
}

function setLabel(loadType: LoadType, s: ExerciseHistorySet): string {
  return `${loadLabel(loadType, s)} × ${s.reps ?? 0}`
}

// The smallest multiple of `step` strictly above `value`.
function stepAbove(value: number, step: number): number {
  return (Math.floor(value / step + EPS) + 1) * step
}

function ruleFor(loadType: LoadType): RecordCheck['rule'] {
  switch (loadType) {
    case 'level':
      return { lead: 'A record is your', key: 'highest level', tail: ', then the most reps at that level.' }
    case 'bodyweight':
      return { lead: 'A record is your most', key: '(body weight + added weight) × reps', tail: ' in a single set.' }
    case 'assisted':
      return { lead: 'A record is your most', key: '(body weight − assist) × reps', tail: ' in a single set.' }
    default:
      return { lead: 'A record is your most', key: 'weight × reps', tail: ' in a single set.' }
  }
}

export function ruleText(rule: RecordCheck['rule']): string {
  return `${rule.lead} ${rule.key}${rule.tail}`
}

export function explainRecord(
  loadType: LoadType,
  history: ExerciseHistoryWorkout[],
  setId: string,
  bodyWeightEntries: BodyWeightEntryLike[],
  progression: Progression,
  premium: boolean,
): RecordCheck | null {
  if (loadType === 'timed') return null

  // Oldest first, set order within a session: the same replay as
  // findRecordSetIds.
  const chronological = [...history].sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime())
  const placed: Placed[] = []
  for (const w of chronological) {
    w.sets.forEach((s, i) => {
      placed.push({
        set: s,
        ref: { id: s.id, workoutId: w.workoutId, performedAt: w.performedAt, setNumber: i + 1, label: setLabel(loadType, s) },
        marker: {
          loadType,
          level: s.level,
          reps: s.reps ?? 0,
          weight: s.weight,
          weightUnit: s.weight_unit,
          effectiveLoad: computeEffectiveLoad(loadType, s.weight, s.weight_unit, w.performedAt, bodyWeightEntries),
        },
      })
    })
  }
  const index = placed.findIndex((p) => p.ref.id === setId)
  if (index < 0) return null
  const self = placed[index]
  const prior = placed.slice(0, index)

  let best: Placed | null = null
  for (const p of prior) if (!best || beatsBest(p.marker, best.marker)) best = p

  const status: RecordStatus = !best ? 'first' : beatsBest(self.marker, best.marker) ? 'record' : 'not-record'
  const title = `${self.ref.label}: ${status === 'record' ? 'a record' : status === 'first' ? 'your first set' : 'not a record, yet'}`
  const unit = self.set.weight_unit
  const step = progression.step[unit]
  const reps = self.set.reps ?? 0

  const bestSub = best ? `${best.ref.label} · ${formatDay(best.ref.performedAt)}, set ${best.ref.setNumber}` : undefined
  const bestLabel = status === 'record' ? 'Best before it' : 'Your best'
  const lines: RecordCheckLine[] = []
  const toBeat: string[] = []
  let beatBy: string | null = null
  let note: string | null = null

  const effective =
    (loadType === 'bodyweight' || loadType === 'assisted') && self.marker.effectiveLoad !== null && (!best || best.marker.effectiveLoad !== null)

  if (loadType === 'level') {
    const level = self.set.level ?? 0
    lines.push({ label: 'This set', math: '', total: `Level ${level} × ${reps}` })
    if (best) {
      const bLevel = best.set.level ?? 0
      const bReps = best.set.reps ?? 0
      lines.push({ label: bestLabel, sub: bestSub, math: '', total: `Level ${bLevel} × ${bReps}` })
      if (status === 'record') {
        beatBy = level > bLevel ? `${level - bLevel} ${level - bLevel === 1 ? 'level' : 'levels'} higher` : `${reps - bReps} more ${reps - bReps === 1 ? 'rep' : 'reps'}`
      } else if (status === 'not-record') {
        toBeat.push(`Level ${bLevel} × ${bReps + 1}`, `Level ${bLevel + 1}`)
      }
    }
  } else if (loadType === 'bodyweight' || loadType === 'assisted') {
    if (effective) {
      const entry = bodyWeightEntryAt(bodyWeightEntries, self.ref.performedAt)!
      const bw = convertWeight(entry.weight, entry.weight_unit, unit)
      const eff = self.marker.effectiveLoad!
      note = `Body weight ${fmt(bw)} ${unit} from your ${formatDay(entry.recorded_at)} weigh-in.`
      const w = self.set.weight
      const load = loadType === 'assisted' ? `(${fmt(bw)} − ${fmt(w)})` : w > 0 ? `(${fmt(bw)} + ${fmt(w)})` : fmt(bw)
      const total = eff * reps
      lines.push({ label: 'This set', math: `${load} × ${reps} =`, total: fmt(total) })
      if (best) {
        const bEff = convertWeight(best.marker.effectiveLoad!, best.set.weight_unit, unit)
        const bReps = best.set.reps ?? 0
        const bTotal = bEff * bReps
        lines.push({ label: bestLabel, sub: bestSub, math: `${fmt(bEff)} × ${bReps} =`, total: fmt(bTotal) })
        if (status === 'record') {
          beatBy = fmt(total - bTotal)
        } else if (status === 'not-record') {
          if (eff > 0) toBeat.push(`${loadLabel(loadType, self.set)} × ${Math.floor(bTotal / eff + EPS) + 1}`)
          if (reps > 0) {
            const need = bTotal / reps
            if (loadType === 'bodyweight') {
              // Not a record, so bw + this set's added weight <= need already.
              toBeat.push(`BW + ${fmt(stepAbove(Math.max(need - bw, 0), step))} ${unit} × ${reps}`)
            } else {
              const room = bw - need
              const assist = (Math.ceil(room / step - EPS) - 1) * step
              if (room > 0 && assist >= 0) toBeat.push(`${assist > 0 ? `${fmt(assist)} ${unit} assist` : 'No assist'} × ${reps}`)
            }
          }
        }
      }
    } else {
      note =
        loadType === 'assisted'
          ? 'No weigh-in on file, so it compares reps first, then less assist.'
          : 'No weigh-in on file, so it compares reps first, then added weight.'
      lines.push({ label: 'This set', math: '', total: `${reps} ${reps === 1 ? 'rep' : 'reps'}` })
      if (best) {
        const bReps = best.set.reps ?? 0
        const bWeight = convertWeight(best.set.weight, best.set.weight_unit, unit)
        lines.push({ label: bestLabel, sub: bestSub, math: '', total: `${bReps} ${bReps === 1 ? 'rep' : 'reps'}` })
        if (status === 'record') {
          beatBy = reps > bReps ? `${reps - bReps} more ${reps - bReps === 1 ? 'rep' : 'reps'}` : loadType === 'assisted' ? 'less assist' : 'more added weight'
        } else if (status === 'not-record') {
          toBeat.push(`${bReps + 1} reps`)
          if (loadType === 'bodyweight') toBeat.push(`${bReps} reps with over ${fmt(bWeight)} ${unit} added`)
          else if (bWeight > 0) toBeat.push(`${bReps} reps with under ${fmt(bWeight)} ${unit} assist`)
        }
      }
    }
  } else {
    const w = self.set.weight
    const total = w * reps
    lines.push({ label: 'This set', math: `${fmt(w)} × ${reps} =`, total: fmt(total) })
    if (best) {
      const bWeight = convertWeight(best.set.weight, best.set.weight_unit, unit)
      const bReps = best.set.reps ?? 0
      const bTotal = bWeight * bReps
      lines.push({ label: bestLabel, sub: bestSub, math: `${fmt(bWeight)} × ${bReps} =`, total: fmt(bTotal) })
      if (status === 'record') {
        beatBy = fmt(total - bTotal)
      } else if (status === 'not-record') {
        if (w > 0) toBeat.push(`${fmt(w)} × ${Math.floor(bTotal / w + EPS) + 1}`)
        if (reps > 0) toBeat.push(`${fmt(stepAbove(bTotal / reps, step))} × ${reps}`)
      }
    }
  }

  return {
    status,
    set: self.ref,
    title,
    rule: ruleFor(loadType),
    note,
    lines,
    toBeat,
    beatBy,
    best: best?.ref ?? null,
    wins: loadType === 'weight' ? smallWinRows(self.set, prior.map((p) => p.set), step, premium) : [],
  }
}

// Converted weights group to one decimal, as in smallWins.ts.
function key(weight: number): number {
  return Math.round(weight * 10) / 10
}

// Each small win (lib/smallWins.ts) with its bar, earned or not. Whether it
// was earned comes from findSmallWins itself; only the "needs" text is
// worked out here. Est. 1RM is Premium's, as on the rest screen.
function smallWinRows(set: ExerciseHistorySet, prior: WinSet[], step: number, premium: boolean): RecordCheckWin[] {
  const reps = set.reps ?? 0
  if (reps < 1 || set.weight <= 0) return []
  const unit = set.weight_unit
  const earlier = prior
    .filter((s) => s.reps !== null && s.reps >= 1 && s.weight > 0)
    .map((s) => ({ weight: key(convertWeight(s.weight, s.weight_unit, unit)), reps: s.reps as number }))
  if (earlier.length === 0) return []
  const earned = new Set(findSmallWins(set, 'weight', prior, null).map((w) => w.kind))
  const weight = key(set.weight)
  const rows: RecordCheckWin[] = []

  const heaviest = Math.max(...earlier.map((s) => s.weight))
  rows.push({
    kind: 'heaviest',
    label: 'Heaviest yet',
    over: `over ${fmt(heaviest)} ${unit}`,
    ...(earned.has('heaviest')
      ? { state: 'earned' as const, value: `${fmt(weight)} ${unit}` }
      : { state: 'needs' as const, value: `needs ${fmt(stepAbove(heaviest, step))} ${unit}` }),
  })

  const atWeight = earlier.filter((s) => s.weight === weight)
  if (atWeight.length === 0) {
    rows.push({ kind: 'reps', label: `Rep best at ${fmt(weight)} ${unit}`, state: 'first', value: 'first time' })
  } else {
    const bestReps = Math.max(...atWeight.map((s) => s.reps))
    rows.push({
      kind: 'reps',
      label: `Rep best at ${fmt(weight)} ${unit}`,
      over: `over ${bestReps}`,
      ...(earned.has('reps')
        ? { state: 'earned' as const, value: `${reps} reps` }
        : { state: 'needs' as const, value: `needs ${bestReps + 1} reps` }),
    })
  }

  const eligible = earlier.filter((s) => isEpleyEligible(s))
  if (premium && isEpleyEligible(set) && eligible.length > 0) {
    const bestE = Math.max(...eligible.map((s) => epley(s.weight, s.reps)))
    let value: string
    let state: RecordCheckWin['state'] = 'needs'
    if (earned.has('e1rm')) {
      state = 'earned'
      value = fmt(Math.round(epley(set.weight, reps)))
    } else {
      let n = reps + 1
      while (n <= 12 && key(epley(set.weight, n)) <= key(bestE)) n++
      value = n <= 12 ? `needs ${n} reps` : 'needs more weight'
    }
    rows.push({ kind: 'e1rm', label: '1RM best', over: `over ${fmt(Math.round(bestE))}`, state, value })
  }
  return rows
}
