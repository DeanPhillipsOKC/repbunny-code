# Architecture: Testing and e2e

> Part of the architecture reference; index at `docs/architecture.md`.

### Testing / automation

The app has no sign-in and no backend (#938), so nothing that tests it needs an account, a key,
or a network. The PWA pilot's test backend (a separate Supabase project, session minting, the
admin and cleanup scripts, and `TEST_*` secrets) was removed in #940.

- **e2e** (below): every spec starts the app on a fresh, empty on-device database.
- **Hand checks and capture scripts** run against `npm run dev` (5173). Each browser context
  starts with its own empty database, so a script seeds what it shows through
  `localDb(page)` (`scripts/lib/local-db.mjs`, the same query shim the e2e fixtures use) and
  leaves nothing behind. The screenshot scripts share their ten-week sample history and phone
  page through `scripts/lib/sample-account.mjs`.

### End-to-end tests (Playwright)

`e2e/` holds Playwright specs (`npm run test:e2e`). `playwright.config.ts` boots its servers
automatically (`webServer`, never reused, so a run always tests this checkout; stop a server you
started yourself first) and runs against Chromium. Since #938 the app only runs on its on-device
SQLite database (in the browser, the SQLite plugin's web stand-in), so every spec starts from a
fresh, empty database in its own browser context: there are no test accounts, no cleanup, and no
network.

**Projects:**

- **`local`** (`e2e/local/`, plus `e2e/contract/`): every feature spec, on a production build
  at 5174 (#960): `vite build` with `VITE_E2E_HOOKS=true` (and `VITE_DEV_TOOLS=true`, for the dev
  rows) into `dist-e2e/`, once per run, served by `vite preview`. An in-page `import('/src/...')`
  doesn't resolve on a build, so specs load the app's modules with
  `await window.__rbImport('/src/lib/premium.ts')`; the list is in `src/testHooks.ts` (add a
  module there when a spec needs it). Start with `startLocal(page)` (`e2e/fixtures/local.ts`): unit `lb`, no default rest
  timer (pass `defaultRestSeconds: 'fresh'` for a new install's 2:00, #429), the muscle check and
  the first-rest tip dismissed (`restTip: true` shows the tip), and Premium on (pass
  `premium: false` to test the free tier). Seed rows in its `beforeNavigate` with
  `localDb(page)`, a small `.from(table).insert(...).select('id').single()` query builder over
  the page's own database. Import `test` from the same file for the `stamp` and `db` fixtures.
  A spec that drives a real first launch can skip `startLocal` and answer the unit sheet itself.
- **`personal`** (`e2e/personal/`, #784): a dev server at 5175 with the personal Android build's
  flags (`VITE_PREMIUM_UNLOCKED`, `VITE_DEV_TOOLS`).
- **`build`** (`e2e/build/`, #784): reads a fresh production build in `dist-e2e-build/` (built by
  the server at 4317, served only so Playwright knows it finished) and checks the store builds'
  bundle has no dev rows and no e2e hooks (#960).
- **`unit`** (`e2e/*-unit.spec.ts`): pure logic, scripts, and the SQLite adapter on sql.js; they
  never request `page`, so no browser starts.

`e2e/contract/data-contract.spec.ts` calls every `Repos` method (`src/data/types.ts`) on the
app's real adapter and checks the shapes and values the stores rely on
(`data-contract.expected.ts`). A new repo method gets a case there.

**Removed with the PWA's backend mode (#938).** The `chromium` project (the Supabase-mode specs at the top
of `e2e/`) and the `pwa` project (its specs folder, the service worker's offline caching on a
production build) are gone. Before deleting a spec, its behavior was checked against a local
spec; what had none was ported to `e2e/local/` (`app-version`, `restore-guards`,
`report-prompt`). What went without a port only existed on the Supabase path: sign-in, passkeys,
sign-out and account switching, account deletion, row-level security, the PWA's own Premium and
themes, the PWA-to-device backup round trip (the file format stays covered by
`e2e/sqlite-adapter-unit.spec.ts`), and network-timing races that need a held or failed request
(`set-save-retry`, `loading-skeletons`, the held fetches in `body-tab`, the reorder race in
`template-editor`, the offline client-error queue).

**Workers and timeouts.** 4 workers by default (#161), 2 in cloud sessions and on a low-memory day
(`PW_WORKERS=2 npm run test:e2e`; `docs/decisions.md`). `timeout: 45_000` (up from Playwright's 30s
default), `retries: 1` locally and 2 on CI, and `expect.timeout` 10s (up from 5s, #282) absorb
several workers sharing one dev server and one machine, not flaky assertions: on 2 cloud workers,
11 specs once missed a 5s assertion under load and passed alone. Concurrent runs share no data,
so two routines can run the gate at the same time.

**Where the time goes (#933, measured 2026-11-04 in a 4-core cloud session, 1,025 tests).** On 2
workers the run took 14.5 min: the `local` project is 26.7 of its 27 worker-minutes (506 tests,
median 2.9s each), the 517 `unit` specs take 0.2, and server startup is about 12s. No one spec
dominates (the slowest file, `local-rest-alerts`, is 60s of 17 tests). Most of each test is its
two page loads on the dev server in `startLocal` (about 1.7s and 1.2s, roughly 760 module
requests each); the same app as a production build loads in about 0.85s and 0.65s from 28
requests, so #960 moved the `local` project onto one (see Projects above). 4 workers on the same 4 cores took 11.4 min, but each test ran about 40% slower
(each worker's browser and the shared dev server compete for CPU) and one spec needed a retry,
so cloud sessions stay on 2. The hosted release run splits instead (`docs/architecture/commit-policy.md`
> Release gate).

- **Celebration wait.** The workouts store counts adds whose record check hasn't settled
  (`recordChecksPending`), `WorkoutLogger.vue` exposes it as
  `data-record-check="pending"|"idle"`, and `dismissCelebrationIfShown` waits for `pending` to
  clear (keeping a 2s fallback off the logger).
- **Fixed waits:** a few `waitForTimeout` calls (400 to 700ms) remain in specs that deliberately
  check something did *not* happen after a delay.
- **Memory:** close stray Chrome windows and Vite servers before a run on a low-memory day, or use
  `PW_WORKERS=2`.

**Setup wizard flag (#397).** The first-run setup wizard (`SetupWizard.vue`) opens over any
database with no exercises or routines, which is where most specs start. `playwright.config.ts`
presets its `rb-setup-done` localStorage flag through `storageState` on the `local` and
`personal` projects, so it never shows unless a spec clears it with
`test.use({ storageState: { cookies: [], origins: [] } })` (`e2e/local/setup-wizard.spec.ts`,
`e2e/local/lifting-basics.spec.ts`, `e2e/local/setup-copy.spec.ts`). A context a spec makes
itself with `browser.newContext()` doesn't get the preset; set the flag there too.

**This is the required way to verify UI code changes in this repo.** The Claude-in-Chrome
browser extension has been unreliable in this environment (extension not connected) —
don't rely on it or treat a failed connection as a blocker. Instead, write or extend a
Playwright spec under `e2e/` covering the change and run `npm run test:e2e`. Every new
feature that touches the UI should land with (or exercise) an e2e spec rather than being
declared done on typecheck/build passing alone. Changes that touch no application code (see
Commit & push policy) do not need Playwright, a dev server, or a build.

**Layout and alignment fixes need geometric assertions and a phone-width screenshot.** A spec
that only checks elements are visible will pass on a broken layout. The timed-set row went
through items 93, 97, and 101 misaligned on a real phone while its spec stayed green. For any
change about how things line up, size, or wrap:

- Assert positions, not presence. Read `boundingBox()` / `getBoundingClientRect()` and check
  the actual claim, e.g. "all inputs share a left edge", "one field per line", "the chip is
  right of the Distance input and vertically centered on it". See
  `e2e/local/exercise-load-type-timed.spec.ts`'s Treadmill block for the pattern.
- Look at it at phone width. `page.setViewportSize({ width: 375, height: 800 })` then
  `locator.screenshot()` into a scratch path (not the repo), open the image, and compare
  it to what was asked for before calling the fix done. Remove the screenshot lines before
  committing. The default Playwright viewport is desktop-sized, so a layout that fits there
  can still overflow or wrap on a phone.
- Budget the width first. Before choosing a multi-column layout for a set row, add up the
  fixed widths (row padding, number circle, action buttons, each label/input/unit) against
  ~375px. If it doesn't fit, pick a layout that does rather than tuning gaps.
