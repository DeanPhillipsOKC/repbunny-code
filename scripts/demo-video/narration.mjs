// Narration for the guide clips (#424): turns a clip's script lines into
// spoken audio with the ElevenLabs text-to-speech API, cached in the repo so a
// re-record after a UI change calls ElevenLabs only for lines whose text (or
// voice) changed. With every line cached, ELEVENLABS_API_KEY isn't needed.
//
// Only our own script text is ever sent; nothing from a user goes to ElevenLabs.
//
// Cache: scripts/demo-video/audio/lines/<hash>.mp3, where the hash covers the
// line's text, the voice, the model, and the voice settings. The neighboring
// lines go along as previous_text / next_text so the delivery flows, but they
// aren't part of the key: rewording one line re-records only that line.
//
// #648: lines can carry audio tags in square brackets ("[warm] Hey there."),
// which eleven_v4 acts out rather than reads. Anything shown on screen
// (captions, cards, issue text) goes through stripTags first.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Not secret. Jessica is the in-app voice (guide clips, lifting basics); the
// owner's clone narrates release demos and promo videos (docs/decisions.md).
export const VOICES = { jessica: 'cgSgspJ2msm6clMCkdW9', deaner: 'X8kRkdXqxXKyw5xP1oP6' }
// Picked by the owner in the #643 listening test: acts out audio tags, and
// unlike eleven_v3 still takes previous_text / next_text.
export const MODEL_ID = 'eleven_v4'
// null sends no voice_settings, so the voice's own saved settings apply.
const VOICE_SETTINGS = null
export const LINES_DIR = join('scripts', 'demo-video', 'audio', 'lines')
const FFPROBE = process.env.FFPROBE ?? 'ffprobe'

// A line as shown on screen: its [tags] gone, with the spacing they leave.
export function stripTags(text) {
  return text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim()
}

function voiceId(voice) {
  const id = VOICES[voice]
  if (!id) throw new Error(`Unknown voice "${voice}" (one of ${Object.keys(VOICES).join(', ')})`)
  return id
}

function lineKey(text, voice = 'jessica') {
  return createHash('sha256')
    .update(JSON.stringify({ text, voice: voiceId(voice), model: MODEL_ID, settings: VOICE_SETTINGS }))
    .digest('hex')
    .slice(0, 16)
}

export function lineFile(text, voice = 'jessica') {
  return join(LINES_DIR, `${lineKey(text, voice)}.mp3`)
}

function duration(file) {
  const out = execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
  return Number(String(out).trim())
}

async function generate(text, previous, next, file, voice) {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) throw new Error(`Line not cached and ELEVENLABS_API_KEY is unset: "${text}"`)
  const body = { text, model_id: MODEL_ID }
  if (VOICE_SETTINGS) body.voice_settings = VOICE_SETTINGS
  if (previous) body.previous_text = previous
  if (next) body.next_text = next
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId(voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} for "${text}": ${await res.text()}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log(`  voiced: ${text}`)
}

// texts: one clip's lines in spoken order. Returns [{ text, caption, file,
// duration }], `text` as given (tags and all) and `caption` without the tags.
// `dir` moves the cache: the sprint review clips (#605) keep theirs in the
// gitignored logs/, so they're never committed and pruneLines never sees them.
// `voice` is a VOICES key.
export async function voiceLines(texts, { dir = LINES_DIR, voice = 'jessica' } = {}) {
  mkdirSync(dir, { recursive: true })
  const out = []
  for (const [i, text] of texts.entries()) {
    const file = join(dir, `${lineKey(text, voice)}.mp3`)
    if (!existsSync(file)) await generate(text, texts[i - 1], texts[i + 1], file, voice)
    out.push({ text, caption: stripTags(text), file, duration: duration(file) })
  }
  return out
}

// Deletes cached lines no clip uses any more (call with every clip's lines,
// as [text, voice] pairs or plain Jessica texts).
export function pruneLines(keep) {
  const used = new Set(keep.map((t) => (Array.isArray(t) ? `${lineKey(t[0], t[1])}.mp3` : `${lineKey(t)}.mp3`)))
  for (const name of existsSync(LINES_DIR) ? readdirSync(LINES_DIR) : []) {
    if (name.endsWith('.mp3') && !used.has(name)) {
      rmSync(join(LINES_DIR, name))
      console.log(`  pruned unused line ${name}`)
    }
  }
}
