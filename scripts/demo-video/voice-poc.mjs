// Issue #643: a listening test, not part of the pipeline. Renders a few real
// narration lines on today's model (eleven_multilingual_v2, no tags) and on
// eleven_v3 with audio tags, in Jessica's voice and the owner's clone, so the
// owner can pick by ear. Also probes for a newer tag-aware model.
//
//   node --env-file=.env.local scripts/demo-video/voice-poc.mjs
//
// Writes logs/demo-video/voice-poc/ (gitignored): one mp3 per line, model and
// voice, plus one stitched file per voice and model for easy listening, and
// results.json (what each call accepted). Only our own script text is sent.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join('logs', 'demo-video', 'voice-poc')
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const KEY = process.env.ELEVENLABS_API_KEY
if (!KEY) throw new Error('ELEVENLABS_API_KEY is unset (run with --env-file=.env.local)')

const VOICES = { jessica: 'cgSgspJ2msm6clMCkdW9', deaner: 'X8kRkdXqxXKyw5xP1oP6' }
// Model ids to try past v3. A 4xx just means it doesn't exist (or isn't ours).
const NEWER = ['eleven_v4', 'eleven_v4_alpha', 'eleven_v3_5']

// Two guide lines (routines clip) and two release notes as the sprint review
// reads them. `tagged` is the same words with v3 direction tags.
const LINES = [
  {
    id: '1-guide-setup',
    plain: "Doing the same workout every week, like a push day? Save it as a routine, and next time it's ready to go in one tap. No setting it up again.",
    tagged: "[warm, friendly] Doing the same workout every week, like a push day? [upbeat] Save it as a routine, and next time it's ready to go in one tap. [playful] No setting it up again.",
  },
  {
    id: '2-guide-done',
    plain: "That's it, your routine is saved. Head back to Home.",
    tagged: "[pleased] That's it, your routine is saved. [casual] Head back to Home.",
  },
  {
    id: '3-review-record',
    plain: 'The record celebration now shows the set you beat and when you did it. No more guessing what the number means.',
    tagged: '[excited] The record celebration now shows the set you beat and when you did it. [chuckles] No more guessing what the number means.',
  },
  {
    id: '4-review-units',
    plain: 'Records now compare pound and kilogram sets fairly. So switching units no longer hides a real record, or invents a fake one.',
    tagged: '[matter-of-fact] Records now compare pound and kilogram sets fairly. [confident] So switching units no longer hides a real record, [wry] or invents a fake one.',
  },
]

async function tts(voice, model, text, context) {
  const body = { text, model_id: model, ...context }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) }
  return { ok: true, audio: Buffer.from(await res.arrayBuffer()), cost: res.headers.get('character-cost') }
}

// Sends previous_text / next_text like narration.mjs does; if the model
// refuses them, retries without and records that.
async function render(voice, model, lines, i, key) {
  const context = {}
  if (i > 0) context.previous_text = lines[i - 1][key]
  if (i < lines.length - 1) context.next_text = lines[i + 1][key]
  let r = await tts(VOICES[voice], model, lines[i][key], context)
  let usedContext = true
  if (!r.ok && r.status === 400) {
    r = await tts(VOICES[voice], model, lines[i][key], {})
    usedContext = false
  }
  return { ...r, usedContext }
}

mkdirSync(OUT, { recursive: true })
const results = { probes: {}, renders: [] }

for (const model of NEWER) {
  const r = await tts(VOICES.jessica, model, 'Hi.', {})
  results.probes[model] = r.ok ? 'exists' : `${r.status}: ${r.error}`
  console.log(`probe ${model}: ${results.probes[model].slice(0, 120)}`)
}

const models = [
  { model: 'eleven_multilingual_v2', short: 'v2', key: 'plain' },
  { model: 'eleven_v3', short: 'v3', key: 'tagged' },
  ...NEWER.filter((m) => results.probes[m] === 'exists').map((m) => ({ model: m, short: m.replace('eleven_', ''), key: 'tagged' })),
]

for (const voice of Object.keys(VOICES)) {
  for (const { model, short, key } of models) {
    const files = []
    for (const [i, line] of LINES.entries()) {
      const r = await render(voice, model, LINES, i, key)
      const entry = { voice, model, line: line.id, ok: r.ok, usedContext: r.usedContext, cost: r.cost ?? null }
      if (!r.ok) {
        entry.error = `${r.status}: ${r.error}`
        console.log(`FAILED ${voice} ${short} ${line.id}: ${entry.error}`)
      } else {
        const file = join(OUT, `${voice}-${short}-${line.id}.mp3`)
        writeFileSync(file, r.audio)
        files.push(file)
        console.log(`ok ${voice} ${short} ${line.id} (chars billed: ${r.cost ?? '?'}, context: ${r.usedContext})`)
      }
      results.renders.push(entry)
    }
    if (files.length) {
      // One file per voice and model, with a second of silence between lines.
      const list = files.flatMap((f, i) => (i ? ['-f', 'lavfi', '-t', '1', '-i', 'anullsrc=r=44100:cl=mono', '-i', f] : ['-i', f]))
      const n = files.length * 2 - 1
      const filter = `${Array.from({ length: n }, (_, i) => `[${i}:a]`).join('')}concat=n=${n}:v=0:a=1[a]`
      execFileSync(FFMPEG, ['-y', '-v', 'error', ...list, '-filter_complex', filter, '-map', '[a]', '-b:a', '128k', join(OUT, `ALL-${voice}-${short}.mp3`)])
    }
  }
}

writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
console.log(`\nDone: ${OUT}`)
