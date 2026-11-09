import { test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { localDb, startLocal } from '../../e2e/fixtures/local'

// Issue #725: captioned store screenshots, regenerated with
//   npx playwright test --config docs/store-listing/playwright.config.ts
// Not part of the e2e gate: it asserts nothing, it only captures. Each run
// opens the app in local mode on an empty database, seeds ten weeks of
// push/pull history (the same history as scripts/lib/sample-account.mjs), so
// the chart, the record, and the milestones come from real app logic, and
// takes each screen at phone size. frame.html then adds the caption band.
//
// STORE_SIZE picks the canvas:
//   play (default)  1080x1920, Google Play phone screenshots (#198)
//   appstore        1290x2796, App Store 6.9-inch display (#35)
// Raw screens go to logs/store-listing/raw/, captioned ones to
// docs/store-listing/<size>/.

const SIZES = {
  // The phone frame's window in frame.html is about 862x1560 on Play's
  // canvas and 1030x2290 on Apple's, so the raw screen matches its shape.
  play: { canvas: { width: 1080, height: 1920 }, viewport: { width: 390, height: 706 } },
  appstore: { canvas: { width: 1290, height: 2796 }, viewport: { width: 390, height: 866 } },
}
const sizeName = (process.env.STORE_SIZE ?? 'play') as keyof typeof SIZES
const size = SIZES[sizeName]
if (!size) throw new Error(`STORE_SIZE must be one of ${Object.keys(SIZES).join(', ')}`)

const here = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(here, '../..')
const rawDir = join(root, 'logs', 'store-listing', 'raw', sizeName)
const outDir = join(here, sizeName)
const frame = pathToFileURL(join(here, 'frame.html')).href

// File name, then the caption: *one phrase* in pink, and a subcaption.
// Store search results show the first few, so the order is the pitch.
const CAPTIONS: Record<string, { title: string; sub: string }> = {
  '1-private': { title: 'Your log stays *on your phone*', sub: 'No account. No ads. No tracking.' },
  '2-logging': { title: 'Log a set *in seconds*', sub: "Last time's weight and reps are filled in." },
  '3-progress': { title: 'See every lift get *stronger*', sub: 'Charts built from your own sets.' },
  '4-record': { title: 'Celebrate *real records*', sub: 'With the numbers behind them.' },
  '5-routines': { title: 'Repeat the *routines* you love', sub: 'Push, pull, legs, or your own.' },
  '6-rest': { title: 'Rest, then *go again*', sub: 'The timer starts when you log a set.' },
  '7-milestones': { title: 'Milestones, *never streaks*', sub: 'Earned by training. No guilt for a missed day.' },
  '8-themes': { title: 'Make it *yours*', sub: 'Themes and matching app icons with Premium.' },
}

const DAY = 24 * 60 * 60 * 1000

async function seed(page: Page) {
  const db = localDb(page)
  const exerciseRows = [
    { name: 'Bench press', muscle_group: 'chest', rest_seconds: 90, load_type: 'weight', uses_barbell: true },
    { name: 'Overhead press', muscle_group: 'shoulders', rest_seconds: 90, load_type: 'weight', uses_barbell: true },
    { name: 'Triceps pushdown', muscle_group: 'arms', rest_seconds: 60, load_type: 'weight' },
    { name: 'Lat pulldown', muscle_group: 'back', rest_seconds: 60, load_type: 'weight' },
    { name: 'Assisted pull-up', muscle_group: 'back', rest_seconds: 90, load_type: 'assisted' },
    { name: 'Leg press', muscle_group: 'legs', rest_seconds: 90, load_type: 'weight' },
    { name: 'Plank', muscle_group: 'core', load_type: 'timed' },
  ]
  const ids: Record<string, string> = {}
  for (const row of exerciseRows) {
    const { data, error } = await db.from('exercises').insert(row).select('id').single()
    if (error) throw new Error(error.message)
    ids[row.name] = data.id
  }
  async function routine(name: string, names: string[]) {
    const { data, error } = await db.from('workout_templates').insert({ name }).select('id').single()
    if (error) throw new Error(error.message)
    for (const [position, n] of names.entries()) {
      const { error: joinError } = await db
        .from('workout_template_exercises')
        .insert({ template_id: data.id, exercise_id: ids[n], position, target_sets: 3 })
      if (joinError) throw new Error(joinError.message)
    }
    return data.id as string
  }
  const pushId = await routine('Push day', ['Bench press', 'Overhead press', 'Triceps pushdown'])
  const pullId = await routine('Pull day', ['Lat pulldown', 'Assisted pull-up'])
  await routine('Leg day', ['Leg press', 'Plank'])

  // Bench tops out at 135 x 8, so the 140 x 8 logged below is a real record.
  const bench = [110, 115, 115, 120, 120, 125, 125, 130, 130, 135]
  const ohp = [55, 55, 60, 60, 60, 65, 65, 65, 70, 70]
  const triceps = [35, 35, 40, 40, 40, 45, 45, 45, 50, 50]
  for (let week = 0; week < 10; week++) {
    const daysAgo = (10 - week) * 7 - 1
    const push = await db
      .from('workouts')
      .insert({ template_id: pushId, performed_at: new Date(Date.now() - daysAgo * DAY).toISOString() })
      .select('id')
      .single()
    if (push.error) throw new Error(push.error.message)
    for (let s = 0; s < 3; s++) {
      for (const [name, reps, weight] of [
        ['Bench press', 8, bench[week]],
        ['Overhead press', 8, ohp[week]],
        ['Triceps pushdown', 12, triceps[week]],
      ] as const) {
        const { error } = await db.from('sets').insert({ workout_id: push.data.id, exercise_id: ids[name], reps, weight, weight_unit: 'lb' })
        if (error) throw new Error(error.message)
      }
    }
    const pull = await db
      .from('workouts')
      .insert({ template_id: pullId, performed_at: new Date(Date.now() - (daysAgo - 3) * DAY).toISOString() })
      .select('id')
      .single()
    if (pull.error) throw new Error(pull.error.message)
    for (let s = 0; s < 3; s++) {
      const { error } = await db
        .from('sets')
        .insert({ workout_id: pull.data.id, exercise_id: ids['Lat pulldown'], reps: 10, weight: 90 + week * 5, weight_unit: 'lb' })
      if (error) throw new Error(error.message)
    }
  }
}

test('capture store screenshots', async ({ browser }) => {
  mkdirSync(rawDir, { recursive: true })
  mkdirSync(outDir, { recursive: true })
  const failed: string[] = []
  const taken = new Set<string>()
  const phone = { viewport: size.viewport, deviceScaleFactor: 3, colorScheme: 'dark' as const, isMobile: true, hasTouch: true }

  async function shot(page: Page, name: string) {
    await page.waitForTimeout(700)
    await page.screenshot({ path: join(rawDir, `${name}.png`) })
    taken.add(name)
  }

  // One failed screen shouldn't lose the rest; keep what the page showed.
  async function step(page: Page, name: string, fn: () => Promise<void>) {
    try {
      await fn()
    } catch (err) {
      failed.push(name)
      console.error(`store screenshot ${name} failed: ${(err as Error).message}`)
      await page.screenshot({ path: join(rawDir, `fail-${name}.png`) }).catch(() => {})
    }
  }

  // The first-run welcome, which says the data stays on the phone.
  const fresh = await browser.newContext(phone)
  const welcome = await fresh.newPage()
  await step(welcome, '1-private', async () => {
    await welcome.goto('/')
    await welcome.getByRole('dialog', { name: 'Set up RepBunny' }).waitFor()
    await shot(welcome, '1-private')
  })
  await fresh.close()

  const context = await browser.newContext(phone)
  await context.addInitScript(() => localStorage.setItem('rb-setup-done', '1'))
  const page = await context.newPage()
  await startLocal(page, { beforeNavigate: () => seed(page) })
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await nav.waitFor()

  // Three bench sets from the routine, the last a record, with the rest
  // timer after the first.
  await step(page, '2-logging', async () => {
    await page.getByRole('button', { name: 'Push day', exact: true }).click()
    const start = page.getByRole('button', { name: 'Start workout' })
    if (await start.isVisible().catch(() => false)) await start.click()
    await page.locator('.exercise-card-name').first().waitFor()
    for (let i = 1; i <= 3; i++) {
      const row = page.locator('.set-row-draft').first()
      await row.getByLabel('Reps').fill('8')
      await row.getByLabel('Weight').fill(i === 3 ? '140' : '135')
      await row.getByRole('button', { name: 'Add set' }).click()
      const celebration = page.locator('.celebration-overlay')
      if (await celebration.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) {
        await shot(page, '4-record')
        await page.getByRole('button', { name: 'Nice!' }).click()
        await celebration.waitFor({ state: 'hidden' })
      }
      const rest = page.locator('.rest-overlay')
      if (await rest.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) {
        if (i === 1) {
          // A browser has no rest alerts, so this notice is never on a phone.
          const notice = page.getByRole('group', { name: 'Rest alerts are off' })
          if (await notice.isVisible().catch(() => false)) await notice.getByRole('button', { name: 'Dismiss' }).click()
          await page.waitForTimeout(2500)
          await shot(page, '6-rest')
        }
        await page.getByRole('button', { name: 'Skip Rest' }).click()
        await rest.waitFor({ state: 'hidden' })
      }
    }
    // Finishing bench moves on to the next exercise; go back to it.
    await page.getByRole('button', { name: 'Bench press', exact: true }).first().click()
    await page.locator('.exercise-card-name', { hasText: 'Bench press' }).waitFor()
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot(page, '2-logging')
  })

  await step(page, '3-progress', async () => {
    await nav.getByRole('link', { name: 'Progress', exact: true }).click()
    await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
    await page.locator('.lift-row', { hasText: 'Bench press' }).click()
    await page.getByRole('dialog', { name: 'Bench press history' }).waitFor()
    await shot(page, '3-progress')
    await page.keyboard.press('Escape')
  })

  await step(page, '5-routines', async () => {
    await nav.getByRole('link', { name: 'Routines', exact: true }).click()
    await page.getByText('Push day', { exact: true }).first().waitFor()
    await shot(page, '5-routines')
  })

  await step(page, '7-milestones', async () => {
    await page.goto('/progress/milestones')
    await page.getByTestId('milestone-track-workouts').waitFor()
    // The one-time "already unlocked" note covers the first track.
    const gotIt = page.getByRole('button', { name: 'Got it', exact: true })
    if (await gotIt.isVisible().catch(() => false)) await gotIt.click()
    await shot(page, '7-milestones')
  })

  await step(page, '8-themes', async () => {
    await page.goto('/')
    await nav.waitFor()
    await page.getByRole('button', { name: 'Account', exact: true }).click()
    await page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Preferences/ }).click()
    await page.getByRole('dialog', { name: 'Preferences', exact: true }).getByRole('button', { name: /^Theme/ }).click()
    const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
    await theme.waitFor()
    await theme.getByRole('button', { name: 'Autumn', exact: true }).click()
    await shot(page, '8-themes')
  })

  await context.close()

  // The record and rest shots are taken only if their overlays appear during
  // 2-logging, so a missing one fails here instead of framing a stale file.
  for (const name of Object.keys(CAPTIONS)) {
    if (!taken.has(name) && !failed.includes(name)) failed.push(name)
  }

  // Caption each raw screen at the store's size.
  const canvas = await browser.newContext({ viewport: size.canvas, deviceScaleFactor: 1 })
  const framePage = await canvas.newPage()
  for (const [name, caption] of Object.entries(CAPTIONS)) {
    if (failed.includes(name)) continue
    const params = new URLSearchParams({ img: pathToFileURL(join(rawDir, `${name}.png`)).href, ...caption })
    await framePage.goto(`${frame}?${params}`)
    await framePage.evaluate(() => document.fonts.ready)
    await framePage.waitForLoadState('networkidle')
    await framePage.screenshot({ path: join(outDir, `${name}.png`) })
  }
  await canvas.close()
  console.log(`Wrote ${Object.keys(CAPTIONS).length - failed.length} screenshots to ${outDir}`)
  if (failed.length) throw new Error(`Couldn't capture: ${failed.join(', ')} (see ${rawDir}/fail-*.png)`)
})
