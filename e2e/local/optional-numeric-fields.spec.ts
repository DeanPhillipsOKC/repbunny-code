import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Found 2026-09-24 while manually testing: v-model.number leaves an emptied
// <input type="number"> as '' rather than coercing it to null, and RPE/target
// sets are the only numeric fields in the app without a `required` guard
// forcing a real value first. Sending that '' straight to a Postgres numeric
// column threw "invalid input syntax for type numeric" and silently dropped
// the add/edit. Covers both call sites that hit it: adding a set with RPE
// left blank, and adding/editing a template exercise with target sets left
// blank.
test('adding a set with RPE left blank does not error', async ({ page, stamp }) => {
  const exerciseName = `E2E Blank Optional ${stamp}`

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
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  const row = page.locator('.set-row-logged').first()
  await expect(row).toBeVisible()
  await expect(row).toContainText('10 × 45 lb')
  await expect(page.getByText('invalid input syntax')).toHaveCount(0)

  // Editing back to no RPE after it had one must also not error (item 103:
  // editing happens on the logged row in the set card).
  const editingRow = page.locator('.set-row-editing')
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  await editingRow.getByLabel('RPE (optional)').fill('7')
  await editingRow.getByRole('button', { name: 'Save set 1' }).click()
  await expect(row).toContainText('RPE 7')

  await page.getByRole('button', { name: 'Edit set 1' }).click()
  await editingRow.getByLabel('RPE (optional)').fill('')
  await editingRow.getByRole('button', { name: 'Save set 1' }).click()
  await expect(editingRow).toHaveCount(0)
  await expect(row).not.toContainText('RPE 7')
  await expect(page.getByText('invalid input syntax')).toHaveCount(0)
})

// Issue #6: the template editor has no free-text sets box any more (picks
// land at 3 sets, then a -/+ stepper), so the blank-input path is gone. A
// legacy row saved with no set count must still step up cleanly, and adding
// through the picker must not error either.
test('a template exercise with no target sets steps up, and adding one does not error', async ({ page, stamp }) => {
  const legacyName = `E2E No Target ${stamp}`
  const exerciseName = `E2E Added Target ${stamp}`
  const templateName = `E2E Blank Sets ${stamp}`

  const admin = localDb(page)

  // The exercises and the template with its legacy null-sets row are
  // pre-existing state, seeded directly via the admin client (item 57's
  // pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: legacy } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: legacyName })
        .select('id')
        .single()
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: legacy!.id, position: 0, target_sets: null })
    },
  })

  await goTo(page, 'Routines')
  await page.getByText(templateName).click()

  const legacyCard = page.locator('.ex-card', { hasText: legacyName })
  await expect(legacyCard.locator('.sets-value b')).toHaveText('–')
  await legacyCard.getByRole('button', { name: `More sets for ${legacyName}` }).click()
  await expect(legacyCard.locator('.sets-value b')).toHaveText('1')

  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByPlaceholder('Search exercises').fill(exerciseName)
  await sheet.getByRole('button', { name: exerciseName, exact: true }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()

  await expect(page.locator('.ex-card', { hasText: exerciseName })).toBeVisible()
  await expect(page.getByText('invalid input syntax')).toHaveCount(0)
})
