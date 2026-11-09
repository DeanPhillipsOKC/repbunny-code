import type { BackupFile, BackupTable } from './backup'
import type { ProfilePatch } from '../data/types'
import { combineExerciseNotes } from './exerciseNotes'
import { remapWorkoutEvents } from './workoutEvents'

// Issue #93: restoring a partial file (say, a friend's templates) adds to
// what's there instead of replacing it. Both adapters run this same plan and
// only differ in how they write the rows, so its only runtime imports are the
// pure workoutEvents.ts and exerciseNotes.ts.
//
// - An exercise matches an existing one by library_id, then by name (case
//   and surrounding spaces ignored), unarchived first. A match is reused,
//   and (#95) comes back from the archive if the file has it unarchived or
//   an added template uses it. Its blank setup fields are filled from the
//   file; anything already set is kept.
// - A template with the same name (or that name plus " (n)") and the same exercises (order and target
//   sets) as an existing one is skipped (#95), and the file's workouts point
//   at the existing one. Otherwise it's added, with " (2)", " (3)", ... when
//   an unarchived template already has the name. Archived names don't count.
// - Workouts, sets, weigh-ins, and measurements (#139) are added. A workout whose template isn't
//   in the file becomes freeform. Rows pointing at something missing are
//   skipped, and each workout's sets are renumbered from 0, as restore does.
// - Exercise notes (#535) follow their workout and exercise. Two that land on
//   the same pair (two file exercises matching one) are kept as two lines.
// - Preferences overwrite the current ones only if the file has them.

type Row = Record<string, unknown>

// What a file can include. A v1 file, or a v2 file with all three, is a full
// backup (restore replaces everything); anything less merges in.
export const BACKUP_PARTS = ['preferences', 'templates', 'history'] as const
export type BackupPart = (typeof BACKUP_PARTS)[number]

export function isFullBackup(backup: Pick<BackupFile, 'version' | 'includes'>): boolean {
  if (backup.version !== 2 || !Array.isArray(backup.includes)) return true
  return BACKUP_PARTS.every((part) => backup.includes!.includes(part))
}

type TableRows = Record<BackupTable, Row[]>

// Issue #95: which rows a file gets. A full backup keeps everything. A
// partial one without history leaves out archived templates, and its
// exercises are the unarchived ones plus any a kept template or set uses.
// With history, every template stays, since old workouts point at them.
export function selectBackupRows(all: TableRows, includes: readonly BackupPart[]): TableRows {
  const wants = (part: BackupPart) => includes.includes(part)
  const full = BACKUP_PARTS.every(wants)
  const templates = !wants('templates') ? [] : full || wants('history') ? all.workout_templates : all.workout_templates.filter((t) => !isTrue(t.is_archived))
  const keptTemplates = new Set(templates.map((t) => String(t.id)))
  const templateExercises = all.workout_template_exercises.filter((r) => keptTemplates.has(String(r.template_id)))
  const sets = wants('history') ? all.sets : []

  let exercises: Row[] = []
  if (full) exercises = all.exercises
  else if (wants('templates') || wants('history')) {
    const used = new Set([...templateExercises.map((r) => String(r.exercise_id)), ...sets.map((s) => String(s.exercise_id))])
    exercises = all.exercises.filter((e) => used.has(String(e.id)) || (wants('templates') && !isTrue(e.is_archived)))
  }
  const keptExercises = new Set(exercises.map((e) => String(e.id)))
  return {
    exercises,
    workout_templates: templates,
    workout_template_exercises: templateExercises,
    workouts: wants('history') ? all.workouts : [],
    sets,
    body_weight_entries: wants('history') ? all.body_weight_entries : [],
    body_measurements: wants('history') ? all.body_measurements : [],
    workout_exercise_notes: wants('history') ? (all.workout_exercise_notes ?? []).filter((n) => keptExercises.has(String(n.exercise_id))) : [],
  }
}

export type ExistingTemplate = {
  id: string
  name: string
  is_archived: boolean
  // In position order.
  exercises: { exercise_id: string; target_sets: number | null }[]
}

