import { test, expect } from '@playwright/test'
import { loadPurchasesPlugin } from '../src/lib/purchasesPlugin'

// Issue #312: Capacitor's plugin proxy answers every property as a native
// call, so awaiting it (an async function returning it) probes `.then` and
// rejects. The loader must hand back a wrapper, never the proxy itself.

test('loadPurchasesPlugin resolves without probing .then on the plugin proxy', async () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') throw new Error('"NativePurchases.then()" is not implemented on android')
        return () => 'native-call'
      },
    },
  )
  const { native } = await loadPurchasesPlugin(async () => ({ NativePurchases: proxy as never }))
  expect(native).toBe(proxy)
})
