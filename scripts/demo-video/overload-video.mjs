#!/usr/bin/env node
// "One more rep" (2026-10-31): a short social video on sets and progressive
// overload, in the owner's voice (Deaner2 on eleven_v4, #648), on the same
// 1080x1920 stage as the launch intros (social-stage.mjs). The free beats
// come first (last time's numbers filled in, one more rep, the Next time
// card), then the Premium ones, said out loud as Premium: per-set targets
// that follow RPE (#140, #160) and the lighter week when a lift stalls
// (#141). It ends on a record set.
//
// Needs the local-mode dev server on :5174 (see guide-clips.mjs):
//   VITE_DATA=local npm run dev -- --port 5174 --strictPort
// then: node --env-file=.env.local scripts/demo-video/overload-video.mjs
//
// Output goes to the gitignored logs/demo-video/overload/ (posted by hand):
//   one-more-rep.mp4 (about 50s), .vtt (the spoken lines), .jpg (the record, for the cover)
// Spoken-text rules: scripts/demo-video/review/README.md.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_URL, recordSegment } from './review/kit.mjs'
import { composeCut } from './social-stage.mjs'

const WORK = join('logs', 'demo-video', 'overload')

// Off camera: the usual ten weeks (seed.mjs), with Push day rewritten so each
// beat lands on the right numbers. Each entry is one Push day, oldest first,
// as [weight, top reps]; sets are top, top, top - 1.
//  - Bench works up to 180 x 12 (the best set, 2160 lb), then 185 x 10 last
//    time at RPE 8, 7, and 9.5. Today 185 x 11 isn't a record; the easy
//    second set's target, 185 x 12, is.
//  - Incline dumbbell press sits at 60 x 9 for four sessions, three missed
//    targets, so it offers a lighter week.
//  - Overhead press tops the range last time, 100 x 12, so Next time says go up.
const PLAN = {
  bench: [[170, 10], [170, 11], [170, 12], [175, 10], [175, 11], [175, 12], [180, 11], [180, 12], [185, 9], [185, 10]],
  incline: [[50, 11], [50, 12], [55, 10], [55, 11], [55, 12], [60, 8], [60, 9], [60, 9], [60, 9], [60, 9]],
  ohp: [[85, 12], [90, 10], [90, 11], [90, 12], [95, 10], [95, 11], [95, 12], [100, 10], [100, 11], [100, 12]],
}

function pushDay(backup) {
  backup.exercises.push({ id: 'incline', name: 'Incline Dumbbell Press', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false, uses_barbell: false })
  const order = ['bench', 'incline', 'ohp', 'pushdown']
  backup.workout_template_exercises = backup.workout_template_exercises.filter((te) => te.template_id !== 'push')
  order.forEach((exercise_id, position) =>
    backup.workout_template_exercises.push({ id: `te-${exercise_id}`, template_id: 'push', exercise_id, position, target_sets: 3 }),
  )
  const pushes = backup.workouts.filter((w) => w.template_id === 'push').sort((a, b) => a.performed_at.localeCompare(b.performed_at))
  const ids = new Set(pushes.map((w) => w.id))
  // Pushdown keeps its seeded sets; the three planned lifts are redone.
  const kept = backup.sets.filter((s) => !ids.has(s.workout_id) || s.exercise_id === 'pushdown')
  const sets = []
  pushes.forEach((w, i) => {
    const last = i === pushes.length - 1
    let index = 0
    for (const lift of ['bench', 'incline', 'ohp']) {
      const [weight, top] = PLAN[lift][i - pushes.length + PLAN[lift].length] ?? PLAN[lift][0]
      const rpes = lift === 'bench' && last ? [8, 7, 9.5] : lift === 'incline' && i >= pushes.length - 4 ? [9, 9, 9.5] : [7.5, 8, 9]
      ;[top, top, top - 1].forEach((reps, k) =>
        sets.push({ id: `${w.id}-${lift}-${k}`, workout_id: w.id, exercise_id: lift, set_index: index++, reps, weight, weight_unit: 'lb', rpe: rpes[k] }),
      )
    }
    for (const s of kept.filter((s) => s.workout_id === w.id)) s.set_index = index++
  })
  backup.sets = [...kept, ...sets]
}

const rows = (page) => page.locator('.set-row-draft')
const chips = (page) => page.locator('[data-testid="set-target"]')
const setPremium = (page, on) =>
  page.evaluate(async (on) => {
    const { setPremiumUnlocked } = await import('/src/lib/premium.ts')
    setPremiumUnlocked(on)
  }, on)

