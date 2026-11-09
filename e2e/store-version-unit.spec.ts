import { test, expect } from '@playwright/test'
import { getStoreVersion, loadStoreVersion, recoveryVersionLine, versionLabel } from '../src/lib/storeVersion'
import { buildFeatureRequest, buildHelpRequest } from '../src/lib/bugReport'

// Issue #1045: the store version (1.9.1) shows beside the internal build.

test('the Version row shows the store version first, then the build', () => {
  expect(versionLabel('1.9.1', 'v970+3c6eae1')).toBe('1.9.1 · build 970')
  expect(recoveryVersionLine('1.9.1', 'v970+3c6eae1')).toBe('RepBunny 1.9.1 (build 970)')
})

test('with no store version the display is the internal id, as before', () => {
  expect(versionLabel(null, 'v970+3c6eae1')).toBe('v970+3c6eae1')
  expect(recoveryVersionLine(null, 'v970+3c6eae1')).toBe('RepBunny v970+3c6eae1')
  expect(versionLabel('1.9.1', 'dev')).toBe('1.9.1')
})

test('off native nothing is read; on native App.getInfo supplies the version', async () => {
  let reads = 0
  expect(await loadStoreVersion(false, async () => { reads++; return { version: '1.9.1' } })).toBeNull()
  expect(reads).toBe(0)
  expect(await loadStoreVersion(true, async () => ({ version: ' 1.9.1 ' }))).toBe('1.9.1')
  expect(getStoreVersion()).toBe('1.9.1')
  expect(await loadStoreVersion(true, async () => { throw new Error('nope') })).toBeNull()
  expect(getStoreVersion()).toBeNull()
})

test('support emails add Store version and keep App version and Build', async () => {
  await loadStoreVersion(true, async () => ({ version: '1.9.1' }))
  const body = buildFeatureRequest({ request: 'x', appVersion: 'v970+3c6eae1' })
  expect(body).toContain('App version: v970+3c6eae1\nBuild: 970\nStore version: 1.9.1\n')
  expect(buildHelpRequest('q', 'v970+3c6eae1')).toContain('Store version: 1.9.1')
  await loadStoreVersion(false)
  expect(buildFeatureRequest({ request: 'x', appVersion: 'v970+3c6eae1' })).not.toContain('Store version')
})
