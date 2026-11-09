import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup } from '../fixtures/exercise'

// Issue #86: the Library offers a way to create an exercise it doesn't
// have. Runs on the local-mode dev server (the `local` Playwright project, e2e/local/) so
// each test starts with an empty database.

async function openLibrary(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await goTo(page, 'Exercises')
  await page.getByRole('button', { name: 'Library' }).click()
}

test('a search with no matches offers to create it, prefilled', async ({ page }) => {
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill('  Tire Flip  ')
  await expect(page.getByText('No library exercises match')).toBeVisible()

  await page.getByRole('button', { name: 'Create "Tire Flip"' }).click()

  await expect(page).toHaveURL(/\/exercises$/)
  await expect(page.getByRole('button', { name: 'My exercises' })).toHaveAttribute('aria-pressed', 'true')
  // Issue #63: the create form opens as the New exercise sheet.
  await expect(page.getByRole('dialog', { name: 'New exercise' })).toBeVisible()
  const nameField = page.getByLabel('Name')
  await expect(nameField).toHaveValue('Tire Flip')
  await expect(nameField).toBeFocused()

  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.getByRole('dialog', { name: 'New exercise' })).toHaveCount(0)
  await expect(page.locator('.row-wrap', { hasText: 'Tire Flip' })).toBeVisible()
})

test('the banner "Make your own" opens an empty create form', async ({ page }) => {
  await openLibrary(page)
  await page.getByRole('button', { name: 'Make your own' }).click()

  await expect(page.getByRole('button', { name: 'My exercises' })).toHaveAttribute('aria-pressed', 'true')
  // Issue #63: the create form opens as the New exercise sheet.
  await expect(page.getByRole('dialog', { name: 'New exercise' })).toBeVisible()
  const nameField = page.getByLabel('Name')
  await expect(nameField).toHaveValue('')
  await expect(nameField).toBeFocused()
})

test('a search with matches still offers "Not here? Create"', async ({ page }) => {
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill('press')
  await expect(page.locator('.library-list')).toBeVisible()
  await expect(page.getByText('Not here?')).toBeVisible()

  await page.getByRole('button', { name: 'Create "press"' }).click()
  await expect(page.getByLabel('Name')).toHaveValue('press')
})
