import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { selectExercise } from '../fixtures/exercise'
import { chimeCount, installRestChimeSpy } from '../fixtures/restChime'

// Covers issue #85: a stopwatch on unlogged timed set rows. The row's Time is
// the goal, the chime fires at the goal, Stop writes the elapsed time back
// into the row without logging it, and Cancel leaves the row alone. The timed
// exercise itself is seeded (item 57's pattern); creating one through the UI
// is e2e/local/exercise-load-type-timed.spec.ts's job.
async function seedPlank(page: Page, name: string) {
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name, load_type: 'timed' })
    },
  })
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
}

test('set stopwatch: counts toward the goal, chimes, and Stop fills Time without logging', async ({ page, stamp }) => {
  const name = `E2E Stopwatch Plank ${stamp}`
  await installRestChimeSpy(page)
  await page.clock.install()
  await seedPlank(page, name)

  const time = page.getByLabel('Time, minutes and seconds')
  await time.fill('5')
  await expect(time).toHaveValue('0:05')

  await page.getByRole('button', { name: 'Start timer' }).click()
  const overlay = page.getByRole('dialog', { name: `Timing ${name}` })
  await expect(overlay).toBeVisible()
  await expect(overlay.getByText('Goal 0:05')).toBeVisible()
  await expect(overlay.getByText('0:00', { exact: true })).toBeVisible()
  expect(await chimeCount(page)).toBe(0)

  await page.clock.fastForward(6_000)
  await expect(overlay.getByText('Goal hit')).toBeVisible()
  await expect(overlay.getByText('+0:01')).toBeVisible()
  await expect(overlay.getByText('0:06', { exact: true })).toBeVisible()
  await expect.poll(() => chimeCount(page)).toBe(1)

  // Keeps counting past the goal, and the chime only plays once.
  await page.clock.fastForward(2_000)
  await expect(overlay.getByText('0:08', { exact: true })).toBeVisible()
  await expect(overlay.getByText('+0:03')).toBeVisible()
  expect(await chimeCount(page)).toBe(1)

  await overlay.getByRole('button', { name: 'Stop' }).click()
  await expect(overlay).toHaveCount(0)
  await expect(time).toHaveValue('0:08')
  await expect(page.locator('.set-row-logged')).toHaveCount(0)

  // Issue #94: wait on the logged row itself rather than a fixed wait. Timed
  // sets never get a record celebration (item 93), so there's nothing to
  // dismiss here.
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.locator('.set-row-logged').first()).toContainText('0:08')
})

test('set stopwatch: an empty Time runs a plain stopwatch with no goal', async ({ page, stamp }) => {
  const name = `E2E Stopwatch Plain ${stamp}`
  await page.clock.install()
  await seedPlank(page, name)

  await expect(page.getByLabel('Time, minutes and seconds')).toHaveValue('')
  await page.getByRole('button', { name: 'Start timer' }).click()
  const overlay = page.getByRole('dialog', { name: `Timing ${name}` })
  await expect(overlay).toBeVisible()
  await expect(overlay.getByText(/Goal/)).toHaveCount(0)

  await page.clock.fastForward(3_000)
  await expect(overlay.getByText('0:03', { exact: true })).toBeVisible()
  await overlay.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByLabel('Time, minutes and seconds')).toHaveValue('0:03')
})

test('set stopwatch: Cancel leaves the Time field unchanged', async ({ page, stamp }) => {
  const name = `E2E Stopwatch Cancel ${stamp}`
  await page.clock.install()
  await seedPlank(page, name)

  const time = page.getByLabel('Time, minutes and seconds')
  await time.fill('45')
  await page.getByRole('button', { name: 'Start timer' }).click()
  const overlay = page.getByRole('dialog', { name: `Timing ${name}` })
  await page.clock.fastForward(4_000)
  await expect(overlay.getByText('0:04', { exact: true })).toBeVisible()

  await overlay.getByRole('button', { name: 'Cancel' }).click()
  await expect(overlay).toHaveCount(0)
  await expect(time).toHaveValue('0:45')
  await expect(page.locator('.set-row-logged')).toHaveCount(0)
})

