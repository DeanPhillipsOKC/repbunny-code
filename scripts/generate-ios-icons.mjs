// Generates the iPhone app icon and launch screen from public/icon-512.png.
//   node scripts/generate-ios-icons.mjs
// Writes ios/App/App/Assets.xcassets: a full-bleed 1024px AppIcon (iOS rounds the
// corners itself) and solid launch images in the app's background colour, so the
// launch screen doesn't flash Capacitor's logo. Re-run after changing icon-512.png.
// The alternate theme and seasonal icons come from generate-theme-icons.mjs and
// generate-seasonal-icons.mjs (#169).
//
// App Store Connect rejects icons with an alpha channel, so every PNG is written
// as plain RGB (scripts/lib/ios-icon.mjs). Renders with Playwright's Chromium
// canvas so it needs no image dependency, like generate-android-icons.mjs.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IOS_ASSETS, encodeRgbPng, iosIconPng, writeIosIconSet } from './lib/ios-icon.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'public/icon-512.png')).toString('base64')
// Matches the PWA manifest's background_color (vite.config.ts).
const LAUNCH_BG = [0x17, 0x11, 0x1c]

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<canvas></canvas>')
writeIosIconSet('AppIcon', await iosIconPng(page, `data:image/png;base64,${source}`), 'AppIcon-512@2x.png')
await browser.close()

// Small solid tiles: the storyboard scales them to fill the screen.
const SPLASH = 64
const splash = Buffer.alloc(SPLASH * SPLASH * 3)
for (let j = 0; j < splash.length; j += 3) splash.set(LAUNCH_BG, j)
const splashPng = encodeRgbPng(SPLASH, SPLASH, splash)
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  writeFileSync(join(IOS_ASSETS, 'Splash.imageset', name), splashPng)
}

console.log('iOS icon and launch images written.')
