import { test, expect } from '@playwright/test'

// Issue #826: on iPhone the rest chime stayed silent (WebKit's 'interrupted'
// context state, no unlock inside the tap). This drives src/lib/restChime.ts
// with a mocked AudioContext and <audio> element and checks that priming
// unlocks and resumes, playing waits for resume, and a context that can't run
// falls back to the audio element.

interface Fake {
  state: string
  resumes: number
  starts: number
  stayStopped: boolean
}

const made: Fake[] = []
const audioPlays: { src: string; muted: boolean }[] = []
let cached: typeof import('../src/lib/restChime') | null = null

async function load() {
  // Imported before the browser globals exist: Vue reads `document` at import.
  cached ??= await import('../src/lib/restChime')
  audioPlays.length = 0
  if (made[0]) Object.assign(made[0], { state: 'running', resumes: 0, starts: 0, stayStopped: false })
  const g = globalThis as Record<string, unknown>
  g.window = g
  g.document = { visibilityState: 'visible', addEventListener: () => {} }
  g.addEventListener = () => {}
  g.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  g.Audio = class {
    src = ''
    muted = false
    volume = 1
    play() {
      audioPlays.push({ src: this.src, muted: this.muted })
      return Promise.resolve()
    }
    pause() {}
  }
  g.AudioContext = class {
    state = 'running'
    destination = {}
    resumes = 0
    starts = 0
    stayStopped = false
    constructor() {
      made.push(this as unknown as Fake)
    }
    decodeAudioData() {
      return Promise.resolve({})
    }
    createBuffer() {
      return {}
    }
    createGain() {
      return { gain: { value: 1 }, connect: (n: unknown) => n }
    }
    createBufferSource() {
      return { buffer: null, connect: (n: unknown) => n, start: () => (this.starts += 1) }
    }
    resume() {
      this.resumes += 1
      if (!this.stayStopped) this.state = 'running'
      return Promise.resolve()
    }
  }
  return { mod: cached, made, audioPlays }
}

const settle = () => new Promise((r) => setTimeout(r, 20))

test.describe.configure({ mode: 'serial' })

test('priming starts a silent sample to unlock audio', async () => {
  const { mod, made, audioPlays } = await load()
  mod.primeRestChimeAudio()
  expect(made[0].starts).toBe(1)
  expect(audioPlays.some((p) => p.muted)).toBe(true)
})

for (const state of ['interrupted', 'suspended']) {
  test(`a ${state} context is resumed by priming and before playing`, async () => {
    const { mod, made } = await load()
    mod.primeRestChimeAudio()
    await settle()
    const startsBefore = made[0].starts
    made[0].state = state
    mod.playRestChime()
    await settle()
    expect(made[0].resumes).toBeGreaterThan(0)
    expect(made[0].starts).toBe(startsBefore + 1)
  })
}

test('a running context plays right away without resuming', async () => {
  const { mod, made } = await load()
  mod.primeRestChimeAudio()
  await settle()
  const resumes = made[0].resumes
  mod.playRestChime()
  await settle()
  expect(made[0].resumes).toBe(resumes)
  expect(made[0].starts).toBe(2)
})

test('a context that cannot run falls back to the audio element', async () => {
  const { mod, made, audioPlays } = await load()
  mod.primeRestChimeAudio()
  await settle()
  made[0].state = 'interrupted'
  made[0].stayStopped = true
  const startsBefore = made[0].starts
  mod.playRestChime()
  await settle()
  expect(made[0].starts).toBe(startsBefore)
  expect(audioPlays.at(-1)).toEqual({ src: '/rest-chime.mp3', muted: false })
})
