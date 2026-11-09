# Architecture: Native apps: flavors and releases

> Part of the architecture reference; index at `docs/architecture.md`.

- **Flavors (#68):** `android/app/build.gradle` has two product flavors. `store` is the App
  Store / Play Store app (`app.repbunny`). `personal` is the owner's sideloaded build
  (`app.repbunny.personal`, "RepBunny (Dev)"), so both can be installed side by side. Its name
  and DEV-badged launcher icons live in `android/app/src/personal/res`. Both icon sets come from
  `public/icon-512.png` via `node scripts/generate-android-icons.mjs`; re-run it (and
  `node scripts/generate-theme-icons.mjs`, for the per-theme icons of #145) after changing that icon. `versionCode`/`versionName` default to 1 / 1.0 and are passed as Gradle properties
  by release scripts.
- **Personal releases (#68, #69):** `scripts/Release-PersonalAndroid.ps1` builds the web app with
  `VITE_PREMIUM_UNLOCKED=true` and `VITE_DEV_TOOLS=true` (#784), runs `assemblePersonalRelease` on JDK 21, signs with the personal
  key, and publishes the APK as a GitHub release in this repo, tagged at the built commit. The
  repo is private, which is what keeps the premium-unlocked APK private; the script refuses to
  publish if the repo is public. The owner's phone gets updates through Obtainium with a
  read-only token.
  - **Versioning:** the next `versionCode` is the latest release tag's + 1, so a release changes
    no files. Tags and `versionName` are `1.0.<versionCode>`. Release
    notes name the source commit and list the commits since the previous release. After
    publishing, it comments `Ready to test in RepBunny (Dev) <version>` on each open `status:verify`
    issue those commits name (`docs/backlog.md` > Owner check), which is why the workflow has
    `issues: write`. A failed comment never fails the release.
  - **Signing:** `ANDROID_PERSONAL_KEYSTORE` (path, kept outside the repo), `_KEYSTORE_PASSWORD`,
    `_KEY_ALIAS`, `_KEY_PASSWORD` in `.env.local`. Gradle reads them from the environment only;
    without them personal release builds come out unsigned and the script stops. The keystore
    and password are backed up in the owner's Proton Pass. Losing them means the next
    update can't install over the old app, and reinstalling wipes on-device data.
  - **Publishing** uses the `gh` login. The script refuses a dirty tree unless `-AllowDirty` and
    an unpushed HEAD; `-SkipPublish` only builds.
  - **Automated:** `.github/workflows/release-android.yml` runs the same script on GitHub's Ubuntu
    runners nightly at 09:00 UTC with `-SkipIfUnchanged` (no release when the latest one was
    built from the current `main`), and on demand from Actions > Release Android build > Run
    workflow (tick "force" to release an unchanged `main`). Secrets:
    `ANDROID_PERSONAL_KEYSTORE_BASE64` (the .jks, base64), `ANDROID_PERSONAL_KEYSTORE_PASSWORD`,
    and the public `VITE_VAPID_PUBLIC_KEY`, which the build no longer reads since #939 (the old
    backend's URL and key secrets went unused in #938; the owner deletes them in #941). If the key or password changes, re-set them with `gh secret set`. Private-repo
    Actions minutes are free up to 3,000 a month on Pro; a run takes a few minutes.
  - **Premium gate (#104):** `src/lib/premium.ts`'s `isPremium` is true when the build sets `VITE_PREMIUM_UNLOCKED=true` (read only
    through `import.meta.env`, so it's a build-time constant; it's the default, and the personal
    build's Premium (dev) switch can turn it off through the stored `repbunny-premium-dev-off`
    override, #784, which Erase all data keeps), or when the device has a stored
    unlock (`setPremiumUnlocked`, localStorage `repbunny-premium-unlocked`, which Erase all data
    keeps). Without it, local mode allows 3 active templates (`FREE_TEMPLATE_LIMIT`): Templates'
    Add template, Home's "+ New template", and History's "Create template from workout" check
    `templates.canCreateTemplate()` (a starter program's Add checks `templates.canAddProgram()`
    for all its templates at once, #209) and open `PremiumSheet.vue` (rendered once in App.vue,
    opened with `openPremiumSheet`) instead. Existing templates past 3 are never hidden, and restore has
    no limit. The logger's Plates button stays visible and opens the same sheet. Logging a set
    never hits the gate.
    Nothing goes on `window`; `e2e/local/premium-gate.spec.ts` reaches it with
    `await window.__rbImport('/src/lib/premium.ts')` (the e2e hooks, `src/testHooks.ts`, #960). The store release script must
    fail if `VITE_PREMIUM_UNLOCKED`, `VITE_DEV_TOOLS`, or `VITE_E2E_HOOKS` is set.
  - **Buying Premium (#105):** `src/lib/premiumStore.ts` is the only code that talks to the App
    Store, behind a small `PremiumStore` interface (`getPrice`, `purchase`, `restore`,
    `hasEntitlement`). On iOS it uses **`@capgo/native-purchases`** (StoreKit 2, maintained, Capacitor 8
    peer range, ships an SPM `Package.swift` so `cap sync ios` adds it to `CapApp-SPM`; picked over
    `cordova-plugin-purchase`, a Cordova-style wrapper that is much heavier, and over RevenueCat's
    plugin, which needs their service). The product is the non-consumable `VITE_IAP_PRODUCT_ID`
    (default `premium_unlock`, #31). **Google Play Billing (#199)** uses the same plugin and interface
    (`playBillingStore`; one plugin for both stores, so no second one; #455: a billing setup timeout throws `STORE_UNREACHABLE_MESSAGE`, the sheet's button reads "Connecting to Google Play…" while it waits, and a failure after the sheet closed shows as `premiumToast`): an `inapp` product, which
    Play refunds if it isn't acknowledged within 3 days. The plugin's own acknowledge is fire-and-forget
    and races its `endConnection` (#862), so `ownsPremiumOnPlay()` (every entitlement check: launch,
    Restore, return to the app, and right after `purchase()`) calls `acknowledgePurchase` itself and
    waits for any Premium purchase with `isAcknowledged === false`; a failure is logged as
    `premium.acknowledge` and never costs the entitlement. Only `purchaseState` PURCHASED counts as owned.
    **Promo codes (#506):** `playBillingStore.redeemUrl` (`https://play.google.com/redeem`, the only
    store with one) makes the Premium sheet and the Account sheet's Premium card show "Redeem a code" beside
    Restore Purchases while Premium is locked. Both render `components/PremiumUnlockActions.vue` (state and
    handlers in `lib/premiumUnlock.ts`, #531), so Unlock, Restore, and Redeem change in one place. It opens Play's own redeem screen (no code is typed into RepBunny, #343), and
    on returning to the app (`visibilitychange`) it runs `restorePremium()`, which also
    acknowledges a purchase made outside the app, then closes with a toast if it's owned. A
    pending purchase (cash methods) makes `purchase()` return `'pending'`: the sheet and Account say
    "Waiting for payment", nothing unlocks, and the launch re-check unlocks it once Play completes
    it. Not-found wording says "Google account" there. The browser gets an "unavailable" store:
    Unlock and Restore say "Premium isn't available on this build." (the personal build is already
    unlocked, never shows Unlock). Manual license-tester checks (purchase, pending, restore after
    reinstall on the Pixel) are on the human Play issue. `purchasePremium()` returns `'cancelled'` for a backed-out purchase (nothing
    shown) and throws a plain message on failure; `restorePremium()` returns false when this Apple ID
    has no purchase. StoreKit's verified current entitlements (`getPurchases` with
    `onlyCurrentEntitlements`, minus revoked) are the source of truth: `main.ts` calls
    `refreshPremiumEntitlement()` on launch, un-awaited, which overwrites the cached flag both ways
    on a verified answer and keeps it on any error (offline never removes Premium). The store price
    shows on the Unlock buttons once `loadPremiumPrice()` returns. e2e installs a fake with
    `setPremiumStore` (`e2e/local/premium-purchase.spec.ts`). The native build was not compiled in
    the Linux session that added it: the next Codemagic TestFlight build checks the plugin links, and
    a sandbox purchase and restore are tested on a real iPhone (#33, #223).
  - **Premium nudges (#114):** shown only when `showPremiumNudges` (local mode, no Premium):
    Templates' "N of 3 free templates" line, a Premium tag on the logger's Plates button, and a
    permanent Premium group in Account's menu (what's included from `PREMIUM_INCLUDES`, Unlock,
    and Restore Purchases; with Premium it thanks the user instead). The one-time "last free template" hint: the templates store calls
    `noteTemplateCreated` after each create, which marks it pending at the 3rd active template;
    Templates (on mount) and History's save confirmation call `claimLastTemplateHint`, which
    shows it once, never while a workout is in progress, and stays up until dismissed or reload.
    The one-time chart teaser (#115): `buildFinishRecap`'s `chartTeaser` (`findChartTeaser` in
    `src/lib/finishRecap.ts`) picks a weight lift now in its `CHART_TEASER_WORKOUTS` (5th) or
    later workout with at least two est. 1RM points (most sets today wins); the workouts store
    passes it to `claimChartTeaser`, which shows it once (not with `hasPremium('progress')`, so
    not during a progress trial pass). `src/components/PremiumChartTeaser.vue` draws that lift's
    real est. 1RM line blurred on the finish recap, below "Vs last time", with See Premium and
    Not now (mockup: `docs/design/issue-115-premium-teaser.html`, option A). Covered by
    `e2e/chart-teaser-unit.spec.ts` and `e2e/local/premium-chart-teaser.spec.ts`. Locked chart
    tabs and ranges already blur the user's own chart (#132 below).
    Nudge rules for later ones: nothing mid-workout but passive tags, one-time hints are
    triggered by the user and shown once, no launch pop-ups, badges, or countdowns, one tap
    dismisses, and the Premium sheet always says what stays free. One-time hint flags use the
    localStorage prefix `repbunny-premium-hint-`; `resetPremiumHints()` clears them (for the dev
    toggle, #113). Covered by `e2e/local/premium-nudges.spec.ts`.
  - **Lift progress analytics (#132):** free keeps the Lift progress list (sparklines, latest
    number), Muscle groups, Next time, PR celebrations, and each lift's chart on one plain metric
    per load type over 1M/3M (`FREE_PROGRESS_METRICS` / `FREE_PROGRESS_RANGES` in
    `src/lib/progressSeries.ts`: Heaviest for weight, Longest for timed, and the only metric of
    the other load types). Est. 1RM (and its help link), Volume, Farthest, 1Y, All, the
    best-reps table, and any metric added later are Premium (feature key `progress`). Locked tabs
    and ranges carry a small sparkle (`src/components/PremiumMark.vue`); picking one blurs the chart under
    `src/components/PremiumPreviewPanel.vue` (Keep it with Premium / Go back, which returns to the last free
    metric and range), and the table is a card that opens the same preview (`RepRecords.vue`'s
    `locked`). Without Premium the history screen opens on the free metric; losing Premium
    while on a locked view shows the preview. The Premium sheet sits at z-index 80 so it opens
    over the history overlay. Covered by `e2e/local/progress-premium.spec.ts`.
  - **Plateau calls (#133):** `flatSince` in `src/lib/plateau.ts` flags a lift as flat once it
    has 4+ sessions spanning 3+ weeks since its last strictly-better best on its default metric
    (timed lifts skipped; a new best clears it). Everyone sees the "Flat since <date>" chip on its
    Lift progress row (`LiftProgress.vue`, `LiftRow.flatSince`); with Premium the chip opens the
    lift's chart, whose card adds the date and one load-type tip (`plateauTip`), and without it
    the chip opens a `PremiumPreviewPanel` under the row. Covered by `e2e/plateau-unit.spec.ts`
    and `e2e/local/plateau.spec.ts`.
  - **Starter programs (#148):** Templates ends with a Starter programs section
    (`src/components/StarterPrograms.vue`, data in `src/lib/starterPrograms.ts`), grouped by
    equipment (`STARTER_GROUPS`, #167). Machines, for beginners at a big gym: machine push / pull
    / legs (3 templates, 3 days) and a machine 6-day split (5 templates: push, quads, cardio &
    core twice, pull, glutes & hams). Free weights: beginner full body (2 templates, A/B over 3
    days), upper / lower (2 templates, 4 days), push / pull / legs (3 templates, 3 or 6 days), and
    a body-part split (5 templates, 5 days). Dumbbells only, for a home gym: dumbbell full body (2
    templates, A/B). All are library exercises in the 8 to 12 range; a cardio block is one set
    with a `duration` shown in place of its set count. The machine 6-day split is adapted from a
    plan seen on YouTube: a list of exercises is fine to reuse, but the app never names or credits
    the creator and its copy is ours. `e2e/local/starter-programs.spec.ts` checks every program's
    lifts exist and fit its group's equipment. Each opens a
    description sheet (who it's for, a sample week, every template's lifts and sets). Add calls
    `templates.addStarterProgram`: a lift reuses the user's exercise for that library
    entry (by `library_id`, then by name or alias) untouched, or adds it from the library with a
    rest time (`starterRestSeconds`: 150s barbell, 90s small-muscle moves, 60s timed, 120s
    otherwise); templates are named like "PPL: Push" (" (2)" when taken), get an explicit
    category, and are then ordinary templates with nothing linking them to the program. Next-set
    targets are on for new exercises by default, and nothing turns them off. Programs are free
    (#209), and their templates count toward `FREE_TEMPLATE_LIMIT` like any other: without
    Premium, Add first checks `templates.canAddProgram` (all or nothing, never a partial add) and
    opens the `templates` Premium sheet when the program won't fit next to the user's own
    templates. A program with more templates than the limit (`programNeedsPremium`: the machine
    6-day split and the body-part split) moves, without Premium, out of its group into a closed
    "Bigger programs" accordion at the end, each row labeled with its group (#1012). Also without
    Premium (#1012), a meter at the top counts the free routines used, each free program's row
    ends with Fits or No room, and a sheet that won't fit shows a note (how many routines it adds,
    how many to archive) with See Premium in place of Add, opening the `templates` sheet (or
    `programs` for a bigger program; not a trial-pass area), plus a Manage my routines link back
    up to the list. With Premium there's no meter, label, or accordion. Templates already added
    stay if Premium ends. Covered by `e2e/local/starter-programs.spec.ts`.
  - **Next-set targets (#140):** `buildSmartTarget` in `src/lib/smartTarget.ts` starts from the
    free Next time target (`src/lib/repRecords.ts`) and reacts to the RPE of the last session's top
    set (heaviest, most reps on a tie): 7 or less adds 2 reps or jumps 2 steps, 7.5 to 9 and no RPE
    keep the usual step, 9.5 to 10 holds the weight for 1 more rep until the top of the 8 to 12 range, then takes the usual step up (so logging every set at RPE 10 still progresses). Steps are the plates rule for a
    barbell, 5 lb / 2.5 kg otherwise, and one level for `level` exercises. Its "Why this?" lines
    give last time, the RPE rule, and Epley's est. 1RM with the target's share of it. Only logged
    sets go in, never demographics. With Premium the logger puts a target on every open row
    (`WorkoutLogger.vue`, history from `workouts.fetchTargetHistory`, which leaves out the active
    workout); a tap fills that row, rows still pre-fill from last time, and logged sets are never
    changed. The history screen's Next time card shows the same target with a "Why this?" expander
    (`RepRecords.vue`'s `smart`); free keeps the plain card and no logger targets. The edit sheet's
    "Next-set targets" switch turns it off per exercise, kept per device in localStorage
    `repbunny-targets-off`. Covered by `e2e/smart-target-unit.spec.ts` and
    `e2e/local/smart-target.spec.ts`.
  - **Per-set targets (#160):** `buildSetTargets` (same file) gives each open row its own
    "Target 185 lb × 7" chip under its inputs, with a "Why?" expander per row (mockup:
    `docs/design/issue-160-per-set-targets.html`, option B). The rows already fill the 375px
    width, which is why the chip takes its own line. Set 1 gets `buildSmartTarget`'s target and
    each later set works from the same set position last session with the same RPE bands (no
    matching set: same as the row before). A stall (#141) holds every row to the session target.
    Today's logged sets don't move the targets: an earlier version made every open row follow the
    newest logged set, which flattened drop and back-off patterns (170 / 160 / 150 all became
    170), so the user chose last time only. The stall card above the rows shows only until the
    exercise's first set today.
  - **Stalls and lighter weeks (#141):** `buildSmartTarget`'s optional `stall` input takes the
    lift's `flatSince` (#133) and its lighter-week choice. A session misses when no set meets the
    target the sessions before it set (or goes heavier within the rep range); misses are counted
    newest back. Two in a row hold the top set's weight for 1 more rep ("Same weight, try for one
    more rep."). Three, or a flat lift, offer a lighter week: about 10% off on the plate step
    (always at least one step lighter), same reps. The logger's stall card above the set rows
    (`target-hint`, the stall note plus the offer) and the Next time card show
    **Take it** / **Not now**. A choice is kept per device in localStorage `repbunny-lighter-week`
    (per exercise, keyed to the newest session's date). Accepted: that session targets the
    lighter weight, the one after goes back to the target from before it, and only sessions after
    the lighter session count toward a new stall (a flat call waits 3 of them too). Dismissed: the
    normal (held) target stays, and the offer comes back after the next session if the lift is
    still stalled. Like
    Targets off, backups don't include it. Covered by `e2e/smart-target-unit.spec.ts` and
    `e2e/local/lighter-week.spec.ts`.
  - **Warm-ups and starting weights (#142):** both Premium (`targets`) and hidden by the
    exercise's Targets off. `src/lib/warmup.ts` builds a warm-up ladder up to the first open
    row's target (or the starting weight), for barbell (`usesBarbell`) or dumbbell lifts (library
    `equipmentType`): bar x 10, then 40% x 5, 60% x 3, 80% x 1 (dumbbells 40% x 10, 60% x 5,
    80% x 2), each rounded to the nearest loadable weight (bar plus pairs of the gym's smallest
    plate, else 5 lb / 2.5 kg), skipping lines at or above the target or not above the line
    before. The logger shows it collapsed (`Warm-up`) above the set rows until the exercise's
    first set today; a barbell line opens the plate calculator at that weight, and its Use just
    closes (warm-ups are never logged). `src/lib/startingWeight.ts` picks a starting weight
    while a weight lift has no past sets and none today: (1) a related lift (other weight
    exercises with the same `muscle_group` and equipment, best Epley est. 1RM; the lightest one,
    times 0.6, rounded down); (2) with no related lift, the Beginner mark of #136's
    `STRENGTH_LIFTS` standards for that lift times the latest weigh-in, times 0.65 (the only place sex
    or body weight feeds a target); (3) a test set ("about 12 times"). If (2) applies but
    `repbunny-strength-sex` is unanswered, the logger asks once with `StrengthSexPicker`
    (localStorage `repbunny-start-sex-asked` keeps it to once per device). Covered by
    `e2e/starting-weight-unit.spec.ts` and `e2e/local/starting-weight.spec.ts`.
  - **Weekly line and monthly report (#134):** the Progress hub's free line, "This week: N
    workouts, N sets, N records" (Sunday-start week; records use the milestones replay,
    `recordSets` in `src/lib/milestones.ts`). Once there's history from before this month, a
    "<Month> report" tile opens `/progress/report` (`src/components/ProgressReport.vue`, query
    `?month=YYYY-MM` or `?year=YYYY`, only finished periods; logic in `src/lib/progressReport.ts`):
    workouts, sets, volume in the profile unit, time on timed sets (workouts store no end time, so
    there's no session duration), and records, each against the period before in neutral text;
    then the records list, the top 3 est. 1RM gains (period best over the best from all earlier
    history, weight lifts only), and the 3 most-trained muscles (Muscle groups' half-credit rule).
    Previous/next arrows reach earlier months; a Month/Year switch offers the year recap once
    there's history before this year, and the tile mentions it through January. Comparisons hide
    when nothing was logged before the period. Premium (feature key `reports`); without it the
    report is blurred under `PremiumPreviewPanel` and Go back returns to Progress. Covered by
    `e2e/local/progress-report.spec.ts`.
  - **Share as PDF (#152, Premium, feature key `reports`):** a "Share as PDF" button under the
    report's title opens `src/components/ShareReportSheet.vue`: the report's own month or year,
    the last 4 weeks, the last 3 months, or custom first and last days (both inclusive). `buildCoachReport`
    (`src/lib/coachReport.ts`, pure) gives workouts, sets, workouts per week, one row per
    exercise (sessions, best set, est. 1RM from the best set of the first and of the last
    session in the range, weight lifts only), sets per muscle group (half-credit rule), the
    first and last weigh-in in the range, and records (the milestones replay over all history,
    filtered to the range). `src/lib/reportPdf.ts` lays it out with jsPDF on the device: light
    layout whatever the theme, US Letter, built-in Helvetica, uncompressed so the text stays
    searchable, small RepBunny footer with page numbers. jsPDF over a print stylesheet because
    `window.print()` does nothing in the Android WebView and can't produce a file to share; it's
    a lazy import, and its unused html2canvas/DOMPurify chunks are left out of the precache.
    The file goes through `deliverFile` (`src/lib/backup.ts`), same as backups. Without
    Premium the sheet is a preview: ranges work, and Keep it with Premium / Go back replaces the
    share button. Covered by `e2e/coach-report-unit.spec.ts` and
    `e2e/local/share-report-pdf.spec.ts`. An off-by-default "Include the sets behind each number"
    toggle (#583) passes `{ withSets: true }`, which keeps each lift's first and last source set and
    the set each record beat, and adds a "Where the numbers come from" section.
  - **Template progress (#157):** the Progress hub's Template progress tile opens
    `/progress/templates` (`src/components/TemplateProgress.vue`), one row per template with a
    finished session, and `/progress/templates/:id` (`src/components/TemplateProgressDetail.vue`),
    total volume per session on `ProgressChart` with the usual range pills (3M default). Logic is
    `src/lib/templateProgress.ts`: only workouts with a `template_id` count (progress rows carry
    it from both adapters), the workout in progress is left out, and volume follows
    `src/lib/volume.ts` in the profile unit. A session with no volume (timed or level only) is
    left off the chart. Below the chart, the latest session (or the tapped point, via the
    chart's `select` event) lists each exercise's top set. A session with a story (#158) gets a marker, and
    its story shows in that card. **Note markers (#168,** mockup
    `docs/design/issue-168-note-markers.html`, option B**):** a session whose `workouts.notes` isn't
    blank gets a marker too, and the note leads its session card (`role="note"`, "Workout note").
    The workouts store loads notes by workout id (`fetchWorkoutNotes`, `listWorkoutNotes` in both
    adapters; `updateWorkoutNotes` keeps it current). One badge per point: a lavender pencil for a
    note alone (`data-testid="note-marker"`), the story bubble with a pink dot for both
    (`story-marker`, `data-note`). When points sit under 18 viewBox units apart, every badge on
    any `ProgressChart` drops to a 3px pip. Older workouts from before #158 aren't checked against
    the current template for skips, since the template may have changed. Test:
    `e2e/local/template-note-markers.spec.ts`. Premium (feature key `progress`):
    free keeps each row's latest total, and the chart is blurred under `PremiumPreviewPanel`
    (Go back returns to the list); Premium adds the rows' sparkline and change pill. Covered
    by `e2e/template-progress-unit.spec.ts`, `e2e/local/template-progress.spec.ts`, and
    `e2e/local/template-progress-sessions.spec.ts`.
  - **Training calendar (#137):** the Progress hub's Training calendar tile (total workouts in 12
    months and the last 8 weeks in miniature) opens `/progress/calendar`
    (`src/components/TrainingCalendar.vue`, logic in `src/lib/trainingCalendar.ts`; mockup
    `docs/design/issue-137-training-calendar.html`, option B). 53 Sunday-start weeks ending with
    this one, one square per day shaded by sets logged in 4 steps (1 to 9, 10 to 19, 20 to 29,
    30+), mixed from `--accent` and `--surface` so every theme works. Today is outlined; months
    label the column their 1st falls in. The grid scrolls sideways on its own and opens scrolled
    to today; the page never does (checked at 320px). Below it, plain totals for workouts and
    training days, with no streaks (the roadmap rules them out). The workout in progress is left
    out. Tapping any past day opens a day summary sheet (#491, `daySummary()`; mockup
    `docs/design/issue-491-day-summary.html`, option A): the day's sets, volume (in the
    report's unit), time (summed from workouts' finish times, #266, so a dash where there are
    none), the records it set (`recordSets` over all history), and each workout as a link to the
    Workout log at `?workout=<id>`, which expands and scrolls to it (`WorkoutHistory.vue`) once
    the log's own fetch has finished, so cached history from an earlier visit can't scroll a
    timeline the refetch then replaces (#179). A day with nothing logged says Rest day. Premium
    (feature key `progress`, so a Lift progress trial opens it too); without it the screen is
    blurred under `PremiumPreviewPanel` and Go back returns to Progress. Covered by
    `e2e/training-calendar-unit.spec.ts` and `e2e/local/training-calendar.spec.ts`.
  - **How did it feel? (#149):** the finish recap has an optional card with three tags, sleep
    (under 6 h / 6 to 8 h / over 8 h), energy, and stress (low / OK / high), one tap each,
    tapping again clears (`src/components/WorkoutFeelPicker.vue`). Each tap saves at once
    (`workouts.updateWorkoutFeel`), not on Done; the Workout log shows them under the notes with
    "Add/Edit how it felt". They're `workouts.sleep` / `energy` / `stress`, so backups, restores,
    and merges carry them, and the CSV export adds them to each set's row. SQLite has them from
    migration 5, and the live database since 2026-10-06 (#170; `restore_my_data()` picks them
    up through `jsonb_populate_record`).
    The Progress hub's **What helps you lift** card (`src/components/FeelInsightsCard.vue`,
    after Strength levels; logic `buildFeelInsights`) shows once a finished workout with sets is
    tagged; below 10 tagged it counts toward 10. From 10, per tag it compares the best and worst
    option with 3+ workouts each, on records a workout (the milestones replay, all history),
    then est. 1RM change against each lift's last session (weight lifts, Epley), then sets a
    workout, and shows the first that clears its threshold (records 0.5 apart and 1.5x, 1.5
    points, or 2 sets and 1.2x), with both sample sizes and "Patterns, not proof." At most one
    finding per tag. Premium (feature key `progress`); free gets a Preview button that shows
    sample findings, never the user's, under `PremiumPreviewPanel` (Go back closes it). Covered
    by `e2e/workout-feel-unit.spec.ts`, `e2e/local/workout-feel.spec.ts`, and (both data paths'
    feel columns) `e2e/contract/data-contract.spec.ts`.
  - **Strength levels (#136):** the Progress hub's Strength levels tile opens
    `/progress/strength` (`src/components/StrengthLevels.vue`, logic in `src/lib/strengthLevels.ts`).
    `STRENGTH_LIFTS` lists 28 barbell, dumbbell, machine, and bodyweight lifts, each with its
    library ids, a movement group (squat, press, hinge, overhead, row, pull), and its own
    standards row per sex. An exercise counts by its `library_id`, or the library entry its name
    matches; weight exercises match the barbell/dumbbell/machine lifts and bodyweight or assisted
    ones the bodyweight lifts (pull-up, chin-up, dip). Each lift's best Epley est. 1RM (1 to 12
    reps, converted to the weigh-in's unit) over the latest weigh-in is rated Beginner to Elite.
    Dumbbell marks are per dumbbell; bodyweight lifts add the body weight on file at the set
    (`bodyWeightAt`) to the added load, or subtract the assist; machine rows carry a "machines
    vary" note. The standards are RepBunny's own round numbers: the published tables checked
    (Strength Level, ExRx, Symmetric Strength) are all rights reserved, so none is copied (the
    female rows of the later variations are the male row times 0.72 lower body / 0.6 upper body).
    "To next" rounds up to 5 lb / 2.5 kg. Overall takes each movement group's best table position
    (tier plus progress to the next mark, 0 to 4), averages those, and shows a level and a 0 to
    100 score, so several variations of one movement don't tilt it. One-sided versions of
    two-sided machines (a name with single/one/1 leg or arm, or "unilateral": leg press, chest
    press, shoulder press machine, seated row, lat pulldown) count as the two-sided lift with the
    est. 1RM divided by `ONE_SIDE_SHARE` (0.55, the bilateral-deficit rule of thumb); the row says
    so, and its "to next" is per side. Other one-sided lifts (single-leg RDL) aren't rated;
    dumbbell lifts are per hand already. Sex is asked once, on the screen the first time
    with Premium (`src/components/StrengthSexPicker.vue`, shared with Account > Preferences > Strength
    standards, saying why and what skipping turns off); kept per device in localStorage
    `repbunny-strength-sex` (`male`, `female`, `unspecified`), not in backups, cleared by Erase
    all data. "Prefer not to say" or no weigh-in shows a prompt instead. Premium (feature key
    `strength`, also a trial-pass area); without it a blurred sample, never the user's numbers,
    sits under `PremiumPreviewPanel` and the question isn't asked. Covered by
    `e2e/strength-levels-unit.spec.ts` and `e2e/local/strength-levels.spec.ts`.
  - **Themes (#107, #118):** Account > Preferences > Theme (`src/components/ThemeSheet.vue`,
    state in `src/lib/theme.ts`, rules and art slots in `docs/brand-identity.md`). A theme is a
    full palette plus the outfit it wears; the Outfit (#146) and the Full/Minimal mascot combine
    with any theme. Saved per device (localStorage `repbunny-theme`, `repbunny-theme-outfit`, and
    `repbunny-theme-mascot`; Erase all data resets
    them; the #107 colorway key is dropped on load). `installTheme()` (main.ts) sets every color
    token inline on `<html>`, plus `color-scheme`, `--shade` (what shadows darken toward: black on
    dark themes, a soft mauve on light ones, #122, unless the theme sets its own `shade`, #127), `data-theme`, `data-mascot`, the
    `theme-color` meta, and the decoration attributes `data-confetti` / `data-corner` (#124). Without Premium a pick is a preview (`themePreview`) with a "Keep it with
    Premium" / "Go back" bar; leaving the screen ends it, and unlocking while previewing saves
    it. Without Premium the saved choice isn't applied, so a lost unlock falls back to Classic +
    Match theme + Full. **Outfits (#146, mockup `docs/design/issue-146-bunny-outfits.html`,
    option B):** bunny art sets live in `OUTFITS`, and each theme names the one it wears
    (`outfit`). The Outfit group under Mascot offers Match theme (default), Holidays (by month from
    `HOLIDAY_OUTFITS`: Valentine's Day in February (#969), Easter in the month Easter Sunday falls in (#970, `easterMonth()`, March or April), Halloween in October, Autumn in November, Christmas in December (#968), Classic otherwise; the month
    refreshes when the app returns to the foreground), and each fixed outfit. `themeArt()` and
    `artFor()` resolve through `resolveOutfit()`, so the theme cards and previews follow the pick.
    Each theme is a card with a mini phone drawn in that theme (`themeStyle`, `artFor`), and
    Preview opens `src/components/ThemePreview.vue` full screen (#119): Home, rest timer, and record
    mocks in that theme, ending in Keep it with Premium (free) or Use this theme. Covered by
    `e2e/local/themes.spec.ts`.
  - **App icons (#145):** the Theme screen ends with an App icon group (mockup
    `docs/design/issue-145-app-icons.html`, option A): Default, Classic, and one home-screen icon
    per theme in a 4-column grid, its own pick (not tied to the theme), Default by default. Native apps only
    (`appIconAvailable` in `src/lib/appIcon.ts`, true in local mode); the PWA never shows it. The
    icons are `public/icon-512.png` recolored from each theme's tokens by
    `node scripts/generate-theme-icons.mjs` (picker images in `public/app-icons/`, Android
    launcher sets `ic_launcher_<id>` in both flavors' res; since #863 each theme icon but Classic
    sits on background art, drawn like the seasonal ones by `scripts/lib/art-icon.mjs`; see
    `docs/brand-identity.md`). On
    Android each icon is an `activity-alias` of MainActivity named `Icon<PascalCase id>` in
    `AndroidManifest.xml` (MainActivity itself has no launcher filter any more), and
    `AppIconPlugin.java` enables the picked alias and disables the rest with `DONT_KILL_APP`; it
    finds the aliases by that prefix, so a new theme only needs its alias added. The phone keeps the
    icon itself, so losing Premium or a trial keeps it and Erase all data doesn't reset it; only
    picking a new one needs `hasPremium('themes')`, and Default, Classic, or the icon in use are
    always free to pick (`FREE_ICONS`). Without it a tap shows a home-screen mock with Keep it with Premium / Go back
    (unlocking switches to it). **iPhone (#169):** `ios/App/App/AppIconPlugin.swift` (registered in
    `MainViewController.swift`) implements the same `AppIcon` contract with
    `setAlternateIconName` (nil for Default, id `classic`) and `alternateIconName`, rejecting when
    `supportsAlternateIcons` is false; iOS shows its own "You have changed the icon" alert on every
    switch. Each id but Default's is an alternate icon set `Assets.xcassets/<id>.appiconset` (a flat
    1024px RGB PNG written by the theme and seasonal scripts through `scripts/lib/ios-icon.mjs`)
    and is listed in `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` in both App build
    configurations of `project.pbxproj`, by hand. That build setting was picked over
    `CFBundleAlternateIcons` in `Info.plist` because Xcode then compiles the icon sets and writes
    the plist entries itself, so the names live in one place and no loose PNGs ship in the bundle.
    `e2e/local/app-icon.spec.ts` checks every id has its set and both lists name it. Browser
    local mode uses `src/lib/appIconWeb.ts` (localStorage `app-icon-web`). Covered by
    `e2e/local/app-icon.spec.ts`; the launcher itself is checked by hand on a device.
    Each grid is `src/components/AppIconGrid.vue`. **Seasonal icons (#841):** a second
    grid, Seasonal icons, holds `SEASONAL_ICONS` (`season-autumn`, `season-halloween`,
    `season-snow-globe`, `season-christmas`), made by `node scripts/generate-seasonal-icons.mjs`
    (WebP; adaptive icons with the art as the background layer) and switched by the same
    plugin through `IconSeason<Name>` aliases (on iPhone, alternate icon sets like the themes').
    Premium the same way; never switched by date. A store release can instead ship a seasonal
    icon as the build's default (#857, Releasing > Seasonal default icon); the Default tile then
    shows that icon. **Default and Classic (#861):** Default (id `classic`, the primary icon: the
    `IconClassic` alias on Android, nil on iPhone) is whatever the build ships, so its tile says
    "Changes with the seasons". Classic (id `rose`) is an alternate icon with the rose art all
    year: the `IconRose` alias and `rose.appiconset`, written from the classic theme by
    `generate-theme-icons.mjs` (its picker image is `classic.png`). The Halloween, Autumn,
    Christmas (#968), Valentine's Day (#969), and Easter (#970) themes have no flat icon (the seasonal icons stand in; Valentine's Day and Easter have none yet). `loadAppIcon()` runs at
    launch (`src/main.ts`) and moves a phone still on `halloween` or `autumn` to the seasonal one.
    The iPhone sets are gone (a missing alternate set just shows the primary icon until the
    move). On Android the `IconHalloween` and `IconAutumn` aliases stay, pointed at the seasonal
    art, because a phone whose enabled alias vanishes has no launcher entry; don't remove them.
  - **Trial passes (#155):** free users (`showPremiumNudges`) earn a pass at the `workouts-10`,
    `workouts-50`, `workouts-150`, and `strongWeeks-12` milestone tiers (`TRIAL_PASS_TIERS` in
    `src/lib/trialPass.ts`). A tier grants once, when a finish reaches it
    (`findFinishMilestones`) or when first-run history already has (`initSeenTiers(counts,
    true)`, whose note then says "and earned a Premium trial pass"); one reached with Premium
    never grants. A pass opens one area for 7 days: themes, progress, targets, reports, plates,
    swap, or strength (not templates, which would outlast it). Gates that a pass can open check
    `hasPremium(feature)` in `src/lib/premium.ts` (Premium, or that area's running trial)
    instead of `isPremium`. One runs at a time and unused passes wait. The recap's milestone
    card offers "Pick a Premium feature to try", the Milestones screen has a Premium trial card,
    and both open `src/components/TrialPassSheet.vue` (rendered once in App.vue, `openTrialSheet`).
    A pick turns the sheet into an "X is on" confirmation that says where the area lives, and the
    Milestones card repeats it while the trial runs (#489, `TRIAL_USE` in `src/lib/trialUse.ts`):
    a button to the area's screen (Themes opens the Theme screen via `openAccountSheet('theme')`),
    or a pointer for in-workout areas, plus its repbunny.app guide. In the
    trialed area, `src/components/TrialNote.vue` shows "Trial: N days left" with Keep it with Premium. When it
    ends the area falls back like a lost unlock (a theme pick stays saved but isn't applied),
    and `src/components/TrialEndBanner.vue` on Home, outside a workout, says so once. Days count by the device
    clock (`trialNow`, ticked each minute and on return to the foreground), with no tamper
    checks. State is localStorage `repbunny-trial-passes` (`{ granted, trials, endNoted }`);
    Erase all data clears it, and a backup with preferences carries it as `trial_passes`, which
    a restore merges in (`mergeTrialStates`, only adds). Covered by
    `e2e/trial-pass-unit.spec.ts` and `e2e/local/trial-pass.spec.ts`.
    **Setup Themes trial (#1002):** setup step 2 (`src/components/SetupLookStep.vue`) shows every
    theme, and a free user's Premium pick there is a preview until setup closes, when
    `settleSetupTheme` (`src/lib/theme.ts`) starts a one-time Themes trial (`startSetupThemeTrial`:
    a trial entry marked `setup: true` with its `theme`, which uses no pass). It doesn't start
    while another trial runs or once one was used (`setupTrialUsed`); then the preview just ends.
    Its end banner names the theme and adds Change theme. Covered by
    `e2e/local/setup-theme-trial.spec.ts`.
  - **Seeing the free version (#113):** in the browser, `npm run dev`; on a
    device, the Android `store` flavor; and in dev builds and the personal Android build (#784), local mode's Account > Preferences has
    a **Premium (dev)** switch (`setDevPremium`) and a **Reset Premium hints (dev)** button
    (`resetPremiumHints`). Those rows live in `DevPremiumRows.vue`, which `AccountSheet.vue`
    loads only behind `import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === 'true'`, so store
    builds never include it (`e2e/build/no-dev-rows-unit.spec.ts` greps a production build for
    "Premium (dev)"). Keep them out of the
    AccountSheet template itself: Vue reads script variables there through `unref()`, which stops
    the minifier from dropping a dead `v-if` branch. Covered by
    `e2e/local/premium-dev-toggle.spec.ts` and, with the personal build's flags (Premium by
    default, then off and on), `e2e/personal/premium-switch.spec.ts`.
  - **Kept after the Play launch** (2026-11-03): the owner tests merged changes in the personal
    build before they go into a store release (`docs/backlog.md` > Owner check), so it stays
    installed alongside the store app.
- **Play releases (#196):** the store flavor ships to Google Play as a signed Android App Bundle.
  Play App Signing holds the real app signing key; we sign uploads with a separate *upload key*.
  - **Upload key:** `scripts/New-StoreUploadKey.ps1` (run once by the owner) creates
    `%USERPROFILE%\.android-keys\repbunny-upload.jks` (alias `repbunny-upload`, one random
    password for store and key), adds `ANDROID_STORE_KEYSTORE`, `_KEYSTORE_PASSWORD`,
    `_KEY_ALIAS`, `_KEY_PASSWORD` to `.env.local`, and sets the GitHub secrets
    `ANDROID_STORE_KEYSTORE_BASE64` and `ANDROID_STORE_KEYSTORE_PASSWORD`. Backups: Proton Pass
    Login item `RepBunny Android upload key (Play)` (username `repbunny-upload`) and
    `repbunny-upload.jks` in the Google Drive folder `RepBunny backups`. Gradle reads the key from
    the environment only; without it, store release builds come out unsigned. A lost upload key
    isn't fatal (Play Console can reset it after a support request), but it blocks updates until then.
  - **Build:** `scripts/Build-StoreAndroid.ps1 [-VersionCode N] [-VersionName X]` refuses to run
    if `VITE_PREMIUM_UNLOCKED`, `VITE_DEV_TOOLS`, or `VITE_E2E_HOOKS` is set in the environment or any `.env` file Vite reads for a
    production build. It then runs `npm run android:sync` and `bundleStoreRelease` on JDK 21,
    checks the bundle is signed (`jarsigner -verify`), and copies it to
    `android/app/build/outputs/bundle/storeRelease/repbunny-<versionName>-<versionCode>.aab`.
  - **Versioning:** `versionCode` is the minutes since 2026-01-01 UTC at build time, so it only
    goes up whether the run was manual, a tag push, or called from Cut release. (It used to be the
    run number, but a called workflow gets the caller's counter, and Cut release's first run
    collided with build 1.) It's separate from the personal flavor's tag series (a different app
    ID, and never on Play). Play shows it in parentheses after the version, like `1.1.0 (412345)`,
    and in App bundle explorer. Local builds default
    to 1 and are for checking only. `versionName` defaults to the iOS project's `MARKETING_VERSION`,
    so both stores show the same version. Bump both together. A `store/v*` tag build passes the
    tag's version as `-VersionName` instead (see Releasing below).
  - **Upload:** `.github/workflows/release-play.yml`, started by a `store/v*` tag, called by Cut
    release with its tag (`workflow_call`, #219), or run by hand (Actions > Release to Google
    Play). Manual inputs are the track (`internal` by default, or `alpha`, which is Play's closed
    testing track), the status, and whether to upload at all. A tag run (pushed or called) has no
    inputs and uses `alpha` (testers only, #219), `draft`, and upload on; switch the tag default
    (`STATUS` in the workflow) to `completed` once Google has reviewed the first release. It always keeps the
    bundle as a 30-day artifact. Uploading uses
    [`r0adkll/upload-google-play`](https://github.com/r0adkll/upload-google-play) with the
    `PLAY_SERVICE_ACCOUNT_JSON` secret: the service account `play-upload` in the Google Cloud
    project `repbunny-play`, with the Play Android Developer API enabled and release permissions
    on RepBunny in Play Console. We chose the action over Gradle Play Publisher because upload stays
    a CI concern and the Gradle build (and the personal flavor) gains no plugin or credentials.
  - **First upload:** Google's API can't create an app's first release, so the very first bundle
    goes up by hand. Run the workflow with "upload" unticked, download the artifact, and upload it
    in Play Console > Test and release > Internal testing. Until Google reviews the app's first
    release, the API accepts only `draft` releases (the default status). Roll them out from Play
    Console, and switch to `completed` after that.
- **Releasing (#215):** committing to `main` doesn't start a store build; pushing a version tag
  does, so the only manual step is deciding when to release.
  - **Sprint review first (#606):** `/sprint-review` in a Claude session (or Actions > **Sprint
    review** > Run workflow) builds a video of
    the clips for every change since the last `store/v*` tag and opens a `Sprint review: v<X.Y.Z>
    candidate` issue. One comment reviews it: "looks good", or what the owner doesn't like, and
    anything not mentioned counts as good (#664; `docs/architecture/site-and-tools.md` > Demo
    videos). `/release` shows how many are accepted but doesn't wait on it.
  - **From the phone (#219):** GitHub app > the repo > Actions > **Cut release** > Run workflow,
    on `main`. Pick a bump (`patch` by default, `minor`, `major`) or type an exact version, and
    the default icon (Seasonal default icon below).
    `.github/workflows/cut-release.yml` runs `scripts/next-store-version.mjs`, which reads the
    latest `store/v*` tag and computes the next one (an exact version must be above it), and
    refuses if `main`'s HEAD already has a `store/v*` tag. It first runs the full e2e suite on that
    commit on a hosted runner (`.github/workflows/e2e.yml`, #677); red means no tag and no builds, and the run has the
    Playwright report attached (`docs/architecture/commit-policy.md` > Release gate). It then tags that commit, pushes the tag, and
    then calls `release-play.yml` itself, because a tag pushed with the workflow's `GITHUB_TOKEN`
    doesn't start other workflows. Codemagic still starts from the tag through its GitHub webhook,
    which fires for any push.
  - **From a Claude session (#221):** type `/release` (or `/release minor`, `/release major`,
    `/release 1.2.0`) in Claude Code, including Claude Code on the web or the Claude app with the
    laptop closed. A bare `/release` picks the bump itself: `minor` when any release note going
    out belongs to a `feature` or `ux-intensive` issue, otherwise `patch`, and says why; it never
    picks `major`. The phone's Run workflow form still defaults to `patch`, so pick `minor` there
    when features are going out. `.claude/skills/release/SKILL.md` fetches `main` and the tags, shows the version
    and the commits since the last `store/v*` tag, runs `gh workflow run "Cut release"`, watches the
    run, and reports the tag, the run link (the Play upload is its `play` job), the Codemagic builds
    page, and any failed job. Only the owner typing it starts it (`disable-model-invocation: true`).
    A cloud session needs the GitHub CLI and a token that can run workflows: in the cloud
    environment's setup script install `gh` (e.g. `apt-get install -y gh`), and add an environment
    variable `GH_TOKEN` holding a fine-grained token for this repo with **Actions: Read and write**
    and **Contents: Read** (no other permissions). Locally, the signed-in `gh` already has both.
  - **By hand:** `git tag store/v1.0.3 && git push origin store/v1.0.3` on a commit that's already on
    `main` still works the same way. The tag is `store/vMAJOR.MINOR.PATCH`, not `v*`, because the personal Obtainium
    build's nightly releases already own `v1.0.N` (`scripts/Release-PersonalAndroid.ps1`).
  - **What it starts:** Codemagic's `ios-testflight` (TestFlight build, marketing version from the
    tag) and GitHub's Release to Google Play (closed testing track `alpha`, draft, versionName from
    the tag, versionCode from the run number as always). Both refuse a malformed tag or one whose commit
    isn't on `main`. The nightly personal build (`release-android.yml`) is unaffected.
  - **Watch:** codemagic.io > RepBunny > Builds, and the repo's Actions tab > Release to Google
    Play (or Cut release). Then TestFlight in App Store Connect, and Play Console > Test and
    release > Closed testing for the draft.
  - **Seasonal default icon (#857):** Cut release's `default_icon` input (`classic` by default,
    or `season-autumn`, `season-halloween`, `season-snow-globe`, `season-christmas`) sets the
    home-screen icon the store builds ship with, for everyone who hasn't picked their own (an
    in-app pick is kept). The owner chose this over switching by date inside the app
    (2026-10-26): it's part of the build, so neither platform shows an alert or drops a shortcut.
    Cut release makes the tag annotated with a `default_icon: <id>` line, so both builds of the
    tag read the same value, and `scripts/apply-default-icon.mjs --tag <tag>` applies it before
    the build in `release-play.yml` and Codemagic: the Classic launcher alias and the application
    in `AndroidManifest.xml` point at `@mipmap/ic_launcher_<id>`, the season's 1024px PNG replaces
    `AppIcon.appiconset`'s, and `VITE_DEFAULT_APP_ICON` in `.env.production.local` makes the
    picker's Default tile show that icon (picking Default gives the build's default, so the tile
    shows what you'd get; Classic stays the rose icon, #861). `classic`, a lightweight tag (pushed by hand),
    or a manual run changes nothing. The checked-in icons stay Classic; the swap happens only in
    the CI checkout. Every release sets the icon, so pick the season's one each time, not only on
    the dates below. Yearly schedule (the owner has calendar reminders; `/release` picks by date):

    | Cut release around | `default_icon` | Live from |
    | --- | --- | --- |
    | Aug 27 | `season-autumn` | Sep 1 |
    | Sep 26 | `season-halloween` | Oct 1 |
    | Oct 27 | `season-autumn` | Nov 1 |
    | Nov 26 | `season-christmas` | Dec 1 |
    | Dec 15 (before Apple's holiday break) | `season-snow-globe` | Dec 26 |
    | Feb 24 | `classic` | Mar 1 |
  - **If Codemagic doesn't start on a tag:** turn on its GitHub webhook in the Codemagic app's
    settings (Webhooks), a one-time step.
  - **If the iPhone build fails at "Set up signing" or "Build ipa" (#951):** a provisioning or
    capability error ("requires a provisioning profile", "requires a provisioning profile with the
    iCloud feature") on a project that built before usually means Apple published an updated
    agreement that the owner hasn't accepted, which blocks Certificates, IDs & Profiles and
    uploads. Check for the banner in developer.apple.com and App Store Connect > Business first,
    accept the agreement, then delete the App Store profiles for `app.repbunny` and
    `app.repbunny.RestLive` (Profiles) and rebuild **from the tag**, not a branch (a branch keeps
    the Xcode project's version and skips the release notes). Apple posts these on no fixed
    schedule; `docs/expiry-register.md` lists it as a monthly owner check. Seen on the 1.7.0 build
    (2026-11-03).
  - **Testers only:** tag builds reach just the owner and designated testers for a smoke pass.
    Play: the closed testing track's tester list (Play Console). iPhone: internal TestFlight
    testers get every build without Beta App Review. An external tester group (`beta_groups` and
    `submit_to_testflight` in `codemagic.yaml`) is optional and only worth adding once TestFlight >
    Test Information is filled in. Adding the testers themselves is a human step.
  - **Release notes (#216):** `scripts/collect-release-notes.mjs` collects the
    release notes (`release-notes/`, via `loadReleaseNotes()`) with a build number above the previous `store/v*` tag's (by
    version) and up to the new tag's, newest first, as `•` lines. An item with `platforms` only
    goes to the stores it names (`['pwa']` goes to neither, `['android']` only to Play). The first
    store release has no earlier tag, so it gets one fixed launch note (`FIRST_RELEASE_NOTE`).
    Play's copy (`whatsnew/whatsnew-en-US`, passed as `whatsNewDirectory`) keeps whole lines up
    to 500 characters and ends with "...and more" if it dropped any. TestFlight's "What to Test"
    comes from `release_notes.json` at the repo root <!-- docs-refs: ignore -->, written by Codemagic's "Write release notes"
    step on tag builds (Codemagic only reads `.json` for App Store Connect; 4000 characters, no
    `<` or `>`). The App Store's "What's New" is set at submission, by hand, from the email.
  - **Testing email (#216):** after a tag run uploads to Play, the workflow emails a card
    (version, the notes per store, links to TestFlight, Play Console, the run, and the
    [QA procedure page](qa-procedure.md) with its Smoke filter, Release tab, and update test
    TC-UPG-001, and a **Check on iPhone** row listing the release's open `verify:iphone` issues
    to try on the TestFlight build before App Review, read with the job's `issues: read` token;
    `docs/backlog.md` > Owner check) through `scripts/Send-Notification.ps1`. Secrets: `GMAIL_SENDER_ADDRESS`,
    `GMAIL_APP_PASSWORD`, and `RELEASE_EMAIL_RECIPIENTS` (owner only for now). Unset secrets skip
    the email quietly, and a failed send doesn't fail the release. It goes out whether or not the
    Codemagic build has finished, so it says the TestFlight build "should appear once Codemagic
    finishes". Its last line says how to promote a clean build (Play Console's closed testing
    release to production, the TestFlight build to App Review); point it at the Promote release
    workflow once #220 adds it.
  - **Installing the build to smoke test (#803):** Cut release leaves a *draft* on closed testing,
    and a draft can't be installed from Play. Right after Cut release, run Release to Google Play on
    the same tag with track `internal`, then roll that draft out in Play Console > Test and release >
    Internal testing (the run's `draft` status can't be installed until it is rolled out), then update
    RepBunny from Play on the phone and smoke test that build. Fallback: Play Console > App bundle explorer > that version > Downloads > Signed,
    universal APK. The testing email's "Get it" row says the same.
  - **The flow:** run Cut release (or push the tag), run Release to Google Play on the same tag
    with track `internal` and roll that draft out in Internal testing, wait for the email, run the QA procedure's smoke pass (including the
    visual walkthrough, TC-ACCT-004) and Release
    tab on both builds, then roll the Play draft out (and promote it) in Play Console and submit
    in App Store Connect with the email's notes as What's New.
  - Agents never create or push release tags, and run Cut release only through `/release` typed
    by the owner (see Commit & push policy).
- **Status:** the native apps run local-only (SQLite on the device, no account) per #72. Restore,
  reset, and erase work on local data (#77); importing pilot history is #73.
- **Release order** (decided 2026-09-30): App Store first; Android stays off the market until a
  later Play Store launch, with the owner on the personal Obtainium build meanwhile. The PWA
  retires once both pilot users are on a native app (#37).
