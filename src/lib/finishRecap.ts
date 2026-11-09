// Backlog item 106: the post-finish session recap (replaces item 6's
// "Volume over time" chart and item 105's all-time Longest/Farthest rows).
// Pure computation from already-fetched rows, kept separate from the store
// and FinishRecap.vue so each rule below is readable/testable on its own
// (see e2e/finish-recap-unit.spec.ts).
import type { DistanceUnit, LoadType, WeightUnit } from './types'
import type { MuscleGroup } from './muscleGroups'
import type { BodyWeightEntryLike } from './bodyStats'
import { formatSetLabel } from './setLabel'
import { formatSecondsAsClock } from './timedInput'
import { modeWeightUnit, workoutVolume } from './volume'
import {
  bestLevelSet,
  farthestDistanceByUnit,
  heaviestSetByUnit,
  leastAssistByUnit,
  longestDuration,
  type ExerciseHistorySet,
  type ExerciseHistoryWorkout,
} from './exerciseHistory'
import { buildProgressSeries, convertWeight, epley, isEpleyEligible, mostUsedWeightUnit } from './progressSeries'

export interface RecapSet {
  exercise_id: string
  reps: number | null
  weight: number
  weight_unit: WeightUnit
  level: number | null
  duration_seconds: number | null
  distance: number | null
  distance_unit: DistanceUnit | null
  calories: number | null
}

export interface RecapSessionSet extends RecapSet {
  exercises: { name: string; load_type: LoadType } | null
}

// A set of one of this session's exercises from some other (earlier) workout.
export interface PriorSet extends RecapSet {
  workout_id: string
  performed_at: string
}

// Just enough of a workout to total its volume and cardio time.
export interface RecapWorkoutSummary {
  id: string
  performed_at: string
  sets: {
    reps: number | null
    weight: number
    weight_unit: WeightUnit
    duration_seconds: number | null
    exercises: { load_type: LoadType; muscle_group?: MuscleGroup | null } | null
  }[]
}

export interface FinishRecapInput {
  workout: { id: string; performed_at: string; templateName: string | null; sets: RecapSessionSet[] }
  finishedAt: Date
  // Every earlier set of this session's exercises, any workout.
  priorSets: PriorSet[]
  // This template's most recent sessions, oldest first, ending with this one.
  // Empty for a freeform workout.
  templateSessions: RecapWorkoutSummary[]
  weekWorkouts: RecapWorkoutSummary[]
  weekWorkoutCount: number
  // Issue #274: true when the user logged any workout before this one, so a
  // routine's first run isn't announced as their first workout ever.
  hasEarlierWorkouts?: boolean
  bodyWeightEntries: BodyWeightEntryLike[]
  // The profile's unit (issue #53); null = the unit this workout's sets use most.
  preferredUnit: WeightUnit | null
}

export type ChipTone = 'up' | 'neutral' | 'new'

export interface VolumeHero {
  kind: 'volume'
  value: string
  unit: WeightUnit
  delta: { label: string; tone: ChipTone; caption: string } | null
  bars: { heightPct: number; label: string; isToday: boolean }[]
}

export interface TimeHero {
  kind: 'time'
  value: string
  unit: string
  segments: { name: string; label: string; pct: number; color: string }[]
}

export interface RecapTile {
  label: string
  value: string
  unit: string
  sub: string
}

export interface RecapRecord {
  exerciseId: string
  exerciseName: string
  detail: string
  value: string
  // Issue #46: e.g. "6 lb", only on a weight exercise's first record row
  // when today's best est. 1RM beats every earlier session's.
  e1rmGain?: string
}

export interface RecapComparison {
  exerciseId: string
  exerciseName: string
  today: string
  chip: string
  tone: ChipTone
}

export type WeekDayKind = 'strength' | 'timed' | null

export interface RecapWeek {
  days: WeekDayKind[]
  todayIndex: number
  workouts: number
  volume: string
  volumeUnit: WeightUnit
  cardioMinutes: number
}

