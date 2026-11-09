import type { BackupFile } from './backup'
import type { LoadType } from './types'
import { combineExerciseNotes } from './exerciseNotes'

// Issue #208: import workout history from another app's CSV export (Strong
// and Hevy so far), read on the device. This file is pure (type imports
// and the dependency-free exerciseNotes.ts only) so the Node unit spec can load it: parsing, what each exercise looks
// like it tracks, and turning the confirmed answers into a history-only
// partial backup that repos.backup.merge() adds (src/lib/backupMerge.ts), so
// both data paths write it the way a partial restore does.
// Exercise matching lives in importMatch.ts, which needs the library.

type Row = Record<string, unknown>
type WeightUnit = 'lb' | 'kg'
type DistanceUnit = 'mi' | 'km'

export type ImportApp = 'strong' | 'hevy'

export const IMPORT_APPS: { app: ImportApp; label: string; fileName: string; steps: string[] }[] = [
  {
    app: 'strong',
    label: 'Strong',
    fileName: 'strong_workouts.csv',
    steps: ['In Strong, open Profile, then Settings.', 'Tap Export Workouts (free, no Pro needed).', 'Save the CSV to Files or Downloads.'],
  },
  {
    app: 'hevy',
    label: 'Hevy',
    fileName: 'workout_data.csv',
    steps: ['In Hevy, open Profile, then Settings.', 'Tap Export & Import Data, then Export Workouts.', 'Save the CSV to Files or Downloads.'],
  },
]

export function appLabel(app: ImportApp): string {
  return IMPORT_APPS.find((a) => a.app === app)!.label
}

export interface ImportedSet {
  exercise: string
  warmup: boolean
  // Negative in both apps for an assisted exercise's assist.
  weight: number | null
  // Null when the file doesn't say (Strong's newer exports); the user picks.
  unit: WeightUnit | null
  reps: number | null
  durationSeconds: number | null
  distance: number | null
  distanceUnit: DistanceUnit | null
  rpe: number | null
}

export interface ImportedWorkout {
  startedAt: string
  name: string
  notes: string
  exerciseNotes: { exercise: string; note: string }[]
  sets: ImportedSet[]
}

export interface ParsedImport {
  app: ImportApp
  workouts: ImportedWorkout[]
  // False when some weight has no unit in the file.
  unitsKnown: boolean
  // Rows that weren't blank but had no exercise, no readable date, or no
  // readable set number, so they were left out (#484).
  unreadable: number
}

// RFC 4180, plus a BOM and either comma or semicolon (Strong uses semicolons
// in locales with a decimal comma).
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.slice(0, src.search(/\r?\n|$/))
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const headerKey = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

// Which app a file's header row looks like, or null.
export function detectApp(text: string): ImportApp | null {
  const header = new Set((parseCsv(text.slice(0, 2000))[0] ?? []).map(headerKey))
  if (header.has('exercise_name') && header.has('set_order')) return 'strong'
  if (header.has('exercise_title') && header.has('start_time')) return 'hevy'
  return null
}

function num(value: string | undefined): number | null {
  const t = (value ?? '').trim()
  if (t === '') return null
  const n = Number(/^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t)
  return Number.isFinite(n) ? n : null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// Local time, as both apps write it: "2024-03-04 18:05:32" (Strong) or
// "4 Mar 2024, 18:05" (Hevy). Anything else goes through Date.parse.
export function parseImportDate(value: string): string | null {
  const t = value.trim()
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).toISOString()
  m = t.match(/^(\d{1,2}) ([A-Za-z]{3})[A-Za-z]* (\d{4}),? (\d{1,2}):(\d{2})/)
  if (m && MONTHS.includes(m[2].toLowerCase())) {
    return new Date(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1], +m[4], +m[5]).toISOString()
  }
  const parsed = Date.parse(t)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

function weightUnitOf(value: string | undefined): WeightUnit | null {
  const t = (value ?? '').trim().toLowerCase()
  if (t.startsWith('lb')) return 'lb'
  if (t.startsWith('kg')) return 'kg'
  return null
}

function rpeOf(value: string | undefined): number | null {
  const n = num(value)
  return n !== null && n > 0 && n <= 10 ? n : null
}

// Groups rows into workouts by start time and name, in file order.
function grouped<T>(items: T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const group = groups.get(k) ?? []
    group.push(item)
    groups.set(k, group)
  }
  return [...groups.values()]
}

type Cells = (name: string) => string | undefined

