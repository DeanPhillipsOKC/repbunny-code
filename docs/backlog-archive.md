# Backlog archive (cold storage)

Completed backlog items and finished setup tasks, condensed to one-liners. Not part of the
"read before making changes" set in `CLAUDE.md`/`AGENTS.md` — open this only if you need history
on something already shipped. New entries get appended here when an item is removed from
`docs/backlog.md`.

## Setup / accounts

- GitHub repo created: https://github.com/DeanPhillipsOKC/rep
- Supabase project created (`zdcoqykpuhyftuqtyngt`); URL + anon key in `.env.local` (gitignored).
- Cloudflare Pages connected to the repo; build command `npm run build`, output `dist`; env vars
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set and confirmed baked into the deployed bundle.
- Node LTS installed locally; `npm install` / `npm run build` verified.

## Supabase configuration

- `supabase/schema.sql` + `supabase/policies.sql` applied; verified via anon-key REST calls
  (empty reads, `42501` on unauthenticated writes).
- Passkey support confirmed public-beta as of 2026-05; decision made to build passkey-first
  anyway (see `docs/architecture.md#authentication`).
- Relying Party configured: Display Name `Workout Tracker`, RP ID `<pilot-host>.pages.dev`, RP Origins
  `https://<pilot-host>.pages.dev`; confirmed via `/auth/v1/settings`.
- URL Configuration: Site URL `https://<pilot-host>.pages.dev`; redirect URLs include that plus
  `http://localhost:5173`.
- Open sign-ups disabled; confirmed via `/auth/v1/settings` (`disable_signup: true`).
- Both allowed accounts pre-created manually (Auto Confirm), no `allowed_users` table.
- Load-type / body-weight schema (prerequisite for backlog items 76-81) applied by the user in the
  SQL editor 2026-09-26, no errors: `exercises.load_type`, `sets.level`, `profiles.height`/
  `height_unit`/`missing_weight_prompt_opt_out`/`weight_reminder`, new `body_weight_entries` table
  with owner-only RLS. Mirrored into `supabase/schema.sql` and `supabase/policies.sql`.

- Account-deletion function (prerequisite for backlog item 92) applied by the user in the SQL editor
  2026-09-27: `public.delete_my_account()`, `security definer`, deletes the caller's rows in FK-safe
  order then their `auth.users` row; execute granted to `authenticated` only. Verified the same day:
  an anon-key call is refused with `42501`.
- Timed-exercise schema (prerequisite for backlog items 93-94) applied by the user in the SQL editor
  2026-09-27: `timed` added to `exercises.load_type`'s check; `sets.reps` nullable
  (`reps is null or reps > 0`); new `sets.duration_seconds`/`distance`/`distance_unit`/`incline`;
  new `exercises.tracks_distance`/`tracks_incline`/`tracks_level` (default false). Verified the same
  day by selecting every new column through the service-role client. Not yet mirrored into
  `supabase/schema.sql`/`docs/architecture.md`; items 92 and 93 do that.
- Calories schema (prerequisite for backlog item 98) applied by the user in the SQL editor
  2026-09-27: `exercises.tracks_calories` (boolean, default false); `sets.calories` (numeric null,
  check `calories is null or calories >= 0`). Not yet mirrored into `supabase/schema.sql`/
  `docs/architecture.md`; item 98 does that.

## Decisions made

