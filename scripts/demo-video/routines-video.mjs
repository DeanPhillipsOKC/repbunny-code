#!/usr/bin/env node
// Two short social videos on routines (2026-11-06), for TikTok and Facebook
// Reels, in the owner's voice (Deaner2 on eleven_v4, #648), on the same
// 1080x1920 stage as the launch intros (social-stage.mjs):
//   stick-to-it  build a routine once, then repeat it, with the routine art
//                (#987, #1015) on its Home tile and last time's numbers filled in
//   six-day      the starter programs, then the Machine 6-day split, said out
//                loud as Premium because it adds five routines and free holds three
// No schedules (docs/decisions.md): sticking to a routine means the same lifts
// each time, never a calendar, a reminder, or an assigned day.
//
// Needs the local-mode dev server on :5174 (see guide-clips.mjs):
//   VITE_DATA=local npm run dev -- --port 5174 --strictPort
// then: node --env-file=.env.local scripts/demo-video/routines-video.mjs [stick-to-it|six-day|both] [--silent-ok]
//
// Output goes to the gitignored logs/demo-video/routines/ (posted by hand):
//   <cut>.mp4 (under a minute), <cut>.vtt (the spoken lines), <cut>.jpg (the cover)
// Spoken-text rules: scripts/demo-video/review/README.md.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_URL, recordSegment } from './review/kit.mjs'
import { composeCut } from './social-stage.mjs'

const WORK = join('logs', 'demo-video', 'routines')

// Off camera: the usual ten weeks, minus the Push day routine, so the one built
// on camera picks up the lifts' history and opens with last time's numbers.
function withoutPushDay(backup) {
  backup.workout_templates = backup.workout_templates.filter((t) => t.id !== 'push')
  backup.workout_template_exercises = backup.workout_template_exercises.filter((t) => t.template_id !== 'push')
  for (const w of backup.workouts) if (w.template_id === 'push') w.template_id = null
}

const setPremium = (page, on) =>
  page.evaluate(async (on) => {
    const { setPremiumUnlocked } = await import('/src/lib/premium.ts')
    setPremiumUnlocked(on)
  }, on)

