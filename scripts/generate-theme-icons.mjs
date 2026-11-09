// Generates the alternate app icons, one per theme (#145).
//   node scripts/generate-theme-icons.mjs
// Each icon is public/icon-512.png recolored from that theme's tokens in
// src/lib/theme.ts (mockup: docs/design/issue-145-app-icons.html, option A,
// reworked by #840 to a bigger bunny on a full-bleed tile, no ring): the tile
// takes --bg, the bunny --accent, the inner ears and face --text on dark themes
// or white on light ones, and the nose a color from NOSES below. Classic is the
// icon itself. The Halloween and Autumn themes get none: their seasonal icons
// (#841) took their place (#861).
//
// A theme with art in docs/design/art/app-icons/themes/<id>-bg.webp (#863;
// design: docs/design/issue-863-theme-icons.png) gets the same bunny in front
// of that art instead of the flat tile, drawn and written like the seasonal
// icons by scripts/lib/art-icon.mjs (WebP picker and Android images, an art
// adaptive background). Classic stays flat on purpose, as the brand mark.
// The flat icons write:
// - public/app-icons/<id>.png, the Theme screen's picker images;
// - Android launcher sets ic_launcher_<id> (legacy, round, adaptive
//   foreground plus a background color and the adaptive XML) in
//   android/app/src/main/res, and DEV-badged ones in src/personal/res, like
//   scripts/generate-android-icons.mjs does for the main icon;
// - iPhone alternate icon sets ios/App/App/Assets.xcassets/<id>.appiconset
//   (#169), a flat 1024px RGB PNG each (scripts/lib/ios-icon.mjs).
// Classic's native sets are named rose (#861): the picker's Classic tile is an
// alternate icon that keeps the rose art all year, while its Default tile is
// the main launcher icon, which a store build can make seasonal (#857).
// A new theme gets its icon by re-running this; its activity-alias in
// AndroidManifest.xml and its name in project.pbxproj's
// ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES are added by hand.
//
// Renders with Playwright's Chromium canvas so it needs no image dependency.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iosIconPng, writeIosIconSet } from './lib/ios-icon.mjs'
import { bunnyLayer, writeArtIcon } from './lib/art-icon.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'public/icon-512.png')).toString('base64')
const artDir = join(root, 'docs/design/art/app-icons/themes')

// The nose stays the icon's own pink unless it would vanish into the face.
const NOSES = {
  'cotton-candy': '#f2a07a',
  chalk: '#e6c27a',
  'carrot-patch': '#f2879c',
  sunrise: '#f2879c',
}
const DEFAULT_NOSE = '#f2879c'

// The themes, read from src/lib/theme.ts's THEMES list.
function readThemes() {
  const text = readFileSync(join(root, 'src/lib/theme.ts'), 'utf8')
  const from = text.indexOf('export const THEMES')
  const list = text.slice(from, text.indexOf('\n]\n', from))
  return list
    .split(/\n  \{\n/)
    .slice(1)
    .map((block) => {
      const field = (re) => re.exec(block)?.[1]
      const token = (name) => field(new RegExp(`'--${name}': '(#[0-9a-f]{6})'`, 'i'))
      const id = field(/id: '([^']+)'/)
      return {
        id,
        scheme: field(/scheme: '(dark|light)'/),
        bg: token('bg'),
        text: token('text'),
        accent: token('accent'),
        nose: NOSES[id] ?? DEFAULT_NOSE,
        art: existsSync(join(artDir, `${id}-bg.webp`)) ? join(artDir, `${id}-bg.webp`) : null,
      }
    })
}

const allThemes = readThemes()
if (!allThemes.length || allThemes[0].id !== 'classic' || allThemes.some((t) => !t.id || !t.bg || !t.text || !t.accent)) {
  throw new Error('Could not read THEMES from src/lib/theme.ts')
}
const NO_ICON = new Set(['halloween', 'autumn', 'christmas', 'valentine', 'easter'])
const themes = allThemes.filter((t) => !NO_ICON.has(t.id))

// Legacy icon px and adaptive foreground px (108dp) per density.
const DENSITIES = {
  mdpi: [48, 108],
  hdpi: [72, 162],
  xhdpi: [96, 216],
  xxhdpi: [144, 324],
  xxxhdpi: [192, 432],
}
const PICKER_SIZE = 144

const browser = await chromium.launch()
const page = await browser.newPage()

