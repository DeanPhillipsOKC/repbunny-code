# Architecture: Data model

> Part of the architecture reference; index at `docs/architecture.md`.

## Data model

Keep it narrow. Resist adding tables until a real need appears.

The data lives in the on-device SQLite database. `src/data/sqlite/schema.ts` (the create
statements and the numbered migrations) is the source of truth; the listing below is its logical
shape. One user per device, so no table has a `user_id`, and the settings are the single
`settings` row (called `profiles` here and in the stores, a name kept from the retired Postgres
schema, #940). SQLite has no arrays or `timestamptz`: arrays and JSON are stored as text and
times as ISO strings, encoded and decoded by `src/data/sqlite/repos.ts`.

```
profiles                        -- the device's single `settings` row
  height        numeric null    -- single value, no history
  height_unit   text null       -- 'in' | 'cm'
  missing_weight_prompt_opt_out  boolean default false  -- "Don't ask again" on the missing-body-weight prompt
  weight_reminder text default 'monthly'                -- 'weekly' | 'monthly' | 'off'
  plates_lb     numeric[] default '{45,35,25,10,5,2.5}'      -- "Plates at my gym" (issue #22)
  plates_kg     numeric[] default '{25,20,15,10,5,2.5,1.25}'
  weight_unit   text null       -- 'lb' | 'kg'; default for new sets (issue #53); null = not asked yet
  prefill_mode  text default 'last_time'  -- unused since issue #60 cut #55's setting; new sets always copy last time. drop it in a later migration
  default_rest_seconds integer null  -- rest timer for exercises without their own rest_seconds; null = off (issue #90). A new install gets 120 (schema.ts migrate), not a column default, so existing users keep theirs (#429)

exercises
  id            uuid  PK
  name          text
  is_archived   boolean default false
  setup_notes   text null       -- machine seat height, incline position, etc.
  rest_seconds  int null        -- per-exercise rest timer duration; null = profile default, 0 = no timer (issue #90)
  load_type     text default 'weight'  -- 'weight' | 'level' | 'bodyweight' | 'assisted' | 'timed'
  tracks_distance boolean default false  -- 'timed' only; stays editable after sets exist
  tracks_incline  boolean default false  -- 'timed' only; stays editable after sets exist
  tracks_level    boolean default false  -- 'timed' only; stays editable after sets exist
  tracks_calories boolean default false  -- 'timed' only; stays editable after sets exist
  muscle_group  text null       -- 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'glutes' | 'legs' | 'cardio'; null = not yet set
  also_works    text[] default '{}'  -- other groups from the same set, never the main one
  library_id    text null       -- an `id` from src/data/exercise-library.json; the user can link, change, or unlink it (Library match)
  uses_barbell  boolean null    -- shows the plate calculator; null = guess from the library entry
  bar_type      text null       -- 'standard' | 'womens' | 'ez' | 'custom'; null = standard
  bar_custom_weight numeric null  -- 'custom' bar only
  bar_custom_unit   text null     -- 'lb' | 'kg', 'custom' bar only
  weight_step       numeric null  -- unused since issue #60 cut #54 (jump is derived from plates); drop later
  weight_step_unit  text null     -- 'lb' | 'kg'
  rep_range_min     int null      -- unused since issue #60 cut #54 (range is always 8 to 12); drop later
  rep_range_max     int null      -- 1 <= min < max <= 30 when set
  push_pull         text null     -- 'push' | 'pull' | 'neither' for Balance (#173); null = from the library movement

-- Issue #265: "Merge into another exercise" (MergeExerciseSheet.vue, `repos.exercises.merge`) moves every
-- `sets` and `workout_template_exercises` row to the kept exercise of the same load_type (a routine holding both
-- keeps one row, the larger target_sets) and archives the copy. It runs in one SQLite
-- transaction.

workout_templates
  id            uuid  PK
  name          text
  is_archived   boolean default false
  category      text null       -- 'upper' | 'lower' | 'full' | 'cardio' | 'core' | 'other'; null = keyword guess (src/lib/templateCategory.ts)

workout_template_exercises
  id            uuid  PK
  template_id   uuid  FK -> workout_templates(id) on delete cascade
  exercise_id   uuid  FK -> exercises(id)
  position      int             -- order within the template
  target_sets   int null

body_weight_entries
  id            uuid  PK
  weight        numeric
  weight_unit   text            -- 'lb' | 'kg'
  recorded_at   timestamptz

body_measurements               -- issue #139, see "Body measurements"
  id            uuid  PK
  unit          text            -- 'in' | 'cm'; every value in the row uses it
  waist, chest, hips, arms, thighs, neck  numeric null  -- any subset, at least one set
  recorded_at   timestamptz

workouts
  id            uuid  PK
  template_id   uuid null FK -> workout_templates(id)  -- null = freeform
  performed_at  timestamptz     -- now() on start; set earlier for a past workout, or moved from History (issue #264)
  notes         text            -- written on the post-finish recap (item 111) or from History
  sleep         text null       -- 'under_6' | '6_to_8' | 'over_8'; "How did it feel?" (issue #149)
  energy        text null       -- 'low' | 'ok' | 'high' (issue #149)
  stress        text null       -- 'low' | 'ok' | 'high' (issue #149)
  events        jsonb null      -- swaps, skips, early finish; the chart story markers (issue #158)
  finished_at   timestamptz null -- last Finish tap; null while open or for older workouts. History shows the length (issue #266)
  imported      boolean not null default false -- set by the Strong/Hevy importer; milestones its workouts crossed read "Before RepBunny" (issue #462). SQLite migration 10; older backups read false

sets
  id            uuid  PK
  workout_id    uuid  FK -> workouts(id) on delete cascade
  exercise_id   uuid  FK -> exercises(id)
  set_index     int             -- ordering within the workout
  reps          int null        -- null only for load_type 'timed'
  weight        numeric
  weight_unit   text            -- 'lb' | 'kg'
  rpe           numeric null
  level         int null        -- difficulty level ('level'), or tracked level ('timed' + tracks_level); weight = 0 either way
  duration_seconds int null     -- 'timed' only, required for that load type
  distance      numeric null    -- 'timed' + tracks_distance only
  distance_unit text null       -- 'mi' | 'km', 'timed' + tracks_distance only
  incline       numeric null    -- 'timed' + tracks_incline only
  calories      numeric null    -- 'timed' + tracks_calories only

workout_exercise_notes          -- issue #535: "Note for today", one per exercise per workout
  workout_id    uuid  FK -> workouts(id) on delete cascade
  exercise_id   uuid  FK -> exercises(id) on delete cascade
  note          text            -- 1 to 500 characters; never the setup notes, which stay on the exercise
  primary key (workout_id, exercise_id)
  -- Belongs to the parent workout, like sets. Shown under that exercise on the History card and as
  -- "Last time" in the logger the next time it's logged (the workout getLatestSetsForExercise picks).
  -- Backed up, restored (restore remaps both ids), merged, and reset with the workouts; an
  -- exercise merge (#265) moves them, joining two notes on one workout. SQLite migration 11

client_errors                   -- issue #83, see "Client error log"
  id            uuid  PK
  occurred_at   timestamptz
  kind          text            -- 'error' | 'rejection' | 'request'
  message       text
  stack         text null
  route         text null       -- path + query when it happened
  context       jsonb null      -- operation, table, ids, SQLSTATE; never typed values
  app_version   text null
  user_agent    text null
```

Notes:

- `weight_unit` is stored per set rather than as a global setting. Cheap now, avoids a migration later.
  `profiles.weight_unit` (issue #53) never changes a logged set. For input it's the fallback
  wherever nothing more specific applies (a new exercise's first logger row with no history,
  body-weight prompts, a custom bar's unit), read as `profile.defaultWeightUnit` (`'lb'` while
  null); the same set last time still wins, so an exercise logged in kg stays in kg. For display,
  once it's set, charts and totals use it and convert history in the other unit: exercise
  progress charts and rep records, the Progress hub and Lift progress rows, muscle volume, and
  the finish recap's volume and e1RM gain (`preferredUnit` params, `profile.weightUnit`). While
  it's null they keep the history's most-used unit. Individual set labels ("8 × 225 lb") always
  show the unit they were logged in. A fresh install picks it in the setup wizard
  (`SetupWizard.vue`, #397; preselected from the phone's region, and Skip saves that default).
  For anyone still without one, `App.vue` asks once through `WeightUnitSheet.vue` (can't be dismissed without
  picking; suggests the unit most of the user's weighted sets use), held back during an active
  workout and while the wizard is open or undecided; the Account sheet's Preferences group changes it later. e2e's `startLocal` sets
  it to `'lb'` on every start so the sheet never blocks unrelated specs (`weightUnit: null`
  lets it open). Reset and restore leave both profile preferences alone.
- `exercises` is per-user rather than a shared global catalog. This fits the pilot. A larger product may add an optional shared catalog without changing ownership of users' custom exercises or workout history.
- Soft-delete exercises via `is_archived` so historical sets keep resolving to a name.
- `exercises.load_type` decides what a set's numbers mean: `weight` is plate/stack load (volume =
  reps × weight); `level` stores the difficulty in `sets.level` and is excluded from volume (levels
  aren't linear); `bodyweight` stores optional added load in `weight` (effective load = body weight
  + added); `assisted` stores the counterweight in `weight` (effective load = body weight − assist).
  Body weight for a set is the latest `body_weight_entries` row at or before the workout's
  `performed_at` (falling back to the earliest entry); with no entries, bodyweight/assisted sets are
  excluded from volume, not counted as 0. `timed` (backlog items 93-94) stores a duration instead of
  reps/weight (`reps` is null, `weight` is 0) and is also excluded from volume entirely, same as
  `level`. Whether a `timed` exercise's logger also asks for distance/incline/level/calories is set
  per exercise via `tracks_distance`/`tracks_incline`/`tracks_level`/`tracks_calories` (backlog item
  98) — unlike `load_type`, those four stay editable after the exercise has logged sets (turning one
  off just hides that column for new sets; past sets keep whatever value they already have).
  Calories is excluded from volume and PR/record checks, same as every other `timed` field.
- `exercises.muscle_group` (issue #42) is picked first when creating an exercise (required in both
  create forms) and stays editable after sets exist, since it only decides where progress counts,
  not what a set's numbers mean. Null means "not set yet": existing exercises get a group through
  the one-time check screen (`/exercises/check`, `MuscleCheckScreen.vue`), which pre-fills a guess
  from `findLibraryMatch` and writes `library_id` for names that match the library. `App.vue`
  opens it automatically once per device (localStorage `rb-muscle-check-dismissed`); the
  Exercises tab links to it while any exercise still needs a group. e2e specs suppress the
  auto-open by default through `startLocal` (`e2e/fixtures/local.ts`).
- Muscle-group progress (issue #40, design `docs/design/issue-40-muscle-groups.html`) is computed
  on the device from the workouts store's all-sets fetch, with no schema of its own
  (`src/lib/muscleVolume.ts`). A set counts 1 for its exercise's `muscle_group` and 0.5 for each
  `also_works` muscle, for every load type, bucketed into local Sunday-start weeks. The hub's
  Muscle groups tile opens `/progress/muscles` (`MuscleProgress.vue`) and one muscle at
  `/progress/muscles/:group` (`MuscleDetail.vue`). Volume and time per muscle are #50. Both
  screens shade a 10 to 20 sets a week band (`TARGET_SETS`, #135; the detail chart only on
  Sets), and the list notes "Under 10 sets last week" on the current week's view for a muscle
  with history before this week that got fewer than 10 sets in the last full week. Test:
  `e2e/local/muscle-target-band.spec.ts`. On the detail screen each bar is a button (#582, design
  `docs/design/issue-582-muscle-weeks.html`): tapping a past week points the headline and the
  exercise list at it, and How? under the average shows `completeWeekSum` (the complete weeks'
  total and count; empty weeks count as 0). Test: `e2e/local/muscle-weeks.spec.ts`.
- **Balance (#138, Premium, feature key `progress`):** the Muscle groups screen ends with a
  Balance card (`src/components/BalanceCard.vue`, logic in `src/lib/balance.ts`): push vs pull
  and upper vs lower sets over the last 28 days. Upper vs lower is by muscle group
  (`UPPER_GROUPS` chest, shoulders, back, arms; `LOWER_GROUPS` glutes, legs; core and cardio
  count toward neither): a set counts 1 for a side when its main muscle is on it, else 0.5 when
  an "also works" muscle is, once per side. Push vs pull (#173) is per exercise and only for an
  upper-body main group, 1 per set with no half credit. An exercise's side resolves in order:
  its own `exercises.push_pull` (`'push' | 'pull' | 'neither'`, null = not set); else its library
  entry's `movement` (`libraryMovementOf` in `src/lib/exerciseLibrary.ts`: `library_id`, then a
  name or alias match), where `horizontal_press`, `incline_press`, `chest_fly`, `dip`,
  `vertical_press`, `lateral_raise`, `front_raise`, `triceps_extension` are push,
  `vertical_pull`, `horizontal_row`, `rear_delt`, `shrug`, `biceps_curl` are pull, and every
  other movement is neither; else push for a chest exercise; else unset. `balance.ts` takes the
  library lookup as a `movementOf` argument so the unit spec can import it in Node. Unset
  upper-body exercises with sets in the window aren't counted; the card then shows "N exercises
  aren't counted. Set push or pull ›", linking `/exercises/push-pull`
  (`src/components/PushPullCheck.vue`), which lists unset upper-body exercises that are in an
  active template or were logged in the window and saves each Push / Pull / Neither on tap. The
  exercise form (`src/components/ExerciseFormSheet.vue`, `src/components/PushPullPicker.vue`) asks the same, free, only for an
  upper-body main group, pre-selected from the library or chest; untouched it stays null, and a
  value stored on a lower-body exercise is ignored. When one side is
  over 1.5x the other and the bigger side has at least 6 sets, one plain-text line names what's
  behind ("Pull is behind push. A few more rows or pulldowns would even it out."), never in
  red. Without Premium the card shows a Preview button that blurs a sample under
  `PremiumPreviewPanel`. Tests: `e2e/balance-unit.spec.ts`, `e2e/local/balance.spec.ts`, and
  the save round trip in `e2e/local/exercise-muscle-group.spec.ts`.
- The starter library (issue #39) is bundled data (`src/data/exercise-library.json`,
  `src/lib/exerciseLibrary.ts`), not a table. Issue #842 grew it from 138 to 323 entries from
  free-exercise-db (public domain) with `scripts/import-exercises.mjs`, #850 added 35 by hand, and #851 merged 3 duplicates (355); source, license, and
  curation rules are in `docs/exercise-library-source.md`. It's browsed from the Add exercise sheet (muscle
  chips, then a "From the library" section) and the Exercises tab's Library segment
  (`/exercises?view=library`, `ExerciseLibraryBrowser.vue`), with a detail screen at
  `/exercises/library/:id`. Adding an entry inserts a normal `exercises` row copied from it (with
  `library_id`); an entry counts as owned when an unarchived exercise has its `library_id` or a
  name matching its name or an alias (`ownedLibraryIds`), and owned entries are never offered
  again. Both create forms suggest a matching library entry ("Use it") before making a custom one.
  **Linking existing exercises** (follow-up to #136): an exact name or alias match already counts
  everywhere by name; for close names, `suggestLibraryLink` in `src/lib/libraryLink.ts` compares
  word sets (shorthand like DB/BB/RDL expanded, plurals and filler words dropped, Dice overlap of
  0.66 or more, same load type only) and suggests, never links on its own. The Exercises tab's
  banner and the Strength levels card (`?for=strength`, only exercises that would get a level)
  open `/exercises/link` (`src/components/LibraryLinkReview.vue`): Yes writes `library_id`
  (`exercises.setLibraryLink`), No is kept per device in localStorage
  `repbunny-library-link-dismissed` (`exerciseId:libraryId`). The edit sheet's Library match row
  (`src/components/LibraryLinkField.vue`) links by search, changes, or unlinks, among entries
  with the same load type, saved with the form. It leads with the closest entries for an unlinked
  name (`closeLibraryMatches`, #488; looser than the strict `suggestLibraryLink`). Covered by `e2e/local/library-link.spec.ts`.
  Aliases include the names printed on Planet Fitness machines (Tricep Press, Pec Fly, Rear Delt,
  Torso Rotation, Abdominal, and so on), since newer lifters type what they see on the machine.
  Each entry also has an `equipmentType` (barbell, dumbbell, kettlebell, smith, cable, machine,
  bodyweight, other) and a `movement` pattern (`horizontal_press`, `squat`, `hip_hinge`, ...; the
  full list is in `scripts/check-exercise-library.mjs`), added for swap suggestions (#150, below).
- Swap suggestions (#150, Premium): the logger card's swap button (arrows, "Swap exercise", left
  of the note pencil; hidden once an exercise's planned sets are all logged) opens "Try instead"
  (`ExerciseSwapSheet.vue`). `rankSwapOptions` (`src/lib/exerciseSwap.ts`) offers up to 6
  exercises with the same **target**, from the user's own and from library entries they don't
  own, never one already in the workout. A target is a swap-only split of the muscle group
  (`TARGETS`: arms into biceps, triceps, and forearms; shoulders into front, side, and rear delts;
  back into lats, lower back, traps, and rear delts; legs into quads, hamstrings, calves, and
  adductors; glutes into glutes and abductors; other groups are one target), taken from the
  library entry's movement, or for a custom exercise from keywords in its name (`NAME_HINTS`,
  "Tricep Crusher" is triceps). It never changes the muscle groups users pick or Progress. When the
  target is unknown there are no suggestions, and the sheet says so; with fewer than 3 options
  it offers "Show all <group> exercises", which ranks the whole muscle group (`broad`). Score:
  same movement 8, logged before (the 300 most recent sets) 4, same equipment type 2, same load
  type 1, then alphabetical. A custom exercise borrows movement and equipment from a library
  entry with its name, or gets none. Each option shows its last set (`fetchFallbackPreviousSets`).
  Picking one (a library entry is added first) swaps it in for this workout only:
  `workouts.swappedExercises` maps the template's exercise id to the new one and the planned sets
  left, so it takes the old one's place in the deck and its draft rows pre-fill from its own last
  workout, and `workouts.swapRestSource` makes it rest like the exercise it replaced (that one's
  `rest_seconds`, or the profile default when it has none). The template and the exercise's own
  rest setting are never written. Sets
  already logged stay on the old exercise, which stays in the deck as an open-ended extra. An
  ad-hoc exercise is just replaced in the deck. The live swap state isn't persisted: resuming
  after a reload shows the template's original exercise again (the finished workout's story,
  #158 below, is saved). `workouts.swapOrigins` keeps every exercise
  swapped in this workout (a later swap doesn't drop it); `finishWorkout` hands it to
  `workouts.finishSwaps` so the finish recap labels those rows "swapped in for <original>" (#156).
  The recap's "Update <routine>?" card (#263) reads it too, to offer the swap as a routine change.
  Lift progress lists an exercise from its first workout, marked "1 session" with no trend; the
  top-lift tile still needs two. Without Premium the sheet is a preview with "Keep
  it with Premium" / "Go back", and picking opens the Premium sheet. Tests:
  `e2e/local/exercise-swap.spec.ts` and `e2e/local/exercise-swap-unit.spec.ts` (run in the page,
  since Node can't import the library JSON without an import attribute).
- Update the routine from the recap (#263, mockup `docs/design/issue-263-update-routine.html`,
  option A): after a routine workout, `src/lib/routineUpdate.ts` compares the logged sets (plus
  `workouts.finishSwaps`) with the routine's rows and lists each difference: a different set count
  (only for rows with a target), a swap for a skipped exercise, a removal for one skipped entirely
  (unticked by default), and an addition for anything else logged (archived exercises left out).
  `WorkoutLogger.vue` shows them under the recap header; `templates.applyRoutineChanges` writes
  only the ticked lines (a swap repoints the row's `exercise_id`, keeping its position; additions
  are appended in logged order). No card for an archived or deleted routine. "Not now" or an update
  is remembered per workout id in `repbunny-routine-update-dismissed` (last 20), so a resume and
  refinish doesn't ask again. Tests: `e2e/local/routine-update.spec.ts`, `e2e/routine-update-unit.spec.ts`.
- Story markers (#158, mockup `docs/design/issue-158-story-markers.html`, option A): when a
  template workout finishes, `WorkoutLogger.vue`'s `handleFinish` builds its story with
  `buildWorkoutEvents` (`src/lib/workoutEvents.ts`) from the plan as it stood: each swap
  (original, replacement, planned sets moved), each template exercise with no sets (skipped), and
  the planned sets left on exercises that got at least one (the "Finish now?" case).
  `finishWorkout(events)` saves it in `workouts.events` (null for a plain workout, written on every
  finish so a refinish drops a stale story). The workouts store loads them all into
  `workoutEvents` (`fetchWorkoutEvents`, by workout id). `ProgressChart.vue` draws a lavender
  speech-bubble badge over a point whose `story` is set (a pip on a dense range, #168); template progress shows the story in its
  session card, and an exercise chart (`story-inline`) shows it under the chart for the tapped
  point, only the parts about that exercise (`eventsForExercise`; an early finish counts only its
  own sets left). The Workout log puts the same strip (`src/components/WorkoutStory.vue`) under the
  PR marker. Events name exercises by id and name: restore gives exercises new ids, so the
  restore and the merge plan remap them (`remapWorkoutEvents`); an event whose id is still stale
  falls back to matching by name. Not Premium
  (the charts' own gates still apply). SQLite migration 7. Tests:
  `e2e/workout-events-unit.spec.ts`, `e2e/local/workout-story.spec.ts`.
- The plate calculator (issue #22, design `docs/design/issue-22-plate-calculator.html`) is a
  **Plates** button on the logger's lb/kg row for `weight` exercises that use a barbell. That's
  `exercises.uses_barbell`, or when it's null a guess from the library entry's equipment
  (`guessUsesBarbell` in `src/lib/plates.ts`: barbell, EZ bar, trap bar, Smith machine, and never
  an "X or Y" entry). A custom exercise with no library link is guessed from its name instead
  (`nameSuggestsBarbell`: a whole word like "barbell", "trap bar", or "smith"; never dumbbell,
  kettlebell, cable, or a non-Smith machine; issue #461). It opens `PlateCalculatorSheet.vue`, which finds the
  fewest plates per side from the gym's plate list (`profiles.plates_lb`/`plates_kg`, unlimited
  pairs of each; edited in the calculator itself since issue #48, via the "Your plates … Edit" line
  that expands the "Plates at my gym" grid, `PlateInventory.vue`) and offers the nearest weight
  below and above when the target can't be made exactly. The switch and bar choice live in the
  exercise edit form (`BarbellSettings.vue`).
- Body weight is a dated log rather than a profile field so updating it never changes the volume of
  past workouts. Height is a single profile value.
- **Body measurements (#139, Premium, feature key `progress`):** the Body screen's Measurements
  card (`src/components/BodyMeasurementsCard.vue`, logic in `src/lib/measurements.ts`, store
  `src/stores/measurements.ts`, repo `repos.measurements`) logs waist, chest, hips, arms, thighs,
  and neck, any subset per entry, with a date, in in or cm (`src/components/MeasurementForm.vue`). It shows each
  site's latest value and change since its first entry; tapping one charts it with
  `BodyWeightChart.vue` (its `label` prop). Display converts every entry to one unit: the
  weight unit's match (lb to in, kg to cm) until the user picks in or cm on the card (per device,
  localStorage `repbunny-measure-unit`). "See all measurements" (`src/components/MeasurementHistory.vue`) edits
  and deletes. "How to measure" (`src/components/MeasureGuideSheet.vue`, copy in `MEASURE_TIPS`) opens for
  everyone, with a bunny per spot plus a cover in `public/measure/<site>.webp` (`mascot-art`, so
  Minimal hides them; the guide uses copies in `site/img/guides/measure-*.webp`); without Premium the rest is a blurred sample under `PremiumPreviewPanel`. Stored in
  `body_measurements` (SQLite migration 6). Backups carry the table as part of history; reset clears it, and Your data has a
  separate **Export measurements as CSV** (`buildMeasurementsCsv`), since it doesn't fit the
  one-row-per-set file. Tests: `e2e/local/body-measurements.spec.ts`.
