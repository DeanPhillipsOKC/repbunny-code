// The row shapes of the on-device schema (src/data/sqlite/schema.ts). See
// docs/architecture/data-model.md.

import type { MuscleGroup } from './muscleGroups'
import type { TemplateCategory } from './templateCategory'
import type { LevelTag, SleepTag } from './workoutFeel'

export type LoadType = 'weight' | 'level' | 'bodyweight' | 'assisted' | 'timed'
export type DistanceUnit = 'mi' | 'km'

export interface Exercise {
  id: string
  user_id: string
  name: string
  is_archived: boolean
  setup_notes: string | null
  rest_seconds: number | null
  load_type: LoadType
  // Backlog item 93: whether a 'timed' exercise's logger also asks for
  // distance/incline/level, set at creation but (unlike load_type) still
  // editable afterward -- turning one off just hides that column for new
  // sets, past sets keep whatever value they already have.
  tracks_distance: boolean
  tracks_incline: boolean
  tracks_level: boolean
  // Backlog item 98: same editable-after-sets-exist rule as the other three.
  tracks_calories: boolean
  // Issue #42: null means "not set yet" (the one-time check screen and the
  // Exercises tab prompt ask for it). Editable at any time, even after sets
  // exist. library_id is an `id` from src/data/exercise-library.json,
  // permanent once written.
  muscle_group: MuscleGroup | null
  also_works: MuscleGroup[]
  library_id: string | null
  // Issue #22: null means "not decided yet" -- lib/plates.ts guesses from the
  // library entry's equipment. bar_type null means the standard bar.
  uses_barbell: boolean | null
  bar_type: BarType | null
  bar_custom_weight: number | null
  bar_custom_unit: WeightUnit | null
  // Issue #54: the Next target's weight jump and rep range. Null = derived
  // (lib/repRecords.ts resolveWeightStep / repRangeFor).
  weight_step: number | null
  weight_step_unit: WeightUnit | null
  rep_range_min: number | null
  rep_range_max: number | null
  // Issue #173: the Balance card's push vs pull side. Null = not set, so
  // lib/balance.ts falls back to the library movement. Optional because
  // rows from before the column existed (old backups) don't carry it.
  push_pull?: PushPull | null
}

export type PushPull = 'push' | 'pull' | 'neither'

export type BarType = 'standard' | 'womens' | 'ez' | 'custom'

export interface WorkoutTemplate {
  id: string
  user_id: string
  name: string
  is_archived: boolean
  // Embedded count aggregate from the nested select in templates.ts
  // (`workout_template_exercises(count)`), used for the card subtext on
  // the Templates screen without a separate per-template fetch.
  workout_template_exercises?: { count: number }[]
  // Backlog item 112: the user's own category pick; null means "use the
  // guess" (lib/templateCategory.ts).
  category?: TemplateCategory | null
  // Backlog item 111: aliased embed of the same join (`exercise_refs:
  // workout_template_exercises(exercise_id)`), so Home can guess each
  // template's category without fetching every template's exercise list.
  exercise_refs?: { exercise_id: string }[]
}

export interface WorkoutTemplateExercise {
  id: string
  template_id: string
  exercise_id: string
  position: number
  target_sets: number | null
}

// Shape returned by the nested select in templates.ts (template exercise +
// its exercise name), used to render a template's exercise list. Carries
// load_type too so volume.ts can tell a level-typed template exercise apart
// from one that was genuinely skipped (docs/backlog.md item 76).
export interface TemplateExerciseWithName extends WorkoutTemplateExercise {
  exercises: { name: string; load_type: LoadType } | null
}

export interface Workout {
  id: string
  user_id: string
  template_id: string | null
  performed_at: string
  notes: string | null
  // Issue #149: "How did it feel?" tags (lib/workoutFeel.ts).
  sleep?: SleepTag | null
  energy?: LevelTag | null
  stress?: LevelTag | null
  // Issue #158: what was unusual about it (lib/workoutEvents.ts), or null.
  events?: unknown
  // Issue #266: when Finish was last tapped, or null while it's open or for
  // workouts from before the column.
  finished_at?: string | null
  // Issue #462: added by the history importer. Absent on older rows and files.
  imported?: boolean
}

export type WeightUnit = 'lb' | 'kg'

export interface SetEntry {
  id: string
  workout_id: string
  exercise_id: string
  set_index: number
  // Backlog item 93: null only for a 'timed' set (reps aren't asked for --
  // duration is the primary number instead).
  reps: number | null
  weight: number
  weight_unit: WeightUnit
  rpe: number | null
  level: number | null
  duration_seconds: number | null
  distance: number | null
  distance_unit: DistanceUnit | null
  incline: number | null
  // Backlog item 98: 'timed' + tracks_calories only.
  calories: number | null
}

// Shape returned by the nested select in workouts.ts (workout + its sets +
// each set's exercise name/load_type), used for the history view.
export interface SetWithExercise extends SetEntry {
  exercises: { name: string; load_type: LoadType } | null
}

export interface WorkoutWithSets extends Workout {
  sets: SetWithExercise[]
  workout_templates: { name: string } | null
  // Issue #535: each exercise's note for this workout. Only getWorkout and
  // listHistory fill it in.
  exercise_notes?: { exercise_id: string; note: string }[]
}

// Backlog item 77.
export type HeightUnit = 'in' | 'cm'
export type WeightReminder = 'weekly' | 'monthly' | 'off'
// Issue #55: what a new set row in the logger starts with.
export type PrefillMode = 'last_time' | 'next_target' | 'blank'

export interface Profile {
  id: string
  height: number | null
  height_unit: HeightUnit | null
  missing_weight_prompt_opt_out: boolean
  weight_reminder: WeightReminder
  // Issue #22: the plates the user's gym has, per unit.
  plates_lb: number[]
  plates_kg: number[]
  prefill_mode: PrefillMode
  // Issue #90: rest timer for exercises without their own. Null is off.
  default_rest_seconds: number | null
}

export interface BodyWeightEntry {
  id: string
  user_id: string
  weight: number
  weight_unit: WeightUnit
  recorded_at: string
}

// Issue #139: tape measurements, any subset per entry, all in `unit`.
export const MEASUREMENT_SITES = ['waist', 'chest', 'hips', 'arms', 'thighs', 'neck'] as const
export type MeasurementSite = (typeof MEASUREMENT_SITES)[number]
export type MeasurementValues = Record<MeasurementSite, number | null>

export interface BodyMeasurement extends MeasurementValues {
  id: string
  user_id: string
  unit: HeightUnit
  recorded_at: string
}
