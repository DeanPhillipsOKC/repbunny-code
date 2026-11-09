#!/usr/bin/env node
// The Google Play promo video (#816): about 40 seconds, landscape, in the
// owner's own voice (Deaner2 on eleven_v4, #648) with audio tags. The app
// plays in a phone on the left of a 1920x1080 stage, with a headline for each
// line on the right in the store screenshots' style (docs/store-listing.md),
// so it reads muted too. Made-up data only, and the Android app's screens
// only: no web app, per docs/decisions.md. Recorded with the sprint review
// kit (review/kit.mjs), so taps get the same ripple and sound.
//
// Needs the local-mode dev server on :5174 (see guide-clips.mjs):
//   VITE_DATA=local npm run dev -- --port 5174 --strictPort
// then: node --env-file=.env.local scripts/demo-video/play-promo.mjs
//
// Output, all in the gitignored logs/demo-video/play-promo/ (the owner
// uploads the video to YouTube; it isn't committed):
//   play-promo.mp4   1920x1080, H.264 + AAC
//   play-promo.vtt   the spoken lines, for YouTube's captions
//   thumbnail.jpg    a frame for YouTube's thumbnail

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderCard, serveRepo } from './cards.mjs'
import { AUDIO, BASE_URL, FFMPEG, FFPROBE, cardPiece, recordSegment, stitch } from './review/kit.mjs'

const WORK = join('logs', 'demo-video', 'play-promo')
const VIDEO = join(WORK, 'play-promo.mp4')
const VTT = join(WORK, 'play-promo.vtt')
const THUMB = join(WORK, 'thumbnail.jpg')
const MUSIC_LEVEL = 0.1

// One headline per spoken line, in the order they're said; `open` is the
// opening line. *Stars* mark the pink phrase.
const HEADS = {
  open: { title: 'Your log stays *on your phone*', sub: 'No account. No ads. No tracking.' },
  log: { title: 'Log a set *in seconds*', sub: "Last time's weight and reps, filled in." },
  rest: { title: 'Rest, then *go again*', sub: 'The timer starts when you log a set.' },
  record: { title: 'Celebrate *real records*', sub: 'With the numbers behind them.' },
  progress: { title: 'See every lift *get stronger*', sub: 'Charts built from your own sets.' },
  free: { title: 'Logging is *free. Always.*', sub: 'Premium is a one-time unlock. No subscription.' },
  outro: { title: 'Small wins. *Stronger every set.*', sub: 'RepBunny: the private workout log.' },
}

const spec = {
  issue: 'play-promo',
  spoken: '[reassuring] Your workouts stay on your phone. No account, no ads, no tracking.',
  prepare: async (page, kit) => {
    await kit.quietRest(page)
    await kit.seed(page, { premium: false })
  },
  lines: {
    log: "[casual] Start a routine, and last time's numbers are already filled in. One tap logs the set.",
    rest: '[playful] Then the bunny times your rest, so you know when to go again.',
    record: '[pleased] Beat your best, and RepBunny celebrates it with you.',
    progress: "[warm] Every lift gets its own chart, so you can see how far you've come.",
    free: "[sincere] And logging is free. Always. I'm Dean, I built RepBunny, and I hope it helps you lift.",
  },
  demo: async (page, { say, tap, sleep, nav }) => {
    const rows = page.locator('.set-row-draft')
    const rest = page.locator('.rest-overlay')
    await say('log', async () => {
      await tap(page.getByRole('button', { name: 'Push day', exact: true }), 1400)
      await tap(rows.nth(0).getByRole('button', { name: 'Add set' }), 300)
    }, 0.3)
    await rest.waitFor({ state: 'visible', timeout: 4000 })
    await say('rest', () => tap(rest.getByRole('button', { name: 'Back to workout' }), 500), 0.75)
    // A weight well over the seeded best, so the record is real app logic.
    let poster
    await say('record', async () => {
      const weight = rows.nth(0).getByLabel('Weight')
      await tap(weight, 200)
      await weight.fill('')
      await weight.pressSequentially('165', { delay: 110 })
      await sleep(250)
      await tap(rows.nth(0).getByRole('button', { name: 'Add set' }), 300)
      // With rest on, the record shows on the rest screen: "Heaviest yet".
      await rest.getByText('Heaviest yet').waitFor({ timeout: 4000 })
      poster = Date.now() / 1000
    }, 0.1)
    await say('progress', async () => {
      await rest.getByRole('button', { name: 'Skip Rest' }).click()
      const nice = page.getByRole('button', { name: 'Nice!' })
      if (await nice.isVisible().catch(() => false)) await nice.click()
      await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 250)
      await tap(page.getByText('Lift progress', { exact: true }), 250)
      await tap(page.getByText('Barbell Bench Press', { exact: true }).first(), 300)
    }, 0)
    // The chart stays up under the closing line.
    await say('free')
    return poster
  },
}

