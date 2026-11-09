#!/usr/bin/env node
// Drives the app through every main screen on a mobile viewport (iPhone 13),
// saving a screenshot at each meaningful state for the ux-review skill
// (.claude/skills/ux-review/SKILL.md) to look at. Not part of the
// npm run test:e2e gate: this makes no assertions, it only captures state.
//
// Requires the dev server already running (npm run dev). Each browser
// context starts the app in local mode on its own empty on-device database
// (#940), so there's nothing to clean up afterward. A few weeks of past
// workouts are seeded through the local database shim (scripts/lib/
// local-db.mjs) so Progress, charts, and History have something to show.
//
// Each step is wrapped so one stale selector logs a failure (with the
// screen's accessibility tree) and the tour carries on, instead of the whole
// run dying on the first UI change.
//
// Usage: node scripts/capture-ux-screenshots.mjs

import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { localDb } from './lib/local-db.mjs'

const BASE_URL = 'http://localhost:5173'
const stamp = Date.now()
const outDir = join('logs', 'ux-review', String(stamp))
mkdirSync(outDir, { recursive: true })

const manifest = []
const failures = []
let shotIndex = 0

// Viewport-sized shots, the way a phone actually shows the screen (a
// full-page capture strands the fixed bottom nav mid-image). Long pages get
// one extra shot per screenful scrolled, up to four; sheets and overlays
// pass `fullPage: false` to take just the one.
async function shot(page, label, { fullPage = true } = {}) {
  await page.waitForTimeout(400)
  const capture = async (suffix) => {
    shotIndex += 1
    const file = `${String(shotIndex).padStart(2, '0')}-${label}${suffix}.png`
    await page.screenshot({ path: join(outDir, file) })
    manifest.push({ file, label: label + suffix })
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await capture('')
  if (!fullPage) return
  for (let i = 2; i <= 4; i++) {
    const moved = await page.evaluate(() => {
      const before = window.scrollY
      window.scrollBy(0, window.innerHeight - 120)
      return window.scrollY !== before
    })
    if (!moved) break
    await page.waitForTimeout(250)
    await capture(`-p${i}`)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function step(page, name, fn) {
  try {
    await fn()
  } catch (err) {
    let tree = ''
    try {
      tree = (await page.locator('body').ariaSnapshot()).split('\n').slice(0, 60).join('\n')
    } catch {}
    failures.push({ step: name, error: err.message.split('\n')[0], tree })
    // Get back to a known state for the next step.
    await page.keyboard.press('Escape').catch(() => {})
  }
}

async function dismissOverlays(page, label) {
  for (const [selector, button, name] of [
    ['.celebration-overlay', 'Nice!', 'record-celebration'],
    ['.rest-overlay', 'Skip Rest', 'rest-timer'],
  ]) {
    const overlay = page.locator(selector)
    try {
      await overlay.waitFor({ state: 'visible', timeout: 2000 })
      await shot(page, `${name}-${label}`, { fullPage: false })
      await page.getByRole('button', { name: button }).click()
      await overlay.waitFor({ state: 'hidden' })
    } catch {}
  }
}

// Past workouts for the progress screens: two sessions a week for four weeks.
async function seedHistory(admin, userId) {
  const { data: exercises } = await admin.from('exercises').select('id, name, load_type').eq('user_id', userId)
  const byName = (part) => exercises.find((e) => e.name.toLowerCase().includes(part))
  const bench = byName('bench')
  const squat = byName('squat')
  const row = byName('row')
  const plank = byName('plank')
  const day = 24 * 60 * 60 * 1000
  for (let i = 8; i >= 1; i--) {
    const performed = new Date(Date.now() - i * 3.5 * day)
    const { data: w } = await admin
      .from('workouts')
      .insert({ user_id: userId, performed_at: performed.toISOString() })
      .select('id')
      .single()
    const sets = []
    let index = 0
    const add = (ex, reps, weight) => ex && sets.push({ workout_id: w.id, exercise_id: ex.id, set_index: index++, reps, weight, weight_unit: 'lb' })
    const progress = 8 - i
    for (let s = 0; s < 3; s++) add(bench, 8 - (s === 2 ? 1 : 0), 115 + progress * 5)
    for (let s = 0; s < 3; s++) add(i % 2 ? row : squat, 10, i % 2 ? 95 + progress * 5 : 135 + progress * 10)
    if (plank) sets.push({ workout_id: w.id, exercise_id: plank.id, set_index: index++, reps: null, weight: 0, weight_unit: 'lb', duration_seconds: 45 + progress * 5 })
    await admin.from('sets').insert(sets)
  }
  for (let i = 0; i < 5; i++) {
    await admin.from('body_weight_entries').insert({
      user_id: userId,
      weight: 152 - i * 0.8,
      weight_unit: 'lb',
      recorded_at: new Date(Date.now() - (28 - i * 7) * day).toISOString(),
    })
  }
}

async function main() {
  // One user per device; the shim drops `user_id` from the seed rows.
  const userId = 'local'
  const browser = await chromium.launch()

  try {
    // Onboarding on a first launch.
    const onboarding = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })
    const op = await onboarding.newPage()
    op.setDefaultTimeout(6000)
    await op.goto(BASE_URL)
    await shot(op, 'onboarding-welcome')
    await step(op, 'onboarding', async () => {
      for (let i = 0; i < 6; i++) {
        const hop = op.getByRole('button', { name: /let's hop in|next|continue|get started/i }).first()
        if (!(await hop.isVisible().catch(() => false))) break
        await hop.click()
        await shot(op, `onboarding-step-${i + 1}`)
      }
    })
    await onboarding.close()

    // A brand-new install: no unit chosen yet, so the setup wizard opens.
    const context = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 })
    const page = await context.newPage()
    page.setDefaultTimeout(6000)
    await page.goto(BASE_URL)
    const admin = localDb(page)
    // The wizard waits on the exercises, routines, and profile fetches, so give a cold server time (#550).
    await step(page, 'app shell', async () => {
      await page.locator('nav[aria-label="Primary"]').waitFor({ state: 'visible', timeout: 20000 })
    })
    // First run opens the setup wizard (#397 to #399), full screen over the app.
    const wizard = page.getByRole('dialog', { name: 'Set up RepBunny' })
    await step(page, 'wizard open', async () => {
      await wizard.waitFor({ state: 'visible', timeout: 20000 })
      await shot(page, 'wizard-welcome', { fullPage: false })
    })
    await step(page, 'wizard walk', async () => {
      await wizard.getByRole('button', { name: 'Set up in 30 seconds' }).click()
      await wizard.getByRole('heading', { name: 'How do you measure?' }).waitFor()
      await wizard.getByRole('button', { name: 'lb', exact: true }).click()
      await shot(page, 'wizard-units', { fullPage: false })
      await wizard.getByRole('button', { name: 'Next' }).click()
      await wizard.getByRole('group', { name: 'Look' }).waitFor()
      await shot(page, 'wizard-look', { fullPage: false })
      await wizard.getByRole('button', { name: 'Next' }).click()
      // The automatic copy step (#874).
      await wizard.getByRole('heading', { name: 'Your workouts, kept safe' }).waitFor()
      await shot(page, 'wizard-copy', { fullPage: false })
      await wizard.getByRole('button', { name: 'Next' }).click()
      await wizard.getByRole('button', { name: /Use a starter program/ }).waitFor()
      await shot(page, 'wizard-how-to-train', { fullPage: false })
      // Every choice finishes setup. The starter program one lands on the programs list.
      await wizard.getByRole('button', { name: /Use a starter program/ }).click()
      await wizard.waitFor({ state: 'hidden' })
      await page.waitForTimeout(800)
      await shot(page, 'wizard-done-programs')
    })
    // A failed wizard step leaves it open; skip it so the tour can go on.
    if (await wizard.isVisible().catch(() => false)) {
      await step(page, 'wizard skip fallback', async () => {
        await wizard.getByRole('button', { name: /^Skip( setup)?$/ }).click()
        await wizard.waitFor({ state: 'hidden' })
      })
    }
    await page.goto(BASE_URL)
    await page.waitForTimeout(1000)
    await shot(page, 'home-empty')

    await page.goto(`${BASE_URL}/exercises`)
    await shot(page, 'exercises-empty-form')
    await step(page, 'library', async () => {
      await page.getByRole('button', { name: 'Library', exact: true }).click()
      await shot(page, 'exercises-library')
    })
    await step(page, 'library detail', async () => {
      await page.getByRole('searchbox', { name: 'Search the library' }).fill('Bench Press')
      await shot(page, 'exercises-library-search', { fullPage: false })
      await page.getByRole('button', { name: 'View Barbell Bench Press' }).click()
      await shot(page, 'library-detail')
      await page.getByRole('button', { name: 'Add to my exercises' }).click()
      await page.waitForTimeout(800)
      await shot(page, 'library-detail-added')
    })
    for (const name of ['Barbell Back Squat', 'Barbell Row', 'Plank', 'Lat Pulldown']) {
      await step(page, `library add ${name}`, async () => {
        await page.goto(`${BASE_URL}/exercises`)
        await page.getByRole('button', { name: 'Library', exact: true }).click()
        await page.getByRole('searchbox', { name: 'Search the library' }).fill(name)
        await page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
        await page.waitForTimeout(800)
      })
    }

    await seedHistory(admin, userId)

    await page.goto(`${BASE_URL}/exercises`)
    await page.waitForTimeout(1000)
    await shot(page, 'exercises-list')
    await step(page, 'exercise edit', async () => {
      await page.getByRole('button', { name: 'Edit exercise' }).first().click()
      await shot(page, 'exercise-edit')
      await page.getByRole('button', { name: 'Cancel' }).first().click()
    })
    await step(page, 'exercise delete confirm', async () => {
      await page.getByRole('button', { name: 'Delete exercise' }).first().click()
      await shot(page, 'exercise-delete-confirm')
      await page.getByRole('button', { name: 'Cancel' }).first().click()
    })
    await step(page, 'exercise history', async () => {
      await page.getByRole('button', { name: 'View exercise history' }).first().click()
      await page.waitForTimeout(1200)
      await shot(page, 'exercise-history-detail')
      await page.keyboard.press('Escape')
    })

    // Templates.
    await page.goto(`${BASE_URL}/templates`)
    await shot(page, 'templates-empty')
    await step(page, 'template create', async () => {
      await page.getByRole('button', { name: 'Add routine' }).click()
      await shot(page, 'template-name-sheet', { fullPage: false })
      const nameSheet = page.getByRole('dialog', { name: 'New routine' })
      await nameSheet.getByLabel('Name', { exact: true }).fill('Push Day')
      await nameSheet.getByRole('button', { name: 'Next' }).click()
      const sheet = page.getByRole('dialog', { name: 'Add exercise' })
      for (const n of ['Bench', 'Row', 'Plank']) {
        await sheet.getByPlaceholder('Search exercises').fill(n)
        await sheet.getByRole('button', { name: new RegExp(n, 'i') }).first().click()
      }
      await shot(page, 'template-add-exercise-sheet', { fullPage: false })
      await sheet.getByRole('button', { name: 'Done' }).click()
      await page.waitForTimeout(800)
      await shot(page, 'template-editor')
    })
    await page.goto(`${BASE_URL}/templates`)
    await page.waitForTimeout(800)
    await shot(page, 'templates-list')

    // Progress screens with seeded history.
    for (const [path, label] of [
      ['/progress', 'progress-hub'],
      ['/progress/workouts', 'workout-log'],
      ['/progress/lifts', 'lift-progress'],
      ['/progress/muscles', 'muscle-progress'],
      ['/progress/muscles/chest', 'muscle-detail-chest'],
      ['/body', 'body'],
    ]) {
      await page.goto(BASE_URL + path)
      await page.waitForTimeout(1500)
      await shot(page, label)
    }
    await step(page, 'workout log edit', async () => {
      await page.goto(`${BASE_URL}/progress/workouts`)
      await page.waitForTimeout(1200)
      await page.getByRole('button', { name: /No sets logged|sets?/ }).first().click().catch(() => {})
      await page.waitForTimeout(600)
      await shot(page, 'workout-log-expanded')
      await page.getByRole('button', { name: /^Edit/ }).first().click()
      await shot(page, 'workout-log-edit')
    })
    await step(page, 'lift progress detail', async () => {
      await page.goto(`${BASE_URL}/progress/lifts`)
      await page.waitForTimeout(1200)
      await page.getByRole('link').filter({ hasText: /bench/i }).or(page.getByRole('button').filter({ hasText: /bench/i })).first().click()
      await page.waitForTimeout(1200)
      await shot(page, 'lift-progress-detail')
    })

    // Account sheet.
    await page.goto(BASE_URL)
    await step(page, 'account sheet', async () => {
      await page.getByRole('button', { name: 'Account' }).first().click()
      await shot(page, 'account-sheet', { fullPage: false })
      const sheet = page.getByRole('dialog', { name: 'Account' })
      await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight / 2))
      await shot(page, 'account-sheet-middle', { fullPage: false })
      await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight))
      await shot(page, 'account-sheet-bottom', { fullPage: false })
      await sheet.getByRole('button', { name: 'Close' }).click()
    })

    // A live workout.
    await page.goto(BASE_URL)
    await page.waitForTimeout(1200)
    await shot(page, 'home-with-history')
    await step(page, 'start workout', async () => {
      await page.getByRole('button', { name: /push day/i }).first().click()
      await shot(page, 'home-template-picked')
      // Picking a template now starts the workout itself; older flows had a Start button.
      await page.getByRole('button', { name: /start/i }).first().click({ timeout: 1500 }).catch(() => {})
      await page.waitForTimeout(1200)
      await shot(page, 'logger-start')
    })
    await step(page, 'log a set', async () => {
      await shot(page, 'logger-viewport', { fullPage: false })
      const submit = page.getByRole('main').getByRole('listitem').first().getByRole('button', { name: /^(Log|Add|Save) set/i })
      await submit.click()
      await dismissOverlays(page, 'first-set')
      await shot(page, 'logger-after-set')
    })
    await step(page, 'plate calculator', async () => {
      await page.getByRole('button', { name: /plate/i }).first().click()
      await shot(page, 'plate-calculator', { fullPage: false })
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /close|done/i }).first().click({ timeout: 2000 }).catch(() => {})
    })
    await step(page, 'edit a logged set', async () => {
      await page.getByRole('button', { name: /^Edit set 1/ }).first().click()
      await shot(page, 'logger-edit-set')
      await page.getByRole('button', { name: 'Cancel' }).first().click()
    })
    await step(page, 'next exercise', async () => {
      await page.getByRole('button', { name: 'Next exercise' }).click()
      await page.waitForTimeout(600)
      await shot(page, 'logger-second-exercise')
      await page.getByRole('button', { name: 'Next exercise' }).click()
      await page.waitForTimeout(600)
      await shot(page, 'logger-timed-exercise')
    })
    await step(page, 'logger add exercise', async () => {
      await page.getByRole('button', { name: 'Add exercise' }).first().click()
      await shot(page, 'logger-add-exercise-sheet', { fullPage: false })
      // "Done" once something is picked, otherwise just "Close".
      await page.getByRole('dialog', { name: 'Add exercise' }).getByRole('button', { name: /^(Done|Close)$/ }).first().click()
    })
    await step(page, 'finish', async () => {
      await page.getByRole('button', { name: /Finish workout/ }).click()
      await page.waitForTimeout(800)
      await shot(page, 'finish-step-1')
      const confirm = page.getByRole('dialog').getByRole('button', { name: /finish/i }).first()
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click()
        await page.waitForTimeout(1200)
      }
      await dismissOverlays(page, 'finish')
      await shot(page, 'finish-recap')
    })

    await context.close()
  } finally {
    await browser.close()
  }

  console.log(JSON.stringify({ outDir, screenshots: manifest.map((m) => m.file), failures }, null, 2))
}

main().catch((err) => {
  console.error(`capture-ux-screenshots: ${err.message}`)
  process.exit(1)
})
