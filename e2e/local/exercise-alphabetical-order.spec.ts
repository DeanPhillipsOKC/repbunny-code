import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup, openNewExerciseSheet, clickExerciseRowAction } from '../fixtures/exercise'

test('exercise lists stay alphabetical after creating and renaming exercises', async ({ page, stamp }) => {
  const names = {
    a: `e2e sort a ${stamp}`,
    aa: `E2E Sort AA ${stamp}`,
    b: `E2E Sort B ${stamp}`,
    c: `E2E Sort C ${stamp}`,
    d: `E2E Sort D ${stamp}`,
  }
  const templateName = `E2E Sort Template ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert([
        { user_id: userId, name: names.b },
        { user_id: userId, name: names.d },
      ])
      await admin.from('workout_templates').insert({ user_id: userId, name: templateName })
    },
  })

  await goTo(page, 'Exercises')
  for (const exerciseName of [names.c, names.a]) {
    await openNewExerciseSheet(page)
    await page.getByLabel('Name').fill(exerciseName)
    await pickMuscleGroup(page)
    await page.getByRole('button', { name: 'Add exercise' }).click()
  }

  const exerciseNames = page.locator('ul.list > li.row-wrap .row-title').filter({ hasText: String(stamp) })
  await expect(exerciseNames).toHaveText([names.a, names.b, names.c, names.d])

  // Issue #6: the template editor's picker is the Add exercise sheet.
  const pickerOrder = async () => {
    await goTo(page, 'Routines')
    await page.getByText(templateName, { exact: true }).click()
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add exercise' })
    await sheet.getByPlaceholder('Search exercises').fill(String(stamp))
    const items = sheet.locator('.sheet-item')
    await expect(items).toHaveCount(4)
    const order = await items.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
    await sheet.getByRole('button', { name: 'Done' }).click()
    return order
  }
  expect(await pickerOrder()).toEqual([names.a, names.b, names.c, names.d])

  await goTo(page, 'Exercises')
  const row = page.locator('.row-wrap', { hasText: names.d })
  await clickExerciseRowAction(row, 'Edit exercise')
  const editSheet = page.getByRole('dialog', { name: 'Edit exercise' })
  await editSheet.getByLabel('Name').fill(names.aa)
  await editSheet.getByRole('button', { name: 'Save' }).click()

  await expect(exerciseNames).toHaveText([names.a, names.aa, names.b, names.c])

  expect(await pickerOrder()).toEqual([names.a, names.aa, names.b, names.c])
})