export interface FinishRecap {
  // Item 70's first-run celebration still leads the first time a template
  // is ever completed.
  firstTemplateRun: boolean
  // Issue #274: the routine's name, only when the user has earlier workouts.
  firstRunRoutine: string | null
  // Issue #727: true when the user logged any workout before this one.
  hasEarlierWorkouts: boolean
  title: string
  meta: string
  hero: VolumeHero | TimeHero | null
  tiles: RecapTile[]
  records: RecapRecord[]
  comparisons: RecapComparison[]
  week: RecapWeek
  // Issue #115: the lift the one-time Premium chart teaser would show, if
  // any. Whether it actually shows is lib/premium.ts's call.
  chartTeaser: ChartTeaser | null
}

// Issue #115: a weight lift now logged in CHART_TEASER_WORKOUTS or more
// workouts, with its est. 1RM per workout (oldest first) for the blurred line.
export interface ChartTeaser {
  exerciseId: string
  exerciseName: string
  workoutCount: number
  e1rm: number[]
}

export const CHART_TEASER_WORKOUTS = 5

// Split colors for the "Time moving" bar, from docs/brand-identity.md's
// palette: lavender, pink, gold, green, then repeat.
const SEGMENT_COLORS = ['var(--secondary)', 'var(--accent)', 'var(--highlight)', 'var(--success)']

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

// Distances are typed with decimals (2.1 mi); round away float noise from
// sums/differences like 3.1 - 2.8.
export function formatDistance(n: number): string {
  return String(Number(n.toFixed(2)))
}


function asHistory(sets: RecapSet[]): ExerciseHistoryWorkout[] {
  return [{ workoutId: '', performedAt: '', sets: sets as unknown as ExerciseHistorySet[] }]
}

interface ExerciseGroup {
  exerciseId: string
  name: string
  loadType: LoadType
  sets: RecapSessionSet[]
}

// Distinct exercises in first-logged order (sets arrive ordered by set_index).
function groupByExercise(sets: RecapSessionSet[]): ExerciseGroup[] {
  const groups = new Map<string, ExerciseGroup>()
  for (const s of sets) {
    let group = groups.get(s.exercise_id)
    if (!group) {
      group = {
        exerciseId: s.exercise_id,
        name: s.exercises?.name ?? 'Unknown',
        loadType: s.exercises?.load_type ?? 'weight',
        sets: [],
      }
      groups.set(s.exercise_id, group)
    }
    group.sets.push(s)
  }
  return [...groups.values()]
}

// Compare against earlier workouts, or against the first set when this is a
// new exercise. The first set establishes a baseline; later sets in that
// same session can beat it.
export function findRecords(group: ExerciseGroup, prior: RecapSet[]): RecapRecord[] {
  if (group.sets.length === 0) return []
  const today = asHistory(group.sets)
  const baseline = prior.length > 0 ? prior : group.sets.slice(0, 1)
  const before = asHistory(baseline)
  const records: RecapRecord[] = []
  const add = (detail: string, value: string) =>
    records.push({ exerciseId: group.exerciseId, exerciseName: group.name, detail, value })

  switch (group.loadType) {
    case 'weight': {
      const priorBest = heaviestSetByUnit(before)
      for (const [unit, weight] of Object.entries(heaviestSetByUnit(today)) as [WeightUnit, number][]) {
        const was = priorBest[unit]
        if (was === undefined || weight <= was) continue
        const reps = Math.max(...group.sets.filter((s) => s.weight_unit === unit && s.weight === weight).map((s) => s.reps ?? 0))
        add(`Heaviest set · was ${formatNumber(was)} ${unit}`, `${formatNumber(weight)} ${unit} × ${reps}`)
      }
      break
    }
    case 'assisted': {
      const priorBest = leastAssistByUnit(before)
      for (const [unit, assist] of Object.entries(leastAssistByUnit(today)) as [WeightUnit, number][]) {
        const was = priorBest[unit]
        if (was === undefined || assist >= was) continue
        const reps = Math.max(...group.sets.filter((s) => s.weight_unit === unit && s.weight === assist).map((s) => s.reps ?? 0))
        add(`Least assist · was ${formatNumber(was)} ${unit}`, `${reps} × ${formatNumber(assist)} ${unit} assist`)
      }
      break
    }
    case 'bodyweight': {
      const best = Math.max(...group.sets.map((s) => s.reps ?? 0))
      const was = Math.max(...baseline.map((s) => s.reps ?? 0))
      if (best > was) add(`Most reps · was ${was}`, `${best} reps`)
      break
    }
    case 'level': {
      const best = bestLevelSet(today)
      const was = bestLevelSet(before)
      if (best && was && (best.level > was.level || (best.level === was.level && best.reps > was.reps))) {
        add(`Best level · was Level ${was.level} × ${was.reps}`, `Level ${best.level} × ${best.reps}`)
      }
      break
    }
    case 'timed': {
      const longest = longestDuration(today)
      const wasLongest = longestDuration(before)
      if (longest !== null && wasLongest !== null && longest > wasLongest) {
        add(`Longest · was ${formatSecondsAsClock(wasLongest)}`, formatSecondsAsClock(longest))
      }
      const priorFarthest = farthestDistanceByUnit(before)
      for (const [unit, distance] of Object.entries(farthestDistanceByUnit(today)) as [DistanceUnit, number][]) {
        const was = priorFarthest[unit]
        if (was === undefined || distance <= was) continue
        add(`Farthest · was ${formatDistance(was)} ${unit}`, `${formatDistance(distance)} ${unit}`)
      }
      break
    }
  }
  return records
}

