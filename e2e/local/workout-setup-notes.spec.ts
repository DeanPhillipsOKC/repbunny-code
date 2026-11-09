import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'

// Covers issue #81: add, edit, and clear an exercise's setup notes from the
// workout card, without a trip to the Exercises tab.
test('setup notes can be added, edited, and cleared from the workout card', async ({ page, stamp }) => {
  const exerciseName = `E2E Chest Press ${stamp}`
  const note = 'Seat 3, handles at pin 2'

  const admin = localDb(page)

  // A notes-free exercise is pre-existing state, not behavior under test.
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  await expect(page.locator('.exercise-card-notes')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add machine setup note' }).click()

  const sheet = page.getByRole('dialog', { name: `Setup notes for ${exerciseName}` })
  const textarea = sheet.getByLabel('Setup notes')
  await expect(textarea).toBeFocused()
  await expect(textarea).toHaveValue('')
  await textarea.fill(note)
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()

  await expect(page.locator('.exercise-card-notes')).toHaveText(note)
  await expect(page.getByRole('button', { name: 'Edit machine setup note' })).toBeVisible()

  // Same setup_notes field the Exercises tab shows.
  await goTo(page, 'Exercises')
  const row = page.locator('.row-wrap', { hasText: exerciseName })
  await expect(row.locator('.tag-pill')).toHaveText(note)

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Edit machine setup note' }).click()
  await expect(sheet.getByLabel('Setup notes')).toHaveValue(note)

  // Cancel leaves the note alone.
  await sheet.getByLabel('Setup notes').fill('something else')
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.locator('.exercise-card-notes')).toHaveText(note)

  // Tapping the note opens the editor too; clearing it removes the note.
  await page.locator('.exercise-card-notes').click()
  await sheet.getByLabel('Setup notes').fill('   ')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.locator('.exercise-card-notes')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add machine setup note' })).toBeVisible()
})
