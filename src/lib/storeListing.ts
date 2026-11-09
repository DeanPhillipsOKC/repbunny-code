import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'

// Issue #726: Rate RepBunny and Share RepBunny rows on the Account sheet. Both
// open the store listing for the current platform, only on a tap, so they add
// no network request of their own. The web build has no listing, so it gets neither.
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.repbunny'
// Fill in once the app has an App Store ID; the iPhone rows stay hidden until then.
export const APP_STORE_URL = ''

export function storeListingUrl(platform = Capacitor.getPlatform()): string | null {
  if (platform === 'android') return PLAY_STORE_URL
  if (platform === 'ios') return APP_STORE_URL || null
  return null
}

export function shareMessage(url: string): string {
  return `I track my lifts in RepBunny. It keeps everything on my phone. ${url}`
}

// Opens the system share sheet. Resolves to false when the sheet was dismissed.
export async function shareApp(url: string): Promise<boolean> {
  try {
    await Share.share({ title: 'RepBunny', text: shareMessage(url), dialogTitle: 'Share RepBunny' })
    return true
  } catch (e) {
    if (/cancel|dismiss/i.test(e instanceof Error ? e.message : String(e))) return false
    throw e
  }
}
