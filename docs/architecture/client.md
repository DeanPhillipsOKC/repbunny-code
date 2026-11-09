# Architecture: Client security, error log, What's new

> Part of the architecture reference; index at `docs/architecture.md`.

## Client security

- The app has no backend and ships no keys (#938, #940). A secret never goes in client code, a committed environment file, or the build output; anything a build step needs (signing keys, store credentials) lives in the CI provider's secrets.
- Security headers (#268): `public/_headers` (app) and `site/_headers` (repbunny.app) set a CSP, `nosniff`, a referrer policy and a permissions policy; the app's CSP is enforced (`Content-Security-Policy`, #541; `connect-src` is `'self'` only, since the app talks to no backend, #940), and `e2e/local/csp-enforced.spec.ts` walks the core flows under it with a `securitypolicyviolation` listener. The site's inline-script hashes are checked by `e2e/security-headers-unit.spec.ts`.
- Enforce HTTPS. Cloudflare Pages does this by default; do not disable it.
- Validate input on write. The SQLite schema's check constraints hold sane ranges (`reps > 0`, `weight >= 0`).

## Client error log

Issue #83. When something fails, the on-screen error is gone after a refresh, so the app also
records it. `src/lib/errorLog.ts` holds it all:

- **Captured:** Vue render/lifecycle errors (`app.config.errorHandler`, which still
  `console.error`s), `window` `error` and `unhandledrejection`, and every failed write through the
  repos (`withRequestLogging` in `src/data/index.ts` wraps the `create*`/`update*`/`insert*`/
  `delete*`/`remove*`/`add*`/`save*` methods of `workouts`, `exercises`, `templates`,
  `bodyWeight`, and `profile`). A write's `context` has the operation (`workouts.insertSet`),
  the table, the SQLSTATE `code`, and ids only, never reps, weights, names, or notes. The store
  still gets exactly the result it did before.
- **Rules:** logging never throws or blocks, and never logs its own failures (it writes through
  the unwrapped `clientErrors` repo). The same kind + message more than 5 times a minute is
  dropped.
- **Where it lands:** the on-device SQLite `client_errors` table (migration version 4), keeping
  the newest 200 rows; nothing leaves the device. Each entry keeps the action trail (#234). If a
  write fails, the entry waits in localStorage `repbunny-client-error-queue` (newest 50) and is
  retried on the next app start or `online` event. (The PWA's server-side table went with its
  backend mode in #938.)
- **Lifecycle:** Erase all data empties the device table and the queue. Reset and backups leave
  the log alone.
- **Reading it:** `repos.clientErrors.list()`.
- **Report a bug (#84):** Account > About > Report a bug (`BugReportSheet.vue`) lists
  the stored rows plus anything still queued, newest first, with the last 24 hours checked. An
  "Email me when it's fixed" checkbox, off by default and never stored, puts
  `Email me when it's fixed: yes|no` at the top of the report. Every report gets a reply either
  way; "yes" also allows one note when the fix ships. `triage-support` reads that line, labels
  the issue `notify-reporter`, and marks the issue's Gmail link `(asked to hear back)`, so no
  address goes in GitHub. Once the issue closes, it drafts the "it's fixed" reply. The privacy
  policy's "Emailing us" section covers this. Email
  report opens the user's email app already addressed to `SUPPORT_EMAIL` (`src/lib/bugReport.ts`),
  and they tap Send there; nothing goes out on its own. Native apps use `capacitor-email-composer`
  (email apps only on Android) with the full plain-text report attached as a `.txt`
  (`file_paths.xml` has `external-cache-path` for it) only when at least one error is included;
  otherwise the report is the email body, no attachment (`nativeBugReportEmail`). The PWA, and a native build without the
  plugin, use a `mailto:` link with the report as the body: stacks are dropped first if it's over
  8,000 encoded characters, then it's cut with a note. A share sheet was tried first and dropped:
  it can't preset the recipient. The send button sits in a sticky dock and the Account overlay
  follows `useKeyboardViewport()` (`src/lib/keyboardViewport.ts`, shared with
  `ExerciseFormSheet.vue`), so the button stays above the on-screen keyboard. Sending never
  touches the log; Clear log (`repos.clientErrors.clear()`) empties it and the queue. The privacy
  policy has a "Bug reports you send" section for it.
- **Report prompt and action trail (#234):** `src/lib/actionTrail.ts` keeps the last 20 steps in
  memory: each route change (`Screen home`) and each tap on a button, link, tab, switch, or
  checkbox (`Tap "Add set"`), named by its `aria-label` or text. Inputs are never read; digits in a
  label become `#`, and the user's own exercise and routine names (wired in by `App.vue`) become
  `[name]`. `main.ts` installs it. A logged error's stored `context.trail` is kept in the device's
  table (`setErrorSink(..., { onDevice })`). Each logged error also calls `offerReport`, which
  sets `reportPrompt` unless the input says `prompt: false` (a failed write that's a network
  failure or offline), the message is browser noise (`ResizeObserver loop`, `Script error.`), or
  that kind + message was already offered this session. `ReportPrompt.vue` (in `App.vue`) shows
  "Something went wrong. Send a report?" pinned under the status bar, never a modal, so set
  inputs stay usable. Send report calls `openBugReport()` (`src/lib/accountSheet.ts`), which opens
  the Account sheet on Report a bug with that error first and the only one checked (its in-memory
  copy carries the trail; the stored copy is dropped by matching time, kind, and message). The
  report adds `Build`, `OS`, `Device model` (both parsed from the user agent), and `Storage` lines,
  and a `Steps before it:` list per error. The sheet's "Preview report" shows the exact text
  before sending. Tests: `e2e/local/report-prompt.spec.ts`, `e2e/report-prompt-unit.spec.ts`.
- **Request a feature (#100):** Account > About > Request a feature (`FeatureRequestSheet.vue`, both
  modes, below Report a bug) emails one required text box plus the version, platform, and device
  lines, subject "RepBunny feature request", through the same `sendSupportEmail` path in
  `bugReport.ts` (no error list, no attachment).
  "This looks wrong" (#574): `openNumberReport(text)` (`accountSheet.ts`) opens Report a bug with the description pre-filled
  (`numberReportText` in `bugReport.ts` words it); receipts call it, and nothing goes out until the user sends it.
- **Tests:** `e2e/local/client-error-log.spec.ts` and `e2e/client-error-log-unit.spec.ts`
  (throttle, 200-row trim, wrapper context); for #84, `e2e/local/bug-report.spec.ts` and
  `e2e/bug-report-unit.spec.ts`.

## What's new

Issue #101. The PWA updates itself silently, so release notes tell people what changed.

- **Notes:** one file per change, `release-notes/<issue>.json`, holding one item (#558), so
  concurrent PRs never edit the same file. `scripts/lib/release-notes.mjs` reads them, dates each
  from the commit that added it (that commit's date, and its `git rev-list --count` as `build`; a
  file not committed yet gets today and the next build; `playwright.config.ts` pins "today" per run
  through `RELEASE_NOTES_TODAY` so a gate crossing midnight can't date it two ways, #623), and merges them with the frozen
  pre-#558 list in `release-notes/archive.json` into one `{ date, build, items }` entry per day,
  newest first. `vite.config.ts` bakes that into the app as `__RELEASE_NOTES__`, which
  `src/lib/releaseNotes.ts` exports (with the types); Node scripts and e2e specs call
  `loadReleaseNotes()` instead. The dev server reads them once, so a new file needs a restart.
  An item is a string (a file with only `text`), or `{ text, guide }` (#102) where `guide` is a folder under `site/guides/`
  (`'rest-timer/'`); the sheet then ends that item with a "How to use it" link to
  `https://repbunny.app/guides/<guide>` in a new tab (the system browser in the native apps), the
  same plain `target="_blank"` anchor as About's Privacy policy and Support rows. An object item
  can also carry `platforms` (`['android']`, `['ios']`; #216, while `'pwa'` marks archived notes for the retired web
  app) for a change that only some apps have, such as Android widgets: the store release notes leave it out for the
  other apps (Native apps > Releasing). The in-app sheet still lists every item. An object
  item can also carry `theme` (#887), a theme id from `src/lib/theme.ts` (`'halloween'`), on
  the note for a release that ships that theme; the banner below then announces it.
  A day's `build` is the build number (`git rev-list --count`, the number in `__APP_VERSION__`) of
  that day's last user-facing change. The version bumps on every commit, docs-only ones included, so
  notes are keyed by build number, never one per version. Only changes a user would notice go in;
  the rule for adding them is in `docs/backlog.md`'s conventions, and `next-item` follows it.
- **Sheet:** Account > About > What's new (`WhatsNewSheet.vue`, both modes), first row of About.
  Days newest first, the newest 10 until "Show older". The row has a dot, and the newest entry a
  "New" badge, while some entry's `build` is above the seen build.
- **Help & guides (#111, #568):** the About row right after What's new, both modes. It opens
  `src/components/GuideSearchSheet.vue`: every guide listed under its website topic, a search box, and a guide's
  text (title, lede, numbered steps, bold words kept) with an "Open on repbunny.app" link at the
  end. Searching is on the device with MiniSearch (`src/lib/guideSearch.ts`: prefix matching,
  fuzzy for words of 4+ letters, titles boosted, a guide must match half the typed words) and
  makes no network request. The index is text only, built from `site/guides/` by
  `scripts/lib/guide-index.mjs` and served as the `virtual:guide-index` module from
  `vite.config.ts` on every dev start and build, so it can't go stale; a guide folder missing
  from `site/guides/index.html`, or a guide with no title or steps, fails the build. The index
  and MiniSearch are their own lazy chunk (about 23 KB gzipped together), precached by the PWA.
  Words people search for that the guides say another way go in `src/lib/guideSynonyms.ts`
  (one group per line). Nothing found offers **Email support**, which opens the user's email app
  with the search words (`sendHelpRequest` in `src/lib/bugReport.ts`). Checked by
  `e2e/guide-search-unit.spec.ts` and `e2e/local/guide-search.spec.ts`. Search quality (#569): `e2e/fixtures/guide-search-scenarios.ts`
  holds lifters' own questions at three levels with the guide that answers each, and
  `e2e/guide-search-scenarios-unit.spec.ts` fails if one drops out of the top 3; set
  `GUIDE_SEARCH_REPORT=1` to print the hit rate per level after changing guides or synonyms.
- **Lifting basics (#419):** the About row under Help & guides. Unlike the guides, it's bundled
  (`src/components/LiftingBasics.vue`, five full-screen cards) so it works offline; the setup wizard's train
  step opens the same component from its "New to lifting?" link. `site/guides/lifting-basics/`
  carries the same copy, so change both together. The first card's **Watch the basics** tile
  (#426) opens a narrated video full screen, playing on that tap with sound and captions; its
  MP4, captions, and poster are in `public/video/` so the native apps bundle them. The site page shows the
  same video from `site/video/guides/`. Both copies come from `scripts/demo-video/lifting-basics.mjs`.
- **Banner:** `WhatsNewBanner.vue` on Home under the title row, outside a workout. In the page
  flow, not a modal. It shows when the running build is newer than localStorage
  `repbunny-whats-new-seen` and some entry is newer too. Close, or opening the sheet (from the
  banner's "See what's new" or from About), stores the running build. A first launch ever stores
  it silently and shows nothing. When an unseen item carries a `theme` (#887, option N2 of
  `docs/design/issue-886-theme-discovery.html`), the banner shows that item's text and a
  **Try it** pill next to "See what's new". Try it marks the build seen and applies the theme:
  with Premium or for a free theme it switches to it on the spot; otherwise it opens the Theme
  screen with the usual try-before-you-buy preview and its Keep it with Premium bar.
- **Switch:** Account > Preferences > "Show what's new after updates" (localStorage
  `repbunny-whats-new-off`, per device, on by default). Off hides the banner only.
- State and helpers live in `src/lib/whatsNew.ts`. Tests: `e2e/local/whats-new.spec.ts`,
  `e2e/whats-new-unit.spec.ts`. Design:
  `docs/design/whats-new.html`.
