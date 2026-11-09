import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise, pickMuscleGroup, openNewExerciseSheet } from '../fixtures/exercise'
import { createTemplateViaUi } from '../fixtures/template'

// Covers docs/backlog.md item 79: exercises can be typed 'assisted' — the set
// form offers reps plus an "Assist" field, sets render as "10 × 40 lb assist",
// and (with no body weight on file) less assist beats more on the PR check,
// reusing item 78's missing-weight prompt. Body weight entries and the
// profile's opt-out flag aren't stamp-cleaned (see body-tab.spec.ts), so this
// resets them directly via the admin client in a finally block.
test('assisted exercise: missing-weight prompt, "Assist" field, "assist" set rendering, inverted PR without body weight', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Assisted Pull-up ${stamp}`
  const admin = localDb(page)
  const userId = await startLocal(page)

  try {
    await goTo(page, 'Exercises')
    await openNewExerciseSheet(page)
    await page.getByLabel('Name').fill(exerciseName)
    await page.getByRole('button', { name: 'Assisted' }).click()
    await pickMuscleGroup(page)
    await page.getByRole('button', { name: 'Add exercise' }).click()
    await expect(page.getByText(exerciseName)).toBeVisible()

    // No body weight on file yet: creating an assisted exercise prompts.
    const creationModal = page.getByRole('dialog', { name: 'Add your body weight' })
    await expect(creationModal).toBeVisible()
    await creationModal.getByRole('button', { name: "Don't ask again" }).click()
    await expect(creationModal).not.toBeVisible()

    await goTo(page, 'Home')
    await page.getByRole('button', { name: 'Freeform' }).click()
    await selectExercise(page, exerciseName, false)

    // Opted out above, so selecting the exercise doesn't reopen the prompt.
    await expect(page.getByRole('dialog', { name: 'Add your body weight' })).not.toBeVisible()

    // Field is labeled "Assist", not "Weight"/"Added weight", and is optional.
    // getByLabel with `exact` doesn't work here -- the field's label wraps an
    // aria-hidden unit suffix ("lb") inside the same <label>, which folds
    // into getByLabel's own text match but not into the accessible name
    // getByRole computes (aria-hidden is excluded there) -- so getByRole is
    // the one that reliably disambiguates from "E2E Assisted..." below.
    const assistField = page.getByRole('spinbutton', { name: 'Assist', exact: true })
    await expect(assistField).toBeVisible()
    await page.getByLabel('Reps').fill('10')
    await assistField.fill('40')
    await page.getByRole('button', { name: 'Add set' }).click()
    // First-ever set for this brand-new exercise is also an all-time best.
    await dismissCelebrationIfShown(page)

    await expect(page.locator('.set-row-logged').first()).toContainText('10 × 40 lb assist')

    // Editing (item 103: in the set card) offers "Assist", not "Weight".
    await page.getByRole('button', { name: 'Edit set 1' }).click()
    const editingRow = page.locator('.set-row-editing')
    await expect(editingRow.getByLabel('Assist', { exact: true })).toHaveValue('40')
    await editingRow.getByRole('button', { name: 'Cancel' }).click()

    // No body weight on file: a second set with LESS assist is the record
    // (inverted vs. a plain weight/bodyweight exercise).
    await selectExercise(page, exerciseName, true)
    await page.getByLabel('Reps').fill('10')
    await page.getByRole('spinbutton', { name: 'Assist', exact: true }).fill('25')
    await page.getByRole('button', { name: 'Add set' }).click()
    const celebration = page.getByRole('dialog', { name: `New record: ${exerciseName}` })
    await expect(celebration).toBeVisible()
    await expect(celebration).toContainText('10 × 25 lb assist')
    await expect(celebration).toContainText('15 lb less assist')
    await page.getByRole('button', { name: 'Nice!' }).click()

    await page.getByRole('button', { name: 'Finish workout' }).click()
  } finally {
    await admin.from('body_weight_entries').delete().eq('user_id', userId)
    await admin.from('profiles').update({ missing_weight_prompt_opt_out: false }).eq('id', userId)
  }
})

// Covers the other half of item 79: effective load (body weight - assist,
// clamped at 0) drives both the PR check and the post-finish volume when body
// weight is on file, with a bigger effective load (i.e. less assist) reading
// as the improvement.
test('assisted exercise: PR and volume use effective load (body weight - assist) when known', async ({ page, stamp }) => {
  const exerciseName = `E2E Assisted Dip ${stamp}`
  const templateName = `E2E Assisted Dip Day ${stamp}`
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
    await page.getByRole('button', { name: 'Assisted' }).click()
    await pickMuscleGroup(page)
    await page.getByRole('button', { name: 'Add exercise' }).click()
    await expect(page.getByText(exerciseName)).toBeVisible()
    // Body weight is already on file: no prompt.
    await expect(page.getByRole('dialog', { name: 'Add your body weight' })).not.toBeVisible()

    await createTemplateViaUi(page, templateName, [{ name: exerciseName, sets: 1 }])

    // Workout 1: 10 reps, 40lb assist -> effective load 140, volume 1400.
    await goTo(page, 'Home')
    await page.getByRole('button', { name: templateName, exact: true }).click()
    await selectExercise(page, exerciseName, true)
    await page.getByLabel('Reps').fill('10')
    await page.getByRole('spinbutton', { name: 'Assist', exact: true }).fill('40')
    await page.getByRole('button', { name: 'Add set' }).click()
    const firstCelebration = page.getByRole('dialog', { name: `First set: ${exerciseName}` })
    const celebration = page.getByRole('dialog', { name: `New record: ${exerciseName}` })
    await expect(firstCelebration).toBeVisible()
    await expect(firstCelebration).toContainText('10 × 40 lb assist')
    await expect(firstCelebration).toContainText('First one logged for this exercise')
    await page.getByRole('button', { name: 'Nice!' }).click()
    // Item 109: that set completes every planned set, so the workout finishes on its own.

    await expect(page.getByText(/First .* logged\./)).toBeVisible()
    await page.getByRole('button', { name: 'Done', exact: true }).click()

    // Workout 2: less assist -> new record (effective load 155 x 10 reps =
    // 1550 beats 1400), even though the raw assist number went up in the
    // "less is better" sense (down in the stored column).
    await page.getByRole('button', { name: templateName, exact: true }).click()
    await selectExercise(page, exerciseName, true)
    await page.getByLabel('Reps').fill('10')
    await page.getByRole('spinbutton', { name: 'Assist', exact: true }).fill('25')
    await page.getByRole('button', { name: 'Add set' }).click()
    await expect(celebration).toBeVisible()
    await expect(celebration).toContainText('1,550 vs 1,400 body weight − assist')
    await page.getByRole('button', { name: 'Nice!' }).click()
    // Item 109: that set completes every planned set, so the workout finishes on its own.

    // Item 106: the recap's volume bars total effective load per session.
    const bars = page.getByTestId('recap-volume-bar')
    await expect(bars).toHaveCount(2)
    await expect(bars.nth(0)).toContainText('1,400 lb')
    await expect(bars.nth(1)).toContainText('1,550 lb')
    await expect(page.getByTestId('recap-hero')).toContainText('1,550')

    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()
  } finally {
    await admin.from('body_weight_entries').delete().eq('user_id', userId)
    await admin.from('profiles').update({ missing_weight_prompt_opt_out: false }).eq('id', userId)
  }
})
