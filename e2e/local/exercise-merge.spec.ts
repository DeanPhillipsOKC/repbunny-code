import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { openEditExerciseSheet, openNewExerciseSheet } from '../fixtures/exercise'

// Covers issue #265: merge a duplicate exercise into another from its edit
// sheet, and the "You already have" hint when creating one with a used name.
test('merge an exercise into another: history and routines move, the copy goes away', async ({ page, stamp }) => {
  const copyName = `E2E Merge Bench ${stamp}`
  const keepName = `E2E Merge Barbell Bench ${stamp}`
  const admin = localDb(page)
  let keepId = ''
  let userId = ''

  await startLocal(page, {
    beforeNavigate: async (id) => {
      userId = id
      const { data: copy } = await admin
        .from('exercises')
        .insert({ user_id: id, name: copyName, muscle_group: 'chest' })
        .select('id')
        .single()
      const { data: keep } = await admin
        .from('exercises')
        .insert({ user_id: id, name: keepName, muscle_group: 'chest' })
        .select('id')
        .single()
      keepId = keep!.id
      for (const [exerciseId, daysAgo] of [
        [copy!.id, 3],
        [keep!.id, 1],
      ] as const) {
        const { data: workout } = await admin
          .from('workouts')
          .insert({ user_id: id, performed_at: new Date(Date.now() - daysAgo * 86400000).toISOString() })
          .select('id')
          .single()
        await admin
          .from('sets')
          .insert({ workout_id: workout!.id, exercise_id: exerciseId, set_index: 0, reps: 5, weight: 100, weight_unit: 'lb' })
      }
      const { data: both } = await admin
        .from('workout_templates')
        .insert({ user_id: id, name: `E2E Merge Both ${stamp}` })
        .select('id')
        .single()
      await admin.from('workout_template_exercises').insert([
        { template_id: both!.id, exercise_id: copy!.id, position: 0, target_sets: 5 },
        { template_id: both!.id, exercise_id: keep!.id, position: 1, target_sets: 3 },
      ])
      const { data: onlyCopy } = await admin
        .from('workout_templates')
        .insert({ user_id: id, name: `E2E Merge Only ${stamp}` })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: onlyCopy!.id, exercise_id: copy!.id, position: 0, target_sets: 4 })
    },
  })

  await goTo(page, 'Exercises')
  const sheet = await openEditExerciseSheet(page, copyName)
  await sheet.getByRole('button', { name: 'Merge into another exercise' }).click()
  const merge = page.getByRole('dialog', { name: 'Merge exercise' })
  await merge.getByLabel('Search your exercises').fill(`Merge Barbell Bench ${stamp}`)
  await merge.getByRole('button', { name: keepName }).click()
  await expect(merge.getByRole('status')).toHaveText(
    `1 workout of ${copyName} move to ${keepName}. ${copyName} is removed.`,
  )
  await merge.getByRole('button', { name: 'Merge', exact: true }).click()

  await expect(page.locator('.row-wrap', { hasText: keepName })).toBeVisible()
  await expect(page.locator('.row-wrap', { hasText: copyName })).toHaveCount(0)

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const addSheet = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(addSheet.getByText(keepName)).toBeVisible()
  await expect(addSheet.getByText(copyName)).toHaveCount(0)

  const { data: sets } = await admin.from('sets').select('workout_id').eq('exercise_id', keepId)
  expect(new Set(sets!.map((s) => s.workout_id)).size).toBe(2)
  const { data: templates } = await admin.from('workout_templates').select('id').like('name', `%${stamp}`)
  const { data: rows } = await admin
    .from('workout_template_exercises')
    .select('exercise_id, target_sets')
    .in('template_id', templates!.map((t) => t.id))
  expect(rows!.map((r) => [r.exercise_id, r.target_sets]).sort()).toEqual(
    [
      [keepId, 5],
      [keepId, 4],
    ].sort(),
  )
})

test('new exercise named like an existing one shows a hint but still saves', async ({ page, stamp }) => {
  const name = `E2E Merge Hint ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name })
    },
  })

  await goTo(page, 'Exercises')
  const sheet = await openNewExerciseSheet(page)
  await sheet.getByLabel('Name').fill(name.toLowerCase())
  await expect(sheet.getByText(`You already have ${name}.`)).toBeVisible()
  await sheet.getByRole('button', { name: 'Open it' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit exercise' }).getByLabel('Name')).toHaveValue(name)
})
