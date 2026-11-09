import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { pickMuscleGroup } from '../fixtures/exercise'

// A brand-new account sees the welcome screen, so give it one exercise.
async function seedOne(page: Page, userId: string, stamp: string) {
  await localDb(page).from('exercises').insert({ user_id: userId, name: `E2E Footer Seed ${stamp}` })
}

async function openSheet(page: Page) {
  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  return page.getByRole('dialog', { name: 'Add exercise' })
}

// Issue #781: "New exercise" lives in the sheet's pinned footer (and as a
// Create "<query>" button when a search finds nothing), so it stays
// reachable however far the list is scrolled. It opens its own sheet.
test('New exercise stays in the footer, opens its own sheet, and cancel returns to the list where it was', async ({ page, stamp }) => {
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        user_id: userId,
        name: `E2E Footer ${String(i).padStart(2, '0')} ${stamp}`,
      }))
      await admin.from('exercises').insert(rows)
    },
  })
  const sheet = await openSheet(page)

  // The old top row is gone; the footer link is the way in.
  const footerNew = sheet.getByRole('button', { name: 'New exercise', exact: true })
  await expect(footerNew).toHaveCount(1)
  await expect(sheet.getByRole('button', { name: 'Manage exercises', exact: true })).toBeVisible()

  const body = sheet.locator('.sheet-body')
  await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  const scrolled = await body.evaluate((el) => el.scrollTop)
  await expect(footerNew).toBeInViewport()

  await footerNew.click()
  const form = page.getByRole('dialog', { name: 'New exercise' })
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('')
  // Its own sheet: the Add exercise dialog does not contain the form.
  await expect(sheet.getByLabel('Name', { exact: true })).toHaveCount(0)

  await form.getByRole('button', { name: 'Cancel' }).click()
  await expect(form).toHaveCount(0)
  await expect(sheet).toBeVisible()
  expect(await body.evaluate((el) => el.scrollTop)).toBe(scrolled)
})

test('New exercise creates into the workout and prefills Name from the search box', async ({ page, stamp }) => {
  const created = `E2E Footer Zercher ${stamp}`
  await startLocal(page, { beforeNavigate: (userId) => seedOne(page, userId, stamp) })
  const sheet = await openSheet(page)
  await sheet.getByPlaceholder('Search exercises').fill('Zercher')
  await sheet.getByRole('button', { name: 'New exercise', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'New exercise' })
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Zercher')

  await form.getByLabel('Name', { exact: true }).fill(created)
  await pickMuscleGroup(form)
  await form.getByRole('button', { name: 'Add exercise' }).click()
  await expect(form).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: created, exact: true })).toHaveAttribute('aria-pressed', 'true')

  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(created)
})

test('a search with no matches offers a Create button that opens the sheet prefilled', async ({ page, stamp }) => {
  await startLocal(page, { beforeNavigate: (userId) => seedOne(page, userId, stamp) })
  const sheet = await openSheet(page)
  await sheet.getByPlaceholder('Search exercises').fill('Qzxv Nonsense Lift')
  await expect(sheet.getByText('No exercises match')).toBeVisible()
  await sheet.getByRole('button', { name: 'Create "Qzxv Nonsense Lift"' }).click()
  const form = page.getByRole('dialog', { name: 'New exercise' })
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Qzxv Nonsense Lift')
})
