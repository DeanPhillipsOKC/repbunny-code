// Backlog item 100: a short chime alongside the existing rest-timer
// vibration (RestTimer.vue, WorkoutLogger.vue's finishRest), for when the
// phone screen stays on but unwatched -- a silent, unwatched countdown gives
// no usable signal even though vibration fired. Plays a user-supplied clip
// (public/rest-chime.mp3, bundled with the app, so it's available offline
// mid-workout).
//
// Mobile browsers block audio playback with no immediately-preceding user
// gesture, so the shared AudioContext must be created (or resumed, if the
// browser auto-suspended it) synchronously inside the same click handler
// that starts a rest period -- not lazily when the timer actually
// completes, which happens well after the gesture and would get silently
// blocked. `primeRestChimeAudio` does that priming and also kicks off
// fetching/decoding the picked clips (so they're ready well before a typical
// rest period ends); `playRestChime` (called later, from the timer-completion
// paths) just plays the picked clip, doing nothing if priming never happened.
import { EXTRA_SOUND_VALUES, playablePick } from './extras'
import { logClientError } from './errorLog'

const CHIME_URL = '/rest-chime.mp3'

let sharedAudioContext: AudioContext | null = null

function getAudioContextCtor(): typeof AudioContext | undefined {
  const win = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  return win.AudioContext ?? win.webkitAudioContext
}

// The clip for a sound value: 'classic' is the rest chime above; the Extras
// (#184) are short recorded clips in public/sounds/, named by their value.
// Both are precached (the mp3 glob), so they play offline mid-workout.
function clipUrl(value: string): string | null {
  if (value === 'classic') return CHIME_URL
  return EXTRA_SOUND_VALUES.includes(value) ? `/sounds/${value}.mp3` : null
}

// Decoded clips by URL. A failed fetch/decode is dropped so the next prime
// retries it.
const clips = new Map<string, Promise<AudioBuffer>>()

