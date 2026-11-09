# Architecture: Stack and authentication

> Part of the architecture reference; index at `docs/architecture.md`.

## Purpose

An installable strength workout tracker, shipped as native Android and iPhone apps (Capacitor) to
a small invite-only pilot ahead of the store launch. Everything the user logs lives in an
on-device SQLite database; there is no account, sign-in, or backend. See
`docs/product-roadmap.md` for the product path.

> History: the pilot started as a PWA on Supabase (Postgres, Auth, RLS) hosted on Cloudflare
> Pages. Sign-in and Supabase mode left the app in #938, the PWA shell in #939, and the backend's
> scripts, SQL, and docs in #940 (2026-11-04, `docs/decisions.md` > PWA retired). Android is the
> primary development and testing target; iPhone-specific behavior gets verified second.

## Guiding constraints

1. **Low cost.** No servers to pay for: the app's data stays on the phone, and repbunny.app is a
   static site.
2. **Private by design.** Nothing the user logs leaves the phone (`docs/architecture.md` >
   Operational notes). The only copies are ones the user makes on purpose, plus the automatic
   copy to their own storage (#874).
3. **Small surface area now.** Build for real usage while keeping recoverability (backups,
   restore points, the recovery screen) sound enough to evolve.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Vue 3 + TypeScript (Composition API, `<script setup>`) | Matches existing skill set; Vue 3 for current tooling and better TS inference |
| Build | Vite | Builds the bundle the Capacitor apps ship (the PWA shell, manifest, and service worker were removed in #939) |
| State | Pinia | Minimal, TS-native |
| Routing | Vue Router (`src/router.ts`) | Real paths per screen (`/`, `/progress`, `/templates`, `/exercises`; `/history` redirects to `/progress/workouts` since issue #44) push real history entries, so back and the swipe-back gesture navigate in-app instead of exiting |
| Native shell | Capacitor | The Android and iPhone apps; see `docs/architecture/native-apps.md` |
| Data | On-device SQLite (`@capacitor-community/sqlite`; `jeep-sqlite` on sql.js in a browser) | The only data path since #938; schema in `src/data/sqlite/schema.ts` |
| Site | Cloudflare Pages | Static hosting for repbunny.app (`site/`) |

**Explicitly not using:** a backend, accounts, server-side rendering, analytics, or any service
that receives the user's data.

## No account (#938)

The app has no sign-in. The header's account button (`AccountButton.vue`) opens
`AccountSheet.vue`, a bottom sheet of settings and data tools; its top level has Preferences,
Your data, and Reset & erase, then About. **Erase all data** (`src/lib/eraseAllData.ts`) replaces
the old Delete account: the same confirm view (type `DELETE`), and it wipes the on-device
database and this app's own localStorage keys.

### Reset, backup, and restore

**Reset my data** (issues #1, #47) clears the training data (workouts, templates, exercises,
weigh-ins, measurements, and the height and reminder settings) and keeps the rest of the
settings: `repos.backup.reset()` (`src/data/sqlite/repos.ts`), one transaction. It sits in the
"Can't be undone" box on Reset & erase, next to Erase all data, in the Lavender `--secondary`
accent. Typing `RESET` enables the confirm; on success the sheet closes, the stores reset and
refetch (`src/lib/refetchAccountData.ts`, shared with restore), and the app goes to Home. On
error nothing changes and the sheet says what failed.

Issue #98 (option A of #97, design canvas `EDBsWhYufYUoRW1cuKM7cT`, artboards A1 to A4) splits the
Account sheet into a top level and one sub-screen per row with Back and Close. Backup, restore,
and the confirms return to the sub-screen they were opened from on Cancel. e2e specs reach a
sub-screen with `openAccountSection(page, '<row title>')` from `e2e/fixtures/account.ts`.

Issue #20 (design `docs/design/issue-20-backup-restore.html`) puts a "Your data" group at the top
of the Account sheet:

- **Back up my data** writes `repbunny-backup-YYYY-MM-DD.json` (`src/lib/backup.ts`):
  `format: "repbunny-backup"`, `version: 1`, `exported_at`, the profile fields, and every row of
  `exercises`, `workout_templates`, `workout_template_exercises`, `workouts`, `sets`,
  `body_weight_entries`, `body_measurements` (#139), and `workout_exercise_notes` (#535, no id
  column, so it pages by workout and exercise), archived rows included.
- **Export sets as CSV** writes `repbunny-sets-YYYY-MM-DD.csv`, one row per set, oldest first,
  ending with the workout's sleep, energy, and stress tags (#149). Export-only.
- **Export measurements as CSV** (#139) writes `repbunny-measurements-YYYY-MM-DD.csv`, one row
  per measurement entry, oldest first, in the unit it was logged in. Export-only.
- Both files go through `deliverFile` (`src/lib/backup.ts`). In the native apps it writes the file to the
  cache directory (`@capacitor/filesystem`) and opens the system share sheet on it (`@capacitor/share`),
  because the WebViews ignore Web Share files and blob downloads (#457). In a browser (the dev
  server and e2e) it uses `navigator.share({ files })` when `navigator.canShare` accepts them,
  otherwise a download link. A dismissed sheet resolves `false`; a delivery that can't happen throws
  and logs a `file.deliver` entry to the client error log.
- **Restore from a backup** parses the picked file on the device, shows a preview
  (`RestoreBackup.vue`), and after the user types `RESTORE` (case and stray spaces around it are ignored, `src/lib/confirmWord.ts`, as for the Reset and Delete confirms; a full restore's warning also says an unfinished workout is erased) calls
  `repos.backup.restore()`. It clears the training data as Reset does, then inserts every row with
  a new id, remapping references through the file's own ids. It runs in one transaction, so any
  error leaves the data untouched. On success the app resets and refetches its stores. Restore is disabled while a workout is in
  progress. A partial file (merge) whose plan adds and changes nothing (#486) previews "Everything
  in this file is already in your account" with a Done button in place of Add.
- **Restore points** (#430) lists the copies the app saves on its own (before an
  update, after each workout, before a restore; newest 10) and opens one in the same preview.
  Details in `docs/architecture/native-apps.md` > On-device storage.
- **Recovery screen** (#431): when the on-device data can't open, the app shows
  a recovery screen instead of Home (one-tap restore from the newest restore point, a backup file,
  or a bug report). The setup wizard's welcome has **Restoring from a backup?** for a reinstall, and the
  automatic copy's restore offer or **Find my copies** (#874).
  Details in `docs/architecture/native-apps.md` > On-device storage.

**Partial backups (#93).** Back up my data first opens a "What to back up" sheet
(`BackupOptions.vue`) with three checkboxes, all on: Account preferences, Routines & exercises,
and Workout history. The file is now `version: 2` with an `includes` list (`preferences`,
`templates`, `history`), and `profile` also carries `weight_unit`, `prefill_mode`, and
`default_rest_seconds`. Tables a file leaves out are empty arrays, and `profile` is omitted
without preferences. Templates bring every exercise; history alone brings only the exercises its
sets use. A partial file is named for its parts (`repbunny-templates-YYYY-MM-DD.json`).

- **Full files** (v1, or v2 with all three parts, `isFullBackup` in `src/lib/backupMerge.ts`)
  restore exactly as above, the three v2 preferences included, in the same transaction. A v1 file
  leaves them as they are.
- **What a partial file holds** (`selectBackupRows`, #95): without history, archived templates
  are left out, and exercises are the unarchived ones plus any a kept template or set uses. With
  history every template stays, since old workouts point at them.
- **Partial files merge** through `repos.backup.merge()`, with no typed confirmation since
  nothing is deleted. The plan is shared (`planMerge` in `src/lib/backupMerge.ts`):
  - Exercises match an existing one by `library_id`, then by name (case-insensitive, unarchived
    first) and are reused. A reused exercise is un-archived when the file has it unarchived or
    an added template uses it, and its blank setup fields (notes, rest, muscle groups, bar, step,
    rep range) are filled from the file. Fields already set are never overwritten (#95).
  - A template with the same name and the same exercises (order and target sets) as an existing
    one is skipped, and the file's workouts point at the existing one. An existing "Name (2)"
    counts as "Name" here, so merging the same file twice adds nothing. Otherwise it's added,
    with " (2)", " (3)" only when an unarchived template has the name (#95).
  - Workouts, sets, weigh-ins, and measurements are added (a workout whose template isn't in the file becomes
    freeform), and preferences overwrite only the keys the file has.
  - The preview says what it will add, how many exercises are reused or un-archived, and how
    many templates are skipped.
- The plan is computed in the app and the SQLite merge writes it in one transaction, so a failure
  adds nothing.


**Import from another app (#208,** mockup `docs/design/issue-208-import-history.html`, option B**).**
Your data's **Import from another app** row (under Restore, off mid-workout like Restore) opens
`src/components/ImportHistory.vue`: pick Strong or Hevy, then its CSV export. The file is read on
the device and never sent anywhere (see Operational notes).

- **Parsing** (`src/lib/importHistory.ts`, pure so `e2e/import-history-unit.spec.ts` loads it in
  Node): a small RFC 4180 reader (BOM, comma or semicolon), the app told apart by its header
  (`detectApp`), rows grouped into workouts by start time and name. Strong: Set Order `W` is a
  warm-up, `Rest Timer`/`Note` rows carry no set, and newer exports have no unit column, so the
  confirm screen asks lb or kg (`unitsKnown`). Hevy: `set_type` `warmup`, `weight_kg` or
  `weight_lbs`, `distance_km` or `distance_miles`. Dates are local time in either app's format.
  Each distinct exercise name gets a load type from its name and sets (`inferLoadType`: timed
  when it has time and no reps, assisted for "assist" or a negative weight, bodyweight for
  "bodyweight"/"weighted" or no weight at all, else weight).
- **Matching** (`src/lib/importMatch.ts`): every name gets one review row, answered "Yes, same
  one" (the guess) or through **Other…** (ranked list, search, or Add as new). Candidates have the
  same load type: the user's unarchived exercises, then library entries they don't own, scored
  with the "Link your exercises" word overlap (`overlap`/`linkTokens` in `src/lib/libraryLink.ts`;
  an exact name or alias, or the same library entry, scores 1). The guess is the best of the
  user's own at `LINK_THRESHOLD` or above, else the best library entry, else "No close match"
  (Add as new). Add as new keeps the file's name, with " (Strong)" when one of the user's
  exercises already has it. Answers are kept per device in localStorage
  `repbunny-import-answers` (`app:name` to the exercise's name or library id), so a newer export
  from the same app goes straight to the confirm screen.
- **Writing:** `buildImportPlan` turns the answers into a history-only partial backup
  (`includes: ['history']`) that `restoreBackup` merges like any partial file (`planMerge`), so
  the merge writes it with no schema change. The user's own exercise goes in by name with no
  `library_id`, so the merge reuses exactly it; a library pick carries its fields and is reused
  if already owned. Workouts are freeform, notes "From Strong: Push Day" plus the file's workout
  notes. An exercise note (Strong's per-set Notes, Hevy's `exercise_notes`) becomes that
  exercise's note for the workout (`workout_exercise_notes`, #535), several joined one per line;
  a note on an exercise left out of the import stays in the workout note as `Exercise: note`. RPE is kept. Warm-ups are left out unless "Keep warm-up sets" is on.
- **Duplicates** (decided in the mockup review): a workout is skipped when one on the same local
  day already has exactly its sets (exercise, reps, weight and unit, time, distance;
  `existingWorkoutKeys`), whether from an earlier import or typed in. A backfilled workout with
  other sets still imports. Importing the same file twice adds nothing.
- An import can be thousands of sets; the merge writes them in one transaction. Logging is free, so importing is too. Fitbod, FitNotes, and JEFIT, and a
  manual column-mapping screen for other CSVs, are later phases. Tests: `e2e/import-history-unit.spec.ts`,
  `e2e/local/import-history.spec.ts`; sample files in
  `e2e/fixtures/imports/`.