// Screenshots one layer of cards/promo-stage.html (transparent unless it's the backdrop).
async function stageLayer(browser, params, out) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  await serveRepo(context)
  const page = await context.newPage()
  await page.goto(`http://card.local/scripts/demo-video/cards/promo-stage.html?${new URLSearchParams(params)}`)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})))
  })
  const stage = await page.evaluate(() => window.STAGE)
  await page.screenshot({ path: out, omitBackground: params.layer !== 'bg' })
  await context.close()
  return stage
}

const up = await fetch(BASE_URL).then((r) => r.ok, () => false)
if (!up) throw new Error(`No dev server on ${BASE_URL}: run VITE_DATA=local npm run dev -- --port 5174 --strictPort`)

mkdirSync(WORK, { recursive: true })
const browser = await chromium.launch()
try {
  const clip = await recordSegment(browser, spec, join(WORK, 'segment'))
  if (clip.silent) throw new Error(`Recorded without a voice (${clip.silent}); needs ELEVENLABS_API_KEY`)

  const outro = await renderCard(browser, 'outro', ['Small wins.', 'Every set.'], null, join(WORK, 'cards', 'outro'), { follow: '0' })
  const phone = join(WORK, 'phone.mp4')
  stitch([clip.mp4, cardPiece(outro, join(WORK, 'outro.mp4'))], phone)

  // The stage layers, and when each headline shows: from its line to the next.
  const keys = ['open', ...Object.keys(spec.lines)]
  const { screen } = await stageLayer(browser, { layer: 'bg' }, join(WORK, 'stage-bg.png'))
  await stageLayer(browser, { layer: 'bezel' }, join(WORK, 'stage-bezel.png'))
  const heads = []
  for (const [i, key] of [...keys, 'outro'].entries()) {
    const file = join(WORK, `head-${key}.png`)
    await stageLayer(browser, { layer: 'head', ...HEADS[key] }, file)
    const start = key === 'outro' ? clip.duration : clip.marks[i].at
    const end = key === 'outro' ? clip.duration + outro.duration : (clip.marks[i + 1]?.at ?? clip.duration)
    heads.push({ file, start, end })
  }

  // Stack it: backdrop, the phone clip in the screen box, the rim, then each
  // headline fading in and out, over the clip's sound plus a quiet music bed.
  const total = clip.duration + outro.duration
  const f = (n) => n.toFixed(3)
  const inputs = [
    '-loop', '1', '-t', f(total), '-i', join(WORK, 'stage-bg.png'),
    '-i', phone,
    '-loop', '1', '-t', f(total), '-i', join(WORK, 'stage-bezel.png'),
    ...heads.flatMap((h) => ['-loop', '1', '-t', f(total), '-i', h.file]),
    '-stream_loop', '-1', '-i', join(AUDIO, 'bumper-gym-hype.mp3'),
  ]
  const music = 3 + heads.length
  const graph = [
    `[1:v]scale=${screen.w}:${screen.h}:flags=lanczos[ph]`,
    `[0:v][ph]overlay=${screen.x}:${screen.y}:shortest=1[s0]`,
    `[s0][2:v]overlay=0:0[s1]`,
    ...heads.map((h, i) => `[${3 + i}:v]format=rgba,fade=t=in:st=${f(h.start)}:d=0.3:alpha=1,fade=t=out:st=${f(Math.max(h.start, h.end - 0.25))}:d=0.25:alpha=1[h${i}]`),
    ...heads.map((_, i) => `[s${i + 1}][h${i}]overlay=0:0[s${i + 2}]`),
    `[s${heads.length + 1}]format=yuv420p,setsar=1[v]`,
    `[${music}:a]aresample=44100,atrim=0:${f(total)},afade=t=in:d=0.5,afade=t=out:st=${f(total - 1.5)}:d=1.5,volume=${MUSIC_LEVEL}[m]`,
    `[1:a][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`,
  ].join(';')
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', f(total),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', VIDEO,
  ], { stdio: 'inherit' })

  const ts = (s) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23)
  const cues = clip.marks.flatMap((m, i) => [`${i + 1}`, `${ts(m.at)} --> ${ts(m.at + m.duration)}`, m.text, ''])
  writeFileSync(VTT, ['WEBVTT', '', ...cues].join('\n'))
  // Thumbnail: the record celebration, with its headline up.
  const recordAt = clip.marks[keys.indexOf('record')].at + 2.5
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', f(recordAt), '-i', VIDEO, '-frames:v', '1', '-q:v', '3', THUMB])

  const length = Number(String(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', VIDEO])).trim())
  console.log(`${VIDEO}: ${length.toFixed(1)}s, ${(statSync(VIDEO).size / 1024).toFixed(0)} KB; ${VTT}; ${THUMB}`)
} finally {
  await browser.close()
}
