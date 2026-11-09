#!/usr/bin/env node
// The tester intro video on repbunny.app/testers (#649): about 50 seconds in
// the owner's own voice (Deaner2 on eleven_v4, #648) saying who they are,
// what RepBunny is, and what testers are asked to do, over quick shots of the
// app with made-up data. No feature tour on purpose. Captions are burned in,
// since most people watch muted. Recorded with the sprint review kit
// (review/kit.mjs), so taps get the same ripple and sound.
//
// Needs the local-mode dev server on :5174 (see guide-clips.mjs):
//   VITE_DATA=local npm run dev -- --port 5174 --strictPort
// then: node --env-file=.env.local scripts/demo-video/tester-intro.mjs
//
// Output:
//   site/video/tester-intro.mp4   480x1040, H.264 + AAC
//   site/video/tester-intro.vtt   the same lines as a captions track
//   site/img/tester-intro.webp    poster frame
// Work files go to the gitignored logs/demo-video/tester-intro/.

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderCard } from './cards.mjs'
import { BASE_URL, FFMPEG, FFPROBE, cardPiece, recordSegment, stitch } from './review/kit.mjs'

const WORK = join('logs', 'demo-video', 'tester-intro')
const VIDEO = join('site', 'video', 'tester-intro.mp4')
const VTT = join('site', 'video', 'tester-intro.vtt')
const POSTER = join('site', 'img', 'tester-intro.webp')

// The owner-approved script (#649), split into sentences so the captions and
// cuts keep pace. Spoken-text rules: scripts/demo-video/review/README.md.
const spec = {
  issue: 'tester-intro',
  captions: true,
  // Report a bug sits at the bottom of the Account sheet.
  captionsTop: true,
  spoken: "[warm] Hey, I'm Dean. I built RepBunny, and thanks for helping me test it.",
  prepare: async (page, kit) => {
    await kit.quietRest(page, { rest: false })
    await kit.seed(page, { premium: true })
  },
  lines: {
    what: "[proud] It's a simple strength log. No account. Your workouts stay on your phone.",
    ask: "[upbeat] Here's all I'm asking. Use it for the next two weeks.",
    real: "Log your real workouts, or make some up if you're not training right now.",
    stay: 'And please stay in the test the whole time.',
    premium: '[casual] Oh, and Premium is free for testers. When you unlock it, Google Play should show a test card. If it shows your real card, stop and tell me.',
    feedback: "[leaning in] And don't hold back on feedback. The more you send, the better.",
    how: 'If something is confusing, slow, or broken, tap the person icon, then Report a bug. Small stuff counts.',
    bye: "[warm] That's it. Have fun, and go lift something heavy.",
  },
  demo: async (page, { say, tap, reveal, sleep, nav }) => {
    const rows = page.locator('.set-row-draft')
    await say('what', () => tap(page.getByRole('button', { name: 'Push day', exact: true }), 600), 0.5)
    await say('ask', () => tap(rows.nth(0).getByRole('button', { name: /^Fill set 1 with target/ }), 500), 0.3)
    const poster = Date.now() / 1000
    await say('real', async () => {
      await tap(rows.nth(0).getByRole('button', { name: 'Add set' }), 700)
      await tap(rows.nth(0).getByRole('button', { name: /^Fill set 2 with target/ }), 400)
    }, 0.2)
    await say('stay', async () => {
      await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 400)
      await tap(page.getByText('Lift progress', { exact: true }), 400)
      await tap(page.getByText('Barbell Bench Press', { exact: true }).first(), 400)
    }, 0.1)
    // Over the Account sheet's Premium card (the seed has Premium on).
    await say('premium', async () => {
      await page.keyboard.press('Escape')
      await sleep(400)
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await page.getByRole('dialog', { name: 'Account', exact: true }).getByText('Premium is unlocked').evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }, 0.3)
    await say('feedback')
    // Points at Report a bug (ripples, twice) without opening it.
    await say('how', async () => {
      const bug = page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /Report a bug/ })
      // Mid-screen, clear of the burned-in caption near the bottom.
      await bug.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      await sleep(900)
      for (let i = 0; i < 2; i++) {
        const box = await bug.boundingBox()
        if (box) await page.evaluate(([x, y]) => window.__tapAt(x, y), [box.x + 60, box.y + box.height / 2])
        await sleep(1100)
      }
    }, 0.55)
    await say('bye', () => page.keyboard.press('Escape'), 0.4)
    return poster
  },
}

const up = await fetch(BASE_URL).then((r) => r.ok, () => false)
if (!up) throw new Error(`No dev server on ${BASE_URL}: run VITE_DATA=local npm run dev -- --port 5174 --strictPort`)

mkdirSync(WORK, { recursive: true })
const browser = await chromium.launch()
try {
  const clip = await recordSegment(browser, spec, join(WORK, 'segment'))
  if (clip.silent) throw new Error(`Recorded without a voice (${clip.silent}); needs ELEVENLABS_API_KEY`)

  const intro = await renderCard(browser, 'intro', ['Thanks for', 'testing!'], clip.poster, join(WORK, 'cards', 'intro'))
  const outro = await renderCard(browser, 'outro', ['Go lift', 'something heavy'], null, join(WORK, 'cards', 'outro'))
  const pieces = [
    cardPiece(intro, join(WORK, 'intro.mp4'), { music: 'start' }),
    clip.mp4,
    cardPiece(outro, join(WORK, 'outro.mp4'), { music: 'end' }),
  ]
  mkdirSync(join('site', 'video'), { recursive: true })
  stitch(pieces, VIDEO)

  // Captions track too, for screen readers and players that hide burned-in text.
  const ts = (s) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23)
  const cues = clip.marks.flatMap((m, i) => [`${i + 1}`, `${ts(intro.duration + m.at)} --> ${ts(intro.duration + m.at + m.duration)}`, m.text, ''])
  writeFileSync(VTT, ['WEBVTT', '', ...cues].join('\n'))
  // Poster: the intro card once the bunny is in, not a frame with a caption on it.
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '3', '-i', VIDEO, '-frames:v', '1', '-quality', '82', POSTER])

  const length = Number(String(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', VIDEO])).trim())
  console.log(`${VIDEO}: ${length.toFixed(1)}s, ${(statSync(VIDEO).size / 1024).toFixed(0)} KB; ${VTT}; ${POSTER}`)
} finally {
  await browser.close()
}
