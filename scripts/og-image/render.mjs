// Renders scripts/og-image/card.html to site/og-image.png, the 1200x630 link preview that
// Facebook, LinkedIn, and messaging apps show for repbunny.app.
//   node scripts/og-image/render.mjs
// --play renders play-feature.html to logs/store-listing/play-feature-graphic.png instead,
// the 1024x500 Google Play feature graphic (#198). Upload it by hand in Play Console.
//   node scripts/og-image/render.mjs --play
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const play = process.argv.includes('--play')
const card = fileURLToPath(new URL(play ? './play-feature.html' : './card.html', import.meta.url))
const out = fileURLToPath(
  new URL(play ? '../../logs/store-listing/play-feature-graphic.png' : '../../site/og-image.png', import.meta.url),
)
const viewport = play ? { width: 1024, height: 500 } : { width: 1200, height: 630 }

mkdirSync(dirname(out), { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport })
await page.goto(pathToFileURL(card).href)
await page.evaluate(() => document.fonts.ready)
await page.waitForLoadState('networkidle')
await page.screenshot({ path: out })
await browser.close()
console.log(`Wrote ${out}`)
