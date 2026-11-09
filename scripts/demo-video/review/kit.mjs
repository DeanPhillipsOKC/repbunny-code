// Sprint review clips (dry run, 2026-10-15): records one shipped change as a
// short narrated segment, with no title cards or music, so sprint-review.mjs
// can stitch several into one review video. Same capture approach as
// guide-clips.mjs: back-to-back full-res screenshots, a pink ripple on each
// tap, and each step waiting for its line to finish. Lines are voiced by
// narration.mjs, cached in the gitignored logs/demo-video/review/lines/ (#605),
// so a re-record calls ElevenLabs only for new text. Without
// ELEVENLABS_API_KEY, or when ElevenLabs can't be reached, the clip is
// recorded silent with each line shown as a caption instead.
//
// A clip spec (clips/<issue>.mjs) is:
//   export default {
//     issue: 535,
//     title: ['Note for', 'today'],     // the title card's two lines
//     note: '<the release note text>',  // shown in the review issue
//     spoken: 'The note, rewritten for text-to-speech.',  // spoken first, over the opening screen
//     prepare: (page, kit) => kit.seed(page, { premium: false }),   // off camera, optional
//     lines: { key: 'One short spoken line per step.' },
//     demo: async (page, { say, tap, type, reveal, zoom, unzoom, sleep, nav }) => { ... },
//   }
// Optional, for the social cuts: `view` ({ width, height } in CSS pixels, default 390x845),
// `outWidth` (the clip's width, default 480; the height follows the view's shape), and
// `openingStep` (a step that runs during the opening line, as `say`'s step does, at
// `openingLead`, so the clip can open on a tap instead of a still screen), and `crf` (a
// sharper segment for one that's composited again, with better audio).
// See README.md for how to write one.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { stripTags, voiceLines } from '../narration.mjs'
import { seed, quietRest } from '../seed.mjs'

export const BASE_URL = 'http://localhost:5174'
export const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
export const FFPROBE = process.env.FFPROBE ?? 'ffprobe'
export const AUDIO = join('scripts', 'demo-video', 'audio')
export const OUT_W = 480
export const OUT_H = 1040
const VIEW = { width: 390, height: 845 }
const BEAT = 0.35
const TAP_LEVEL = 0.35
const MAX_SECONDS = 75
const LINES = join('logs', 'demo-video', 'review', 'lines')
// A silent clip's line lasts about as long as the voice takes to say it.
const silentLength = (text) => 0.6 + stripTags(text).split(/\s+/).length / 2.6
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now() / 1000

export const nav = (page) => page.getByRole('navigation', { name: 'Primary' })

// Voices the lines, or returns silent ones (file: null) and why: no key for a
// line that isn't cached, or ElevenLabs refused or couldn't be reached.
async function lineAudio(texts) {
  try {
    // Release demos are in the owner's voice (#648, docs/decisions.md). REVIEW_VOICE=jessica
    // swaps it for a one-off cut, such as a public sample.
    return { lines: await voiceLines(texts, { dir: LINES, voice: process.env.REVIEW_VOICE || 'deaner' }), silent: null }
  } catch (e) {
    const reason = e.message.split('\n')[0].replace(/:? "[^"]*"/, '').slice(0, 200)
    console.warn(`Recording silent with captions: ${reason}`)
    return { lines: texts.map((text) => ({ text, caption: stripTags(text), file: null, duration: silentLength(text) })), silent: reason }
  }
}

