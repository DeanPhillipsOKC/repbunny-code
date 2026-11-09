import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup, openNewExerciseSheet } from '../fixtures/exercise'
import { openAccountSection } from '../fixtures/account'

// Issue #76: local mode (the native apps; VITE_DATA=local here, on
// playwright.config.ts's second dev server) keeps data in on-device SQLite
// with no account. Each test gets a fresh browser context, so the database
// starts empty, like a first launch.

test('local mode opens straight into the app and keeps data on the device', async ({ page }) => {
  await page.goto('/')

  // No onboarding, sign-in, or passkey banner: first launch lands in the app
  // and asks for the weight unit, the same as a new signed-in account.
  const unitSheet = page.getByRole('dialog', { name: 'Which unit do you lift in?' })
  await expect(unitSheet).toBeVisible()
  await expect(page.getByRole('button', { name: 'Register a passkey' })).toHaveCount(0)
  await expect(page.getByLabel('Email')).toHaveCount(0)
  await unitSheet.getByRole('button', { name: 'lb' }).click()
  await expect(unitSheet).toHaveCount(0)

  // The empty-state welcome, then create an exercise.
  const name = `Local Mode Press ${Date.now()}`
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
  await goTo(page, 'Exercises')
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(name)
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.locator('.row-wrap', { hasText: name })).toBeVisible()

  // Both the exercise and the unit survive a reload (SQLite saved to
  // IndexedDB through jeep-sqlite), and there's no web push button (the
  // phone's own notifications stand in, #78: e2e/local-rest-alerts.spec.ts).
  await page.reload()
  await goTo(page, 'Exercises')
  await expect(page.locator('.row-wrap', { hasText: name })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enable rest timer alerts' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Which unit do you lift in?' })).toHaveCount(0)
})

test('the Account sheet has no sign-in parts and offers Erase all data', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()

  // Issue #98: the third row is "Reset & erase" here, not "Account & privacy".
  const data = await openAccountSection(page, 'Your data')
  await expect(data.getByRole('button', { name: 'Back up my data' })).toBeVisible()
  await data.getByRole('button', { name: 'Back to Account' }).click()
  const menu = page.getByRole('dialog', { name: 'Account', exact: true })
  await expect(menu.getByText('Signed in as')).toHaveCount(0)
  await expect(menu.getByRole('button', { name: /^Account & privacy/ })).toHaveCount(0)
  await expect(menu.getByRole('button', { name: /^Reset & erase/ })).toContainText('Clear your training data or start over')

  const erase = await openAccountSection(page, 'Reset & erase')
  await expect(erase.getByText('Signed in as')).toHaveCount(0)
  await expect(erase.getByRole('button', { name: 'Sign out' })).toHaveCount(0)
  await expect(erase.getByRole('button', { name: 'Delete account' })).toHaveCount(0)
  await expect(erase.getByRole('button', { name: 'Reset my data' })).toBeVisible()
  await expect(erase.getByText('passkey')).toHaveCount(0)

  await erase.getByRole('button', { name: 'Erase all data' }).click()
  const confirm = page.getByRole('dialog', { name: 'Erase all data?' })
  await expect(confirm.getByText('Settings, like your weight unit')).toBeVisible()
  const eraseButton = confirm.getByRole('button', { name: 'Erase all data' })
  await expect(eraseButton).toBeDisabled()
  await confirm.getByLabel('Type ERASE to confirm').fill('DELETE')
  await expect(eraseButton).toBeDisabled()
  await confirm.getByLabel('Type ERASE to confirm').fill(' Erase')
  await expect(eraseButton).toBeEnabled()
})

async function addExercise(page: Page, name: string) {
  await goTo(page, 'Exercises')
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(name)
  await pickMuscleGroup(page)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.locator('.row-wrap', { hasText: name })).toBeVisible()
}