function readRows(text: string): Cells[] {
  const [header, ...rows] = parseCsv(text)
  const index = new Map((header ?? []).map((h, i) => [headerKey(h), i]))
  return rows.map((row) => (name: string) => {
    const i = index.get(name)
    return i === undefined ? undefined : row[i]
  })
}

function noteLines(rows: { exercise: string; note: string }[]) {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = `${r.exercise}\n${r.note}`
    if (!r.note || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// Strong: Date, Workout Name, Duration, Exercise Name, Set Order (1, 2, ...;
// W warm-up, D drop, F failure; "Rest Timer" and "Note" rows carry no set),
// Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE. Older exports
// add Weight Unit and Distance Unit; newer ones are in the app's own unit.
function parseStrong(text: string): ParsedImport {
  const all = readRows(text)
  const rows = all.filter((c) => (c('exercise_name') ?? '').trim() && parseImportDate(c('date') ?? ''))
  let unreadable = all.length - rows.length
  let unitsKnown = true
  const workouts = grouped(rows, (c) => `${c('date')}\n${c('workout_name')}`).map((group): ImportedWorkout => {
    const first = group[0]
    const sets: ImportedSet[] = []
    for (const c of group) {
      const order = (c('set_order') ?? '').trim().toUpperCase()
      if (!/^(\d+|W|D|F)$/.test(order)) {
        if (!/^(rest timer|note)$/i.test(order)) unreadable++
        continue
      }
      const unit = weightUnitOf(c('weight_unit'))
      const weight = num(c('weight'))
      if (weight && !unit) unitsKnown = false
      const distanceUnitText = (c('distance_unit') ?? '').trim().toLowerCase()
      let distance = num(c('distance'))
      let distanceUnit: DistanceUnit | null = distanceUnitText.startsWith('mi') ? 'mi' : distanceUnitText.startsWith('km') ? 'km' : null
      if (distanceUnitText === 'm' && distance !== null) {
        distance = distance / 1000
        distanceUnit = 'km'
      }
      sets.push({
        exercise: c('exercise_name')!.trim(),
        warmup: order === 'W',
        weight,
        unit,
        reps: num(c('reps')),
        durationSeconds: num(c('seconds')),
        distance,
        distanceUnit,
        rpe: rpeOf(c('rpe')),
      })
    }
    return {
      startedAt: parseImportDate(first('date')!)!,
      name: (first('workout_name') ?? '').trim(),
      notes: (first('workout_notes') ?? '').trim(),
      exerciseNotes: noteLines(group.map((c) => ({ exercise: (c('exercise_name') ?? '').trim(), note: (c('notes') ?? '').trim() }))),
      sets,
    }
  })
  return { app: 'strong', workouts: workouts.filter((w) => w.sets.length > 0), unitsKnown, unreadable }
}

// Hevy: title, start_time, end_time, description, exercise_title,
// superset_id, exercise_notes, set_index, set_type (normal, warmup, dropset,
// failure), weight_lbs or weight_kg, reps, distance_miles or distance_km,
// duration_seconds, rpe.
function parseHevy(text: string): ParsedImport {
  const all = readRows(text)
  const rows = all.filter((c) => (c('exercise_title') ?? '').trim() && parseImportDate(c('start_time') ?? ''))
  const workouts = grouped(rows, (c) => `${c('start_time')}\n${c('title')}`).map((group): ImportedWorkout => {
    const first = group[0]
    const sets = group.map((c): ImportedSet => {
      const kg = num(c('weight_kg'))
      const km = num(c('distance_km'))
      return {
        exercise: c('exercise_title')!.trim(),
        warmup: (c('set_type') ?? '').trim().toLowerCase() === 'warmup',
        weight: kg ?? num(c('weight_lbs')),
        unit: kg !== null ? 'kg' : 'lb',
        reps: num(c('reps')),
        durationSeconds: num(c('duration_seconds')),
        distance: km ?? num(c('distance_miles')),
        distanceUnit: km !== null ? 'km' : 'mi',
        rpe: rpeOf(c('rpe')),
      }
    })
    return {
      startedAt: parseImportDate(first('start_time')!)!,
      name: (first('title') ?? '').trim(),
      notes: (first('description') ?? '').trim(),
      exerciseNotes: noteLines(group.map((c) => ({ exercise: (c('exercise_title') ?? '').trim(), note: (c('exercise_notes') ?? '').trim() }))),
      sets,
    }
  })
  return { app: 'hevy', workouts, unitsKnown: true, unreadable: all.length - rows.length }
}

// Null when the file isn't that app's export or has no workouts in it.
export function parseImport(text: string, app: ImportApp): ParsedImport | null {
  if (detectApp(text) !== app) return null
  const parsed = app === 'strong' ? parseStrong(text) : parseHevy(text)
  parsed.workouts.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  return parsed.workouts.length > 0 ? parsed : null
}

export interface SourceExercise {
  name: string
  sets: number
  loadType: LoadType
  tracksDistance: boolean
}

// What a source exercise looks like it tracks, from its name and sets.
export function inferLoadType(name: string, sets: ImportedSet[]): { loadType: LoadType; tracksDistance: boolean } {
  const working = sets.filter((s) => !s.warmup)
  const pool = working.length > 0 ? working : sets
  const hasReps = pool.some((s) => (s.reps ?? 0) > 0)
  const timed = !hasReps && pool.some((s) => (s.durationSeconds ?? 0) > 0)
  if (timed) return { loadType: 'timed', tracksDistance: pool.some((s) => (s.distance ?? 0) > 0) }
  if (/assist/i.test(name) || pool.some((s) => (s.weight ?? 0) < 0)) return { loadType: 'assisted', tracksDistance: false }
  if (/body ?weight|weighted/i.test(name) || pool.every((s) => !s.weight)) return { loadType: 'bodyweight', tracksDistance: false }
  return { loadType: 'weight', tracksDistance: false }
}

// One per distinct exercise name, most sets first.
export function sourceExercises(parsed: ParsedImport): SourceExercise[] {
  const byName = new Map<string, ImportedSet[]>()
  for (const workout of parsed.workouts) {
    for (const set of workout.sets) {
      const list = byName.get(set.exercise) ?? []
      list.push(set)
      byName.set(set.exercise, list)
    }
  }
  return [...byName]
    .map(([name, sets]) => ({ name, sets: sets.length, ...inferLoadType(name, sets) }))
    .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name))
}

