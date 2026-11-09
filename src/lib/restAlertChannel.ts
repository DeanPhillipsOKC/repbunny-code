import { EXTRA_SOUND_VALUES } from './extras'

// Issue #640: on Android 8+ a notification's sound belongs to its channel, so
// the rest-over alert gets one channel per chime (restAlert.ts creates them
// at launch). The clips are copies of public/rest-chime.mp3 and
// public/sounds/*.mp3 in android/app/src/main/res/raw/, named lowercase with
// underscores. A channel's sound can't change once it exists, so a new clip
// or a changed one needs a new version here; the old channels are deleted.
const CHANNEL_VERSION = 'v1'
const CHANNEL_PREFIX = 'rest-alert-'

export const REST_SOUND_VALUES: string[] = ['classic', ...EXTRA_SOUND_VALUES]

export function restChannelId(value: string): string {
  return `${CHANNEL_PREFIX}${REST_SOUND_VALUES.includes(value) ? value : 'classic'}-${CHANNEL_VERSION}`
}

export function restChannelSound(value: string): string {
  const name = REST_SOUND_VALUES.includes(value) ? value : 'classic'
  return `${name === 'classic' ? 'rest_chime' : name.replace(/-/g, '_')}.mp3`
}

// Issue #828: on iOS the sound is a file in the app bundle's public/ folder
// (the plugin looks there, top level only). They're IMA4 .caf copies of the
// same clips, named rest-alert-<value>.caf (iOS refuses .mp3 notification
// sounds), served from public/ like everything else.
export function restIosSound(value: string): string {
  const name = REST_SOUND_VALUES.includes(value) ? value : 'classic'
  return `rest-alert-${name}.caf`
}

export function restChannelIds(): string[] {
  return REST_SOUND_VALUES.map(restChannelId)
}

// Channels this app made earlier that no current sound uses.
export function staleRestChannelIds(existing: string[]): string[] {
  const current = new Set(restChannelIds())
  return existing.filter((id) => id.startsWith(CHANNEL_PREFIX) && !current.has(id))
}