export type ExistingExercise = Row & { id: string; name: string; library_id: string | null; is_archived: boolean }

export type ExistingData = {
  // Whole rows, so blank fields can be filled.
  exercises: ExistingExercise[]
  templates: ExistingTemplate[]
}

export type ExerciseUpdate = { id: string; patch: Row; before: Row }

export type MergePlan = {
  exercises: Row[]
  // Reused exercises that come back from the archive or get blanks filled.
  // `before` has the old values.
  exerciseUpdates: ExerciseUpdate[]
  workout_templates: Row[]
  workout_template_exercises: Row[]
  workouts: Row[]
  sets: Row[]
  body_weight_entries: Row[]
  body_measurements: Row[]
  workout_exercise_notes: Row[]
  profile: ProfilePatch | null
  reusedExercises: number
  unarchivedExercises: number
  skippedTemplates: number
}

const PROFILE_KEYS = [
  'height',
  'height_unit',
  'missing_weight_prompt_opt_out',
  'weight_reminder',
  'plates_lb',
  'plates_kg',
  'weight_unit',
  'prefill_mode',
  'default_rest_seconds',
] as const

// Columns that are never null in either schema; a null in the file means
// "not set" there, so it's skipped rather than written.
const NOT_NULL_PROFILE_KEYS = new Set(['missing_weight_prompt_opt_out', 'weight_reminder', 'plates_lb', 'plates_kg', 'prefill_mode', 'weight_unit'])

// Just the preferences the file has, for a merge or a full restore.
export function profilePatchFrom(profile: BackupFile['profile'], keys: readonly string[] = PROFILE_KEYS): ProfilePatch | null {
  if (!profile || typeof profile !== 'object') return null
  const patch: Row = {}
  for (const key of keys) {
    const value = (profile as Row)[key]
    if (value === undefined) continue
    if (value === null && NOT_NULL_PROFILE_KEYS.has(key)) continue
    patch[key] = Array.isArray(value) ? value.map(Number) : value
  }
  return Object.keys(patch).length > 0 ? (patch as ProfilePatch) : null
}

// The v2-only preferences. restore_my_data() predates them, so a full
// restore applies these afterward.
export const V2_PROFILE_KEYS = ['weight_unit', 'prefill_mode', 'default_rest_seconds'] as const

function isTrue(value: unknown) {
  return value === true || value === 1
}

function targetSets(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function byPosition(a: Row, b: Row) {
  return Number(a.position) - Number(b.position)
}

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const k = String(row[key])
    const group = groups.get(k) ?? []
    group.push(row)
    groups.set(k, group)
  }
  return groups
}

// The adapters' rows (decoded, so booleans and arrays are real) as a plan's input.
export function existingDataFrom(exercises: Row[], templates: Row[], templateExercises: Row[]): ExistingData {
  const byTemplate = groupBy(templateExercises, 'template_id')
  return {
    exercises: exercises.map((e) => ({
      ...e,
      id: String(e.id),
      name: String(e.name ?? ''),
      library_id: typeof e.library_id === 'string' && e.library_id ? e.library_id : null,
      is_archived: isTrue(e.is_archived),
    })),
    templates: templates.map((t) => ({
      id: String(t.id),
      name: String(t.name ?? ''),
      is_archived: isTrue(t.is_archived),
      exercises: [...(byTemplate.get(String(t.id)) ?? [])]
        .sort(byPosition)
        .map((r) => ({ exercise_id: String(r.exercise_id), target_sets: targetSets(r.target_sets) })),
    })),
  }
}

// Fields a reused exercise takes from the file when it has none of its own.
// A group fills only when every field in it is blank, so pairs the schema
// checks together (a rep range, a custom bar's weight and unit) stay whole.
const FILL_GROUPS = [
  ['setup_notes'],
  ['rest_seconds'],
  ['muscle_group'],
  ['also_works'],
  ['uses_barbell'],
  ['bar_type', 'bar_custom_weight', 'bar_custom_unit'],
  ['weight_step', 'weight_step_unit'],
  ['rep_range_min', 'rep_range_max'],
  ['push_pull'],
]

