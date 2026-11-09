#!/usr/bin/env node
// Records the narrated how-to clips on the repbunny.app guide pages (#401,
// narrated in #424): routines, starter programs, and log a workout, then
// importing from Strong or Hevy, exercise history, monthly reports, and
// next-set targets (#434), which seed ten weeks of workouts first, and the
// mid-workout ones (#433): rest timer, swap a taken machine, plate calculator,
// and fix a past workout. Same capture approach as stopwatch.mjs (back-to-back
// full-res screenshots, a pink ripple on each tap). Not part of any gate; it
// makes no assertions.
//
// Each clip is: the intro card (cards/intro.html) with the bumper music, which
// fades as the card zooms out onto the app's first screen; that screen held
// still while Jessica says the clip's setup line; "Here's how." and the step
// lines, each step waiting for its line to finish before the next tap; then the
// outro card (cards/outro.html) with the chime and the music's ending. Every
// tap gets the soft tap sound. Lines are voiced by narration.mjs (ElevenLabs,
// cached in scripts/demo-video/audio/lines/, so the key is only needed when a
// line changes); the music and effects are the shared files in audio/.
//
// Runs against the local-mode dev server on :5174, so every clip starts from an
// empty on-device database with no test accounts on screen:
//   npm run dev -- --port 5174 --strictPort
//
// Output, written straight into the site:
//   site/video/guides/<slug>.mp4      480x1040, 30fps, H.264 + AAC
//   site/video/guides/<slug>.vtt      captions, from the same lines and timings
//   site/img/guides/clip-<slug>.webp  poster frame
// Frames go to the gitignored logs/demo-video/guides/.
//
// Usage: node scripts/demo-video/guide-clips.mjs [slug ...]   (default: all of them)

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { voiceLines, pruneLines } from './narration.mjs'
import { renderCard } from './cards.mjs'
import { LINES as BASICS_LINES } from './lifting-basics-script.mjs'
import { seed, quietRest } from './seed.mjs'

