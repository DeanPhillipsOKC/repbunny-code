import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { openNewExerciseSheet, clickExerciseRowAction } from '../fixtures/exercise'
import { openAccountSection } from '../fixtures/account'

// Issue #63: My exercises leads with the list. The create form opens in a
// sheet from "New exercise", and Rest timer alerts moved to Account.
test('exercises tab: the list comes first, the create form is a sheet', async ({ page, stamp }) => {
  const exerciseName = `E2E List First ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName, muscle_group: 'back' })
    },
  })
  await page.setViewportSize({ width: 375, height: 800 })
  await goTo(page, 'Exercises')

  const segments = page.getByRole('group', { name: 'Exercises view' })
  const newButton = page.getByRole('button', { name: 'New exercise', exact: true })
  const firstRow = page.locator('ul.list > li.row-wrap').first()
  await expect(firstRow).toBeVisible()
  await expect(firstRow).toBeInViewport()

  // Only the New exercise button sits between the segments and the list.
  await expect(page.getByLabel('Name')).toHaveCount(0)
  await expect(page.getByText('Rest timer alerts')).toHaveCount(0)
  const segmentsBox = (await segments.boundingBox())!
  const buttonBox = (await newButton.boundingBox())!
  const rowBox = (await firstRow.boundingBox())!
  expect(buttonBox.y).toBeGreaterThan(segmentsBox.y + segmentsBox.height - 1)
  expect(rowBox.y).toBeGreaterThan(buttonBox.y + buttonBox.height - 1)
  // The shared account may also show the "needs a muscle group" and "might
  // match the library" banners (#217: both at once broke a fixed pixel cap),
  // so check structure instead: the list follows the button or a banner.
  const aboveList = await page.locator('ul.list').first().evaluate((list) => {
    const prev = list.previousElementSibling as HTMLElement
    return { className: prev.className, bottom: prev.getBoundingClientRect().bottom }
  })
  expect(aboveList.className).toMatch(/\b(new-exercise-trigger|needs-group-link)\b/)
  expect(rowBox.y - aboveList.bottom).toBeLessThan(24)

  // Close and Cancel both dismiss the sheet without adding anything.
  let sheet = await openNewExerciseSheet(page)
  await expect(sheet.getByLabel('Name')).toBeFocused()
  // Name comes before the group grid, and Add exercise is pinned in view
  // without scrolling the long form.
  const nameBox = (await sheet.getByLabel('Name').boundingBox())!
  const groupBox = (await sheet.getByRole('group', { name: 'What does it work?' }).boundingBox())!
  expect(nameBox.y).toBeLessThan(groupBox.y)
  await expect(sheet.getByRole('button', { name: 'Add exercise' })).toBeInViewport()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)
  sheet = await openNewExerciseSheet(page)
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toHaveCount(0)

  // The edit form leads with Name too.
  const row = page.locator('.row-wrap', { hasText: exerciseName })
  await clickExerciseRowAction(row, 'Edit exercise')
  const editSheet = page.getByRole('dialog', { name: 'Edit exercise' })
  const editNameBox = (await editSheet.getByLabel('Name').boundingBox())!
  const editGroupBox = (await editSheet.getByRole('group', { name: 'What does it work?' }).boundingBox())!
  expect(editNameBox.y).toBeLessThan(editGroupBox.y)
  await editSheet.getByRole('button', { name: 'Cancel' }).click()

  // Rest timer alerts live under Account > Preferences now.
  const preferences = (await openAccountSection(page, 'Preferences')).getByRole('group', { name: 'Preferences' })
  await expect(preferences.getByRole('group', { name: 'Rest timer alerts' })).toBeVisible()
})
