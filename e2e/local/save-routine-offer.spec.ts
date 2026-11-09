import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #316: every freeform finish offers "Save as routine" while a free
// routine slot is left. At the free limit (3) the offer stays away. "Not now"
// hides it for that recap only.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'

async function setUp(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()
}

async function freeformRecap(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  const draft = page.locator('.set-row-draft').first()
  await draft.getByLabel('Reps').fill('5')
  await draft.getByLabel('Weight').fill('135')
  await draft.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged').first()).toBeVisible()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  const recap = page.getByTestId('post-finish-card')
  await expect(recap).toBeVisible()
  return recap
}

test('the save offer shows after every freeform workout until the free limit', async ({ page }) => {
  await setUp(page)

  for (let i = 1; i <= 3; i++) {
    const recap = await freeformRecap(page)
    const offer = recap.getByRole('region', { name: 'Do this again?' })
    await expect(offer).toBeVisible()
    await offer.getByLabel('Routine name').fill(`Offer routine ${i}`)
    await offer.getByRole('button', { name: 'Save as routine' }).click()
    await expect(recap.getByRole('status').filter({ hasText: `Saved as Offer routine ${i}.` })).toBeVisible()
    await recap.getByRole('button', { name: 'Done', exact: true }).click()
  }

  // Three routines is the free limit: no offer, and no upsell in its place.
  const recap = await freeformRecap(page)
  await expect(recap.getByRole('button', { name: 'Save as routine' })).toHaveCount(0)
  await expect(recap.getByRole('region', { name: 'Do this again?' })).toHaveCount(0)
})

test('Not now hides the offer for that recap only', async ({ page }) => {
  await setUp(page)

  let recap = await freeformRecap(page)
  const offer = recap.getByRole('region', { name: 'Do this again?' })
  await offer.getByRole('button', { name: 'Not now' }).click()
  await expect(offer).toHaveCount(0)
  await recap.getByRole('button', { name: 'Done', exact: true }).click()

  recap = await freeformRecap(page)
  await expect(recap.getByRole('region', { name: 'Do this again?' })).toBeVisible()
})
