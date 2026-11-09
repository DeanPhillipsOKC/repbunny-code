#!/usr/bin/env node
// Captures the phone screenshots for the how-to guides on repbunny.app
// (site/guides/, #102) and writes them as WebP straight into
// site/img/guides/, so one run regenerates every guide image. Not part of the
// npm run test:e2e gate. It makes no assertions, it only captures state.
//
// Same setup as capture-marketing-screenshots.mjs (scripts/lib/
// sample-account.mjs): the app in local mode on a fresh database seeded with
// the sample history each run, iPhone 13 at 3x in dark mode, at the installed
// app's full 390x844 screen. Shots are downscaled to 480px wide
// (about 2x the size the guides show them at). The build version is painted
// out, since the pages are public.
//
// Requires the dev server already running (npm run dev).
// A screen that fails leaves a fail-<name>.png in logs/guides/<timestamp>/.
//
// Usage: node scripts/capture-guide-screenshots.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_URL, openSamplePhone } from './lib/sample-account.mjs'

const imgDir = join('site', 'img', 'guides')
const failDir = join('logs', 'guides', String(Date.now()))
mkdirSync(imgDir, { recursive: true })

const WIDTH = 480
const HOUR = 60 * 60 * 1000
const written = []
const failed = []

async function main() {
  const { admin, userId, browser, page } = await openSamplePhone('guide-shots', {
    // An open "just updated" banner would sit on Home in every shot.
    // The first-rest tip (#429) would stand in for the rest screen's source line.
    extraStorage: { 'repbunny-whats-new-seen': '999999', 'rb-rest-tip-seen': '1' },
    // The installed app's full screen, not Safari's smaller viewport.
    viewport: { width: 390, height: 844 },
  })

  // One logged error, so the Report a bug list has something to pick.
  await admin.from('client_errors').delete().eq('user_id', userId)
  const { error: errorSeed } = await admin.from('client_errors').insert({
    user_id: userId,
    occurred_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    kind: 'request',
    message: "Couldn't save your set. Check your connection and try again.",
    route: '/',
  })
  if (errorSeed) throw errorSeed

  // Next-set targets (#140): last week's bench felt easy (RPE 7), so the
  // targets ask for more; once today's set 1 is in, the rows follow it (#160).
  const { data: benchRow } = await admin.from('exercises').select('id').eq('user_id', userId).eq('name', 'Bench press').single()
  // Bench is only on Push day, so its last workout is Push day's latest.
  const { data: pushDay } = await admin.from('workout_templates').select('id').eq('name', 'Push day').single()
  const { data: lastBench } = await admin
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .eq('template_id', pushDay.id)
    .order('performed_at', { ascending: false })
    .limit(1)
    .single()
  const { error: rpeSeed } = await admin.from('sets').update({ rpe: 7 }).eq('workout_id', lastBench.id).eq('exercise_id', benchRow.id)
  if (rpeSeed) throw rpeSeed

  // Strength levels (#136) need a weigh-in.
  await admin.from('body_weight_entries').delete().eq('user_id', userId)
  // Older weigh-ins too (#600), so the Body weight screen shows its chart.
  const { error: weighInSeed } = await admin.from('body_weight_entries').insert([
    { user_id: userId, weight: 184, weight_unit: 'lb', recorded_at: new Date(Date.now() - 60 * 24 * HOUR).toISOString() },
    { user_id: userId, weight: 182, weight_unit: 'lb', recorded_at: new Date(Date.now() - 30 * 24 * HOUR).toISOString() },
    { user_id: userId, weight: 180, weight_unit: 'lb', recorded_at: new Date(Date.now() - 72 * HOUR).toISOString() },
  ])
  if (weighInSeed) throw weighInSeed

  // Body measurements (#139): three entries a month apart, so the card has
  // changes and a waist chart.
  await admin.from('body_measurements').delete().eq('user_id', userId)
  const DAY = 24 * HOUR
  const { error: measureSeed } = await admin.from('body_measurements').insert([
    { user_id: userId, unit: 'in', waist: 35, chest: 41, hips: 40, arms: 14, thighs: 23, neck: 15.5, recorded_at: new Date(Date.now() - 60 * DAY).toISOString() },
    { user_id: userId, unit: 'in', waist: 34.25, chest: 41.5, hips: 39.5, arms: 14.5, thighs: 23.5, neck: 15.5, recorded_at: new Date(Date.now() - 30 * DAY).toISOString() },
    { user_id: userId, unit: 'in', waist: 33.5, chest: 42, arms: 14.75, recorded_at: new Date(Date.now() - 1 * DAY).toISOString() },
  ])
  if (measureSeed) throw measureSeed

  // Downscale a PNG in the browser and encode it as WebP (no image tooling
  // needed beyond Playwright's Chromium).
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
      for (const el of document.querySelectorAll('.account-email')) el.textContent = 'you@example.com'
      for (const el of document.querySelectorAll('.about-version, .app-version')) el.style.visibility = 'hidden'
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
      console.error(`capture-guide-screenshots: ${name} failed: ${err.message}`)
      failed.push(name)
      mkdirSync(failDir, { recursive: true })
      await page.screenshot({ path: join(failDir, `fail-${name}.png`) })
    }
  }

  const nav = page.getByRole('navigation', { name: 'Primary' })
  const accountMenu = page.getByRole('dialog', { name: 'Account', exact: true })

  async function openAccount() {
    await page.goto(BASE_URL)
    await nav.waitFor({ state: 'visible' })
    await page.getByRole('button', { name: 'Account', exact: true }).click()
    await accountMenu.waitFor()
  }

  async function openSection(title) {
    await openAccount()
    await accountMenu.getByRole('button', { name: new RegExp(`^${title}`) }).click()
    await page.getByRole('heading', { name: title, exact: true }).waitFor()
  }

  try {
    // Report a bug (#84)
    await step('bug-account', async () => {
      await openAccount()
      await accountMenu.evaluate((el) => el.scrollTo(0, el.scrollHeight))
      await shot('bug-account')
    })
    await step('bug-sheet', async () => {
      await accountMenu.getByRole('button', { name: 'Report a bug' }).click()
      const sheet = page.getByRole('dialog', { name: 'Report a bug' })
      await sheet.getByLabel(/What happened/).fill('Tapped Add set on bench and got an error.')
      await sheet.getByText("Couldn't save your set", { exact: false }).waitFor()
      await shot('bug-sheet')
    })

    // Partial backups (#93)
    await step('backup-data', async () => {
      await openSection('Your data')
      await shot('backup-data')
    })
    await step('backup-pick', async () => {
      await page.getByRole('button', { name: /^Back up my data/ }).click()
      const sheet = page.getByRole('dialog', { name: 'What to back up' })
      await sheet.getByText('Workout history', { exact: true }).click()
      await sheet.getByText("Restoring this adds to what's there", { exact: false }).waitFor()
      await shot('backup-pick')
    })

    // Import from Strong or Hevy (#208). Stops at the review screen, so the
    // sample account gets no imported workouts.
    const importSheet = page.getByRole('dialog', { name: 'Import from another app' })
    await step('import-pick', async () => {
      await openSection('Your data')
      await page.getByRole('button', { name: /^Import from another app/ }).click()
      await importSheet.waitFor()
      await shot('import-pick')
    })
    await step('import-review', async () => {
      await importSheet.getByLabel('Export file').setInputFiles(join('e2e', 'fixtures', 'imports', 'strong-sample.csv'))
      const review = page.getByRole('dialog', { name: 'Match your exercises' })
      await review.getByRole('listitem', { name: 'Bench Press (Barbell)' }).getByRole('button', { name: 'Yes, same one' }).click()
      await review.getByText('1 of 4 answered').waitFor()
      await shot('import-review')
    })

    // Rest timer (#80, #90)
    await step('rest-prefs', async () => {
      await openSection('Preferences')
      const input = page.getByLabel('Default rest timer')
      await input.fill('90')
      await input.blur()
      await page.waitForTimeout(400)
      await shot('rest-prefs')
    })
    await step('rest-overlay', async () => {
      await page.goto(BASE_URL)
      await nav.waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Push day', exact: true }).click()
      const start = page.getByRole('button', { name: 'Start workout' })
      if (await start.isVisible().catch(() => false)) await start.click()
      await page.locator('.exercise-card-name').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Add set' }).first().click()
      const celebration = page.locator('.celebration-overlay')
      if (await celebration.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false)) {
        await page.getByRole('button', { name: 'Nice!' }).click()
        await celebration.waitFor({ state: 'hidden' })
      }
      await page.locator('.rest-overlay').waitFor({ state: 'visible' })
      await shot('rest-overlay')
    })
    await step('rest-minibar', async () => {
      await page.getByRole('button', { name: 'Back to workout' }).click()
      await nav.getByRole('link', { name: 'Progress', exact: true }).click()
      await page.getByRole('heading', { name: 'Progress', exact: true }).waitFor()
      await page.locator('.rest-mini-bar').waitFor({ state: 'visible' })
      await shot('rest-minibar')
    })

    // Plate calculator (#22, #116). Runs on the workout the rest timer steps
    // started; the sample phone has Premium on (sample-account.mjs), so Plates
    // opens the calculator rather than the Premium sheet.
    const plates = page.getByRole('dialog', { name: 'Load the bar' })
    await step('plates-load', async () => {
      const skip = page.locator('.rest-mini-bar').getByRole('button', { name: 'Skip' })
      if (await skip.isVisible().catch(() => false)) await skip.click()
      await nav.getByRole('link', { name: 'Home', exact: true }).click()
      await page.locator('.exercise-card-name').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Plates' }).click()
      await plates.waitFor()
      await plates.getByLabel('Total weight').fill('185')
      await plates.getByText('each side =').waitFor()
      await shot('plates-load')
    })
    await step('plates-edit', async () => {
      await plates.getByRole('button', { name: 'Edit', exact: true }).click()
      await plates.getByText('Plates at my gym').waitFor()
      await plates.getByText('Plates at my gym').scrollIntoViewIfNeeded()
      await shot('plates-edit')
      await plates.getByRole('button', { name: 'Done', exact: true }).click()
    })
    await step('plates-closest', async () => {
      await plates.getByLabel('Total weight').fill('187')
      await plates.getByText("You can't make", { exact: false }).waitFor()
      await plates.evaluate((el) => el.scrollTo(0, 0))
      await shot('plates-closest')
      await plates.getByRole('button', { name: 'Close', exact: true }).click()
    })

    // Next-set targets (#140, per row since #160), on the same bench card.
    // Set 1 is already logged, so the open rows' targets follow it.
    await step('targets-hint', async () => {
      const row = page.locator('.set-row-draft').first()
      await row.getByTestId('set-target').waitFor({ state: 'visible' })
      const why = row.getByRole('button', { name: /^Why this target for set/ })
      await why.click()
      await row.locator('.set-target-why').waitFor()
      await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot('targets-hint')
      await why.click()
    })

    // Swap a taken machine (help-review, #150): the Try instead sheet for
    // bench, closed without swapping.
    await step('swap-sheet', async () => {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.getByRole('button', { name: 'Swap exercise' }).click()
      const sheet = page.getByRole('dialog', { name: 'Try instead' })
      await sheet.getByRole('list', { name: 'Alternatives' }).waitFor()
      await page.waitForTimeout(800)
      await shot('swap-sheet')
      await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
      await sheet.waitFor({ state: 'hidden' })
    })

    // Log a workout and Exercise history (help-review). Still the Push day
    // workout from the rest timer steps: bench has one logged set and two
    // rows left, and ten weeks of seeded history.
    await step('log-sets', async () => {
      await page.locator('.exercise-card-name').waitFor({ state: 'visible' })
      await page.evaluate(() => window.scrollTo(0, 0))
      await shot('log-sets')
    })
    await step('log-add-exercise', async () => {
      await page.getByRole('button', { name: 'Add exercise', exact: true }).click()
      const sheet = page.getByRole('dialog', { name: 'Add exercise' })
      await sheet.getByPlaceholder('Search exercises').waitFor()
      await shot('log-add-exercise')
      await sheet.getByRole('button', { name: 'Close', exact: true }).click()
      await sheet.waitFor({ state: 'hidden' })
    })
    const history = page.getByRole('dialog', { name: 'Bench press history' })
    await step('history-chart', async () => {
      await page.getByRole('button', { name: 'View exercise history' }).click()
      await history.getByRole('button', { name: /What's est\. 1RM/ }).waitFor()
      await shot('history-chart')
    })
    await step('history-next', async () => {
      const next = history.getByRole('heading', { name: 'Next time' })
      await next.evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await shot('history-next')
      await history.getByRole('button', { name: 'Close history' }).click()
      await history.waitFor({ state: 'hidden' })
    })
    await step('log-recap', async () => {
      await page.getByRole('button', { name: 'Finish workout' }).click()
      await page.getByRole('button', { name: 'Finish anyway' }).click()
      await page.getByTestId('post-finish-card').waitFor({ state: 'visible' })
      // The lower half (notes, Done, Resume): finished early, the top card
      // would lead with a big volume drop against the last full Push day.
      await page.locator('#recap-notes').evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot('log-recap')
    })
    // How did it feel? (help-review, #149): two tags picked on the same recap.
    await step('feel-recap', async () => {
      const card = page.getByTestId('recap-feel')
      await card.getByRole('group', { name: 'Sleep' }).getByRole('button', { name: '6 to 8 h' }).click()
      await card.getByRole('group', { name: 'Energy' }).getByRole('button', { name: 'High' }).click()
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot('feel-recap')
    })
    await step('recap-done', async () => {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
    })

    // Templates (help-review)
    await step('templates-home', async () => {
      await page.goto(BASE_URL)
      await page.getByRole('heading', { name: 'What are you training today?' }).waitFor()
      await shot('templates-home')
    })
    await step('templates-editor', async () => {
      await nav.getByRole('link', { name: 'Routines', exact: true }).click()
      await page.getByText('Push day', { exact: true }).click()
      await page.getByRole('button', { name: 'Reorder Bench press' }).waitFor()
      await shot('templates-editor')
    })
    await step('templates-from-workout', async () => {
      await page.goto(`${BASE_URL}/progress/workouts`)
      await page.locator('.condensed-trigger').first().click()
      await page.getByRole('button', { name: 'Save as routine' }).first().click()
      await page.getByLabel('Routine name').waitFor()
      await page.evaluate(() => document.activeElement?.blur())
      await shot('templates-from-workout')
    })
    // Fix a past workout (help-review): a set open for editing, then
    // cancelled, so nothing changes.
    await step('workout-log-edit', async () => {
      await page.goto(`${BASE_URL}/progress/workouts`)
      await page.locator('.condensed-trigger').first().click()
      const set = page.getByRole('button', { name: /^Edit set 1,/ }).first()
      await set.click()
      const form = page.locator('.set-edit-form').first()
      await form.waitFor()
      await page.evaluate(() => document.activeElement?.blur())
      await form.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot('workout-log-edit')
      await form.getByRole('button', { name: 'Cancel', exact: true }).click()
    })

    // Milestones (help-review, #153).
    await step('milestones-screen', async () => {
      await page.goto(`${BASE_URL}/progress/milestones`)
      await nav.waitFor({ state: 'visible' })
      await page.getByTestId('milestone-track-workouts').waitFor()
      await shot('milestones-screen')
    })

    // Load types (help-review). The exercise sheet is closed without saving.
    const exerciseSheet = page.getByRole('dialog', { name: 'New exercise' })
    await step('load-types-pick', async () => {
      await nav.getByRole('link', { name: 'Exercises', exact: true }).click()
      await page.getByRole('button', { name: 'New exercise' }).click()
      await exerciseSheet.getByLabel('Name').fill('Dip machine')
      await exerciseSheet.getByRole('button', { name: 'Chest', exact: true }).first().click()
      await exerciseSheet.getByRole('button', { name: 'Assisted', exact: true }).click()
      await page.evaluate(() => document.activeElement?.blur())
      await exerciseSheet.locator('.load-type-field').evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await shot('load-types-pick')
    })
    await step('load-types-timed', async () => {
      await exerciseSheet.getByRole('button', { name: 'Timed', exact: true }).click()
      await exerciseSheet.getByLabel('Distance').check()
      await exerciseSheet.locator('.load-type-field').evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await shot('load-types-timed')
      await exerciseSheet.getByRole('button', { name: 'Close', exact: true }).click()
    })
    // Next-set targets' per-exercise switch (#140), closed without saving.
    await step('targets-switch', async () => {
      const row = page.locator('.row-wrap', { hasText: 'Bench press' })
      await row.getByRole('button', { name: 'More options' }).click()
      await row.getByRole('button', { name: 'Edit exercise' }).click()
      const sheet = page.getByRole('dialog', { name: 'Edit exercise' })
      const toggle = sheet.getByRole('switch', { name: 'Next-set targets' })
      await toggle.waitFor()
      await toggle.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot('targets-switch')
      await sheet.getByRole('button', { name: 'Close', exact: true }).click()
      await sheet.waitFor({ state: 'hidden' })
    })
    await step('load-types-stopwatch', async () => {
      await page.goto(BASE_URL)
      await nav.waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Leg day', exact: true }).click()
      await page.locator('.exercise-card-name').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Plank', exact: true }).click()
      await page.locator('.exercise-card-name', { hasText: 'Plank' }).waitFor()
      await page.getByPlaceholder('0:00').first().fill('100')
      await page.getByRole('button', { name: 'Start timer' }).first().click()
      await page.getByRole('button', { name: 'Stop', exact: true }).waitFor()
      await page.waitForTimeout(2400)
      await shot('load-types-stopwatch')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    })

    // Monthly report (#134). The sample's ten weeks always cover last month.
    await step('reports-hub', async () => {
      await page.goto(`${BASE_URL}/progress`)
      await nav.waitFor({ state: 'visible' })
      const tile = page.getByRole('link', { name: / report$/ })
      await tile.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot('reports-hub')
    })
    await step('reports-month', async () => {
      await page.getByRole('link', { name: / report$/ }).click()
      await page.getByTestId('report-stat-workouts').waitFor()
      await page.evaluate(() => window.scrollTo(0, 0))
      await shot('reports-month')
    })
    // Share as PDF (#152): the range picker.
    await step('reports-share', async () => {
      await page.getByRole('button', { name: 'Share as PDF' }).click()
      const sheet = page.getByRole('dialog', { name: 'Share as PDF' })
      await sheet.getByText('Last 4 weeks').click()
      await page.waitForTimeout(300)
      await shot('reports-share')
      await sheet.getByRole('button', { name: 'Cancel' }).click()
    })

    // Strength levels (#136): the one-time question, then bench and overhead
    // press rated against the 180 lb weigh-in seeded above.
    await step('strength-ask', async () => {
      await page.goto(`${BASE_URL}/progress/strength`)
      await nav.waitFor({ state: 'visible' })
      await page.getByRole('heading', { name: 'One question first' }).waitFor()
      await shot('strength-ask')
    })
    await step('strength-levels', async () => {
      await page.getByRole('button', { name: 'Male', exact: true }).click()
      await page.getByTestId('strength-overall').waitFor()
      await shot('strength-levels')
    })

    // Body weight (#600): the weight card and trend chart, then the list.
    await step('body-weight', async () => {
      await page.goto(`${BASE_URL}/body`)
      await nav.waitFor({ state: 'visible' })
      await page.getByRole('button', { name: "Log today's weight" }).waitFor()
      await shot('body-weight')
    })
    await step('body-weight-list', async () => {
      await page.getByRole('button', { name: 'See all weigh-ins' }).click()
      await page.getByRole('dialog', { name: 'Weigh-ins' }).waitFor()
      await shot('body-weight-list')
      await page.getByRole('button', { name: 'Close weigh-ins' }).click()
    })

    // Body measurements (#139): the card with the seeded entries, the add
    // form, and the How to measure sheet.
    await step('measurements-card', async () => {
      await page.goto(`${BASE_URL}/body`)
      await nav.waitFor({ state: 'visible' })
      const card = page.getByTestId('measurements-card')
      await card.getByRole('button', { name: /^Waist/ }).waitFor()
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot('measurements-card')
    })
    await step('measurements-form', async () => {
      const card = page.getByTestId('measurements-card')
      await card.getByRole('button', { name: 'Log measurements' }).click()
      await card.getByLabel('Waist', { exact: true }).fill('33')
      await card.getByLabel('Arms', { exact: true }).fill('15')
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot('measurements-form')
      await card.getByRole('button', { name: 'Cancel' }).click()
    })
    await step('measurements-how', async () => {
      await page.getByTestId('measurements-card').getByRole('button', { name: 'How to measure' }).click()
      await page.getByRole('dialog', { name: 'How to measure' }).waitFor()
      await shot('measurements-how')
      await page.getByRole('button', { name: 'Got it' }).click()
    })

    // Starter programs (#148): the section on Templates, then one program's
    // description. Nothing is added, so the sample's templates stay as seeded.
    // The section starts at the top so its Machines group shows (#167).
    await step('programs-list', async () => {
      await page.goto(`${BASE_URL}/templates`)
      await nav.waitFor({ state: 'visible' })
      const section = page.getByRole('region', { name: 'Starter programs' })
      await section.waitFor()
      await section.evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await shot('programs-list')
    })
    await step('programs-sheet', async () => {
      await page.getByRole('region', { name: 'Starter programs' }).getByRole('button', { name: /Push \/ pull \/ legs/ }).click()
      await page.getByRole('dialog', { name: 'Push / pull / legs' }).waitFor()
      await shot('programs-sheet')
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    })

    // Extras (#154): the group on the Theme screen, then the Week mark picker
    // with Stars picked and a locked one previewed. The sample history
    // unlocks Stars on first visit. Puts the week mark back afterward.
    await step('extras-list', async () => {
      await openSection('Preferences')
      await page.getByRole('button', { name: /^Theme/ }).click()
      const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
      const row = theme.getByRole('button', { name: 'Week mark', exact: true })
      await row.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await shot('extras-list')
    })
    await step('extras-picker', async () => {
      const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
      await theme.getByRole('button', { name: 'Week mark', exact: true }).click()
      const picker = page.getByRole('dialog', { name: 'Week mark', exact: true })
      await picker.getByRole('button', { name: 'Stars', exact: true }).click()
      await picker.getByRole('button', { name: /, locked,/ }).first().click()
      await shot('extras-picker')
      await picker.getByRole('button', { name: 'Match theme', exact: true }).click()
      await picker.getByRole('button', { name: 'Close', exact: true }).click()
    })

    // Weight unit (#599).
    await step('weight-unit-pref', async () => {
      await openSection('Preferences')
      await page.getByRole('group', { name: 'Weight unit' }).getByRole('button', { name: 'kg', exact: true }).click()
      await page.waitForTimeout(400)
      await shot('weight-unit-pref')
    })

    // Themes (#107, #121). Last, since the pick sticks for the rest of the run.
    // The sample phone has Premium on, so picks save instead of preview.
    await step('themes-pick', async () => {
      await openSection('Preferences')
      await page.getByRole('button', { name: /^Theme/ }).click()
      const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
      await theme.getByRole('button', { name: 'Halloween', exact: true }).click()
      await shot('themes-pick')
    })
    await step('themes-minimal', async () => {
      const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
      await theme.getByRole('button', { name: 'Minimal', exact: true }).click()
      await theme.getByRole('button', { name: 'Close', exact: true }).click()
      await nav.getByRole('link', { name: 'Progress', exact: true }).click()
      await page.getByRole('heading', { name: 'Progress', exact: true }).waitFor()
      await shot('themes-minimal')
    })
  } finally {
    await browser.close()
  }

  console.log(JSON.stringify({ written, failed }, null, 2))
  if (failed.length) process.exit(1)
}

main().catch((err) => {
  console.error(`capture-guide-screenshots: ${err.message}`)
  process.exit(1)
})