const BASE_URL = 'http://localhost:5174'
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'
const FFPROBE = process.env.FFPROBE ?? 'ffprobe'
const WORK = join('logs', 'demo-video', 'guides')
const VIDEO_DIR = join('site', 'video', 'guides')
const POSTER_DIR = join('site', 'img', 'guides')
const AUDIO = join('scripts', 'demo-video', 'audio')
// 390x845 CSS px at 2x, encoded at 480x1040 (the guide screenshots' width).
const VIEW = { width: 390, height: 845 }
const OUT_W = 480
const OUT_H = 1040
const HOW = "Here's how."
const BEAT = 0.35 // silence after each line before the next step
// Levels against the voice at 1.0, as in the proof of concept.
const LEVEL = { music: 0.5, tap: 0.35, whoosh: 0.6, chime: 0.7 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now() / 1000

const browser = await chromium.launch()

async function record(slug, clip) {
  const spoken = await voiceLines([clip.setup, HOW, ...Object.values(clip.lines)])
  const voice = new Map(spoken.map((l) => [l.text, l]))

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
    // The build version would date the clip; the guide screenshots hide it too.
    addEventListener('DOMContentLoaded', () => {
      document.head.insertAdjacentHTML('beforeend', '<style>.about-version,.app-version{visibility:hidden!important}</style>')
    })
  })

  // ---- Off camera ----
  await page.goto(BASE_URL)
  // The setup wizard (#397) opens on a fresh install; skip it and pick lb.
  await page.getByRole('button', { name: 'Skip setup' }).click()
  const unit = page.getByRole('dialog', { name: 'Which unit do you lift in?' })
  await unit.waitFor({ timeout: 4000 }).then(() => unit.getByRole('button', { name: 'lb' }).click(), () => {})
  await page.getByText('Welcome to RepBunny').waitFor()
  await clip.prepare?.(page)
  await sleep(800)

  // ---- On camera ----
  const frames = []
  const marks = [] // one per spoken line: { text, file, duration, at }
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
  // Scrolls a target into view smoothly, so the clip never jumps. `block` is
  // where it lands, as for scrollIntoView; it stays put if already in view.
  const reveal = (locator, block = 'center') =>
    locator.evaluate(async (el, block) => {
      const r = el.getBoundingClientRect()
      if (r.top >= 60 && r.bottom <= innerHeight - 90 && block === 'center') return false
      el.style.scrollMarginTop = '72px'
      el.scrollIntoView({ behavior: 'smooth', block })
      // Wait for the smooth scroll to settle, so the viewer sees the target before the tap.
      let last = NaN
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 80))
        const top = el.getBoundingClientRect().top
        if (top === last) break
        last = top
      }
      return true
    }, block)
  // Taps scroll their target into view first, so the viewer sees it before the tap.
  const tap = async (locator, after = 900) => {
    const scrolled = await reveal(locator)
    await sleep(scrolled ? 600 : 450)
    taps.push(now())
    await locator.click()
    await sleep(after)
  }
  const type = async (locator, text) => {
    await tap(locator, 250)
    await locator.pressSequentially(text, { delay: 110 })
    await sleep(500)
  }
  // Speaks one line and runs its step. The step starts once `lead` of the line
  // has played (so the tap lands as the line names it), and the next step waits
  // until the line is over plus a beat, so the screen never runs ahead of it.
  const say = async (text, step, lead = 0.6) => {
    const line = voice.get(text)
    if (!line) throw new Error(`Line not in ${slug}'s script: ${text}`)
    const at = now()
    marks.push({ ...line, at })
    await sleep(line.duration * lead * 1000)
    await step?.()
    const left = at + line.duration + BEAT - now()
    if (left > 0) await sleep(left * 1000)
  }
  await sleep(500)
  await say(clip.setup)
  await say(HOW)
  const posterAt = await clip.demo(page, { say: (key, step, lead) => say(clip.lines[key], step, lead), tap, type, reveal, sleep })
  await sleep(1200)
  capturing = false
  await captureDone
  await context.close()

  // Frames + an ffconcat list with each frame's on-screen duration.
  const dir = join(WORK, slug)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(join(dir, 'frames'), { recursive: true })
  let list = 'ffconcat version 1.0\n'
  let posterFrame = frames.length - 1
  const t0 = frames[0].t
  frames.forEach((f, i) => {
    const name = String(i).padStart(5, '0') + '.jpg'
    writeFileSync(join(dir, 'frames', name), Buffer.from(f.data, 'base64'))
    const next = frames[i + 1]?.t ?? f.t + 0.5
    list += `file 'frames/${name}'\nduration ${(next - f.t).toFixed(4)}\n`
    if (posterAt && f.t <= posterAt) posterFrame = i
  })
  // The concat demuxer drops the last entry's duration unless the file repeats.
  list += `file 'frames/${String(frames.length - 1).padStart(5, '0')}.jpg'\n`
  writeFileSync(join(dir, 'frames.txt'), list)
  const frame = (i) => join(dir, 'frames', String(i).padStart(5, '0') + '.jpg')

  // Title cards, over the clip's first and last frames.
  const intro = await renderCard(browser, 'intro', clip.intro, frame(0), join(dir, 'intro'))
  const outro = await renderCard(browser, 'outro', clip.outro, frame(frames.length - 1), join(dir, 'outro'))
  const clipLen = frames.at(-1).t + 0.5 - t0
  const outroAt = intro.duration + clipLen
  const total = outroAt + outro.duration
  const inClip = (t) => intro.duration + (t - t0)

  // Every sound: [file, start (s), volume].
  const sounds = [
    ...marks.map((m) => [m.file, inClip(m.at), 1]),
    ...taps.map((t) => [join(AUDIO, 'sfx-tap.mp3'), inClip(t), LEVEL.tap]),
    ...intro.sounds.map(([name, at]) => [join(AUDIO, `sfx-${name}.mp3`), at, LEVEL[name]]),
    ...outro.sounds.map(([name, at]) => [join(AUDIO, `sfx-${name}.mp3`), outroAt + at, LEVEL[name]]),
  ]
  const music = join(AUDIO, 'bumper-gym-hype.mp3')
  const musicLen = Number(String(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', music])).trim())
  const f = (n) => n.toFixed(3)
  const ms = (s) => Math.round(s * 1000)
  const S = 5 // input index of the first sound
  const graph = [
    `[0:v]format=yuv420p,setsar=1[v0]`,
    `[1:v]fps=30,scale=${OUT_W}:${OUT_H}:flags=lanczos,format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=1,trim=duration=${f(clipLen)}[v1]`,
    `[2:v]format=yuv420p,setsar=1[v2]`,
    `[v0][v1][v2]concat=n=3:v=1:a=0[v]`,
    // The bumper's start under the intro, faded out by the time the setup line starts.
    `[3:a]atrim=0:${f(intro.duration + 0.3)},afade=t=out:st=${f(intro.duration - 0.9)}:d=1.1,volume=${LEVEL.music}[m0]`,
    // Its clean ending under the outro.
    `[4:a]atrim=start=${f(Math.max(0, musicLen - outro.duration))},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,volume=${LEVEL.music},adelay=${ms(outroAt)}:all=1[m1]`,
    ...sounds.map(([, at, vol], i) => `[${S + i}:a]volume=${vol},adelay=${ms(at)}:all=1[s${i}]`),
    `[m0][m1]${sounds.map((_, i) => `[s${i}]`).join('')}amix=inputs=${sounds.length + 2}:normalize=0:duration=longest,alimiter=limit=0.95[a]`,
  ].join(';')

  mkdirSync(VIDEO_DIR, { recursive: true })
  const mp4 = join(VIDEO_DIR, `${slug}.mp4`)
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-framerate', '30', '-i', intro.pattern,
    '-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt'),
    '-framerate', '30', '-i', outro.pattern,
    '-i', music, '-i', music,
    ...sounds.flatMap(([file]) => ['-i', file]),
    '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', f(total),
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '28', '-profile:v', 'main', '-tune', 'animation', '-r', '30',
    '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', mp4,
  ], { stdio: 'inherit' })

  // Captions: one cue per spoken line, on the same timings as the audio.
  const ts = (s) => new Date(ms(s)).toISOString().slice(11, 23)
  const vtt = ['WEBVTT', '', ...marks.flatMap((m, i) => [`${i + 1}`, `${ts(inClip(m.at))} --> ${ts(inClip(m.at) + m.duration)}`, m.caption, ''])]
  writeFileSync(join(VIDEO_DIR, `${slug}.vtt`), vtt.join('\n'))

  const poster = join(POSTER_DIR, `clip-${slug}.webp`)
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', frame(posterFrame),
    '-vf', `scale=${OUT_W}:${OUT_H}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '80', poster,
  ], { stdio: 'inherit' })
  console.log(`${mp4}: ${total.toFixed(1)}s, ${(statSync(mp4).size / 1024).toFixed(0)} KB, ${frames.length} frames, ${taps.length} taps; ${poster}`)
}

const nav = (page) => page.getByRole('navigation', { name: 'Primary' })

// Seeding (#434) and quietRest (#433) live in seed.mjs, shared with the
// sprint review clips (#605).

const DAY = 86_400_000

// A made-up Strong export for the import clip (never real user data): six
// weeks of upper / lower on Mon and Thu, ending last week, with no units, as
// newer Strong exports have. Named the way Strong names its file.
function strongExport() {
  const plans = {
    Upper: [['Bench Press (Barbell)', 135, 5], ['Bent Over Row (Barbell)', 115, 5]],
    Lower: [['Squat (Barbell)', 165, 10], ['Deadlift (Barbell)', 205, 10]],
  }
  const rows = ['Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE']
  const start = new Date(Date.now() - 45 * DAY)
  let n = 0
  for (let d = 0; d < 42; d++) {
    const day = new Date(start.getTime() + d * DAY)
    if (![1, 4].includes(day.getDay())) continue
    const name = n % 2 ? 'Lower' : 'Upper'
    const week = Math.floor(n++ / 2)
    const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')} 18:05:00`
    for (const [lift, weight, step] of plans[name]) {
      for (let set = 1; set <= 3; set++) rows.push(`${stamp},"${name}",58m,"${lift}",${set},${weight + step * week},${set === 3 ? 7 : 8},0,0,"","",`)
    }
  }
  mkdirSync(WORK, { recursive: true })
  const file = join(WORK, 'strong_workouts.csv')
  writeFileSync(file, rows.join('\n') + '\n')
  return file
}

