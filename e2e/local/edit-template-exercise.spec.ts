import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Covers docs/backlog.md item 14: change a template exercise's target set
// count after creation without removing and re-adding it (which would lose
// its position in the routine).
test('edit target set count on a template exercise', async ({ page, stamp }) => {
  const exerciseName = `E2E Incline Press ${stamp}`
  const templateName = `E2E Upper Day ${stamp}`

  const admin = localDb(page)
  let exerciseId = ''

  // The exercise, template, and its target_sets: 3 link are pre-existing
  // state this test edits, not behavior under test -- seed them directly via
  // the admin client instead of driving the Exercises/Templates UI (item
  // 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      exerciseId = exercise!.id
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: exercise!.id, position: 0, target_sets: 3 })
    },
  })

  // Issue #6: the inline Edit/Save form became a −/+ stepper on the
  // template editor's exercise card that saves on every tap.
  await goTo(page, 'Routines')
  await page.getByText(templateName).click()

  const card = page.locator('.ex-card', { hasText: exerciseName })
  const value = card.locator('.sets-value b')
  const more = card.getByRole('button', { name: `More sets for ${exerciseName}` })
  const fewer = card.getByRole('button', { name: `Fewer sets for ${exerciseName}` })
  await expect(value).toHaveText('3')

  await more.click()
  await expect(value).toHaveText('4')
  await more.click()
  await expect(value).toHaveText('5')

  const savedSets = async () =>
    (await admin.from('workout_template_exercises').select('target_sets').eq('exercise_id', exerciseId).single()).data!
      .target_sets
  await expect.poll(savedSets).toBe(5)

  await page.reload()
  await expect(value).toHaveText('5')

  // Never below 1.
  for (const expected of ['4', '3', '2', '1']) {
    await fewer.click()
    await expect(value).toHaveText(expected)
  }
  await expect(fewer).toBeDisabled()
  await expect.poll(savedSets).toBe(1)
})
