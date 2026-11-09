import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { closeAddExerciseSheet, selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #104: in local mode (the App Store build) without Premium, a 4th
// active template and the plate calculator open the Premium sheet instead.
// Logging a set never does. setPremiumUnlocked is reached through the dev
// server's module, the same way other local specs reach app code, since
// nothing about Premium is on `window`.

const BENCH = 'Barbell Bench Press'

async function seedTemplates(page: Page, names: string[]) {
  await page.evaluate(async (names) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    for (const name of names) {
      const { error } = await repos.templates.create(name)
      if (error) throw new Error(error.message)
    }
  }, names)
}

async function activeTemplateCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const { data } = await repos.templates.list()
    return data.filter((t: { is_archived: boolean }) => !t.is_archived).length
  })
}

async function unlockPremium(page: Page) {
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
}

async function closePremiumSheet(page: Page) {
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await premium.getByRole('button', { name: 'Not now' }).click()
  await expect(premium).toHaveCount(0)
}

test('local mode: 3 free routines, a locked plate calculator, and Premium unlocks both', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  const premium = page.getByRole('dialog', { name: 'Premium' })

  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()

  // A freeform workout: the Plates button is there but opens the Premium
  // sheet, and logging, editing, and finishing a set never do.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await page.getByRole('button', { name: 'Plates' }).click()
  await expect(premium).toBeVisible()
  await expect(premium.getByRole('heading', { name: 'Plate calculator' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Load the bar' })).toHaveCount(0)
  // Issue #116: the plates sheet links its how-to guide, opening externally.
  const guide = premium.getByRole('link', { name: /See how it works/ })
  await expect(guide).toHaveAttribute('href', 'https://repbunny.app/guides/plate-calculator/')
  await expect(guide).toHaveAttribute('target', '_blank')

  // No App Store in the browser, so Unlock says so (the fake store is in premium-purchase.spec.ts).
  await premium.getByRole('button', { name: 'Unlock Premium' }).click()
  await expect(premium.getByRole('alert')).toContainText("Premium isn't available on this build")
  await closePremiumSheet(page)

  const draft = page.locator('.set-row-draft').first()
  await draft.getByLabel('Reps').fill('5')
  await draft.getByLabel('Weight').fill('135')
  await draft.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  const logged = page.locator('.set-row-logged').first()
  await expect(logged).toBeVisible()
  await expect(premium).toHaveCount(0)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()
  await expect(premium).toHaveCount(0)

  // Three templates: the free limit.
  await seedTemplates(page, ['Push', 'Pull', 'Legs'])

  // Templates' "Add routine" opens the Premium sheet, not the name sheet.
  await goTo(page, 'Routines')
  await expect(page.locator('.row-wrap')).toHaveCount(3)
  await page.getByRole('button', { name: 'Add routine' }).click()
  await expect(premium).toBeVisible()
  await expect(premium.getByRole('heading', { name: 'Unlimited routines' })).toBeVisible()
  await expect(premium).toContainText('Free includes 3 routines')
  await expect(premium.getByRole('link', { name: /See how it works/ })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'New routine' })).toHaveCount(0)

  // The sheet sits at the bottom, inside a phone-width viewport.
  const box = await premium.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  expect(Math.round(box!.y + box!.height)).toBe(800)
  await closePremiumSheet(page)

  // Home's "+ New routine" too.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: '+ New routine' }).click()
  await expect(premium).toBeVisible()
  await closePremiumSheet(page)
  await expect(page).toHaveURL(/\/$/)

  // And History's "Save as routine".
  await goTo(page, 'Workout log')
  await page.getByRole('button', { name: 'Save as routine' }).click()
  await expect(premium).toBeVisible()
  await closePremiumSheet(page)
  await expect(page.getByLabel('Routine name')).toHaveCount(0)
  expect(await activeTemplateCount(page)).toBe(3)

  // Archiving one makes room.
  await goTo(page, 'Routines')
  await page.locator('.row-wrap', { hasText: 'Legs' }).getByRole('button', { name: 'Archive routine' }).click()
  await page.getByRole('button', { name: 'Confirm archive' }).click()
  // Issue #495: the archived one moves to Archived routines, so count active rows only.
  await expect(page.locator('.row-wrap:not(.archived *)')).toHaveCount(2)
  await page.getByRole('button', { name: 'Add routine' }).click()
  const nameSheet = page.getByRole('dialog', { name: 'New routine' })
  await nameSheet.getByLabel('Name', { exact: true }).fill('Arms')
  await nameSheet.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/\/templates\/.+/)
  await expect(premium).toHaveCount(0)
  await closeAddExerciseSheet(page)
  expect(await activeTemplateCount(page)).toBe(3)

  // With Premium, a 4th template and the plate calculator both work.
  await unlockPremium(page)
  await goTo(page, 'Workout log')
  await page.getByRole('button', { name: 'Save as routine' }).click()
  await expect(premium).toHaveCount(0)
  await page
    .locator('form', { has: page.getByLabel('Routine name') })
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await expect(page.getByRole('link', { name: 'View in Routines' })).toBeVisible()
  expect(await activeTemplateCount(page)).toBe(4)

  await goTo(page, 'Routines')
  await page.getByRole('button', { name: 'Add routine' }).click()
  await expect(page.getByRole('dialog', { name: 'New routine' })).toBeVisible()
  await expect(premium).toHaveCount(0)
  await page.getByRole('dialog', { name: 'New routine' }).getByRole('button', { name: 'Cancel' }).click()

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await page.getByRole('button', { name: 'Plates' }).click()
  await expect(page.getByRole('dialog', { name: 'Load the bar' })).toBeVisible()
  await expect(premium).toHaveCount(0)
})
