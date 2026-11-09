# Architecture: the retired PWA shell and rest timer push

> Part of the architecture reference; index at `docs/architecture.md`.

## Retired (#939)

The PWA shell is gone: no service worker, no web app manifest, no install hint, and no web push.
#937 retired the PWA, and its steps removed Supabase mode and sign-in (#938), then this shell
(#939). The web build now exists only as the bundle the native apps ship, plus the local-mode
browser build the e2e suite and `npm run dev` run.

What went with it:

- `src/sw.ts` (app-shell precache, the navigation fallback, the theme art cache, and the <!-- docs-refs: ignore -->
  `push` and `notificationclick` handlers), `tsconfig.sw.json`, `vite-plugin-pwa` and the <!-- docs-refs: ignore -->
  `workbox-*` packages, and the `registerSW` call in `src/main.ts`.
- The manifest and its icons (`public/icon-192.png`, the push badge `public/badge-96.png`, <!-- docs-refs: ignore -->
  `public/apple-touch-icon.png`) and the iOS home-screen meta tags in `index.html`. <!-- docs-refs: ignore -->
  `public/icon-512.png` stays: it's the source for the Android, iPhone, and theme icon scripts.
  `scripts/generate-web-icons.mjs` now writes the site's `apple-touch-icon.png` straight to `site/`.
- The `rest-timer-notify` Edge Function and its unit spec. The `push_subscriptions` table and
  its SQL went with the backend in #940; the build's public VAPID key goes when the owner clears
  the Codemagic group (#941).
- Theme art's fetch-ahead (`cacheOutfitArt`) and the `__THEME_ART_VERSION__` cache key. The
  native apps bundle every theme's art, so there's nothing to download.

Rest timer alerts are the phone's own notifications (`docs/architecture/native-apps.md`, #78),
and the in-app rest screen is unchanged.

## Rest timer screen

`RestTimer.vue` is a full-screen countdown shown in-app (backlog item 28): mascot art, a
draining progress bar, and a Skip Rest button, driven by a fixed `endsAt` timestamp rather than
a plain decrementing timer. The rest store (`src/stores/rest.ts`, issue #80) keeps the rest
going when the person leaves Home, so it shows as a bar on every tab. Issue #429: under
-15s/+15s, one line names where the time came from (the exercise's own rest or the Account
default) with links to change it (the screen minimizes while the exercise form or Account is
open and comes back after), "Keep" after an adjustment saves it as the exercise's rest, and the
first rest a device ever shows gets a one-time tip (localStorage `rb-rest-tip-seen`).