function blank(value: unknown) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function fillPatch(existing: Row, incoming: Row): Row {
  const patch: Row = {}
  for (const group of FILL_GROUPS) {
    if (!group.every((key) => blank(existing[key])) || group.every((key) => blank(incoming[key]))) continue
    for (const key of group) if (!blank(incoming[key])) patch[key] = incoming[key]
  }
  return patch
}

const nameKey = (name: unknown) => String(name ?? '').trim().toLowerCase()

// "Pull Day (2)" counts as "Pull Day" for the identical-template check, so
// merging the same file twice doesn't add "Pull Day (3)".
const baseNameKey = (name: unknown) => nameKey(name).replace(/ \(\d+\)$/, '')

const signature = (items: { exercise_id: string; target_sets: number | null }[]) =>
  JSON.stringify(items.map((r) => [r.exercise_id, r.target_sets]))

// `id` and `user_id` are replaced; everything else is the file's own row.
function copy(row: Row, overrides: Row): Row {
  const out: Row = { ...row, ...overrides }
  delete out.user_id
  return out
}

export function planMerge(file: BackupFile, existing: ExistingData, newId: () => string): MergePlan {
  const rows = (table: BackupTable) => (Array.isArray(file[table]) ? file[table] : [])

  // Unarchived first, so a match prefers the exercise the user can see.
  const candidates = [...existing.exercises].sort((a, b) => Number(a.is_archived) - Number(b.is_archived))
  const existingById = new Map(existing.exercises.map((e) => [e.id, e]))
  const byLibrary = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const e of candidates) {
    if (e.library_id && !byLibrary.has(e.library_id)) byLibrary.set(e.library_id, e.id)
    if (!byName.has(nameKey(e.name))) byName.set(nameKey(e.name), e.id)
  }

  const plan: MergePlan = {
    exercises: [],
    exerciseUpdates: [],
    workout_templates: [],
    workout_template_exercises: [],
    workouts: [],
    sets: [],
    body_weight_entries: [],
    body_measurements: [],
    workout_exercise_notes: [],
    profile: profilePatchFrom(file.profile),
    reusedExercises: 0,
    unarchivedExercises: 0,
    skippedTemplates: 0,
  }

  const exerciseIds = new Map<string, string>()
  // Existing exercise id -> the first file row that matched it.
  const reused = new Map<string, Row>()
  for (const row of rows('exercises')) {
    const libraryId = typeof row.library_id === 'string' && row.library_id ? row.library_id : null
    const match = (libraryId && byLibrary.get(libraryId)) || byName.get(nameKey(row.name))
    if (match) {
      exerciseIds.set(String(row.id), match)
      plan.reusedExercises++
      if (existingById.has(match) && !reused.has(match)) reused.set(match, row)
      continue
    }
    const id = newId()
    exerciseIds.set(String(row.id), id)
    plan.exercises.push(copy(row, { id }))
    // Two rows in one file with the same name land as one exercise.
    if (libraryId) byLibrary.set(libraryId, id)
    byName.set(nameKey(row.name), id)
  }

  // The file's template rows in position order, with this account's
  // exercise ids. Rows pointing at a missing exercise are dropped.
  const fileTemplateRows = groupBy(
    rows('workout_template_exercises').filter((r) => exerciseIds.has(String(r.exercise_id))),
    'template_id',
  )
  const mappedRows = (templateId: string) =>
    [...(fileTemplateRows.get(templateId) ?? [])]
      .sort(byPosition)
      .map((r) => ({ row: r, exercise_id: exerciseIds.get(String(r.exercise_id))!, target_sets: targetSets(r.target_sets) }))

  const known = [...existing.templates]
  const takenNames = new Set(known.filter((t) => !t.is_archived).map((t) => nameKey(t.name)))
  const templateIds = new Map<string, string>()
  const neededExercises = new Set<string>()
  for (const row of rows('workout_templates')) {
    const archived = isTrue(row.is_archived)
    const items = mappedRows(String(row.id))
    const sig = signature(items)
    // An unarchived file template only matches an unarchived one, so a
    // template the user archived doesn't swallow one they're bringing back.
    const same = known.find((t) => baseNameKey(t.name) === nameKey(row.name) && (archived || !t.is_archived) && signature(t.exercises) === sig)
    if (same) {
      templateIds.set(String(row.id), same.id)
      plan.skippedTemplates++
      continue
    }
    const base = String(row.name ?? '')
    let name = base
    if (!archived) for (let n = 2; takenNames.has(nameKey(name)); n++) name = `${base} (${n})`
    if (!archived) takenNames.add(nameKey(name))
    const id = newId()
    templateIds.set(String(row.id), id)
    plan.workout_templates.push(copy(row, { id, name }))
    for (const item of items) {
      plan.workout_template_exercises.push(copy(item.row, { id: newId(), template_id: id, exercise_id: item.exercise_id }))
      if (!archived) neededExercises.add(item.exercise_id)
    }
    // A later duplicate in the same file is skipped against this one.
    known.push({ id, name: base, is_archived: archived, exercises: items.map(({ exercise_id, target_sets }) => ({ exercise_id, target_sets })) })
  }

  for (const [id, fileRow] of reused) {
    const current = existingById.get(id)!
    const patch = fillPatch(current, fileRow)
    if (current.is_archived && (!isTrue(fileRow.is_archived) || neededExercises.has(id))) {
      patch.is_archived = false
      plan.unarchivedExercises++
    }
    if (Object.keys(patch).length === 0) continue
    const before: Row = {}
    for (const key of Object.keys(patch)) before[key] = current[key] ?? null
    plan.exerciseUpdates.push({ id, patch, before })
  }

  const workoutIds = new Map<string, string>()
  for (const row of rows('workouts')) {
    const id = newId()
    workoutIds.set(String(row.id), id)
    const templateId = row.template_id === null || row.template_id === undefined ? null : templateIds.get(String(row.template_id)) ?? null
    // Issue #158: the story's exercises point at the merged ones.
    const events = row.events === undefined ? {} : { events: remapWorkoutEvents(row.events, exerciseIds) }
    plan.workouts.push(copy(row, { id, template_id: templateId, ...events }))
  }

  const setsByWorkout = groupBy(
    rows('sets').filter((row) => workoutIds.has(String(row.workout_id)) && exerciseIds.has(String(row.exercise_id))),
    'workout_id',
  )
  for (const [oldWorkoutId, sets] of setsByWorkout) {
    const ordered = [...sets].sort((a, b) => Number(a.set_index) - Number(b.set_index))
    ordered.forEach((row, index) => {
      plan.sets.push(
        copy(row, {
          id: newId(),
          workout_id: workoutIds.get(oldWorkoutId),
          exercise_id: exerciseIds.get(String(row.exercise_id)),
          set_index: index,
        }),
      )
    })
  }

  const notesByPair = new Map<string, Row>()
  for (const row of rows('workout_exercise_notes')) {
    const workoutId = workoutIds.get(String(row.workout_id))
    const exerciseId = exerciseIds.get(String(row.exercise_id))
    if (!workoutId || !exerciseId) continue
    const key = `${workoutId}\n${exerciseId}`
    const note = combineExerciseNotes(notesByPair.get(key)?.note as string | undefined, row.note as string | undefined)
    if (note) notesByPair.set(key, { workout_id: workoutId, exercise_id: exerciseId, note })
  }
  plan.workout_exercise_notes = [...notesByPair.values()]

  for (const row of rows('body_weight_entries')) {
    plan.body_weight_entries.push(copy(row, { id: newId() }))
  }
  for (const row of rows('body_measurements')) {
    plan.body_measurements.push(copy(row, { id: newId() }))
  }

  return plan
}