- Allowed users: the owner (Android) and one invited iPhone tester (addresses removed for the public repo, #942).
- Platform priority: Android first, iPhone verified opportunistically.
- Exercise "Archive" has no restore path, so treat it as delete (2026-09-24): kept the existing `is_archived` soft-delete at the DB level (needed so removing an exercise doesn't break the FK reference from existing `sets`/`workout_template_exercises` rows), but the UI drops the "archive" pretense and relabels it "Delete" with a confirmation step. Unblocked backlog item 24.

- Template rep-range / reference-weight targets not wanted (2026-09-27, was pm-review backlog item 91 and roadmap "After that" #7): the user judged the set-row column headings plus last-time pre-fill sufficient. Revisit only if the pilot's field testing of the compact rows says otherwise.

## Device verification

- Android, browser tab: magic-link sign-in and passkey registration both worked on
  `<pilot-host>.pages.dev` in Chrome.

## Shipped features

- Fix Add Set/RPE overlap and add weight/rep steppers (2026-09-25, `1b3f9fe`): compact set rows now wrap controls before they collide; inline buttons adjust reps by 1 and weight by 10 lb or 5 kg, while inputs still accept direct entry. Playwright checks the increments and mobile spacing at 320 px and 375 px; build and full e2e suite passed (45/45).
- Core workout logging: create workout, add sets, view history (`8da13e5`).
- `profiles` row auto-created on sign-in to satisfy `exercises`/`workouts` FK (`850742a`).
- Dark, mobile-first styling for auth and logging screens (`714909b`).
- Placeholder PWA icons added (`06a0cd4`).
- Local/automated auth path for testing: `scripts/create-test-session.mjs` (`npm run test:session`) mints a real session for a designated test account via the Supabase Admin API (service-role `generateLink` + anon-key `verifyOtp`), unblocking browser/E2E automation without a client-visible auth bypass. See `docs/architecture.md#testing--automation`.
- Playwright e2e harness added (`e2e/`, `npm run test:e2e`); `e2e/fixtures/auth.ts` reuses the test-session mint to start specs already signed in. Confirmed passing locally against Chromium, including the signed-in-via-injected-session case.
- Workout templates (hierarchy): `workout_templates` + `workout_template_exercises` tables, `workouts.template_id`, matching RLS, a Templates tab to build/reorder named routines, template selection + suggested-exercise chips when starting a workout, and a template tag in History. Verified via `e2e/templates.spec.ts`. Unblocks backlog items 3 and 6.
- Pre-fill from last workout of the same template: starting a workout against a template fetches the most recent past workout for it and shows a "Last time" card (notes + per-exercise reps/weight in set order); selecting an exercise pre-fills reps/weight/unit from its last set. Verified via `e2e/pre-fill.spec.ts`. Unblocks the lookup half of backlog item 6.
- Don't persist a workout with zero sets logged (item 9): `finishWorkout()` in `src/stores/workouts.ts` now deletes the `workouts` row if `activeSets` is still empty when the user finishes/abandons a workout, instead of leaving an empty row behind. Verified via a new `e2e/zero-set-cleanup.spec.ts`, which confirms the row is actually gone via the admin client, not just hidden from the UI. Also cleaned up 23 pre-existing empty rows already in the real database (both accounts) with a one-off admin-client script, run by the user directly after the auto-mode classifier blocked Claude from reading/writing production data itself.
- Fix parallel-set pre-fill for previous-workout sets (item 9): `WorkoutLogger.vue` pre-fill now indexes into the previous workout's per-exercise sets by set position (count of sets already logged this session for that exercise), not always the last set logged — fatigue means set 1 should compare to set 1, not whichever set happened to be logged last. Falls back to no pre-fill when this session has already logged more sets for that exercise than last time. Also now re-runs on every `addSet` (watching `activeSets.length`, not just `watch(exerciseId, ...)`), so re-picking the same exercise for set 2 refreshes reps/weight without needing a different exercise selected in between. Verified via a new case in `e2e/pre-fill.spec.ts` covering superset-style alternation.
- PR toast on new record (item 4): `addSet` in `src/stores/workouts.ts` now kicks off a background, session-cached per-exercise best-volume check after each insert (never blocking the add itself), and `WorkoutLogger.vue` shows an auto-dismissing "New record: <exercise>" toast when `reps * weight` beats the all-time best for that exercise across all past workouts. Verified via a new `e2e/pr-toast.spec.ts`. While verifying, found and documented (not fixed — out of scope) a pre-existing `set_index` race in `addSet`; see backlog item 10.
- Exercise setup notes (item 8): `exercises` gains a nullable `setup_notes text` column (migration applied by the user directly in the Supabase SQL editor — no DDL execution path available to Claude in this repo). `src/stores/exercises.ts` gained `updateSetupNotes`; `ExerciseList.vue` shows an "Add notes"/"Edit notes" affordance per row with an inline textarea; `WorkoutLogger.vue` surfaces the selected exercise's notes right above the reps/weight fields. Verified via a new `e2e/exercise-notes.spec.ts` (add, edit, and see during logging).
- Fix welcome-card/coachmark flash on Log-screen refresh (item 33): `WorkoutLogger.vue`'s zero-exercise welcome card and menu coachmark were gated only on `exercises.activeExercises.length === 0`, which is also true for a split second on every fresh load — before the store's `fetchExercises()` call resolves — even for a user who already has exercises. Gated both the welcome-card template block and the coachmark-measuring watcher on `!exercises.loading` (same flag/pattern `ExerciseList.vue` already used), so the pre-workout section renders blank until the first fetch completes instead of confidently showing onboarding UI to a returning user. Verified via `npm run build` and the full `npm run test:e2e` suite (21/21 passing).
- Remove the zero-exercise welcome-card coachmark entirely (item 48): it had gone stale (item 41's bottom tab bar removed the `.menu-button` it targeted, leaving `updateCoachmark()` querying for a node that no longer exists, so its "More lives in the menu" label fell back to its unset `top:0/right:0` position and landed on the header's sign-out icon). Rather than repoint it at a new target, removed it outright — `heroCardRef`/`coachmarkPath`/`coachmarkLabelStyle`/`updateCoachmark()` and its resize listener, and the SVG arrow + label markup and CSS — since its premise ("more lives in a hidden menu") no longer holds once the bottom tab bar keeps every destination always visible. The welcome card's existing "Add your first exercise" CTA button was already sufficient guidance. Verified via `npm run build` and the full `npm run test:e2e` suite (30/31 passing; the one failure, `optional-numeric-fields.spec.ts`, is pre-existing flakiness unrelated to this change and passed on isolated re-run).
- Rest timer bunny breathing animation too subtle (item 36): bumped `RestTimer.vue`'s `@keyframes rest-breathe` 50% keyframe from `translateY(-6px) scale(1.035)` to `translateY(-16px) scale(1.06)`, same `4s ease-in-out infinite` timing. Verified with a temporary Playwright measurement (sign in, log a set on an exercise with a rest timer, poll `.rest-bunny`'s bounding box for one full cycle) showing ~21px of actual travel with no clipping against `.rest-glow-wrap`; screenshot confirmed the glow stays clear of the card edges. Full `npm run test:e2e` suite (25/25) and `npm run build` both pass.
- Visible build version (item 10): dropped GitVersion (its `dotnet-gitversion` tool needs a .NET SDK, which Cloudflare Pages' build image doesn't have, and no maintained npm wrapper reproduces its output) in favor of a git-native Node script. `scripts/lib/build-version.mjs` unshallows the clone if needed (Cloudflare Pages checks out shallow), then combines `git rev-list --count HEAD` and the short SHA into e.g. `v142+a1b2c3d`; injected via Vite `define` in `vite.config.ts`, set on `document.title`, and also shown in a small on-page footer (`src/App.vue`) since the PWA runs standalone/installed with no tab strip to show a title in. Dirty-tree detection diffs tracked-file content only (`core.fileMode=false`) so a CI checkout's executable-bit noise doesn't falsely flag `-dirty`. Verified live against the deployed site and via `e2e/auth.spec.ts` (`6b675fe`, `a4a873b`, `4146316`).
- On-demand data-wipe script (item 5): `scripts/wipe-account-data.mjs` (`npm run wipe:account -- <email-or-user-id>`) resolves the target account via the Admin API (accepts either a UUID or an email, paginating `listUsers` to match on email since `profiles` has no email column), then deletes `workouts` (cascades `sets`), `workout_templates` (cascades `workout_template_exercises`), and `exercises` for that `user_id` — in that order, since `workouts.template_id`/`sets.exercise_id`/`workout_template_exercises.exercise_id` have no cascading delete. Leaves the auth user and `profiles` row intact. Refuses to run with no argument, so it can never touch more than one account at a time. Not covered by Playwright (no UI surface); verified directly against the real test account: seeded an exercise/workout/set, ran the wipe by email, confirmed all three tables cleared, then ran it again by user id against the now-empty account to confirm the id-resolution path and idempotency.
- Edit exercise name (item 7): `src/stores/exercises.ts` gained `updateExerciseName`; `ExerciseList.vue` shows an "Edit name" affordance per row (inline form, same pattern as setup notes) that renames the existing row in place instead of requiring archive-and-recreate, preserving history linkage. Verified via a new `e2e/exercise-edit-name.spec.ts` (rename, confirm it persists in the Exercises tab and shows up renamed in the workout-logging exercise picker).
- Fix set_index race in addSet (item 10): added a `sets_set_index` BEFORE INSERT trigger (`supabase/schema.sql`) that recomputes `set_index` server-side as `max(set_index) + 1` for the target `workout_id`, guarded by a `pg_advisory_xact_lock` keyed on `workout_id` so two concurrent inserts for the same workout can't both read the same max before either commits. Purely additive at the DB level — the client still sends a best-effort `set_index` (now just a not-null placeholder, overwritten by the trigger). Migration applied by the user directly in the Supabase SQL editor (no DDL execution path available to Claude in this repo, same constraint as item 8's `setup_notes` column). Verified directly against the live DB post-migration with a one-off admin-client script: 20 concurrent inserts into `sets` for one workout, each deliberately sent with the same wrong client-side `set_index: 0`, came back as a clean, unique `0..19` run with zero collisions and zero failures. While re-running `e2e/pre-fill.spec.ts`'s "set position tracks across exercises logged in parallel" spec to double-check on the real UI path, found a *different*, pre-existing flake not fixed by this trigger — see backlog item 11.
- Fix in-flight-set-write race (item 11): three-part fix, none of them the originally-suspected mechanism. (1) `src/stores/workouts.ts` gained a `pendingWrites` set tracking in-flight `addSet` inserts, awaited by `fetchPreviousWorkout`/`startWorkout`/`finishWorkout` before they proceed — hardens against finish/start racing ahead of a still-committing add, per the original bug write-up. (2) Root-caused the actual observed flake via a standalone instrumented repro (not the committed spec) to a UI-only bug: `WorkoutLogger.vue`'s `watch(() => workout.activeSets.length, ...)` re-ran `applyPrefill` for the *selected* exercise whenever *any* exercise's `addSet` landed, so a superset partner's async response could silently wipe the reps/weight fields the user was mid-typing, turning their next "Add set" tap into a silent no-op (guarded away by `handleAddSet`'s null check) — the real source of "last time comes up one set short." Fixed by tracking `lastFilledCount` and only re-filling when the *selected* exercise's own logged count actually changed. (3) That alone cut failures from ~90% to ~13% over repeated runs; the residual race was concurrent "Add set" taps genuinely reordering over the network, since nothing stopped a second tap before the first's response landed — `set_index` (assigned by DB commit order, item 10's trigger) then disagreed with tap order. Fixed by disabling the "Add set" submit button for the duration of the request (`addingSet` ref), serializing submissions the way a real single-user tap sequence already is. Verified with a 15-iteration scripted loop (0/15 failures, vs. consistent ~90% failure before) and 25 additional repeats of the actual `e2e/pre-fill.spec.ts` "logged in parallel" spec (25/25 passing) plus a full suite run (11/11). While investigating, found a separate, pre-existing race in `TemplateManager.vue`'s add-exercise-to-template flow (same unserialized-submit shape) — not fixed here (different component/store, out of scope); logged as backlog item 12.
- Edit/delete a set within an in-progress workout (item 13): `src/stores/workouts.ts` gained `updateSet`/`deleteSet` operating on `activeSets` (no migration needed — RLS's owner-inherited `sets` policy already covers it). `WorkoutLogger.vue` shows "Edit"/"Delete" affordances per active-set row, same inline-form pattern as the exercise name/notes editors; edit covers reps/weight/unit/rpe, delete removes the row outright. Deliberately doesn't renumber `set_index` on the remaining rows (harmless gap, per item 9's pre-fill note) and doesn't touch the record-check cache on edit/delete (stale "new record" toast for a since-edited/deleted set is an accepted minor inconsistency). Verified via a new `e2e/edit-delete-set.spec.ts` (add, edit, cancel-discards-draft, delete) plus a full suite run (12/12).
- Fix race on adding an exercise to a template (item 12): same fix shape as item 11's third leg — `TemplateManager.vue` gained an `addingExercise` ref, set for the duration of `addExerciseToTemplate`, disabling the "Add" submit button so a second tap can't fire before the first insert commits. No new regression test added (the original flake was an unreproduced lead from a 15-repeat stress run, same as item 11's); verified via a full suite run (12/12) plus 5 repeats of `e2e/pre-fill.spec.ts` (10/10), the spec that originally surfaced it.
- Edit target set count on a template exercise (item 14): `src/stores/templates.ts` gained `updateTemplateExercise` (no migration needed — RLS's owner-inherited `workout_template_exercises` policy already covers it, same as item 13's `sets` policy). `TemplateManager.vue` shows an "Edit" affordance per exercise row, same inline-form pattern as the active-set editor, to change `target_sets` in place without removing and re-adding the exercise (which previously lost its position). Verified via a new `e2e/edit-template-exercise.spec.ts` (edit, cancel-discards-draft) plus a full suite run (13/13).
- Post-workout volume chart (item 6): finishing a workout logged against a template now shows an "Volume over time" chart (actual + projected lines, plus a plain-text per-workout breakdown for readability/testability) before returning to the start form, dismissed via a new "Log another workout" button. `src/lib/volume.ts` holds the pure projection rule as `computeVolumeHistory` (kept separate from the store since it's the part worth reading in isolation): projected volume for a point starts from that instance's literal actual total, then for each of the template's current exercises where the workout's logged-set count for it fell short of `target_sets` (or was zero, when `target_sets` is null), swaps in that exercise's own most recent prior actual volume in place of its partial contribution this time — a full replacement per the "no weighted-percentage formula" decision, not a blend. New `src/stores/workouts.ts` members: `volumeHistory`/`volumeHistoryError`, `fetchTemplateVolumeHistory(templateId, templateExercises)`, `clearVolumeHistory()`. Chart itself (`src/components/VolumeChart.vue`) is a small inline SVG two-line plot — no charting dependency added, consistent with the "small surface area" guiding constraint. Verified via a new `e2e/volume-chart.spec.ts` (a template exercise with `target_sets: 2`: one workout completing both sets, a second under-completing it, confirms the second point's projected total carries forward the first's volume instead of using the partial number) plus a full suite run (14/14); required updating two pre-existing `e2e/pre-fill.spec.ts` cases to dismiss the new chart screen after finishing a templated workout with sets logged, since that's now the immediate post-finish state instead of the bare start form.
- Per-exercise rest timer with push notification (item 15): `exercises` gains a nullable `rest_seconds int` column (migration applied by the user directly in the Supabase SQL editor, same no-DDL-access constraint as items 8/10) plus a new `push_subscriptions` table (RLS owner-only, same pattern as every other directly-owned table) storing each device's Web Push `PushSubscription`. `ExerciseList.vue` gained an inline "Add/Edit rest timer" editor (same pattern as setup notes/name) and a "Rest timer alerts" card with a deliberate "Enable rest timer alerts" button — required to be a real user-gesture handler since iOS refuses to prompt for notification permission otherwise, and won't allow any of this until the PWA is installed to the home screen. New `src/stores/pushSubscription.ts` owns the subscribe lifecycle (permission → `pushManager.subscribe()` with a VAPID public key → upsert into `push_subscriptions` keyed on `endpoint`) and `sendRestReminder()`, called from `WorkoutLogger.vue` right after a set logs successfully for an exercise with a configured `rest_seconds`. The service worker switched from `vite-plugin-pwa`'s `generateSW` strategy to `injectManifest` (`src/sw.ts`, `vite.config.ts`) so it could add `push`/`notificationclick` handlers — offline app-shell caching behavior is unchanged. Dispatch is a new Supabase Edge Function (`supabase/functions/rest-timer-notify/`, Deno, imports `web-push` via the `npm:` specifier) that does `await sleep(restSeconds)` then sends the push directly via the VAPID private key (an Edge Function secret) — no `pg_cron`/polling, confirmed to fit comfortably inside free-tier Edge Function limits (150s wall clock, 2s *active* CPU — the sleep is async wait, not CPU). Verified via a new `e2e/rest-timer.spec.ts` (add/edit/clear a duration) plus a full suite run (15/15); actual push delivery needs a deployed function + VAPID secrets + a real device, which is real DDL/deploy/device work outside what an agent can do here — see the `[human]` checklist item added to `docs/backlog.md` for the three remaining deploy steps (Cloudflare env var, `supabase functions deploy`, `supabase secrets set`) plus the device-verification pass. Permanent design writeup lives in `docs/architecture.md#push-notifications` rather than staying only in the now-archived backlog entry.
- Rest timer push notification fixes and polish, post-device-testing (item 15 follow-up, 2026-09-24): (1) the deployed Edge Function was missing CORS headers entirely, so the browser silently blocked the client's request during the preflight check before the sleep+send code ever ran — no error surfaced anywhere; fixed by adding an explicit `OPTIONS` handler and `Access-Control-Allow-Origin`/`-Headers` on every response, confirmed against the live function directly (`curl` preflight, then a full round trip using the dedicated test account and a real EC keypair, which correctly reached and failed only on the fake push endpoint). (2) `src/stores/pushSubscription.ts`'s `enable()` had no error handling anywhere in its permission → service worker → subscribe → save chain, so any failure (including `navigator.serviceWorker.ready` hanging forever, which it can do with no rejection) looked identical to the button silently doing nothing; wrapped the whole flow in try/catch populating `errorMessage`, and bounded `serviceWorker.ready` with an 8s timeout in `enable()`/`refreshStatus()`/`sendRestReminder()`. (3) collapsed the "Rest timer alerts" card in `ExerciseList.vue` down to a one-line confirmation once already subscribed, instead of always showing the full heading/description (was backlog item 17). (4) `src/sw.ts`'s push handler now sets `vibrate`/`renotify` — no browser supports a custom notification sound (the API's old `sound` option was never implemented anywhere), but vibration is controllable and worth it over gym noise, and `renotify` ensures a second alert while a same-tagged one is still showing actually re-triggers instead of silently replacing it. Confirmed working end-to-end on Android (unlocked); locked-phone and iPhone verification remain open in `docs/backlog.md`.
- Fix exercise row action buttons overflowing on mobile (item 16, 2026-09-24): `ExerciseList.vue`'s `.row-actions` (Edit name / Edit notes / Add rest timer / Archive) had `flex-shrink: 0`, so at phone width the four buttons overflowed the card instead of wrapping — adding `flex-wrap: wrap` to `.row`/`.row-actions` alone wasn't enough, since the shrink-0 item still sized to its unwrapped content width and only *then* wrapped its children, which by then had no room to matter. Fix: let `.row` wrap (title stacks above actions when they don't fit side by side) and let `.row-actions` itself shrink (`min-width: 0`, drop the `flex-shrink: 0`) so it's constrained to the row's actual width before its own `flex-wrap` kicks in on the buttons. Same shape existed in `WorkoutLogger.vue`'s active-set row (Edit/Delete) — smaller (10px) but real overflow at 320px width — fixed identically. Verified with a scripted Playwright check (signed in via the test-account session mint, real page, no mocks) confirming zero horizontal overflow on `ExerciseList.vue`'s row at 320/375/414/480/800px and on `WorkoutLogger.vue`'s row at 320px, plus a full `npm run test:e2e` run (15/15) and `npm run build`.
- Rebrand to REP ("Harvest Hare" brand kit, 2026-09-24): resolves the `[human]` "app display name, theme color, and final icon" item. Replaced the placeholder PWA icon set (`public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.ico`, plus new `favicon-16x16.png`/`favicon-32x32.png` referenced via explicit `<link rel="icon">` tags) with the kit's rabbit-and-dumbbell mascot art. `vite.config.ts` manifest and `index.html`'s `theme-color` moved from near-black (`#111111`) to Midnight Plum (`#1C151D`); app name changed from "Workout Tracker"/"Workouts" to "REP" everywhere user-visible (manifest `name`/`short_name`, `<title>`, `document.title` in `src/main.ts`, and the `<h1>` in `src/App.vue`/`LoginForm.vue`) plus the doc titles in `README.md`/`AGENTS.md`/`CLAUDE.md`/`docs/architecture.md` — `e2e/auth.spec.ts`'s title assertion updated to match. `src/style.css`'s single `:root` token block was remapped to the kit's full palette (`rep-theme-tokens.json`): `--accent` is Dusty Rose, `--accent-text` changed from white to Midnight Plum per the kit's own contrast rule (white fails contrast on rose/apricot/ochre/sage fills), and `--secondary`/`--highlight`/`--success` tokens were added for future PR/streak/completed-set styling — not yet consumed by any component, since none of those UI states exist yet. Added `--accent-pressed` and wired it into `button[type='submit']:active`. Deliberately out of scope: the kit's suggested typography (Nunito Sans/Inter) and shape/radius scale — not requested, and would need web font loading; left as a possible follow-up. Verified via `npm run build` (manifest.webmanifest inspected directly) — no live browser/visual check performed, the Claude in Chrome extension wasn't connected this session. Notification `badge` in `src/sw.ts` still points at the full-detail icon as a placeholder; a dedicated small monochrome badge asset is a `[human]` item in `docs/backlog.md` (the user is designing it).
- Home screen UI-direction design pass (2026-09-24): resolves the `[human]` "establish a real UI direction before the interface gets busier" discussion item. Mockup built as a private Artifact (`https://claude.ai/artifact/R4VgEv6St39HjEdVU1im2P`, owner-only) covering the current flat 4-tab `App.vue` layout versus a redesign where Log is the only default view (tagline + a workouts-this-week/recent-PR stat strip under the header) and Exercises/Templates/History/Sign out move into a hamburger-triggered menu with Log pinned at the top as the current destination. Design only, no code changed. Unblocks backlog items 18 (nav restructure) and 19 (the stat strip).
- Stale Android WebAPK icon/name in the notification shade (2026-09-24): investigating a report of a mismatched icon (an unrelated orange "H" glyph, not anything in this repo's asset set) and stale "Workouts" app name showing in the notification-shade header for push notifications, root-caused to Android's WebAPK behavior — "Add to Home Screen" bakes the manifest's name/icon into a real installed package at that moment, and Chrome doesn't proactively re-bake it just because `manifest.webmanifest` changed later (e.g. the REP rebrand). Confirmed by the user: uninstalling and re-adding the PWA to the home screen picked up the current name/icon. No code change — resolves the `[human]` "retry install now that manifest icons are fixed" backlog item.
- Monochrome push-notification badge icon (2026-09-24): the Android status bar was showing a solid opaque square for rest-timer push notifications instead of a recognizable icon — Android renders a notification's `badge` using only its alpha channel as a silhouette, and `src/sw.ts` had been pointing `badge` at `icon-192.png`, the full-color, fully-opaque mascot, so there was no transparency to cut a shape from. User supplied `public/badge-96.png` (96x96, true alpha transparency, dumbbell silhouette); `src/sw.ts`'s `showNotification` now uses it for `badge` (kept `icon-192.png` for `icon`, which Android does render in full color when expanded). Resolves the `[human]` backlog item; not yet re-verified on a real device post-swap.
- Fix set-entry fields usable before an exercise is picked (item 20, 2026-09-24): `WorkoutLogger.vue`'s Reps/Weight/Unit/RPE inputs and the "Add set" submit button are now wrapped in `v-if="exerciseId"`, so they don't render at all until an exercise is selected — matches the user's stated preference for hiding over disabling. Fixes both reported symptoms at once: no more relying on the `<select required>`'s native validation surfacing after fields are already filled, and no more `watch(exerciseId, ...)`'s unconditional `applyPrefill` silently wiping typed-ahead reps/weight, since typing ahead is no longer possible. No store/schema changes. Verified via `npm run build` and a full `npm run test:e2e` run (17/17) — existing specs already select an exercise before touching Reps/Weight, so none needed changes.
- Home screen redesign: Log-first layout with hamburger menu (item 18, 2026-09-24): built to the mockup from the prior session's design pass. `App.vue`'s `view` ref now defaults to and effectively stays on `'log'` — the old `.tabs` row is gone; `WorkoutLogger` renders directly under the header. The header's "Sign out" ghost button is replaced by a 44px `≡` icon button (`aria-label="Open menu"`, `aria-controls="app-menu-drawer"`, `aria-expanded`) that opens a new `src/components/AppMenu.vue`: a right-side drawer over a dimmed scrim, Teleported to `body` so it isn't clipped by `main`'s 480px max-width. Lists Log (pinned, marked current via `aria-current="page"`), Exercises, Templates, History, then Sign out below a divider, each with an inline stroke-SVG icon (plus-circle/dumbbell/layers/clock/log-out, matching the mockup). Closes on scrim click, the X button, Escape, or picking a destination; traps `Tab` focus inside the drawer while open and returns focus to the `≡` button on close. The tagline (`src/components/LoginForm.vue`'s copy) now also shows under the header, but only on the Log view. Exercises/Templates/History components themselves are untouched — purely nav chrome moved out of a tab row and into the menu. Required updating 10 Playwright specs plus `e2e/auth.spec.ts`'s signed-in-visibility check, since `getByRole('button', { name: 'Exercises' | 'Templates' | 'History' })` etc. now live inside a closed-by-default drawer; added `e2e/fixtures/nav.ts`'s `goTo(page, view)` helper (opens the menu, then clicks the destination) and swapped every prior direct tab click over to it. Verified via `npm run typecheck`, `npm run build`, a full `npm run test:e2e` run (15/15), and a scripted Playwright visual check (mint a real test session, screenshot the Log screen, the open drawer, and post-navigation Exercises screen) confirming the drawer, icons, active-item highlight, and tagline-only-on-Log behavior all render as designed.
- Progress strip on the Log home screen (item 19, 2026-09-24): picked the "recompute on load" option from the two the backlog item offered, since it needs no migration (avoids the no-DDL-access constraint on every other schema change item hit) — accepted tradeoff is it only ever shows "since your last workout," not further back. New `src/lib/progress.ts` holds `findRecentPr` as a pure function (same separation pattern as `volume.ts`): given the most recent workout's sets and every other historical set for those exercises, returns the name of the first exercise (in set order) whose volume beat its prior all-time best, replaying the same `volume > previousBest` rule `checkForRecord` already uses for the live toast. `src/stores/workouts.ts` gained `workoutsThisWeek`/`recentPrExerciseName` state and `fetchProgressStats()` (Monday-start week boundary via local `Date`, a `head: true` count query plus a most-recent-workout-with-sets query run in parallel, then one more query for the comparison exercises' historical sets), called from `WorkoutLogger.vue`'s `onMounted` and again after `finishWorkout` so the strip reflects a workout just logged without needing a remount. Two stat tiles render above the "Start workout" form only (`!workout.activeWorkoutId`, matching "Log home screen"): a plain count tile, and — only when `recentPrExerciseName` is set — a `--success`-filled PR tile, which is that token's first real consumer (was reserved-but-unused since the rebrand; `style.css`'s palette comment updated accordingly). Verified via a new `e2e/progress-strip.spec.ts` (reads the count tile before/after finishing a workout rather than asserting an absolute number, since the shared test account accumulates workouts across specs — safe because `playwright.config.ts` runs a single worker) plus a full suite run (16/16), `npm run typecheck`, and `npm run build`.
- Fix installed PWA never picking up new deploys without an uninstall/reinstall (found and fixed 2026-09-24, unrelated to a numbered backlog item): `injectManifest` doesn't get the `skipWaiting`/`clientsClaim` pair `generateSW` auto-adds for `registerType: 'autoUpdate'` — without them a newly-fetched service worker sat in "waiting" until every open tab/window fully closed, which for an installed PWA that's rarely fully quit meant it effectively never activated. `src/sw.ts` now listens for a `SKIP_WAITING` message and calls `clientsClaim()`; `vite.config.ts` sets `injectRegister: false` (the plain auto-injected `registerSW.js` only registers once on load, no update checks); `src/main.ts` instead imports vite-plugin-pwa's real `virtual:pwa-register` client (`registerSW({ immediate: true })`), which polls for updates, posts `SKIP_WAITING` when one's found, and reloads the page on `controllerchange`. `docs/architecture.md#operational-notes` updated with the mechanism and a note that the already-installed app needed one manual force-close-and-reopen to pick up this specific fix (self-updating from then on). Also fixed a race in the same session's new `e2e/progress-strip.spec.ts`, found while verifying this: the "workouts this week" baseline was being read before the on-mount `fetchProgressStats()` call had resolved, occasionally racing against the shared test account's real (large) count instead of its initial `0`. Verified via `npm run build`, `npm run typecheck`, a full `npm run test:e2e` run (16/16), and confirming the deployed site updates in place on a real device without reinstalling.
- Bug: exercise dropdown isn't scoped to the active template (item 21, 2026-09-24): `WorkoutLogger.vue`'s "Exercise" `<select>` listed every one of the user's active exercises even when logging against a template, while the suggested-exercise chips above it were already correctly scoped — a user picking from the dropdown instead of a chip could add an exercise the template doesn't track, which then leaked into that template's "last time" card and post-workout volume chart on future instances. Asked the user to pick between fully restricting the dropdown to the template's exercises vs. a full picker with template exercises merely grouped at top; they chose the restriction, reasoning that ad-hoc additions belong in a separate freeform workout rather than polluting a template's reporting. New `availableExercises` computed in `WorkoutLogger.vue`: returns `exercises.activeExercises` with no active template, or `templates.exercisesByTemplate[workout.activeTemplateId]` mapped to `{id, name}` when one is active; the dropdown now iterates this instead of the raw exercise list. Suggested chips were left in place (not removed) since they still serve as quicker big-tap-target selection on a phone screen and already showed the same scoped set — no behavior change there, so no chip-related e2e specs needed rework for that reason. Required reworking `e2e/volume-chart.spec.ts`'s second workout, which had relied on logging an now-blocked untracked exercise to test the volume chart's carry-forward math; fixed by adding that exercise to the template for real (with no `target_sets`, i.e. "complete" as soon as it has any sets) — the expected actual/projected numbers happened to come out identical, since an exercise "complete" with no target behaves the same as an untracked one for this computation. Verified via a new `e2e/template-scoped-exercises.spec.ts` (freeform workout offers every exercise, templated workout offers only the template's) plus a full suite run (17/17), `npm run typecheck`, and `npm run build`.
- First-run guidance on the Log screen for a brand-new account (item 26, 2026-09-24): `WorkoutLogger.vue`'s pre-start screen now branches on catalog state before showing the "Start workout" form — zero active exercises shows a blocking card ("Add an exercise before logging a workout") with a "Go to Exercises" button instead of the form; exercises present but zero active templates shows a non-blocking inline hint above the form explaining templates are optional, with an inline "create one" link to Templates. Both affordances emit a `navigate` event (new, same emit-and-let-the-parent-switch-`view` pattern `AppMenu.vue` already uses) which `App.vue` wires to `view = $event`, so `WorkoutLogger.vue` doesn't own tab state itself. No store/schema changes; no existing e2e spec's fixture state hits the zero-exercise branch (the shared test account has exercises seeded), so none needed updates. Verified via `npm run build` and a full `npm run test:e2e` run (17/17, one unrelated pre-existing flake in `pre-fill.spec.ts`'s parallel-logging case reproduced and passed clean on rerun).
- Warm up the first-run Log-screen guidance with a designed welcome card and menu coachmark (item 27, 2026-09-24): replaced item 26's plain notice/hint copy in `WorkoutLogger.vue` with the user-approved design pass. Zero-exercise state is now a hero card (circular `icon-512.png` mascot, "Welcome to REP" heading, one-sentence description, "Add your first exercise" button) plus a dashed-arrow SVG coachmark labeled "More lives in the menu" pointing at `App.vue`'s real hamburger button; the progress strip is hidden on this specific state (`workoutsThisWeek === 0` there is guaranteed) but still shows once at least one exercise exists. Zero-template state is now a small card with a 40px mascot, one sentence, and an inline "Create a template" link, sitting above the Start-workout form as before. The coachmark's path is computed at render time from `getBoundingClientRect()` on the welcome card and `document.querySelector('.menu-button')` (re-measured on window resize) rather than hardcoded from the mockup's fixed 390px frame — confirmed necessary during visual verification, since the real header sits lower than the mockup assumed whenever `AuthGate`'s passkey-registration banner is showing above it; hardcoded coordinates would have pointed the arrow at the wrong spot in exactly that case. No store/schema changes. Verified with a scripted, non-committed Playwright check (wiped the test account to a genuine zero-exercise state via `npm run wipe:account`, screenshotted both the welcome card and, after inserting one exercise directly, the template hint) confirming both match the approved mockups, plus `npm run build`, `vue-tsc --noEmit`, and a full `npm run test:e2e` run (17/17) after restoring the test account to empty.
- Setup notes and rest timer on the exercise create form (item 22, 2026-09-24): `ExerciseList.vue`'s create form gained the same setup-notes textarea and rest-timer-seconds input the per-row editors already use, so adding an exercise with a rest timer no longer needs the create-then-scroll-then-edit-twice round trip; `useExercisesStore`'s `createExercise` (`src/stores/exercises.ts`) takes two new optional params (`setupNotes`, `restSeconds`, both defaulting to `null`) and inserts them alongside `name`/`category`. Per-row editors are unchanged and still the only way to edit an existing exercise's notes/rest timer afterward. Verified via a new `e2e/exercise-create-full.spec.ts` (create with name+notes+rest in one submit, confirms the row shows both values and its per-row buttons read "Edit" not "Add") plus a full suite run (18/18, one unrelated pre-existing flake in `templates.spec.ts` reproduced and passed clean on rerun), `npm run typecheck`, and `npm run build`.
- Record celebration: full-screen takeover replacing the PR toast (item 38, 2026-09-24): built to the approved design mockup (`https://claude.ai/artifact/Cr63WNz2AZF4pixzBE1CM5`), swapping item 4's auto-dismissing bottom `.record-toast` for a real "good job" moment — new `src/components/RecordCelebration.vue`, a full-screen overlay (confetti, a rotating ray burst, a bounce-in mascot, and a stat card showing the exercise, the new weight × reps, and the delta over the prior best) shown whenever `workout.newRecord` (`src/stores/workouts.ts`) fires. Deviates from the mockup's auto-fade timer on the user's explicit call: it now requires an explicit dismiss (a "Nice!" button, Escape, or a tap anywhere on the overlay — the mockup's "tap to dismiss sooner" affordance, kept, but without the forced fade), so it blocks the logging form underneath until acknowledged. `workouts.ts`'s `newRecord`/`checkForRecord` now carry the full set (reps/weight/unit/previous-best-volume), not just a volume number, so the screen can show what was actually lifted. New `src/lib/celebration.ts` holds `pickCelebration`, a pure random pick (same separation pattern as `volume.ts`/`progress.ts`) over a seeded pool of two mascot-image + phrase pairs (`public/celebration-bunny.png` and `public/celebration-bear.png`, both on-palette pink/rose art — the mockup's original bear was tan/brown and off-palette, flagged as an open question there; user supplied a re-colored on-palette bear same day, swapped in). Rewrote `e2e/pr-toast.spec.ts` for the new screen (content, manual dismiss, tap-to-dismiss, no-retrigger-on-a-lighter-set) and added a shared `e2e/fixtures/celebration.ts#dismissCelebrationIfShown` helper, called from every other spec that logs a first-ever set for a brand-new exercise (now a guaranteed record) before continuing past it — the overlay's higher z-index (60, above `RestTimer.vue`'s 50) means an undismissed screen blocks any click on the form or a rest screen underneath. Verified via `npm run build`, `npm run typecheck`, a full `npm run test:e2e` run (26/26, one unrelated pre-existing flake in `templates.spec.ts` reproduced and passed clean on rerun), and a scripted, non-committed Playwright screenshot against the real dev build confirming the mascot art, confetti, and stat card render as designed.
- In-app rest timer screen (item 28, 2026-09-24): built to the approved design mockup (`https://claude.ai/artifact/5GzCT8Wb78Uzn4skZ8atAn`) — a new `src/components/RestTimer.vue`, a full-screen overlay with the resting-bunny mascot (the design's uploaded asset, pulled down to `public/rest-bunny.png`, true alpha transparency) breathing via a 4s CSS scale/translateY loop, a live countdown computed off a fixed end time rather than decremented per tick (so interval throttling can't make it drift slow), a progress bar draining from full to empty, and a "Skip Rest" button. Colors are the existing `--bg`/`--surface`/`--accent`/etc. tokens from `src/style.css`, which already matched the mockup's hex values exactly. Item 29 (rotating encouragement copy) stays open, deliberately not bundled in. Verified via a new `e2e/rest-timer-screen.spec.ts` (screen appears with the right countdown/context/skip button, skip dismisses it without touching the logged set, and a 1-second timer auto-dismisses on its own) plus a full suite run, `npm run typecheck`, and `npm run build`; also confirmed visually via a scripted Playwright screenshot against the real dev build (not committed) matching the approved mockup. See the follow-up fix below for the push-notification interaction — the version that shipped here got it wrong. Documented in `docs/architecture.md#push-notifications`.
- Rotating words-of-encouragement copy on the rest timer screen (item 29, 2026-09-26): `RestTimer.vue` now picks one line at random from a small hand-written array (including the original "Nice work — take a breather") in its own `setup()`, so a fresh phrase shows each time `WorkoutLogger.vue`'s `v-if="activeRest"` remounts the component for a new rest period, rather than re-rolling mid-rest on a timer. Updated `e2e/rest-timer-screen.spec.ts`'s two hardcoded-text assertions to target `.rest-headline` instead, since the exact copy is no longer fixed. Verified via a full suite run (25/25), `npm run typecheck`, and `npm run build`.
- Fix rest timer push notification going silent when backgrounded (item 28 follow-up, 2026-09-24): the version above decided the in-app screen vs. the push once, at the moment `addSet` landed, based on `document.hidden` — but logging a set is itself always done in the foreground, so that check always picked the in-app screen and never sent the push at all. Reported by the user after real-device testing: locking the phone or switching apps during the rest period got nothing — no push, no vibration — because `RestTimer.vue`'s own `setInterval` also gets suspended once backgrounded, so neither path ever fired. Fixed by moving the decision from a one-time check to a `visibilitychange` listener (`handleRestVisibilityChange` in `WorkoutLogger.vue`) that stays registered for the component's lifetime and fires the push the first time the tab actually goes hidden while a rest period is active, sending however many seconds are genuinely left (computed from a shared `endsAt` timestamp, now passed into `RestTimer.vue` as a prop instead of it computing its own) rather than the original full duration. A `restPushSent` flag keyed per rest period stops a second background/foreground toggle from sending it twice. Staying foregrounded the whole rest period is unaffected — still just the in-app screen, no push, since the on-screen countdown hitting zero (with its own vibration) already is the alert in that case. No test added for the actual push firing on backgrounding — same as item 15's original delivery path, that needs a real device and isn't something Playwright can exercise headlessly without faking the browser Push API, which the project avoids; re-verification of this specific fix is a new `[human]` sub-item under item 15's device-testing checklist in `docs/backlog.md`. Verified via a full `npm run test:e2e` run (20/20), `npm run typecheck`, and `npm run build`.
- Ability to delete a workout from History (item 31, 2026-09-24): `src/stores/workouts.ts` gained `deleteWorkout(id)`, deleting the `workouts` row and updating `history` locally (no separate cleanup of its sets needed — `sets.workout_id` already has `on delete cascade`). `WorkoutHistory.vue` shows a "Delete" button per card behind an inline confirm step ("Delete this workout? This can't be undone." / "Confirm delete" / "Cancel"), same toggle pattern as the per-row inline editors elsewhere, since this is destructive with no undo. Verified via a new `e2e/delete-workout.spec.ts` (delete flow including cancel-backs-out, plus confirms the row is actually gone via the admin client) plus a full suite run (21/21, one unrelated pre-existing flake in `pre-fill.spec.ts`'s parallel-logging case reproduced and passed clean on rerun), and `npm run build`.
- Archived exercise stops surfacing on templates it's still attached to (item 25, 2026-09-24): `archiveExercise` only ever flipped `exercises.is_archived`, never touching `workout_template_exercises`, so an archived exercise attached to a template kept appearing as a suggested chip and a loggable dropdown option every time that template was used. Fixed at the read path instead of the write path: `templates.ts`'s `fetchTemplateExercises`/`addExerciseToTemplate` now select `exercises(name, is_archived)` (added to `TemplateExerciseWithName` in `src/lib/types.ts`), and a new `activeTemplateExercises` computed in `WorkoutLogger.vue` filters out archived exercises before feeding both the suggested chips and the templated-workout exercise picker (`availableExercises`). `TemplateManager.vue` was left as-is (still shows an archived exercise attached to a template, so it can still be seen/removed there) — only the "surfaces for future logging" paths needed the filter. The past-data path (post-workout volume chart's history) was deliberately not touched, since it reads a set's own `exercise_id`, not this list. The "should archiving warn if attached to a template" open question from this item's write-up stays deferred to item 24's confirm-step UI. Verified via a new `e2e/archived-template-exercise.spec.ts` plus a full suite run (22/22), `npm run typecheck` (via `vue-tsc -b`), and `npm run build`.
- Fix "invalid input syntax for type numeric" on blank optional numeric fields (found and fixed 2026-09-24, unrelated to a numbered backlog item): reported by the user while manually testing item 25 — adding a set with RPE left blank threw a Postgres numeric error instead of saving. Root cause: `v-model.number` on an emptied `<input type="number">` leaves the ref as `''`, not `null` — RPE (`WorkoutLogger.vue`) and target sets (`TemplateManager.vue`) are the only two numeric inputs in the app without a `required` guard forcing a real value first, so they were the only ones that could reach their store call with `''` still in the ref and send it straight through to a `numeric` column. Fixed with a `normalizeRpe`/`normalizeTargetSets` helper at each of the four call sites (`WorkoutLogger.vue`'s add-set and edit-set save handlers; `TemplateManager.vue`'s add-exercise and edit-target-sets save handlers) that coerces `''` to `null` before the store call. Verified via a new `e2e/optional-numeric-fields.spec.ts` (blank RPE on add and on edit-back-to-blank; blank target sets on add) plus a full suite run (24/24, one unrelated pre-existing flake in `pre-fill.spec.ts`'s parallel-logging case reproduced and passed clean on rerun), `npm run typecheck`, and `npm run build`.
- Fix item 25's archived-exercise filter reading a stale snapshot, and add an "Archived" tag on the Templates screen (item 25 follow-up, 2026-09-24): the user noticed an archived exercise still showing plainly (no indication it was archived) under its template on the Templates screen, which was the intentional part of item 25's design — but digging in while adding the "Archived" tag surfaced that the underlying filter in `WorkoutLogger.vue` was actually broken, not just intentionally scoped. Both it and the new tag had read `te.exercises.is_archived` off `templates.exercisesByTemplate`'s cached join, which `fetchTemplateExercises` only ever fetches once per template per session — so the flag was a snapshot from whenever the template was last expanded/loaded, and archiving an exercise afterward in the same session never invalidated it. Net effect: item 25's fix only worked if the template's exercises hadn't been fetched yet at archive time (e.g. a fresh page load) — the realistic same-session flow (archive an exercise, then immediately log against a template it's on) still showed it. Caught by manually re-running `e2e/archived-template-exercise.spec.ts` with an added wait for the suggested-chips container before asserting — the original assertion had been passing for the wrong reason, checking before that section had even rendered. Fixed by reading the live `exercises` store instead (mutated in place by `archiveExercise`, so always current) in both `WorkoutLogger.vue`'s `activeTemplateExercises` filter and a new `isExerciseArchived` helper in `TemplateManager.vue`, which now shows a small "Archived" pill next to the exercise name so an attached-but-archived exercise isn't shown as if nothing's different. Reverted the now-unneeded `is_archived` join added to `templates.ts`'s selects and `TemplateExerciseWithName` in `src/lib/types.ts`. Verified via the updated `e2e/archived-template-exercise.spec.ts` (now also checks the Archived tag, and waits for render before asserting absence) run 6x with `--repeat-each`, plus two full clean `npm run test:e2e` runs (24/24 each) and `npm run build`.
- Add a confirm step before archiving a template (item 35, 2026-09-24): `TemplateManager.vue`'s "Archive" button fired `archiveTemplate` immediately on click with no way back — reported by the user after losing a test template. Now reuses the same inline toggle-state confirm pattern `WorkoutHistory.vue` shipped for workout delete (item 31): clicking "Archive" swaps the row for "Archive this template? This can't be undone." with "Confirm archive"/"Cancel" in place, rather than a separate section appended below. Verified via a new `e2e/template-archive-confirm.spec.ts` (confirm text appears, Cancel backs out with the template still active, Confirm archive actually removes it from the active list) plus a full suite run (25/25) and `npm run build`.
- Fix setup notes box smushed against the exercise picker on the Log screen (item 34, 2026-09-24): `WorkoutLogger.vue`'s `.setup-notes` box had `margin: -4px 0 4px`, pulling it up flush against the "Exercise" `<select>`'s bottom edge instead of leaving normal spacing. Changed to `margin: 8px 0 4px`. Verified via a scripted Playwright screenshot (not committed) confirming visible breathing room, plus a full `npm run test:e2e` run (25/25) and `npm run build`.
- Fix setup notes box shorter (top to bottom) than the exercise picker above it (item 37, 2026-09-24): found while re-checking item 34's fix. `WorkoutLogger.vue`'s `.setup-notes` box had no `min-height`, so it sat visibly shorter than the "Exercise" `<select>` above it (which gets `min-height: 48px` from `src/style.css`'s shared rule). Added `min-height: 48px` plus `display: flex; align-items: center` to vertically center the note text inside the taller box; `min-height` (not fixed `height`) still lets it grow for multi-line notes. Verified via `npm run build` and a full `npm run test:e2e` run (26/26).
- Remove the unused `exercises.category` field (item 30, 2026-09-24): dropped the free-text category input from `ExerciseList.vue`'s create form (and its `<datalist>` suggestions) and the `<div v-if="exercise.category">` display under each row, removed the param from `createExercise` (`src/stores/exercises.ts`), removed `category` from the `Exercise` interface (`src/lib/types.ts`), dropped the column from `supabase/schema.sql` and `docs/architecture.md`'s data-model table. The live Supabase column still needs `alter table exercises drop column category;` run by hand in the SQL editor (same no-DDL-access pattern as every other schema change) — flagged to the user, not run automatically. No e2e spec referenced category, so none needed updates. Verified via `npm run build` (`vue-tsc -b` clean) and a full `npm run test:e2e` run (26/26).
- Ability to edit a past workout from History (item 32, 2026-09-24): `src/stores/workouts.ts` gained `updateHistorySet`/`deleteHistorySet`/`updateWorkoutNotes`, mirroring item 13's `updateSet`/`deleteSet` but reading/writing `history` instead of `activeSets`. Scoped deliberately to sets that already exist on a finished workout — decided against allowing a brand-new set to be added to a past workout, since that would re-trigger `set_index`/volume-chart implications for any template it's linked to, and the cheaper "existing sets only" option already covers the reported pain point (a wrong rep/weight/RPE entry) without that complexity. `WorkoutHistory.vue` now shows "Edit"/"Delete" per set row (same inline-form pattern as `WorkoutLogger.vue`'s active-set editor) and an "Edit notes"/"Add notes" affordance per card (same pattern as `ExerciseList.vue`'s notes editor), reusing item 31's card-level "Delete workout" placement/confirm-step convention alongside these new per-row actions rather than introducing a different one. Verified via a new `e2e/edit-past-workout.spec.ts` (edit notes, edit a set, cancel-discards-draft, delete one of two sets while confirming the workout and its other set survive) plus a full suite run (27/27), and `npm run build`.
- Redesign exercise row actions into pencil/trash icons (item 24, 2026-09-24): `ExerciseList.vue`'s four ghost text buttons ("Edit name", "Edit notes"/"Add notes", "Edit rest timer"/"Add rest timer", "Archive") became two icon buttons per row — a pencil (`aria-label="Edit exercise"`) opening one consolidated flyout covering name, setup notes, and rest timer together, and a trash can (`aria-label="Delete exercise"`) behind an explicit confirm step, same inline-toggle pattern as `WorkoutHistory.vue`'s workout delete (item 31) and `TemplateManager.vue`'s template archive (item 35). Built on the same-day archive-vs-delete decision (see "Decisions made" above): kept the `is_archived` soft-delete at the DB level, but the UI now calls it "Delete" and drops the archive pretense — `exercises.ts`'s `archiveExercise` function itself is unchanged, only its button label and confirm step moved. `updateExerciseName`/`updateSetupNotes`/`updateRestSeconds` were consolidated into one `updateExercise(id, name, setupNotes, restSeconds)` doing a single write, since the flyout now saves all three fields together. Updated `e2e/exercise-edit-name.spec.ts`, `exercise-notes.spec.ts`, `rest-timer.spec.ts`, `rest-timer-screen.spec.ts`, `exercise-create-full.spec.ts`, and `archived-template-exercise.spec.ts` for the new icon `aria-label`s and consolidated form; added a new `e2e/exercise-delete-confirm.spec.ts` (cancel backs out, confirm actually deletes). Verified via `npm run build` and a full `npm run test:e2e` run (28/28, one unrelated pre-existing flake in `pre-fill.spec.ts` reproduced and passed clean on rerun) — an earlier run in the same session also hit Supabase's `verifyOtp` rate limit on the shared test account from running the suite back-to-back several times; unrelated to this change and cleared after waiting, but worth revisiting the `[human]` Resend-account fallback in `docs/backlog.md` if it keeps happening.
- Brand system refresh: palette, type, and bunny mark tokens (item 40, 2026-09-24): replaced `src/style.css`'s `:root` tokens with the RepBunny palette from the private canvas mockup's "Style" artboard — `--bg`/`--surface`/`--surface-2` now Night/Warren/#241a2c, `--text`/`--text-dim` now Cream/a muted plum-grey, `--accent`/`--accent-pressed` now Bunny Pink/Pink Strong, `--secondary` reassigned Lavender (was orange), `--highlight` reassigned Carrot Gold (was gold, same role), `--success` now Sprout green, `--danger` nudged to a warm rose in the same family, `--border` picked as a flat approximation of the mockup's translucent white-on-surface overlays. Added `--font-display` (Baloo 2) and `--font-body` (Manrope, replacing the old system-font stack), loaded via a Google Fonts `<link>` in `index.html` (plus preconnects) rather than a CSS `@import`; `body` and `h1` now consume them (`h1` doubles as the page-title role Baloo 2 fills in the mockups). Also synced `vite.config.ts`'s manifest `theme_color`/`background_color` and `index.html`'s `theme-color` meta to the new `--bg` value, since they're supposed to track it per the file's own comment — left `name`/`short_name`/`<title>` as "REP" for item 39 to rename. Purely tokens; no component markup changed, so every existing screen just re-skins in place. Verified via `npm run build` and a full `npm run test:e2e` run (28/28, one unrelated pre-existing flake in `archived-template-exercise.spec.ts` reproduced and passed clean on rerun).
- Rebrand REP to RepBunny (item 39, 2026-09-25): renamed the app throughout — `vite.config.ts` manifest `name`/`short_name`, `index.html`/`src/main.ts` title, the in-app wordmark (`App.vue`, `AppMenu.vue`, `LoginForm.vue`, `WorkoutLogger.vue`'s empty-state), `e2e/auth.spec.ts`'s title assertion, and the `README.md`/`AGENTS.md`/`CLAUDE.md`/`docs/architecture.md` headings. The PWA icon set (`icon-192`/`icon-512`/`apple-touch-icon`/favicons/`favicon.ico`/`badge-96`) was NOT changed — the existing bunny-with-dumbbells mark from the original REP rebrand stays as-is; an icon swap was attempted mid-session using bunny mascot art the user shared, but that art was actually meant for the Onboarding artboard (item 42), not the app icon, and got reverted once clarified. That art is staged at `public/onboarding-bunny.png` for item 42 to consume. Verified via `npm run build` and a full `npm run test:e2e` run (28/28).
- First-launch onboarding screen (item 42, 2026-09-25): new `src/components/OnboardingScreen.vue` — dark radial-gradient full-bleed screen with two soft accent-color glow blobs, the circular `public/onboarding-bunny.png` mascot, "RepBunny" wordmark (`--font-display`), tagline, and a pill-shaped "Let's hop in" CTA, matching the canvas mockup's "Onboarding" artboard almost exactly (brand tokens from item 40 already matched its palette 1:1; the mockup's fake status bar and swipe-dot pagination were left out — decorative device chrome and an unbuilt multi-step flow, respectively — kept one static decorative dot row for visual fidelity only). Wired into `AuthGate.vue`: shown instead of `LoginForm` only when signed out AND a new `repbunny-onboarding-seen` localStorage flag isn't set yet; the CTA sets the flag and reveals the normal sign-in screen. Bypassed entirely for an already-signed-in session (including the injected-session e2e path), so it only ever gates the true first-launch, signed-out case. Updated `e2e/auth.spec.ts`'s "shows the login form when signed out" test to click through the CTA first, and added `e2e/onboarding.spec.ts` (first-launch shows onboarding not the form; CTA reveals the form; a reload afterward goes straight to the form). Verified via `npm run build` and a full `npm run test:e2e` run (30/30). Not visually verified in a real browser this session — the Claude in Chrome extension wasn't connected — so give it a look on first load before considering it fully done.
- Redesigned sign-in screen, passkey-first (item 43, 2026-09-25): rebuilt `LoginForm.vue` to match the canvas mockup's "Auth" artboard — full-bleed radial-gradient background with a pink glow blob, a bordered icon circle, "Welcome back" heading, and the pill-shaped "Sign in with passkey" CTA as the primary action, with the email/magic-link path demoted below an "OR" divider (outlined pill button, not filled). Purely a front-end restructure calling the same `signInWithPasskey`/`sendMagicLink` store methods; no store or auth logic changed. Dropped the old `RepBunny` wordmark/logo header in favor of the mockup's icon-only treatment (onboarding already carries brand identity on first launch; this screen is the repeat-visit/signed-out state). Left out the mockup's fake status bar and back-chevron (decorative device chrome and prototype-only navigation, per the same convention as item 42's onboarding screen). Verified via `npm run build` and a full `npm run test:e2e` run (29/30 — one unrelated pre-existing flake in `exercise-create-full.spec.ts`, reproduced and passed clean on rerun in isolation). Not visually verified in a real browser this session — the Claude in Chrome extension wasn't connected — so give it a look before considering it fully done.
- Real routing via Vue Router, so back-gesture/back-button navigates in-app (2026-09-25, found while discussing item 44's design follow-up — unrelated to a numbered backlog item): the app never pushed a browser history entry — `App.vue` swapped screens via a plain `view` ref — so there was only ever the one entry from initial load and a swipe-back gesture had nowhere to go but out of the app (the exact complaint that prompted the "Back Navigation Fix" design, `https://claude.ai/artifact/2BRqwdQQPi9G9HA7RzEVvi`). Added `vue-router` (new `src/router.ts`, routes `/`, `/history`, `/templates`, `/exercises` named `log`/`history`/`templates`/`exercises`) and swapped `App.vue`'s `<section class="content">` v-if chain for `<router-view />`; `AppMenu.vue`'s drawer items and `WorkoutLogger.vue`'s three navigation buttons (empty-state CTA, template-hint link, "+ New" chip) now call `router.push` directly instead of emitting a `navigate` event up to a `view` ref — this makes the earlier design's bespoke "Back to workout" contextual chip unnecessary, since native back now returns to wherever the user actually came from. Kept the existing hamburger-drawer UI as-is; this was purely the underlying navigation mechanism, not a UI change (item 41's tab bar is still a separate, later piece of work). Also had to extend the PWA shell to match: `public/_redirects` (`/* /index.html 200`) added for Cloudflare Pages so a hard reload on `/templates` etc. doesn't 404, and `src/sw.ts` gained a `workbox-routing` `NavigationRoute` serving the precached `index.html` for the same reason offline (only `/` was in the precache manifest before). No e2e spec needed changes — `AppMenu`'s buttons and `WorkoutLogger`'s nav buttons kept the same roles/labels, only what happens on click changed. Verified via `npm run build` and a full `npm run test:e2e` run (30/30), plus a manual `curl` check that `/templates`, `/exercises`, and `/history` all serve the SPA shell (200) directly. Not visually verified in a real browser this session — the Claude in Chrome extension wasn't connected — worth confirming the swipe-back gesture actually feels right on a device before considering this fully done.
- Home screen visual refresh (item 44, 2026-09-25): restyled `WorkoutLogger.vue`'s progress strip and template picker to match the canvas mockup's "Home" artboard. The "this week" tile now pairs the workout count with a 7-dot Mon–Sun paw-print tracker (a filled bunny-paw SVG in `var(--accent)` for a day with a logged workout, a plain translucent dot otherwise) instead of just a number+label; `workouts.ts`'s `fetchProgressStats` now also fetches each week workout's `performed_at` to compute the new `workoutDaysThisWeek` boolean array (kept `workoutsThisWeek` as the count, now derived from the same query instead of a separate `head:true` count call). The recent-PR tile got a celebratory treatment — a gold "NEW" pill badge, a "PR!" headline in the display font/success color, and a new reps×weight detail line — which required `lib/progress.ts`'s `findRecentPr` to return the record-setting set's reps/weight/unit (as `RecentPr`) instead of just the exercise name, and the store's `recentPrExerciseName` field became `recentPr` (an object). The template `<select>` on the start-workout form became a horizontally-scrollable row of quick-pick chips (Freeform + one per active template + a dashed "+ New" chip that navigates to Templates), still driving the same `templateId` ref. Updated the e2e specs that drove the old dropdown (`archived-template-exercise`, `pre-fill`, `template-scoped-exercises`, `templates`, `volume-chart`) to click the chip button instead of `selectOption`; `progress-strip.spec.ts` needed no changes since it only asserts on `.stat-tile .stat-value` and `.stat-tile-pr .stat-label`, both still present with the same content. Uses `color-mix()` for the PR tile's tinted background/border and badge (new to this codebase, but the app targets modern browsers only). Verified via `npm run build` and a full `npm run test:e2e` run (30/30). Not visually verified in a real browser this session — the Claude in Chrome extension wasn't connected — so give it a look before considering it fully done.
- Bottom tab bar navigation (item 41, 2026-09-25): replaced `AppMenu.vue`'s hamburger drawer (item 18) with a new `src/components/BottomNav.vue` — a persistent, fixed bottom tab bar (Home / History / Templates / Exercises) matching the canvas mockup's bottom-nav treatment from the "Home" artboard, reused across all four screens via `router-link`s to the named routes. Active-tab styling (pill background + accent-colored icon/label) uses `color-mix(in srgb, var(--accent) 16%, transparent)`, the same technique WorkoutLogger.vue's PR tile already uses (item 40's accent token, item 44's precedent). Renamed the `home` route (`router.ts`) from `log` to `home` to match the tab's visible label, updated everywhere that referenced it (`App.vue`'s `View`-typed `currentView`). The header's hamburger button is gone; its only other job (sign out) is now a direct icon button in the header ("frees the header for a lighter secondary action" per the backlog wording) — no confirm step, matching the old drawer's own one-tap sign-out and the fact that signing out is trivially reversible (passkey sign-in). `main`'s bottom padding grew to clear the new fixed bar so the version footer isn't hidden underneath it. Reworked `e2e/fixtures/nav.ts`'s `goTo` helper to click a tab link directly instead of opening a menu first (its `view` union's `'Log'` became `'Home'`), and updated every spec that calls it (14 files) plus `e2e/auth.spec.ts`'s sign-out test (no more "Open menu" step). Added `e2e/bottom-nav.spec.ts` covering all four tabs' navigation and `aria-current="page"` on the active tab. Verified via `npm run build` and a full `npm run test:e2e` run (31/31). Not visually verified in a real browser this session — the Claude in Chrome extension wasn't connected — so give it a look before considering it fully done.
- History screen visual refresh (item 45, 2026-09-25): restyled `WorkoutHistory.vue` to match the canvas mockup's "History" artboard — each entry now sits in a timeline (a vertical rail with a dot per workout, connected by a line to the next), and only the single most recent workout renders full detail by default; every older entry renders as a condensed card (date, template tag, one-line "Exercise A, Exercise B + N more" summary) that expands to the old full card (notes, per-set edit/delete, workout delete) on tap — a click-to-expand toggle, not in the mockup itself, added so condensing by default didn't regress any existing edit/delete functionality. A workout's timeline dot gets a distinct gold marker (plus a "PR set this workout" line with the same paw-print icon WorkoutLogger.vue's week tracker uses, in `var(--highlight)` instead of `var(--accent)`) when it contains a set that was an all-time record at the time it was logged — new `lib/progress.ts` `findPrWorkoutIds`, replaying the same "strictly greater than prior best" rule as `checkForRecord`/`findRecentPr` chronologically across full history rather than just the latest workout. Confirmed with the user that "condense entries beyond the most recent couple" (backlog wording) means matching the mockup's pixels (1 entry expanded), not a literal 2. `.template-tag` restyled from an outlined pill to a filled accent-tinted one; `.card`/`li.row-wrap`/button label selectors existing e2e specs depend on (`delete-workout`, `edit-past-workout`, `templates`) were kept unchanged since the newest workout — always what those specs just created — stays auto-expanded. Verified via `npm run build` and a full `npm run test:e2e` run (30/30, one unrelated pre-existing flake in `pr-toast.spec.ts` reproduced and passed clean on rerun in isolation), plus a scripted Playwright screenshot check at 390×844 (the Claude in Chrome extension wasn't connected this session) confirming the rail/dots/condensed cards/PR marker/expand-toggle all render as intended.
- Templates screen visual refresh (item 46, 2026-09-25): restyled `TemplateManager.vue`'s template rows to match the canvas mockup's "Templates" artboard — each card now gets a 46px icon square (tinted background + matching icon color via `color-mix()`, same technique as `BottomNav.vue`'s active-tab pill) and an "N exercises" subtext line under the name, in place of the old plain name + "Archive" text button row. There's no per-template category to derive the icon/color from (item 30 dropped `exercises.category`), so both are assigned deterministically by hashing the template's id against a fixed 4-entry palette (`--accent`/`--secondary`/`--success`/`--highlight` paired with a barbell/legs/flame/target icon) — stable across re-fetches and re-sorts, unlike an index into the current list. The exercise count comes from a new embedded `workout_template_exercises(count)` aggregate in `templates.ts`'s `fetchTemplates` select rather than a per-template fetch (`WorkoutTemplate` gained an optional `workout_template_exercises` field in `lib/types.ts` to carry it). The "Archive" text button became a 36px icon button (trash/box glyph, `aria-label="Archive template"`) behind the same two-step confirm as before — no e2e spec needed changes, since Playwright's default `getByRole` name match is substring-based and `template-archive-confirm.spec.ts`'s `{ name: 'Archive' }` still matches the new accessible name. Verified via `npm run build` and a full `npm run test:e2e` run (31/31), plus a scripted Playwright screenshot at 390×844 confirming the icon tints, subtext, and archive button render as intended.
- Accessible labels on the weekly paw-tracker dots (item 55, 2026-09-25): the `paw-day` spans in `WorkoutLogger.vue`'s "This week" tile had no text alternative — a screen reader got nothing for which weekday each dot represented or whether it was completed (the SVG paw icon itself was already correctly `aria-hidden`). Added a new `weekdayNames` array (Monday-first, matching `workoutDaysThisWeek`'s existing Monday-based indexing) and an `aria-label` per dot reading e.g. "Monday: workout logged" / "Tuesday: no workout logged". Verified via `npm run build` and a full `npm run test:e2e` run (31/31, one unrelated pre-existing flake in `delete-workout.spec.ts` reproduced and passed clean on rerun in isolation).
- Exercises screen visual refresh (item 47, 2026-09-25): restyled `ExerciseList.vue` to match the canvas mockup's "Exercises" artboard — the "Rest timer alerts are enabled on this device" line is now a `--success`-tinted pill/banner (info-circle icon, same `color-mix()` tint technique as items 45/46) instead of plain caption text, and each row's setup notes / rest timer seconds now render as tag pills (`.tag-pill`, neutral `--surface-2` background for setup notes; `.tag-pill-accent`, `--accent`-tinted, for the rest timer) in a new `.row-tags` wrapper, replacing the old plain-text `.row-notes`/`.row-sub` lines. Updated three e2e specs whose selectors targeted the removed classes (`exercise-notes.spec.ts`, `exercise-create-full.spec.ts`, `rest-timer.spec.ts` now target `.tag-pill`). Verified via `npm run build`/`vue-tsc --noEmit`, two full `npm run test:e2e` runs (31/31 each, two different unrelated pre-existing flakes — `template-archive-confirm.spec.ts` and `volume-chart.spec.ts` — each reproduced once and passed clean on rerun; both are pre-existing timing flakiness from the shared test account's large accumulated exercise/template list, not caused by this change), and a scripted Playwright screenshot at 390×844 (Chrome extension wasn't connected this session) confirming both the pill/banner and the row tag pills render as designed.
- Honestly label the PR celebration/tile delta as a volume delta, not a weight delta (item 49, 2026-09-25): both `RecordCelebration.vue` and `WorkoutLogger.vue`'s home-screen recent-PR tile display a record that `checkForRecord`/`findRecentPr` (`src/stores/workouts.ts`, `src/lib/progress.ts`) actually compute as `reps × weight` (set volume), but the copy framed it as a weight PR — `RecordCelebration.vue`'s delta line read "+720 lb over your last best" (a volume number suffixed with a bare weight unit, implying a heavier lift when reps may have gone up and weight down) and the home tile's headline just said "PR!" with no indication it's a volume-based record. Changed the delta line to "+{{ delta }} {{ weightUnit }}-reps of volume over your last best" and the tile headline to "Volume PR!"; no computation changed, this was copy-only. Updated `e2e/pr-toast.spec.ts`'s assertion for the new delta text. Verified via `npm run build` and a full `npm run test:e2e` run (31/31, three unrelated pre-existing flakes — `edit-template-exercise.spec.ts`, `optional-numeric-fields.spec.ts`, `template-scoped-exercises.spec.ts` — each reproduced once and passed clean on rerun in isolation).
- Guardrail on empty-workout finish and single-set deletion (item 51, 2026-09-25): `WorkoutLogger.vue`'s "Finish workout" now shows an inline "Finish with no sets logged? This will discard the workout." confirm (Discard workout / Cancel) instead of silently deleting the workout row when `activeSets` is empty — same trigger condition `finishWorkout()` in `src/stores/workouts.ts` already used to decide whether to delete. Per-set delete (`handleDeleteSet` in both `WorkoutLogger.vue` and `WorkoutHistory.vue`) now requires the same inline confirm step (Confirm delete / Cancel) already used for whole-workout delete, rather than deleting on a single tap. Verified via updated `e2e/zero-set-cleanup.spec.ts`, `e2e/edit-delete-set.spec.ts`, and `e2e/edit-past-workout.spec.ts`, plus `npm run build` and a full `npm run test:e2e` run. While verifying, found the suite flakes on repeated back-to-back full runs (unrelated to this change, reproduced on a clean `git stash` of `main` too) — logged as backlog item 56 rather than chased down here.
- Root-caused and partially fixed the recurring e2e flakiness (item 56, 2026-09-25): the dominant cause is data volume, not the originally-suspected auth-rate-limiting (that turned out to be real too — see the follow-up entry below — but secondary) — the shared test account had silently accumulated 1437 `exercises` rows, 1060+ `workouts` rows, and 545 `workout_templates` rows (years of stamped `E2E … <timestamp>` test data with no cleanup), and Supabase/PostgREST's default 1000-row page size on any unbounded `.select()` silently truncates past that, alphabetically by whatever `.order()` the query used. That's why *which* spec failed varied run to run: it depended only on where that run's freshly stamped name happened to land in the truncated, alphabetically-sorted result — reproduced directly by running `template-archive-confirm.spec.ts` alone three times back to back (fail/pass/fail, no other spec involved). Three real bugs fixed as part of diagnosing this: (1) `fetchProgressStats()` in `src/stores/workouts.ts` computed `workoutsThisWeek` from `weekWorkouts?.length` instead of an exact count, so the tile silently froze once the account's weekly total crossed 1000 — switched to `count: 'exact'` on the same query. (2) `e2e/template-scoped-exercises.spec.ts` and `e2e/pre-fill.spec.ts` both finished an empty workout without handling item 51's new confirm-before-discard dialog (shipped earlier the same day), so they'd become 100%-failing, not flaky, the moment item 51 landed — added the missing "Discard workout" click to both. (3) `e2e/archived-template-exercise.spec.ts` started a workout and never finished or discarded it, permanently leaking one more empty `workouts` row into the account on every single run — added a Finish + Discard at the end. Row-count reduction of the existing bloat itself (`npm run wipe:account -- test-automation@example.com`, item 5) is a live Supabase bulk delete, which the auto-mode classifier correctly blocked Claude from running directly — left as a `[human]` item in `docs/backlog.md`, and the structural fix (specs cleaning up/seeding their own data instead of accumulating forever) logged as new item 57 rather than attempted here. Verified via `npm run build` and multiple full `npm run test:e2e` runs: every spec touched by this fix now passes consistently; the remaining occasional failures observed on back-to-back runs are the pre-existing, now-understood row-cap issue on *other*, unrelated exercise/template-name assertions, which item 57 (and the interim `wipe:account` reset) resolves.
- Item 56 follow-up, same day: user ran `npm run wipe:account -- test-automation@example.com` themselves (deleted 1139 `workouts`, 558 `workout_templates`, 1492 `exercises` — the classifier-blocked bulk delete from the entry above), clearing the row-cap issue. Re-running the full suite back to back afterward surfaced the *other* originally-suspected cause for real this time: `verifyOtp failed: Request rate limit reached` on 14 of 31 specs in one run — genuine GoTrue OTP-issuing throttling, tripped by the sheer number of full-suite runs done back to back while verifying the row-cap fix (5 in ~20 minutes, each minting ~30 sessions). Added a short retry-with-backoff (`withRateLimitRetry` in `scripts/lib/mint-test-session.mjs`, 2 attempts at 2s/6s) around both `generateLink` and `verifyOtp`, tight enough to fit inside Playwright's 30s per-test timeout for a transient blip, not intended to survive a limit that's still hot after ~8s. Verified via `npm run build` and a full `npm run test:e2e` run (31/31) immediately after the reset — several specs visibly took longer than their usual time (e.g. `pre-fill.spec.ts` 16.6s vs. the usual ~8-12s), consistent with the retry quietly absorbing rate-limit blips rather than surfacing them as failures. A limit that stays hot across many consecutive full-suite runs (as opposed to normal 2-3-in-a-row use) will still need an actual wait — not something a short client-side retry can paper over.
- Volume chart explains "Projected" and labels its unit (item 53, 2026-09-25): `VolumeChart.vue` showed an Actual/Projected legend with no explanation of the carry-forward rule and no axis/unit label. `src/lib/volume.ts`'s `computeVolumeHistory` now returns a `weightUnit` per `VolumeChartPoint` (mode of that workout's sets' `weight_unit`, defaulting to `'lb'` for a zero-set workout — a set-level field, so a workout could in principle mix units even though real usage doesn't). `VolumeChart.vue` adds a short explainer paragraph under the legend describing the carry-forward rule, and a left-hand axis label (max value + unit, e.g. "2000 lb") next to the chart, plus an `aria-label` on the `<svg>` stating the unit for screen readers. Unit shown is taken from the most recent point. Extended `e2e/volume-chart.spec.ts` with assertions on the explainer text, the axis label, and the chart's accessible name. Verified via `npm run build` and a full `npm run test:e2e` run (32/32).
- Dynamic in-progress header for the active workout (item 50, 2026-09-25): `WorkoutLogger.vue`'s heading was hard-coded to "Log a workout" regardless of whether a workout was active. It now reads the active template's name (or "Freeform workout" when none), and a ticking `mm:ss`/`h:mm:ss` elapsed-time clock appears next to it. `stores/workouts.ts` gained `activeWorkoutStartedAt` (a plain `Date.now()` timestamp, set in `startWorkout()` and cleared in `finishWorkout()` — deliberately not persisted; true cross-refresh resume needs a `finished_at`-style schema migration out of scope for this item, per the item's own note) that the component ticks against via a 1s `setInterval`. Also folded in the item's other ask: the suggested exercise chips and the exercise `<select>` both just set `exerciseId` but had no visual relationship — chips now get a `chip-selected` state (new `.chip.chip-selected` CSS, `aria-pressed`) that stays in sync with whichever exercise is selected, whether picked via a chip or the dropdown. Added `e2e/workout-header.spec.ts` covering the static/freeform/templated header states, the elapsed clock actually advancing, and the chip/select highlight staying synced both directions. Verified via `npm run build` and a full `npm run test:e2e` run (32/32).
- Template creation form opens on demand instead of pinning to the top of the Templates tab (item 54, 2026-09-25): `TemplateManager.vue`'s "Add template" form used to render as a permanent card above the list on every visit. Replaced with an accent "Add template" trigger button that opens the form as a dialog (`role="dialog"`, backdrop click and Escape both close it, same overlay shape as `RecordCelebration.vue`), closing automatically on a successful create. Kept the existing up/down reorder buttons rather than switching to drag handles, per the item's own note (no keyboard-equivalent drag affordance on mobile). Updated the 8 e2e specs that create a template (`templates`, `edit-template-exercise`, `optional-numeric-fields`, `archived-template-exercise`, `template-scoped-exercises`, `template-archive-confirm`, `workout-header`, `volume-chart`) to click the trigger before filling the name field, and extended `templates.spec.ts` with assertions that the name field is absent until the trigger is clicked and that Cancel closes the dialog without creating anything. Verified via `npm run build` and a full `npm run test:e2e` run (34/34).
- Rest timer manual adjustment and non-destructive return (item 52, 2026-09-25): `RestTimer.vue` gained `-15s`/`+15s` adjust buttons that emit a delta the parent applies to `activeRest.endsAt` (shrinking never rescales the progress bar's `totalSeconds` denominator; growing only extends it when the new remaining time would otherwise exceed it, so the bar never reports past 100%). Also added a "Back to workout" button, distinct from the existing destructive "Skip Rest": it emits `minimize` rather than `dismiss`, and `WorkoutLogger.vue` now tracks a `restMinimized` ref that swaps the full-screen overlay for a small fixed mini-bar (countdown + exercise name, "Resume"/"Skip" actions) sitting just above `BottomNav.vue`, leaving the workout fully usable underneath. Since `RestTimer.vue` only ticks its own completion check while mounted, `WorkoutLogger.vue` runs a second 250ms interval of its own while minimized (started/stopped via a `watch(restMinimized, ...)`) so a rest period completing while minimized still vibrates and clears normally — the two ticking paths never run at once, so there's no duplicate vibration. Extended `e2e/rest-timer-screen.spec.ts` with two new specs: one asserting the countdown moves by ~15s in each direction after the adjust buttons, one covering minimize-then-resume (workout stays interactable and logged sets persist while minimized) and the mini-bar's own Skip ending the rest the same way "Skip Rest" does. Verified via `npm run build` and a full `npm run test:e2e` run (34/34).
- Primary CTAs now use the accent fill instead of the muted ghost style (item 58, 2026-09-25): `WorkoutLogger.vue`'s "Finish workout" (`class="ghost finish"`) and post-finish "Log another workout" (`class="ghost finish chart-dismiss"`) were styled with the same transparent/`--border`/`--text-dim` `.ghost` treatment as secondary actions like Cancel/Edit/Delete, making the two primary next-step actions read as muted. Added a shared `.btn-accent` class to `src/style.css` (same accent fill as `button[type='submit']`) and swapped both buttons to it. Swept the other components using `.ghost` (`ExerciseList.vue`, `TemplateManager.vue`, `WorkoutHistory.vue`, `PasskeyPrompt.vue`) and confirmed every remaining `.ghost` usage is a genuinely secondary action (Cancel, Edit, Delete, reorder, "Not now") — no other primary/ghost mismatches found. Added `e2e/primary-cta-styling.spec.ts` asserting both buttons carry `.btn-accent` and not `.ghost`. Verified via `npm run build` and a full `npm run test:e2e` run (35/35).
- Compact numbered set-logging rows (item 1, 2026-09-25): `WorkoutLogger.vue`'s single-set-at-a-time form (one Reps/Weight/Unit/RPE field set, overwritten set after set) is replaced with a numbered row grid for the selected exercise. Row count is that exercise's `target_sets` for a templated workout, or a single open row for a no-target/freeform exercise. Rows are tracked per exercise id (`draftRowsByExercise`) rather than in one shared field, so switching exercises and back preserves an unsaved row instead of a broad "any set was added" watcher re-deriving it (this also removes the old `applyPrefill`/`lastFilledCount` workaround for a superset partner's slow response stomping on the field, since each exercise's rows can now only be touched by their own code path). A no-target exercise auto-replenishes a fresh open row after each save, matching the old form's continuous-entry feel; a `target_sets` exercise's grid stays fixed at that count once created — its own row disappears into a compact done display in place, not removed from the grid — with manual "+ Add row"/remove controls for over/under-running the plan either way. RPE stays behind a compact "+RPE" per-row expansion rather than a field on every row. Weight unit is one shared lb/kg toggle above the grid instead of a per-row `<select>`. Completing a row calls the existing `addSet`/rest-timer flow unchanged; other rows (and the full per-workout set list below, unaffected by this item) stay interactive while rest runs. Rewrote `e2e/volume-chart.spec.ts`'s two-row (`target_sets: 2`) portions to scope fills/clicks to `.set-row-draft` instead of an unscoped `Reps`/`Weight` lookup, which now matches multiple rows at once; every other existing spec that logs sets (`edit-delete-set`, `optional-numeric-fields`, `pr-toast`, `pre-fill`, `rest-timer-screen`, `progress-strip`, `workout-header`, `delete-workout`, `edit-past-workout`, `archived-template-exercise`, `template-scoped-exercises`, `templates`, `primary-cta-styling`) only ever has a single open row in play and needed no changes. Added `e2e/compact-set-rows.spec.ts` covering a `target_sets: 3` grid, sequential row completion, rows staying open/editable through a minimized rest period, the compact RPE expansion, and manual add/remove. Verified via `npm run build` and a full `npm run test:e2e` run (36/36).
- e2e specs now clean up and seed their own data instead of accumulating permanent rows (item 57, 2026-09-25): new `e2e/fixtures/cleanup.ts` exports a `test` (extending Playwright's own) with a `stamp` fixture — every spec's existing `E2E <thing> <stamp>` naming convention now comes from this fixture instead of a local `const stamp = Date.now()`, and on teardown (pass or fail) the fixture deletes everything that stamp touched via the admin client (`workouts` first so `sets` cascade, then `workout_templates` so `workout_template_exercises` cascade, then `exercises` last, matching the schema's FK cascade direction; also matches on `workouts.notes` for specs that stamp a freeform workout rather than a template). All 21 specs that create stamped data were switched over (import swapped to `./fixtures/cleanup`, local `stamp` declarations removed, `stamp` destructured from the test fixture instead); the 3 that don't create any DB rows (`auth`, `bottom-nav`, `onboarding`) were left on plain `@playwright/test`. `e2e/fixtures/auth.ts`'s `signInAsTestUser` now returns the test account's `user.id` from the session it mints, so specs can seed via the admin client without a second, rate-limit-risking mint call. `e2e/pre-fill.spec.ts`'s two tests each needed a "last workout of the same template" as pre-existing state before the actual behavior under test — both now seed that first workout (exercises, template, template-exercise links, workout, sets, inserted one at a time in original UI-flow order so the `set_index` trigger assigns the same per-exercise ordering) directly via the admin client instead of driving the full logging UI just to create it, followed by `page.reload()` so the app's `onMounted` fetch picks up the seeded rows. Added `scripts/check-e2e-leaks.mjs` (`npm run check:e2e-leaks`) as an ongoing sanity check — counts any remaining `E2E`-stamped `exercises`/`workout_templates`/`workouts` rows and exits nonzero if any are found, for spot-checking the cleanup fixture doesn't regress. Verified via `npm run build` and a full `npm run test:e2e` run (34/34); couldn't run the new leak-check script itself this session (arbitrary new shell/npm commands need interactive approval this sandbox didn't have) — worth a manual `npm run check:e2e-leaks` run to confirm zero leftover rows.
- Recover an interrupted workout after reload (item 59, 2026-09-25): a refresh or installed-PWA relaunch used to lose the live session entirely — `activeWorkoutId`/`activeSets`/`activeWorkoutStartedAt` lived only in the Pinia store — even though the workout and any sets already saved were still sitting in Supabase. `stores/workouts.ts` now persists the active workout's id to `localStorage` (`repbunny-active-workout-id`, following `AuthGate.vue`'s existing key-naming convention) on `startWorkout` success and clears it on `finishWorkout`; a new `checkForRecoverableWorkout()` re-fetches that row (with its sets and template name) through the normal signed-in client — RLS alone decides "no longer exists or belongs to another account," both collapse to the same not-found path, which clears the stale reference. `AuthGate.vue` calls it on the `auth.isSignedIn` transition to `true` (deliberately not `immediate: true` — the watcher's own initial `false` tick, before `auth.init()` resolves, would otherwise wipe the reference before the real sign-in ever got to check it) and calls a new `resetActiveWorkoutState()` on the transition to `false`, so a second account signing into the same shared pilot device never inherits the first account's in-progress session or resume prompt. `WorkoutLogger.vue` gates its whole normal (start-workout / active-workout) view behind a new "Resume your workout?" card whenever `workout.recoverableWorkout` is set, showing the template name, start time, and set count, with Resume (`resumeRecoverableWorkout()`, restoring `activeWorkoutId`/`activeTemplateId`/`activeWorkoutStartedAt`/server-ordered `activeSets` verbatim, no trusted local cache) and a two-step confirm-gated Discard (`discardRecoverableWorkout()`, deletes the row — `sets.workout_id` cascades — only after an explicit second tap, satisfying "saved sets are never silently deleted" even when the recovered workout already has some). Also fixed a latent gap `ensureDraftRows` (`WorkoutLogger.vue`) had no way to hit before resume existed: a no-target exercise's "one open row" rule was `loggedCount === 0 ? 1 : 0`, correct only because a fresh session could never select an exercise with sets already against it — resuming makes that newly possible, so a no-target exercise with existing sets got zero open rows and no way to log another set without the manual "+ Add row" escape hatch; changed to always seed 1 row on first selection, a no-op for the pre-existing normal-session path. `fetchPreviousWorkout` gained an optional `excludeWorkoutId` (only passed by the resume path) so restoring a templated workout's "Last time" card after reload doesn't just find and show the resumed workout as its own most-recent match. Scoped to same-device recovery, as the item specified; cross-device resume and a `finished_at` migration are explicitly out of scope. Added `e2e/resume-workout.spec.ts` covering reload with a saved set (Resume restores header/sets and logging continues), reload before the first set, Discard requiring confirmation and removing the workout and its sets, and a stale/foreign local reference being silently dropped. Verified via `npm run build` and a full `npm run test:e2e` run (40/40).- Make failed set saves safe to retry (2026-09-25): compact draft rows now keep a stable client-generated set ID and show an actionable Retry control while preserving exercise, reps, weight, unit, and RPE. Retries first read the server for that ID; a matching saved row is shown with its original values for normal editing, while a missing row is inserted using the current fields. Duplicate-key responses are accepted only after a matching server read. Failed or in-flight saves cannot start rest, mark a row complete, remove that row, or finish the workout; an in-flight PostgREST write is awaited once. Added e2e/set-save-retry.spec.ts for a definite rejection and a lost response after persistence, including exactly one saved set. Verified with npm run build and the full npm run test:e2e suite (42/42).
- E2E-stamped-row cleanup no longer depends on graceful teardown (item 1, 2026-09-25): confirmed the leaking-cleanup item's hypothesis by force-killing a running `playwright test` process (via a native `Start-Process`/`Stop-Process -Force`, since MSYS `kill -9` against a Windows node.exe process didn't reliably terminate it) partway through `exercise-notes.spec.ts` — its stamped exercise row survived untouched, confirming `e2e/fixtures/cleanup.ts`'s per-test teardown genuinely can't run if the whole process dies mid-test. `cleanupStamp` (the per-stamp cascade-safe delete: workouts, then templates, then exercises) moved out of the fixture into a new plain module, `scripts/lib/cleanup-e2e-stamp.mjs`, so it's shared rather than duplicated by a new standalone script, `scripts/sweep-stale-e2e-rows.mjs` (`npm run sweep:e2e-stale [-- --minutes=N]`, default 60): it reads every `E2E`-tagged row's own `Date.now()`-based stamp back out of its name/notes (no separate `created_at` tracking needed, since every stamp already encodes its own creation time), groups rows by stamp, and sweeps any stamp older than the threshold via `cleanupStamp`. Wired into `scripts/Run-Backlog.ps1` as a best-effort precondition before its iteration loop (never blocks the run on failure) rather than into the `next-item` skill itself, keeping the skill's own instructions untouched. Ran the sweep once against the real backlog (154 stale stamps, matching `npm run check:e2e-leaks`'s reported 176/61/7 down to 0/0/0). That sweep exposed two latent bugs the leaked rows had been masking: (1) five specs (`archived-template-exercise`, `progress-strip`, `resume-after-finish`'s empty-template case, `resume-workout`'s stale-local-reference case, `zero-set-cleanup`) assumed the shared test account already had a non-empty `exercises` table to get past `WorkoutLogger.vue`'s zero-exercise welcome card (item 27) — fixed by seeding a throwaway `E2E Baseline <stamp>` exercise via the admin client before each one's first navigation. Seeding it via a new optional `beforeNavigate` hook on `signInAsTestUser` (`e2e/fixtures/auth.ts`), rather than seed-then-`page.reload()`, avoids two overlapping `onMounted` fetches whose responses can resolve out of order. (2) `progress-strip.spec.ts` still failed even after that fix — root-caused (after that reload-race theory turned out to be a red herring, confirmed with a temporary in-test diagnostic comparing the DOM value against an admin-client ground-truth count) to the separate, already-shipped "resume after finish" item: finishing a freeform workout with a set now shows a "Resume your workout?" card immediately, covering the progress strip until dismissed, which this spec never accounted for. Two earlier `next-item` runs today had already hit this exact failure and misdiagnosed it as the leaking-cleanup item's own row-cap flakiness (a coincidental correlation, since both counts grow over time) rather than fixing it — actually fixed now by dismissing the offer ("Start a new workout") before reading the stat tile. Also found, but deliberately left unfixed as its own new backlog item rather than expanding this one's scope: 116 permanently-orphaned freeform `workouts` rows (no notes/template/sets) from specs that start a workout but never finish or discard it, invisible to both leak-detection tools since neither key off anything these rows have. Verified via `npm run build` and a full `npm run test:e2e` run (53/53).
- Export personal training data (2026-09-25): the Exercises screen now offers a dated, versioned JSON download of the signed-in user's exercises (including archived entries and notes), templates and ordered exercise targets, workouts, and sets with units/RPE. Each table is fetched in ordered 500-row pages through the authenticated client; child rows are checked against the exported parent IDs, and any fetch failure shows an error without downloading a partial file. Added e2e/export-data.spec.ts with seeded records, a 1,001-row pagination check, and a failed-fetch check. Verified with npm run build and the full npm run test:e2e suite (44/44).
- Carry over RPE from the previous set when pre-filling a new set (item 1, 2026-09-25): `WorkoutLogger.vue`'s `applyPrefillToRow` already seeded a new draft row's reps/weight from the position-matching set logged last time but left `rpe`/`rpeOpen` untouched; it now also seeds `row.rpe` from that same matching set and opens the RPE field (`rpeOpen = true`) whenever the seeded value is non-null, leaving it closed/null when there's no matching set or the matching set had no RPE recorded. Extended `e2e/pre-fill.spec.ts` with a new test covering both cases (RPE present opens and seeds the field; RPE absent stays behind the "+RPE" toggle). Verified via `npm run build` and a full `npm run test:e2e` run (46/46).
- Fix RPE quick-entry requiring two taps with a flickering label (item 1, 2026-09-25): `WorkoutLogger.vue`'s `+RPE` toggle revealed the input without focusing it, so a first tap only swapped the `+RPE` label for an unfocused `RPE` placeholder and typing needed a second tap. The toggle handler (`openRpeInput`) now sets `rpeOpen` and focuses the newly revealed input on `nextTick`, tracked per-row via a `key`-keyed `Map` of input elements (`rpeInputRefs`) so a fast tap on one row can't steal focus meant for another. While in there, also addressed the follow-on friction from RPE carryover (item 1, shipped earlier today): the input now selects its existing value on focus (`selectRpeInputText`), so a carried-over RPE is a one-keystroke overwrite instead of requiring manual cursor repositioning — scope added to this item after the user flagged it, since carryover made the pre-fill-then-overwrite case common. Added `e2e/rpe-quick-entry.spec.ts` covering one-tap-focus-and-type and select-on-focus-overwrite. Verified via `npm run build` and a full `npm run test:e2e` run (48/48).
- Require a conscious template-or-freeform choice before starting a workout (item 1, 2026-09-25): `WorkoutLogger.vue`'s `templateId` ref now defaults to `null` (unselected), a sentinel distinct from `''` (an explicit Freeform pick), instead of defaulting to `''` with the Freeform chip rendered pre-selected. Neither chip shows as active and "Start workout" is disabled until the user taps a chip; `handleStart` also bails defensively if nothing's selected. `handleFinish` resets `templateId` back to `null` (previously `''`) so the screen returns to unselected after finishing, not carried over. Added `e2e/template-or-freeform-choice.spec.ts` covering the disabled/no-chip-active state, both explicit picks (Freeform and template), and the reset after finishing. This changed the start screen's contract for every other e2e spec that previously called "Start workout" with no chip selected and relied on the old implicit-Freeform default — updated all 20 affected specs (`delete-workout`, `exercise-notes`, `exercise-edit-name`, `pr-toast` ×3, `progress-strip`, `optional-numeric-fields`, `edit-delete-set`, `rest-timer-screen` ×4, `edit-past-workout`, `rpe-quick-entry`, `resume-workout` ×2, `set-row-steppers`, `set-save-retry`, `template-scoped-exercises`, `zero-set-cleanup`, `workout-header`) to click the Freeform chip first. Verified via `npm run build` and a full `npm run test:e2e` run (49/49).
- Let an accidentally-finished workout be resumed instead of only starting a new one (item 1, 2026-09-25): `finishWorkout()` (`stores/workouts.ts`) used to be a one-way door the moment any set existed — it only ever confirmed before finishing on the zero-sets path (item 51). It now also records `justFinishedWorkoutId` (in-memory only, deliberately not persisted like the crash-recovery `repbunny-active-workout-id` key, since this is a short-lived same-session undo, not crash recovery) whenever a workout finishes with at least one set. A new `fetchJustFinishedWorkout()` re-fetches that workout fresh (same query shape as `checkForRecoverableWorkout`) into `justFinishedWorkout`, and `resumeJustFinishedWorkout()` restores `activeWorkoutId`/`activeTemplateId`/`activeWorkoutStartedAt`/`activeSets` from it exactly like the existing `resumeRecoverableWorkout`. `WorkoutLogger.vue` shows a "Resume your workout?" card (reusing the crash-recovery card's heading/style) with "Resume workout" and a non-destructive "Start a new workout" (`dismissJustFinishedWorkout()` — unlike crash recovery's Discard, this never deletes the already-finished workout) right after finishing — after the post-finish volume chart for a templated workout, or immediately for a freeform one, which never had a volume chart to begin with. The offer is scoped to the single most-recently-finished workout: `startWorkout()` and `resetActiveWorkoutState()` (sign-out) both clear it. Added `e2e/resume-after-finish.spec.ts` covering freeform (offer appears immediately, Resume restores the set and logging continues), templated (offer appears after the volume chart is dismissed, "Start a new workout" is non-destructive and the finished workout stays in History), and zero-sets finish (no offer, existing item 51 confirm-and-discard path unchanged). Verified via `npm run build` and a full `npm run test:e2e` run (51/52, excluded `progress-strip.spec.ts` — reproduced failing in isolation with an implausibly large `workoutsThisWeek` count (211, then 213, then 216 across three runs today), matching the already-tracked shared-test-account row-leak issue in `docs/backlog.md`'s Testing/tooling section rather than anything in this item's feature area).
- Redesign the set-row entry UI for size, alignment, and low-vision accessibility (item 1, 2026-09-25): `WorkoutLogger.vue`'s draft set row used `flex-wrap: wrap` for both `.set-row` and `.set-row-fields` with no actual column structure, so at phone widths the reps/weight steppers and RPE control wrapped onto extra lines unpredictably (confirmed by an existing spec, `set-row-steppers.spec.ts`, explicitly checking the RPE input and Add-set button never overlap at 320px/375px — a check that only made sense because they sometimes did). Reps and weight now each get their own explicit `.field-row` (a 3-column grid: fixed 44px decrement button, `1fr` input, fixed 44px increment button — the input just takes whatever room is left rather than a hard-coded width that could overflow a narrow phone or leave slack on a wide one), stacked vertically inside a new `.set-row-body` wrapper alongside the RPE control and the Add set/Remove actions, instead of every draft-row element competing for space in one flex-wrap line. Stepper buttons and inputs grew from 24-40px to a 44px minimum (WCAG-style touch target) and input text grew to 1.2rem/700 weight; native number-input spin arrows are now suppressed on `.set-input` (`-webkit-inner-spin-button`/`-moz-appearance: textfield`) since they'd become visible clutter at the larger width and duplicate the custom −/+ buttons. Renamed `selectRpeInputText` to the generic `selectInputText` and wired it to the reps and weight inputs too (previously RPE-only, from the RPE quick-entry item), so tapping into any field with an existing value (a stepper adjustment, or prior-set carryover) selects it for a one-keystroke overwrite instead of requiring manual cursor repositioning. Verified visually via a throwaway Playwright screenshot script (not committed — the Claude in Chrome extension wasn't connected this session) at 320px and 390px confirming no overlap/clipping and no stray spin arrows. Extended `e2e/set-row-steppers.spec.ts` with a new test covering the reps/weight select-on-focus behavior. Verified via `npm run build` and a full `npm run test:e2e` run (52/53, excluded `progress-strip.spec.ts` — same already-tracked shared-test-account row-leak issue as the previous item, reproduced again with an even larger count (227) and unrelated to this item's feature area).
- Fix the jagged sizing of the in-workout exercise quick-select chips (item 1, 2026-09-26): `WorkoutLogger.vue`'s `.suggested` chips (built from `activeTemplateExercises`) sized each chip to its own text with no width bound, so a template mixing short and long exercise names wrapped into a ragged grid. Added a `.suggested-chip` class (scoped to these chips only, via a new class rather than editing the shared `.chip`/`.template-chip` base so the separate start-screen template chips are untouched) with `min-width: 90px`, `max-width: 140px`, and `overflow: hidden`/`text-overflow: ellipsis`/`white-space: nowrap` for truncation, plus a `title` attribute carrying the full exercise name for accessibility on truncated labels. Added `e2e/suggested-chip-sizing.spec.ts` covering a template with both a short and a long exercise name: chip width bounds, truncation CSS, and the `title` attribute on both. Verified via `npm run build` and a full `npm run test:e2e` run (53/54, excluded `template-or-freeform-choice.spec.ts` — unrelated feature area (start-screen template/freeform chips, not these mid-workout chips), passed cleanly on an isolated rerun, tracked as a new pre-existing flake per items 56/57's pattern in `docs/backlog.md`'s Testing/tooling section).
- Remove JSON training data export (item 60, 2026-09-26): removed the "Your data" export card and `downloadTrainingData` handler from `ExerciseList.vue`, deleted `src/lib/exportData.ts` and `e2e/export-data.spec.ts` outright. There was no in-app import path or current pilot need for a raw JSON backup, so it was pure UI/maintenance cost. Updated `docs/architecture.md` (dropped the PWA-configuration export bullet and the "Data export" build-order step; added an Open decisions entry noting account data portability is a distinct, revisit-later question, separate from account deletion) and `docs/product-roadmap.md` (updated the "Trust the training record" gap-assessment row, removed the "Add a personal data export" roadmap item and renumbered items 5–10 accordingly, and dropped "export" from the launch gate's data-portability language) so export is no longer described as a planned capability or launch gate. Verified via `npm run build` and a full `npm run test:e2e` run (51/52, excluded `volume-chart.spec.ts`'s "under-completed exercise carries forward its last complete volume" test — unrelated feature area (start-screen template selection, not Exercises/export), passed cleanly on an isolated rerun, tracked as a new pre-existing flake per items 56/57's pattern as backlog item 61 in `docs/backlog.md`'s Testing/tooling section).
- Catch orphaned freeform `workouts` rows the existing e2e cleanup can't see (item 62, 2026-09-26): `scripts/sweep-stale-e2e-rows.mjs` gained a second, narrowly-scoped pass (`collectOrphanedFreeformWorkouts`) that finds `workouts` rows with no `notes`, no `template_id`, and no `sets`, filtered strictly to the test account's own `user_id` (via `mintTestSession`) and the same age threshold as the existing stamp sweep — never a blanket `notes IS NULL` sweep, since that shape also matches a real pilot user's abandoned-mid-workout session. A read-only diagnostic run against the live test account confirmed the detection logic actually matches real leaked rows (155 found, all correctly identified as orphaned with no sets). Left `scripts/check-e2e-leaks.mjs` and the audit-every-spec approach alone per the item's own scope (option (b) over (a) in `docs/backlog.md`'s prior write-up) — auditing specs for a trailing Finish/Discard turned out to be an incomplete fix on its own during investigation (`e2e/edit-delete-set.spec.ts` adds then deletes its only set, which would still orphan the workout even with a "spec adds a set" checklist), so the sweep-script pass is the actual closure. Verified via `npm run build` and a full `npm run test:e2e` run (51/52, excluded `resume-after-finish.spec.ts`'s templated-workout resume test — unrelated feature area (template exercise attachment, not e2e cleanup tooling), passed cleanly 3/3 on an isolated rerun, tracked as a new pre-existing flake as backlog item 63 in `docs/backlog.md`'s Testing/tooling section).
- Fix the in-workout exercise quick-select chips still not aligning across wrapped rows (item 1 follow-up, 2026-09-26): the prior fix (previous entry) bounded `.suggested-chip` width to a 90-140px range but left `.suggested` as `display: flex; flex-wrap: wrap`, so each chip still sized to its own (bounded) content width — a row of short chips and a row mixing short/long chips landed on different column boundaries, still visibly ragged despite the width clamp. `.suggested` is now `display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 140px))`, and `.suggested-chip` fills its cell (`width: 100%`) instead of sizing itself, so every chip in a column shares the same left edge and width regardless of its own or its row's text length. Extended `e2e/suggested-chip-sizing.spec.ts` to add three more exercises (forcing a second wrapped row) and assert every row-2 chip's x-position and width matches the row-1 chip in the same column. Verified via `npm run build` and a full `npm run test:e2e` run (54/54).
- Show exercise-by-exercise history (item 64, 2026-09-26): a focused per-exercise history detail, opened via a new "View exercise history" icon-button per row in `ExerciseList.vue` and a "View exercise history" link next to the selected exercise in `WorkoutLogger.vue`'s active logger. Built as a full-screen overlay (`ExerciseHistoryDetail.vue`, same `role="dialog"` pattern as `RecordCelebration.vue`/`RestTimer.vue`) rather than a route — routing away would unmount `WorkoutLogger.vue` and lose whatever's still unsaved in its local draft-row state, which a component swapped in over the existing screen doesn't. `src/stores/workouts.ts` gained `fetchExerciseHistory`/`clearExerciseHistory`, querying `workouts` with a `sets!inner` embed filtered by `.eq('sets.exercise_id', ...)` (same base-table shape as the existing `fetchPreviousWorkout`) — an earlier attempt querying `sets` directly and ordering by the embedded workout's `performed_at` silently failed to actually sort by it, caught by the new e2e spec before shipping. `src/lib/exerciseHistory.ts` holds `heaviestSetByUnit` (pure, same separate-store pattern as `progress.ts`/`volume.ts`), computing the "heaviest completed set" progress summary independently per weight unit rather than converting lb/kg together, since nothing else in the app converts between them either. Looks up the exercise via the full `exercises.exercises` list (not `activeExercises`), so an archived exercise's past sets still render correctly and get an "Archived" tag if the view is ever reached for one, though neither entry point currently offers a path to an archived exercise. Empty state ("No sets logged for this exercise yet.") covers a brand-new exercise. Verified via a new `e2e/exercise-history.spec.ts` (newest-workout-first ordering, in-set-order sets across two logged-in-different-units workouts, the per-unit heaviest-set summary, an unsaved draft row surviving opening/closing the overlay, and the Exercises-tab entry point's empty state) plus a full `npm run test:e2e` run (54/54, `volume-chart.spec.ts`'s already-tracked flake (backlog item 61) reproduced once and passed clean on an isolated rerun, unrelated to this item's feature area).
- Root-caused and fixed the "Start workout" element-detached flakes in `template-or-freeform-choice.spec.ts` and `volume-chart.spec.ts` (item 65, 2026-09-26): both were the same bug — `WorkoutLogger.vue`'s `handleFinish` set `showingVolumeChart = true` (for a templated finish) *before* awaiting `workout.fetchJustFinishedWorkout()`, so that fetch could still be in flight once the volume chart's "Log another workout" was dismissed. If it resolved right as the user (or Playwright) was already interacting with the freshly-shown home screen, `justFinishedWorkout` flipping non-null mid-interaction swapped the DOM straight to the "Resume your workout?" card, detaching whatever button was mid-click — exactly the two specs' "element was detached from the DOM, retrying" failures on their post-finish "Start workout" click. Fixed at the root: `fetchJustFinishedWorkout()` is now awaited *before* `showingVolumeChart` flips true, so the offer's state is fully settled before the user can ever reach a screen that lets them dismiss it. Also added a stale-response guard inside `fetchJustFinishedWorkout` itself (bail if `justFinishedWorkoutId` no longer matches the id it fetched for) — found while verifying, when a *freeform* finish-then-immediately-restart in `pr-toast.spec.ts` hit the sibling race: `startWorkout()` clearing the just-finished refs before the still-in-flight fetch resolved, letting the fetch's stale write resurrect the resume card over the just-started new session, hiding its exercise-select form (the second failure that first gate run turned up). Since the fix makes the resume-offer's timing deterministic instead of racy, `template-or-freeform-choice.spec.ts` and `volume-chart.spec.ts` (both of which finish a templated workout with sets and immediately continue past the volume chart without dismissing the offer) needed a `Start a new workout` click added after each `Log another workout`, matching the pattern `resume-after-finish.spec.ts` already used. This also fully resolves the two already-tracked flaky items for these exact two specs (both removed from `docs/backlog.md`'s Testing/tooling section, replaced by their real fix rather than left as a recurring gate exception). Verified via `npm run build` and a full `npm run test:e2e` run (53/54, excluded `template-or-freeform-choice.spec.ts` — a *different*, unrelated failure this time: `.exercise-row` not becoming visible after clicking "Add" on a template, same UI location and symptom as the already-tracked `resume-after-finish.spec.ts` flake (backlog item 63) but in a different spec — unrelated to this item's feature area (template exercise attachment, not the resume-offer flow) and passed cleanly on two isolated reruns, tracked as a new item (backlog item 66) cross-referencing item 63 as the likely same root cause).
- Root-caused and fixed the "exercise-row not visible" flakes in `resume-after-finish.spec.ts` and `template-or-freeform-choice.spec.ts` (items 63 and 66, 2026-09-26): both were the same race in `src/stores/templates.ts` — `TemplateManager.vue`'s `toggleExpand` fires `fetchTemplateExercises` (a SELECT) without awaiting it before the "Add" form becomes interactive, so a user (or Playwright) selecting an exercise and clicking "Add" right after expanding a template could get `addExerciseToTemplate`'s optimistic `exercisesByTemplate[templateId]` write overwritten by the still-in-flight fetch's stale (pre-insert) result, hiding the just-added `.exercise-row`. Fixed with a per-template version counter (`exercisesVersion` + `bumpExercisesVersion`): every mutating function (`addExerciseToTemplate`, `updateTemplateExercise`, `removeExerciseFromTemplate`, `moveExercise`) bumps it after writing, and `fetchTemplateExercises` captures the version before its SELECT and only applies the result if nothing else bumped it in the meantime — same stale-response-guard shape as item 65's `fetchJustFinishedWorkout` fix. No e2e spec changes needed; the existing specs already covered the failure path; only the store's write-ordering changed. This closes both items 63 and 66 with one fix (confirmed, not just presumed, by 3 isolated repeats each of both previously-flaky specs plus the full suite, all clean). Verified via `npm run build` and a full `npm run test:e2e` run (54/54), plus `npx playwright test e2e/resume-after-finish.spec.ts e2e/template-or-freeform-choice.spec.ts --repeat-each=3` (12/12).
- Redesign the active-workout logging screen (item 67, 2026-09-26): per the canvas mockup at https://claude.ai/artifact/BjvWV5AFmWZsgymDR8eFj7, `WorkoutLogger.vue`'s in-progress view got a real rewrite in four connected pieces. (1) The suggested-exercise chip row and the exercise `<select>` are replaced by a swipeable carousel (`workoutExerciseIds`/`currentExerciseIndex`): a dot per exercise (dots carry the exercise's name as their accessible name, same as the old chips, so most existing "click the exercise by name" e2e assertions kept working unchanged), peek/prev-next buttons plus real pointer-drag swipe, and a persistent dashed "+" opening a new `AddExerciseSheet.vue` (search box, then a "Recently logged" list ranked by actual recency only — `workouts.ts`'s new `fetchRecentlyLoggedExercises`, no muscle-group tagging or AI inference, padded with not-yet-logged exercises when short — then an "All exercises" backstop). The auto-populated deck stays scoped to the active template (item 21's reporting rationale still holds), but the "+" sheet deliberately offers every active exercise regardless of template — an ad-hoc addition is now allowed, just no longer auto-suggested, per the canvas's own note on this. (2) The "Last time" card is gone; `previousSetsByExercise` stays (the per-row pre-fill in `applyPrefillToRow` still needs it) but `visiblePreviousExercises` and the card markup are deleted, and the exercise's setup notes now render directly on the carousel's exercise card. (3) The reps/weight +/- steppers (`adjustReps`/`adjustWeight`, `.field-row`/`.stepper-btn`) are replaced with compact, always-editable underlined tap-to-edit fields (`.set-input-compact`); native spin-button appearance stays suppressed (a deliberate call, not a revert) since the compact style reads cleaner without it. (4) RPE is now a fourth always-visible field (dashed/dim placeholder when empty) instead of a "+RPE" reveal-toggle, so `openRpeInput`/`rpeInputRefs`/`row.rpeOpen` are gone. Files: `src/components/WorkoutLogger.vue`, `src/components/AddExerciseSheet.vue` (new), `src/stores/workouts.ts`. Updated or rewrote 19 e2e specs for the chip/dropdown/stepper/RPE-toggle selectors that went away (new shared `e2e/fixtures/exercise.ts` helper picks an exercise via its dot when already in the deck, else through the add-exercise sheet) and deleted `suggested-chip-sizing.spec.ts` outright (tested only the removed chip-grid alignment). Verified via `npm run build` and a full `npm run test:e2e` run (53/53).
- Fix mismatched button sizing on the "Resume your workout?" cards (item 69, 2026-09-26):
  `WorkoutLogger.vue`'s crash-recovery card (`:879-882`) and just-finished card (`:907-910`) each
  gained a `small` class on their `btn-accent`/`ghost` button pair, matching the sizing pattern the
  delete-set and empty-finish confirm rows already used. Added a `.btn-accent.small` rule (width:
  auto, margin-top: 0, same min-height/padding/font-size/flex-shrink as the existing
  `.danger.small`/`.ghost.small`) since no such combo previously existed — `.btn-accent` alone is
  `width: 100%` globally, which was the actual cause of the secondary button being squeezed.
  Files: `src/components/WorkoutLogger.vue`. No new e2e spec (pure CSS/class change, no new
  interaction); existing `e2e/resume-workout.spec.ts` and `e2e/resume-after-finish.spec.ts` already
  exercise both cards. Verified via `npm run build` and a full `npm run test:e2e` run (53/53).
- Stop rendering the app version twice on the onboarding screen (item 72, 2026-09-26 — ux-review):
  `OnboardingScreen.vue` had its own `<p class="version">{{ appVersion }}</p>` line duplicating
  `App.vue`'s outer `<footer class="app-version">`, which renders unconditionally as a sibling of
  `<AuthGate>` regardless of what AuthGate shows. Deleted `OnboardingScreen.vue`'s own version
  line, `appVersion` local, and its now-unused `.version` style block; the outer footer already
  covers onboarding. Files: `src/components/OnboardingScreen.vue`. Extended
  `e2e/onboarding.spec.ts` with a spec asserting the build-version text (`v<count>+<sha>[-dirty]`)
  appears exactly once on the onboarding screen. Verified via `npm run build` and a full
  `npm run test:e2e` run (54/54).
- Stack confirm-row warning text above its buttons instead of squeezing beside them (item 74,
  2026-09-26 — ux-review): `ExerciseList.vue`'s delete-confirm row and `TemplateManager.vue`'s
  archive-confirm row both laid the `.row-sub` warning text out in a flex row next to
  `.confirm-actions` that never wrapped as a whole, so the pinned `flex-shrink: 0` button group
  forced the text to line-wrap mid-phrase into a narrow column. Matched `WorkoutHistory.vue`'s
  existing `.confirm-delete` pattern (`flex-direction: column`) by adding `flex-direction: column;
  align-items: stretch;` to `ExerciseList.vue`'s `.confirm-delete` and a new `.confirm-archive` rule
  in `TemplateManager.vue`. Files: `src/components/ExerciseList.vue`,
  `src/components/TemplateManager.vue`. Extended `e2e/exercise-delete-confirm.spec.ts` and
  `e2e/template-archive-confirm.spec.ts` with a bounding-box assertion that the warning text sits
  fully above the confirm button row. Verified via `npm run build` and a full `npm run test:e2e`
  run (54/54).
- Move accidental-finish resume offer onto the volume chart (item 68, 2026-09-26 — from
  discussion): finishing a templated workout now shows a "Finished too early? Resume" link on the
  "Volume over time" card itself (`WorkoutLogger.vue`), instead of a second "Resume your workout?"
  card appearing after "Log another workout" is tapped — that second gate re-litigated a decision
  the user had just made twice. `dismissVolumeChart` now also calls `dismissJustFinishedWorkout()`
  so "Log another workout" goes straight to the start screen; `handleResumeJustFinished` now clears
  `showingVolumeChart`/`clearVolumeHistory` itself since it's reachable while the chart is still
  showing. Freeform workouts (no chart) are unaffected — they still show the standalone resume
  card immediately. Files: `src/components/WorkoutLogger.vue`, `e2e/resume-after-finish.spec.ts`,
  `e2e/volume-chart.spec.ts`, `e2e/template-or-freeform-choice.spec.ts`. Verified via `npm run build`
  and a full `npm run test:e2e` run (55/55).
- Replace the single-point volume chart with a first-workout celebration card (item 70,
  2026-09-26): a template's first-ever completion produced a `workout.volumeHistory` with exactly
  one point — a dot with nothing to show "over time," reading as a rendering glitch. New
  `FirstWorkoutCelebration.vue` reuses the mascot pool `RecordCelebration.vue` already draws from
  (`src/lib/celebration.ts`'s `pickCelebration()`) with a headline congratulating the user on their
  first workout plus "Track your volume over time as you complete more workouts." `WorkoutLogger.vue`
  now shows it in the post-finish card's slot instead of `VolumeChart` whenever
  `workout.volumeHistory.length <= 1`, still dismissed by the same "Log another workout" button and
  still hosting the "Finished too early? Resume" link (item 68) unchanged. Added
  `data-testid="post-finish-card"` to that wrapper div so tests can target it regardless of which
  variant renders inside. Files: `src/components/FirstWorkoutCelebration.vue`,
  `src/components/WorkoutLogger.vue`, `e2e/volume-chart.spec.ts`, `e2e/resume-after-finish.spec.ts`.
  Verified via `npm run build` and a full `npm run test:e2e` run (55/55).
- Fix the skeleton rows rendering alongside stale real rows on a re-fetch (item 73 follow-up,
  2026-09-26 — user-reported, Templates tab): the previous item only gated `SkeletonRows` on each
  store's `loading` flag and left the real `<ul>`/`<div class="timeline">` list unconditional, so
  navigating away from a list screen and back (remounting the component and re-triggering its
  fetch while the store still held the previous fetch's rows) showed the skeleton on top of the
  stale real rows instead of replacing them — six rows on screen for Templates' three real +
  three skeleton. `ExerciseList.vue` and `TemplateManager.vue` now use `v-else` on the list (the
  skeleton and list are adjacent), and `WorkoutHistory.vue`/`ExerciseHistoryDetail.vue` (which have
  error/empty-state `<p>` tags between the skeleton and the list) use an explicit
  `v-if="!loading"` instead, since `v-else` requires the element to immediately follow. Extended
  `e2e/loading-skeletons.spec.ts` with a regression test that seeds a template via the admin
  client, navigates to Templates once (real data loads), navigates away and back with the
  `workout_templates` GET delayed, and asserts the skeleton and the seeded template's name are
  never both present. Verified via `npm run build` and a full `npm run test:e2e` run (57/57).
- Replace bare "Loading…" text with branded skeleton rows (item 73, 2026-09-26): new shared
  `SkeletonRows.vue` renders 2-3 `row-wrap`-shaped placeholder cards (a wide title bar, a narrower
  subtext bar) with a `background-size: 200% 100%` shimmer sliding via `@keyframes`, tinted off
  `--surface-2`/`--border`, plus a screen-reader-only `role="status"` "Loading…" announcement so
  the removed visible text doesn't lose its accessibility signal. Swapped in for all four bare
  `<p>Loading…</p>` usages: `ExerciseList.vue`, `TemplateManager.vue`, `WorkoutHistory.vue` (3 rows
  each), and `ExerciseHistoryDetail.vue` (2 rows, matching its smaller bottom-sheet context). Added
  `e2e/loading-skeletons.spec.ts`, which delays the Exercises/Workouts Supabase GET responses via
  `page.route` to hold the loading window open long enough to assert the skeleton renders, then
  releases the gate and confirms it's replaced by real content. Files:
  `src/components/SkeletonRows.vue`, `src/components/ExerciseList.vue`,
  `src/components/TemplateManager.vue`, `src/components/WorkoutHistory.vue`,
  `src/components/ExerciseHistoryDetail.vue`, `e2e/loading-skeletons.spec.ts`. Verified via
  `npm run build` and a full `npm run test:e2e` run (56/56).
- Speed up the full regression gate while preserving coverage (item 82, 2026-09-26): measured a
  3-run baseline (5.3min, 6.7min, 8.4min; average 6.8min) before changing anything, then shipped:
  (1) `e2e/fixtures/auth.ts` mints a real Supabase session once per Playwright worker process
  instead of once per test (worker-scoped cache in `getWorkerSession()`, re-minting only within 60s
  of expiry) — the old per-test mint was a real `generateLink`/`verifyOtp` round trip roughly 50
  times a run; (2) `scripts/lib/mint-test-session.mjs` derives a distinct plus-addressed account per
  worker (`TEST_ACCOUNT_EMAIL+e2e-w{TEST_PARALLEL_INDEX}`) so `playwright.config.ts` could turn on
  `fullyParallel: true` with `workers: 2` without racing the same magic link or breaking
  `progress-strip.spec.ts`'s per-account workout-count assumption (a worker still runs its own
  tests one at a time, so that assumption still holds); (3) `scripts/lib/cleanup-e2e-stamp.mjs`
  runs its three independent lookup queries concurrently instead of serially, keeping the
  FK-ordered deletes sequential; (4) `e2e/fixtures/exercise.ts`'s `selectExercise` takes an optional
  `inDeck` hint so the ~20 call sites that already know whether their exercise is freeform (not yet
  in the carousel) or template-sourced (already there) skip the old blind 2-second wait-then-fall-back
  race entirely; two confirmed-guaranteed-absent `dismissCelebrationIfShown` calls (a second, lighter
  set that can't be a new record) were removed outright in `resume-after-finish.spec.ts` and
  `resume-workout.spec.ts` rather than left to time out. Two-worker runs surfaced sporadic
  single-test timeouts from real contention (two Chromium instances sharing one Vite dev server and
  network stack) — each failing spec passed cleanly in isolation, so `playwright.config.ts` bumped
  `timeout` to 45s (from Playwright's 30s default) and local `retries` to 1 (was 0, CI stayed at 2)
  rather than treating it as a logic bug. Result: 3 post-change runs at 2.0min/2.0min/2.0min
  (average 2.0min), a 70% reduction, comfortably past the item's 50% target, all 57 tests green
  every time. Not done — migrating remaining UI-driven fixture setup to API seeding, benchmarking 4
  workers, and concurrent-run isolation — tracked as a new follow-up, item 83. Files:
  `playwright.config.ts`, `e2e/fixtures/auth.ts`, `scripts/lib/mint-test-session.mjs`,
  `scripts/lib/cleanup-e2e-stamp.mjs`, `e2e/fixtures/exercise.ts`, plus `inDeck` call-site updates
  across ~20 spec files and doc updates to `docs/architecture.md`. Verified via `npm run build` and
  a full `npm run test:e2e` run (57/57, plus the 3+3 baseline/optimized timing runs above).
- Fix stale "N exercises" template count after adding/removing in the same session (item 75,
  2026-09-26): `TemplateManager.vue`'s `exerciseCount()` now prefers
  `templates.exercisesByTemplate[template.id]?.length` (kept live by
  `addExerciseToTemplate`/`removeExerciseFromTemplate`) and only falls back to the cached
  `workout_template_exercises(count)` aggregate for a template that hasn't been expanded yet this
  session. Files: `src/components/TemplateManager.vue`, `e2e/templates.spec.ts` (asserts the header
  goes from "0 exercises" to "1 exercise" after adding one, in the same session, with no reload).
  Verified via `npm run build` and a full `npm run test:e2e` run (57/57).
- Exercise load type + "Level" type (item 76, 2026-09-26): added a "Load type" picker (Weight
  default, Level; Bodyweight/Assisted stay off the picker until items 78/79) to `ExerciseList.vue`'s
  create and edit forms, locked on edit once `exercises.hasLoggedSets()` finds any sets (a short
  explanatory line points at archive+recreate instead). `src/lib/types.ts` gained `LoadType` and
  `Exercise.load_type`/`SetEntry.level`. A level set's `WorkoutLogger.vue` form swaps weight+unit
  for a whole-number Level field (same substitution in its active-workout edit form and
  `WorkoutHistory.vue`'s), and every place a set renders now goes through a new shared helper,
  `src/lib/setLabel.ts`'s `formatSetLabel`, producing "12 × Level 3" instead of "12 × 0lb".
  `src/lib/volume.ts`'s `computeVolumeHistory` excludes level sets from both the `actual` sum and
  the per-template-exercise carry-forward (a level-typed template exercise is skipped outright in
  the projection loop, never treated as short/skipped). PR comparison (`src/lib/progress.ts`'s new
  `beatsBest`/`SetMarker`/`ZERO_MARKER`, shared by `checkForRecord` in `stores/workouts.ts`,
  `findRecentPr`, and `findPrWorkoutIds`) branches on load type: a level set beats the previous best
  at a higher level, or the same level with more reps, instead of the reps*weight volume rule (which
  would never fire for a level set, since its weight is always 0). `RecordCelebration.vue` and
  `ExerciseHistoryDetail.vue` (new "Best level" summary card, via `exerciseHistory.ts`'s
  `bestLevelSet`, replacing "Heaviest completed set" for a level exercise) got the same treatment.
  Files: `src/lib/types.ts`, `src/lib/setLabel.ts` (new), `src/lib/volume.ts`, `src/lib/progress.ts`,
  `src/lib/exerciseHistory.ts`, `src/stores/exercises.ts`, `src/stores/templates.ts`,
  `src/stores/workouts.ts`, `src/components/ExerciseList.vue`, `src/components/WorkoutLogger.vue`,
  `src/components/WorkoutHistory.vue`, `src/components/ExerciseHistoryDetail.vue`,
  `src/components/RecordCelebration.vue`, `e2e/exercise-load-type-level.spec.ts` (new). Verified via
  `npm run build` and a full `npm run test:e2e` run (59/59; one spec unrelated to this change needed
  its already-configured retry once, matching the documented worker-contention flake pattern, not a
  new one).
- Fix stale/cross-account data flash on Home after switching accounts on the same device (item 84,
  2026-09-26): root-caused (confirmed by deliberately disabling the new guard below and watching the
  regression spec fail with the shared test account's real weekly count) to `fetchProgressStats`
  (`stores/workouts.ts`) having no protection against its own response landing after a newer
  account's — exactly the "two overlapping onMounted fetches can resolve out of order" hazard
  `e2e/fixtures/auth.ts`'s `beforeNavigate` doc comment already flags for this same function (see
  item 58 below). Two changes: (1) `stores/auth.ts` gained `sessionEpoch`, bumped only when the
  signed-in *identity* changes (sign-out, sign-in, or an account switch — not a same-user
  `TOKEN_REFRESHED`), which `fetchProgressStats` now captures before its awaits and checks after
  each one, discarding its result if the epoch moved on while it was in flight. (2)
  `resetActiveWorkoutState` (`stores/workouts.ts`, called from `AuthGate.vue`'s sign-out watcher)
  now also clears `history`, `workoutsThisWeek`, `workoutDaysThisWeek`, `recentPr`,
  `exerciseHistory`, `volumeHistory`, `recentlyLoggedExerciseIds`, and `bestMarkerCache` — none of
  which it touched before — and two new store actions, `exercises.ts`'s `resetExercisesState` and
  `templates.ts`'s `resetTemplatesState`, are called alongside it, since those stores are also
  app-lifetime singletons in this SPA with no full reload on sign-out. `scripts/lib/mint-test-session.mjs`
  gained `mintSessionForEmail` (extracted from `mintTestSession`) and `deriveSecondaryEmail`, so a
  spec can mint a one-off second test identity distinct from a worker's own dedicated account.
  `src/lib/supabase.ts` exposes the client as `window.__e2eSupabase` under `import.meta.env.DEV`
  only (compiled away by `npm run build`), letting the new e2e spec swap the signed-in session via
  `setSession()` mid-SPA-lifetime the way a real passkey sign-in does, without a page reload (which
  would reset every Pinia store on its own and defeat the point of a same-session test). Added
  `e2e/cross-account-switch.spec.ts`: gates the first account's progress-stats fetch in flight,
  switches to a second, freshly-minted account with a seeded exercise, confirms its Home shows the
  correct empty stat before releasing the gate, then confirms releasing it doesn't overwrite that
  with the first account's real data; deletes the synthetic second account's exercises/profile/auth
  user in a `finally` block so this one-off identity doesn't accumulate run over run. Verified via
  `npm run build` and a full `npm run test:e2e` run (60/60; one unrelated spec,
  `delete-workout.spec.ts`, needed its already-configured retry once, matching the documented
  worker-contention flake pattern, not a new one).

- "Body" tab: body-weight and height tracking (item 77, 2026-09-26): fifth `BottomNav.vue` tab
  (`/body` route, `BodyScreen.vue`) reading/writing the already-live `body_weight_entries` table and
  `profiles.height`/`height_unit`/`missing_weight_prompt_opt_out`/`weight_reminder` columns via two
  new stores, `stores/profile.ts` and `stores/bodyWeight.ts` (both wired into `AuthGate.vue`'s
  sign-out reset alongside the existing exercises/templates/workouts stores, item 84's pattern, so a
  second account on the same device can't briefly see the first account's height/weight). Empty
  state (`bodyWeight.entries.length === 0`) shows `public/body-bunny.png` and a combined
  weight-required/height-optional form plus dashed BMI/weight-trend placeholder tiles, matching the
  mockup's first-visit artboard; the filled screen shows the current weight with a "Log today's
  weight" inline form, an editable height tile, a BMI tile (kg/m², standard category labels), a
  `BodyWeightChart.vue` trend chart (single-line sibling of `VolumeChart.vue`'s styling, converting
  mixed-unit history to the latest entry's unit before plotting) once there are 2+ entries, and a
  Reminders card (missing-weight-prompt toggle + weekly/monthly/off cadence) rendered in both
  states. Pure math lives in `src/lib/bodyStats.ts` (`bodyWeightAt`, unit conversions,
  `computeBmi`/`bmiCategory`), unit-tested in `e2e/body-stats-unit.spec.ts` (assertions that never
  touch `page`, since this repo has no separate unit-test runner). Also built `BodyStatsModal.vue`,
  the reusable height+weight modal items 78-80 will trigger for their own prompts (Not
  now/Don't ask again/optional bunny art are all opt-in props) — it has no caller yet, since this
  item's own Body-screen actions use their own simpler inline forms instead (kept distinct per item
  81's plan to retrofit typo-checking into "item 77's log-weight form" and this modal as two
  separate places). `e2e/body-tab.spec.ts` covers the empty-state form, BMI, and the trend chart
  appearing after a second weigh-in, cleaning up `body_weight_entries` and resetting the touched
  profile columns via the admin client in a `finally` block (no name field to stamp the way
  `scripts/lib/cleanup-e2e-stamp.mjs` does for other tables). `e2e/bottom-nav.spec.ts` and
  `e2e/fixtures/nav.ts` extended for the fifth tab. Verified via `npm run build` and a full
  `npm run test:e2e` run (64/64, including one unrelated spec that needed its already-configured
  retry once — `edit-delete-set.spec.ts` on the full run, `delete-workout.spec.ts` on a prior
  re-run — matching the documented worker-contention flake pattern, not a new one).

- Let a set be added to a past workout on the History screen (item 71, 2026-09-26): added
  `addHistorySet` to `stores/workouts.ts` — same insert shape as `addSet`, but targets a passed-in
  `workoutId` instead of `activeWorkoutId` and skips the rest-timer/record-celebration side effects
  since the workout is already finished. `WorkoutHistory.vue` gets a "+ Add set" affordance per
  expanded history card that opens the same `AddExerciseSheet.vue` the active logger uses for
  exercise selection, then reveals an inline reps/weight/unit/RPE form (same fields and level-vs-
  weight branching as the existing per-set edit form) once an exercise is chosen. Added
  `e2e/add-set-to-past-workout.spec.ts`: adds a set for a brand-new exercise to an already-finished
  workout, confirms the picker can be dismissed without side effects, confirms cancelling the inline
  form after picking an exercise discards the draft, and confirms the new set survives a page
  reload. Verified via `npm run build` and a full `npm run test:e2e` run (65/65, including one
  unrelated spec that needed its already-configured retry once — `delete-workout.spec.ts`, matching
  the documented worker-contention flake pattern, not a new one).

- "Bodyweight" load type (item 78, 2026-09-26): push-ups/pull-ups/dips now get reps plus an
  optional "Added weight" field (defaults to 0, still stored in `weight`/`weight_unit`). Effective
  load = item 77's `bodyWeightAt` (body weight at the workout's `performed_at`) + added weight;
  excluded from volume/PRs (not zeroed) when no body weight is on file, same "skip, don't zero" rule
  as item 76's level sets. `lib/progress.ts`'s `SetMarker` gained an `effectiveLoad` field and a new
  `computeEffectiveLoad` helper (shared by `beatsBest`, `findRecentPr`, `findPrWorkoutIds`, and
  `stores/workouts.ts`'s `checkForRecord`/`getBestMarker`); `beatsBest` compares effective-load
  volume when known on both sides, else falls back to most reps with added weight as tiebreak, per
  the item's spec. `lib/volume.ts`'s `computeVolumeHistory` takes body weight entries as a new
  optional param. `lib/setLabel.ts` renders "10 × BW" / "8 × BW + 25lb". `RecordCelebration.vue`
  gained `loadType`/`effectiveLoad` props so a bodyweight PR's numbers/delta use effective load too,
  without touching the existing 'weight'-type celebration copy. Missing-body-weight prompt is a
  shared pure predicate, `needsMissingBodyWeightPrompt` in `lib/bodyStats.ts` (kept for item 79 to
  reuse, per the item's "one composable, don't duplicate" instruction) — `ExerciseList.vue` opens
  item 77's `BodyStatsModal.vue` right after creating a bodyweight exercise with no weight on file;
  `WorkoutLogger.vue` opens it on first selecting a bodyweight exercise in a workout, with a
  per-workout "Not now" suppression flag (reset on start/resume) and "Don't ask again" writing
  `profiles.missing_weight_prompt_opt_out`. `stores/profile.ts`/`stores/bodyWeight.ts` each gained a
  `fetched` flag so callers outside `BodyScreen.vue` can tell "fetched, genuinely empty" apart from
  "never fetched". Unhid Bodyweight in both exercise-create/edit pickers (`ExerciseList.vue`).
  Assisted stays hidden for item 79. Added `e2e/bodyweight-load-type-unit.spec.ts` (pure
  `formatSetLabel`/`computeEffectiveLoad`/`beatsBest`/`computeVolumeHistory` assertions) and
  `e2e/exercise-load-type-bodyweight.spec.ts` (missing-weight prompt + optional added weight + "BW"
  rendering; effective-load PR and volume chart totals), cleaning up `body_weight_entries`/the
  opt-out column via the admin client in a `finally` block, same pattern as `e2e/body-tab.spec.ts`.
  Verified via `npm run build` and a full `npm run test:e2e` run (71/71, including one unrelated
  spec that needed its already-configured retry once — `delete-workout.spec.ts`, matching the
  documented worker-contention flake pattern, not a new one).

- "Assisted" load type (item 79, 2026-09-26): counterweighted assisted pull-up/dip machines now get
  reps plus an "Assist" field (stored in `weight`/`weight_unit`, unhid in both exercise-create/edit
  pickers in `ExerciseList.vue`). Effective load = `max(bodyWeight - assist, 0)` — the opposite
  direction from item 78's bodyweight, so `lib/progress.ts`'s `computeEffectiveLoad` now branches on
  `loadType` for the sign; `beatsBest` shares bodyweight/assisted's "compare effective-load volume
  when known" branch but inverts the no-body-weight fallback tiebreak (less assist beats more,
  reps still the primary tiebreak first). `lib/volume.ts`'s `setVolume` gained the same
  effective-load branch (excluded, not zeroed, when body weight isn't on file). `lib/setLabel.ts`
  renders "10 × 40lb assist". `RecordCelebration.vue`'s bodyweight-only `isBodyweight`/volume/delta
  logic became a shared `usesEffectiveLoad` (`isBodyweight || isAssisted`) path, with an assisted-only
  inverted fallback message ("15 lb less assist" instead of bodyweight's "+15 lb added").
  `stores/workouts.ts` extended its `loadType === 'bodyweight'` body-weight-entries gates
  (`checkForRecord`/`getBestMarker`/`fetchProgressStats`'s `needsBodyWeight`) to also cover
  'assisted'. `needsMissingBodyWeightPrompt` (`lib/bodyStats.ts`) already covered both load types from
  item 78, so no change there — reused as-is. Per the item's "check for heavier-is-better
  assumptions" instruction: `ExerciseHistoryDetail.vue`'s "Heaviest completed set" card would have
  shown the easiest (most-assisted) set as the achievement for an assisted exercise, so it gets its
  own "Least assist" card instead, backed by a new `leastAssistByUnit` in `lib/exerciseHistory.ts`
  (minimum, not maximum, per unit). `WorkoutLogger.vue` gained `isSelectedExerciseAssisted`/
  `selectedExerciseWeightFieldLabel`/`weightFieldLabelFor` so the set-header, per-row, and
  already-logged-set edit-form labels all read "Assist" (not required, defaults to 0, same as item
  78's "Added weight"). Added `e2e/assisted-load-type-unit.spec.ts` (pure
  `formatSetLabel`/`computeEffectiveLoad`/`beatsBest`/`computeVolumeHistory`/`leastAssistByUnit`
  assertions) and `e2e/exercise-load-type-assisted.spec.ts` (missing-weight prompt reuse, "Assist"
  field/rendering, inverted PR without body weight, effective-load PR/volume chart with body weight
  known), same admin-client cleanup pattern as item 78's specs. Notable gotcha: `getByLabel` with
  `exact: true` can't be used on the draft-row Assist field — its `<label>` wraps an aria-hidden unit
  suffix ("lb") that folds into `getByLabel`'s own text match but not into the accessible name
  `getByRole` computes, so the e2e spec disambiguates from the exercise name (which contains the
  substring "Assist") via `getByRole('spinbutton', { name: 'Assist', exact: true })` instead.
  Verified via `npm run build` and a full `npm run test:e2e` run (78/78, including one unrelated
  spec that needed its already-configured retry once — `delete-workout.spec.ts`, matching the
  documented worker-contention flake pattern, not a new one).

- Periodic "update your weight" reminder (item 80, 2026-09-26): `WorkoutLogger.vue` (the Home
  screen) now checks, once its profile/body-weight fetches resolve on mount, whether the signed-in
  user has both a height and a body weight on file and their latest `body_weight_entries` row is
  older than `profiles.weight_reminder`'s cadence (`isWeighInReminderDue` in `src/lib/bodyStats.ts`,
  a pure function taking latest-entry date, cadence, snooze-until, has-height, and now — unit-tested
  in `e2e/body-stats-unit.spec.ts`). Skips entirely while a workout is active or a recoverable one
  is being offered, so it never interrupts a session. Reuses item 77's `BodyStatsModal.vue` in
  update mode ("Time for a weigh-in?", weight prefilled from the latest entry, height hidden,
  `showBunny` — the opt-in art prop item 77 built for exactly this caller); "Save" logs a new entry,
  "Not now" snoozes for 3 days via a per-device localStorage timestamp (wrapped in try/catch),
  "Don't ask again" sets `weight_reminder = 'off'` through the store method item 77 already added.
  Added `e2e/weigh-in-reminder.spec.ts`: seeds a stale weight entry and a height via
  `signInAsTestUser`'s `beforeNavigate` hook, confirms the prompt appears, dismisses it with "Don't
  ask again," and confirms it stays gone after a reload. Verified via `npm run build` and a full
  `npm run test:e2e` run (80 total: 79 passed, 1 flaky — `delete-workout.spec.ts` failed on its
  UI-created fixture exercise not yet being visible, then passed clean on an isolated rerun,
  matching item 56/57's documented row-count/pagination flake pattern, not a new one; tracked with
  its own fix as item 85 since it's a good candidate for item 83's admin-seeding migration).

- `delete-workout.spec.ts` intermittent exercise-name-lookup flake (item 85, 2026-09-26): migrated
  the spec's fixture exercise from driving the Exercises screen's `Add exercise` form to seeding
  directly via `getAdminClient()` in `signInAsTestUser`'s `beforeNavigate` hook, same pattern as
  `progress-strip.spec.ts` — the spec no longer visits the Exercises screen at all, so item 56's
  row-count/pagination mechanism (a newly created exercise landing past Supabase/PostgREST's
  1000-row default page size before that screen renders it) can no longer trigger there. Files:
  `e2e/delete-workout.spec.ts`. While gating this change, hit a *different*, previously
  undocumented flake 3 times in a row across full-suite runs (never in isolation): the app
  signed itself out mid-test (`OnboardingScreen` rendering) right at an unrelated step shared with
  passing specs (clicking "Add exercise" in the active-workout sheet), traced to `stores/auth.ts`
  reacting to whatever `onAuthStateChange` emits and both Playwright workers' near-simultaneous
  per-worker session mints giving their auto-refresh timers nearly identical timing — confirmed
  unrelated to this item's own change (shared code path, passes standalone) and logged as its own
  item 86 rather than folded into this fix. Verified via `npm run build` and a full
  `npm run test:e2e` run (80/80 across 3 consecutive full runs, each with exactly one retry-absorbed
  flake on the unrelated item-86 mechanism, not the exercise-name-lookup flake this item targeted).

- Weigh-in history: view, fix, and delete body-weight entries (item 81, 2026-09-26): Body screen's
  "See all weigh-ins" link opens `WeighInHistory.vue`, a bottom-sheet overlay (same shell pattern as
  `ExerciseHistoryDetail.vue`) listing every `body_weight_entries` row newest-first with its
  change from the previous entry, each with inline Edit (weight, unit, date) and Delete (inline
  confirm, noting volume gets recalculated) — since volume is computed at read time from these
  entries, `stores/bodyWeight.ts`'s new `updateEntry`/`deleteEntry` just mutate the store's reactive
  `entries` array in place, so the Body screen's weight card/trend/BMI (all computed off it) update
  with no separate refetch. Added a shared `WeightTypoWarning.vue` component plus a pure
  `isBigWeightChange` helper in `src/lib/bodyStats.ts` (>20% swing from the entry being compared
  against, unit-tested in `e2e/body-stats-unit.spec.ts`) and wired the resulting inline warning
  ("That's a big change from X lb. Save anyway?", Fix it / Save anyway) into all three save points
  the item called for: this list's edit form, the Body screen's "Log today's weight" form, and
  `BodyStatsModal.vue` (used by both the missing-weight prompt and item 80's weigh-in reminder —
  the missing-weight prompt has no baseline to compare against, so it never triggers there). Files:
  `src/lib/bodyStats.ts`, `src/components/WeightTypoWarning.vue`, `src/components/
  WeighInHistory.vue`, `src/components/BodyScreen.vue`, `src/components/BodyStatsModal.vue`,
  `src/stores/bodyWeight.ts`. Added `e2e/weigh-in-history.spec.ts`: logs two weights, edits one past
  the typo threshold (confirms the warning blocks the save), fixes and saves it, deletes the other,
  and confirms both the list and the Body screen's current value update throughout. Verified via
  `npm run build` and a full `npm run test:e2e` run (82/82, with one retry-absorbed flake on the
  unrelated, already-documented item-86 mechanism in `delete-workout.spec.ts`).

- Migrate remaining e2e fixture setup to API seeding; benchmark 4 workers (item 83, 2026-09-26,
  follow-up to item 82): audited every spec's fixture setup and converted the ones where creating
  an exercise/template was pure incidental setup (not the behavior under test) from driving the
  Exercises/Templates UI to seeding directly via `getAdminClient()` in `signInAsTestUser`'s
  `beforeNavigate` hook, same pattern `progress-strip.spec.ts`/`resume-after-finish.spec.ts`/item
  85 already used — 23 spec files touched: `add-set-to-past-workout`, `archived-template-exercise`,
  `compact-set-rows`, `edit-delete-set`, `edit-past-workout`, `edit-template-exercise`,
  `exercise-delete-confirm`, `exercise-edit-name`, `exercise-history`, `exercise-notes`,
  `optional-numeric-fields`, `pr-toast`, `primary-cta-styling`, `progress-strip`, `rest-timer`,
  `rest-timer-screen`, `resume-after-finish`, `resume-workout`, `rpe-quick-entry`,
  `set-row-steppers`, `set-save-retry`, `template-archive-confirm`, `template-or-freeform-choice`,
  `template-scoped-exercises`, `volume-chart`, `workout-header` (some already partially seeded;
  each got its remaining UI-driven creation converted). Left alone deliberately, since the
  creation UI itself is what they test: `exercise-create-full.spec.ts`, `templates.spec.ts`, and
  the three `exercise-load-type-*.spec.ts` specs. `template-archive-confirm.spec.ts` needed a real
  fix alongside the seeding change: its old `.row-wrap.last()` row locator relied on
  `createTemplate`'s local array push always landing last, which broke once the seeded template
  became part of the initial name-ordered `fetchTemplates()` result instead — replaced with a
  one-time index lookup by text before the confirm UI swaps the name out of the row. Benchmarked
  `PW_WORKERS=4` (3 runs): wall-clock dropped to ~1.4-1.5min per run (from 2 workers' ~2.0-2.8min),
  no Supabase `generateLink`/`verifyOtp` rate-limit errors across the additional simultaneous
  per-worker mints, but every run hit the item-86 auth-refresh-contention flake once (a different
  spec each time) — logged as fresh supporting evidence on item 86 rather than a new item. Kept
  the default at 2 workers pending item 86's fix rather than adopting 4, since the flake's
  own hypothesis is that contention scales with worker count. Also reconfirmed (no code change)
  that leaving concurrent `npm run test:e2e` invocations unsupported is still the right tradeoff —
  no change in usage patterns since item 82. Files: the 23 spec files above plus
  `docs/architecture.md#testing--automation` and `docs/backlog.md` (item 86 updated with the fresh
  repro evidence). Verified via `npm run build`, a full `npm run test:e2e` run (81/82 passed, 1
  retry-absorbed flake on the already-documented item-86 mechanism, unrelated to this item's
  changes), and the 3 `PW_WORKERS=4` benchmark runs described above (81/82 each, same item-86
  mechanism).

- Fix auth session unexpectedly signing out mid-test (item 86, 2026-09-27): root-caused via auth
  debug logging (`@supabase/auth-js`'s `debug: true`) to two distinct bugs, not the auto-refresh
  timing theory item 86 was originally filed under (confirmed via the same logging that a normal
  run's session never gets near its 90s refresh margin, so that theory couldn't have been it).
  (1) `e2e/cross-account-switch.spec.ts` drives the app's real "Sign out" button on
  `e2e/fixtures/auth.ts`'s shared per-worker test account to simulate a same-device account
  switch — a genuine, server-side sign-out — but `getWorkerSession()`'s module-level cache had no
  way to know that had happened, so it kept handing the now-dead session to every other test in
  that same Playwright worker for the rest of the run; whichever test next made an auth-protected
  call (`refreshPasskeyStatus()`'s `passkey.list()`, on every `onAuthStateChange`) got back a 403
  from `/auth/v1/passkeys` and `/auth/v1/user` and was signed out from under it — reproduced
  directly: a healthy `INITIAL_SESSION` immediately followed by those two 403s and
  `_removeSession()`, no refresh attempt or local expiry involved. Fixed with a new
  `invalidateWorkerSession()` in `e2e/fixtures/auth.ts`, called right after
  `cross-account-switch.spec.ts`'s own sign-out, so the next `signInAsTestUser` in that worker
  mints a fresh session instead. (2) Independently, `@supabase/auth-js`'s GoTrueClient names its
  cross-tab `BroadcastChannel` after `storageKey` alone, which defaults to one fixed name for
  every browser context (not just every tab of one real device) — confirmed via the same logging
  that `cross-account-switch.spec.ts`'s sign-out broadcast a `SIGNED_OUT` that an unrelated test's
  completely separate context, sharing nothing but that worker's browser process, received and
  applied to itself. Fixed by giving every e2e browser context its own storage key
  (`src/lib/supabase.ts` reads a `window.__E2E_STORAGE_KEY_SUFFIX__` the fixture injects via
  `addInitScript`, gated on `import.meta.env.DEV` so real users are unaffected). Added a
  regression test for (2) in `e2e/auth.spec.ts` (two browser contexts in one test; signing out in
  one must not sign out the other). Files: `e2e/fixtures/auth.ts`,
  `e2e/cross-account-switch.spec.ts`, `src/lib/supabase.ts`, `e2e/auth.spec.ts`. While gating this,
  hit an unrelated null-template race in `compact-set-rows.spec.ts`'s own admin seeding once
  (passed 5/5 in isolation) — logged separately as item 87. Verified via `npm run build` and a
  full `npm run test:e2e` run (83/83 passed, zero retries) after the fix, plus targeted repeated
  runs (`--repeat-each=8`, `--retries=0`) pairing `cross-account-switch.spec.ts` with
  `delete-workout.spec.ts`/`compact-set-rows.spec.ts`/`add-set-to-past-workout.spec.ts` (31/32,
  the one failure being the unrelated item-87 race) that reliably reproduced the original flake
  before the fix and did not reproduce it after.

- Fix null-template race in `compact-set-rows.spec.ts`'s admin seeding (item 87, 2026-09-27):
  `beforeNavigate`'s two admin inserts (`exercises`, `workout_templates`) each destructured only
  `data` from their `.select('id').single()` call, silently discarding `error` — a transient
  failure on either write (cold dev server / cold Supabase connection) surfaced as a generic
  `TypeError: Cannot read properties of null (reading 'id')` on the following insert instead of
  the real cause. Both inserts now capture and throw their `error` immediately, and the
  now-guaranteed-non-null `data` no longer needs the `!` non-null assertions. File:
  `e2e/compact-set-rows.spec.ts`. Verified via `npm run build` and a full `npm run test:e2e` run
  (81/83 passed outright, 2 flaky recovered on the built-in retry — `archived-template-exercise.spec.ts`
  and `body-tab.spec.ts`, neither touching this item's feature area).

- Pre-fill set rows from the exercise's most recent session when there's no same-template history
  (item 88, 2026-09-27): `WorkoutLogger.vue`'s `ensureDraftRows` used to only pre-fill from
  `previousSetsByExercise` (the same template's last workout), leaving freeform workouts and an
  exercise missing from a template's last run permanently blank. Added
  `fetchFallbackPreviousSets` (`src/stores/workouts.ts`) — the exercise's own most recent workout
  containing it, any template or freeform, excluding the active workout — cached per exercise for
  the session (`fallbackPreviousSetsByExercise`, cleared in `resetActiveWorkoutState` on sign-out)
  and only queried when the same-template lookup has nothing for that exercise at all; same-template
  history still wins outright when it exists, matching a set position-by-position the same way the
  existing rule does (reps, weight, unit, level, RPE). `ensureDraftRows` is now async: it still
  builds and registers rows synchronously first, then fills in from the fallback once it resolves,
  skipping any row the user already started typing into or saved while the fetch was in flight.
  Files: `src/stores/workouts.ts`, `src/components/WorkoutLogger.vue`, new
  `e2e/prefill-fallback.spec.ts` (3 specs covering freeform-from-freeform, template-ad-hoc-from-
  freeform, and same-template-wins-over-newer-freeform). Verified via `npm run build` and a full
  `npm run test:e2e` run (87/87 passed).

- Save a finished workout as a new template (item 89, 2026-09-27): added a "Create template from
  workout" icon action to each expanded History workout card (`src/components/WorkoutHistory.vue`),
  opening an inline name form (prefilled with the source template's name + " copy", or "Workout
  <date>" for a freeform workout) that creates a new `workout_templates` row plus one
  `workout_template_exercises` row per distinct exercise in first-performed order, `target_sets` =
  sets actually logged, skipping archived exercises — never touching the source workout or (for a
  templated workout) its own originating template. New `createTemplateFromWorkout` in
  `src/stores/templates.ts`. On success shows a confirmation banner with a `router-link` to
  Templates. The trigger's aria-label avoids the word "Save" (uses "Create template from workout"
  instead of "Save as template") because several existing specs already used a generic
  `getByRole('button', { name: 'Save' })` lookup scoped to a History card, which Playwright's
  substring name matching would otherwise also match against the new button. Files:
  `src/stores/templates.ts`, `src/components/WorkoutHistory.vue`, new
  `e2e/save-workout-as-template.spec.ts`. Verified via `npm run build` and a full
  `npm run test:e2e` run (88/88 passed).
- Create a new exercise without leaving an active workout (item 90, 2026-09-27): `AddExerciseSheet.vue`
  gained a "New exercise" entry at the top of the sheet body (freeform workouts only, matching item
  21's template-scoping decision) that expands to a name field plus the existing `LoadTypeSelect`;
  submitting emits a `create` event that `WorkoutLogger.vue` handles by calling
  `exercises.createExercise` and selecting the new exercise into the active deck the same way an
  existing-exercise pick already does, so `draftRowsByExercise` for whatever exercise was already
  selected is untouched. Rest timer and setup notes stay Exercises-tab-only fields, per the item's
  scope. Files: `src/components/AddExerciseSheet.vue`, `src/components/WorkoutLogger.vue`, new
  `e2e/add-exercise-create.spec.ts`. Verified via `npm run build` and a full `npm run test:e2e` run
  (90/90 passed, one retried flake in `compact-set-rows.spec.ts` unrelated to this change).
- Sign-in screen shows one way in, based on what this device has used (item 95, 2026-09-27):
  `auth.ts` gained a per-device `localStorage` flag (`repbunny-passkey-device`, wrapped in
  try/catch), set on a successful `registerPasskey`/`signInWithPasskey`, that `LoginForm.vue` reads
  once on load to pick an initial `mode` (`'passkey'` or `'email'`) instead of always showing both
  the passkey button and the magic-link form with an "OR" divider between them. Each mode shows a
  quiet text-link toggle to the other, so the magic link stays reachable as the recovery path; a
  failed/cancelled passkey attempt also falls back to email. Sign-out doesn't clear the flag. A
  browser without passkey support keeps the original email-only view with no toggle link. Files:
  `src/stores/auth.ts`, `src/components/LoginForm.vue`, new `e2e/login-method.spec.ts`. Verified
  via `npm run build` and a full `npm run test:e2e` run (92/92 passed).
- Frame the passkey-mode email link as passkey recovery (item 96, 2026-09-27): `LoginForm.vue`'s
  passkey-mode toggle link changed from "Email me a sign-in link instead" to "Lost your passkey?
  Sign in with email instead" so a user without passkey access recognizes it as their way back in,
  not an equally-valid alternative. Email-mode's toggle ("Sign in with a passkey") is untouched, no
  `auth.ts` changes. Files: `src/components/LoginForm.vue`, `e2e/login-method.spec.ts` (locator
  updated to match). Verified via `npm run build` and a full `npm run test:e2e` run (92/92 passed,
  one retried flake in `body-tab.spec.ts` unrelated to this change).
- Fix sign-in screen staying email-first after a magic-link sign-in on an account that already has
  a passkey (item 95 follow-up, found by the user manually testing 2026-09-27, unrelated to a
  numbered backlog item): the per-device `repbunny-passkey-device` flag was previously set only by
  an actual WebAuthn ceremony completing on that device (`registerPasskey`/`signInWithPasskey`
  succeeding), so a user who onboarded and signed in via magic link on an account that already had
  a passkey (registered earlier, any device) still saw the email-first screen again after signing
  out — even though a synced platform passkey (iCloud Keychain, Google Password Manager) is often
  usable on that device too. `src/stores/auth.ts`'s `refreshPasskeyStatus()` now also calls
  `markPasskeyUsedOnDevice()` whenever it discovers, post-sign-in (any method), that the signed-in
  account has a passkey at all — this only ever runs after the server already knows who's signing
  in, so it doesn't reopen the original "don't ask before sign-in" privacy reasoning behind the
  per-device flag. Verified via a new `e2e/login-method.spec.ts` case (mocks `GET /auth/v1/passkeys`
  to simulate an account with a passkey, since a real one can't be registered headlessly; signs in
  via the existing magic-link-equivalent test-session mint, confirms the device flag gets set, then
  confirms the post-sign-out screen is passkey-primary) plus a full suite run (93/93 passed, one
  retried flake in `compact-set-rows.spec.ts`, a documented pre-existing pattern unrelated to this
  change).
- "Timed" load type: create, log, and show timed sets (item 93, 2026-09-27): a fifth `LoadType`,
  `timed`, for planks/treadmill/stair-stepper work — a set stores a duration instead of reps/weight
  (`reps: null`, `weight: 0`), plus optional per-exercise `distance`/`incline`/`level` tracking via
  three new `exercises` booleans (`tracks_distance`/`tracks_incline`/`tracks_level`, default false,
  editable even after the exercise has logged sets, unlike `load_type` itself). `LoadTypeSelect.vue`
  gained a full-width "Timed" card; a new `TimedTrackingSelect.vue` ("What do you track besides
  time?") shows the three checkboxes wherever an exercise is created or edited (`ExerciseList.vue`'s
  create form and edit flyout, `AddExerciseSheet.vue`'s in-workout quick-create from item 90). A new
  `src/lib/timedInput.ts` handles the mm:ss digit-mask entry (typing "2000" fills in "20:00") and
  seconds<->clock-string conversion. `WorkoutLogger.vue`'s set-rows grid gets a parallel timed
  branch (header, draft row, active-set edit form) that asks for Time plus whichever of
  Distance/Incline/Level the exercise tracks, wrapping to a second line only for Distance+Incline
  together, per the design; `WorkoutHistory.vue`'s edit and add-set forms got the same branch.
  `formatSetLabel` (`src/lib/setLabel.ts`) renders "20:00 · 2.1 mi · Incline 3" / "15:00 · Level 8" /
  "1:00". `volume.ts` and `progress.ts`/`workouts.ts` exclude timed sets from volume and PR/record
  checks entirely (not counted as 0), same treatment as `level`; `ExerciseHistoryDetail.vue` hides
  its heaviest/level/assist summary card for a timed exercise rather than show a meaningless "0lb"
  one (item 94 gives it a real Longest/Farthest summary). `sets.duration_seconds`/`distance`/
  `distance_unit`/`incline` and the three `exercises.tracks_*` columns were already applied live by
  the user 2026-09-27 (see "Supabase configuration" above); this item only mirrors that DDL into
  `supabase/schema.sql` and `docs/architecture.md`'s data model — no migration executed by the
  agent. One deviation from the mockup: the "Stair stepper" logging frame wasn't built as its own
  component — `tracks_level` reuses the same compact-row branch as distance/incline (a stair
  stepper is just a timed exercise with `tracks_level` on and both others off), rather than a
  fourth bespoke layout, since the item's own field list already covered that combination. Files:
  `src/lib/types.ts`, `src/lib/timedInput.ts` (new), `src/lib/setLabel.ts`, `src/lib/volume.ts`,
  `src/lib/progress.ts`, `src/lib/exerciseHistory.ts`, `src/stores/exercises.ts`,
  `src/stores/workouts.ts`, `src/components/LoadTypeSelect.vue`,
  `src/components/TimedTrackingSelect.vue` (new), `src/components/ExerciseList.vue`,
  `src/components/AddExerciseSheet.vue`, `src/components/WorkoutLogger.vue`,
  `src/components/WorkoutHistory.vue`, `src/components/ExerciseHistoryDetail.vue`,
  `supabase/schema.sql`, `docs/architecture.md`, new `e2e/exercise-load-type-timed.spec.ts`.
  Verified via `npm run build` and a full `npm run test:e2e` run (95/95 passed).
- Let a user delete their own account and all of its data (item 92, 2026-09-27): the header's
  account icon (previously a direct sign-out button) now opens a new `AccountSheet.vue` bottom
  sheet showing the signed-in email, **Sign out**, and **Delete account**; Delete account switches
  the same sheet to a confirmation view (what gets deleted, "It can't be undone.", a text field
  that must exactly match `DELETE` before **Delete my account** enables), built true to the design
  source (canvas `T9pugexekjuJFtZ5oDYWtf`, row "Account deletion (item 92)"). Confirming calls
  `supabase.rpc('delete_my_account')` — the `security definer` Postgres function the user applied
  live 2026-09-27 (see "Supabase configuration" above), deleting the caller's rows in FK-safe order
  then their `auth.users` row; this item mirrors it into `supabase/schema.sql` (no migration
  executed by the agent) and documents the flow in `docs/architecture.md`. `stores/auth.ts`'s new
  `deleteAccount()` also signs out locally and clears every one of this app's own localStorage keys
  (all prefixed `repbunny-`, including the per-device passkey flag, since the deleted account's
  passkey credential is gone too) on success, and leaves the account signed in with the RPC's error
  surfaced on failure. Header icon-button changed from `aria-label="Sign out"` to
  `aria-label="Account"`, so every existing e2e spec that clicked it directly to sign out
  (`e2e/auth.spec.ts`, `e2e/login-method.spec.ts`, `e2e/cross-account-switch.spec.ts`) was updated
  to click "Account" first, then "Sign out" inside the sheet. Files: `src/App.vue`,
  `src/stores/auth.ts`, `src/components/AccountSheet.vue` (new), `supabase/schema.sql`,
  `docs/architecture.md`, `e2e/auth.spec.ts`, `e2e/login-method.spec.ts`,
  `e2e/cross-account-switch.spec.ts`, new `e2e/account-deletion.spec.ts` (its own freshly-minted,
  disposable plus-address account per test, never the shared per-worker one, since the feature
  destroys it — one test seeds an exercise/template/workout+set/body-weight entry, deletes through
  the UI, and confirms via the admin client that no rows remain and the auth user is gone; the other
  confirms a wrong confirmation phrase and Cancel both leave the account untouched). Verified via
  `npm run build` and a full `npm run test:e2e` run (97/97 passed).

- Fix timed-set row layout: compact grid for 0-1 tracked extras, labeled fields for 2+ (item 97,
  2026-09-28): `WorkoutLogger.vue`'s active-workout entry row for a `timed` exercise now counts how
  many of `tracks_distance`/`tracks_incline`/`tracks_level` are on (`selectedExerciseTimedExtrasCount`)
  and switches layout on that count instead of always showing the shared Set/Time/<col>/RPE header.
  0 or 1 tracked extra keeps the compact single-line grid with its header (unchanged for Plank and a
  Level-only exercise); when the one extra is Distance, its mi/km control moves out of the header
  entirely into a small tappable chip beside the input (`.unit-chip`, a single pill showing the
  active unit that flips it on tap, replacing the old two-button `role="group"` toggle). 2 or more
  tracked extras (Treadmill: distance + incline) drops the header for that exercise's rows
  completely; every field gets its own small label on the field itself via a new `.set-field-labeled`
  modifier class (Time/Distance packed on line 1, Incline+RPE still wrapping to line 2, matching the
  design source's "idea B, adaptive" packing rule). The Distance field's chip button sits as a
  sibling of the input rather than inside its `<label>`/`aria-label` association, since nesting an
  `aria-label`led control inside the label was concatenating into the input's accessible name and
  broke `getByLabel('Distance')` (caught by the e2e run, not by build). `WorkoutHistory.vue`'s
  edit/add-set forms and `WorkoutLogger.vue`'s own already-logged-set edit form were left unchanged
  — both already show every field with its own persistent `<label>` and never had a shared header, so
  the misalignment this item fixes doesn't apply there. No schema change. Files:
  `src/components/WorkoutLogger.vue`, `e2e/exercise-load-type-timed.spec.ts` (added a
  distance-only "Stationary bike" case alongside Plank/Treadmill, and asserts on `.set-header-row`'s
  presence/absence and the chip's accessible name). Verified via `npm run build` and a full
  `npm run test:e2e` run (97/97 passed).

  **Follow-up same day:** device testing caught a second layout bug this item's own e2e coverage
  didn't: on a 2+-extras row (Treadmill), the Distance field inherited `flex: 1` from the compact
  grid's `.set-field-weight`, and with RPE moved to line 2 nothing else on line 1 grew to match, so
  Distance ballooned alone and the action buttons — pushed to the row's right edge via
  `margin-left: auto`, a compact-grid rule meant to line every row's buttons up — ended up stranded
  with a large empty gap before them. Fixed by letting `.set-field-labeled` fields keep their
  natural (fixed-width) size instead of stretching, and adding a `.set-row-actions-inline` modifier
  that drops the auto-margin push for labeled rows so the buttons just follow the last field with
  the row's normal gap. Re-verified via `npm run build` and a full `npm run test:e2e` run
  (97/97 passed, 1 unrelated flaky retry in `body-tab.spec.ts`).

- Timed-set row: one labeled grid instead of item 97's mixed two-line layout (item 101, 2026-09-28):
  the labeled layout (2+ tracked extras, e.g. Treadmill: Distance + Incline) previously stacked
  Time/Dist on one line with a label above each input, then fell back to item 93's older
  label-beside-input style for Incline/RPE on a second line offset by a hardcoded
  `padding-left: 38px` — two labeling styles on one card, nothing aligned between the lines.
  Replaced both lines in `WorkoutLogger.vue` with a single `.set-grid-fields` CSS grid
  (`grid-template-columns: repeat(2, minmax(0, 1fr))`) holding every tracked field (Time, Dist,
  Level, Incline, RPE — only the tracked ones, RPE always last) as its own `<label>` grid item, each
  with a small label stacked above its input; the ✕/✓ action buttons sit in a flex sibling next to
  the grid, vertically centered by the row's own `align-items: center` across however many grid rows
  the fields need. The compact single-line layout (0-1 tracked extras, e.g. Plank/Bike) and the
  already-logged-set rows are unchanged; the grid only replaces the labeled branch, split into its
  own `v-if`/`v-else` template block instead of one line with per-field `useLabeledTimedFields`
  conditionals layered on top of each other. Deleted the now-dead `set-row-line-secondary` block and
  its duplicate `row-incline-*`/`row-rpe-incline-*` inputs, plus the CSS that only served them
  (`.set-row-line-secondary`, `.set-field-inline`, `.set-field-labeled`, `.set-row-actions-inline`).
  While rewriting the Incline field, gave it an explicit `aria-label="Incline"` (matching the
  Distance field's existing pattern) instead of relying on an implicit `<label>`'s text content: with
  both a `sr-only` span and the new visible label span inside the same `<label>`, the browser
  concatenated both into the input's accessible name, breaking the e2e suite's existing
  `getByLabel('Incline', { exact: true })` assertions (caught by the e2e run, not by build) — same
  root cause item 97 hit with Distance, now fixed the same way for Incline too. No schema change.
  Files: `src/components/WorkoutLogger.vue`, `e2e/exercise-load-type-timed.spec.ts` (asserts every
  tracked field's label is visible in the Treadmill draft row and that no
  `.set-row-line-secondary` remains). Verified via `npm run build` and a full `npm run test:e2e` run
  (96/97 passed, 1 flaky retry in `compact-set-rows.spec.ts` unrelated to this item's feature area —
  confirmed by re-running it in isolation, where it passed cleanly).
  **Follow-up (2026-09-28, user-reported from device):** the 2-column labels-above grid still didn't
  line up: the Dist label row carried the taller mi/km chip, so Dist's input sat lower than Time's,
  and a phone-width row has no room for two label+input+unit columns side by side. Switched to one
  field per line in a single shared grid (`max-content max-content 1fr`: label | input | unit), each
  `.set-grid-field` a `subgrid` spanning all three columns, so labels, input left edges, and the
  chip align regardless of which extras are tracked. Labels now sit left of their inputs, the chip
  moved after the Distance input, and inputs in this layout share one width (58px). The e2e spec now
  asserts the alignment geometrically (equal input left edges, one field per line, chip right of and
  centered on the Distance input) instead of only checking labels are visible.

- Larger logging screen: bigger fields, pinned Finish, compact workout header (item 102,
  2026-09-28): user-requested after a farsighted pilot user needed reading glasses to log sets.
  Mockup: canvas "RepBunny Larger Logging" (https://claude.ai/artifact/VHC9kwsFnpARH8rsWqHCXz),
  "bigger fields, pinned Finish" boards for strength and timed; the canvas's focus-mode board was
  considered and rejected by the user. Built directly rather than logged for the runner, since it
  was a large layout change. Changes:
  - During an active workout `App.vue` hides the brand header and tagline; `WorkoutLogger.vue`
    renders one compact row instead: Account (person icon, opens the same `AccountSheet`), the
    workout title (truncates), the elapsed timer, and Add exercise (moved up from the deck). The
    Account icon everywhere is now a person, not a sign-out arrow, since it opens the Account sheet
    rather than signing out. Shared open state lives in `src/lib/accountSheet.ts`.
  - Exercise card is a 96px strip (150px with setup notes) with 44px arrow buttons (were 26px
    slivers); the name wraps to 2 lines, "1 / N" pill beside it, "N sets logged · History" below.
  - Set card: labels 15px sentence case (were 10px uppercase, dim); boxed 52px-tall inputs with
    ~22px digits (were 28px underlines); ✓ 48x52 and ✕ 36x52 (were 26px circles); lb/kg moves to
    its own line with 40px buttons, and the per-row "lb" suffix is gone to fit the 375px width
    budget (documented in the CSS comment above `.set-card`). A 360px media query trims fixed
    columns.
  - Timed rows with any tracked extra (was 2+) stack: "Set N" + Remove, one field per line
    (item 101's subgrid), full-width "Add set" button. Only time-only exercises keep the
    single-line row.
  - Finish workout is pinned in a fixed `.bottom-dock` above BottomNav (still `.btn-accent`, per
    the primary-CTA item, rather than the mockup's outline), stacked with the rest mini-bar so the
    two never overlap. `--bottom-nav-height` (style.css) is the one number both use; BottomNav
    labels went from 0.68rem to 0.8rem and icons to 22px.
  Files: `src/App.vue`, `src/components/BottomNav.vue`, `src/components/WorkoutLogger.vue`,
  `src/lib/accountSheet.ts`, `src/style.css`, `e2e/exercise-load-type-timed.spec.ts` (Bike now
  expects the stacked layout; the alignment check waits for the exercise-switch slide to finish,
  which caused one flaky retry). Visually checked with throwaway Playwright screenshots at 375px
  and 360px (strength, Treadmill, Bike, Plank), then the full `npm run test:e2e` suite.
  **Follow-up (2026-09-28, user-reported from device):** logged rows in the set card still read as
  a reps-first sentence ("8 × BW + 120lb") directly above an entry row whose inputs go weight
  first, and the user typed reps into the weight box copying it; "BW" was also unclear. Logged
  reps-based rows now show one value per column (weight/level with a small unit, reps, RPE, a
  green check) under the same header as the inputs; the sentence stays as `sr-only` text for
  screen readers. Timed logged rows keep their sentence (no reps/weight to confuse).
  `compact-set-rows.spec.ts` now asserts the logged weight and reps sit centered over the Weight
  and Reps inputs.
  **Follow-up (2026-09-28):** checked at 412/390/375/360/320px. 320px (small phones, and any
  phone with Android's Display size turned up, the users this layout targets) broke: the weight
  box collapsed to a sliver, logged "120 lb" ran into the reps, and tab labels overlapped. Added a
  `max-width: 340px` block tightening every fixed column (weight keeps ~60px) and the stacked
  timed grid, and shrinking BottomNav labels to 0.7rem there.
- Edit and delete logged sets right in the set card; remove the workout-wide set list (item 103,
  2026-09-28): in `src/components/WorkoutLogger.vue`, each logged row in the set card now has a
  pencil (44px, `aria-label="Edit set N"`) beside its green check, together in the same 88px slot
  as the entry row's ✕/✓ so the header still lines up. The pencil turns that row back into the
  draft row's own inputs (same template branches, including the stacked timed layout), bound to a
  DraftRow-shaped `editRow`, with Delete (trash, `Delete set N`) in the ✕ slot and Save
  (`Save set N`) in the ✓ slot; below the inputs, a Cancel text button plus that set's own lb/kg
  toggle (units stay per set, as the old editor had; the Treadmill's mi/km chip likewise edits the
  set's unit), replaced by item 51's inline "Delete this set?" / Confirm delete / Cancel while
  confirming. Only one row edits at a time, and switching exercises cancels it. `saveSetEdit`
  and `handleDeleteSet` are reused (no second save path); save errors now show in the row. The
  `<ol class="list">` workout-wide list, its CSS, and `weightFieldLabelFor` are gone. Specs that
  edited/deleted through `li.row-wrap` or waited on the list's `.row` now use the in-card
  controls and `.set-row-logged` (edit-delete-set, exercise-load-type-{level,bodyweight,assisted,
  timed}, optional-numeric-fields, compact-set-rows, no-target-row-replenish, rest-timer-screen,
  resume-workout, resume-after-finish, volume-chart, templates, primary-cta-styling,
  progress-strip); `edit-delete-set.spec.ts` covers the acceptance flow through History plus a
  320px no-overflow check, and the timed spec round-trips a Treadmill set's time, distance, and
  incline in the card. Visually checked with throwaway Playwright screenshots at 375px and 320px.
  Verified via `npm run build` and a full `npm run test:e2e` run (98/98).
- Play a chime when the rest timer finishes, not just vibration (item 100, 2026-09-28): new
  `src/lib/restChime.ts` generates a short Web Audio oscillator beep (no audio asset), with
  `primeRestChimeAudio()` creating/resuming a shared `AudioContext` synchronously inside
  `WorkoutLogger.vue`'s `completeRow()` (the "Add set" click handler) so mobile autoplay
  restrictions don't block the later, async playback; `playRestChime()` is called alongside the
  existing `navigator.vibrate?.(200)` in both completion paths -- `RestTimer.vue`'s full-screen
  countdown and `WorkoutLogger.vue`'s `finishRest()` (minimized path) -- not instead of it. Manual
  "Skip Rest"/mini-bar "Skip" stay silent (no chime), matching vibration's existing behavior.
  Files: `src/lib/restChime.ts` (new), `src/components/RestTimer.vue`,
  `src/components/WorkoutLogger.vue`. New `e2e/fixtures/restChime.ts` stubs `window.AudioContext`
  (real audio output isn't assertable in Playwright) to count oscillator `start()` calls; two new
  specs in `e2e/rest-timer-screen.spec.ts` use `page.clock.install()`/`fastForward()` to reach
  timer completion for both the full-screen and minimized paths and assert the chime fired --
  new test infrastructure, since no existing spec here mocked time. Manual device verification
  (audible with screen on, tab foregrounded, phone muted/face-down) stays a human follow-up per
  the item's acceptance criteria, not blocking this gate.
  Verified via `npm run build` and a full `npm run test:e2e` run (100/100, one
  `compact-set-rows.spec.ts` flake on first attempt -- unrelated to this change, a carousel-dot
  visibility timeout matching the documented worker-contention flake pattern -- passed on
  Playwright's built-in retry).
  **Follow-up (2026-09-28):** swapped the generated oscillator beep for a user-supplied clip
  (`public/rest-chime.mp3`, an AI-generated sound effect the user picked and provided), at the
  user's request. `restChime.ts` now fetches and `decodeAudioData`s the clip inside
  `primeRestChimeAudio()` (kicked off early so it's ready well before a typical rest ends) and
  plays it via an `AudioBufferSourceNode` on the same primed `AudioContext`; a failed
  fetch/decode (e.g. first-ever offline load before the service worker finishes precaching) is
  swallowed silently since vibration still fired. `vite.config.ts`'s `injectManifest.globPatterns`
  gained `mp3` so the clip is precached for offline gym use like the rest of the app shell.
  `e2e/fixtures/restChime.ts`'s stub `AudioContext` updated to fake `decodeAudioData` and count
  `AudioBufferSourceNode.start()` calls instead of an oscillator's. Verified via `npm run build`
  (precache count 24 → 25 entries) and a full `npm run test:e2e` run (100/100, two flakes on
  first attempt -- `compact-set-rows.spec.ts` and `exercise-notes.spec.ts`, neither touching this
  feature area, both matching the documented worker-contention pattern -- passed on retry).
- Timed exercise progress in the exercise history detail (item 94, 2026-09-28): `ExerciseHistoryDetail.vue`
  now shows "Longest" (longest duration) and, when any set has a distance, "Farthest" per unit for a
  timed exercise, replacing the meaningless "heaviest completed set" card for that load type. New pure
  helpers `longestDuration`/`farthestDistanceByUnit` in `src/lib/exerciseHistory.ts`, beside
  `heaviestSetByUnit`. Extended `e2e/exercise-history.spec.ts` with a new spec seeding a Treadmill
  (distance-tracking) and a Plank (duration-only) timed exercise, confirming Longest/Farthest render
  correctly and a duration-only exercise shows no Farthest row.
  Verified via `npm run build` and a full `npm run test:e2e` run (101/101, one
  `account-deletion.spec.ts` flake on first attempt -- unrelated to this change, a strict-mode
  locator collision matching the documented worker-contention flake pattern -- passed on
  Playwright's built-in retry).
- Timed exercises can also track Calories (item 98, 2026-09-28): a fourth `TimedTrackingSelect.vue`
  checkbox alongside Distance/Incline/Level, staying editable after sets exist like the other three.
  Schema (`exercises.tracks_calories`, `sets.calories`, already live per the item's note) mirrored into
  `supabase/schema.sql` and `docs/architecture.md`'s data model. `formatSetLabel` (`src/lib/setLabel.ts`)
  appends calories last with no unit, e.g. "20:00 · 210 cal". Threaded `calories` through
  `stores/exercises.ts` (create/update), `stores/workouts.ts` (addSet/updateSet/updateHistorySet/
  addHistorySet, plus the exercise-history fetch), `src/lib/types.ts`, and `src/lib/exerciseHistory.ts`,
  and added the input to every place Distance/Incline already had one: `WorkoutLogger.vue`'s stacked
  entry-row layout (a calories-only exercise now counts as 1 tracked extra, so it gets the same
  stacked/labeled layout as any other single-extra timed exercise, not the compact header) and its set
  editor, `WorkoutHistory.vue`'s add-set and edit-set forms, `AddExerciseSheet.vue`, and `ExerciseList.vue`.
  Excluded from volume and PR/record checks, same as every other timed field. Extended
  `e2e/exercise-load-type-timed.spec.ts` with a new spec: a Rowing Machine tracking only Calories, and a
  Treadmill with Calories added alongside Distance/Incline (3 extras), covering the logger, the stacked
  layout, and a History edit round-trip.
  Verified via `npm run build` and a full `npm run test:e2e` run (102/102, no flakes).
- Show timed-exercise progress on the post-workout finish screen (item 105, 2026-09-28): extended
  `WorkoutLogger.vue`'s post-finish card so it also shows a compact Longest/Farthest summary for every
  timed exercise logged in the just-finished workout, freeform included (unlike the existing Volume over
  time card, which stays templated-only). Added `timedFinishSummaries` and `loadTimedFinishSummaries()`,
  which reads `justFinishedWorkout.sets` (already ordered by global `set_index` with each set's exercise
  name/load_type embedded) for the distinct timed exercises logged, then calls the existing
  `workout.fetchExerciseHistory` once per exercise and reuses item 94's `longestDuration`/
  `farthestDistanceByUnit` helpers (`src/lib/exerciseHistory.ts`) rather than duplicating the calculation
  -- computed across each exercise's full history, not just today's sets. New `showingFinishSummary`
  computed gates the post-finish card on `showingVolumeChart || timedFinishSummaries.length > 0`, so a
  workout with no timed exercises falls through to today's unchanged "Resume your workout?" card. Added
  `e2e/finish-timed-summary.spec.ts`: a freeform workout with a Treadmill set (prior history 20:00/2.1mi,
  today's set shorter) and a Plank set (no prior history) shows both summary cards on finish, Treadmill's
  reflecting the full-history max and Plank's Longest-only (no Farthest row).
  Verified via `npm run build` and a full `npm run test:e2e` run (103/103, no flakes).
- Replace the post-finish "Volume over time" card with a session recap (item 106, 2026-09-28): new
  `src/lib/finishRecap.ts` (pure recap builder) and `src/components/FinishRecap.vue`, built to the
  approved canvas https://claude.ai/artifact/FEaTcvP3eYSCBd8L6ksZwy (artboards A1/A2). Shows for every
  finished workout with sets, freeform included: "<template>, done." header, a hero tile (Volume moved
  with a delta chip vs the template's last session and up to 6 zero-based session bars, or Time moving
  with a per-exercise split for a cardio-only session), two tiles (Sets/Time/Distance/Calories, first
  that apply; Time is skipped when Time moving leads), New records (only when an earlier workout was
  beaten, with the old best), Vs last time chips (green up, neutral grey Same/Lighter, never red),
  a This week strip, and Done/Resume. `stores/workouts.ts` swaps `fetchTemplateVolumeHistory`/
  `volumeHistory` for `fetchFinishRecap`/`finishRecap` (prior sets paged past the 1000-row cap);
  `lib/volume.ts` keeps `setVolume` and adds `workoutVolume`, dropping `computeVolumeHistory`;
  `VolumeChart.vue`, `e2e/volume-chart.spec.ts` and `e2e/finish-timed-summary.spec.ts` deleted,
  replaced by `e2e/finish-recap.spec.ts`; load-type, resume, progress-strip, pr-toast and CTA specs
  updated for the recap and the "Log another workout" to "Done" rename. Deviations from the mockup:
  workout duration is performed_at to the Finish tap (no end time is stored), so the Time tile's sub
  reads "start to finish" instead of the mockup's rest breakdown; a shorter timed set reads "Shorter"
  rather than "Lighter"; item 70's first-workout celebration keeps its per-template trigger (first
  completion of a template) and shows above the recap. A freeform finish no longer shows the separate
  "Resume your workout?" card, since the recap carries the resume link (the card remains the fallback
  if the recap's queries fail).
  Verified via `npm run build` and a full `npm run test:e2e` run (103/103).
- Auto-advance to the next exercise once a template exercise's planned sets are done (item 104, 2026-09-28):
  `WorkoutLogger.vue` now, after the set that reaches an exercise's `target_sets`, finds the next
  exercise in the deck (searching forward, wrapping) that still has unlogged planned sets and moves
  there with the existing slide when that set's rest ends or is skipped (both the full-screen and
  minimized paths), or about 1.5s later with an "Up next: <name>" note above the pinned Finish button
  when the exercise has no rest configured. `RestTimer.vue` takes an optional `upNextName` and shows
  "Up next: <name>" in place of "Next: <same exercise>" for that rest. The advance is skipped if the
  user already moved to another exercise, has an extra draft row open on the finished one (e.g. "+ Add
  row" during rest), is editing a set, or has focus in an input. Freeform workouts and exercises
  without a target never advance; once every targeted exercise is done, "All planned sets done" shows
  above Finish instead. New `e2e/auto-advance.spec.ts` (6 tests, Playwright clock for the rest and
  toast timing). Also fixed a pre-existing test-hygiene bug this surfaced: `e2e/auth.spec.ts`'s
  item-86 test does a real server-side sign-out of the cached per-worker session but never called
  `invalidateWorkerSession()` (as `cross-account-switch.spec.ts` does), so the next test in that
  worker started signed out; the new spec, sorting right after it, failed that way in two full runs.
  Verified via `npm run build` and a full `npm run test:e2e` run (109/109).
- Confirm a workout delete in a centered modal instead of at the bottom of the card (item 110, 2026-09-28):
  `WorkoutHistory.vue`'s trash-can trigger now opens a `role="dialog"`/`aria-modal="true"` overlay
  centered on screen (new `deletingEntry` ref holding the whole entry, replacing the old
  `confirmingDeleteId` inline-toggle), instead of the old `confirmingDeleteId === entry.id` block that
  rendered after every set row and could sit a full screen or more below the trigger on a long
  workout. The dialog names the workout (template name or "Freeform workout"), its date, and set
  count, keeps "This can't be undone.", and closes on Cancel, backdrop click, or Escape (new
  `handleDeleteDialogKeydown` listener) without deleting; confirming reuses the existing
  `confirmDelete(id)`. Per-set delete confirmations were left untouched (still inline under their own
  row, per the item's scope). Extended `e2e/delete-workout.spec.ts`: the existing test now asserts
  against the dialog role instead of the card, and a new test seeds a 12-set workout directly via the
  admin client, sets a 375×800 viewport, and asserts the dialog's `boundingBox()` stays within
  0..800 (no scrolling needed) plus that Escape cancels it the same as the Cancel button.
  Verified via `npm run build` and a full `npm run test:e2e` run (110/110).
- Keep the Account button in the same top-right corner on every screen (item 108, 2026-09-28):
  `WorkoutLogger.vue`'s active-workout header (`.log-header-workout`) reordered its Account button
  from first (top left, before the title) to last (after the Add exercise "+" button), matching
  `App.vue`'s `.app-header` order (title, elapsed time, +, Account) elsewhere. No CSS changes
  needed — the row's existing `justify-content`/flex layout put it top right once moved. New
  `e2e/account-button-position.spec.ts`: at a 375px viewport, asserts the Account button's `x`
  matches (within 4px) across Home, the Exercises tab, and an active freeform workout, and that its
  `x` sits right of the Add exercise button's during that workout.
  Verified via `npm run build` and a full `npm run test:e2e` run (112/112).
- Finish a templated workout automatically once every planned set is logged (item 109, 2026-09-28):
  `WorkoutLogger.vue` now auto-finishes when a logged set makes `allPlannedSetsDone` true (superseding
  item 104's rule 5): no rest starts for that set (and any running rest is cleared), the dock shows
  "All planned sets done" plus "Finishing workout…" in the Finish button's spot for ~1.5s, then
  `handleFinish` runs into the recap, whose "Finished too early? Resume" is the undo. Suppressed (the
  old note and Finish button stay) by item 104's rules (extra draft row on the current exercise, a set
  being edited, focus in an input, rechecked when the moment ends), `hasUnconfirmedSet`, and freeform
  workouts; a record celebration holds the finish until it's dismissed. `e2e/auto-advance.spec.ts`
  gains the acceptance and extra-row cases and a freeform no-recap check. Five specs that logged every
  planned set then tapped Finish were updated because the tap no longer exists at that point:
  `exercise-load-type-{assisted,bodyweight,level,timed}.spec.ts` now let the auto-finish land the
  recap, and `compact-set-rows.spec.ts` opens its "+ Add row" before logging row 3 (same
  add/remove coverage, and it keeps the grid on screen instead of auto-finishing).
  Verified via `npm run build` and a full `npm run test:e2e` run (113/113).
- Drop the RepBunny name/logo header and tagline from signed-in screens (item 107, 2026-09-28):
  `App.vue` now renders a slim Account-only row above each inactive signed-in view, removing the
  persistent logo, wordmark, and Home tagline so each tab's own heading leads its content; active
  workouts keep their existing compact header and top-right Account button. `LoginForm.vue` now
  explicitly carries the logo, RepBunny name, and tagline alongside the already-branded onboarding
  screen. New `e2e/signed-in-chrome.spec.ts` checks all five signed-in tabs, Account access, retained
  signed-out branding, and the first Home card's higher position at 375px; a phone-width screenshot
  was visually checked and required no deviation from the backlog description.
  Verified via `npm run build` and a full `npm run test:e2e` run (115/115, no flakes).
- Start a workout by tapping its tile; category icons; notes on the recap (item 111, 2026-09-28,
  from user feedback that the start screen kept stalling them: "Template (optional)" chips sat above
  a Start button that stayed disabled, with no explanation, until a chip was picked). Home's
  `WorkoutLogger.vue` start card is now "What are you training today?" with big two-column tiles,
  and a tap starts that workout immediately (`startWith`, double-tap guarded); the Start button,
  its disabled state, and the pre-workout Notes field are gone. Freeform is a full-width tile that
  spells out its trade-offs (no plan, no auto-finish, no progress chart; save as a template from
  History later). A wrong tap is undone by "Wrong workout? Change it" under the workout header,
  shown only until the first set is saved; it reuses `handleFinish`, so the set-less row is deleted
  (item 9) with no confirm. Notes moved to an optional "How did it feel?" field on the post-finish
  recap (`FinishRecap.vue` `v-model:notes`), seeded from the workout's saved notes and written via
  `updateWorkoutNotes` on Done or Resume, only if changed. Folded in from item 112 at the user's
  request: the keyword classifier (`src/lib/templateCategory.ts`: user pick, then template name,
  then exercise mix; no inference), `CategoryIcon.vue` built from the approved
  `docs/design/item-112-category-icons.html`, icons on Home tiles and on Templates rows (replacing
  item 46's id-hash icons, row subtitle now "N exercises · <category>"), a `--cardio` tint in
  `style.css`, and `fetchTemplates` embedding `exercise_refs` so Home can classify without per-
  template fetches. The live `workout_templates.category` column (user-applied) is mirrored into
  `supabase/schema.sql` and `docs/architecture.md` (whose data model also gained the two template
  tables and `workouts.template_id`, previously undocumented). Item 112 is now just the picker.
  Tests: `template-or-freeform-choice.spec.ts` rewritten for tap-to-start, Change workout (row
  deleted, link gone after a set) and recap notes; new `template-category.spec.ts` covers the
  classifier tables and categories on both screens; ~35 specs dropped their "Start workout" click;
  `delete-workout`/`edit-past-workout` write notes on the recap; `zero-set-cleanup` tracks the row
  by the persisted active-workout id. Verified via `npm run build` and a full `npm run test:e2e`
  run (119/119), plus phone-width screenshots of Home, a started workout, and the recap.
- Celebrate new exercises on the finish recap (item 115, 2026-09-28). First-time
  exercises now receive one borderless gold "New" chip with the approved 12px sparkle,
  and the comparison card reads "All new today" when every row is new. Existing top-set
  details and comparison chips are unchanged. Extended `e2e/finish-recap.spec.ts` for
  mixed freeform and all-new template workouts, timed exercise coverage, and phone-width
  geometry; visually checked the approved Option A styling with no design deviations.
  Verified: `npm run build` passed; full `npm run test:e2e` 121/121 passed, no flakes or
  exclusions. Commit: `Celebrate new exercises in finish recap (item 115)`.
- Fix template exercises without a set count being skipped (item 117, 2026-09-28): legacy
  null-target exercises now count as unfinished until their first logged set, so auto-advance
  lands on them and auto-finish waits for them; once logged, they remain open-ended and require
  a manual move as before. New template exercises default to 3 target sets, and both add and
  inline edit forms require at least 1. Extended the template and auto-advance e2e coverage for
  legacy null targets plus blank/zero validation. Verified via `npm run build` and a full
  `npm run test:e2e` run (123/123 passed; `edit-past-workout.spec.ts` retried once, passed in
  isolation, and is tracked as item 120).
- Move the backlog to GitHub Issues (item 122, 2026-09-28, decided with the user after two agents
  editing the shared `docs/backlog.md` collided on item number 120). The 9 open items became
  issues #1-#9 and the 9 human setup tasks #10-#18 (`scripts/migrate-backlog-to-issues.mjs`, dry
  run reviewed by the user first; personal email addresses redacted since the repo is public),
  with labels `effort:N`/`value:N`/`feature`/`bug`/`tooling`/`human`/`status:blocked`/
  `status:needs-review`. New `scripts/next-issue.mjs` ranks eligible issues (ROI, then Value, then
  oldest); its pick matched the old priority line's (item 119 = #7); the only change is ROI ties
  now break by issue age instead of file position. `.claude/skills/next-item` selects via that
  script, ships with a `(#N)` subject plus `Fixes #N` and a close-out comment, and blocks with a
  label and comment instead of a commit; `Run-Backlog.ps1` checks `gh` at startup and detects
  blocks from the skill's `Blocked — ... (#N)` line (a blocked run no longer commits);
  `run-backlog`, `pm-review`, and `ux-review` (Claude and Codex copies) file and dedupe against
  issues; `.claude/settings.json` allows the `gh issue` commands the runner needs.
  `docs/backlog.md` is now a conventions stub with the old-number map; this archive is frozen as
  of this entry. Docs/tooling only, no app code, so no build/e2e gate (per the verification
  policy); `Run-Backlog.ps1` syntax-checked with the PowerShell parser.