// Issue #191: the stopwatch names the exercise as a heading, says which set
// it is ("of M" when the routine plans a count), and shows the same set last
// time, all without crowding the clock and Stop at phone sizes.
test('set stopwatch: shows the set number and last time, and fits a phone screen', async ({ page, stamp }) => {
  const name = `e2e stopwatch wall sit ${stamp}`
  const templateName = `E2E Stopwatch Routine ${stamp}`
  await page.setViewportSize({ width: 375, height: 812 })
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name, load_type: 'timed' })
        .select('id')
        .single()
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: exercise!.id, position: 0, target_sets: 2 })
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: userId, template_id: template!.id })
        .select('id')
        .single()
      await admin.from('sets').insert([
        { workout_id: workout!.id, exercise_id: exercise!.id, set_index: 0, reps: null, weight: 0, weight_unit: 'lb', duration_seconds: 30 },
        { workout_id: workout!.id, exercise_id: exercise!.id, set_index: 1, reps: null, weight: 0, weight_unit: 'lb', duration_seconds: 45 },
      ])
    },
  })
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(name)
  await expect(page.getByLabel('Time, minutes and seconds').nth(1)).toHaveValue('0:45')

  await page.getByRole('button', { name: 'Start timer' }).nth(1).click()
  const overlay = page.getByRole('dialog', { name: `Timing ${name}` })
  await expect(overlay.getByRole('heading', { name })).toBeVisible()
  await expect(overlay.getByText('Set 2 of 2')).toBeVisible()
  await expect(overlay.getByText('Last time 0:45')).toBeVisible()
  // Title case on display only; the stored name is unchanged.
  await expect(overlay.getByRole('heading', { name })).toHaveCSS('text-transform', 'capitalize')

  // Top to bottom with no overlap, everything on screen, and the clock and
  // Stop still bigger than the name.
  async function checkLayout(height: number) {
    const heading = (await overlay.getByRole('heading', { name }).boundingBox())!
    const setLine = (await overlay.getByText('Set 2 of 2').boundingBox())!
    const last = (await overlay.getByText('Last time 0:45').boundingBox())!
    const ring = (await overlay.locator('.stopwatch-ring-wrap').boundingBox())!
    const clock = (await overlay.locator('.stopwatch-clock').boundingBox())!
    const stop = (await overlay.getByRole('button', { name: 'Stop' }).boundingBox())!
    const cancel = (await overlay.getByRole('button', { name: 'Cancel' }).boundingBox())!
    const order = [heading, setLine, last, ring, stop, cancel]
    for (let i = 1; i < order.length; i++) {
      expect(order[i].y).toBeGreaterThanOrEqual(order[i - 1].y + order[i - 1].height)
    }
    for (const box of order) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(375)
    }
    expect(cancel.y + cancel.height).toBeLessThanOrEqual(height)
    expect(clock.height).toBeGreaterThan(heading.height / 2)
    expect(stop.width).toBeGreaterThan(heading.width / 2)
  }

  // Tall enough for the bunny, above the name.
  const bunny = overlay.locator('.stopwatch-bunny')
  await expect(bunny).toBeVisible()
  await expect(bunny).toHaveAttribute('src', /celebration-dumbbell-bunny\.(png|webp)$/)
  const bunnyBox = (await bunny.boundingBox())!
  const headingBox = (await overlay.getByRole('heading', { name }).boundingBox())!
  expect(bunnyBox.y + bunnyBox.height).toBeLessThanOrEqual(headingBox.y)
  await checkLayout(812)

  // An iPhone SE drops the bunny to keep the clock and Stop on screen.
  await page.setViewportSize({ width: 375, height: 667 })
  await expect(bunny).toBeHidden()
  await checkLayout(667)

  // Set 1 reads from last time's first set, the same as its prefill.
  await overlay.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Start timer' }).first().click()
  await expect(overlay.getByText('Set 1 of 2')).toBeVisible()
  await expect(overlay.getByText('Last time 0:30')).toBeVisible()
})

test('set stopwatch: a freeform set with no history shows the set number only', async ({ page, stamp }) => {
  const name = `E2E Stopwatch Fresh ${stamp}`
  await seedPlank(page, name)
  await page.getByRole('button', { name: 'Start timer' }).click()
  const overlay = page.getByRole('dialog', { name: `Timing ${name}` })
  await expect(overlay.getByText('Set 1', { exact: true })).toBeVisible()
  await expect(overlay.getByText(/Last time/)).toHaveCount(0)
})

// The compact Plank row gains a button between Time and RPE; it must still
// fit one line at phone width with the header lined up over it.
test('set stopwatch: compact row still fits on one line at phone width', async ({ page, stamp }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await seedPlank(page, `E2E Stopwatch Fit ${stamp}`)

  const row = page.locator('.set-row-draft').first()
  const rowBox = (await row.boundingBox())!
  const time = (await page.getByLabel('Time, minutes and seconds').boundingBox())!
  const start = (await page.getByRole('button', { name: 'Start timer' }).boundingBox())!
  const rpe = (await page.getByLabel('RPE (optional)').first().boundingBox())!
  const add = (await page.getByRole('button', { name: 'Add set' }).boundingBox())!

  // One line: everything shares a vertical center.
  for (const box of [start, rpe, add]) {
    expect(Math.abs(box.y + box.height / 2 - (time.y + time.height / 2))).toBeLessThan(2)
  }
  // Left to right, no overlap, all inside the row.
  expect(start.x).toBeGreaterThanOrEqual(time.x + time.width)
  expect(rpe.x).toBeGreaterThanOrEqual(start.x + start.width)
  expect(add.x + add.width).toBeLessThanOrEqual(rowBox.x + rowBox.width)

  // The RPE header still sits over the RPE input.
  const rpeHeader = (await page.locator('.set-header-rpe').boundingBox())!
  expect(Math.abs(rpeHeader.x + rpeHeader.width / 2 - (rpe.x + rpe.width / 2))).toBeLessThan(2)
})
