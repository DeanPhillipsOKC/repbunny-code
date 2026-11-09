import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Issue #549: an Exercises row is one big tap target that opens its history,
// with Edit and Delete behind a single 44px "More options" button. The three
// 36px icons it replaced pushed "Barbell Bench Press" onto two lines at 390px.
test('exercises row: name fits on one line, row opens history, More opens Edit and Delete', async ({ page }) => {
  const name = 'Barbell Bench Press'
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({
        user_id: userId,
        name,
        muscle_group: 'chest',
        also_works: ['arms', 'shoulders'],
        rest_seconds: 120,
      })
    },
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await goTo(page, 'Exercises')

  const row = page.locator('.row-wrap', { hasText: name })
  const title = row.locator('.row-title')
  await expect(title).toHaveText(name)
  const lineHeight = await title.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
  const titleBox = (await title.boundingBox())!
  expect(titleBox.height).toBeLessThan(lineHeight * 1.5)

  // Every control in the row is at least 44 x 44.
  const open = row.getByRole('button', { name: 'View exercise history' })
  const more = row.getByRole('button', { name: 'More options' })
  for (const control of [open, more]) {
    const box = (await control.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await expect(open).toHaveAccessibleDescription(name)
  await expect(more).toHaveAccessibleDescription(name)
  await expect(row.getByRole('button', { name: 'Edit exercise' })).toHaveCount(0)

  // Tapping the row opens its history.
  await open.click()
  const history = page.getByRole('dialog', { name: `${name} history` })
  await expect(history).toBeVisible()
  await history.getByRole('button', { name: 'Close history' }).click()
  await expect(history).toHaveCount(0)

  // More toggles the Edit / Delete strip.
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  const edit = row.getByRole('button', { name: 'Edit exercise' })
  const remove = row.getByRole('button', { name: 'Delete exercise' })
  for (const control of [edit, remove]) {
    const box = (await control.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await more.click()
  await expect(edit).toHaveCount(0)

  // Edit opens the sheet and closes the strip.
  await more.click()
  await edit.click()
  const sheet = page.getByRole('dialog', { name: 'Edit exercise' })
  await expect(sheet.getByLabel('Name')).toHaveValue(name)
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(more).toHaveAttribute('aria-expanded', 'false')

  // Delete still asks first.
  await more.click()
  await remove.click()
  await expect(page.getByText(`Remove ${name}? Your past workouts keep its sets.`)).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(row.getByRole('button', { name: 'Delete exercise' })).toHaveCount(0)
  await row.getByRole('button', { name: 'More options' }).click()
  await row.getByRole('button', { name: 'Delete exercise' }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.locator('.row-wrap', { hasText: name })).toHaveCount(0)
})
