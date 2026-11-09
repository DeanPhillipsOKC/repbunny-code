import { test, expect, seedExercise, startLocal } from '../fixtures/local'
import type { Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { closeAddExerciseSheet } from '../fixtures/exercise'

// Issue #65: every top-level screen uses the large display title, and the
// Account button sits on that title's row, right-aligned, instead of alone on
// its own row above it.
async function expectTitleRow(page: Page, title: string) {
  const heading = page.getByRole('heading', { name: title, exact: true })
  await expect(heading).toBeVisible()

  // One Account button per screen: App.vue's slim row is gone here.
  const account = page.getByRole('button', { name: 'Account' })
  await expect(account).toHaveCount(1)

  const h = (await heading.boundingBox())!
  const a = (await account.boundingBox())!
  // Same row: the title's vertical center falls within the button's height.
  const titleCenter = h.y + h.height / 2
  expect(titleCenter).toBeGreaterThan(a.y)
  expect(titleCenter).toBeLessThan(a.y + a.height)
  // Right-aligned beside the title, flush with the content's right gutter.
  expect(a.x).toBeGreaterThanOrEqual(h.x + h.width)
  const viewport = page.viewportSize()!
  expect(Math.abs(viewport.width - (a.x + a.width) - 16)).toBeLessThan(2)

  // Display title, not the small uppercase section-label style.
  const style = await heading.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { fontSize: parseFloat(cs.fontSize), transform: cs.textTransform }
  })
  expect(style.fontSize).toBeGreaterThan(24)
  expect(style.transform).toBe('none')
}

test('top-level screens put the Account button on the large title row', async ({ page }) => {
  await startLocal(page)
  await page.setViewportSize({ width: 375, height: 800 })

  await goTo(page, 'Home')
  await expectTitleRow(page, 'Log a workout')

  await goTo(page, 'Exercises')
  await expectTitleRow(page, 'Exercises')

  await goTo(page, 'Routines')
  await expectTitleRow(page, 'Routines')

  await goTo(page, 'Progress')
  await expectTitleRow(page, 'Progress')

  await goTo(page, 'Workout log')
  await expectTitleRow(page, 'Workout log')

  await goTo(page, 'Body')
  await expectTitleRow(page, 'Body')

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await expectTitleRow(page, 'Lift progress')
})

test('the Account button stays put when a workout starts from Home', async ({ page, stamp }) => {
  // Issue #161: an account with no exercises shows the welcome card instead
  // of the Freeform tile, so seed one rather than relying on whatever earlier
  // specs left on this worker's account.
  await startLocal(page, { beforeNavigate: (userId) => seedExercise(page, `E2E Title Row ${stamp}`) })
  await page.setViewportSize({ width: 375, height: 800 })

  await goTo(page, 'Home')
  // AuthGate's passkey card sits above the screen until dismissed, and an
  // active workout hides it, which would shift the row for an unrelated reason.
  const notNow = page.getByRole('button', { name: 'Not now' })
  if (await notNow.isVisible()) await notNow.click()
  await expect(notNow).toBeHidden()
  const idle = (await page.getByRole('button', { name: 'Account' }).boundingBox())!
  await page.getByRole('button', { name: 'Freeform' }).click()
  await expect(page.getByRole('heading', { name: 'Freeform workout' })).toBeVisible()
  const active = (await page.getByRole('button', { name: 'Account' }).boundingBox())!

  expect(Math.abs(active.x - idle.x)).toBeLessThan(2)
  expect(Math.abs(active.y - idle.y)).toBeLessThan(2)
})

// Issue #276: the routine editor and library exercise detail have titles too,
// so they get the same row: a back link above, then title and Account.
test('the routine editor and library detail put Account on the title row', async ({ page, stamp }) => {
  const templateName = `E2E Title Row Routine ${stamp}`
  await startLocal(page)
  await page.setViewportSize({ width: 375, height: 800 })

  await goTo(page, 'Routines')
  await page.getByRole('button', { name: 'Add routine' }).click()
  await page.getByLabel('Name').fill(templateName)
  await page.getByRole('button', { name: 'Next' }).click()
  await closeAddExerciseSheet(page)
  await expectTitleRow(page, templateName)
  // The back link sits above the title row, not beside it.
  const back = (await page.getByRole('button', { name: 'Back to routines' }).boundingBox())!
  const title = (await page.getByRole('heading', { name: templateName, exact: true }).boundingBox())!
  expect(back.y + back.height).toBeLessThanOrEqual(title.y + 1)
  // The rename pencil still opens the name field.
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await expect(page.getByLabel('Name')).toHaveValue(templateName)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Back to routines' }).click()
  await expect(page).toHaveURL(/\/templates$/)

  await openLibrary(page)
  await page.getByRole('button', { name: /^Glutes, \d+ exercises$/ }).click()
  await page.getByRole('button', { name: 'View Barbell Hip Thrust' }).click()
  await expectTitleRow(page, 'Barbell Hip Thrust')
  await expect(page.getByText('Glutes · also works Legs')).toBeVisible()
  await page.getByRole('button', { name: 'Back to Library' }).click()
  await expect(page).toHaveURL(/\/exercises\?view=library&group=glutes$/)
})