// Issue #46: how far today's best est. 1RM beats the best across all prior
// history, with #21's chart rules (Epley, 1-12 reps, weight > 0, rounded,
// mixed units converted to the most-used unit across prior + today, newest
// set breaking a tie). Null for a first-ever exercise or no improvement.
export function e1rmGain(
  today: RecapSet[],
  prior: PriorSet[],
  todayPerformedAt: string,
  preferredUnit: WeightUnit | null = null,
): { delta: number; unit: WeightUnit } | null {
  const priorOldestFirst = [...prior].sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime())
  const unit = preferredUnit ?? mostUsedWeightUnit([
    ...priorOldestFirst.map((s) => ({ workoutId: s.workout_id, performedAt: s.performed_at, sets: [s as unknown as ExerciseHistorySet] })),
    { workoutId: '', performedAt: todayPerformedAt, sets: today as unknown as ExerciseHistorySet[] },
  ])
  if (!unit) return null
  const best = (sets: RecapSet[]) =>
    Math.max(-Infinity, ...sets.filter(isEpleyEligible).map((s) => Math.round(epley(convertWeight(s.weight, s.weight_unit, unit), s.reps!))))
  const was = best(prior)
  const now = best(today)
  if (!Number.isFinite(was) || !Number.isFinite(now) || now <= was) return null
  return { delta: now - was, unit }
}

