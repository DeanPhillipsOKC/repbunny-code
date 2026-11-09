import type { Page } from '@playwright/test'

// Backlog item 100: src/lib/restChime.ts decodes and plays a real audio clip
// (public/rest-chime.mp3) through the Web Audio API, which e2e can't assert
// actual audio output for -- instead this stubs `window.AudioContext` (and
// the iOS-prefixed `webkitAudioContext`) with a fake whose `decodeAudioData`
// resolves immediately (skipping real decoding) and whose buffer-source
// `start()` just counts calls, so a test can assert the chime code path
// actually ran. Must be installed via `page.addInitScript` *before* the page
// navigates (it runs on every subsequent navigation, same as any other init
// script), since src/lib/restChime.ts reads `window.AudioContext` once, the
// first time a rest period is started (WorkoutLogger.vue's `completeRow`).
//
// Issue #184: the clips are still really fetched, and each start also records
// which file played and at what gain (`lastSoundPlayed`).
export interface SoundPlay {
  url: string
  gain: number
}

export async function installRestChimeSpy(page: Page) {
  await page.addInitScript(() => {
    const win = window as unknown as { __chimeCount: number; __soundPlays: { url: string; gain: number }[] }
    win.__chimeCount = 0
    win.__soundPlays = []

    // Which URL each fetched body came from, so a decoded buffer knows its file.
    const bodyUrls = new WeakMap<ArrayBuffer, string>()
    const arrayBuffer = Response.prototype.arrayBuffer
    Response.prototype.arrayBuffer = async function () {
      const data = await arrayBuffer.call(this)
      bodyUrls.set(data, new URL(this.url).pathname)
      return data
    }

    class FakeAudioContext {
      state = 'running'
      currentTime = 0
      destination = {}
      decodeAudioData(data: ArrayBuffer) {
        return Promise.resolve({ url: bodyUrls.get(data) ?? '' })
      }
      createGain() {
        return { gain: { value: 1 }, connect: (node: unknown) => node }
      }
      createBufferSource() {
        let gain = 1
        const source = {
          buffer: null as { url: string } | null,
          connect: (node: { gain?: { value: number } }) => {
            if (node.gain) gain = node.gain.value
            return node
          },
          start: () => {
            win.__chimeCount += 1
            win.__soundPlays.push({ url: source.buffer?.url ?? '', gain })
          },
        }
        return source
      }
      resume() {
        return Promise.resolve()
      }
    }

    ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext
    ;(window as unknown as { webkitAudioContext: unknown }).webkitAudioContext = FakeAudioContext
  })
}

export async function chimeCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __chimeCount: number }).__chimeCount)
}

export async function lastSoundPlayed(page: Page): Promise<SoundPlay | null> {
  return page.evaluate(() => (window as unknown as { __soundPlays: SoundPlay[] }).__soundPlays.at(-1) ?? null)
}