// Each clip: the intro and outro card words, a setup line (what they'll learn
// and why, said over the first screen), and its step lines, which `demo` speaks
// by key. Say button names as "the Next button", not a bare "tap Next".
const CLIPS = {
  routines: {
    intro: ['Build a', 'routine'],
    outro: ['Ready for', 'Push day'],
    setup: "[warm, friendly] Doing the same workout every week, like a push day? Save it as a routine, and next time it's ready to go in one tap. [playful] No setting it up again.",
    lines: {
      open: 'On Home, tap Build a routine.',
      name: 'Give it a name, like Push day.',
      next: 'Then tap the Next button.',
      search: 'Now search for an exercise, and tap its Add button.',
      more: 'Add overhead press the same way,',
      last: 'and tricep pushdowns.',
      done: 'When you have them all, tap the Done button.',
      sets: 'Tap the plus or minus buttons to set how many sets each exercise gets.',
      home: "[pleased] That's it, your routine is saved. Head back to Home.",
      start: 'Next time, just tap it to start your workout.',
    },
    demo: async (page, { say, tap, type, sleep }) => {
      await say('open', () => tap(page.getByRole('button', { name: /^Build a routine/ })))
      await say('name', () => type(page.getByLabel('Name'), 'Push day'), 0.3)
      await say('next', () => tap(page.getByRole('button', { name: 'Next', exact: true }), 600))
      const sheet = page.getByRole('dialog', { name: 'Add exercise' })
      const search = sheet.getByPlaceholder('Search exercises')
      const add = async (term, name) => {
        await tap(search, 200)
        await search.fill('')
        await search.pressSequentially(term, { delay: 90 })
        await sleep(500)
        await tap(sheet.getByRole('button', { name: `Add ${name}`, exact: true }), 500)
      }
      await say('search', () => add('Bench', 'Barbell Bench Press'), 0.25)
      await say('more', () => add('Overhead', 'Overhead Press'), 0.2)
      await say('last', () => add('Pushdown', 'Tricep Pushdown'), 0.2)
      await say('done', () => tap(sheet.getByRole('button', { name: 'Done', exact: true }), 600))
      await say('sets', () => tap(page.getByRole('button', { name: 'More sets for Barbell Bench Press' }), 600))
      const poster = now()
      await say('home', () => tap(nav(page).getByRole('link', { name: 'Home', exact: true }), 600), 0.7)
      await say('start', () => tap(page.getByRole('button', { name: 'Push day', exact: true }), 1200), 0.5)
      return poster
    },
  },
  'starter-programs': {
    intro: ['Start from a', 'program'],
    outro: ['Your plan is', 'ready!'],
    setup: '[warm, friendly] Not sure what to train? Start from a ready-made program, and RepBunny sets up every routine for you.',
    lines: {
      open: 'On Home, tap Start from a program.',
      pick: "Pick the one that fits your week. [upbeat] Let's go with push, pull, legs.",
      add: 'It shows the routines it will add. Tap the Add 3 routines button.',
      home: '[pleased] Back on Home, your three new routines are ready to start.',
    },
    demo: async (page, { say, tap }) => {
      await say('open', () => tap(page.getByRole('button', { name: /^Start from a program/ }), 600))
      await say('pick', () => tap(page.getByRole('button', { name: /^Push \/ pull \/ legs/ }), 600), 0.7)
      // Straight to Home: the routine list above would read "0 exercises" until a
      // reload (#403), and Home's tiles are where the new routines get used anyway.
      await say('add', () => tap(page.getByRole('button', { name: 'Add 3 routines' }), 600), 0.75)
      await say('home', () => tap(nav(page).getByRole('link', { name: 'Home', exact: true }), 600), 0.1)
      return now()
    },
  },
  'log-a-workout': {
    intro: ['Log a', 'workout'],
    outro: ['First set,', 'done!'],
    setup: '[warm, friendly] Just want to lift and keep track? Start a workout and log each set as you go. It only takes a few taps.',
    lines: {
      open: 'On Home, tap Start a workout.',
      search: 'Search for your exercise, and tap its Add button.',
      done: 'Then tap the Done button.',
      weight: 'Type in the weight you lifted,',
      reps: 'and how many reps.',
      add: 'Then tap the Add set button to log it.',
      nice: '[excited] Your first set is in! Tap the Nice button to keep going.',
    },
    demo: async (page, { say, tap, type, sleep }) => {
      await say('open', () => tap(page.getByRole('button', { name: /^Start a workout/ }), 600))
      const sheet = page.getByRole('dialog', { name: 'Add exercise' })
      await say('search', async () => {
        await type(sheet.getByPlaceholder('Search exercises'), 'Bench')
        await tap(sheet.getByRole('button', { name: 'Add Barbell Bench Press', exact: true }), 500)
      }, 0.25)
      await say('done', () => tap(sheet.getByRole('button', { name: 'Done', exact: true }), 600))
      await say('weight', () => type(page.getByLabel('Weight').first(), '135'), 0.3)
      await say('reps', async () => {
        await type(page.getByLabel('Reps').first(), '8')
        await page.evaluate(() => document.activeElement?.blur())
      }, 0.3)
      await say('add', () => tap(page.getByRole('button', { name: 'Add set' }).first(), 600))
      await say('nice', () => tap(page.getByRole('button', { name: 'Nice!' }), 600), 0.75)
      return now()
    },
  },
  'import-from-strong-hevy': {
    intro: ['Bring your', 'history'],
    outro: ['Welcome', 'over!'],
    setup: '[warm, friendly] Switching from Strong or Hevy? Bring your old workouts along. [reassuring] The file is read on your phone, and never uploaded.',
    lines: {
      open: 'Tap the person icon at the top, then Your data.',
      import: "Tap Import from another app, and pick the app you're coming from.",
      file: 'Then tap the Choose file button, and pick the export you saved.',
      match: 'RepBunny matches each exercise. When the match is right, tap the Yes, same one button.',
      review: 'Then tap the Import button.',
      confirm: 'Pick lb or kg, and tap Import again.',
      done: "[excited] They're in! Tap the See my progress button.",
      after: '[pleased] Your records and charts pick up right where you left off.',
    },
    demo: async (page, { say, tap, sleep }) => {
      await say('open', async () => {
        await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
        await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Your data/ }), 400)
      }, 0.15)
      await say('import', () => tap(page.getByRole('button', { name: /^Import from another app/ }), 600), 0.3)
      const file = strongExport()
      await say('file', async () => {
        const chooser = page.waitForEvent('filechooser')
        await tap(page.getByRole('dialog', { name: 'Import from another app' }).getByRole('button', { name: 'Choose file' }), 0)
        await (await chooser).setFiles(file)
        await sleep(600)
      }, 0.3)
      const review = page.getByRole('dialog', { name: 'Match your exercises' })
      await say('match', async () => {
        const yes = review.getByRole('button', { name: 'Yes, same one' })
        while (await yes.count()) await tap(yes.first(), 250)
      }, 0.45)
      await say('review', () => tap(review.getByRole('button', { name: /^Import \d+ workouts$/ }), 600), 0.4)
      const confirm = page.getByRole('dialog', { name: /^Import \d+ workouts\?$/ })
      await say('confirm', async () => {
        await tap(confirm.getByRole('radiogroup', { name: 'Weights in this file are in' }).getByRole('radio', { name: 'lb' }), 500)
        await tap(confirm.getByRole('button', { name: /^Import \d+ workouts$/ }), 600)
      }, 0.15)
      const poster = now()
      await say('done', () => tap(page.getByRole('button', { name: 'See my progress' }), 600), 0.6)
      await say('after', () => tap(page.getByText('Lift progress', { exact: true }), 600), 0.2)
      return poster
    },
  },
  'exercise-history': {
    intro: ['Exercise', 'history'],
    outro: ['Keep it', 'climbing!'],
    setup: "[warm] Every lift keeps its own history. See how far you've come, and what to aim for next time.",
    prepare: (page) => seed(page, { premium: true }),
    lines: {
      open: 'Open the Progress tab, and tap Lift progress.',
      pick: 'Tap a lift, like the bench press.',
      chart: 'With Premium, the chart shows your estimated one rep max climbing.',
      heaviest: "Tap Heaviest for your top weight each session. [playful] That one's free.",
      next: 'Next time gives you the weight and reps to aim for.',
      best: 'Best reps at each weight lists the rep records to beat.',
      sessions: '[proud] And every session is here, with a gold paw on each record.',
    },
    demo: async (page, { say, tap, reveal, sleep }) => {
      await say('open', async () => {
        await tap(nav(page).getByRole('link', { name: 'Progress', exact: true }), 500)
        await tap(page.getByText('Lift progress', { exact: true }), 400)
      }, 0.2)
      await say('pick', () => tap(page.getByText('Barbell Bench Press', { exact: true }).first(), 600), 0.5)
      const overlay = page.getByRole('dialog', { name: 'Barbell Bench Press history' })
      const poster = now()
      await say('chart')
      await say('heaviest', () => tap(overlay.getByRole('group', { name: 'Chart metric' }).getByRole('button', { name: 'Heaviest' }), 600), 0.2)
      await say('next', () => reveal(overlay.getByRole('region', { name: 'Next time' }), 'start'), 0.1)
      await say('best', () => reveal(overlay.getByRole('region', { name: 'Best reps at each weight' }), 'start'), 0.1)
      await say('sessions', async () => {
        await reveal(overlay.getByText('Sessions', { exact: true }), 'start')
        await sleep(900)
        await reveal(overlay.locator('.history-entry').filter({ has: page.getByRole('img', { name: 'Record' }) }).first(), 'center')
      }, 0.1)
      return poster
    },
  },
  'progress-reports': {
    intro: ['Monthly', 'reports'],
    outro: ['What a', 'month!'],
    setup: '[warm] On the first of every month, RepBunny sums up the month you just finished, next to the month before.',
    prepare: (page) => seed(page, { premium: true }),
    lines: {
      open: 'Open the Progress tab, and scroll down to the report.',
      tile: 'Tap the report to open it.',
      tiles: 'Workouts, sets, volume, and records, each next to the month before.',
      records: '[proud] Below that, every record you set,',
      gains: 'your biggest strength gains, and the muscles you trained most.',
      back: 'Tap the arrow to look back at earlier months.',
      premium: 'The weekly numbers on Progress are free. Monthly reports are part of Premium.',
    },
    demo: async (page, { say, tap, reveal }) => {
      const now_ = new Date()
      const month = new Date(now_.getFullYear(), now_.getMonth() - 1, 1).toLocaleDateString('en-US', { month: 'long' })
      const report = page.getByRole('link', { name: `${month} report`, exact: true })
      await say('open', async () => {
        await tap(nav(page).getByRole('link', { name: 'Progress', exact: true }), 500)
        await reveal(report)
      }, 0.2)
      await say('tile', async () => {
        await tap(report, 300)
        await page.evaluate(() => scrollTo(0, 0))
      }, 0.3)
      const poster = now()
      await say('tiles')
      await say('records', () => reveal(page.getByRole('heading', { name: 'Records', exact: true }), 'start'), 0.1)
      await say('gains', () => reveal(page.getByRole('heading', { name: 'Most trained', exact: true }), 'start'), 0.3)
      await say('back', async () => {
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }))
        await tap(page.getByRole('button', { name: 'Previous month' }), 600)
      }, 0.2)
      await say('premium')
      return poster
    },
  },
  'next-set-targets': {
    intro: ['Next-set', 'targets'],
    outro: ['Beat it', 'every time!'],
    setup: '[upbeat] With Premium, every set gets a target to beat, worked out from last time and how hard it felt.',
    // No default rest: the rest screen now covers the workout after a set.
    prepare: async (page) => {
      await quietRest(page, { rest: false })
      await seed(page, { premium: true })
    },
    lines: {
      start: 'On Home, tap a routine to start it, like Push day.',
      read: "Under each set is its target. Here, it's one more rep than last time.",
      why: 'Tap the Why button to see the math.',
      fill: 'Tap the target to fill in the set.',
      rpe: 'After the set, type in how hard it felt,',
      log: 'and tap the check to log it.',
      next: 'Set 2 has its own target. [encouraging] Fill it in, and keep going.',
    },
    demo: async (page, { say, tap, sleep }) => {
      const rows = page.locator('.set-row-draft')
      await say('start', () => tap(page.getByRole('button', { name: 'Push day', exact: true }), 600), 0.45)
      await say('read')
      await say('why', () => tap(rows.nth(0).getByRole('button', { name: 'Why this target for set 1?' }), 600), 0.4)
      const poster = now()
      await say('fill', () => tap(rows.nth(0).getByRole('button', { name: /^Fill set 1 with target/ }), 600), 0.4)
      await say('rpe', async () => {
        const rpe = rows.nth(0).getByLabel('RPE (optional)')
        await tap(rpe, 200)
        await rpe.fill('')
        await rpe.pressSequentially('8', { delay: 110 })
        await page.evaluate(() => document.activeElement?.blur())
        await sleep(300)
      }, 0.5)
      await say('log', () => tap(rows.nth(0).getByRole('button', { name: 'Add set' }), 800), 0.5)
      await say('next', () => tap(rows.nth(0).getByRole('button', { name: /^Fill set 2 with target/ }), 600), 0.55)
      return poster
    },
  },
  // The mid-workout clips (#433) start from the same seeded history, so Push
  // day opens with last time's sets filled in.
  'rest-timer': {
    intro: ['Rest', 'timer'],
    outro: ['Rested and', 'ready!'],
    setup: '[warm] RepBunny times your rest after every set, so you know when to go again.',
    prepare: async (page) => {
      await quietRest(page)
      await seed(page, { premium: true })
    },
    lines: {
      start: 'On Home, tap a routine to start it, like Push day.',
      log: 'Log your first set with the check button. Your rest starts on its own.',
      source: 'The line below says where the time came from. Tap Edit to change your default.',
      adjust: '[playful] Need a little less today? Tap the minus 15 seconds button.',
      keep: 'To rest that long on this lift every time, tap Keep.',
      back: 'Tap the Back to workout button. A bar keeps counting while you log.',
    },
    demo: async (page, { say, tap }) => {
      await say('start', () => tap(page.getByRole('button', { name: 'Push day', exact: true }), 600), 0.45)
      await say('log', () => tap(page.locator('.set-row-draft').first().getByRole('button', { name: 'Add set' }), 600), 0.45)
      const overlay = page.locator('.rest-overlay')
      await say('source')
      await say('adjust', () => tap(overlay.getByRole('button', { name: '-15s' }), 400), 0.5)
      const poster = now()
      await say('keep', () => tap(overlay.getByRole('button', { name: /^Keep / }), 600), 0.6)
      await say('back', () => tap(overlay.getByRole('button', { name: 'Back to workout' }), 600), 0.3)
      return poster
    },
  },
  'swap-exercises': {
    intro: ['Swap a taken', 'machine'],
    outro: ['Keep on', 'lifting!'],
    setup: '[playful] Bench taken? With Premium, swap it for a close match, just for today. Your routine stays the same.',
    prepare: async (page) => {
      await quietRest(page, { rest: false })
      await seed(page, { premium: true })
    },
    lines: {
      start: 'Start your workout as usual.',
      swap: 'Then tap the two arrows next to the exercise name.',
      pick: 'Try instead lists close matches. Tap the one you can get to, like dumbbell bench press.',
      weight: 'It takes the sets you had left. Type in the weight,',
      reps: 'and the reps,',
      log: 'and tap the check to log it.',
      nice: '[excited] A new lift! Tap the Nice button. Next time, your routine starts with the bench press again.',
    },
    demo: async (page, { say, tap, type }) => {
      await say('start', () => tap(page.getByRole('button', { name: 'Push day', exact: true }), 600), 0.4)
      await say('swap', () => tap(page.getByRole('button', { name: 'Swap exercise' }).first(), 600), 0.5)
      const sheet = page.getByRole('dialog', { name: 'Try instead' })
      const poster = now()
      await say('pick', () => tap(sheet.getByRole('button', { name: /^Dumbbell Bench Press/ }), 600), 0.75)
      const row = page.locator('.set-row-draft').first()
      await say('weight', () => type(row.getByLabel('Weight'), '50'), 0.6)
      await say('reps', async () => {
        await type(row.getByLabel('Reps'), '10')
        await page.evaluate(() => document.activeElement?.blur())
      }, 0.2)
      await say('log', () => tap(row.getByRole('button', { name: 'Add set' }), 600), 0.4)
      await say('nice', () => tap(page.getByRole('button', { name: 'Nice!' }), 600), 0.3)
      return poster
    },
  },
  'plate-calculator': {
    intro: ['Plate', 'calculator'],
    outro: ['Bar', 'loaded!'],
    setup: '[playful] Tired of plate math between sets? With Premium, RepBunny shows exactly what goes on each side of the bar.',
    prepare: async (page) => {
      await quietRest(page, { rest: false })
      await seed(page, { premium: true })
    },
    lines: {
      start: 'Start a workout with a barbell lift, like bench press.',
      open: 'Then tap the Plates button.',
      read: "It opens at your set's weight. For 145 pounds, that's a 45 and a 5 on each side.",
      step: 'Going heavier? Tap the plus button to step up to the next weight you can load.',
      use: 'Then tap the Use button, and the weight goes right into your set.',
    },
    demo: async (page, { say, tap }) => {
      await say('start', () => tap(page.getByRole('button', { name: 'Push day', exact: true }), 600), 0.5)
      await say('open', () => tap(page.getByRole('button', { name: 'Plates' }), 600), 0.5)
      const sheet = page.getByRole('dialog', { name: 'Load the bar' })
      await say('read')
      await say('step', () => tap(sheet.getByRole('button', { name: 'Increase weight' }), 600), 0.4)
      const poster = now()
      await say('use', () => tap(sheet.getByRole('button', { name: /^Use / }), 600), 0.35)
      return poster
    },
  },
  'edit-past-workouts': {
    intro: ['Fix a past', 'workout'],
    outro: ['All', 'fixed!'],
    setup: '[warm, reassuring] Typed the wrong weight, or logged a workout on the wrong day? Any past workout can be fixed in a few taps.',
    prepare: (page) => seed(page, { premium: false }),
    lines: {
      open: 'Open the Progress tab, and tap Workout log.',
      set: 'Tap the set you got wrong.',
      weight: 'Fix the weight,',
      save: 'and tap the Save button.',
      date: 'Wrong day? Tap the date at the top.',
      pick: 'Pick when it really happened, and tap Save.',
      after: '[pleased] Your log, charts, and records all follow the fix.',
    },
    demo: async (page, { say, tap, sleep }) => {
      await say('open', async () => {
        await tap(nav(page).getByRole('link', { name: 'Progress', exact: true }), 500)
        await tap(page.getByRole('link', { name: 'Workout log', exact: true }), 400)
      }, 0.2)
      const card = page.locator('.card').first()
      await say('set', () => tap(card.getByRole('button', { name: 'Edit set 1' }).first(), 600), 0.5)
      const weight = card.locator('li.row-wrap').first().getByLabel('Weight')
      await say('weight', async () => {
        await tap(weight, 200)
        await weight.fill('')
        await weight.pressSequentially('150', { delay: 110 })
        await sleep(300)
      }, 0.3)
      await say('save', () => tap(card.getByRole('button', { name: 'Save', exact: true }), 600), 0.4)
      await say('date', () => tap(card.getByRole('button', { name: /^Change date and time/ }), 600), 0.5)
      const poster = now()
      await say('pick', async () => {
        // A day earlier, same time. The picker itself is the phone's own, so
        // the new value goes straight in.
        const when = card.getByLabel('When')
        const value = await when.inputValue()
        const day = new Date(value)
        day.setDate(day.getDate() - 1)
        const pad = (n) => String(n).padStart(2, '0')
        await sleep(400)
        await when.fill(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T${value.slice(11)}`)
        await sleep(700)
        await tap(card.getByRole('button', { name: 'Save', exact: true }), 600)
      }, 0.15)
      await say('after', () => page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' })), 0.2)
      return poster
    },
  },
}

const wanted = process.argv.slice(2)
for (const slug of wanted.length ? wanted : Object.keys(CLIPS)) {
  if (!CLIPS[slug]) throw new Error(`Unknown clip ${slug}; one of ${Object.keys(CLIPS).join(', ')}`)
  await record(slug, CLIPS[slug])
}
// Keeps the lifting basics video's lines too (lifting-basics.mjs, #426).
if (!wanted.length) pruneLines([...Object.values(CLIPS).flatMap((c) => [c.setup, HOW, ...Object.values(c.lines)]), ...BASICS_LINES])
await browser.close()
