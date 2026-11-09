import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { accountMenu } from '../fixtures/account'
import { closeAddExerciseSheet, selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #114: the gentle Premium nudges in local mode without Premium: a
// "N of 3 free routines" count, a one-time hint after the 3rd template, a
// Premium tag on Plates, and a Premium group in Account. With Premium they
// go away (Account thanks you instead).

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'
const HINT = "That's your last free routine."

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

async function startFreeformAndLogASet(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  const draft = page.locator('.set-row-draft').first()
  await draft.getByLabel('Reps').fill('5')
  await draft.getByLabel('Weight').fill('135')
  await draft.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged').first()).toBeVisible()
}

async function finishWorkout(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()
}

// Templates' Add routine, through the editor and back to the list.
async function addTemplate(page: Page, name: string) {
  await goTo(page, 'Routines')
  await page.getByRole('button', { name: 'Add routine' }).click()
  const sheet = page.getByRole('dialog', { name: 'New routine' })
  await sheet.getByLabel('Name', { exact: true }).fill(name)
  await sheet.getByRole('button', { name: 'Next' }).click()
  await expect(page).toHaveURL(/\/templates\/.+/)
  await closeAddExerciseSheet(page)
  await goTo(page, 'Routines')
}

async function unlockPremium(page: Page) {
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
}

test('local mode nudges: template counter, last-template hint from History, Plates tag, and the Account row', async ({ page }) => {
  await setUp(page)
  const counter = page.getByText(/^\s*\d of 3 free routines\s*$/)
  const premium = page.getByRole('dialog', { name: 'Premium' })

  // The Plates tag is the one nudge shown mid-workout, and it still opens
  // the Premium sheet.
  await startFreeformAndLogASet(page)
  const plates = page.getByRole('button', { name: 'Plates' })
  await expect(plates.getByText('Premium', { exact: true })).toBeVisible()
  await plates.click()
  await expect(premium).toBeVisible()
  await expect(premium).toContainText('Logging, history, backup, restore, and export stay free forever.')
  await premium.getByRole('button', { name: 'Not now' }).click()
  await finishWorkout(page)

  await goTo(page, 'Routines')
  await expect(counter).toHaveText('0 of 3 free routines')
  await addTemplate(page, 'Push')
  await expect(counter).toHaveText('1 of 3 free routines')
  await addTemplate(page, 'Pull')
  await expect(counter).toHaveText('2 of 3 free routines')
  await expect(page.getByText(HINT)).toHaveCount(0)

  // The 3rd, from History: the save confirmation adds the one-time hint.
  await goTo(page, 'Workout log')
  await page.getByRole('button', { name: 'Save as routine' }).click()
  await page
    .locator('form', { has: page.getByLabel('Routine name') })
    .getByRole('button', { name: 'Save', exact: true })
    .click()
  await expect(page.getByRole('link', { name: 'View in Routines' })).toBeVisible()
  const hint = page.getByRole('note').filter({ hasText: HINT })
  await expect(hint).toContainText('Premium gives you as many as you want.')
  await hint.getByRole('button', { name: 'Learn more' }).click()
  await expect(premium.getByRole('heading', { name: 'Unlimited routines' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await hint.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText(HINT)).toHaveCount(0)

  await goTo(page, 'Routines')
  await expect(counter).toHaveText('3 of 3 free routines')
  await expect(page.getByText(HINT)).toHaveCount(0)

  // Archiving and re-adding the 3rd doesn't bring the hint back.
  await page.locator('.row-wrap', { hasText: 'Pull' }).getByRole('button', { name: 'Archive routine' }).click()
  await page.getByRole('button', { name: 'Confirm archive' }).click()
  await expect(counter).toHaveText('2 of 3 free routines')
  await addTemplate(page, 'Legs')
  await expect(counter).toHaveText('3 of 3 free routines')
  await expect(page.getByText(HINT)).toHaveCount(0)

  // Account's Premium group: what's included, Unlock, and Restore Purchases
  // (no App Store in the browser; premium-purchase.spec.ts has the fake).
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const menu = accountMenu(page)
  const group = menu.getByRole('group', { name: 'Premium' })
  await expect(group).toContainText('RepBunny Premium')
  await expect(group).toContainText('Unlimited routines')
  await expect(group).toContainText('Plate calculator')
  await expect(group.getByRole('button', { name: 'Unlock Premium' })).toBeVisible()
  await group.getByRole('button', { name: 'Restore Purchases' }).click()
  await expect(group.getByRole('alert')).toContainText("Premium isn't available on this build")

  // With Premium: the row thanks you, and the counter and tag are gone.
  await unlockPremium(page)
  await expect(group).toContainText('Premium is unlocked')
  await expect(group).toContainText('Thanks for backing RepBunny.')
  await expect(group.getByRole('button', { name: 'Unlock Premium' })).toHaveCount(0)
  await expect(group.getByRole('button', { name: 'Restore Purchases' })).toHaveCount(0)
  await menu.getByRole('button', { name: 'Close' }).click()

  await expect(counter).toHaveCount(0)
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await expect(page.getByRole('button', { name: 'Plates' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Plates' }).getByText('Premium', { exact: true })).toHaveCount(0)
})

test('local mode: the last-template hint waits for a workout in progress, then shows on Templates once', async ({ page }) => {
  await setUp(page)

  await addTemplate(page, 'Push')
  await addTemplate(page, 'Pull')

  // The 3rd is saved mid-workout: no hint until the workout is finished.
  await startFreeformAndLogASet(page)
  await addTemplate(page, 'Legs')
  await expect(page.getByText('3 of 3 free routines', { exact: true })).toBeVisible()
  await expect(page.getByText(HINT)).toHaveCount(0)

  await finishWorkout(page)
  await goTo(page, 'Routines')
  const hint = page.getByRole('note').filter({ hasText: HINT })
  await expect(hint).toBeVisible()

  // Shown once: a reload doesn't bring it back, even undismissed.
  await page.reload()
  await expect(page.getByText('3 of 3 free routines', { exact: true })).toBeVisible()
  await expect(page.getByText(HINT)).toHaveCount(0)
})
