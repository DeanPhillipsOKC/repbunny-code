import { test, expect, type Page } from '@playwright/test'

// Issue #455: while the store is being reached the Unlock button says so, and a
// Play billing setup timeout reads as "Couldn't reach Google Play" on the open
// sheet (button stays available as Try again) or as a toast if the sheet closed.

test.use({ viewport: { width: 375, height: 800 } })

async function setup(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await page.evaluate(async () => {
    const { setPremiumStore, playBillingStore } = await window.__rbImport('/src/lib/premiumStore.ts')
    const w = window as unknown as { releaseFail: () => void }
    const { setPurchasesPluginLoader } = await window.__rbImport('/src/lib/premiumStore.ts')
    const native = {
      purchaseProduct: () =>
        new Promise((_, reject) => {
          w.releaseFail = () => reject(new Error('BILLING_SETUP_TIMEOUT'))
        }),
      restorePurchases: async () => {},
      getProduct: async () => { throw new Error('BILLING_SETUP_TIMEOUT') },
      getPurchases: async () => ({ purchases: [] }),
    }
    setPurchasesPluginLoader((async () => ({ native })) as never)
    setPremiumStore(playBillingStore)
    const { openPremiumSheet } = await window.__rbImport('/src/lib/premium.ts')
    openPremiumSheet('plates')
  })
}

// The hook is set when the app calls purchaseProduct, a beat after the button
// shows its progress state (#526), so wait for it.
async function failPurchase(page: Page) {
  await page.waitForFunction(() => typeof (window as unknown as { releaseFail?: () => void }).releaseFail === 'function')
  await page.evaluate(() => (window as unknown as { releaseFail: () => void }).releaseFail())
}

test('shows progress, then the unreachable message, with Unlock still available', async ({ page }) => {
  await setup(page)
  const sheet = page.getByRole('dialog', { name: 'Premium' })
  await sheet.getByRole('button', { name: 'Unlock Premium' }).click()
  const connecting = sheet.getByRole('button', { name: /^Connecting to / })
  await expect(connecting).toBeDisabled()
  await expect(sheet.getByRole('button', { name: 'Restore Purchases' })).toBeDisabled()
  await failPurchase(page)
  await expect(sheet.getByRole('alert')).toContainText("Couldn't reach")
  await expect(sheet.getByRole('button', { name: 'Unlock Premium' })).toBeEnabled()
})

test('a failure after the sheet closed shows a toast', async ({ page }) => {
  await setup(page)
  const sheet = page.getByRole('dialog', { name: 'Premium' })
  await sheet.getByRole('button', { name: 'Unlock Premium' }).click()
  await sheet.getByRole('button', { name: 'Not now' }).click()
  await expect(sheet).toBeHidden()
  await failPurchase(page)
  await expect(page.getByRole('status').filter({ hasText: "Couldn't reach" })).toBeVisible()
})
