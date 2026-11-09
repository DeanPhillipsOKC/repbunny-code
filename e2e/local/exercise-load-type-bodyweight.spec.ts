import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise, pickMuscleGroup, openNewExerciseSheet } from '../fixtures/exercise'
import { createTemplateViaUi } from '../fixtures/template'

// Covers docs/backlog.md item 78: exercises can be typed 'bodyweight' — the
// set form offers reps plus an optional "Added weight" field, sets render as
// "10 × BW"/"8 × BW + 25 lb", and creating (or first logging) one with no
// body weight on file opens item 77's BodyStatsModal to ask for one. Body
// weight entries and the profile's opt-out flag aren't stamp-cleaned (see
// body-tab.spec.ts), so this resets them directly via the admin client in a
// finally block.
test('bodyweight exercise: missing-weight prompt, optional added weight, "BW" set rendering', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Push-up ${stamp}`
  const admin = localDb(page)
  const userId = await startLocal(page)

  try {
    await goTo(page, 'Exercises')
    await openNewExerciseSheet(page)
    await page.getByLabel('Name').fill(exerciseName)
    await page.getByRole('button', { name: 'Bodyweight' }).click()
    await pickMuscleGroup(page)
    await page.getByRole('button', { name: 'Add exercise' }).click()
    await expect(page.getByText(exerciseName)).toBeVisible()

    // No body weight on file yet: creating a bodyweight exercise prompts.
    const creationModal = page.getByRole('dialog', { name: 'Add your body weight' })
    await expect(creationModal).toBeVisible()
    await creationModal.getByRole('button', { name: "Don't ask again" }).click()
    await expect(creationModal).not.toBeVisible()

    await goTo(page, 'Home')
    await page.getByRole('button', { name: 'Freeform' }).click()
    await selectExercise(page, exerciseName, false)

    // Opted out above, so selecting the exercise doesn't reopen the prompt.
    await expect(page.getByRole('dialog', { name: 'Add your body weight' })).not.toBeVisible()

    // "Added weight" is optional — reps alone is enough to log a set.
    await expect(page.getByLabel('Added weight')).toBeVisible()
    await page.getByLabel('Reps').fill('10')
    await page.getByRole('button', { name: 'Add set' }).click()
    // First-ever set for this brand-new exercise is also an all-time best.
    await dismissCelebrationIfShown(page)

    const row = page.locator('.set-row-logged').first()
    await expect(row).toContainText('10 × BW')
    await expect(row).not.toContainText('10 × 0 lb')

    // Editing it (item 103: in the set card) offers "Added weight", not
    // "Weight", and isn't required.
    await page.getByRole('button', { name: 'Edit set 1' }).click()
    const editingRow = page.locator('.set-row-editing')
    await expect(editingRow.getByLabel('Added weight')).toBeVisible()
    await editingRow.getByLabel('Added weight').fill('25')
    await editingRow.getByRole('button', { name: 'Save set 1' }).click()
    await expect(row).toContainText('10 × BW + 25 lb')

    await page.getByRole('button', { name: 'Finish workout' }).click()
  } finally {
    await admin.from('body_weight_entries').delete().eq('user_id', userId)
    await admin.from('profiles').update({ missing_weight_prompt_opt_out: false }).eq('id', userId)
  }
})

// Covers the other half of item 78: effective load (body weight + added
// weight) drives both the PR check and the post-finish volume, not the added-weight
// column alone.
test('bodyweight exercise: PR and volume use effective load (body weight + added weight)', async ({ page, stamp }) => {
  const exerciseName = `E2E Dip ${stamp}`
  const templateName = `E2E Dip Day ${stamp}`
  const admin = localDb(page)

  const userId = await startLocal(page, {
    beforeNavigate: async (id) => {
      await admin.from('body_weight_entries').insert({ user_id: id, weight: 180, weight_unit: 'lb' })
    },
  })

  try {
    await goTo(page, 'Exercises')
    await openNewExerciseSheet(page)
    await page.getByLabel('Name').fill(exerciseName)
    await page.getByRole('button', { name: 'Bodyweight' }).click()
    await pickMuscleGroup(page)
    await page.getByRole('button', { name: 'Add exercise' }).click()
    await expect(page.getByText(exerciseName)).toBeVisible()
    // Body weight is already on file: no prompt.
    await expect(page.getByRole('dialog', { name: 'Add your body weight' })).not.toBeVisible()

    await createTemplateViaUi(page, templateName, [{ name: exerciseName, sets: 1 }])

    // Workout 1: 10 reps, 20lb added -> effective load 200, volume 2000.
    // The first set's celebration numbers
    // come from formatSetLabel (the real "BW + 20lb" set), not a raw
    // reps/weight product.
    await goTo(page, 'Home')
    await page.getByRole('button', { name: templateName, exact: true }).click()
    await selectExercise(page, exerciseName, true)
    await page.getByLabel('Reps').fill('10')
    await page.getByLabel('Added weight').fill('20')
    await page.getByRole('button', { name: 'Add set' }).click()
    const firstCelebration = page.getByRole('dialog', { name: `First set: ${exerciseName}` })
    const celebration = page.getByRole('dialog', { name: `New record: ${exerciseName}` })
    await expect(firstCelebration).toBeVisible()
    await expect(firstCelebration).toContainText('10 × BW + 20 lb')
    await expect(firstCelebration).toContainText('First one logged for this exercise')
    await page.getByRole('button', { name: 'Nice!' }).click()
    // Item 109: that set completes every planned set, so the workout finishes on its own.

    await expect(page.getByText(/First .* logged\./)).toBeVisible()
    await page.getByRole('button', { name: 'Done', exact: true }).click()

    // Workout 2: heavier added weight -> new record (effective load 210 x
    // 10 reps = 2100 beats 2000), and the recap's volume totals reflect
    // effective load, not reps * added-weight alone (10 * 30 = 300 would be
    // a decrease, but 10 * 210 = 2100 is an increase).
    await page.getByRole('button', { name: templateName, exact: true }).click()
    await selectExercise(page, exerciseName, true)
    await page.getByLabel('Reps').fill('10')
    await page.getByLabel('Added weight').fill('30')
    await page.getByRole('button', { name: 'Add set' }).click()
    await expect(celebration).toBeVisible()
    await expect(celebration).toContainText('2,100 vs 2,000 body weight + added')
    await page.getByRole('button', { name: 'Nice!' }).click()
    // Item 109: that set completes every planned set, so the workout finishes on its own.

    // Item 106: the recap's volume bars total effective load per session.
    const bars = page.getByTestId('recap-volume-bar')
    await expect(bars).toHaveCount(2)
    await expect(bars.nth(0)).toContainText('2,000 lb')
    await expect(bars.nth(1)).toContainText('2,100 lb')
    await expect(page.getByTestId('recap-hero')).toContainText('2,100')

    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()
  } finally {
    await admin.from('body_weight_entries').delete().eq('user_id', userId)
    await admin.from('profiles').update({ missing_weight_prompt_opt_out: false }).eq('id', userId)
  }
})