// The one set that best represents an exercise's session, per load type.
function topSet<T extends RecapSet>(sets: T[], loadType: LoadType): T | null {
  if (sets.length === 0) return null
  const better = (a: T, b: T): boolean => {
    const ar = a.reps ?? 0
    const br = b.reps ?? 0
    switch (loadType) {
      case 'weight':
        return a.weight !== b.weight ? a.weight > b.weight : ar > br
      case 'bodyweight':
        return ar !== br ? ar > br : a.weight > b.weight
      case 'assisted':
        return a.weight !== b.weight ? a.weight < b.weight : ar > br
      case 'level':
        return (a.level ?? 0) !== (b.level ?? 0) ? (a.level ?? 0) > (b.level ?? 0) : ar > br
      case 'timed':
        if ((a.distance ?? 0) !== (b.distance ?? 0)) return (a.distance ?? 0) > (b.distance ?? 0)
        return (a.duration_seconds ?? 0) > (b.duration_seconds ?? 0)
    }
  }
  return sets.reduce((best, s) => (better(s, best) ? s : best))
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// Chip for "today's top set vs the last workout's top set". Never red: a
// lighter day reads as a neutral "Lighter"/"Shorter" (brand: no shame).
function compareTopSets(loadType: LoadType, today: RecapSet, last: RecapSet): { chip: string; tone: ChipTone } | null {
  const up = (chip: string) => ({ chip, tone: 'up' as const })
  const same = { chip: 'Same', tone: 'neutral' as const }
  const down = { chip: loadType === 'timed' ? 'Shorter' : 'Lighter', tone: 'neutral' as const }
  const repsDiff = (today.reps ?? 0) - (last.reps ?? 0)
  const byReps = () => (repsDiff > 0 ? up(`+${plural(repsDiff, 'rep')}`) : repsDiff < 0 ? down : same)

  if (loadType === 'timed') {
    if (today.distance !== null && last.distance !== null && today.distance_unit === last.distance_unit) {
      const diff = today.distance - last.distance
      if (diff > 0) return up(`+${formatDistance(diff)} ${today.distance_unit}`)
      if (diff < 0) return down
    }
    const diff = (today.duration_seconds ?? 0) - (last.duration_seconds ?? 0)
    return diff > 0 ? up(`+${formatSecondsAsClock(diff)}`) : diff < 0 ? down : same
  }
  if (loadType === 'level') {
    const diff = (today.level ?? 0) - (last.level ?? 0)
    if (diff > 0) return up(`+${plural(diff, 'level')}`)
    return diff < 0 ? down : byReps()
  }
  if (today.weight_unit !== last.weight_unit) return null
  if (loadType === 'bodyweight') {
    if (repsDiff !== 0) return byReps()
    const diff = today.weight - last.weight
    return diff > 0 ? up(`+${formatNumber(diff)} ${today.weight_unit}`) : diff < 0 ? down : same
  }
  if (loadType === 'assisted') {
    const less = last.weight - today.weight
    if (less > 0) return up(`${formatNumber(less)} ${today.weight_unit} less assist`)
    return less < 0 ? down : byReps()
  }
  const diff = today.weight - last.weight
  if (diff > 0) return up(`+${formatNumber(diff)} ${today.weight_unit}`)
  return diff < 0 ? down : byReps()
}

function todayLabel(loadType: LoadType, s: RecapSet): string {
  if (loadType === 'timed') {
    return s.distance !== null ? `${formatDistance(s.distance)} ${s.distance_unit ?? 'mi'}` : formatSecondsAsClock(s.duration_seconds ?? 0)
  }
  return formatSetLabel(loadType, s.reps, s.weight, s.weight_unit, s.level)
}

export function compareWithLastTime(group: ExerciseGroup, prior: PriorSet[]): RecapComparison | null {
  const today = topSet(group.sets, group.loadType)
  if (!today) return null
  const base = { exerciseId: group.exerciseId, exerciseName: group.name, today: todayLabel(group.loadType, today) }
  if (prior.length === 0) return { ...base, chip: 'New', tone: 'new' }

  const lastPerformedAt = prior.reduce((latest, s) => (s.performed_at > latest ? s.performed_at : latest), prior[0].performed_at)
  const lastWorkoutId = prior.find((s) => s.performed_at === lastPerformedAt)!.workout_id
  const last = topSet(prior.filter((s) => s.workout_id === lastWorkoutId), group.loadType)
  const result = last ? compareTopSets(group.loadType, today, last) : null
  return result ? { ...base, ...result } : null
}

function recapUnit(input: FinishRecapInput): WeightUnit {
  return input.preferredUnit ?? modeWeightUnit(input.workout.sets)
}

function buildHero(input: FinishRecapInput, groups: ExerciseGroup[]): VolumeHero | TimeHero | null {
  const { workout, templateSessions, bodyWeightEntries } = input
  const unit = recapUnit(input)
  const volume = workoutVolume(workout.sets, workout.performed_at, bodyWeightEntries, unit)

  if (volume.counted) {
    const sessions = templateSessions.slice(-6).map((w) => ({
      id: w.id,
      total: workoutVolume(w.sets, w.performed_at, bodyWeightEntries, unit).total,
    }))
    const max = Math.max(...sessions.map((s) => s.total), 1)
    const previous = sessions.length >= 2 ? sessions[sessions.length - 2] : null
    let delta: VolumeHero['delta'] = null
    if (previous && workout.templateName) {
      const diff = volume.total - previous.total
      const caption = `vs your last ${workout.templateName}`
      delta =
        diff > 0
          ? { label: `+${formatNumber(diff)} ${unit}`, tone: 'up', caption }
          : diff < 0
            ? { label: `−${formatNumber(-diff)} ${unit}`, tone: 'neutral', caption }
            : { label: 'Same', tone: 'neutral', caption }
    }
    return {
      kind: 'volume',
      value: formatNumber(volume.total),
      unit,
      delta,
      bars: sessions.length >= 2
        ? sessions.map((s) => ({
            heightPct: Math.max(4, Math.round((s.total / max) * 100)),
            label: `${formatNumber(s.total)} ${unit}`,
            isToday: s.id === workout.id,
          }))
        : [],
    }
  }

  const timed = groups
    .filter((g) => g.loadType === 'timed')
    .map((g) => ({ name: g.name, seconds: g.sets.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0) }))
    .filter((g) => g.seconds > 0)
  const totalSeconds = timed.reduce((sum, g) => sum + g.seconds, 0)
  if (totalSeconds === 0) return null
  return {
    kind: 'time',
    value: totalSeconds >= 60 ? String(Math.round(totalSeconds / 60)) : formatSecondsAsClock(totalSeconds),
    unit: totalSeconds >= 60 ? 'min' : '',
    segments: timed.map((g, i) => ({
      name: g.name,
      label: formatSecondsAsClock(g.seconds),
      pct: (g.seconds / totalSeconds) * 100,
      color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
    })),
  }
}

