#!/usr/bin/env node
// Records the narrated lifting basics video (#426): the ideas from the five
// basics cards (#419) and a few gym words, for someone brand new, then a real
// clip of logging a set. Built with the guide clips' pipeline (#424): the same
// intro and outro cards, bumper music, sound effects, Jessica's voice, and
// cached lines (narration.mjs), so a re-render calls ElevenLabs only for a new
// or reworded line. Not part of any gate; it makes no assertions.
//
// Order: the intro card, which zooms out onto the setup card ("New to the
// gym?") while the setup line plays; six concept cards (cards/concept.html, one
// template, each visual timed to its lines); the app clip, recorded like
// guide-clips.mjs (back-to-back screenshots, a pink ripple per tap); then the
// outro card.
//
// Runs against the local-mode dev server on :5174 (see guide-clips.mjs):
//   VITE_DATA=local npm run dev -- --port 5174 --strictPort
//
// Output:
//   site/video/guides/lifting-basics.{mp4,vtt}  the guide page's copy
//   public/video/lifting-basics.{mp4,vtt,webp}   the app's copy (bundled, so it plays offline)
//   site/img/guides/clip-lifting-basics.webp     the guide page's poster
// Frames go to the gitignored logs/demo-video/guides/lifting-basics/.
//
// Usage: node --env-file=.env.local scripts/demo-video/lifting-basics.mjs [facebook] [--voice=deaner]
//
// `facebook` renders the Facebook Reel cut instead: the same video with no
// "Follow along on TikTok" line on the outro. `--voice=deaner` narrates it in
// the owner's clone instead of Jessica, with its lines cached in the gitignored
// logs/demo-video/audio-lines/ (a trial, so nothing new is committed). Either one
// writes only to logs/demo-video/guides/lifting-basics[-facebook][-deaner].mp4
// (posted by hand) and leaves the site's and the app's copies alone.

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { voiceLines } from './narration.mjs'
import { renderCard } from './cards.mjs'
import { INTRO, OUTRO, SETUP, CONCEPTS, APP, LINES } from './lifting-basics-script.mjs'

