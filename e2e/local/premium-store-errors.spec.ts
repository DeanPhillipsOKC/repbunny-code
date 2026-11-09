import { test, expect } from '@playwright/test'

// Issue #408: a store failure reaches the client error log with the plugin's
// own message, while the person still sees the generic text. Cancels add nothing.

test('purchase and restore failures are logged with the plugin message; cancels are not', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { setPurchasesPluginLoader, playBillingStore } = await window.__rbImport('/src/lib/premiumStore.ts')
    const { setErrorSink } = await window.__rbImport('/src/lib/errorLog.ts')
    const logged: { message: string; context: Record<string, unknown> | null }[] = []
    setErrorSink({ insert: async (e: { message: string; context: Record<string, unknown> | null }) => { logged.push(e); return { error: null } } } as never)
    let mode = 'cancel'
    const native = {
      purchaseProduct: async () => { throw new Error(mode === 'cancel' ? 'User cancelled' : 'Product not found: premium_unlock') },
      restorePurchases: async () => { throw new Error('Billing unavailable') },
      getProduct: async () => { throw new Error('Product not found: premium_unlock') },
      getPurchases: async () => ({ purchases: [] }),
    }
    setPurchasesPluginLoader((async () => ({ native })) as never)
    const messages: string[] = []
    await playBillingStore.purchase() // cancel
    const afterCancel = logged.length
    mode = 'fail'
    await playBillingStore.purchase().catch((e: Error) => messages.push(e.message))
    await playBillingStore.restore().catch((e: Error) => messages.push(e.message))
    await playBillingStore.getPrice()
    await playBillingStore.getPrice()
    await new Promise((r) => setTimeout(r, 50))
    return { afterCancel, messages, logged }
  })
  expect(result.afterCancel).toBe(0)
  expect(result.messages[0]).toContain("The purchase didn't go through")
  expect(result.messages[1]).toContain("Couldn't reach the store to restore")
  const ops = result.logged.map((e) => e.context?.operation)
  expect(ops).toEqual(['premium.purchase', 'premium.restore', 'premium.price'])
  expect(result.logged[0].message).toBe('Product not found: premium_unlock')
  expect(result.logged[1].message).toBe('Billing unavailable')
})
