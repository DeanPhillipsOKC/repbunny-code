// Issue #74: every data read and write the stores make goes through these
// interfaces. Issue #938: the on-device SQLite adapter (src/data/sqlite) is
// the only one now. Shapes keep the embedded selects the stores were written
// against (`sets(*, exercises(name, load_type))`, `workout_templates(name)`,
// and so on).

import type { BackupFile, BackupProfile, BackupTable } from '../lib/backup'
import type { ExerciseHistoryWorkout } from '../lib/exerciseHistory'
import type { PriorSet, RecapWorkoutSummary } from '../lib/finishRecap'
import type { ProgressSetRow } from '../lib/progressHub'
import type { FeelWorkoutRow, WorkoutFeel } from '../lib/workoutFeel'
import type { WorkoutEvent } from '../lib/workoutEvents'
import type {
  BodyMeasurement,
  BodyWeightEntry,
  Exercise,
  HeightUnit,
  MeasurementValues,
  PrefillMode,
  SetEntry,
  SetWithExercise,
  TemplateExerciseWithName,
  WeightReminder,
  WeightUnit,
  Workout,
  WorkoutTemplate,
  WorkoutTemplateExercise,
  WorkoutWithSets,
} from '../lib/types'

// A plain Error satisfies this. `code` carries the SQLSTATE-style code (e.g. '23505' for a duplicate key).
export type DataError = { message: string; code?: string }

export type Result<T> = Promise<{ data: T; error: DataError | null }>
export type WriteResult = Promise<{ error: DataError | null }>

export interface ProfileSettings {
  height: number | null
  height_unit: HeightUnit | null
  missing_weight_prompt_opt_out: boolean
  weight_reminder: WeightReminder
  plates_lb: number[] | null
  plates_kg: number[] | null
  weight_unit: WeightUnit | null
  prefill_mode: PrefillMode | null
  default_rest_seconds: number | null
}

export type ProfilePatch = Partial<Omit<ProfileSettings, 'plates_lb' | 'plates_kg'> & { plates_lb: number[]; plates_kg: number[] }>

export interface ProfileRepo {
  get(): Result<ProfileSettings | null>
  update(patch: ProfilePatch): WriteResult
}

export interface BodyWeightRepo {
  // Newest first.
  list(): Result<BodyWeightEntry[]>
  create(weight: number, unit: WeightUnit): Result<BodyWeightEntry | null>
  update(id: string, weight: number, unit: WeightUnit, recordedAt: string): Result<BodyWeightEntry | null>
  remove(id: string): WriteResult
}

// Issue #139.
export interface BodyMeasurementsRepo {
  // Newest first.
  list(): Result<BodyMeasurement[]>
  create(values: MeasurementValues, unit: HeightUnit, recordedAt: string): Result<BodyMeasurement | null>
  update(id: string, values: MeasurementValues, unit: HeightUnit, recordedAt: string): Result<BodyMeasurement | null>
  remove(id: string): WriteResult
}

export type NewExercise = Pick<
  Exercise,
  | 'name'
  | 'setup_notes'
  | 'rest_seconds'
  | 'load_type'
  | 'tracks_distance'
  | 'tracks_incline'
  | 'tracks_level'
  | 'tracks_calories'
  | 'muscle_group'
  | 'also_works'
  | 'library_id'
  | 'push_pull'
>

export interface ExercisesRepo {
  // Ordered by name, archived ones included.
  list(): Result<Exercise[]>
  create(exercise: NewExercise): Result<Exercise | null>
  update(id: string, patch: Partial<Omit<Exercise, 'id' | 'user_id'>>): WriteResult
  hasLoggedSets(id: string): Promise<boolean>
  // Issue #265: how many workouts have a set of this exercise.
  countWorkouts(id: string): Promise<number>
  // Issue #265: moves every set and routine row of `fromId` to `intoId`
  // (a routine holding both keeps one row with the larger target), then
  // archives `fromId`.
  merge(fromId: string, intoId: string): WriteResult
}

export type TemplateExerciseRow = Omit<WorkoutTemplateExercise, 'id'>

export interface TemplatesRepo {
  // Ordered by name, with the `workout_template_exercises(count)` and
  // `exercise_refs` embeds.
  list(): Result<WorkoutTemplate[]>
  create(name: string): Result<WorkoutTemplate | null>
  update(id: string, patch: Partial<Pick<WorkoutTemplate, 'name' | 'is_archived' | 'category'>>): WriteResult
  // Ordered by position.
  listExercises(templateId: string): Result<TemplateExerciseWithName[]>
  addExercise(row: TemplateExerciseRow): Result<TemplateExerciseWithName | null>
  insertExercises(rows: TemplateExerciseRow[]): WriteResult
  // Rewrites each row by id (position and target sets).
  saveExercises(rows: WorkoutTemplateExercise[]): WriteResult
  updateExerciseTargetSets(id: string, targetSets: number | null): WriteResult
  removeExercise(id: string): WriteResult
}

export type SetFields = Pick<
  SetEntry,
  'reps' | 'weight' | 'weight_unit' | 'rpe' | 'level' | 'duration_seconds' | 'distance' | 'distance_unit' | 'incline' | 'calories'
>

export type NewSet = SetFields & Pick<SetEntry, 'workout_id' | 'exercise_id' | 'set_index'> & { id?: string }

// A past set with just what a record comparison needs.
export interface SetMarkerRow {
  exercise_id: string
  reps: number
  weight: number
  weight_unit: WeightUnit
  level: number | null
  workouts: { performed_at: string } | null
}

export interface WorkoutEventsRow {
  id: string
  events: unknown
}

export interface WorkoutNotesRow {
  id: string
  notes: string
}

