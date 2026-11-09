// Renders a title card (cards/intro.html or cards/outro.html, #424) to JPEG
// frames at 30fps. The card's CSS animations are paused and stepped by setting
// each one's currentTime, so the render is exact however slow the machine is.
// Pages are served from the repo root under http://card.local/, so the cards
// load the site's fonts and art by their /site/... paths.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const FPS = 30
const TYPES = { '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' }

// Serves the repo root under http://card.local/ for a browser context, refusing any path outside it.
export function serveRepo(context) {
  return context.route('http://card.local/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '')
    const file = resolve(path)
    if (!file.startsWith(resolve('.'))) return route.abort()
    route.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] ?? 'application/octet-stream' })
  })
}

// words: [line 1, line 2]; bg: repo-relative path of the frame behind the card
// (or null); extra: any other query parameters the card takes (concept.html's).
// Returns { duration, sounds: [[name, seconds]], pattern } with frames at `pattern`.
export async function renderCard(browser, name, words, bg, outDir, extra = {}) {
  const context = await browser.newContext({ viewport: { width: 480, height: 1040 }, deviceScaleFactor: 1 })
  await serveRepo(context)
  const page = await context.newPage()
  const q = new URLSearchParams({ a: words[0], b: words[1], ...extra })
  if (bg) q.set('bg', `/${bg.replaceAll('\\', '/')}`)
  await page.goto(`http://card.local/scripts/demo-video/cards/${name}.html?${q}`)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})))
    for (const a of document.getAnimations()) a.pause()
  })
  const card = await page.evaluate(() => window.CARD)

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  const count = Math.round(card.duration * FPS)
  for (let i = 0; i < count; i++) {
    await page.evaluate((ms) => {
      for (const a of document.getAnimations()) a.currentTime = ms
    }, (i * 1000) / FPS)
    writeFileSync(join(outDir, `${String(i).padStart(4, '0')}.jpg`), await page.screenshot({ type: 'jpeg', quality: 92 }))
  }
  await context.close()
  return { duration: count / FPS, sounds: card.sounds, pattern: join(outDir, '%04d.jpg') }
}
