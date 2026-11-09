// Issue #157: total volume per session of each routine, for the Progress
// hub's Routine progress screens. Pure, fed by the workouts store's one
// all-sets fetch (fetchProgressSets), same pattern as progressHub.ts.
// Volume follows volume.ts: level and timed sets are left out, bodyweight
// and assisted sets use the body weight on file at the workout, and every
// set is converted into one unit before it's added.
import type { LoadType, WeightUnit } from './types'
import type { BodyWeightEntryLike } from './bodyStats'
import type { ProgressExercise, ProgressSetRow, Trend } from './progressHub'
import { filterByRange, convertWeight } from './progressSeries'
import { formatSetLabel } from './setLabel'
import { modeWeightUnit, setVolume } from './volume'
import { formatNumber } from './finishRecap'

export interface TemplateSessionExercise {
  exerciseId: string
  name: string
  sets: number
  // The session's best set, e.g. "8 × 185 lb", "10 × BW + 25 lb", "20:00 · 2.1 mi".
  topSet: string
}

export interface TemplateSession {
  workoutId: string
  performedAt: string
  // In the template's unit; null when no set in the session adds volume
  // (a level- or timed-only session), so it's left off the chart.
  volume: number | null
  exercises: TemplateSessionExercise[]
}

export interface TemplateVolumeHistory {
  templateId: string
  name: string
  unit: WeightUnit
  // Oldest first.
  sessions: TemplateSession[]
}

// Sessions with volume, as chart points (oldest first).
export function volumePoints(history: TemplateVolumeHistory): { performedAt: string; value: number; workoutId: string }[] {
  return history.sessions
    .filter((s) => s.volume !== null)
    .map((s) => ({ performedAt: s.performedAt, value: s.volume as number, workoutId: s.workoutId }))
}

// Only workouts started from a template count; freeform ones are left out.
// `excludeWorkoutId` keeps the workout in progress off the chart.
export function templateVolumeHistories(
  rows: ProgressSetRow[],
  exercises: Pick<ProgressExercise, 'id' | 'name' | 'load_type'>[],
  bodyWeightEntries: BodyWeightEntryLike[],
  preferredUnit: WeightUnit | null,
  excludeWorkoutId: string | null = null,
): TemplateVolumeHistory[] {
  const exerciseById = new Map(exercises.map((e) => [e.id, e]))
  const byTemplate = new Map<string, ProgressSetRow[]>()
  for (const row of rows) {
    if (!row.template_id || row.workout_id === excludeWorkoutId) continue
    let list = byTemplate.get(row.template_id)
    if (!list) byTemplate.set(row.template_id, (list = []))
    list.push(row)
  }

  const histories: TemplateVolumeHistory[] = []
  for (const [templateId, templateRows] of byTemplate) {
    const unit = preferredUnit ?? modeWeightUnit(templateRows)
    const byWorkout = new Map<string, ProgressSetRow[]>()
    for (const row of templateRows) {
      let list = byWorkout.get(row.workout_id)
      if (!list) byWorkout.set(row.workout_id, (list = []))
      list.push(row)
    }
    const sessions: TemplateSession[] = [...byWorkout.entries()].map(([workoutId, sets]) => {
      const performedAt = sets[0].performed_at
      let total = 0
      let counted = false
      for (const s of sets) {
        const loadType = exerciseById.get(s.exercise_id)?.load_type ?? 'weight'
        const v = setVolume({ ...s, exercises: { load_type: loadType } }, performedAt, bodyWeightEntries)
        if (v === null) continue
        total += convertWeight(v, s.weight_unit, unit)
        counted = true
      }
      return { workoutId, performedAt, volume: counted ? total : null, exercises: sessionExercises(sets, exerciseById) }
    })
    sessions.sort((a, b) => new Date(a.performedAt).getTime() - new Date(b.performedAt).getTime())
    // The newest session's name, so a renamed template shows its current name.
    const newest = templateRows.reduce((a, b) => (new Date(b.performed_at).getTime() > new Date(a.performed_at).getTime() ? b : a))
    histories.push({ templateId, name: newest.template_name ?? 'Routine', unit, sessions })
  }
  return histories
}

