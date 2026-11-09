import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 38 (the full-screen celebration takeover) and
// docs/backlog-archive.md item 4 (the underlying record detection it
// replaced the toast for): adding a set that beats the user's all-time best
// (reps * weight) for that exercise shows a congratulatory, manually
// dismissed takeover. The comparison is per-exercise across all past
// workouts, not scoped to the current workout or template.
test('Record celebration: shows on a new all-time best, blocks until dismissed, and stays quiet otherwise', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Overhead Press ${stamp}`

  const admin = localDb(page)

  // The exercise is pre-existing state this test logs sets against, not
  // behavior under test -- seed it directly via the admin client instead of
  // driving the Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  // The first set establishes the exercise's baseline, not a PR.
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('100')
  await page.getByRole('button', { name: 'Add set' }).click()
  const firstCelebration = page.getByRole('dialog', { name: `First set: ${exerciseName}` })
  await expect(firstCelebration).toBeVisible()
  await expect(firstCelebration).toContainText('First one!')
  await expect(firstCelebration).toContainText('8 × 100 lb')
  await expect(firstCelebration).not.toContainText('New record')
  await expect(firstCelebration).not.toContainText('PR')

  await page.getByRole('button', { name: 'Nice!' }).click()
  await expect(firstCelebration).not.toBeVisible()

  // A lighter set (lower volume) should not retrigger the celebration.
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('90')
  await page.getByRole('button', { name: 'Add set' }).click()
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // A heavier set beats the all-time best again, this time showing the
  // delta over the prior best rather than "first one logged".
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('110')
  await page.getByRole('button', { name: 'Add set' }).click()
  const celebration = page.getByRole('dialog', { name: `New record: ${exerciseName}` })
  await expect(celebration).toBeVisible()
  await expect(celebration).toContainText(/Beat 100 lb × 8 from \w+ \d+/)
  await expect(celebration).toContainText('880 vs 800 weight × reps')
  await page.getByRole('button', { name: 'Nice!' }).click()
  await expect(celebration).not.toBeVisible()

  await page.getByRole('button', { name: 'Finish workout' }).click()
  const recapRecord = page.getByTestId('post-finish-card').getByTestId('recap-record')
  await expect(recapRecord).toContainText(exerciseName)
  await expect(recapRecord).toContainText('Heaviest set · was 100 lb')
  await expect(recapRecord).toContainText('110 lb × 8')
  // Item 106: a freeform finish shows the post-finish recap first.
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.stat-tile-pr')).toContainText(exerciseName)

  // A later workout: matching (not beating) the prior best must not trigger.
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('110')
  await page.getByRole('button', { name: 'Add set' }).click()
  await page.waitForTimeout(500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

// Dismissing via a tap on the overlay itself (not just the "Nice!" button)
// matches the approved mockup's "tap anywhere to dismiss" affordance.
test('Record celebration: tapping the overlay also dismisses it', async ({ page, stamp }) => {
  const exerciseName = `E2E Incline Press ${stamp}`

  const admin = localDb(page)

  // The exercise is pre-existing state this test logs a set against, not
  // behavior under test -- seed it directly via the admin client instead of
  // driving the Exercises UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('50')
  await page.getByRole('button', { name: 'Add set' }).click()

  const celebration = page.getByRole('dialog', { name: `First set: ${exerciseName}` })
  await expect(celebration).toBeVisible()
  await celebration.click({ position: { x: 5, y: 5 } })
  await expect(celebration).not.toBeVisible()
})

test('A first-only workout has no PR, but a later workout can set one', async ({ page, stamp }) => {
  const exerciseName = `E2E First Only ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { error } = await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
      if (error) throw error
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('0')
  await page.getByRole('button', { name: 'Add set' }).click()
  // Issue #336: 0 lb on a weighted exercise asks first.
  await page.getByRole('button', { name: 'Log anyway' }).click()
  await expect(page.getByRole('dialog', { name: `First set: ${exerciseName}` })).toBeVisible()
  await page.getByRole('button', { name: 'Nice!' }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card').getByTestId('recap-records')).toHaveCount(0)
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.stat-tile-pr')).toHaveCount(0)

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('60')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.getByRole('dialog', { name: `New record: ${exerciseName}` })).toBeVisible()
  await page.getByRole('button', { name: 'Nice!' }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card').getByTestId('recap-record')).toContainText('Heaviest set · was 0 lb')
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.stat-tile-pr')).toContainText(exerciseName)
})

// #59: the record and first-set celebrations only ever show a bunny. Pinning
// Math.random near 1 picks each pool's second pair, the two full-body poses
// that replaced the old bear, so both are checked to load and sit fully
// on screen at phone width.
test('Record celebration: the full-body bunny poses load uncropped at 390px', async ({ page, stamp }) => {
  const exerciseName = `E2E Bunny Pose ${stamp}`
  const admin = localDb(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Math.random = () => 0.99
  })
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { error } = await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
      if (error) throw error
    },
  })

  async function expectMascot(dialogName: string, image: string, phrase: string) {
    const dialog = page.getByRole('dialog', { name: dialogName })
    await expect(dialog).toContainText(phrase)
    const mascot = dialog.locator('img')
    await expect(mascot).toHaveAttribute('src', image)
    await expect.poll(() => mascot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    // Let the bounce-in animation settle before measuring.
    await page.waitForTimeout(700)
    const box = await mascot.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    expect(box!.y + box!.height).toBeLessThanOrEqual(844)
    await page.getByRole('button', { name: 'Nice!' }).click()
    await expect(dialog).not.toBeVisible()
  }

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('50')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expectMascot(`First set: ${exerciseName}`, '/celebration-dumbbell-bunny.png', 'Day one of this one.')

  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('60')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expectMascot(`New record: ${exerciseName}`, '/celebration-flex-bunny.png', "That's a PR. No notes.")
})
