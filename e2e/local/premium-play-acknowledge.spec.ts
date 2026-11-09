import { test, expect } from '@playwright/test'

// Issue #862: Play refunds a one-time purchase it never sees acknowledged, and
// the plugin's own acknowledge races its endConnection. The Play store
// acknowledges an unacknowledged Premium purchase itself, and waits for it.

type Purchase = { productIdentifier: string; purchaseState: string; isAcknowledged: boolean; purchaseToken: string }

async function runPlayStore(page: import('@playwright/test').Page, purchases: Purchase[], ackFails = false) {
  return page.evaluate(
    async ({ purchases, ackFails }) => {
      const { setPurchasesPluginLoader, playBillingStore } = await window.__rbImport('/src/lib/premiumStore.ts')
      const { setErrorSink } = await window.__rbImport('/src/lib/errorLog.ts')
      const logged: { message: string; context: Record<string, unknown> | null }[] = []
      setErrorSink({ insert: async (e: { message: string; context: Record<string, unknown> | null }) => { logged.push(e); return { error: null } } } as never)
      const acked: string[] = []
      const native = {
        purchaseProduct: async () => ({ transactionId: 'tok-new' }),
        restorePurchases: async () => {},
        getPurchases: async () => ({ purchases }),
        acknowledgePurchase: async ({ purchaseToken }: { purchaseToken: string }) => {
          acked.push(purchaseToken)
          if (ackFails) throw new Error('Failed to acknowledge purchase: Service disconnected')
        },
      }
      setPurchasesPluginLoader((async () => ({ native })) as never)
      const owned = await playBillingStore.hasEntitlement()
      const ackedOnCheck = [...acked]
      const purchased = await playBillingStore.purchase()
      const ackedOnPurchase = acked.slice(ackedOnCheck.length)
      setPurchasesPluginLoader(null)
      await new Promise((r) => setTimeout(r, 50))
      return { owned, purchased, ackedOnCheck, ackedOnPurchase, logged }
    },
    { purchases, ackFails },
  )
}

test('an unacknowledged Premium purchase is acknowledged on the entitlement check and after buying', async ({ page }) => {
  await page.goto('/')
  const result = await runPlayStore(page, [
    { productIdentifier: 'premium_unlock', purchaseState: '1', isAcknowledged: false, purchaseToken: 'tok-new' },
    { productIdentifier: 'premium_unlock', purchaseState: 'PURCHASED', isAcknowledged: true, purchaseToken: 'tok-old' },
    { productIdentifier: 'premium_unlock', purchaseState: '2', isAcknowledged: false, purchaseToken: 'tok-pending' },
    { productIdentifier: 'something_else', purchaseState: '1', isAcknowledged: false, purchaseToken: 'tok-other' },
  ])
  expect(result.owned).toBe(true)
  expect(result.purchased).toBe('purchased')
  expect(result.ackedOnCheck).toEqual(['tok-new'])
  expect(result.ackedOnPurchase).toEqual(['tok-new'])
  expect(result.logged).toEqual([])
})

test('an acknowledged purchase is left alone, and a failed acknowledge is logged without losing Premium', async ({ page }) => {
  await page.goto('/')
  const done = await runPlayStore(page, [
    { productIdentifier: 'premium_unlock', purchaseState: '1', isAcknowledged: true, purchaseToken: 'tok-old' },
  ])
  expect(done.owned).toBe(true)
  expect(done.ackedOnCheck).toEqual([])
  expect(done.ackedOnPurchase).toEqual([])

  const failing = await runPlayStore(
    page,
    [{ productIdentifier: 'premium_unlock', purchaseState: '1', isAcknowledged: false, purchaseToken: 'tok-new' }],
    true,
  )
  expect(failing.owned).toBe(true)
  expect(failing.purchased).toBe('purchased')
  expect(failing.ackedOnCheck).toEqual(['tok-new'])
  expect(failing.logged.map((e) => e.context?.operation)).toEqual(['premium.acknowledge', 'premium.acknowledge'])
  expect(failing.logged[0].message).toContain('Failed to acknowledge purchase')
})