function buildTiles(input: FinishRecapInput, groups: ExerciseGroup[], hero: FinishRecap['hero'], durationSeconds: number): RecapTile[] {
  const sets = input.workout.sets
  const tiles: RecapTile[] = []
  const timeTile: RecapTile = { label: 'Time', value: formatSecondsAsClock(durationSeconds), unit: '', sub: 'start to finish' }

  if (sets.some((s) => s.exercises?.load_type !== 'timed')) {
    const reps = sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
    tiles.push({ label: 'Sets', value: String(sets.length), unit: '', sub: reps > 0 ? plural(reps, 'rep') : '' })
  }
  // "Time moving" already leads a cardio-only session; the Time tile would
  // just restate it, so it only comes back as a filler below.
  if (hero?.kind !== 'time') tiles.push(timeTile)

  const distanceByUnit = new Map<DistanceUnit, number>()
  for (const s of sets) {
    if (s.distance === null || s.distance_unit === null) continue
    distanceByUnit.set(s.distance_unit, (distanceByUnit.get(s.distance_unit) ?? 0) + s.distance)
  }
  const distanceNames = groups.filter((g) => g.sets.some((s) => s.distance !== null)).map((g) => g.name)
  for (const [unit, total] of distanceByUnit) {
    tiles.push({
      label: 'Distance',
      value: formatDistance(total),
      unit,
      sub: distanceNames.length === 1 ? distanceNames[0] : plural(distanceNames.length, 'exercise'),
    })
  }

  // Calories only ever appear as this session's own number (brand scope:
  // never a weekly "calories burned" total).
  const calorieSets = sets.filter((s) => s.calories !== null)
  if (calorieSets.length > 0) {
    tiles.push({
      label: 'Calories',
      value: formatNumber(calorieSets.reduce((sum, s) => sum + (s.calories ?? 0), 0)),
      unit: '',
      sub: 'from machine readouts',
    })
  }

  if (tiles.length < 2 && !tiles.includes(timeTile)) tiles.push(timeTile)
  return tiles.slice(0, 2)
}

function buildWeek(input: FinishRecapInput): RecapWeek {
  const unit = recapUnit(input)
  const days: WeekDayKind[] = [null, null, null, null, null, null, null]
  let volume = 0
  let cardioSeconds = 0
  for (const w of input.weekWorkouts) {
    // 0 = Sunday, matching startOfWeek's Sunday-based week (progressHub.ts).
    const index = new Date(w.performed_at).getDay()
    const hasStrength = w.sets.some((s) => s.exercises?.load_type !== 'timed')
    if (hasStrength) days[index] = 'strength'
    else if (w.sets.length > 0 && days[index] === null) days[index] = 'timed'
    volume += workoutVolume(w.sets, w.performed_at, input.bodyWeightEntries, unit).total
    // Issue #274: only cardio-group exercises count; a timed plank is core.
    for (const s of w.sets) if (s.exercises?.load_type === 'timed' && s.exercises.muscle_group === 'cardio') cardioSeconds += s.duration_seconds ?? 0
  }
  return {
    days,
    todayIndex: input.finishedAt.getDay(),
    workouts: input.weekWorkoutCount,
    volume: formatNumber(volume),
    volumeUnit: unit,
    cardioMinutes: Math.round(cardioSeconds / 60),
  }
}

