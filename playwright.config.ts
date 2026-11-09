import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { today } from './scripts/lib/release-notes.mjs'

// Issue #623: fix "today" for uncommitted release notes once per run (workers and dev
// servers inherit it), so a run crossing midnight can't date a note two ways.
process.env.RELEASE_NOTES_TODAY ??= today()

// Issue #397: the first-run setup wizard opens over any account or local
// database with no exercises or routines, which is most specs' starting
// point. Its "setup done" flag is preset here so it stays out of the way;
// the specs that test it clear it with `test.use({ storageState: ... })`
// (e2e/local/setup-wizard.spec.ts).
function setupDone(origin: string) {
  return { cookies: [], origins: [{ origin, localStorage: [{ name: 'rb-setup-done', value: '1' }] }] }
}

// Issue #633: Playwright matches testMatch/testIgnore globs against the absolute path, so a
// checkout under a folder named `local` (e.g. AppData\\Local\\Temp) matched `local/**` for
// every spec. These regexes anchor to the e2e folder itself.
const e2eDir = path.resolve('e2e').replace(/[\\/]/g, '/').replace(/[.*+?^${}()|[\]]/g, '\\$&').replace(/\//g, '[\\\\/]')
const inE2e = (...dirs: string[]) => new RegExp(`^${e2eDir}[\\\\/](${dirs.join('|')})[\\\\/].*\\.spec\\.ts$`, 'i')

export default defineConfig({
  testDir: './e2e',
  // Every test's browser context starts with its own empty on-device
  // database, so workers never share data. Override with `PW_WORKERS` to
  // benchmark a different worker count. Issue #161 moved the default from 2
  // to 4 (see docs/architecture/testing.md).
  fullyParallel: true,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 4,
  retries: process.env.CI ? 2 : 1,
  // Several workers now share one Vite dev server and one machine's network
  // stack instead of one worker having it to itself, which occasionally
  // pushes a normal action past the 30s default under load (observed
  // sporadically during item 82's benchmarking, never reproducing when the
  // same spec was re-run alone) without any test logic actually being wrong.
  // 45s absorbs that real contention; it doesn't touch what's being
  // asserted, and retries stayed at 1 locally (was 0) for the same reason
  // CI already uses 2 -- real parallel timing noise, not flaky assertions.
  timeout: 45_000,
  // Issue #282: Playwright's default 5s expect timeout was too tight when two cloud workers shared
  // one dev server (11 specs failed or needed a retry, all passing in isolation).
  expect: { timeout: 10_000 },
  // 'dot' prints one character per test (a dot for a pass) instead of a full line per test,
  // and still prints full error detail for any failure — this run's output gets read back into
  // an LLM's context on every gate check (next-item / Run-Backlog.ps1), sometimes several times
  // per item on a retry, so a 40-line listing of passes was pure token cost for no signal.
  // Issue #677: the hosted run (.github/workflows/e2e.yml) also writes an HTML report for the
  // artifact and annotates failing specs in the run summary.
  reporter: process.env.CI ? [['dot'], ['github'], ['html', { open: 'never' }]] : 'dot',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [
    // The `-unit` specs at the top of e2e/ need no page or server (pure
    // logic, scripts, the SQLite adapter on sql.js).
    {
      name: 'unit',
      testMatch: [new RegExp(`^${e2eDir}[\\\\/][^\\\\/]+-unit\\.spec\\.ts$`, 'i')],
    },
    // Issue #79: the specs under e2e/local/ run the app on its on-device
    // SQLite database (the native apps' data path; in the browser, the
    // plugin's web stand-in). Each test's fresh browser context starts with
    // an empty database, like a first launch. Issue #938: the only data path
    // now; the data-layer contract (e2e/contract/) runs here too.
    // Issue #960: on a production build with the e2e hooks (the first server
    // below), which loads from about 28 requests instead of the dev server's
    // 760 modules per page load.
    {
      name: 'local',
      testMatch: [inE2e('local', 'contract')],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174', storageState: setupDone('http://localhost:5174') },
    },
    // Issue #784: the personal Android build's flags (Premium on by default,
    // dev switch shown), on the fourth server below.
    {
      name: 'personal',
      testMatch: [inE2e('personal')],
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5175', storageState: setupDone('http://localhost:5175') },
    },
    // Issue #784: the specs under e2e/build/ read a production build (the
    // store builds' bundle), made by the last server below.
    {
      name: 'build',
      testMatch: [inE2e('build')],
    },
  ],
  // The servers are never reused, so a run always tests this checkout's code
  // and flags. Stop a server you started yourself first (Playwright reports
  // the port as in use otherwise).
  webServer: [
    // Issue #960: the app for the `local` project's specs (e2e/local/,
    // e2e/contract/): a production build with the e2e hooks
    // (src/testHooks.ts) and the dev rows, built once per run into its own
    // folder, then served by `vite preview`.
    {
      command: 'npx vite build --outDir dist-e2e --emptyOutDir --logLevel error && npx vite preview --outDir dist-e2e --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_E2E_HOOKS: 'true', VITE_DEV_TOOLS: 'true' },
    },
    // Issue #784: the personal build's flags set.
    {
      command: 'npm run dev -- --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      env: { VITE_PREMIUM_UNLOCKED: 'true', VITE_DEV_TOOLS: 'true' },
    },
    // Issue #784: a fresh production build without the dev flags (its own
    // folder, so `dist` is left alone) for the `build` project, served only
    // so Playwright can tell the build has finished. Never reused, so the
    // build is always this checkout's.
    {
      command: 'npx vite build --outDir dist-e2e-build --emptyOutDir --logLevel error && npx vite preview --outDir dist-e2e-build --port 4317 --strictPort',
      url: 'http://localhost:4317',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
