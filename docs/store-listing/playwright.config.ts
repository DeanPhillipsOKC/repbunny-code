import { defineConfig } from '@playwright/test'

// Issue #725: the store screenshot capture (capture.ts), not a test. It runs
// the app in local mode (on-device SQLite, like the store apps) on its own
// port, so it never touches an account and can run beside the e2e gate.
//   npx playwright test --config docs/store-listing/playwright.config.ts
// STORE_SIZE=appstore renders the App Store size instead of Play's.
export default defineConfig({
  testDir: '.',
  testMatch: 'capture.ts',
  outputDir: '../../logs/store-listing/test-results',
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5176' },
  webServer: {
    command: 'npm run dev -- --port 5176 --strictPort',
    url: 'http://localhost:5176',
    reuseExistingServer: false,
    env: { VITE_DATA: 'local' },
  },
})
