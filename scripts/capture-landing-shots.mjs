#!/usr/bin/env node
// Captures the phone screenshots for the landing page's "Made for your gym"
// carousel (site/index.html): an ab machine logged by level, an assisted pull-up, a
// treadmill set, and the stopwatch timing a wall sit, all in a real workout. Writes 480px-wide WebP files
// straight into site/img/ as gym-*.webp. Not part of the npm run test:e2e gate.
//
// Same setup as capture-guide-screenshots.mjs (scripts/lib/sample-account.mjs):
// a fresh local database with the sample history, at the installed
// app's full 390x844 screen. On top of the shared seed it adds the machine,
// treadmill, and wall sit exercises, a "Gym floor" template, and one past workout so each
// exercise has a last time to repeat.
//
// Requires the dev server already running (npm run dev). A screen that fails leaves a
// fail-<name>.png in logs/landing/<timestamp>/.
//
// Usage: node scripts/capture-landing-shots.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_URL, openSamplePhone } from './lib/sample-account.mjs'

const imgDir = join('site', 'img')
const failDir = join('logs', 'landing', String(Date.now()))
const WIDTH = 480
const DAY = 24 * 60 * 60 * 1000
const written = []
const failed = []

async function main() {
  const { admin, userId, browser, page } = await openSamplePhone('landing-shots', {
    extraStorage: { 'repbunny-whats-new-seen': '999999' },
    viewport: { width: 390, height: 844 },
  })

  const { data: added, error: exerciseError } = await admin
    .from('exercises')
    .insert([
      { user_id: userId, name: 'Ab sled', muscle_group: 'core', rest_seconds: 60, load_type: 'level', tracks_distance: false, tracks_incline: false },
      { user_id: userId, name: 'Treadmill', muscle_group: 'cardio', load_type: 'timed', tracks_distance: true, tracks_incline: true },
      { user_id: userId, name: 'Wall sit', muscle_group: 'legs', load_type: 'timed', tracks_distance: false, tracks_incline: false },
    ])
    .select('id, name')
  if (exerciseError) throw exerciseError
  const { data: assisted } = await admin.from('exercises').select('id, name').eq('user_id', userId).eq('name', 'Assisted pull-up').single()
  const id = (name) => [...added, assisted].find((e) => e.name === name).id
  const order = ['Ab sled', 'Assisted pull-up', 'Treadmill', 'Wall sit']

  const { data: template, error: templateError } = await admin.from('workout_templates').insert({ user_id: userId, name: 'Gym floor' }).select('id').single()
  if (templateError) throw templateError
  await admin
    .from('workout_template_exercises')
    .insert(order.map((n, i) => ({ template_id: template.id, exercise_id: id(n), position: i, target_sets: n === 'Treadmill' ? 1 : 3 })))

  const { data: past } = await admin
    .from('workouts')
    .insert({ user_id: userId, template_id: template.id, performed_at: new Date(Date.now() - 4 * DAY).toISOString() })
    .select('id')
    .single()
  const sets = []
  for (let s = 0; s < 3; s++) {
    sets.push({ workout_id: past.id, exercise_id: id('Ab sled'), set_index: s, reps: 15, weight: 0, weight_unit: 'lb', level: 4, duration_seconds: null, distance: null, distance_unit: null, incline: null })
    sets.push({ workout_id: past.id, exercise_id: id('Assisted pull-up'), set_index: s, reps: 8, weight: 60, weight_unit: 'lb', level: null, duration_seconds: null, distance: null, distance_unit: null, incline: null })
  }
  sets.push({ workout_id: past.id, exercise_id: id('Treadmill'), set_index: 0, reps: null, weight: 0, weight_unit: 'lb', level: null, duration_seconds: 1200, distance: 1.4, distance_unit: 'mi', incline: 3 })
  for (let s = 0; s < 3; s++) {
    sets.push({ workout_id: past.id, exercise_id: id('Wall sit'), set_index: s, reps: null, weight: 0, weight_unit: 'lb', level: null, duration_seconds: 30, distance: null, distance_unit: null, incline: null })
  }
  const { error: setsError } = await admin.from('sets').insert(sets)
  if (setsError) throw setsError

  // Assisted sets ask for a body weight first without one.
  await admin.from('body_weight_entries').delete().eq('user_id', userId)
  const { error: weighInError } = await admin
    .from('body_weight_entries')
    .insert({ user_id: userId, weight: 180, weight_unit: 'lb', recorded_at: new Date(Date.now() - 3 * DAY).toISOString() })
  if (weighInError) throw weighInError

  async function toWebp(png) {
    const encoder = await browser.newPage()
    const dataUrl = await encoder.evaluate(
      async ([b64, width]) => {
        const img = new Image()
        img.src = `data:image/png;base64,${b64}`
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = Math.round((img.height * width) / img.width)
        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/webp', 0.82)
      },
      [png.toString('base64'), WIDTH],
    )
    await encoder.close()
    return Buffer.from(dataUrl.split(',')[1], 'base64')
  }

  async function shot(name) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('.about-version, .app-version')) el.style.visibility = 'hidden'
      document.activeElement?.blur()
    })
    await page.waitForTimeout(600)
    const file = join(imgDir, `${name}.webp`)
    writeFileSync(file, await toWebp(await page.screenshot()))
    written.push(file)
  }

  async function step(name, fn) {
    try {
      await fn()
    } catch (err) {
      console.error(`capture-landing-shots: ${name} failed: ${err.message}`)
      failed.push(name)
      mkdirSync(failDir, { recursive: true })
      await page.screenshot({ path: join(failDir, `fail-${name}.png`) })
    }
  }

  // Log the first set (prefilled from last time), skip the rest timer, and
  // capture the exercise card.
  async function logFirstSet(exercise) {
    await page.getByRole('button', { name: exercise, exact: true }).first().click()
    await page.locator('.exercise-card-name', { hasText: exercise }).waitFor()
    await page.getByRole('button', { name: /^Add set|^Log set/ }).first().click()
    const rest = page.locator('.rest-overlay')
    if (await rest.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) {
      await page.getByRole('button', { name: 'Skip Rest' }).click()
      await rest.waitFor({ state: 'hidden' })
    }
    const celebrate = page.locator('.celebration-overlay')
    if (await celebrate.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Nice!' }).click()
      await celebrate.waitFor({ state: 'hidden' })
    }
    // Logging the last set auto-advances; go back to this one.
    await page.getByRole('button', { name: exercise, exact: true }).first().click()
    await page.locator('.exercise-card-name', { hasText: exercise }).waitFor()
    await page.evaluate(() => window.scrollTo(0, 0))
  }

  try {
    await page.goto(BASE_URL)
    await page.getByRole('navigation', { name: 'Primary' }).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'Gym floor', exact: true }).click()
    const start = page.getByRole('button', { name: 'Start workout' })
    if (await start.isVisible().catch(() => false)) await start.click()
    await page.locator('.exercise-card-name').waitFor({ state: 'visible' })

    await step('gym-level', async () => {
      await logFirstSet('Ab sled')
      await shot('gym-level')
    })
    await step('gym-assisted', async () => {
      await logFirstSet('Assisted pull-up')
      await shot('gym-assisted')
    })
    // The draft row shows the Time, Distance, and Incline fields; a logged
    // set collapses to one line.
    await step('gym-cardio', async () => {
      await page.getByRole('button', { name: 'Treadmill', exact: true }).first().click()
      await page.locator('.exercise-card-name', { hasText: 'Treadmill' }).waitFor()
      await page.getByPlaceholder('0:00').first().waitFor()
      await page.getByLabel('Distance', { exact: true }).first().fill('1.6')
      await page.getByLabel('Incline', { exact: true }).first().fill('4')
      await page.evaluate(() => window.scrollTo(0, 0))
      await shot('gym-cardio')
    })
    // The stopwatch, just past the goal on a wall sit, with last time's 0:30 as
    // the goal.
    await step('gym-stopwatch', async () => {
      await page.getByRole('button', { name: 'Wall sit', exact: true }).first().click()
      await page.locator('.exercise-card-name', { hasText: 'Wall sit' }).waitFor()
      await page.getByRole('button', { name: 'Start timer' }).first().click()
      await page.getByRole('button', { name: 'Stop', exact: true }).waitFor()
      await page.waitForTimeout(33400)
      await shot('gym-stopwatch')
    })
  } finally {
    await browser.close()
  }

  console.log(JSON.stringify({ written, failed }, null, 2))
  if (failed.length) process.exit(1)
}

main().catch((err) => {
  console.error(`capture-landing-shots: ${err.message}`)
  process.exit(1)
})