const spec = {
  issue: 'overload',
  view: { width: 390, height: 780 },
  outWidth: 660,
  crf: 16,
  prepare: async (page, kit) => {
    await kit.quietRest(page, { rest: false })
    await kit.seed(page, { premium: false, edit: pushDay })
    await page.getByRole('button', { name: 'Push day', exact: true }).click()
    await rows(page).first().waitFor()
  },
  spoken: '[curious] Want to know the secret to getting stronger? Do a little more than last time.',
  lines: {
    prefill: '[casual] When I start an exercise, RepBunny fills in what I did last time. So I always know the number to beat.',
    oneMore: "[determined] Today I'm going for one more rep. Same weight, eleven instead of ten.",
    nextTime: "[warm] When I hit the top of my rep range, it tells me to add weight. That's progressive overload, without the math.",
    targets: '[upbeat] With Premium, every set gets its own target. One tap fills it in.',
    why: '[casual] If a set felt easy, it pushes a little harder. If it was a grind, it holds the weight.',
    stall: '[reassuring] And if I get stuck, it notices. It suggests a lighter week, then builds me back up.',
    record: '[pleased] And when I beat my best, it celebrates with me.',
    where: '[warm] RepBunny. Free on Google Play. Your workouts stay on your phone.',
  },
  demo: async (page, { say, tap, zoom, unzoom, sleep, nav }) => {
    await say('prefill')
    await say('oneMore', async () => {
      const reps = rows(page).first().getByLabel('Reps')
      await tap(reps, 150)
      await reps.fill('')
      await reps.pressSequentially('11', { delay: 140 })
      await sleep(300)
      await tap(rows(page).first().getByRole('button', { name: 'Add set' }), 300)
    }, 0.35)
    await say('nextTime', async () => {
      await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 250)
      await tap(page.getByText('Lift progress', { exact: true }), 250)
      await tap(page.getByText('Overhead Press', { exact: true }).first(), 400)
      await zoom(page.locator('.next-card'), 1.4)
    }, 0)
    await say('targets', async () => {
      await unzoom()
      await setPremium(page, true)
      await tap(page.getByRole('button', { name: 'Close history' }), 300)
      await tap(nav().getByRole('link', { name: 'Home', exact: true }), 600)
      await rows(page).first().waitFor()
      await tap(chips(page).first().locator('.set-target-fill'), 400)
    }, 0.2)
    await say('why', async () => {
      await tap(chips(page).nth(0).getByRole('button', { name: /Why this target/ }), 1600)
      await tap(chips(page).nth(1).getByRole('button', { name: /Why this target/ }), 300)
    }, 0.05)
    await say('stall', async () => {
      await tap(page.getByRole('button', { name: 'Next exercise' }), 1700)
      await tap(page.getByRole('button', { name: /^Take it:/ }), 300)
    }, 0.1)
    let poster
    await say('record', async () => {
      await tap(page.getByRole('button', { name: 'Previous exercise' }), 500)
      await tap(rows(page).first().getByRole('button', { name: 'Add set' }), 300)
      await page.locator('.celebration-overlay').waitFor({ timeout: 4000 })
      poster = Date.now() / 1000
    }, 0.05)
    await say('where', () => tap(page.getByRole('button', { name: 'Nice!' }), 400), 0.55)
    return poster
  },
}

const up = await fetch(BASE_URL).then((r) => r.ok, () => false)
if (!up) throw new Error(`No dev server on ${BASE_URL}: run VITE_DATA=local npm run dev -- --port 5174 --strictPort`)
const silentOk = process.argv.includes('--silent-ok')

mkdirSync(WORK, { recursive: true })
const browser = await chromium.launch()
try {
  const dir = join(WORK, 'cut')
  const clip = await recordSegment(browser, spec, join(dir, 'segment'))
  if (clip.silent && !silentOk) throw new Error(`Recorded without a voice (${clip.silent}); needs ELEVENLABS_API_KEY`)
  const record = clip.marks.find((m) => /beat my best/.test(m.text))
  await composeCut(browser, clip, dir, join(WORK, 'one-more-rep'), { title: { a: 'One more', b: 'rep' }, follow: false, coverAt: record.at + 2.2 })
} finally {
  await browser.close()
}
