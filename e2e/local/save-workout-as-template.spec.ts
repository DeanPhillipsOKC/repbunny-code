import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Covers docs/backlog.md item 89: turn a finished workout (freeform or
// templated) into a new, editable template without touching the source
// workout or (for a templated workout) its originating template. The
// freeform/templated workouts and their exercises are pre-existing state
// this test acts on, not the behavior under test, so they're seeded
// directly via the admin client (item 83's pattern) instead of driven
// through the logging UI.
test('save a finished workout as a new template from History', async ({ page, stamp }) => {
  const rowName = `E2E SaveTpl Row ${stamp}`
  const benchName = `E2E SaveTpl Bench ${stamp}`
  const archivedName = `E2E SaveTpl Archived ${stamp}`
  const sourceTemplateName = `E2E SaveTpl Source ${stamp}`
  const newTemplateName = `E2E SaveTpl Pull Day ${stamp}`

  const admin = localDb(page)
  let benchId = ''

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: row } = await admin.from('exercises').insert({ user_id: userId, name: rowName }).select('id').single()
      const { data: bench } = await admin.from('exercises').insert({ user_id: userId, name: benchName }).select('id').single()
      benchId = bench!.id
      const { data: archived } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: archivedName, is_archived: true })
        .select('id')
        .single()

      // Freeform workout: Row x2, then Bench x3, then one set of an archived
      // exercise -- the archived one must be skipped when saved as a template.
      const { data: freeform } = await admin
        .from('workouts')
        .insert({ user_id: userId, performed_at: new Date().toISOString() })
        .select('id')
        .single()
      const freeformSets = [
        { exercise_id: row!.id, set_index: 0 },
        { exercise_id: row!.id, set_index: 1 },
        { exercise_id: bench!.id, set_index: 2 },
        { exercise_id: bench!.id, set_index: 3 },
        { exercise_id: bench!.id, set_index: 4 },
        { exercise_id: archived!.id, set_index: 5 },
      ]
      for (const s of freeformSets) {
        await admin
          .from('sets')
          .insert({ workout_id: freeform!.id, exercise_id: s.exercise_id, set_index: s.set_index, reps: 5, weight: 100, weight_unit: 'lb' })
      }

      // Templated workout: logged against a pre-existing template, so saving
      // it as a template must not touch that source template's own rows.
      const { data: sourceTemplate } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: sourceTemplateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: sourceTemplate!.id, exercise_id: bench!.id, position: 0, target_sets: 3 })

      const { data: templated } = await admin
        .from('workouts')
        .insert({
          user_id: userId,
          template_id: sourceTemplate!.id,
          performed_at: new Date(Date.now() - 60_000).toISOString(),
        })
        .select('id')
        .single()
      await admin
        .from('sets')
        .insert({ workout_id: templated!.id, exercise_id: bench!.id, set_index: 0, reps: 5, weight: 135, weight_unit: 'lb' })
    },
  })

  await goTo(page, 'Workout log')

  const freeformCard = page.locator('.card', { hasText: rowName })
  if (await freeformCard.locator('.condensed-trigger').count()) {
    await freeformCard.locator('.condensed-trigger').click()
  }

  // Issue #487: the action is named on the card, not an unlabeled icon.
  await expect(freeformCard.getByRole('button', { name: 'Save as routine' })).toHaveText('Save as routine')

  // Cancel discards the draft -- opening and cancelling creates nothing.
  await freeformCard.getByRole('button', { name: 'Save as routine' }).click()
  await expect(freeformCard.getByLabel('Routine name')).toHaveValue(/^Workout /)
  // Issue #487: the named button steps aside while its form is open.
  await expect(freeformCard.getByRole('button', { name: 'Save as routine' })).toHaveCount(0)
  await freeformCard.getByLabel('Routine name').fill(`E2E SaveTpl Should Not Exist ${stamp}`)
  await freeformCard.getByRole('button', { name: 'Cancel' }).click()
  await expect(freeformCard.getByLabel('Routine name')).toHaveCount(0)
  const cancelled = await admin
    .from('workout_templates')
    .select('id')
    .ilike('name', `%Should Not Exist ${stamp}%`)
  expect(cancelled.data ?? []).toHaveLength(0)

  // Save for real, overriding the prefilled default name.
  await freeformCard.getByRole('button', { name: 'Save as routine' }).click()
  await freeformCard.getByLabel('Routine name').fill(newTemplateName)
  await freeformCard.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(freeformCard.getByText(`Saved as "${newTemplateName}".`)).toBeVisible()
  await freeformCard.getByRole('link', { name: 'View in Routines' }).click()

  const newTemplateRow = page.locator('.row-wrap', { hasText: newTemplateName })
  await expect(newTemplateRow.locator('.row-sub')).toHaveText(/^2 exercises ·/)
  await newTemplateRow.locator('.row').first().click()

  const exerciseRows = page.locator('.ex-card')
  await expect(exerciseRows).toHaveCount(2)
  await expect(exerciseRows.nth(0)).toContainText(rowName)
  await expect(exerciseRows.nth(0).locator('.sets-value b')).toHaveText('2')
  await expect(exerciseRows.nth(1)).toContainText(benchName)
  await expect(exerciseRows.nth(1).locator('.sets-value b')).toHaveText('3')
  await expect(page.locator('.ex-list')).not.toContainText(archivedName)

  // The source workout itself is unchanged.
  await goTo(page, 'Workout log')
  const freeformCardAfter = page.locator('.card', { hasText: rowName })
  if (await freeformCardAfter.locator('.condensed-trigger').count()) {
    await freeformCardAfter.locator('.condensed-trigger').click()
  }
  await expect(freeformCardAfter.locator('li.row-wrap')).toHaveCount(6)

  // Saving the templated workout defaults to "<source template> copy" and
  // must not touch the source template's own exercise list.
  const templatedCard = page.locator('.card', { hasText: sourceTemplateName })
  if (await templatedCard.locator('.condensed-trigger').count()) {
    await templatedCard.locator('.condensed-trigger').click()
  }
  await templatedCard.getByRole('button', { name: 'Save as routine' }).click()
  await expect(templatedCard.getByLabel('Routine name')).toHaveValue(`${sourceTemplateName} copy`)
  await templatedCard.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(templatedCard.getByText(`Saved as "${sourceTemplateName} copy".`)).toBeVisible()

  const { data: sourceTemplateRow } = await admin
    .from('workout_templates')
    .select('id')
    .eq('name', sourceTemplateName)
    .single()
  const { data: sourceTemplateExercises } = await admin
    .from('workout_template_exercises')
    .select('exercise_id, position, target_sets')
    .eq('template_id', sourceTemplateRow!.id)
  expect(sourceTemplateExercises).toEqual([{ exercise_id: benchId, position: 0, target_sets: 3 }])
})