export interface WorkoutsRepo {
  // Issue #264: `performedAt` backdates it; omitted, it's now.
  createWorkout(notes: string | null, templateId: string | null, performedAt?: string): Result<Workout | null>
  // With sets ordered by set_index, or null when it doesn't exist.
  getWorkout(id: string): Result<WorkoutWithSets | null>
  deleteWorkout(id: string): WriteResult
  updateWorkoutNotes(id: string, notes: string | null): WriteResult
  // Issue #264: moves a workout to another date and time.
  updateWorkoutDate(id: string, performedAt: string): WriteResult
  // Issue #149: writes only the tags in `feel`.
  updateWorkoutFeel(id: string, feel: Partial<WorkoutFeel>): WriteResult
  // Workouts with at least one tag, any order.
  listWorkoutFeels(): Result<FeelWorkoutRow[]>
  // Issue #158: the finished workout's story, or null for a plain one.
  updateWorkoutEvents(id: string, events: WorkoutEvent[] | null): WriteResult
  // Issue #266: stamps the finish time, or null when a finished workout is
  // resumed.
  updateWorkoutFinishedAt(id: string, finishedAt: string | null): WriteResult
  // Workouts with events, any order. `events` is raw (parseWorkoutEvents).
  listWorkoutEvents(): Result<WorkoutEventsRow[]>
  // Issue #168: workouts with a non-blank note, any order.
  listWorkoutNotes(): Result<WorkoutNotesRow[]>
  // Newest first, sets ordered by set_index.
  listHistory(): Result<WorkoutWithSets[]>
  // Issue #535: saves one exercise's note for one workout, or clears it
  // when `note` is null.
  setExerciseNote(workoutId: string, exerciseId: string, note: string | null): WriteResult
  // Issue #535: the note from the exercise's most recent other workout with
  // a set of it (getLatestSetsForExercise's workout), or null.
  getLastExerciseNote(exerciseId: string, excludeWorkoutId: string | null): Result<string | null>
  // Most recent workout for the template that has at least one set.
  getPreviousForTemplate(templateId: string, excludeWorkoutId: string | null): Result<WorkoutWithSets | null>
  // The exercise's sets from its most recent workout, any template.
  getLatestSetsForExercise(exerciseId: string, excludeWorkoutId: string | null): Result<SetWithExercise[]>
  // The most recent workout's id and sets (no other workout columns).
  getLatestWorkoutSets(): Result<WorkoutWithSets | null>
  // Workouts on or after `since`, with the true total in `count`.
  listWorkoutDatesSince(since: string): Promise<{ data: { performed_at: string }[] | null; count: number | null; error: DataError | null }>
  listWorkoutSummariesSince(since: string): Promise<{ data: RecapWorkoutSummary[]; count: number | null; error: DataError | null }>
  // The template's latest `limit` workouts up to `upTo`, newest first.
  listTemplateSessions(templateId: string, upTo: string, limit: number): Result<RecapWorkoutSummary[]>

  findSet(id: string, workoutId: string): Result<SetEntry | null>
  insertSet(set: NewSet): Result<SetEntry | null>
  insertSetWithExercise(set: NewSet): Result<SetWithExercise | null>
  updateSet(id: string, fields: SetFields): WriteResult
  deleteSet(id: string): WriteResult

  // Every earlier set of these exercises outside one workout.
  listPriorSets(exerciseIds: string[], excludeWorkoutId: string): Result<PriorSet[]>
  listSetMarkersForExercises(exerciseIds: string[], excludeWorkoutId: string): Result<SetMarkerRow[]>
  listSetMarkersForExercise(exerciseId: string, excludeSetId: string): Result<Omit<SetMarkerRow, 'exercise_id'>[]>
  listExerciseHistory(exerciseId: string): Result<ExerciseHistoryWorkout[]>
  // Exercise ids of the latest `limit` sets, newest workout first, not deduped.
  listRecentSetExerciseIds(limit: number): Result<string[]>
  listProgressSets(): Result<ProgressSetRow[]>
  // Sets with a nonzero weight in this unit.
  countWeightedSets(unit: WeightUnit): Promise<number>
}

export interface BackupRepo {
  // These throw with a readable message instead of returning an error.
  getProfile(): Promise<BackupProfile>
  listAll(table: BackupTable): Promise<Record<string, unknown>[]>
  countWorkoutsAndSets(): Promise<{ workouts: number; sets: number }>
  restore(backup: BackupFile): WriteResult
  // Issue #93: adds a partial file's rows to what's there, deleting nothing
  // (src/lib/backupMerge.ts has the rules).
  merge(backup: BackupFile): WriteResult
  reset(): WriteResult
  // Deletes everything: the whole account online, every table and the
  // settings row on the device.
  erase(): WriteResult
}

// Issue #83: the client error log (src/lib/errorLog.ts). `context` is small
// structured detail (operation, table, ids), never what the user typed.
export type ClientErrorKind = 'error' | 'rejection' | 'request'

export interface ClientErrorEntry {
  occurred_at: string
  kind: ClientErrorKind
  message: string
  stack: string | null
  route: string | null
  context: Record<string, unknown> | null
  app_version: string | null
  user_agent: string | null
}

export interface ClientErrorsRepo {
  insert(entry: ClientErrorEntry): WriteResult
  // Newest first.
  list(): Result<(ClientErrorEntry & { id: string })[]>
  // Issue #84: the Report a bug sheet's "Clear log".
  clear(): WriteResult
}

export interface Repos {
  profile: ProfileRepo
  bodyWeight: BodyWeightRepo
  measurements: BodyMeasurementsRepo
  exercises: ExercisesRepo
  templates: TemplatesRepo
  workouts: WorkoutsRepo
  backup: BackupRepo
  clientErrors: ClientErrorsRepo
}