const CUTS = {
  'stick-to-it': {
    title: { a: 'Stick to', b: 'your routine' },
    cover: /home screen as a tile/,
    prepare: async (page, kit) => {
      await kit.quietRest(page, { rest: false })
      // seed() waits for "Push day", which this history doesn't have on Home.
      await kit.seed(page, { premium: false, edit: withoutPushDay }).catch(() => {})
      await page.getByRole('button', { name: 'Pull day', exact: true }).waitFor()
    },
    spoken: "[curious] Want to stick to your workouts? Stop deciding what to do every time you walk in the gym.",
    openingStep: (page, { tap }) => tap(page.getByRole('button', { name: /New routine/ }), 500),
    openingLead: 0.75,
    lines: {
      name: '[casual] Build a routine once. Give it a name, like Push day.',
      add: 'Add your exercises.',
      sets: 'And pick how many sets each one gets.',
      tile: '[pleased] Now it lives on your home screen as a tile, with the bunny doing a matching lift.',
      start: "[upbeat] Tap it, and your whole workout is lined up, with last time's numbers already filled in.",
      same: "[warm] Same lifts, every time. That's how you know you're actually getting stronger.",
      where: '[warm] RepBunny. Free on Google Play. Your workouts stay on your phone.',
    },
    demo: async (page, { say, tap, type, zoom, unzoom, sleep, nav }) => {
      await say('name', async () => {
        await tap(page.getByRole('button', { name: 'Add routine' }), 300)
        await type(page.getByLabel('Name'), 'Push day')
        await tap(page.getByRole('button', { name: 'Next', exact: true }), 500)
      }, 0.2)
      const sheet = page.getByRole('dialog', { name: 'Add exercise' })
      // The seeded lifts sit at the top of the sheet, one tap each.
      const add = (name) => tap(sheet.getByRole('button', { name, exact: true }), 350)
      await say('add', async () => {
        await add('Barbell Bench Press')
        await add('Overhead Press')
        await add('Tricep Pushdown')
        await tap(sheet.getByRole('button', { name: 'Done', exact: true }), 400)
      }, 0)
      await say('sets', () => tap(page.getByRole('button', { name: 'More sets for Barbell Bench Press' }), 400), 0.2)
      let poster
      await say('tile', async () => {
        await tap(nav().getByRole('link', { name: 'Home', exact: true }), 500)
        // Up close, so the routine art reads at phone size.
        await zoom(page.getByRole('button', { name: 'Push day', exact: true }), 2)
        poster = Date.now() / 1000
      }, 0.05)
      await say('start', async () => {
        await unzoom()
        await tap(page.getByRole('button', { name: 'Push day', exact: true }), 500)
      }, 0.05)
      await say('same', async () => {
        await sleep(600)
        await tap(page.getByRole('button', { name: 'Next exercise' }), 1300)
        await tap(page.getByRole('button', { name: 'Next exercise' }), 300)
      }, 0)
      await say('where')
      return poster
    },
  },
  'six-day': {
    title: { a: 'Six days,', b: 'already built' },
    cover: /each with its own bunny/,
    prepare: async (page, kit) => {
      await kit.quietRest(page, { rest: false })
      await setPremium(page, true)
      await page.reload()
      await page.getByRole('button', { name: /^Start from a program/ }).waitFor()
    },
    spoken: "[curious] Don't want to build your own routines? I already built them for you.",
    openingStep: (page, { tap }) => tap(page.getByRole('button', { name: /^Start from a program/ }), 500),
    openingLead: 0.6,
    lines: {
      list: '[casual] RepBunny comes with starter programs. Machines, free weights, or just dumbbells. Three days a week, all the way up to six.',
      open: "[upbeat] Here's the machine six day split. It's part of Premium, because it adds five routines.",
      week: '[casual] Push, quads, cardio and core. Pull, glutes and hams, then cardio and core again. Then a rest day.',
      add: '[pleased] One tap, and all five are ready.',
      tiles: '[warm] Each one gets its own tile, each with its own bunny.',
      stick: '[upbeat] So you walk in, tap the one you came for, and follow it. Change anything you want.',
      where: '[warm] The smaller programs are free. RepBunny, on Google Play.',
    },
    demo: async (page, { say, tap, reveal, sleep, nav }) => {
      await say('list', async () => {
        await reveal(page.locator('.group').nth(1), 'start')
        await sleep(1500)
        await reveal(page.locator('.group').nth(2), 'start')
      }, 0.3)
      const program = page.getByRole('button', { name: /^Machine 6-day split/ })
      await say('open', () => tap(program, 300), 0.05)
      const sheet = page.getByRole('dialog', { name: 'Machine 6-day split' })
      await say('week', () => reveal(sheet.locator('.week'), 'start'), 0.02)
      await say('add', () => tap(sheet.getByRole('button', { name: 'Add 5 routines' }), 300), 0.1)
      let poster
      await say('tiles', async () => {
        await tap(nav().getByRole('link', { name: 'Home', exact: true }), 500)
        await reveal(page.getByRole('button', { name: '6-Day: Push', exact: true }), 'start')
        poster = Date.now() / 1000
        await sleep(900)
        await reveal(page.getByRole('button', { name: '6-Day: Glutes & Hams', exact: true }))
      }, 0)
      await say('stick', async () => {
        await tap(page.getByRole('button', { name: '6-Day: Push', exact: true }), 300)
        // The logger opens at Home's scroll position; show its header.
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }))
      }, 0.45)
      await say('where')
      return poster
    },
  },
}

async function makeCut(browser, cut, silentOk) {
  const dir = join(WORK, cut)
  mkdirSync(dir, { recursive: true })
  const { title, cover, ...script } = CUTS[cut]
  const spec = { issue: `routines-${cut}`, view: { width: 390, height: 780 }, outWidth: 660, crf: 16, ...script }
  const clip = await recordSegment(browser, spec, join(dir, 'segment'))
  if (clip.silent && !silentOk) throw new Error(`Recorded without a voice (${clip.silent}); needs ELEVENLABS_API_KEY`)
  const mark = clip.marks.find((m) => cover.test(m.text))
  await composeCut(browser, clip, dir, join(WORK, cut), { title, follow: false, coverAt: mark.at + mark.duration })
}

const args = process.argv.slice(2)
const silentOk = args.includes('--silent-ok')
const which = args.find((a) => !a.startsWith('--')) ?? 'both'
if (which !== 'both' && !(which in CUTS)) throw new Error('Usage: routines-video.mjs [stick-to-it|six-day|both] [--silent-ok]')
const up = await fetch(BASE_URL).then((r) => r.ok, () => false)
if (!up) throw new Error(`No dev server on ${BASE_URL}: run VITE_DATA=local npm run dev -- --port 5174 --strictPort`)

mkdirSync(WORK, { recursive: true })
const browser = await chromium.launch()
try {
  for (const cut of which === 'both' ? Object.keys(CUTS) : [which]) await makeCut(browser, cut, silentOk)
} finally {
  await browser.close()
}
