// Issue #101: what changed, for the What's new sheet and the one-time banner
// on Home. One entry per day, newest first. `build` is the build number
// (`git rev-list --count`) of that day's last user-facing change, and drives
// the "new since you last looked" check (src/lib/whatsNew.ts).
//
// Issue #558: the notes themselves are files, one per change, under
// release-notes/ (`release-notes/<issue>.json`), so lanes never conflict on a
// shared list. scripts/lib/release-notes.mjs reads them and dates each from
// the commit that added it; vite.config.ts bakes the result in here.
//
// Only changes a user would notice go in: new features, visible behavior
// changes, and fixes to bugs a user could have hit. Never tests, tooling,
// refactors, docs, or catch-alls like "Improved reliability". A day with
// nothing user-facing has no entry. See docs/architecture.md "What's new".
//
// Issue #102: an item can link a how-to guide on repbunny.app. `guide` is the
// guide's folder under site/guides/ ("rest-timer/"), shown as "How to use it"
// after the text. Only new features that need steps get one.
//
// Issue #216: `platforms` marks an item that only applies to some of the apps
// (`['android']` for Android widgets; `'pwa'` marks old notes in the archive
// for the retired web app, #939).
// scripts/collect-release-notes.mjs leaves it out of the store notes for the
// other apps. An item without it goes everywhere.
//
// Issue #887: `theme` is a theme id from src/lib/theme.ts ("halloween") on the
// note that ships a new theme. The one-time banner then shows that note and a
// Try it button that applies or previews the theme.
export type Platform = 'pwa' | 'ios' | 'android'

export type ReleaseNoteItem = string | { text: string; guide?: string; platforms?: Platform[]; theme?: string }

export type ReleaseNote = {
  date: string
  build: number
  items: ReleaseNoteItem[]
  // Each item's own build, parallel to `items` (#610); store notes filter on it.
  builds?: number[]
}

// Node (the e2e unit specs) has no Vite define: call loadReleaseNotes() from
// scripts/lib/release-notes.mjs there instead.
export const releaseNotes: ReleaseNote[] = typeof __RELEASE_NOTES__ === 'undefined' ? [] : __RELEASE_NOTES__
