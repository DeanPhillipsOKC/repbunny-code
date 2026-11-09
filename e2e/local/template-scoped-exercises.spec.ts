import { test, expect, localDb, startLocal } from '../fixtures/local'
import { closeAddExerciseSheet } from '../fixtures/exercise'

// Covers docs/backlog.md item 21 (as superseded by item 67's redesign): a
// templated workout's carousel deck auto-populates from that template's own
// exercises only, not every exercise the user has -- so it doesn't leak an
// exercise the template doesn't track into its own reporting (the
// post-workout volume chart). The carousel's persistent "+" sheet, however,
// deliberately offers every active exercise regardless of the active
// template (the redesign's canvas note: "for anything outside the template
// or building a freeform session from scratch") -- an ad-hoc addition is
// explicitly allowed now, just no longer auto-suggested.
test('carousel deck auto-populates from the active template only; the add-exercise sheet offers everything', async ({
  page,
  stamp,
}) => {
  const inTemplateName = `E2E Row ${stamp}`
  const notInTemplateName = `E2E Lunge ${stamp}`
  const templateName = `E2E Pull Day ${stamp}`

  const admin = localDb(page)

  // Both exercises and the template (with only `inTemplateName` attached)
  // are pre-existing state this test picks between, not behavior under
  // test -- seed them directly via the admin client instead of driving the
  // Exercises/Templates UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: inTemplate } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: inTemplateName })
        .select('id')
        .single()
      await admin.from('exercises').insert({ user_id: userId, name: notInTemplateName })
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: inTemplate!.id, position: 0 })
    },
  })

  // Freeform (no template): the deck starts empty, and the sheet offers
  // every active exercise, template or not.
  await page.getByRole('button', { name: 'Freeform' }).click()
  await expect(page.locator('.deck-empty')).toBeVisible()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByRole('button', { name: inTemplateName, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: notInTemplateName, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  // Backlog item 51: finishing with no sets logged now confirms before discarding.
  await page.getByRole('button', { name: 'Discard workout' }).click()

  // Templated: the deck auto-populates with only the template's exercise...
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await expect(page.getByRole('button', { name: inTemplateName, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: notInTemplateName, exact: true })).toHaveCount(0)

  // ...but the sheet still offers the other exercise for an ad-hoc addition.
  // inTemplateName's own dot is still elsewhere on the page (behind the
  // overlay), so its "not offered" check has to stay scoped to the sheet.
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(sheet.getByRole('button', { name: inTemplateName, exact: true })).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: notInTemplateName, exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: notInTemplateName, exact: true }).click()
  await closeAddExerciseSheet(page)
  await expect(page.locator('.exercise-card-name')).toHaveText(notInTemplateName)
  await expect(page.getByRole('button', { name: inTemplateName, exact: true })).toBeVisible()
})