// Records `spec` into `dir` and returns { mp4, duration, marks, poster, silent }
// (`silent` is null, or why the clip has captions instead of a voice).
// Throws with the failing step's line when a step can't find its target, so
// the caller can report "couldn't record" instead of shipping a broken clip.
export async function recordSegment(browser, spec, dir) {
  // The note's first sentence, not the whole note, which repeats the step lines (#606).
  const opening = spec.spoken ?? spec.note.split(/(?<=[.?!])\s/)[0]
  const texts = [opening, ...Object.values(spec.lines)]
  const { lines: spoken, silent } = await lineAudio(texts)
  const voice = new Map(spoken.map((l) => [l.text, l]))
  // Silent clips always show their lines; `captions: true` burns them in on a
  // voiced clip too (the tester intro, #649, made for watching muted), and
  // `captionsTop: true` moves them up when the bottom of the screen matters.
  const captioned = silent || spec.captions
  const view = spec.view ?? VIEW
  const outW = spec.outWidth ?? OUT_W
  const outH = spec.view ? Math.round((outW * view.height) / view.width / 2) * 2 : OUT_H

  const context = await browser.newContext({ viewport: view, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  await page.addInitScript(() => {
    // The ripple goes up on the target before the click and holds a moment, so
    // the viewer sees what's tapped before the screen changes (owner feedback:
    // a ripple drawn on the click itself often landed on the next screen).
    window.__tapAt = (x, y) => {
      const dot = document.createElement('div')
      dot.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;
        border-radius:50%;background:rgba(242,135,156,.5);border:2px solid #f2879c;pointer-events:none;z-index:2147483647;
        transform:scale(.6);transition:transform .2s ease-out,opacity .45s ease-out;`
      document.documentElement.appendChild(dot)
      requestAnimationFrame(() => { dot.style.transform = 'scale(1)' })
      setTimeout(() => { dot.style.transform = 'scale(1.6)'; dot.style.opacity = '0' }, 420)
      setTimeout(() => dot.remove(), 900)
    }
    addEventListener('DOMContentLoaded', () => {
      document.head.insertAdjacentHTML('beforeend', '<style>.about-version,.app-version{visibility:hidden!important}</style>')
    })
  })

  // ---- Off camera ----
  await page.goto(BASE_URL)
  await page.getByRole('button', { name: 'Skip setup' }).click()
  const unit = page.getByRole('dialog', { name: 'Which unit do you lift in?' })
  await unit.waitFor({ timeout: 4000 }).then(() => unit.getByRole('button', { name: 'lb' }).click(), () => {})
  await page.getByText('Welcome to RepBunny').waitFor()
  await spec.prepare?.(page, { seed, quietRest, nav, sleep })
  await sleep(800)

  // ---- On camera ----
  const frames = []
  const marks = []
  const taps = []
  const cdp = await context.newCDPSession(page)
  let capturing = true
  const captureDone = (async () => {
    while (capturing) {
      const t = now()
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92 })
      frames.push({ t, data })
    }
  })()
  await page.evaluate(() => (window.__showTaps = true))
  const reveal = (locator, block = 'center') =>
    locator.evaluate(async (el, block) => {
      const r = el.getBoundingClientRect()
      if (r.top >= 60 && r.bottom <= innerHeight - 90 && block === 'center') return false
      el.style.scrollMarginTop = '72px'
      el.scrollIntoView({ behavior: 'smooth', block })
      let last = NaN
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 80))
        const top = el.getBoundingClientRect().top
        if (top === last) break
        last = top
      }
      return true
    }, block)
  const tap = async (locator, after = 900) => {
    const scrolled = await reveal(locator)
    await sleep(scrolled ? 450 : 300)
    const box = await locator.boundingBox()
    if (box) await page.evaluate(([x, y]) => window.__tapAt(x, y), [box.x + box.width / 2, box.y + box.height / 2])
    taps.push(now())
    await sleep(320)
    await locator.click()
    await sleep(after)
  }
  const type = async (locator, text) => {
    await tap(locator, 250)
    await locator.pressSequentially(text, { delay: 90 })
    await sleep(500)
  }
  // Silent clips show each line as a caption, captured with the frames.
  const caption = (text) =>
    page.evaluate(([text, top]) => {
      let box = document.getElementById('__review-caption')
      if (!box) {
        box = document.createElement('div')
        box.id = '__review-caption'
        box.style.cssText = `position:fixed;left:16px;right:16px;${top ? 'top:72px' : 'bottom:96px'};padding:10px 14px;border-radius:12px;
          background:rgba(0,0,0,.78);color:#fff;font:600 17px/1.35 Manrope,system-ui,sans-serif;text-align:center;
          pointer-events:none;z-index:2147483646;`
        document.documentElement.appendChild(box)
      }
      box.textContent = text
      box.style.display = text ? 'block' : 'none'
    }, [text, spec.captionsTop === true])
  const say = async (text, step, lead = 0.6) => {
    const line = voice.get(text)
    if (!line) throw new Error(`Line not in the spec: ${text}`)
    const at = now()
    marks.push({ ...line, at })
    if (captioned) await caption(line.caption)
    await sleep(line.duration * lead * 1000)
    try {
      await step?.()
    } catch (e) {
      throw new Error(`Step failed at "${text}": ${e.message.split('\n')[0]}`)
    }
    const left = at + line.duration + BEAT - now()
    if (left > 0) await sleep(left * 1000)
  }
  // Zooms the page in on a small change (a label, a badge) so it reads at
  // phone size, centered on it and never so far that it leaves the screen,
  // so pick the smallest element that shows the change. Stays zoomed until
  // unzoom() or the clip ends. The body is scaled, so the caption and tap
  // ripples (on <html>) stay full size; fixed bars scale with the page.
  const zoom = async (locator, scale = 2) => {
    await reveal(locator)
    await locator.evaluate((el, scale) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const r = range.getBoundingClientRect().width ? range.getBoundingClientRect() : el.getBoundingClientRect()
      const b = document.body.getBoundingClientRect()
      const k = Math.max(1, Math.min(scale, (innerWidth - 24) / r.width, (innerHeight - 240) / r.height))
      const cx = r.left + r.width / 2 - b.left
      const cy = r.top + r.height / 2 - b.top
      const s = document.body.style
      s.transformOrigin = '0 0'
      s.transition = 'transform .6s ease-in-out'
      s.transform = `translate(${innerWidth / 2 - b.left - k * cx}px, ${innerHeight / 2 - b.top - k * cy}px) scale(${k})`
    }, scale)
    await sleep(800)
  }
  const unzoom = async () => {
    await page.evaluate(() => (document.body.style.transform = ''))
    await sleep(700)
  }
  let posterAt
  try {
    await sleep(400)
    await say(opening, spec.openingStep && (() => spec.openingStep(page, { tap, type, sleep, nav: () => nav(page) })), spec.openingLead)
    posterAt = await spec.demo(page, {
      say: (key, step, lead) => {
        if (!(key in spec.lines)) throw new Error(`No line "${key}" in lines`)
        return say(spec.lines[key], step, lead)
      },
      tap, type, reveal, zoom, unzoom, sleep, nav: () => nav(page),
    })
    if (captioned) await caption('')
    await sleep(1000)
  } finally {
    capturing = false
    await captureDone
    await context.close()
  }

  // ---- Encode: frames + voice + taps, no cards or music ----
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'frames'), { recursive: true })
  let list = 'ffconcat version 1.0\n'
  let posterFrame = Math.floor(frames.length / 2)
  const t0 = frames[0].t
  frames.forEach((f, i) => {
    const name = String(i).padStart(5, '0') + '.jpg'
    writeFileSync(join(dir, 'frames', name), Buffer.from(f.data, 'base64'))
    const next = frames[i + 1]?.t ?? f.t + 0.5
    list += `file 'frames/${name}'\nduration ${(next - f.t).toFixed(4)}\n`
    if (posterAt && f.t <= posterAt) posterFrame = i
  })
  list += `file 'frames/${String(frames.length - 1).padStart(5, '0')}.jpg'\n`
  writeFileSync(join(dir, 'frames.txt'), list)
  const duration = frames.at(-1).t + 0.5 - t0
  if (duration > MAX_SECONDS) throw new Error(`Clip is ${duration.toFixed(0)}s; keep it under ${MAX_SECONDS}s`)
  if (frames.length < 30) throw new Error('Clip has almost no frames')

  const sounds = [
    ...marks.filter((m) => m.file).map((m) => [m.file, m.at - t0, 1]),
    ...taps.map((t) => [join(AUDIO, 'sfx-tap.mp3'), t - t0, TAP_LEVEL]),
  ]
  const f = (n) => n.toFixed(3)
  const ms = (s) => Math.max(0, Math.round(s * 1000))
  const graph = [
    `[0:v]fps=30,scale=${outW}:${outH}:flags=lanczos,format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=1,trim=duration=${f(duration)}[v]`,
    `anullsrc=r=44100:cl=stereo,atrim=duration=${f(duration)}[silence]`,
    ...sounds.map(([, at, vol], i) => `[${1 + i}:a]aresample=44100,volume=${vol},adelay=${ms(at)}:all=1[s${i}]`),
    `[silence]${sounds.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sounds.length + 1}:normalize=0:duration=first,alimiter=limit=0.95[a]`,
  ].join(';')
  const mp4 = join(dir, 'segment.mp4')
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt'),
    ...sounds.flatMap(([file]) => ['-i', file]),
    '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', f(duration),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(spec.crf ?? 26), '-r', '30',
    '-c:a', 'aac', '-b:a', spec.crf ? '160k' : '96k', '-ar', '44100', '-ac', '2', mp4,
  ], { stdio: 'inherit' })
  const poster = join(dir, 'poster.jpg')
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', join(dir, 'frames', String(posterFrame).padStart(5, '0') + '.jpg'),
    '-vf', `scale=${outW}:${outH}:flags=lanczos`, poster])
  rmSync(join(dir, 'frames'), { recursive: true, force: true })
  console.log(`${mp4}: ${duration.toFixed(1)}s, ${(statSync(mp4).size / 1024).toFixed(0)} KB, ${frames.length} frames, ${taps.length} taps`)
  if (silent) console.log(`Silent, with captions: ${silent}`)
  const result = { mp4, width: outW, height: outH, duration, marks: marks.map((m) => ({ text: m.caption, at: m.at - t0, duration: m.duration })), poster, silent }
  writeFileSync(join(dir, 'clip.json'), JSON.stringify(result, null, 2) + '\n')
  return result
}

// Levels for the cards' sound effects and music, against the voice at 1.0.
const CARD_LEVEL = { music: 0.45, whoosh: 0.6, chime: 0.7, tap: 0.35 }
const probe = (file) => Number(String(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])).trim())
const fx = (n) => n.toFixed(3)
const msOf = (s) => Math.max(0, Math.round(s * 1000))

// One card as an mp4 piece: its frames, its sound effects, and optional music.
export function cardPiece(card, out, { music } = {}) {
  const sounds = card.sounds.map(([name, at]) => [join(AUDIO, `sfx-${name}.mp3`), at, CARD_LEVEL[name] ?? 0.6])
  const inputs = ['-framerate', '30', '-i', card.pattern, ...sounds.flatMap(([file]) => ['-i', file])]
  const graph = [`[0:v]format=yuv420p,setsar=1[v]`, `anullsrc=r=44100:cl=stereo,atrim=duration=${fx(card.duration)}[silence]`]
  const mix = ['[silence]']
  sounds.forEach(([, at, vol], i) => {
    graph.push(`[${1 + i}:a]aresample=44100,volume=${vol},adelay=${msOf(at)}:all=1[s${i}]`)
    mix.push(`[s${i}]`)
  })
  if (music) {
    const file = join(AUDIO, 'bumper-gym-hype.mp3')
    inputs.push('-i', file)
    const idx = 1 + sounds.length
    const len = probe(file)
    graph.push(music === 'start'
      ? `[${idx}:a]aresample=44100,atrim=0:${fx(card.duration)},afade=t=out:st=${fx(card.duration - 1)}:d=1,volume=${CARD_LEVEL.music}[m]`
      : `[${idx}:a]aresample=44100,atrim=start=${fx(Math.max(0, len - card.duration))},asetpts=PTS-STARTPTS,afade=t=in:d=0.4,volume=${CARD_LEVEL.music * 0.6}[m]`)
    mix.push('[m]')
  }
  graph.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,alimiter=limit=0.95[a]`)
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph.join(';'), '-map', '[v]', '-map', '[a]', '-t', fx(card.duration),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-r', '30', '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-ac', '2', out,
  ], { stdio: 'inherit' })
  return out
}

// Joins mp4 pieces (cards and clips) into one video (sprint review, tester intro).
// `crf` sets the quality (lower is sharper); the social cuts use a sharper one.
export function stitch(pieces, out, { crf = 27 } = {}) {
  const graph = pieces.map((_, i) => `[${i}:v]setsar=1,fps=30[v${i}];[${i}:a]aresample=44100[a${i}]`).join(';') + ';' +
    pieces.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${pieces.length}:v=1:a=1[v][a]`
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', ...pieces.flatMap((p) => ['-i', p]), '-filter_complex', graph, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'main', '-r', '30', '-c:a', 'aac', '-b:a', crf < 27 ? '160k' : '96k',
    '-movflags', '+faststart', out,
  ], { stdio: 'inherit' })
}