// Issue #77: reset and erase run on the device's own data.
test('Reset my data clears local training data and keeps the weight unit', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'kg' }).click()
  await addExercise(page, 'Local Reset Row')

  await (await openAccountSection(page, 'Reset & erase')).getByRole('button', { name: 'Reset my data' }).click()
  const confirm = page.getByRole('dialog', { name: 'Reset your data?' })
  const resetButton = confirm.getByRole('button', { name: 'Reset my data' })
  await confirm.getByLabel('Type RESET to confirm').fill('RE SET')
  await expect(resetButton).toBeDisabled()
  await confirm.getByLabel('Type RESET to confirm').fill('reset ')
  await expect(resetButton).toBeEnabled()
  await resetButton.click()
  await expect(confirm).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)

  await goTo(page, 'Exercises')
  await expect(page.locator('.row-wrap', { hasText: 'Local Reset Row' })).toHaveCount(0)
  // Still kg, so the unit sheet doesn't come back, even after a reload.
  await page.reload()
  await goTo(page, 'Exercises')
  await expect(page.locator('.row-wrap', { hasText: 'Local Reset Row' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Which unit do you lift in?' })).toHaveCount(0)
})

// Issue #315: Reset leaves every preference exactly as it was.
for (const rest of ['', '75']) {
  test(`Reset my data keeps the weight unit and a ${rest ? `${rest} s` : 'blank'} default rest timer`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'kg' }).click()

    const prefs = await openAccountSection(page, 'Preferences')
    await prefs.getByLabel('Default rest timer').fill(rest)
    await prefs.getByLabel('Default rest timer').blur()
    await prefs.getByRole('button', { name: 'Close' }).click()

    await (await openAccountSection(page, 'Reset & erase')).getByRole('button', { name: 'Reset my data' }).click()
    const confirm = page.getByRole('dialog', { name: 'Reset your data?' })
    await confirm.getByLabel('Type RESET to confirm').fill('RESET')
    await confirm.getByRole('button', { name: 'Reset my data' }).click()
    await expect(confirm).toHaveCount(0)

    await page.reload()
    const after = await openAccountSection(page, 'Preferences')
    await expect(after.getByLabel('Default rest timer')).toHaveValue(rest)
    await expect(after.getByRole('button', { name: 'kg', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })
}

test('Erase all data starts the app over like a first launch', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await addExercise(page, 'Local Erase Row')

  await (await openAccountSection(page, 'Reset & erase')).getByRole('button', { name: 'Erase all data' }).click()
  const confirm = page.getByRole('dialog', { name: 'Erase all data?' })
  await confirm.getByLabel('Type ERASE to confirm').fill('ERASE')
  await confirm.getByRole('button', { name: 'Erase all data' }).click()

  // The unit is unasked again, and nothing is left, after a reload too.
  const unitSheet = page.getByRole('dialog', { name: 'Which unit do you lift in?' })
  await expect(unitSheet).toBeVisible()
  await expect(confirm).toHaveCount(0)
  await page.reload()
  await expect(unitSheet).toBeVisible()
  await unitSheet.getByRole('button', { name: 'lb' }).click()
  await expect(page.getByText('Welcome to RepBunny')).toBeVisible()
  await goTo(page, 'Exercises')
  await expect(page.locator('.row-wrap', { hasText: 'Local Erase Row' })).toHaveCount(0)
})

// The native apps draw under the status bar. Capacitor's SystemBars sets
// --safe-area-inset-top on Android; the header must start below it.
test('the Account button sits below the status bar inset', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  const account = page.getByRole('button', { name: 'Account' })
  const before = (await account.boundingBox())!

  await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-inset-top', '48px'))
  await expect.poll(async () => (await account.boundingBox())!.y).toBe(before.y + 48)
  expect(before.y).toBeGreaterThanOrEqual(0)
})

// #827: scrolled content must not show through the status bar area.
test('a backdrop covers the status bar inset and has no height without one', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  const backdrop = page.locator('.status-bar-backdrop')
  expect((await backdrop.boundingBox())?.height ?? 0).toBe(0)

  await page.evaluate(() => document.documentElement.style.setProperty('--safe-area-inset-top', '47px'))
  await expect.poll(async () => (await backdrop.boundingBox())!.height).toBe(47)
  const box = (await backdrop.boundingBox())!
  expect(box.y).toBe(0)
  const colors = await page.evaluate(() => ({
    backdrop: getComputedStyle(document.querySelector('.status-bar-backdrop')!).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }))
  expect(colors.backdrop).not.toBe('rgba(0, 0, 0, 0)')
  expect(colors.backdrop).toBe(colors.body)

  // It is the topmost thing in the strip, so scrolled content sits behind it.
  await page.evaluate(() => window.scrollTo(0, 400))
  const topClass = await page.evaluate(() => document.elementFromPoint(100, 10)?.className)
  expect(topClass).toContain('status-bar-backdrop')
})
