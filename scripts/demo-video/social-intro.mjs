#!/usr/bin/env node
// The launch intro videos for Facebook and TikTok (2026-10-30, Android first):
// the owner in his own voice (Deaner2 on eleven_v4, #648) saying what RepBunny
// is, showing the app with made-up data, and ending on where to get it.
// 1080x1920 (9:16, what Reels and TikTok want): the app plays in a rounded card
// on the brand background (cards/social-stage.html), with each spoken line as
// a caption above it, all inside TikTok and Reels' safe zone (social-stage.mjs). Recorded with
// the sprint review kit (review/kit.mjs), so taps get the same ripple and
// sound. Android's Google Play is the only store named; the iPhone is "coming
// soon" (docs/decisions.md).
//
// Needs the local-mode dev server on :5174 (see guide-clips.mjs):
//   VITE_DATA=local npm run dev -- --port 5174 --strictPort
// then: node --env-file=.env.local scripts/demo-video/social-intro.mjs [facebook|tiktok|both]
//
// Output goes to the gitignored logs/demo-video/social-intro/ (the owner posts
// the videos by hand; they aren't committed):
//   facebook.mp4 (about 55s) and tiktok.mp4 (about 30s), 1080x1920, H.264 + AAC
//   <cut>.vtt    the spoken lines, for platforms that take a captions file
//   <cut>.jpg    the record celebration, for the cover image
// Spoken-text rules: scripts/demo-video/review/README.md.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_URL, recordSegment } from './review/kit.mjs'
import { composeCut } from './social-stage.mjs'
import { restOff } from './seed.mjs'

const WORK = join('logs', 'demo-video', 'social-intro')
const DAY = 86_400_000

// Off camera: the usual ten weeks of history, plus a Full body routine that
// shows each kind of set the app logs: weight and reps (bench, with history),
// bodyweight reps, a timed hold, and timed cardio with distance and incline.
// The last three get a session two days back, so their numbers fill in too.
function fullBody(backup) {
  const base = { also_works: [], is_archived: false, uses_barbell: false }
  backup.exercises.push(
    { ...base, id: 'pullup', name: 'Pull-up', muscle_group: 'back', load_type: 'bodyweight' },
    { ...base, id: 'plank', name: 'Plank', muscle_group: 'core', load_type: 'timed' },
    { ...base, id: 'tread', name: 'Treadmill', muscle_group: 'cardio', load_type: 'timed', tracks_distance: true, tracks_incline: true },
  )
  // A recent weigh-in, so the body weight prompt doesn't open over the pull-up.
  backup.body_weight_entries.push({ id: 'bw0', weight: 180, weight_unit: 'lb', recorded_at: new Date().toISOString() })
  backup.workout_templates.push({ id: 'full', name: 'Full body', is_archived: false, category: 'full' })
  ;['bench', 'pullup', 'plank', 'tread'].forEach((exercise_id, position) =>
    backup.workout_template_exercises.push({ id: `te-full-${exercise_id}`, template_id: 'full', exercise_id, position, target_sets: exercise_id === 'bench' ? 3 : 2 }),
  )
  const day = new Date(Date.now() - 2 * DAY)
  day.setHours(7, 0, 0, 0)
  backup.workouts.push({ id: 'wfull', performed_at: day.toISOString(), finished_at: new Date(day.getTime() + 50 * 60_000).toISOString(), template_id: 'full', notes: null })
  const set = (exercise_id, k, fields) =>
    backup.sets.push({ id: `wfull-${exercise_id}-${k}`, workout_id: 'wfull', exercise_id, set_index: backup.sets.filter((s) => s.workout_id === 'wfull').length, weight: 0, weight_unit: 'lb', reps: null, rpe: null, ...fields })
  ;[8, 7].forEach((reps, k) => set('pullup', k, { reps, rpe: [8, 9][k] }))
  ;[60, 45].forEach((duration_seconds, k) => set('plank', k, { duration_seconds }))
  ;[[600, 0.6, 2], [1200, 1.4, 4]].forEach(([duration_seconds, distance, incline], k) => set('tread', k, { duration_seconds, distance, distance_unit: 'mi', incline }))
}

const prepare = (cut) => async (page, kit) => {
  // TikTok has no rest screen in it, so its record shows the full celebration.
  await kit.quietRest(page, { rest: cut === 'facebook' })
  await kit.seed(page, { premium: false, edit: fullBody })
  if (cut === 'tiktok') {
    // It opens mid-workout, with a record set already typed in.
    await page.getByRole('button', { name: 'Full body', exact: true }).click()
    const row = page.locator('.set-row-draft').nth(0)
    await row.getByLabel('Weight').fill('165')
    await row.getByLabel('Reps').fill('12')
  }
}

const rows = (page) => page.locator('.set-row-draft')
const celebration = (page) => page.locator('.celebration-overlay')

// Logs the first draft row as a record; returns when the celebration is up.
// A record beats the best set's volume (weight times reps; the seeded best is
// 145 x 12), so the reps go up too, not just the weight.
async function logRecord(page, { tap, sleep }) {
  for (const [label, value] of [['Weight', '165'], ['Reps', '12']]) {
    const field = rows(page).nth(0).getByLabel(label)
    await tap(field, 150)
    await field.fill('')
    await field.pressSequentially(value, { delay: 110 })
  }
  await sleep(250)
  await tap(rows(page).nth(0).getByRole('button', { name: 'Add set' }), 300)
  await celebration(page).waitFor({ timeout: 4000 })
}

async function showChart(page, { tap, nav }) {
  await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 250)
  await tap(page.getByText('Lift progress', { exact: true }), 250)
  await tap(page.getByText('Barbell Bench Press', { exact: true }).first(), 300)
}

