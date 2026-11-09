import { test, expect, startLocal } from '../fixtures/local'
import type { Page } from '@playwright/test'
import { accountMenu } from '../fixtures/account'

// Issue #506: a "Redeem a code" link beside Restore Purchases opens the
// store's own redeem screen (Google Play only). Back in the app, the same
// check as Restore runs, so a redeemed code unlocks Premium without a tap.
// The browser has no store, so these specs install a fake one, with or
// without a redeem page.

test.use({ viewport: { width: 375, height: 800 } })

const REDEEM_URL = 'https://play.google.com/redeem'

async function installFakeStore(page: Page, plan: { redeemUrl?: string; restore?: boolean; ownedCheckFails?: boolean }) {
  await page.evaluate(async (plan) => {
    const { setPremiumStore } = await window.__rbImport('/src/lib/premiumStore.ts')
    setPremiumStore({
      getPrice: async () => '$9.99',
      purchase: async () => 'cancelled',
      restore: async () => plan.restore ?? false,
      hasEntitlement: async () => {
        if (plan.ownedCheckFails) throw new Error('store down')
        return false
      },
      redeemUrl: plan.redeemUrl,
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

async function isUnlocked(page: Page) {
  return page.evaluate(async () => (await window.__rbImport('/src/lib/premium.ts')).isPremium.value)
}

// Leaving for Play and coming back: the page becomes visible again.
async function returnToApp(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}

async function tapRedeem(page: Page, sheet: ReturnType<Page['getByRole']>) {
  await page.context().route(`${REDEEM_URL}**`, (route) => route.fulfill({ body: 'Play redeem' }))
  const link = sheet.getByRole('link', { name: 'Redeem a code' })
  await expect(link).toHaveAttribute('href', REDEEM_URL)
  const popup = page.waitForEvent('popup')
  await link.click()
  const play = await popup
  expect(play.url()).toContain(REDEEM_URL)
  await play.close()
}

test('Redeem a code opens Play, and a redeemed code unlocks Premium on return', async ({ page }) => {
  await startLocal(page, { premium: false })
  await installFakeStore(page, { redeemUrl: REDEEM_URL, restore: true })
  const sheet = await openSheet(page)
  await expect(sheet.getByRole('button', { name: 'Restore Purchases' })).toBeVisible()
  await tapRedeem(page, sheet)
  await returnToApp(page)
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText('Code redeemed. Premium is yours.')).toBeVisible()
  expect(await isUnlocked(page)).toBe(true)
})

test('coming back without redeeming leaves the sheet as it was, with no message', async ({ page }) => {
  await startLocal(page, { premium: false })
  await installFakeStore(page, { redeemUrl: REDEEM_URL, restore: false })
  const sheet = await openSheet(page)
  await tapRedeem(page, sheet)
  await returnToApp(page)
  await expect(sheet.getByRole('button', { name: 'Restore Purchases' })).toBeEnabled()
  await expect(sheet.getByRole('status')).toHaveCount(0)
  await expect(sheet.getByRole('alert')).toHaveCount(0)
  await expect(sheet.getByRole('link', { name: 'Redeem a code' })).toBeVisible()
  expect(await isUnlocked(page)).toBe(false)
})

test('no Redeem a code link on a store without a redeem page (iPhone, the PWA)', async ({ page }) => {
  await startLocal(page, { premium: false })
  await installFakeStore(page, {})
  const sheet = await openSheet(page)
  await expect(sheet.getByRole('button', { name: 'Restore Purchases' })).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Redeem a code' })).toHaveCount(0)
})

test('no Redeem a code link once Premium is unlocked', async ({ page }) => {
  await startLocal(page, { premium: true })
  // The launch re-check would clear the cached unlock on a "not owned"
  // answer; a store that can't answer keeps it, as an offline phone does.
  await installFakeStore(page, { redeemUrl: REDEEM_URL, ownedCheckFails: true })
  const sheet = await openSheet(page)
  await expect(sheet.getByRole('button', { name: 'Restore Purchases' })).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Redeem a code' })).toHaveCount(0)
  expect(await isUnlocked(page)).toBe(true)
})

// #531: the Account sheet's Premium card renders the same unlock component.
async function openAccountPremium(page: Page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  return accountMenu(page).getByRole('group', { name: 'Premium' })
}

test('Account card: Redeem a code sits beside Restore, and a redeemed code unlocks Premium on return', async ({ page }) => {
  await startLocal(page, { premium: false })
  await installFakeStore(page, { redeemUrl: REDEEM_URL, restore: true })
  const group = await openAccountPremium(page)
  await expect(group.getByRole('button', { name: 'Restore Purchases' })).toBeVisible()
  await tapRedeem(page, group)
  await returnToApp(page)
  await expect(group).toContainText('Premium is unlocked')
  await expect(group.getByRole('link', { name: 'Redeem a code' })).toHaveCount(0)
  expect(await isUnlocked(page)).toBe(true)
})

test('Account card: no Redeem a code link on a store without a redeem page', async ({ page }) => {
  await startLocal(page, { premium: false })
  await installFakeStore(page, {})
  const group = await openAccountPremium(page)
  await expect(group.getByRole('button', { name: 'Restore Purchases' })).toBeVisible()
  await expect(group.getByRole('link', { name: 'Redeem a code' })).toHaveCount(0)
})

test('Account card: no Redeem a code link once Premium is unlocked', async ({ page }) => {
  await startLocal(page, { premium: true })
  await installFakeStore(page, { redeemUrl: REDEEM_URL, ownedCheckFails: true })
  const group = await openAccountPremium(page)
  await expect(group).toContainText('Premium is unlocked')
  await expect(group.getByRole('link', { name: 'Redeem a code' })).toHaveCount(0)
})
