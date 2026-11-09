import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup, openNewExerciseSheet } from '../fixtures/exercise'

// Covers issue #849: a new exercise's name is saved trimmed, so a trailing
// space can't split one machine's history across two exercises.
test('create exercise: name is trimmed and a trailing space still matches an existing name', async ({ page, stamp }) => {
  const existing = `E2E Trim Hip Abduction ${stamp}`
  const fresh = `E2E Trim Cable Row ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: existing })
    },
  })

  await goTo(page, 'Exercises')
  const sheet = await openNewExerciseSheet(page)
  await sheet.getByLabel('Name').fill(`${existing} `)
  await expect(sheet.getByText(`You already have ${existing}.`)).toBeVisible()

  await sheet.getByLabel('Name').fill(`  ${fresh}   `)
  await pickMuscleGroup(page, 'Back')
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.locator('.row-wrap', { hasText: fresh })).toBeVisible()

  const { data } = await admin.from('exercises').select('name').like('name', `%${stamp}%`)
  expect(data!.map((r) => r.name).sort()).toEqual([existing, fresh].sort())
})
