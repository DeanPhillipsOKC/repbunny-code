// Generates the Android launcher icons from public/icon-512.png (#68).
//   node scripts/generate-android-icons.mjs
// Writes the store icons to android/app/src/main/res and a "DEV"-badged set for
// the personal Obtainium build to android/app/src/personal/res, so the two can't
// be confused on the home screen. Re-run after changing icon-512.png.
//
// Renders with Playwright's Chromium canvas so it needs no image dependency.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'public/icon-512.png')).toString('base64')

// Legacy icon px and adaptive foreground px (108dp) per density.
const DENSITIES = {
  mdpi: [48, 108],
  hdpi: [72, 162],
  xhdpi: [96, 216],
  xxhdpi: [144, 324],
  xxxhdpi: [192, 432],
}

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<canvas></canvas>')

const render = (opts) =>
  page.evaluate(
    async ({ source, size, kind, badge }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${source}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')

      // The icon's tile colour, used as the adaptive icon background.
      const probe = document.createElement('canvas')
      probe.width = probe.height = 512
      probe.getContext('2d').drawImage(img, 0, 0)
      const [r, g, b] = probe.getContext('2d').getImageData(256, 24, 1, 1).data
      const tile = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
      if (kind === 'color') return tile

      if (kind === 'round') {
        ctx.beginPath()
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.fillStyle = tile
        ctx.fillRect(0, 0, size, size)
        // The tile is full bleed, so no scaling: the bunny sits inside the circle.
        const s = size
        ctx.drawImage(img, (size - s) / 2, (size - s) / 2, s, s)
      } else if (kind === 'foreground') {
        // Adaptive icons mask to the middle 72 of 108dp; the tile matches the
        // background colour, so its own corners never show.
        const s = size * (72 / 108)
        ctx.drawImage(img, (size - s) / 2, (size - s) / 2, s, s)
      } else {
        ctx.drawImage(img, 0, 0, size, size)
      }

      if (badge) {
        // Badge sits low, inside the adaptive safe zone (middle 66 of 108dp).
        const unit = kind === 'foreground' ? size / 108 : size / 72
        const w = 30 * unit
        const h = 12 * unit
        const x = (size - w) / 2
        const y = kind === 'foreground' ? size / 2 + 21 * unit : size - h - 5 * unit
        ctx.fillStyle = '#F5C542'
        ctx.strokeStyle = tile
        ctx.lineWidth = 1.5 * unit
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, h / 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#17111C'
        ctx.font = `800 ${9 * unit}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('DEV', size / 2, y + h / 2 + 0.5 * unit)
      }
      return canvas.toDataURL('image/png').split(',')[1]
    },
    { source, ...opts },
  )

const tile = await render({ size: 1, kind: 'color', badge: false })

for (const [resDir, badge] of [
  ['android/app/src/main/res', false],
  ['android/app/src/personal/res', true],
]) {
  for (const [density, [legacy, adaptive]] of Object.entries(DENSITIES)) {
    const dir = join(root, resDir, `mipmap-${density}`)
    mkdirSync(dir, { recursive: true })
    const write = async (name, size, kind) =>
      writeFileSync(join(dir, name), Buffer.from(await render({ size, kind, badge }), 'base64'))
    await write('ic_launcher.png', legacy, 'legacy')
    await write('ic_launcher_round.png', legacy, 'round')
    await write('ic_launcher_foreground.png', adaptive, 'foreground')
  }
}

writeFileSync(
  join(root, 'android/app/src/main/res/values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${tile.toUpperCase()}</color>\n</resources>\n`,
)

await browser.close()
console.log(`Icons written (background ${tile}).`)
