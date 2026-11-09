import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import config from '../playwright.config'

// Issue #933: the hosted e2e run (.github/workflows/e2e.yml) is split across two
// jobs, and each names the projects it runs. A project added to
// playwright.config.ts but not to the workflow would quietly drop out of the
// release gate, so every project must be named there, and `local` (the one
// that's split) must run in both halves.

const workflow = fs.readFileSync('.github/workflows/e2e.yml', 'utf8')
const named = new Set([...workflow.matchAll(/--project=([\w-]+)/g)].map((m) => m[1]))

test('the hosted e2e run names every Playwright project', () => {
  const projects = (config.projects ?? []).map((p) => p.name)
  expect(projects.length).toBeGreaterThan(0)
  for (const name of projects) expect(named, `project ${name} in e2e.yml`).toContain(name)
  for (const name of named) expect(projects, `e2e.yml's --project=${name}`).toContain(name)
})

test('the hosted e2e run splits the local project into both halves', () => {
  expect(workflow).toMatch(/part: \[1, 2\]/)
  expect(workflow).toContain('--project=local --shard=${{ matrix.part }}/2')
})
