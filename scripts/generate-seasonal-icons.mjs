// Generates the seasonal app icons (#841): the default icon's bunny, recolored,
// on a seasonal background from docs/design/art/app-icons/seasonal/.
//   node scripts/generate-seasonal-icons.mjs
// The drawing and every output (picker WebP, Android legacy, round, and
// adaptive sets, iPhone alternate icon set) are scripts/lib/art-icon.mjs's,
// shared with the theme icons that have art (#863). Each icon's
// activity-alias in AndroidManifest.xml and its name in project.pbxproj's
// ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES are added by hand.
//
// Renders with Playwright's Chromium canvas so it needs no image dependency.
import { chromium } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bunnyLayer, writeArtIcon } from './lib/art-icon.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const art = join(root, 'docs/design/art/app-icons/seasonal')

// Keep in step with SEASONAL_ICONS in src/lib/appIcon.ts.
const SEASONS = [
  { id: 'season-autumn', art: 'autumn-bg.webp', bunny: '#2a1830', cream: '#f8ead8', nose: '#e9a23b' },
  { id: 'season-halloween', art: 'halloween-bg.webp', bunny: '#2a1830', cream: '#f8ead8', nose: '#f28a2e' },
  { id: 'season-snow-globe', art: 'snow-globe-bg.webp', bunny: '#f2879c', cream: '#f8ead8', nose: '#dc8155' },
  { id: 'season-christmas', art: 'christmas-bg.webp', bunny: '#f2879c', cream: '#f8ead8', nose: '#dc8155' },
]

const browser = await chromium.launch()
const page = await browser.newPage()

for (const season of SEASONS) {
  const bunny = await bunnyLayer(page, season)
  await writeArtIcon(page, { id: season.id, bunny, art: join(art, season.art) })
}

await browser.close()
console.log(`Seasonal icons written: ${SEASONS.map((s) => s.id).join(', ')}.`)