// Each exercise in the session, in the order it was first logged, with its
// best set: the heaviest for weight lifts (most reps on a tie), the most added
// weight for bodyweight, the least assist, the highest level, the longest
// timed set.
function sessionExercises(
  sets: ProgressSetRow[],
  exerciseById: Map<string, Pick<ProgressExercise, 'id' | 'name' | 'load_type'>>,
): TemplateSessionExercise[] {
  const order = [...sets].sort((a, b) => (a.set_index ?? Infinity) - (b.set_index ?? Infinity))
  const byExercise = new Map<string, ProgressSetRow[]>()
  for (const s of order) {
    let list = byExercise.get(s.exercise_id)
    if (!list) byExercise.set(s.exercise_id, (list = []))
    list.push(s)
  }
  return [...byExercise.entries()].map(([exerciseId, list]) => {
    const exercise = exerciseById.get(exerciseId)
    const loadType: LoadType = exercise?.load_type ?? 'weight'
    const top = list.reduce((best, s) => (isBetterSet(loadType, s, best) ? s : best))
    return {
      exerciseId,
      name: exercise?.name ?? 'Exercise',
      sets: list.length,
      topSet: formatSetLabel(loadType, top.reps, top.weight, top.weight_unit, top.level, {
        durationSeconds: top.duration_seconds,
        distance: top.distance,
        distanceUnit: top.distance_unit,
        incline: top.incline,
        calories: top.calories,
      }),
    }
  })
}

function isBetterSet(loadType: LoadType, a: ProgressSetRow, b: ProgressSetRow): boolean {
  const reps = (a.reps ?? 0) - (b.reps ?? 0)
  if (loadType === 'timed') return (a.duration_seconds ?? 0) > (b.duration_seconds ?? 0)
  if (loadType === 'level') {
    const level = (a.level ?? 0) - (b.level ?? 0)
    return level > 0 || (level === 0 && reps > 0)
  }
  const load = convertWeight(a.weight, a.weight_unit, 'lb') - convertWeight(b.weight, b.weight_unit, 'lb')
  const better = loadType === 'assisted' ? -load : load
  return better > 0 || (better === 0 && reps > 0)
}

export interface TemplateProgressRow {
  templateId: string
  name: string
  lastPerformedAt: string
  sessionCount: number
  // "12,450 lb", the latest session with volume; null when none has any.
  headline: string | null
  spark: number[]
  // Latest against the first of the last 3 months (all time when fewer than
  // 2 sessions are that recent), like Lift progress.
  pill: { trend: Trend; text: string } | null
}

export function formatVolume(value: number, unit: WeightUnit): string {
  return `${formatNumber(value)} ${unit}`
}

// Most recently trained first.
export function templateProgressRows(histories: TemplateVolumeHistory[], now: Date = new Date()): TemplateProgressRow[] {
  return histories
    .map((h) => {
      const points = volumePoints(h)
      const recent = filterByRange(points, '3M', now)
      const shown = recent.length >= 2 ? recent : points
      const latest = points[points.length - 1]
      let pill: TemplateProgressRow['pill'] = null
      if (shown.length >= 2) {
        const change = Math.round(shown[shown.length - 1].value) - Math.round(shown[0].value)
        pill =
          change > 0
            ? { trend: 'up', text: `▲ ${formatNumber(change)}` }
            : change < 0
              ? { trend: 'down', text: `▼ ${formatNumber(-change)}` }
              : { trend: 'flat', text: 'no change' }
      }
      return {
        templateId: h.templateId,
        name: h.name,
        lastPerformedAt: h.sessions[h.sessions.length - 1].performedAt,
        sessionCount: h.sessions.length,
        headline: latest ? formatVolume(latest.value, h.unit) : null,
        spark: shown.map((p) => p.value),
        pill,
      }
    })
    .sort((a, b) => new Date(b.lastPerformedAt).getTime() - new Date(a.lastPerformedAt).getTime())
}
