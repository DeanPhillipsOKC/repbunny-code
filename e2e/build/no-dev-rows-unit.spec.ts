import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Issue #784: a production build without VITE_DEV_TOOLS (the store builds, and
// this project's server) must not contain the Premium (dev) rows. The build
// project's server builds into dist-e2e-build without the flag.

test('a production build without VITE_DEV_TOOLS has no Premium (dev) rows', () => {
  const dir = path.resolve('dist-e2e-build', 'assets')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    expect(text, file).not.toContain('Premium (dev)')
    expect(text, file).not.toContain('Reset Premium hints (dev)')
  }
})

// Issue #960: the e2e suite's hooks (src/testHooks.ts) are only in the `local`
// project's VITE_E2E_HOOKS build, never in a store build.
test('a production build without VITE_E2E_HOOKS has no e2e hooks', () => {
  const dir = path.resolve('dist-e2e-build', 'assets')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8')
    expect(text, file).not.toContain('__rbImport')
    expect(text, file).not.toContain('__rbLocalDb')
    expect(text, file).not.toContain('rb-dev-fail-next-update')
  }
})