const SLUG = 'lifting-basics'
const ARGS = process.argv.slice(2)
const FACEBOOK = ARGS.includes('facebook')
const VOICE = ARGS.find((a) => a.startsWith('--voice='))?.slice('--voice='.length) ?? 'jessica'
if (ARGS.some((a) => a !== 'facebook' && !a.startsWith('--voice='))) throw new Error('Usage: lifting-basics.mjs [facebook] [--voice=deaner]')
// Any cut but the default one is a social copy, posted by hand from logs/.
const SOCIAL = FACEBOOK || VOICE !== 'jessica'
const BASE_URL = 'http://localhost:5174'
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const FFPROBE = process.env.FFPROBE ?? 'ffprobe'
const WORK = join('logs', 'demo-video', 'guides', SLUG)
const SITE_VIDEO = join('site', 'video', 'guides')
const APP_VIDEO = join('public', 'video')
const POSTER = join('site', 'img', 'guides', `clip-${SLUG}.webp`)
const AUDIO = join('scripts', 'demo-video', 'audio')
const VIEW = { width: 390, height: 845 }
const OUT_W = 480
const OUT_H = 1040
const BEAT = 0.35 // silence between lines
const LEAD = 0.6 // a card's visual lands before its first line
const TAIL = 0.6 // and holds after its last
// Levels against the voice at 1.0, as in guide-clips.mjs; each concept card's
// whoosh is softer than the intro's, since there are six of them.
const LEVEL = { music: 0.5, tap: 0.35, whoosh: 0.6, chime: 0.7, cardWhoosh: 0.3 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now() / 1000


const browser = await chromium.launch()
const spoken = await voiceLines(LINES, VOICE === 'jessica' ? {} : { voice: VOICE, dir: join('logs', 'demo-video', 'audio-lines') })
const voice = new Map(spoken.map((l) => [l.text, l]))
rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

// ---- Cards: setup, then the concepts, each as long as its lines ----
async function card(kind, lines, n, lead = LEAD) {
  const t = []
  let at = lead
  for (const text of lines) {
    t.push(at)
    at += voice.get(text).duration + BEAT
  }
  const d = at - BEAT + TAIL
  const out = await renderCard(browser, 'concept', ['', ''], null, join(WORK, `card-${n}-${kind}`), {
    kind, d: d.toFixed(3), t: t.map((x) => x.toFixed(3)).join(','), n: String(n), of: String(CONCEPTS.length + 1),
  })
  return { ...out, lines: lines.map((text, i) => ({ ...voice.get(text), at: t[i] })) }
}
const cards = [await card('setup', [SETUP], 0, 0.3)]
for (const [i, [kind, lines]] of CONCEPTS.entries()) cards.push(await card(kind, lines, i + 1))
const setupFrame = join(WORK, 'card-0-setup', '0000.jpg')

// ---- The app clip: logging one set ----
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, colorScheme: 'dark' })
const page = await context.newPage()
await page.addInitScript(() => {
  addEventListener('pointerdown', (e) => {
    if (!window.__showTaps) return
    const dot = document.createElement('div')
    dot.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;
      border-radius:50%;background:rgba(242,135,156,.45);border:2px solid #f2879c;pointer-events:none;z-index:2147483647;
      transition:transform .45s ease-out,opacity .45s ease-out;`
    document.documentElement.appendChild(dot)
    requestAnimationFrame(() => { dot.style.transform = 'scale(1.6)'; dot.style.opacity = '0' })
    setTimeout(() => dot.remove(), 500)
  }, true)
  addEventListener('DOMContentLoaded', () => {
    document.head.insertAdjacentHTML('beforeend', '<style>.about-version,.app-version{visibility:hidden!important}</style>')
  })
})

// Off camera: a workout with bench press in it, ready for its first set.
await page.goto(BASE_URL)
await page.getByRole('button', { name: 'Skip setup' }).click()
const unit = page.getByRole('dialog', { name: 'Which unit do you lift in?' })
await unit.waitFor({ timeout: 4000 }).then(() => unit.getByRole('button', { name: 'lb' }).click(), () => {})
await page.getByText('Welcome to RepBunny').waitFor()
await page.getByRole('button', { name: /^Start a workout/ }).click()
const sheet = page.getByRole('dialog', { name: 'Add exercise' })
await sheet.getByPlaceholder('Search exercises').fill('Bench')
await sheet.getByRole('button', { name: 'Add Barbell Bench Press', exact: true }).click()
await sheet.getByRole('button', { name: 'Done', exact: true }).click()
await page.getByLabel('Weight').first().waitFor()
await sleep(800)

// On camera.
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
const tap = async (locator, after = 900) => {
  await sleep(450)
  taps.push(now())
  await locator.click()
  await sleep(after)
}
const type = async (locator, text) => {
  await tap(locator, 250)
  await locator.pressSequentially(text, { delay: 110 })
  await sleep(500)
}
const say = async (key, step, lead = 0.6) => {
  const line = voice.get(APP[key])
  const at = now()
  marks.push({ ...line, at })
  await sleep(line.duration * lead * 1000)
  await step?.()
  const left = at + line.duration + BEAT - now()
  if (left > 0) await sleep(left * 1000)
}
await sleep(400)
await say('weight', () => type(page.getByLabel('Weight').first(), '135'), 0.7)
await say('reps', async () => {
  await type(page.getByLabel('Reps').first(), '8')
  await page.evaluate(() => document.activeElement?.blur())
}, 0.2)
await say('add', () => tap(page.getByRole('button', { name: 'Add set' }).first(), 600), 0.5)
await say('nice', () => tap(page.getByRole('button', { name: 'Nice!' }), 600), 0.75)
await sleep(1000)
capturing = false
await captureDone
await context.close()

const dir = join(WORK, 'app')
mkdirSync(join(dir, 'frames'), { recursive: true })
let list = 'ffconcat version 1.0\n'
const t0 = frames[0].t
frames.forEach((f, i) => {
  const name = String(i).padStart(5, '0') + '.jpg'
  writeFileSync(join(dir, 'frames', name), Buffer.from(f.data, 'base64'))
  const next = frames[i + 1]?.t ?? f.t + 0.5
  list += `file 'frames/${name}'\nduration ${(next - f.t).toFixed(4)}\n`
})
list += `file 'frames/${String(frames.length - 1).padStart(5, '0')}.jpg'\n`
writeFileSync(join(dir, 'frames.txt'), list)
const lastFrame = join(dir, 'frames', String(frames.length - 1).padStart(5, '0') + '.jpg')

// ---- Title cards, then the timeline ----
const intro = await renderCard(browser, 'intro', INTRO, setupFrame, join(WORK, 'intro'))
const outro = await renderCard(browser, 'outro', OUTRO, lastFrame, join(WORK, 'outro'), FACEBOOK ? { follow: '0' } : {})
let at = intro.duration
const cardStarts = cards.map((c) => { const start = at; at += c.duration; return start })
const clipAt = at
const clipLen = frames.at(-1).t + 0.5 - t0
const outroAt = clipAt + clipLen
const total = outroAt + outro.duration
const inClip = (t) => clipAt + (t - t0)

const said = [
  ...cards.flatMap((c, i) => c.lines.map((l) => ({ ...l, at: cardStarts[i] + l.at }))),
  ...marks.map((m) => ({ ...m, at: inClip(m.at) })),
]
const sounds = [
  ...said.map((l) => [l.file, l.at, 1]),
  ...taps.map((t) => [join(AUDIO, 'sfx-tap.mp3'), inClip(t), LEVEL.tap]),
  ...cards.flatMap((c, i) => c.sounds.map(([name, t]) => [join(AUDIO, `sfx-${name}.mp3`), cardStarts[i] + t, LEVEL.cardWhoosh])),
  ...intro.sounds.map(([name, t]) => [join(AUDIO, `sfx-${name}.mp3`), t, LEVEL[name]]),
  ...outro.sounds.map(([name, t]) => [join(AUDIO, `sfx-${name}.mp3`), outroAt + t, LEVEL[name]]),
]
const music = join(AUDIO, 'bumper-gym-hype.mp3')
const musicLen = Number(String(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', music])).trim())
const f = (n) => n.toFixed(3)
const ms = (s) => Math.round(s * 1000)

// Inputs: intro, the cards, the app clip, outro, the music twice, then each sound.
const patterns = [intro, ...cards]
const appIn = patterns.length
const outroIn = appIn + 1
const musicIn = outroIn + 1
const S = musicIn + 2
const graph = [
  ...patterns.map((_, i) => `[${i}:v]format=yuv420p,setsar=1[v${i}]`),
  `[${appIn}:v]fps=30,scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=1,trim=duration=${f(clipLen)}[va]`,
  `[${outroIn}:v]format=yuv420p,setsar=1[vo]`,
  `${patterns.map((_, i) => `[v${i}]`).join('')}[va][vo]concat=n=${patterns.length + 2}:v=1:a=0[v]`,
  `[${musicIn}:a]atrim=0:${f(intro.duration + 0.3)},afade=t=out:st=${f(intro.duration - 0.9)}:d=1.1,volume=${LEVEL.music}[m0]`,
  `[${musicIn + 1}:a]atrim=start=${f(Math.max(0, musicLen - outro.duration))},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,volume=${LEVEL.music},adelay=${ms(outroAt)}:all=1[m1]`,
  ...sounds.map(([, t, vol], i) => `[${S + i}:a]volume=${vol},adelay=${ms(t)}:all=1[s${i}]`),
  `[m0][m1]${sounds.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sounds.length + 2}:normalize=0:duration=longest,alimiter=limit=0.95[a]`,
].join(';')

const socialName = `${SLUG}${FACEBOOK ? '-facebook' : ''}${VOICE !== 'jessica' ? `-${VOICE}` : ''}.mp4`
const mp4 = SOCIAL ? join('logs', 'demo-video', 'guides', socialName) : join(SITE_VIDEO, `${SLUG}.mp4`)
if (!SOCIAL) {
  mkdirSync(SITE_VIDEO, { recursive: true })
  mkdirSync(APP_VIDEO, { recursive: true })
}
execFileSync(FFMPEG, [
  '-y', '-loglevel', 'error',
  ...patterns.flatMap((p) => ['-framerate', '30', '-i', p.pattern]),
  '-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt'),
  '-framerate', '30', '-i', outro.pattern,
  '-i', music, '-i', music,
  ...sounds.flatMap(([file]) => ['-i', file]),
  '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', f(total),
  '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '28', '-profile:v', 'main', '-tune', 'animation', '-r', '30',
  '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', mp4,
], { stdio: 'inherit' })

if (SOCIAL) {
  console.log(`${mp4}: ${total.toFixed(1)}s, ${(statSync(mp4).size / 1024).toFixed(0)} KB`)
  await browser.close()
  process.exit(0)
}

const ts = (s) => new Date(ms(s)).toISOString().slice(11, 23)
const vtt = ['WEBVTT', '', ...said.flatMap((m, i) => [`${i + 1}`, `${ts(m.at)} --> ${ts(m.at + m.duration)}`, m.caption, ''])].join('\n')
writeFileSync(join(SITE_VIDEO, `${SLUG}.vtt`), vtt)

// The poster is the setup card: the bunny and "New to the gym?".
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', setupFrame, '-c:v', 'libwebp', '-quality', '80', POSTER], { stdio: 'inherit' })
copyFileSync(mp4, join(APP_VIDEO, `${SLUG}.mp4`))
copyFileSync(join(SITE_VIDEO, `${SLUG}.vtt`), join(APP_VIDEO, `${SLUG}.vtt`))
copyFileSync(POSTER, join(APP_VIDEO, `${SLUG}.webp`))
console.log(`${mp4}: ${total.toFixed(1)}s, ${(statSync(mp4).size / 1024).toFixed(0)} KB, ${frames.length} app frames, ${taps.length} taps`)
await browser.close()
