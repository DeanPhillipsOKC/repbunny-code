import { existsSync, statSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { REST_SOUND_VALUES, restChannelId, restChannelIds, restChannelSound, restIosSound, staleRestChannelIds } from '../src/lib/restAlertChannel'

// Issue #640: which Android channel (and so which sound) the rest-over alert uses.

test('the classic chime maps to rest_chime and Extras to underscored clips', () => {
  expect(restChannelId('classic')).toBe('rest-alert-classic-v1')
  expect(restChannelSound('classic')).toBe('rest_chime.mp3')
  expect(restChannelId('boxing-bell')).toBe('rest-alert-boxing-bell-v1')
  expect(restChannelSound('boxing-bell')).toBe('boxing_bell.mp3')
})

test('an unknown pick falls back to the classic channel', () => {
  expect(restChannelId('bells')).toBe('rest-alert-classic-v1')
  expect(restChannelSound('bells')).toBe('rest_chime.mp3')
})

test('every sound has its own channel', () => {
  expect(new Set(restChannelIds()).size).toBe(REST_SOUND_VALUES.length)
})

test('only old rest-alert channels are stale', () => {
  const stale = staleRestChannelIds(['rest-alert-classic-v0', 'rest-alert-classic-v1', 'rest-live-end', 'other'])
  expect(stale).toEqual(['rest-alert-classic-v0'])
})

// Issue #828: the iOS alert names a bundled .caf, or it would be silent.
test('every sound has a bundled .caf for iOS, and an unknown pick falls back to classic', () => {
  for (const value of REST_SOUND_VALUES) {
    const file = restIosSound(value)
    expect(file).toMatch(/^rest-alert-[a-z-]+\.caf$/)
    expect(statSync(`public/${file}`).size).toBeGreaterThan(1000)
  }
  expect(restIosSound('bells')).toBe('rest-alert-classic.caf')
  expect(existsSync('public/rest-alert-classic.caf')).toBe(true)
})
