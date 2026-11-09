// Generates the app's favicons and the site icons from the 1024px app icon (#840).
//   node scripts/generate-web-icons.mjs
// Source: docs/design/art/app-icons/default-1024.png (the bunny on the rose tile,
// full bleed, no baked-in corners). Writes public/icon-512.png (the source for the
// Android, iPhone, and theme icon scripts), favicon-16x16.png, favicon-32x32.png,
// favicon.ico, the site's apple-touch-icon.png, and its copies of the favicons. Re-run the other generate-*-icons scripts after.
//
// Renders with Playwright's Chromium canvas so it needs no image dependency.
import { chromium } from 'playwright'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'docs/design/art/app-icons/default-1024.png')).toString('base64')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<canvas></canvas>')

// The source scaled to size px square, as a PNG buffer. Halving until the last
// step keeps small sizes (16 px favicon) crisp.
const scaled = async (size) =>
  Buffer.from(
    await page.evaluate(
      async ({ source, size }) => {
        let cur = new Image()
        cur.src = `data:image/png;base64,${source}`
        await cur.decode()
        let w = cur.width
        let src = cur
        while (w / 2 > size) {
          w = Math.round(w / 2)
          const c = document.createElement('canvas')
          c.width = c.height = w
          const x = c.getContext('2d')
          x.imageSmoothingQuality = 'high'
          x.drawImage(src, 0, 0, w, w)
          src = c
        }
        const out = document.createElement('canvas')
        out.width = out.height = size
        const ctx = out.getContext('2d')
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(src, 0, 0, size, size)
        return out.toDataURL('image/png').split(',')[1]
      },
      { source, size },
    ),
    'base64',
  )

// An .ico holding PNG images (supported since Vista).
const ico = (images) => {
  const head = Buffer.alloc(6 + images.length * 16)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(images.length, 4)
  let offset = head.length
  images.forEach(([size, data], i) => {
    const e = 6 + i * 16
    head[e] = size % 256
    head[e + 1] = size % 256
    head.writeUInt16LE(1, e + 4)
    head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(data.length, e + 8)
    head.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...images.map(([, d]) => d)])
}

const files = {
  'public/icon-512.png': await scaled(512),
  'site/apple-touch-icon.png': await scaled(180),
  'public/favicon-16x16.png': await scaled(16),
  'public/favicon-32x32.png': await scaled(32),
  'public/favicon.ico': ico([
    [48, await scaled(48)],
    [64, await scaled(64)],
  ]),
}
for (const [path, data] of Object.entries(files)) writeFileSync(join(root, path), data)
for (const name of ['favicon-32x32.png', 'favicon.ico']) {
  copyFileSync(join(root, 'public', name), join(root, 'site', name))
}

await browser.close()
console.log('Web icons written.')
