import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { openEditExerciseSheet } from '../fixtures/exercise'

// Covers issue #91: the pencil opens an "Edit exercise" sheet instead of
// expanding the row, Save stays on screen, and closing it (Cancel or Save)
// leaves the list where it was.
test('edit exercise: opens in a sheet and keeps the list scrolled where it was', async ({ page, stamp }) => {
  const names = Array.from({ length: 15 }, (_, i) => `E2E Sheet ${String(i + 1).padStart(2, '0')} ${stamp}`)
  const target = names[names.length - 1]
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await localDb(page)
        .from('exercises')
        .insert(names.map((name) => ({ user_id: userId, name, muscle_group: 'chest' })))
    },
  })
  await page.setViewportSize({ width: 375, height: 800 })
  await goTo(page, 'Exercises')

  const row = page.locator('.row-wrap', { hasText: target })
  await row.scrollIntoViewIfNeeded()
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(0)
  const rowHeight = (await row.boundingBox())!.height

  const sheet = await openEditExerciseSheet(page, target)
  await expect(sheet.getByRole('heading', { name: 'Edit exercise' })).toBeVisible()
  await expect(sheet.getByLabel('Name')).toHaveValue(target)
  // The row itself doesn't grow a form any more.
  expect((await row.boundingBox())!.height).toBe(rowHeight)
  await expect(row.getByLabel('Name')).toHaveCount(0)
  // Save and Cancel are pinned inside the viewport, not below the fold.
  const save = (await sheet.getByRole('button', { name: 'Save' }).boundingBox())!
  expect(save.y + save.height).toBeLessThanOrEqual(800)
  await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeInViewport()

  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)

  await openEditExerciseSheet(page, target)
  await sheet.getByLabel('Setup notes').fill('seat 3')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(row.locator('.tag-pill', { hasText: 'seat 3' })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)

  // Close (the X) dismisses without saving.
  await openEditExerciseSheet(page, target)
  await sheet.getByLabel('Setup notes').fill('changed')
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(row.locator('.tag-pill', { hasText: 'seat 3' })).toBeVisible()
})
