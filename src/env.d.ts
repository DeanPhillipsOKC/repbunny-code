/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Issue #76: 'local' runs the browser build on on-device data (src/lib/localMode.ts).
  readonly VITE_DATA?: string
  // Issue #104: 'true' unlocks Premium at build time (the personal Android build, #68).
  readonly VITE_PREMIUM_UNLOCKED?: string
  // Issue #784: 'true' shows the Premium (dev) rows in Account > Preferences (the personal Android build).
  readonly VITE_DEV_TOOLS?: string
  readonly VITE_IAP_PRODUCT_ID?: string
  // Issue #960: 'true' builds in the e2e suite's hooks (src/testHooks.ts). Only the e2e `local` project's build sets it.
  readonly VITE_E2E_HOOKS?: string
  // Issue #857: the store build's default icon, a season-* id (scripts/apply-default-icon.mjs).
  readonly VITE_DEFAULT_APP_ICON?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Injected by vite.config.ts via `define` — see scripts/lib/build-version.mjs
declare const __APP_VERSION__: string

// Issue #568: the how-to guides as data, built from site/guides/ by vite.config.ts.
declare module 'virtual:guide-index' {
  const guides: import('../scripts/lib/guide-index.mjs').GuideEntry[]
  export default guides
}

// Injected by vite.config.ts via `define`, from release-notes/ (#558) — see scripts/lib/release-notes.mjs
declare const __RELEASE_NOTES__: import('./lib/releaseNotes').ReleaseNote[]