export function warmupCount(parsed: ParsedImport): number {
  return parsed.workouts.reduce((n, w) => n + w.sets.filter((s) => s.warmup).length, 0)
}

// Where a source exercise's sets go: one of the user's exercises (by id), or
// an exercise row to add (from the library, or new). The merge reuses an
// existing exercise with the same library_id or name, so a library pick the
// user already owns doesn't make a duplicate.
export type ImportTarget =
  | { kind: 'mine'; exerciseId: string; name: string; loadType: LoadType; tracksDistance: boolean }
  | { kind: 'add'; row: Row & { name: string; load_type: LoadType; tracks_distance?: boolean } }

// A set as the sets table stores it, or null when it can't be one (no reps
// for a rep exercise, no time for a timed one).
export function setRow(set: ImportedSet, loadType: LoadType, tracksDistance: boolean, fallbackUnit: WeightUnit): Row | null {
  const unit = set.unit ?? fallbackUnit
  const rpe = set.rpe
  if (loadType === 'timed') {
    const duration = Math.round(set.durationSeconds ?? 0)
    if (duration <= 0) return null
    const hasDistance = tracksDistance && set.distance !== null && set.distance >= 0
    return {
      reps: null,
      weight: 0,
      weight_unit: unit,
      rpe,
      duration_seconds: duration,
      distance: hasDistance ? set.distance : null,
      distance_unit: hasDistance ? set.distanceUnit ?? (unit === 'kg' ? 'km' : 'mi') : null,
    }
  }
  const reps = Math.round(set.reps ?? 0)
  if (reps <= 0 || loadType === 'level') return null
  const raw = set.weight ?? 0
  let weight: number
  if (loadType === 'assisted') weight = Math.abs(raw)
  else if (raw < 0) return null
  else weight = raw
  return { reps, weight, weight_unit: unit, rpe }
}

const round2 = (n: unknown) => (n === null || n === undefined || n === '' ? '' : String(Math.round(Number(n) * 100) / 100))

// A set's identity for the duplicate check: the exercise and every number.
export function setSignature(exerciseId: string, row: Row): string {
  return [exerciseId, row.reps ?? '', round2(row.weight), row.weight_unit, row.duration_seconds ?? '', round2(row.distance), row.distance_unit ?? ''].join('|')
}

export function localDayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

// Existing workouts as `${day}\n${sorted set signatures}`.
export function existingWorkoutKeys(workouts: Row[], sets: Row[]): Set<string> {
  const byWorkout = new Map<string, string[]>()
  for (const s of sets) {
    const list = byWorkout.get(String(s.workout_id)) ?? []
    list.push(setSignature(String(s.exercise_id), s))
    byWorkout.set(String(s.workout_id), list)
  }
  const keys = new Set<string>()
  for (const w of workouts) {
    const sigs = byWorkout.get(String(w.id))
    if (sigs) keys.add(`${localDayKey(String(w.performed_at))}\n${[...sigs].sort().join('\n')}`)
  }
  return keys
}

