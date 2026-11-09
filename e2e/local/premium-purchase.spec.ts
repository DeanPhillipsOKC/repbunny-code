import { test, expect, type Page } from '@playwright/test'
import { accountMenu } from '../fixtures/account'

// Issue #105: buying and restoring Premium go through lib/premiumStore.ts.
// The browser has no App Store, so these specs install a fake store and open
// the sheet through the dev server's modules (nothing is on `window`).

test.use({ viewport: { width: 375, height: 800 } })

type Plan = { purchase?: 'purchased' | 'cancelled' | 'pending' | 'fail'; restore?: boolean; owned?: boolean | 'error'; price?: string | null }

async function installFakeStore(page: Page, plan: Plan) {
  await page.evaluate(async (plan) => {
    const { setPremiumStore } = await window.__rbImport('/src/lib/premiumStore.ts')
    setPremiumStore({
      getPrice: async () => plan.price ?? null,
      purchase: async () => {
        if (plan.purchase === 'fail') throw new Error('The purchase failed in the fake store.')
        return plan.purchase ?? 'purchased'
      },
      restore: async () => plan.restore ?? false,
      hasEntitlement: async () => {
        if (plan.owned === 'error') throw new Error('store down')
        return plan.owned ?? false
      },
    })
  }, plan)
}

async function openSheet(page: Page) {
  await page.evaluate(async () => {
    const { openPremiumSheet } = await window.__rbImport('/src/lib/premium.ts')
    openPremiumSheet('plates')
  })
  const sheet = page.getByRole('dialog', { name: 'Premium' })
  await expect(sheet).toBeVisible()
  return sheet
}

async function start(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
}

async function isUnlocked(page: Page) {
  return page.evaluate(async () => (await window.__rbImport('/src/lib/premium.ts')).isPremium.value)
}

test('Unlock buys Premium and shows the store price on the button', async ({ page }) => {
  await start(page)
  await installFakeStore(page, { purchase: 'purchased', price: '$9.99' })
  const sheet = await openSheet(page)
  const unlock = sheet.getByRole('button', { name: 'Unlock Premium' })
  await expect(unlock).toContainText('$9.99')
  await unlock.click()
  await expect(sheet).toHaveCount(0)
  expect(await isUnlocked(page)).toBe(true)
})

test('Unlock button has no price when the store has none', async ({ page }) => {
  await start(page)
  await installFakeStore(page, { purchase: 'cancelled', price: null })
  const sheet = await openSheet(page)
  await expect(sheet.getByRole('button', { name: 'Unlock Premium', exact: true })).toBeVisible()
})

test('a cancelled purchase leaves Premium locked with no error', async ({ page }) => {
  await start(page)
  await installFakeStore(page, { purchase: 'cancelled' })
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: 'Unlock Premium' }).click()
  await expect(sheet.getByRole('button', { name: 'Unlock Premium' })).toBeEnabled()
  await expect(sheet.getByRole('alert')).toHaveCount(0)
  await expect(sheet).toBeVisible()
  expect(await isUnlocked(page)).toBe(false)
})

test('a failed purchase shows what went wrong and stays locked', async ({ page }) => {
  await start(page)
  await installFakeStore(page, { purchase: 'fail' })
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: 'Unlock Premium' }).click()
  await expect(sheet.getByRole('alert')).toContainText('The purchase failed in the fake store.')
  expect(await isUnlocked(page)).toBe(false)
})

test('Restore Purchases in the sheet unlocks with a prior purchase and says so without one', async ({ page }) => {
  await start(page)
  await installFakeStore(page, { restore: false })
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: 'Restore Purchases' }).click()
  await expect(sheet.getByRole('status')).toContainText('No Premium purchase was found for this Apple ID.')
  expect(await isUnlocked(page)).toBe(false)

  await installFakeStore(page, { restore: true })
  await sheet.getByRole('button', { name: 'Restore Purchases' }).click()
  await expect(sheet).toHaveCount(0)
  expect(await isUnlocked(page)).toBe(true)
})

test('opening the sheet on an account that already owns Premium unlocks it, closes, and toasts', async ({ page }) => {
  await start(page)
  await installFakeStore(page, { owned: true })
  await page.evaluate(async () => {
    const { openPremiumSheet } = await window.__rbImport('/src/lib/premium.ts')
    openPremiumSheet('plates')
  })
  await expect(page.getByRole('dialog', { name: 'Premium' })).toHaveCount(0)
  await expect(page.getByText('Premium is already yours on this Apple ID.')).toBeVisible()
  expect(await isUnlocked(page)).toBe(true)
})

test('a store error on open leaves the sheet as it is, with no message, and the caption shows', async ({ page }) => {
  await start(page)
  await installFakeStore(page, { owned: 'error' })
  const sheet = await openSheet(page)
  await expect(sheet.getByText('Bought Premium on another phone? Restore checks your Apple ID.')).toBeVisible()
  await expect(sheet.getByRole('alert')).toHaveCount(0)
  await expect(sheet.getByRole('status')).toHaveCount(0)
  await expect(sheet).toBeVisible()
  expect(await isUnlocked(page)).toBe(false)
})

test('Account: Restore Purchases and Unlock work, and none found is said plainly', async ({ page }) => {
  await start(page)
  await installFakeStore(page, { restore: false, purchase: 'purchased', price: '$9.99' })
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const group = accountMenu(page).getByRole('group', { name: 'Premium' })
  await expect(group.getByRole('button', { name: 'Unlock Premium' })).toContainText('$9.99')
  await group.getByRole('button', { name: 'Restore Purchases' }).click()
  await expect(group.getByRole('status')).toContainText('No Premium purchase was found for this Apple ID.')

  await installFakeStore(page, { restore: true })
  await group.getByRole('button', { name: 'Restore Purchases' }).click()
  await expect(group).toContainText('Premium is unlocked')
})

test('the launch re-check follows StoreKit both ways and fails open', async ({ page }) => {
  await start(page)
  const run = (plan: 'owned' | 'none' | 'error') =>
    page.evaluate(async (plan) => {
      const { setPremiumStore } = await window.__rbImport('/src/lib/premiumStore.ts')
      const { refreshPremiumEntitlement, isPremium } = await window.__rbImport('/src/lib/premium.ts')
      setPremiumStore({
        getPrice: async () => null,
        purchase: async () => 'cancelled',
        restore: async () => false,
        hasEntitlement: async () => {
          if (plan === 'error') throw new Error('offline')
          return plan === 'owned'
        },
      })
      await refreshPremiumEntitlement()
      return isPremium.value
    }, plan)

  expect(await run('owned')).toBe(true)
  expect(await run('error')).toBe(true) // offline: the cached unlock stays
  expect(await run('none')).toBe(false) // a verified refund clears it
  expect(await run('error')).toBe(false)
})

test('a pending Play purchase says it is waiting for payment and stays locked', async ({ page }) => {
  await start(page)
  await installFakeStore(page, { purchase: 'pending' })
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: 'Unlock Premium' }).click()
  await expect(sheet.getByRole('status')).toContainText('Waiting for payment')
  await expect(sheet).toBeVisible()
  expect(await isUnlocked(page)).toBe(false)
})