// The 512px icon recolored for a theme, as base64 PNG (Classic unchanged).
const recolor = (theme) =>
  page.evaluate(
    async ({ source, theme }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${source}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 512
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      if (theme.id !== 'classic') {
        const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
        const mix = (a, b, w) => a.map((v, i) => v + (b[i] - v) * w)
        // The icon's flat colors (tile, bunny, cream, nose) and what
        // each becomes. Antialiased edges are a blend of two of them, so each
        // pixel is projected onto the nearest pair and blended the same way.
        const keys = [[217, 106, 127], [42, 24, 48], [248, 234, 216], [242, 135, 156]]
        const bg = hex(theme.bg)
        const dark = theme.scheme === 'dark'
        const targets = [
          bg,
          hex(theme.accent),
          dark ? hex(theme.text) : [255, 255, 255],
          hex(theme.nose),
        ]
        const image = ctx.getImageData(0, 0, 512, 512)
        const d = image.data
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue
          const p = [d[i], d[i + 1], d[i + 2]]
          let best = Infinity
          let color = p
          for (let a = 0; a < keys.length; a++) {
            for (let b = a + 1; b < keys.length; b++) {
              const ab = keys[b].map((v, k) => v - keys[a][k])
              const ap = p.map((v, k) => v - keys[a][k])
              const len = ab.reduce((s, v) => s + v * v, 0)
              const t = Math.max(0, Math.min(1, ab.reduce((s, v, k) => s + v * ap[k], 0) / len))
              const dist = keys[a].reduce((s, v, k) => s + (v + ab[k] * t - p[k]) ** 2, 0)
              if (dist < best) {
                best = dist
                color = mix(targets[a], targets[b], t)
              }
            }
          }
          d[i] = color[0]
          d[i + 1] = color[1]
          d[i + 2] = color[2]
        }
        ctx.putImageData(image, 0, 0)
      }
      return canvas.toDataURL('image/png').split(',')[1]
    },
    { source, theme },
  )

// One size and shape of an icon, as base64 PNG; same shapes as
// generate-android-icons.mjs. kind 'color' returns the tile color instead.
const render = (icon, opts) =>
  page.evaluate(
    async ({ icon, size, kind, badge }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${icon}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')

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
        const s = size
        ctx.drawImage(img, (size - s) / 2, (size - s) / 2, s, s)
      } else if (kind === 'foreground') {
        const s = size * (72 / 108)
        ctx.drawImage(img, (size - s) / 2, (size - s) / 2, s, s)
      } else {
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, size, size)
      }

      if (badge) {
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
    { icon, ...opts },
  )

const png = (base64) => Buffer.from(base64, 'base64')
mkdirSync(join(root, 'public/app-icons'), { recursive: true })
const colors = []

// The flat icon's files, which an art icon's WebP ones replace (Android won't
// build with two images of one name).
const removeFlat = (name, id) => {
  const files = [join(root, `public/app-icons/${id}.png`)]
  for (const resDir of ['android/app/src/main/res', 'android/app/src/personal/res']) {
    for (const density of Object.keys(DENSITIES)) {
      for (const suffix of ['', '_round', '_foreground']) files.push(join(root, resDir, `mipmap-${density}`, `${name}${suffix}.png`))
    }
  }
  for (const file of files) rmSync(file, { force: true })
}

for (const theme of themes) {
  if (theme.art) {
    removeFlat(`ic_launcher_${theme.id.replace(/-/g, '_')}`, theme.id)
    // The same colors recolor gives the flat bunny.
    const bunny = await bunnyLayer(page, {
      bunny: theme.accent,
      cream: theme.scheme === 'dark' ? theme.text : '#ffffff',
      nose: theme.nose,
    })
    await writeArtIcon(page, { id: theme.id, bunny, art: theme.art })
    continue
  }
  const icon = await recolor(theme)
  writeFileSync(join(root, `public/app-icons/${theme.id}.png`), png(await render(icon, { size: PICKER_SIZE, kind: 'legacy' })))
  const id = theme.id === 'classic' ? 'rose' : theme.id
  writeIosIconSet(id, await iosIconPng(page, `data:image/png;base64,${icon}`))

  const name = `ic_launcher_${id.replace(/-/g, '_')}`
  colors.push([name, await render(icon, { size: 1, kind: 'color' })])
  for (const [resDir, badge] of [
    ['android/app/src/main/res', false],
    ['android/app/src/personal/res', true],
  ]) {
    for (const [density, [legacy, adaptive]] of Object.entries(DENSITIES)) {
      const dir = join(root, resDir, `mipmap-${density}`)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${name}.png`), png(await render(icon, { size: legacy, kind: 'legacy', badge })))
      writeFileSync(join(dir, `${name}_round.png`), png(await render(icon, { size: legacy, kind: 'round', badge })))
      writeFileSync(join(dir, `${name}_foreground.png`), png(await render(icon, { size: adaptive, kind: 'foreground', badge })))
    }
  }
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/${name}_background"/>\n    <foreground android:drawable="@mipmap/${name}_foreground"/>\n</adaptive-icon>\n`
  const anydpi = join(root, 'android/app/src/main/res/mipmap-anydpi-v26')
  writeFileSync(join(anydpi, `${name}.xml`), adaptiveXml)
  writeFileSync(join(anydpi, `${name}_round.xml`), adaptiveXml)
}

writeFileSync(
  join(root, 'android/app/src/main/res/values/app_icons.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by scripts/generate-theme-icons.mjs (#145). -->\n<resources>\n${colors
    .map(([name, color]) => `    <color name="${name}_background">${color.toUpperCase()}</color>\n`)
    .join('')}</resources>\n`,
)

await browser.close()
console.log(`Theme icons written: ${themes.map((t) => t.id).join(', ')}.`)
