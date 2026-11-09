# Architecture: Native apps: build, storage, notifications, widgets

> Part of the architecture reference; index at `docs/architecture.md`.

## Native apps

The paid iPhone and Android apps wrap this same Vue app with Capacitor 8 (#70). There's one
codebase: `npm run build` produces the `dist/` the PWA deploys, and `npx cap sync` copies it into
the native projects. `npm run android:sync` does both for Android.

- **Config:** `capacitor.config.ts`. `appId: app.repbunny` is the store build's permanent ID
  (it can't change once an App Store Connect or Play Console record exists, #29). The owner's
  personal Obtainium build (#68) gets `app.repbunny.personal` from a Gradle product flavor, not
  from this file.
- **`android/`** is the generated Android Studio project, committed. Copied web assets
  (`app/src/main/assets/public`) and generated config are gitignored, and so are keystores
  (`*.jks`, `*.keystore`, `keystore.properties`). Signing secrets live in `.env.local` only.
  `ios/` is the generated Xcode project, committed the same way (its own `.gitignore` covers the
  copied web assets and generated config).
- **Building** needs Android Studio (for the Android SDK) and a **JDK 21** (#71). Android Studio's
  bundled Java is 25, and the Gradle version Capacitor 8 generates (8.14.3) can't run on it
  ("Unsupported class file major version 69"). On the owner's machine a portable Temurin 21 lives
  at `%LOCALAPPDATA%\jdks\jdk-21.*`. Command line: set `JAVA_HOME` to it, then
  `npm run android:sync` and `android\gradlew assembleStoreDebug` (APK in
  `android/app/build/outputs/apk/store/debug/`; flavors below). In Android Studio, set Settings > Build, Execution, <!-- docs-refs: ignore -->
  Deployment > Build Tools > Gradle > Gradle JDK to the same folder. `android/local.properties`
  (gitignored) points Gradle at the SDK. The e2e suite and the PWA deploy don't depend on any of
  this.
- **iPhone builds (Codemagic):** there's no Mac, so the iPhone app is built in the cloud.
  `ios/` was generated on Windows with `npx cap add ios --packagemanager SPM` (Swift Package
  Manager, no CocoaPods; every plugin ships a `Package.swift`). `npm run ios:sync` builds and
  copies the web app in; `ios/App/CapApp-SPM/Package.swift` is rewritten by `cap sync`, so don't
  edit it. Hand changes to the project: iPhone only (`TARGETED_DEVICE_FAMILY = 1`), portrait
  and landscape (#880: the layout switches on `@media (orientation: landscape) and (max-height: 500px)`, with `--bottom-nav-height` and `--page-max` in `style.css` and side safe-area insets; the PWA manifest stays portrait), `ITSAppUsesNonExemptEncryption = false` in `Info.plist` (standard HTTPS only, so no
  export-compliance question per build), and a launch screen in the app's `#17111C`. The icon
  and launch images come from `public/icon-512.png` via `node scripts/generate-ios-icons.mjs`
  (RGB PNGs with no alpha channel, which App Store Connect requires); re-run it after changing
  that icon. The alternate theme and seasonal icon sets come from the theme and seasonal icon
  scripts (#169, Native releases > App icons). A sharper 1024px source would help the store icon (#35).
  - **`codemagic.yaml`** has one workflow, `ios-testflight`, started by a `store/v*` tag (see
    Releasing below) or by hand on codemagic.io. On a tag it first refuses one that isn't
    `store/vMAJOR.MINOR.PATCH` or whose commit isn't on `main`. It
    refuses to build if `VITE_PREMIUM_UNLOCKED` or `VITE_DEV_TOOLS` is set, runs `npm ci`, `npm run build`,
    `npx cap sync ios`, sets the build number to Codemagic's `$BUILD_NUMBER` (and, on a tag, the
    marketing version to the tag's version with `agvtool new-marketing-version`), builds a signed
    `.ipa`, and uploads it to App Store Connect, where internal TestFlight testers get it once Apple finishes processing. `submit_to_testflight` (Beta App Review for external testers) is off until TestFlight > Test Information is filled in. `MARKETING_VERSION` (1.0) lives in the Xcode project and is what a build started by hand ships.
  - **Codemagic setup (owner, in the Codemagic UI):** the App Store Connect API key is the
    Developer Portal integration named `App Manager` (the yaml refers to it by that name). The
    environment group `repbunny_web` still holds the retired PWA's public variables (the old
    backend's URL and key and `VITE_VAPID_PUBLIC_KEY`), which the app no longer reads (#938, #939;
    the owner clears them in #941). The same group holds
    `CERTIFICATE_PRIVATE_KEY`, a 2048-bit RSA key in PEM form (`ssh-keygen -t rsa -b 2048 -m PEM`)
    backed up in the owner's Proton Pass. The "Set up signing" step uses it with
    `app-store-connect fetch-signing-files app.repbunny --type IOS_APP_STORE --create`, which
    makes or reuses the Apple Distribution certificate and App Store profile through the API
    key, so nothing is uploaded under Code signing identities. A second call does the same for
    the Live Activity extension, `app.repbunny.RestLive` (#163). Losing the key only means
    making a new one; the next build creates a fresh certificate.
- **Data access (#74):** stores and components never query a database directly. Every read and
  write goes through the typed repos in `src/data/types.ts` (`profile`, `bodyWeight`,
  `exercises`, `templates`, `workouts`, `backup`), built in `src/data/index.ts`. The PWA's
  backend adapter, sign-in, and web push subscriptions were removed in #938 when the PWA
  retired (#937); the on-device adapter below is the only one.
- **On-device storage (#75):** `src/data/sqlite/` is the app's adapter.
  - `schema.ts` started as the retired Postgres schema without `user_id` or row-level security
    (removed in #940); the profile is one `settings` row (id 1). Booleans are 0/1, arrays are JSON text, and timestamps are always
    written as `toISOString()` so text order is time order. set_index is computed inside the
    insert, replacing the Postgres trigger.
  - **Migrations:** `MIGRATIONS` is a list of versions, each a list of statements; `schema_version`
    records how far a database has got, and `migrate()` applies the rest one transaction per
    version. Never edit a shipped version, add a new one. A database newer than the app is refused.
  - **Migration checks (#430):** inside each version's transaction, before it commits, `migrate()`
    checks `PRAGMA quick_check` and `PRAGMA foreign_key_check` (failing only on problems the
    version itself caused, so a device with an old quirk still opens), and that the row counts of
    workouts, sets, exercises, templates, and template exercises are unchanged. A version meant to
    change a count adds an entry to `EXPECTED_COUNTS` (keyed by version, given the counts before,
    returns the counts after). On the last version it also runs the app's launch reads through
    the real repos (`src/data/sqlite/essentialReads.ts`: settings, latest workout with sets, exercise list, one
    routine's exercises); they name the latest columns, so they can't run on the versions in
    between. Any failure, or a statement that throws, rolls that version back and throws
    `MigrationCheckError` with the check's name (`apply`, `quick-check`, `foreign-keys`,
    `row-counts`, `essential-reads`). `e2e/migration-safety-unit.spec.ts` upgrades a seeded user
    from every version (it loops over `MIGRATIONS`, so a new version is covered automatically) and
    injects faults.
  - **Restore points (#430):** `src/data/sqlite/restorePoints.ts` keeps gzipped full backups (the usual JSON file,
    so the normal restore reads them; on iOS 15.0 to 16.3, which has no `CompressionStream`, stored
    plain with a `json:` prefix, #438) in a separate database, `repbunny-restore-points`
    (`capacitor.ts` opens both), so damage to one can't take the other. One is saved right before
    `migrate()` applies anything to a database with data in it (`beforeUpgrade`, read straight from
    the old schema by `snapshotDatabase`, labeled "Before update to <app version>"), after every
    finished workout ("After <routine>", `stores/workouts.ts`), and before any restore ("Before a
    restore", `RestoreBackup.vue`). The newest 10 are kept. Saving one never blocks the update,
    finish, or restore it guards. Account > Your data > **Restore points** (`src/components/RestorePoints.vue`,
    local mode only) lists them and opens one in the restore preview.
  - **Automatic copy (#432, launch blocker; on by default since #874,** design
    `docs/design/issue-874-automatic-copy.html`): restore points stay on the phone, so a lost phone or a
    deleted app takes them too. `src/lib/backupFolder.ts` saves the usual backup JSON (plain, so
    Restore from a backup reads it) after every finished workout (`saveCopiesAfterFinish`, after the
    restore point): `RepBunny backup.json`, overwritten, plus `RepBunny backup <yyyy-MM-dd>.json` once
    a week, newest 4 kept. It's on with no question (`ensureAutoCopy`, which existing installs run on
    their first launch of that version too): with no folder picked, the plugin uses a default folder
    the app picks, the app's iCloud Drive container on iPhone (iCloud Drive › RepBunny in Files) and
    `Documents/RepBunny` on Android 10 and up. Only the person turns it off, behind the warning in
    `src/components/AutoCopyOffConfirm.vue` (`repbunny-backup-folder-off`), and Turn it on brings it
    back. A folder they pick takes priority, and **Use RepBunny's folder** goes back. The first save to
    a folder never overwrites a `RepBunny backup.json` already there (#871, the lost-phone case): it
    copies it to `RepBunny backup kept <yyyy-MM-dd>.json` (` 2`, ` 3` when taken), which the prune
    never deletes, and the Automatic copy sheet says what it was kept as. A backup with no workouts is
    never written, so a reset phone can't replace a good copy, and the setting lives under the
    `repbunny-` prefix, so Erase all data forgets the folder (and turns the default back on). A failed
    save never touches the workout: it marks the folder unreachable, which Account > Your data >
    **Automatic copy** (`src/components/AutoCopySheet.vue`, `src/components/AutoCopyRow.vue`) shows
    and the next finish recap notes once (`src/components/AutoCopyPrompt.vue`; there's no
    after-workout offer any more). Setup has a no-decision step for it (`src/components/SetupCopyStep.vue`,
    local mode only, so the phone's wizard has 4 steps). **Your copies** (`src/components/YourCopies.vue`,
    `listCopies`) lists the copies in the folder with date and workout count and hands one to the
    restore preview; the setup welcome (`src/components/SetupRestore.vue`) offers the latest one when
    the default folder already holds copies (a new iPhone, or a reinstall), or **Find my copies**, which
    opens the folder picker at that folder and keeps the pick as the copy's folder (Android's new
    install can't see the old one's MediaStore files until the person points at them).
    The folder access is the app's own `BackupFolder` plugin. Android's
    `android/app/src/main/java/app/repbunny/BackupFolderPlugin.java` keeps a picked Storage Access
    Framework tree URI with a persisted read/write grant (`ACTION_OPEN_DOCUMENT_TREE`, opened at
    `Documents/RepBunny` with `EXTRA_INITIAL_URI`; files are found by display name, since
    `createDocument` adds " (1)"; a folder on `com.android.externalstorage.documents` counts as only on
    the phone). Its default folder is `BackupDefaultFolder.java`: MediaStore `Files` with
    `RELATIVE_PATH` `Documents/RepBunny` (no permission, survives deleting the app, not a lost phone),
    each file's URI kept by name in SharedPreferences because an app only sees its own MediaStore
    entries and a name an old install left gets " (1)"; on Android 7 to 9 the app's external files
    folder. iOS's `BackupFolderPlugin.swift` keeps a bookmark of a Files-picker folder (a folder that
    isn't `isUbiquitousItem` counts as only on the phone, which can't tell On My iPhone from a
    third-party provider; check on a device) and writes through `NSFileCoordinator`. Its default is
    the `iCloud.app.repbunny` container's `Documents` (`ios/App/App/App.entitlements`,
    `NSUbiquitousContainers` in `Info.plist`; the container and the App ID's iCloud capability were
    set up in #875, and Codemagic's `fetch-signing-files --create` makes a profile with it), looked up
    on every call so a phone signed out of iCloud falls back to a folder in the app's own Application
    Support, which the web layer's status then names as only on this phone. That fallback isn't shown
    in Files: `UIFileSharingEnabled` would also show the SQLite database, which the SQLite plugin keeps in
    Documents. The list hides iCloud's `.<name>.icloud` placeholders under their real names and starts
    their download; a coordinated read waits for it. The browser stand-in is
    `src/lib/backupFolderWeb.ts` (`e2e/local/auto-copy.spec.ts`, `e2e/local/setup-copy.spec.ts`).
  - **Startup check and recovery screen (#431,** design `docs/design/issue-431-recovery-screen.html`,
    option A): `main.ts` awaits `checkLocalData()` (`src/lib/localRecovery.ts`) before mounting
    anything. It opens and migrates the database, then runs `checkDatabase()`
    (`essentialReads.ts`: `PRAGMA quick_check` plus the launch reads). Any failure logs the error
    (to the queued log, since the database can't take it), makes every later `openLocalDb()` fail
    the same way without touching the database (so nothing retries a failing update or saves more
    "Before update" restore points), and mounts `src/components/RecoveryScreen.vue` instead of the app. A
    `MigrationCheckError` is "This update couldn't finish": the data is unchanged, so it offers
    **Save a backup file** (the newest restore point when it's the "Before update" one, else
    `snapshotActiveDatabase()`, through `deliverFile`) and no restore. Anything else is damaged
    data: it offers the newest restore point (**Restore it**, or any from the list) or, with none,
    **Restore from a file**; it also offers a quiet **Start fresh** (#641), which asks for a second
    confirmation, then sets the damaged database aside the same way (`startFreshAfterDamage()`),
    creates an empty one, and reloads onto it. Both offer **Send a bug report** (`BugReportSheet.vue`). Nothing
    restores without a tap. A restore never overwrites the damaged database:
    `setAsideActiveDatabase()` (`capacitor.ts`) starts a new one named `repbunny-<UTC
    yyyyMMddHHmmss>`, the restore goes into it, and the app reloads. The newest name on the device
    is the one in use (`getDatabaseList()`), so no pointer is stored and Auto Backup's copy of the
    files carries the answer. `pruneSetAsideDatabases()` (after a healthy start, native only)
    deletes a set-aside copy once two restore points have been saved after it, and keeps at most 2.
    jeep-sqlite never settles an open (or a delete) of a file that isn't a database, so on the web
    `connect()` checks the stored bytes' SQLite header first. Dev server only:
    `localStorage['rb-dev-fail-next-update']` makes the next open throw `MigrationCheckError`
    (`e2e/local/recovery-screen.spec.ts`). The setup wizard's welcome (`src/components/SetupRestore.vue`) has
    **Restoring from a backup?** for a reinstall, where no restore points are left: the usual file
    restore, then setup is done. On the phone it also offers the automatic copy's latest copy, or
    **Find my copies** (#874, Automatic copy above).
  - `repos.ts` (`createSqliteRepos`) returns the shapes in `src/data/types.ts`: joins in SQL,
    nesting in JS, and rows carry `user_id: 'local'` so the shared types hold. SQLite constraint
    errors get the matching Postgres SQLSTATE (`23505` and so on), since the stores branch on it.
  - **Reset, restore, and erase (#77)** are the three RPCs rewritten in TypeScript, each in one
    SQLite transaction so a failure leaves the data untouched. Reset matches `reset_my_data()`
    (training data and the height/reminder fields go; weight unit and plates stay).
    Restore reads the same JSON file as the PWA: it gives every row a new id, remaps references
    through the file's ids, drops columns the device schema doesn't have (`user_id`, the live
    database's leftover `exercises.category`), skips rows that point at something missing, and
    renumbers each workout's sets from 0, all as `restore_my_data()` does. Erase empties every
    table and puts the settings row back to its defaults, so the weight-unit sheet asks again like
    a first launch. `e2e/sqlite-adapter-unit.spec.ts` covers restoring a PWA backup file on the
    device.
  - `db.ts` is the small `SqlDb` interface the repos use, with every call queued so a transaction
    never swallows another store's statement. `capacitor.ts` opens it through
    `@capacitor-community/sqlite` (jeep-sqlite on the web platform, which also needs
    `sql-wasm.wasm` served; see local mode below).
  - **Tests:** `e2e/sqlite-adapter-unit.spec.ts` runs every repo against an in-memory sql.js
    database (`e2e/fixtures/sqljs.ts`) in Playwright's Node process, so it's part of
    `npm run test:e2e` with no browser. sql.js is the engine jeep-sqlite runs on.
    Chosen over a browser page in local mode because it needs nothing from #76 and runs in about
    two seconds.
- **Local mode (#76, local only since #938):** the app always runs on the device's own data, in
  the native apps and in the browser build the e2e suite drives:
  - `src/data/index.ts` builds the SQLite adapter (`capacitor.ts` is a lazy import, and the
    database opens on the first repo call). `main.ts` checks the database before mounting
    (#431).
  - There's no sign-in. The setup wizard (`SetupWizard.vue`, #397) opens on a fresh install,
    decided in `App.vue` once exercises and routines load, and `App.vue` runs the resume-workout
    check once the screens mount.
  - Rest alerts are the phone's own notifications (#78, below); the in-app rest screen runs as
    well.
  - The Account sheet's third row is **Reset & erase**. **Erase all data** (typing `ERASE`) calls
    `repos.backup.erase()`, clears the `repbunny-` localStorage keys except a Premium unlock
    (`src/lib/eraseAllData.ts`), and refetches the empty stores.
  - There's no service worker (#939); the app is bundled and updates through the store.
  - **Android backup:** `allowBackup` is on, and Auto Backup includes
    `databases/repbunnySQLite.db`. The rules (`res/xml/backup_rules.xml` for Android 11 and older,
    `res/xml/data_extraction_rules.xml` for 12 and newer, #430) leave out only the restore points
    database (`databases/repbunny-restore-pointsSQLite.db`); keep the two files in step, and keep
    the main database in. After a recovery (#431) the database in use is `repbunny-<stamp>SQLite.db`
    and up to 2 damaged copies sit beside it; the rules exclude by name, so all of them stay in.
    - **Data growth vs. the 25 MB cap (#117, measured 2026-10-03):** Auto Backup stops backing an
      app up once its data passes 25 MB. `node scripts/measure-data-growth.mjs` builds a heavy but
      normal user in the local schema (5 templates of 6 exercises, 4 sets each, so 24 sets a
      workout; 5 workouts a week; RPE on about 30% of sets, a few timed exercises, a note on 15%
      of workouts, about one weigh-in a week, and a full 200-row error log) and measures it with
      sql.js. MB here is 1,000,000 bytes; "restore points" means 10 copies of the full backup JSON
      at that age, an upper bound since older ones are smaller.

      | Years | Sets | Database (after VACUUM) | Backup JSON | JSON gzipped | DB + 10 JSON | DB + 10 gzipped |
      |---|---|---|---|---|---|---|
      | 1 | 6,240 | 2.20 | 2.09 | 0.31 | 23.10 | 5.29 |
      | 2 | 12,480 | 4.01 | 4.15 | 0.65 | 45.53 | 10.48 |
      | 5 | 31,200 | 9.42 | 10.34 | 1.67 | 112.84 | 26.09 |
      | 10 | 62,400 | 18.49 | 20.66 | 3.37 | 225.07 | 52.19 |

      Growth is linear, about 1.8 MB of database a year (roughly 290 bytes per set, row plus
      indexes; VACUUM saves only about 5% since the app rarely deletes). **Conclusion:** the
      database alone stays under 25 MB for about 13.6 years at this pace, so it needs no action
      now. With 10 restore points it reaches 25 MB in about 1.1 years as plain JSON and 4.8 years
      gzipped, which isn't negligible, so under the owner's rule on #108 Android **excludes** the
      restore-point database from Auto Backup (`dataExtractionRules` / `fullBackupContent`) and backs
      up the database alone. iPhone keeps them (gzipped) in iCloud Backup, which has no per-app
      cap. If the database itself ever gets close, the fallback is a "cold storage" step: roll
      sets older than some cutoff into denormalized summary rows kept for long-range reports (PRs,
      trends, est. 1RM) but no longer editable set by set. Not designed yet.
  - **Browser local mode** is for the e2e suite. jeep-sqlite fetches `/assets/sql-wasm.wasm`, which
    `vite.config.ts` serves from the dev server and `vite preview` only (#960), from the `sql.js-jeep` dev dependency (sql.js pinned to
    1.11.0, the version jeep-sqlite 2.8.0 bundles; a newer wasm fails to link). Upgrading
    jeep-sqlite means re-pinning that alias. `playwright.config.ts` serves an e2e hooks build
    (`VITE_E2E_HOOKS=true`, #960) on port 5174. Each test's fresh browser context starts with an empty database, like a first launch.
  - **Local-mode e2e (#79, #415, #938):** the Playwright project `local` runs every spec under
    `e2e/local/` against that server (baseURL `http://localhost:5174`;
    `npx playwright test --project=local` runs just this one). The projects are listed in
    `docs/architecture/testing.md` > "End-to-end tests". `e2e/local/core-flows.spec.ts` drives the core flows from a first
    launch through the app itself: add from the library, build a template, log and finish a
    workout from it, fix a set in the Workout log, Progress and Lift progress, then back up,
    erase, and restore. Other local specs start with `startLocal()` and seed through
    `localDb(page)` (`e2e/fixtures/local.ts`).
- **Rest timer alerts (#78):** `src/lib/restAlert.ts` wraps `@capacitor/local-notifications`.
  WorkoutLogger.vue schedules one alert (fixed ID) when a rest starts, not when the app goes to
  the background (it may be suspended before it could), moves it on ±15s, and cancels it when the
  rest ends early (Skip, finishing the workout, ...).
  - **Running out:** a rest that runs out on its own keeps its alert. The in-app countdown can end
    it up to half a second before the alarm, and on Android it often does so in the few seconds
    the app keeps running after the screen locks; cancelling there killed every alert on the
    Pixel (2026-10-01). Only when the app is visible and focused (the user saw the in-app screen,
    which already chimed) is the alert dismissed, fired or not. RestTimer.vue emits `finish` for
    a run-out and `dismiss` for Skip so the two can be told apart.
  - **Permission:** asked the first time a rest timer runs, never at launch. After that only the
    Account sheet's Rest timer alerts row asks (flag `repbunny-rest-alert-asked`; an Exercises tab card before #63). It shows the phone's state in
    place of the web push card: on, "Turn on rest timer alerts", or "off" with an **Open settings**
    button (#339).
  - **Alerts-off notice (#339):** when permission is `denied`, the first rest of each workout shows
    a small notice on the rest screen (RestTimer.vue, state in `stores/rest.ts`): "Rest alerts are
    off ..." with **Open settings** and a dismiss (×). Not shown for `prompt`, `granted`, or
    `unsupported`, and not again that workout. **Open settings** calls
    `RestActivity.openNotificationSettings()` (`RestActivityPlugin.java`: the app's notification
    settings, or app details below Android 8; `RestActivityPlugin.swift` on iPhone, #832: RepBunny's
    notification page in Settings, or its general page below iOS 16). `openRestAlertSettings()` in
    `restLive.ts` returns false when the phone refuses, and then `restSettingsFailed` swaps the
    button for the written directions, here and in the Account setting).
  - **Alert sound (#640):** on Android 8+ the sound belongs to the notification channel.
    `ensureRestAlertChannels()` (restAlert.ts, called from `main.ts`) creates one high-importance
    channel per chime (`rest-alert-<sound>-v1`, ids and clip names in `lib/restAlertChannel.ts`)
    and deletes older `rest-alert-*` channels. The clips are copies of `public/rest-chime.mp3` and
    `public/sounds/*.mp3` in `android/app/src/main/res/raw/` (underscores for dashes); a new or
    changed clip needs a new copy there and a bumped channel version. `scheduleRestAlert` uses the
    channel for `playablePick('chime')`. On iOS (#828) a local notification with no `sound` is silent,
    so `scheduleRestAlert` passes `restIosSound(...)` (`rest-alert-<sound>.caf`, IMA4 copies of the
    same clips at the top of `public/`, where the plugin looks) and the Premium path sends it as
    `alertSound` through `RestLiveStart` to `RestLiveShared.swift`, which falls back to the default
    sound when the file is missing.
  - **Chime:** `playRestChime` plays only while `document.visibilityState` is `visible`; out of
    the app, the phone's notification (and so the user's notification setting) is the signal.
    On iPhone (#826) `primeRestChimeAudio` starts a silent sample and primes an `<audio>` element
    inside the tap, anything but a `running` context is resumed before playing (WebKit's
    `interrupted` included), a context that can't run falls back to the `<audio>` element, and each
    miss is written to the client error log with the context state.
  - **Android exact timing:** without the Alarms & reminders permission (off by default on
    Android 14+) alerts are inexact and may land a little late. The plugin would open that
    settings screen on every `schedule()` while it's missing, so the app passes
    `isExactNotification` only when it's already granted, and the card offers "Allow on-time
    alerts" instead. The rest screen also shows a one-time notice (#642: `exactNotice` in
    `stores/rest.ts`, seen-flag in `exactAlertsNoticeDue()`) on the first rest with alerts on
    and the permission missing; it hides when the app returns with it allowed.
  - **Icon:** `ic_stat_rest` (a white stopwatch vector in `android/app/src/main/res/drawable`),
    set as the plugin's `smallIcon` in `capacitor.config.ts`.
  - **Browser local mode:** the plugin's web fallback uses the Notification API and keeps
    scheduled alerts in memory; `e2e/local/local-rest-alerts.spec.ts` reads them through
    `window.Capacitor.Plugins.LocalNotifications`. Headless Chromium always reports
    `Notification.permission` as `denied` (and then closes any notification, which makes the
    fallback forget all delivered ones), so that spec swaps `Notification` for a fake that
    records what it shows.
- **Lock-screen rest timer (#143, Premium):** with Premium, a rest shows on the lock screen with
  a live countdown, what's next, and **+15s** / **Skip**. Free users keep #78's alert.
  - **Web side:** `src/lib/restLive.ts` wraps an app-local Capacitor plugin, `RestActivity`
    (`start`, `end`, `getState`, and a `restAction` event). `stores/rest.ts` starts it in place
    of `scheduleRestAlert` and ends it where #78 would cancel or dismiss the alert, with the same
    run-out rules. The native side keeps its own copy of the running rest, so its buttons work
    with the app suspended or killed; the store reconciles with it (`reconcileRest` in
    `src/lib/restLiveState.ts`) on each `restAction`, whenever the app becomes visible, and when
    a workout becomes active. That brings back a rest still running for the resumed workout
    after the app was killed. Every string shown comes from `restLiveCopy`.
  - **Android:** `RestActivityPlugin.java` (registered in `MainActivity.java`), `RestLive.java`,
    and `RestActionReceiver.java` under `android/app/src/main/java/app/repbunny/`. An ongoing
    notification on the `rest_countdown` channel counts down with a chronometer, and its buttons
    are broadcasts to the receiver. The channel is default importance with no sound or vibration:
    Pixels hide low-importance ("silent") notifications from the lock screen by default. An alarm
    at the rest's end (exact when Alarms & reminders is allowed) swaps it for the "Rest is over"
    alert on the `rest_done` channel, so this replaces #78's alert rather than adding a second
    one, and +15s on the lock screen moves it too. The rest lives in SharedPreferences
    (`repbunny_rest_live`); +15s follows `addRestTime`'s rule, and Skip leaves it marked `skipped`
    until the app catches up.
  - **Over the lock screen (#166, Android):** while the full rest screen is up, the app shows over
    the lock screen (`setShowWhenLocked`, as Maps does while navigating), so pressing power
    mid-rest shows the countdown without unlocking. `stores/rest.ts` turns it on only while
    there's an active rest that isn't minimized (with Premium), so leaving Home, Skip, or running
    out drops back to the lock screen. "Back to workout" goes through the store's `minimize()`,
    which asks for the unlock first (`requestUnlock`, `KeyguardManager.requestDismissKeyguard`)
    and stays put if it's cancelled. There's no full-screen intent and the screen never turns on
    by itself: Android 14+ limits `USE_FULL_SCREEN_INTENT` to alarm and calling apps on Play.
  - **iPhone (#163):** a Live Activity on the lock screen and in the Dynamic Island, from the
    `RestLiveWidget` widget extension target (`ios/App/RestLiveWidget/`, bundle ID
    `app.repbunny.RestLive`, iOS 17). Files:
    - `ios/App/App/RestActivityPlugin.swift` is the same `RestActivity` plugin. Capacitor doesn't
      find app-local plugins on iOS, so `MainViewController.swift` (a `CAPBridgeViewController`
      subclass that `SceneDelegate.swift` uses as the root) registers it in `capacitorDidLoad`.
      That makes `Capacitor.isPluginAvailable('RestActivity')` true with no web changes.
      `setShowWhenLocked` and `requestUnlock` (#166) just resolve.
    - `ios/App/App/RestLiveShared.swift` is built into both targets: the activity's attributes
      (every string in `ContentState`, so a new "Up next" updates in place), `RestLiveStore`, and
      the **+15s** / **Skip** buttons as `LiveActivityIntent`s.
    - Those intents run in the app's process, launching it in the background if it was killed, so
      the running rest lives in the app's own `UserDefaults` (`repbunny_rest_live`, the same JSON
      as Android). That's why there's no App Group. Each change re-syncs the activity to the stored
      rest (`RestLiveActivity.sync`) and posts a notification the plugin forwards as `restAction`.
    - `Activity.request` isn't allowed in app extensions, so the widget target compiles with
      `RESTLIVE_WIDGET` and leaves it out. A rest only starts in the foreground anyway.
    - The end-of-rest alert is a local notification (`rest-live-end`) scheduled at `endsAt`,
      moved by +15s and removed by Skip or `end`, so it replaces #78's alert like Android does.
      iOS can't run code when it fires, so there's no `done` event. The activity's `staleDate` is
      `endsAt`, and a stale activity swaps the countdown and buttons for the alert title until the
      app ends it.
    - On iOS 16 the plugin still schedules the alert, but there's no Live Activity.
    - The app's `Info.plist` sets `NSSupportsLiveActivities`. `codemagic.yaml` fetches (and the
      first time, creates) the extension's own App Store profile.
    - The target was added to `project.pbxproj` by hand with no Mac, so a Codemagic build is the
      compile check. The device check is #164.
  - **Tests:** `e2e/rest-live-unit.spec.ts` covers the timer rules. `e2e/local/rest-live.spec.ts`
    runs against the plugin's web stand-in (`src/lib/restActivityWeb.ts`, sessionStorage so it
    survives a reload like the phone's copy survives a killed app), whose `simulateAction` plays
    the lock screen's buttons. The lock screen itself is checked by hand on a device.
- **Home screen widgets (#144, Premium):** three widgets: **This week** (Home's week tracker with
  the theme's day marks), **Next workout** (the template after the last one done, in Home's tile
  order, wrapping; the first one with no templated workout yet; a tap starts it), and **Latest
  record** (the newest set that beat its exercise's best, by the milestones replay, with the
  bunny). Widgets never read the database: the app writes one JSON snapshot and the native side
  draws from it.
  - **Snapshot:** `buildWidgetSnapshot` in `src/lib/widgetSnapshot.ts` (pure): the owned theme's
    colors (never a free user's preview) and day mark, the week (Sunday start in ms, count, days),
    the next template, the latest record, the Premium flag, and every string the widgets show.
    Sets from the workout in progress are left out.
  - **When it's written:** `installHomeWidgets` in `src/lib/homeWidgets.ts` (called from App.vue,
    local mode only) rebuilds it 300 ms after the workouts store finishes, deletes, or edits a
    workout (or runs `fetchProgressStats`, which restore and reset call), when the template list,
    a template's category, or an exercise name changes, when Premium or the theme changes, at
    startup, and right away when the app goes to the background.
  - **Taps** come back as a `widgetAction` event: `start` sets `pendingWidgetStart`, which
    WorkoutLogger.vue starts on Home unless a workout is going, waiting to be resumed, or on its
    recap; `premium` opens the Premium sheet (feature `widgets`); `open` goes to a path (Home,
    Templates when there are none, Progress for the record).
  - **Android:** `HomeWidgetsPlugin.java` stores the snapshot in SharedPreferences
    (`repbunny_widgets`) and redraws; `HomeWidgets.java` builds the RemoteViews from it;
    `WeekWidgetProvider`, `NextWorkoutWidgetProvider`, and `RecordWidgetProvider` are the
    receivers (2x2, resizable; layouts `widget_week`/`widget_next`/`widget_record`, and
    `widget_message` for the free placeholder and the "open the app once" state before any
    snapshot). Colors come in as a color filter on white shapes (`widget_bg`, `widget_pill`,
    `widget_dot`); the day marks are vector copies of DayMark.vue's (`day_mark_*`), and the bunny is
    `drawable-nodpi/widget_bunny.png`. A tap opens MainActivity with action
    `app.repbunny.WIDGET_ACTION` and a distinct data URI per target; the plugin reads it on load
    (cold start) and in `handleOnNewIntent`, and keeps the event until JS listens. The half-hourly
    `updatePeriodMillis` only lets This week roll over to an empty week on Sunday when the app
    hasn't run.
  - **iPhone:** not built yet (#175). A WidgetKit extension reads the same snapshot from an App
    Group, and can join #163's `RestLiveWidget` extension (adding the App Group then, since
    widgets, unlike the Live Activity's intents, run outside the app's process).
  - **Tests:** `e2e/widget-snapshot-unit.spec.ts` covers the snapshot rules;
    `e2e/local/home-widgets.spec.ts` runs against the web stand-in (`src/lib/homeWidgetsWeb.ts`,
    sessionStorage), whose `simulateTap` plays a tap. How the widgets draw is checked by hand on a
    device.

## Store rating prompt (#727, #776)

On Android, the finish recap asks the OS for a store rating a few seconds after it appears, only
when the workout set a record and the rules in `docs/decisions.md` allow it: at least 7 days since
the first workout and 5 workouts logged, at least 30 days since the last ask, at most 3 asks in any
365 days, and the Preferences switch "Ask me to rate RepBunny" (`src/components/RatingAskRow.vue`, on by default,
native only) is on. `src/lib/storeRating.ts` holds the rules, the per-device ask dates
(`rb-rating-ask-dates`; a device with the old `rb-rating-asked` flag counts it as one ask dated when
first read) and the switch (`rb-rating-ask-on`); the date is written before the call, so a failure
never asks twice. `src/components/RecapRatingAsk.vue` is the renderless trigger inside
`FinishRecap.vue`; it reads the workouts through `repos.backup.listAll('workouts')`. The call is `@capacitor-community/in-app-review`, which
shows Google's own Play In-App Review sheet. Play decides whether it shows and how often. The request
goes through the Play Store app, not our code, so it isn't a request of our own to a third-party host
(`docs/decisions.md`, 2026-10-15). There is no copy or reward of our own around it. The PWA never
asks, and iPhone follows once the App Store build is live (the plugin isn't in `ios/` yet).
Tests: `e2e/store-rating-unit.spec.ts`, `e2e/local/rating-ask-pref.spec.ts`; the real sheet is `TC-LOG-011` in `scripts/qa/procedure.mjs`.