function loadClip(ctx: AudioContext, value: string): Promise<AudioBuffer> | null {
  const url = clipUrl(value)
  if (!url) return null
  let clip = clips.get(url)
  if (!clip) {
    clip = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url}: ${res.status}`)
        return res.arrayBuffer()
      })
      .then((data) => ctx.decodeAudioData(data))
    clips.set(url, clip)
    clip.catch(() => clips.delete(url))
  }
  return clip
}

// The Extras clips are normalized to about -16.5 LUFS and Classic sits at
// -18.1 LUFS (ffmpeg ebur128, 2026-10-13, #458). Played at 0.7 (-3.1 dB) every
// Extra lands within 2 LU of Classic; the harshest ones (air horn, whistle,
// cheer, ta-da) go a little lower, because they sound sharper than their
// loudness number says.
const EXTRA_GAIN = 0.7
const EXTRA_GAINS: Record<string, number> = {
  'air-horn': 0.67,
  whistle: 0.67,
  cheer: 0.67,
  'tada-horns': 0.67,
}

// Issue #826: on iPhone the in-app chime stayed silent. WebKit only unlocks
// audio for the page when a sound actually starts inside a tap, and it parks
// the context in a non-standard 'interrupted' state after a lock, a call, or
// a notification sound. So the prime starts a silent one-sample buffer and
// primes a plain <audio> element in the tap, anything but 'running' is
// resumed before playing, and if the context still can't run the clip plays
// through the <audio> element. Every miss is written to the client error log
// with the context state, so Report a bug shows which cause it was.
let fallbackAudio: HTMLAudioElement | null = null

function primeFallbackAudio(): void {
  try {
    if (typeof Audio === 'undefined') return
    if (!fallbackAudio) fallbackAudio = new Audio()
    fallbackAudio.muted = true
    fallbackAudio.src = CHIME_URL
    const started = fallbackAudio.play()
    if (started) {
      started.then(() => fallbackAudio?.pause()).catch(() => {})
    }
  } catch {
    // Priming is best effort.
  }
}

function playFallback(value: string): boolean {
  const url = clipUrl(value)
  if (!url || typeof Audio === 'undefined') return false
  try {
    if (!fallbackAudio) fallbackAudio = new Audio()
    fallbackAudio.muted = false
    fallbackAudio.src = url
    fallbackAudio.volume = value === 'classic' ? 1 : (EXTRA_GAINS[value] ?? EXTRA_GAIN)
    const started = fallbackAudio.play()
    if (started) started.catch((error: unknown) => logChimeFailure('fallback play failed', error))
    return true
  } catch (error) {
    logChimeFailure('fallback play failed', error)
    return false
  }
}

function logChimeFailure(what: string, error: unknown, ctx: AudioContext | null = sharedAudioContext): void {
  const detail = error instanceof Error ? error.message : error === undefined ? '' : String(error)
  logClientError({
    kind: 'error',
    message: `Rest chime: ${what}${detail ? `: ${detail}` : ''}`,
    stack: error instanceof Error ? (error.stack ?? null) : null,
    context: { operation: 'restChime', state: ctx?.state ?? 'none' },
    prompt: false,
  })
}

// A started silent sample inside the tap is what unlocks WebKit's audio.
function startSilentSample(ctx: AudioContext): void {
  try {
    const source = ctx.createBufferSource()
    source.buffer = ctx.createBuffer(1, 1, 22050)
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    // No unlock needed or possible here; playing still tries.
  }
}

function resumeIfNotRunning(): void {
  const ctx = sharedAudioContext
  if (!ctx || ctx.state === 'running') return
  void ctx.resume?.()?.catch?.(() => {})
}

let lifecycleListening = false

function listenForReturn(): void {
  if (lifecycleListening) return
  lifecycleListening = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resumeIfNotRunning()
  })
  window.addEventListener('pageshow', resumeIfNotRunning)
}

function playBuffer(ctx: AudioContext, value: string, buffer: AudioBuffer): void {
  const source = ctx.createBufferSource()
  source.buffer = buffer
  if (value === 'classic') {
    source.connect(ctx.destination)
  } else {
    const gain = ctx.createGain()
    gain.gain.value = EXTRA_GAINS[value] ?? EXTRA_GAIN
    source.connect(gain).connect(ctx.destination)
  }
  source.start()
}

function playClip(ctx: AudioContext, value: string): void {
  const clip = loadClip(ctx, value)
  if (!clip) return
  clip
    .then(async (buffer) => {
      if (ctx.state !== 'running') {
        const before = ctx.state
        try {
          await ctx.resume()
        } catch (error) {
          logChimeFailure(`resume failed from ${before}`, error, ctx)
        }
        if ((ctx.state as string) !== 'running') {
          logChimeFailure(`context not running (${before}), using the audio element`, undefined, ctx)
          playFallback(value)
          return
        }
      }
      playBuffer(ctx, value, buffer)
    })
    .catch((error: unknown) => {
      // Clip failed to fetch/decode, or the play threw. Try the audio
      // element; vibration fired either way.
      logChimeFailure('clip failed', error, ctx)
      playFallback(value)
    })
}

export function primeRestChimeAudio(): void {
  const Ctor = getAudioContextCtor()
  if (!Ctor) return
  if (!sharedAudioContext) sharedAudioContext = new Ctor()
  if (sharedAudioContext.state !== 'running') void sharedAudioContext.resume?.()?.catch?.(() => {})
  startSilentSample(sharedAudioContext)
  primeFallbackAudio()
  listenForReturn()

  // Fetch and decode what the timer and a record may play, well before
  // they're needed.
  loadClip(sharedAudioContext, playablePick('chime'))
  loadClip(sharedAudioContext, playablePick('fanfare'))
}

// Web Audio playback typically goes through the phone's media volume rather
// than the ringer/silent-mode channel, so this can audibly chime even with
// the phone muted -- intentional here (that's the point of item 100), not a
// bug to "fix" later.
//
// Issue #339: only while the app is on screen. With the screen off or the app
// in the background, the phone's rest alert is the signal, and it follows the
// user's notification setting; this clip doesn't.
export function playRestChime(): void {
  const ctx = sharedAudioContext
  if (!ctx) return
  if (document.visibilityState !== 'visible') return
  playClip(ctx, playablePick('chime'))
}

// The picked record fanfare, if any ('off' has no clip). The Add set tap that
// set the record already primed the AudioContext (WorkoutLogger.vue's
// completeRow).
export function playRecordFanfare(): void {
  const ctx = sharedAudioContext
  if (!ctx) return
  playClip(ctx, playablePick('fanfare'))
}

// A tap in the Extras picker: plays the sound right away (the tap is the
// gesture). 'off' plays nothing.
export function previewSound(value: string): void {
  primeRestChimeAudio()
  const ctx = sharedAudioContext
  if (!ctx) return
  playClip(ctx, value)
}
