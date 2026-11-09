type PurchasesModule = typeof import('@capgo/native-purchases')

// Resolves to a wrapper object, never the plugin itself: Capacitor's plugin
// proxy answers every property, `.then` included, with a native call, so an
// async function returning it rejects with "NativePurchases.then() is not
// implemented" (#312).
export async function loadPurchasesPlugin(
  load: () => Promise<Pick<PurchasesModule, 'NativePurchases'>> = () => import('@capgo/native-purchases'),
) {
  return { native: (await load()).NativePurchases }
}