export interface ImportPlan {
  file: BackupFile
  workouts: number
  sets: number
  // Already there: same day, same sets.
  skipped: number
}

// The history-only partial backup the confirmed answers make. A workout is
// skipped when one on the same day already has exactly its sets, whether it
// came from an earlier import or was typed in (decided in the mockup review).
export function buildImportPlan(options: {
  parsed: ParsedImport
  targets: Map<string, ImportTarget>
  includeWarmups: boolean
  fallbackUnit: WeightUnit
  existingKeys: Set<string>
  now?: Date
}): ImportPlan {
  const { parsed, targets, includeWarmups, fallbackUnit, existingKeys } = options
  const label = appLabel(parsed.app)
  const exercises: Row[] = []
  const exerciseIds = new Map<string, string>()
  for (const [source, target] of targets) {
    const id = `import-exercise-${exercises.length}`
    exerciseIds.set(source, id)
    // An existing exercise matches by name in the merge, so no library_id
    // that could pull it toward a different exercise with the same link.
    exercises.push(target.kind === 'mine' ? { id, name: target.name, library_id: null, load_type: target.loadType } : { ...target.row, id })
  }

  const workouts: Row[] = []
  const sets: Row[] = []
  const exerciseNotes: Row[] = []
  let skipped = 0
  for (const workout of parsed.workouts) {
    const rows: { exerciseId: string; row: Row; signature: string | null }[] = []
    for (const set of workout.sets) {
      if (set.warmup && !includeWarmups) continue
      const target = targets.get(set.exercise)
      if (!target) continue
      const loadType = target.kind === 'mine' ? target.loadType : target.row.load_type
      const tracksDistance = target.kind === 'mine' ? target.tracksDistance : !!target.row.tracks_distance
      const row = setRow(set, loadType, tracksDistance, fallbackUnit)
      if (!row) continue
      rows.push({
        exerciseId: exerciseIds.get(set.exercise)!,
        row,
        signature: target.kind === 'mine' ? setSignature(target.exerciseId, row) : null,
      })
    }
    if (rows.length === 0) continue
    // A set on an exercise that doesn't exist yet can't be a duplicate.
    if (rows.every((r) => r.signature !== null)) {
      const key = `${localDayKey(workout.startedAt)}\n${rows.map((r) => r.signature!).sort().join('\n')}`
      if (existingKeys.has(key)) {
        skipped++
        continue
      }
    }
    const id = `import-workout-${workouts.length}`
    // Issue #535: a note on an exercise this workout has sets of is that
    // exercise's note for the workout. Any other stays in the workout note.
    const loggedExercises = new Set(rows.map((r) => r.exerciseId))
    const notesByExercise = new Map<string, string | null>()
    const leftover: string[] = []
    for (const n of workout.exerciseNotes) {
      const exerciseId = exerciseIds.get(n.exercise)
      if (exerciseId && loggedExercises.has(exerciseId)) notesByExercise.set(exerciseId, combineExerciseNotes(notesByExercise.get(exerciseId), n.note))
      else leftover.push(`${n.exercise}: ${n.note}`)
    }
    for (const [exerciseId, note] of notesByExercise) {
      if (note) exerciseNotes.push({ workout_id: id, exercise_id: exerciseId, note })
    }
    const notes = [workout.name ? `From ${label}: ${workout.name}` : `From ${label}`, workout.notes, ...leftover].filter(Boolean)
    workouts.push({ id, template_id: null, performed_at: workout.startedAt, notes: notes.join('\n'), imported: true })
    rows.forEach(({ exerciseId, row }, index) => sets.push({ ...row, id: `${id}-set-${index}`, workout_id: id, exercise_id: exerciseId, set_index: index }))
  }

  // Only the exercises some imported set uses.
  const used = new Set(sets.map((s) => String(s.exercise_id)))
  const file = {
    format: 'repbunny-backup',
    version: 2,
    includes: ['history'],
    exported_at: (options.now ?? new Date()).toISOString(),
    exercises: exercises.filter((e) => used.has(String(e.id))),
    workout_templates: [],
    workout_template_exercises: [],
    workouts,
    sets,
    body_weight_entries: [],
    body_measurements: [],
    workout_exercise_notes: exerciseNotes,
  } as BackupFile
  return { file, workouts: workouts.length, sets: sets.length, skipped }
}
