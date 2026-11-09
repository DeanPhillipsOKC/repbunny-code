import { test, expect } from '@playwright/test'
import {
  BUILD_OFFSET,
  buildFromCount,
  isPreCutoverTag,
  PRE_CUTOVER_NOTES,
  PRE_CUTOVER_STORE_TAGS,
  SNAPSHOT_COMMIT,
  sinceTagRange,
  withPreCutoverTags,
} from '../scripts/lib/history.mjs'
import { preCutoverNotesAfter } from '../scripts/demo-video/review/collect.mjs'

// Issue #946: the code moved to this repo as one snapshot commit, so commit counts restarted at 1
// and the old store tags stayed in the backlog repo. Builds continue from the old repo's last one,
// and releases from before the move still count. No page needed.

test('the snapshot commit is build 969, the old repo last build', () => {
  expect(buildFromCount(1)).toBe(969)
  expect(BUILD_OFFSET).toBe(968)
})

test('the pre-cutover store tags are there, up to 1.9.0', () => {
  expect(PRE_CUTOVER_STORE_TAGS['store/v1.0.0']).toBe(529)
  expect(PRE_CUTOVER_STORE_TAGS['store/v1.9.0']).toBe(962)
  expect(isPreCutoverTag('store/v1.9.0')).toBe(true)
  expect(isPreCutoverTag('store/v1.9.1')).toBe(false)
})

test('git tags and pre-cutover tags merge without duplicates or junk', () => {
  const tags = withPreCutoverTags(['store/v1.9.1', 'store/v1.9.0', 'v1.0.40', 'store/vX'])
  expect(tags).toContain('store/v1.9.1')
  expect(tags).toContain('store/v1.0.0')
  expect(tags.filter((t) => t === 'store/v1.9.0')).toHaveLength(1)
  expect(tags).not.toContain('v1.0.40')
  expect(tags).not.toContain('store/vX')
})

test('a pre-cutover tag range starts at the snapshot commit', () => {
  expect(sinceTagRange('store/v1.9.0')).toBe(`${SNAPSHOT_COMMIT}..HEAD`)
  expect(sinceTagRange('store/v1.9.1', 'store/v1.9.2')).toBe('store/v1.9.1..store/v1.9.2')
})

test('notes after a pre-cutover build come oldest first', () => {
  const notes = { 'release-notes/2.json': { date: '2026-11-02', build: 20 }, 'release-notes/1.json': { date: '2026-11-01', build: 10 }, 'release-notes/3.json': { date: '2026-11-03', build: 30 } }
  expect(preCutoverNotesAfter(10, notes)).toEqual(['release-notes/2.json', 'release-notes/3.json'])
  expect(Object.values(PRE_CUTOVER_NOTES).every((n) => n.build <= 969 && /^\d{4}-\d{2}-\d{2}$/.test(n.date))).toBe(true)
})