// Issue #115: of this session's weight lifts with enough workouts behind them
// and at least two est. 1RM points to draw, the one with the most sets today
// (first logged on a tie).
export function findChartTeaser(
  groups: ExerciseGroup[],
  priorByExercise: Map<string, PriorSet[]>,
  workout: FinishRecapInput['workout'],
  preferredUnit: WeightUnit | null,
): ChartTeaser | null {
  let pick: ChartTeaser | null = null
  let pickSets = 0
  for (const group of groups) {
    if (group.loadType !== 'weight' || group.sets.length <= pickSets) continue
    const byWorkout = new Map<string, ExerciseHistoryWorkout>()
    for (const s of priorByExercise.get(group.exerciseId) ?? []) {
      let w = byWorkout.get(s.workout_id)
      if (!w) {
        w = { workoutId: s.workout_id, performedAt: s.performed_at, sets: [] }
        byWorkout.set(s.workout_id, w)
      }
      w.sets.push(s as unknown as ExerciseHistorySet)
    }
    byWorkout.set(workout.id, { workoutId: workout.id, performedAt: workout.performed_at, sets: group.sets as unknown as ExerciseHistorySet[] })
    if (byWorkout.size < CHART_TEASER_WORKOUTS) continue
    const points = buildProgressSeries([...byWorkout.values()], 'e1rm', preferredUnit).points
    if (points.length < 2) continue
    pick = { exerciseId: group.exerciseId, exerciseName: group.name, workoutCount: byWorkout.size, e1rm: points.map((p) => p.value) }
    pickSets = group.sets.length
  }
  return pick
}

export function buildFinishRecap(input: FinishRecapInput): FinishRecap {
  const { workout } = input
  const groups = groupByExercise(workout.sets)
  const durationSeconds = Math.max(0, Math.round((input.finishedAt.getTime() - new Date(workout.performed_at).getTime()) / 1000))

  const priorByExercise = new Map<string, PriorSet[]>()
  for (const s of input.priorSets) {
    if (!priorByExercise.has(s.exercise_id)) priorByExercise.set(s.exercise_id, [])
    priorByExercise.get(s.exercise_id)!.push(s)
  }

  const records: RecapRecord[] = []
  const comparisons: RecapComparison[] = []
  for (const group of groups) {
    const prior = priorByExercise.get(group.exerciseId) ?? []
    const groupRecords = findRecords(group, prior)
    if (groupRecords.length > 0) {
      if (group.loadType === 'weight') {
        const gain = e1rmGain(group.sets, prior, workout.performed_at, input.preferredUnit)
        if (gain) groupRecords[0].e1rmGain = `${formatNumber(gain.delta)} ${gain.unit}`
      }
      records.push(...groupRecords)
      continue
    }
    const comparison = compareWithLastTime(group, prior)
    if (comparison) comparisons.push(comparison)
  }

  const hero = buildHero(input, groups)
  const started = new Date(workout.performed_at)
  const dateLabel = started.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const minutes = Math.max(1, Math.round(durationSeconds / 60))

  return {
    firstTemplateRun: workout.templateName !== null && input.templateSessions.length <= 1,
    firstRunRoutine: input.hasEarlierWorkouts ? workout.templateName : null,
    hasEarlierWorkouts: !!input.hasEarlierWorkouts,
    title: `${workout.templateName ?? 'Freeform workout'}, done.`,
    meta: `${dateLabel} · ${minutes} min · ${plural(groups.length, 'exercise')}`,
    hero,
    tiles: buildTiles(input, groups, hero, durationSeconds),
    records,
    comparisons,
    week: buildWeek(input),
    chartTeaser: findChartTeaser(groups, priorByExercise, workout, input.preferredUnit),
  }
}
