import type { LoadType } from './types'
import type { ExerciseHistorySet, ExerciseHistoryWorkout } from './exerciseHistory'
import { beatsBest, computeEffectiveLoad, type SetMarker } from './progress'
import type { BodyWeightEntryLike } from './bodyStats'
import { formatSecondsAsClock } from './timedInput'

// Issue #181: the session list on a lift's progress screen
// (ExerciseHistoryDetail.vue) as one card per session with its sets in
// aligned columns. Pure, so the unit spec can run it in Node. Mockup:
// docs/design/issue-181-session-list.html, option C.

export interface SessionCell {
  value: string
  unit?: string
}

export interface SessionColumn {
  key: string
  label: string
}

export interface SessionTable {
  columns: SessionColumn[]
  rows: { id: string; cells: SessionCell[] }[]
}

export const SESSION_PAGE_SIZE = 10

const NONE: SessionCell = { value: '–' }

function num(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function loadCell(loadType: LoadType, s: ExerciseHistorySet): SessionCell {
  if (loadType === 'level') return s.level === null ? NONE : { value: String(s.level) }
  if (loadType === 'bodyweight' && s.weight <= 0) return NONE
  return { value: num(s.weight), unit: s.weight_unit }
}

const LOAD_LABEL: Partial<Record<LoadType, string>> = { weight: 'Weight', bodyweight: 'Added', assisted: 'Assist', level: 'Level' }

// Timed columns are only the fields this session logged, so a plank is just
// Time and a treadmill session gets Distance, Incline, Level, Cal as used.
const TIMED_EXTRAS: { key: string; label: string; cell: (s: ExerciseHistorySet) => SessionCell | null }[] = [
  { key: 'distance', label: 'Distance', cell: (s) => (s.distance === null ? null : { value: num(s.distance), unit: s.distance_unit ?? 'mi' }) },
  { key: 'incline', label: 'Incline', cell: (s) => (s.incline === null ? null : { value: num(s.incline) }) },
  { key: 'level', label: 'Level', cell: (s) => (s.level === null ? null : { value: String(s.level) }) },
  { key: 'calories', label: 'Cal', cell: (s) => (s.calories === null ? null : { value: num(s.calories) }) },
]

export function buildSessionTable(loadType: LoadType, sets: ExerciseHistorySet[]): SessionTable {
  const columns: SessionColumn[] = [{ key: 'set', label: 'Set' }]
  const makers: ((s: ExerciseHistorySet) => SessionCell)[] = []

  if (loadType === 'timed') {
    columns.push({ key: 'time', label: 'Time' })
    makers.push((s) => (s.duration_seconds === null ? NONE : { value: formatSecondsAsClock(s.duration_seconds) }))
    for (const extra of TIMED_EXTRAS) {
      if (!sets.some((s) => extra.cell(s) !== null)) continue
      columns.push({ key: extra.key, label: extra.label })
      makers.push((s) => extra.cell(s) ?? NONE)
    }
  } else {
    columns.push({ key: 'load', label: LOAD_LABEL[loadType] ?? 'Weight' })
    makers.push((s) => loadCell(loadType, s))
    columns.push({ key: 'reps', label: 'Reps' })
    makers.push((s) => (s.reps === null ? NONE : { value: String(s.reps) }))
  }

  if (sets.some((s) => s.rpe !== null)) {
    columns.push({ key: 'rpe', label: 'RPE' })
    makers.push((s) => (s.rpe === null ? NONE : { value: num(s.rpe) }))
  }

  return {
    columns,
    rows: sets.map((s, i) => ({ id: s.id, cells: [{ value: String(i + 1) }, ...makers.map((make) => make(s))] })),
  }
}

const KG_TO_LB = 2.20462

function lb(s: ExerciseHistorySet): number {
  return s.weight_unit === 'kg' ? s.weight * KG_TO_LB : s.weight
}

// "Top set" as a lifter means it: the heaviest (least assist, highest level,
// most added), more reps breaking a tie. Timed sessions show their longest.
function topSetOf(loadType: LoadType, sets: ExerciseHistorySet[]): ExerciseHistorySet | null {
  let top: ExerciseHistorySet | null = null
  for (const s of sets) {
    if (!top) {
      top = s
      continue
    }
    let diff: number
    if (loadType === 'timed') diff = (s.duration_seconds ?? 0) - (top.duration_seconds ?? 0)
    else if (loadType === 'level') diff = (s.level ?? 0) - (top.level ?? 0)
    else if (loadType === 'assisted') diff = lb(top) - lb(s)
    else diff = lb(s) - lb(top)
    if (diff > 0 || (diff === 0 && (s.reps ?? 0) > (top.reps ?? 0))) top = s
  }
  return top
}

function topSetLabel(loadType: LoadType, s: ExerciseHistorySet): string {
  const reps = `× ${s.reps ?? 0}`
  switch (loadType) {
    case 'level':
      return `Level ${s.level ?? 0} ${reps}`
    case 'bodyweight':
      return s.weight > 0 ? `BW + ${num(s.weight)} ${s.weight_unit} ${reps}` : `BW ${reps}`
    case 'assisted':
      return `${num(s.weight)} ${s.weight_unit} assist ${reps}`
    default:
      return `${num(s.weight)} ${s.weight_unit} ${reps}`
  }
}

export interface SessionSummary {
  label: string
  value: string
  totals: string
}

export function summarizeSession(loadType: LoadType, sets: ExerciseHistorySet[]): SessionSummary | null {
  const top = topSetOf(loadType, sets)
  if (!top) return null
  const setCount = `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`
  if (loadType === 'timed') {
    const total = sets.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0)
    return { label: 'Longest', value: formatSecondsAsClock(top.duration_seconds ?? 0), totals: `${setCount} · ${formatSecondsAsClock(total)}` }
  }
  const reps = sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
  return { label: 'Top set', value: topSetLabel(loadType, top), totals: `${setCount} · ${reps} ${reps === 1 ? 'rep' : 'reps'}` }
}

// Sets that beat this exercise's best so far when they were logged: the
// same replay as findPrWorkoutIds (lib/progress.ts) behind the Workout log's
// "PR set this workout", one set at a time. The first set ever is the
// baseline, not a record, and timed sets never are (item 93).
export function findRecordSetIds(
  loadType: LoadType,
  history: ExerciseHistoryWorkout[],
  bodyWeightEntries: BodyWeightEntryLike[] = [],
): Set<string> {
  const ids = new Set<string>()
  if (loadType === 'timed') return ids
  const chronological = [...history].sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime())
  let best: SetMarker | null = null
  for (const w of chronological) {
    for (const s of w.sets) {
      const marker: SetMarker = {
        loadType,
        level: s.level,
        reps: s.reps ?? 0,
        weight: s.weight,
        weightUnit: s.weight_unit,
        effectiveLoad: computeEffectiveLoad(loadType, s.weight, s.weight_unit, w.performedAt, bodyWeightEntries),
      }
      if (!best) {
        best = marker
      } else if (beatsBest(marker, best)) {
        best = marker
        ids.add(s.id)
      }
    }
  }
  return ids
}
