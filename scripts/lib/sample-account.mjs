// Shared setup for the screenshot scripts (capture-marketing-screenshots.mjs,
// #58, capture-guide-screenshots.mjs, #102, and capture-landing-shots.mjs):
// the app in local mode on a fresh on-device database, seeded with ten weeks
// of push/pull history, on an iPhone 13 page at 3x in dark mode. Issue #940
// moved it off the retired test backend: each run's browser context starts
// with an empty database, so repeat runs give the same screens.

import { chromium, devices } from 'playwright'
import { localDb } from './local-db.mjs'

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173'
const DAY = 24 * 60 * 60 * 1000
// One user per device; seeding code passes it as `user_id`, which the shim drops.
const LOCAL_USER_ID = 'local'

// Seeds the sample history through the local database shim (local-db.mjs).
export async function seedSampleAccount(admin, userId) {
  const exerciseRows = [
    { name: 'Bench press', muscle_group: 'chest', rest_seconds: 90, load_type: 'weight', uses_barbell: true },
    { name: 'Overhead press', muscle_group: 'shoulders', rest_seconds: 90, load_type: 'weight', uses_barbell: true },
    { name: 'Triceps pushdown', muscle_group: 'arms', rest_seconds: 60, load_type: 'weight' },
    { name: 'Lat pulldown', muscle_group: 'back', rest_seconds: 60, load_type: 'weight' },
    { name: 'Assisted pull-up', muscle_group: 'back', rest_seconds: 90, load_type: 'assisted' },
    { name: 'Leg press', muscle_group: 'legs', rest_seconds: 90, load_type: 'weight' },
    { name: 'Plank', muscle_group: 'core', load_type: 'timed' },
  ].map((e) => ({ user_id: userId, ...e }))
  const { data: exercises, error: exerciseError } = await admin.from('exercises').insert(exerciseRows).select('id, name')
  if (exerciseError) throw new Error(exerciseError.message)
  const id = (name) => exercises.find((e) => e.name === name).id

  async function template(name, names) {
    const { data: t, error } = await admin.from('workout_templates').insert({ user_id: userId, name }).select('id').single()
    if (error) throw new Error(error.message)
    const { error: joinError } = await admin
      .from('workout_template_exercises')
      .insert(names.map((n, i) => ({ template_id: t.id, exercise_id: id(n), position: i, target_sets: 3 })))
    if (joinError) throw new Error(joinError.message)
    return t.id
  }
  const pushId = await template('Push day', ['Bench press', 'Overhead press', 'Triceps pushdown'])
  const pullId = await template('Pull day', ['Lat pulldown', 'Assisted pull-up'])
  await template('Leg day', ['Leg press', 'Plank'])

  // Bench tops out at 135 x 8, so the 140 x 8 logged below is a real record.
  const bench = [110, 115, 115, 120, 120, 125, 125, 130, 130, 135]
  const ohp = [55, 55, 60, 60, 60, 65, 65, 65, 70, 70]
  const triceps = [35, 35, 40, 40, 40, 45, 45, 45, 50, 50]
  for (let week = 0; week < 10; week++) {
    const daysAgo = (10 - week) * 7 - 1
    const { data: push } = await admin
      .from('workouts')
      .insert({ user_id: userId, template_id: pushId, performed_at: new Date(Date.now() - daysAgo * DAY).toISOString() })
      .select('id')
      .single()
    const sets = []
    for (let s = 0; s < 3; s++) {
      sets.push({ workout_id: push.id, exercise_id: id('Bench press'), set_index: s, reps: 8, weight: bench[week], weight_unit: 'lb' })
      sets.push({ workout_id: push.id, exercise_id: id('Overhead press'), set_index: s, reps: 8, weight: ohp[week], weight_unit: 'lb' })
      sets.push({ workout_id: push.id, exercise_id: id('Triceps pushdown'), set_index: s, reps: 12, weight: triceps[week], weight_unit: 'lb' })
    }
    await admin.from('sets').insert(sets)

    const { data: pull } = await admin
      .from('workouts')
      .insert({ user_id: userId, template_id: pullId, performed_at: new Date(Date.now() - (daysAgo - 3) * DAY).toISOString() })
      .select('id')
      .single()
    await admin.from('sets').insert(
      [0, 1, 2].map((s) => ({ workout_id: pull.id, exercise_id: id('Lat pulldown'), set_index: s, reps: 10, weight: 90 + week * 5, weight_unit: 'lb' })),
    )
  }
}

// Opens a phone page on a fresh local database, seeds the sample history,
// and reloads so the app starts with it. `extraStorage` is more localStorage
// to set before the app loads; `viewport` overrides the iPhone 13 browser
// viewport (390x664). Needs the dev server (`npm run dev`) on BASE_URL. The
// `suffix` only names the run in errors.
export async function openSamplePhone(suffix, { extraStorage = {}, viewport } = {}) {
  const browser = await chromium.launch()
  const phone = devices['iPhone 13']
  const context = await browser.newContext({ ...phone, viewport: viewport ?? phone.viewport, deviceScaleFactor: 3, colorScheme: 'dark' })
  const page = await context.newPage()
  await page.addInitScript(
    ([entries]) => {
      for (const [key, value] of entries) localStorage.setItem(key, value)
    },
    [
      Object.entries({
        // The first-run setup wizard (#397) and the muscle check would cover every screen.
        'rb-setup-done': '1',
        'rb-muscle-check-dismissed': '1',
        // Premium on, as the old test backend's dev server had it, so Plates
        // and the Extras open instead of the Premium sheet.
        'repbunny-premium-unlocked': 'true',
        ...extraStorage,
      }),
    ],
  )
  try {
    await page.goto(BASE_URL)
    await page.waitForLoadState('load')
    await page.waitForFunction(() => '__rbLocalDb' in window)
  } catch (e) {
    await browser.close()
    throw new Error(`${suffix}: the dev server at ${BASE_URL} didn't open the app (run npm run dev): ${e.message}`)
  }
  const admin = localDb(page)
  const { error } = await admin.from('profiles').update({ weight_unit: 'lb' })
  if (error) throw new Error(error.message)
  await seedSampleAccount(admin, LOCAL_USER_ID)
  await page.reload()
  return { admin, userId: LOCAL_USER_ID, browser, page }
}
