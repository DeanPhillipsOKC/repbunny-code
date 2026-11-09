import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// Issue #936: Release-PersonalAndroid.ps1 ends with a best-effort owner-check block whose lookups
// (a PR number's `gh api`) fail on purpose. Actions' pwsh step ends with `exit $LASTEXITCODE`, so the
// script must reset it after the block or a published release reports a failed step (#934).
// A text check is the cheapest guard for a pwsh script; no page needed.

const src = readFileSync('scripts/Release-PersonalAndroid.ps1', 'utf8')
const lines = src.split(/\r?\n/)

test('the owner-check block is followed by a LASTEXITCODE reset', () => {
  const blockStart = lines.findIndex((l) => /^# Owner check/.test(l))
  expect(blockStart, 'owner-check block marker').toBeGreaterThan(-1)
  const resetAt = lines.findIndex((l, i) => i > blockStart && /^\s*\$global:LASTEXITCODE\s*=\s*0\b/.test(l))
  expect(resetAt, 'reset after the owner-check block').toBeGreaterThan(blockStart)
})

test('nothing after the reset runs a native command that could leave a non-zero exit code', () => {
  const resetAt = lines.map((l) => /^\s*\$global:LASTEXITCODE\s*=\s*0\b/.test(l)).lastIndexOf(true)
  expect(resetAt).toBeGreaterThan(-1)
  const after = lines.slice(resetAt + 1).filter((l) => l.trim() && !l.trim().startsWith('#'))
  // Only block-closing braces may follow.
  expect(after.filter((l) => l.trim() !== '}')).toEqual([])
})