const CUTS = {
  facebook: {
    spoken: "[warm, friendly] Hey, I'm Dean. I made RepBunny, a simple strength workout log, and it's now on Google Play.",
    openingStep: (page, { tap }) => tap(page.getByRole('button', { name: 'Full body', exact: true }), 400),
    openingLead: 0.45,
    lines: {
      log: "[casual] Start a routine, and last time's weight and reps are already filled in. One tap logs the set.",
      rest: '[playful] Then the bunny times your rest, so you know when to go again.',
      record: '[pleased] Beat your best, and RepBunny celebrates it with you.',
      types: '[upbeat] Track all kinds of training. Barbell lifts, bodyweight moves, timed holds like planks, even cardio with distance and incline.',
      progress: '[warm] Every lift gets its own chart, so you can watch yourself get stronger.',
      private: '[reassuring] There is no account. No ads. No tracking. Your workouts stay on your phone.',
      free: '[sincere] Logging is free, always. Premium is a one time unlock, with no subscription.',
      where: '[warm] Search RepBunny on Google Play. The iPhone version is coming soon. I hope it helps you lift.',
    },
    demo: async (page, kit) => {
      const { say, tap, sleep, reveal } = kit
      const rest = page.locator('.rest-overlay')
      await say('log', () => tap(rows(page).nth(0).getByRole('button', { name: 'Add set' }), 300), 0.45)
      await rest.waitFor({ state: 'visible', timeout: 4000 })
      await say('rest', async () => {
        // Skip, not Back to workout, so no resting bar stays over the logger.
        await tap(rest.getByRole('button', { name: 'Skip Rest' }), 300)
        await restOff(page)
      }, 0.75)
      let poster
      await say('record', async () => {
        await logRecord(page, kit)
        poster = Date.now() / 1000
      }, 0.1)
      await say('types', async () => {
        await tap(page.getByRole('button', { name: 'Nice!' }), 500)
        // The logger shows one exercise at a time; the arrow moves to the next.
        for (let i = 0; i < 3; i++) await tap(page.getByRole('button', { name: 'Next exercise' }), 1900)
      }, 0)
      await say('progress', () => showChart(page, kit), 0)
      // The chart's own numbers, slowly, under the privacy line.
      await say('private', () => page.mouse.wheel(0, 320).then(() => sleep(200)), 0.5)
      await say('free', async () => {
        await page.mouse.wheel(0, -320)
        await sleep(400)
        await tap(page.getByText('Best reps at each weight', { exact: true }), 700)
        await tap(page.getByRole('button', { name: 'Keep it with Premium' }), 600)
        // The sheet's own "One-time unlock" line, under the spoken one.
        await reveal(page.locator('.free-note'))
      }, 0.15)
      // Ends on the list of lifts, not on the upsell. The sheet closes the way
      // a swipe down would, so there's no tap to show.
      await say('where', async () => {
        await page.keyboard.press('Escape')
        await sleep(500)
      }, 0.2)
      return poster
    },
  },
  tiktok: {
    spoken: "[pleased] That's a new personal best. My app noticed, and it celebrated.",
    openingStep: (page, { tap }) => tap(rows(page).nth(0).getByRole('button', { name: 'Add set' }), 300),
    openingLead: 0.1,
    lines: {
      intro: "[casual] I'm Dean, and I built RepBunny. It's a simple workout log, and it's on Google Play.",
      log: "[casual] Last time's numbers are already filled in, so logging a set takes one tap.",
      private: '[reassuring] No account. No ads. No tracking. Your workouts stay on your phone.',
      where: "[warm] It's free to log. Search RepBunny on Google Play.",
    },
    demo: async (page, kit) => {
      const { say, tap } = kit
      await celebration(page).waitFor({ timeout: 4000 })
      const poster = Date.now() / 1000
      await say('intro', () => tap(page.getByRole('button', { name: 'Nice!' }), 300), 0.55)
      await say('log', () => tap(rows(page).nth(0).getByRole('button', { name: 'Add set' }), 300), 0.45)
      await say('private', () => showChart(page, kit), 0.15)
      await say('where')
      return poster
    },
  },
}

async function makeCut(browser, cut) {
  const dir = join(WORK, cut)
  mkdirSync(dir, { recursive: true })
  const { demo, ...script } = CUTS[cut]
  const spec = { issue: `social-${cut}`, view: { width: 390, height: 780 }, outWidth: 660, crf: 16, prepare: prepare(cut), ...script, demo }
  const clip = await recordSegment(browser, spec, join(dir, 'segment'))
  if (clip.silent) throw new Error(`Recorded without a voice (${clip.silent}); needs ELEVENLABS_API_KEY`)

  // Facebook opens on a "Meet RepBunny" title in the caption's place.
  // Cover: the record celebration, the most "this app is fun" frame.
  const coverAt = clip.marks.find((m) => /personal best|Beat your best/.test(m.text)).at + 2.2
  await composeCut(browser, clip, dir, join(WORK, cut), {
    title: cut === 'facebook' ? { a: 'Meet', b: 'RepBunny' } : null,
    follow: cut !== 'facebook',
    coverAt,
  })
}

const which = process.argv[2] ?? 'both'
if (!['facebook', 'tiktok', 'both'].includes(which)) throw new Error('Usage: social-intro.mjs [facebook|tiktok|both]')
const up = await fetch(BASE_URL).then((r) => r.ok, () => false)
if (!up) throw new Error(`No dev server on ${BASE_URL}: run VITE_DATA=local npm run dev -- --port 5174 --strictPort`)

mkdirSync(WORK, { recursive: true })
const browser = await chromium.launch()
try {
  for (const cut of which === 'both' ? ['facebook', 'tiktok'] : [which]) await makeCut(browser, cut)
} finally {
  await browser.close()
}
