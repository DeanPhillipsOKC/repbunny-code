import { test, expect } from '@playwright/test'
import { latestTag, nextTag } from '../scripts/next-store-version.mjs'
import { releaseEmail } from '../scripts/collect-release-notes.mjs'

// Issue #219: the Cut release workflow's version pick, which doesn't need a
// page (same "no separate unit-test runner" reasoning as
// client-error-log-unit.spec.ts).

const TAGS = ['store/v1.0.9', 'store/v1.0.10', 'store/v1.1.0', 'v1.0.300', 'store/vbad']

test('the latest store tag is the highest version, ignoring other tags', () => {
  expect(latestTag(TAGS)).toBe('store/v1.1.0')
  expect(latestTag(['v1.0.300'])).toBeNull()
})

test('a bump moves on from the latest store tag', () => {
  expect(nextTag({ tags: TAGS })).toBe('store/v1.1.1')
  expect(nextTag({ tags: TAGS, bump: 'minor' })).toBe('store/v1.2.0')
  expect(nextTag({ tags: TAGS, bump: 'major' })).toBe('store/v2.0.0')
  expect(nextTag({ tags: [] })).toBe('store/v1.0.0')
  expect(() => nextTag({ tags: TAGS, bump: 'huge' })).toThrow('patch, minor, or major')
})

test('an exact version overrides the bump and must be above the latest', () => {
  expect(nextTag({ tags: TAGS, bump: 'major', version: '1.3.0' })).toBe('store/v1.3.0')
  expect(nextTag({ tags: TAGS, version: 'v1.1.2' })).toBe('store/v1.1.2')
  expect(() => nextTag({ tags: TAGS, version: '1.1.0' })).toThrow('above the latest')
  expect(() => nextTag({ tags: TAGS, version: '1.0.11' })).toThrow('above the latest')
  expect(() => nextTag({ tags: TAGS, version: '1.2' })).toThrow('MAJOR.MINOR.PATCH')
})

test('a commit that already has a store tag is refused', () => {
  expect(() => nextTag({ tags: TAGS, headTags: ['store/v1.1.0'] })).toThrow('already released as store/v1.1.0')
  // The personal build's nightly tags don't count.
  expect(nextTag({ tags: TAGS, headTags: ['v1.0.300'] })).toBe('store/v1.1.1')
})

test('the testing email sends Android testers to closed testing and says how to promote', () => {
  const { html } = releaseEmail({ version: '1.1.1', ios: ['New'], android: ['New'] })
  expect(html).toContain('closed testing track, for testers only')
  expect(html).toContain('Test and release > Closed testing')
  expect(html).toContain('promote the closed testing release to production')
})
