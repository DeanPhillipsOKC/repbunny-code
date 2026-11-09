import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { buildNumber } from './bugReport'

// Issue #1045: the stores and Obtainium show a version like 1.9.1, while the
// build-time id (`v970+3c6eae1`, scripts/lib/build-version.mjs) is internal.
// On native, App.getInfo().version is the installed versionName (Android) or
// CFBundleShortVersionString (iPhone). Its `build` isn't used: it is the
// store's own build number, not the internal one. Off native (the web build
// the e2e specs run) there is no store version and the display is unchanged.
let storeVersion: string | null = null

type InfoReader = () => Promise<{ version?: string }>

export async function loadStoreVersion(
  isNative: boolean = Capacitor.isNativePlatform(),
  read: InfoReader = () => App.getInfo(),
): Promise<string | null> {
  storeVersion = null
  if (!isNative) return null
  try {
    const version = (await read()).version
    storeVersion = typeof version === 'string' && version.trim() ? version.trim() : null
  } catch (e) {
    console.warn('Could not read the app version', e)
  }
  return storeVersion
}

export function getStoreVersion(): string | null {
  return storeVersion
}

// The Account sheet's Version row: "1.9.1 · build 970", or the internal id alone.
export function versionLabel(store: string | null, appVersion: string): string {
  const build = buildNumber(appVersion)
  if (!store) return appVersion
  return build === 'unknown' ? store : `${store} · build ${build}`
}

// The recovery screen's line: "RepBunny 1.9.1 (build 970)".
export function recoveryVersionLine(store: string | null, appVersion: string): string {
  const build = buildNumber(appVersion)
  if (!store) return `RepBunny ${appVersion}`
  return build === 'unknown' ? `RepBunny ${store}` : `RepBunny ${store} (build ${build})`
}

export const currentVersionLabel = () => versionLabel(storeVersion, __APP_VERSION__)
