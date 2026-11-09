// App icons on background art (#841, #863): the default icon's bunny, recolored,
// in front of a full-bleed square of art. Used by generate-seasonal-icons.mjs
// and, for the theme icons that have art, generate-theme-icons.mjs, so both
// draw the art and the bunny the same way. writeArtIcon writes:
// - public/app-icons/<id>.webp, the Theme screen's picker image;
// - Android launcher set ic_launcher_<id> in android/app/src/main/res: legacy
//   and round composites, and an adaptive icon whose background layer is the
//   art and whose foreground is the bunny. Launchers show only the middle 72 of
//   the 108dp layers, so both are fitted to that, and the background's outer
//   bleed is a blurred, scaled-up copy of the art so a launcher that zooms or
//   parallaxes never shows an empty edge. DEV-badged legacy, round, and
//   foreground images go in src/personal/res, like generate-theme-icons.mjs;
// - iPhone alternate icon set ios/App/App/Assets.xcassets/<id>.appiconset
//   (#169): the legacy composite as a flat 1024px RGB PNG, since iOS takes no
//   WebP app icons (ios-icon.mjs).
// Every Android and picker image is WebP to keep the app small
// (docs/decisions.md).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iosIconPng, writeIosIconSet } from './ios-icon.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const source = readFileSync(join(root, 'docs/design/art/app-icons/default-1024.png')).toString('base64')

// Legacy icon px and adaptive layer px (108dp) per density.
const DENSITIES = {
  mdpi: [48, 108],
  hdpi: [72, 162],
  xhdpi: [96, 216],
  xxhdpi: [144, 324],
  xxxhdpi: [192, 432],
}
const PICKER_SIZE = 144
const WEBP_QUALITY = 0.86

// The bunny alone, recolored, as a 1024px base64 PNG with a clear background.
// docs/design/art/app-icons/default-1024.png with its rose tile taken out, so
// it has the default icon's exact size and position, and only its colors
// change (design: docs/design/issue-840-app-icon.png). Same projection as
// generate-theme-icons.mjs's recolor: antialiased edges are a blend of two flat
// colors, so each pixel is blended between the targets the same way, and the
// tile's target is transparent. colors: { bunny, cream, nose } as #rrggbb.
export const bunnyLayer = (page, colors) =>
  page.evaluate(
    async ({ source, colors }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${source}`
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1024
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, 1024, 1024)
      const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
      // Tile, bunny, cream, nose.
      const keys = [[217, 106, 127], [42, 24, 48], [248, 234, 216], [242, 135, 156]]
      const targets = [null, hex(colors.bunny), hex(colors.cream), hex(colors.nose)]
      const image = ctx.getImageData(0, 0, 1024, 1024)
      const d = image.data
      for (let i = 0; i < d.length; i += 4) {
        const p = [d[i], d[i + 1], d[i + 2]]
        let best = Infinity
        let color = p
        let alpha = 1
        for (let a = 0; a < keys.length; a++) {
          for (let b = a + 1; b < keys.length; b++) {
            const ab = keys[b].map((v, k) => v - keys[a][k])
            const ap = p.map((v, k) => v - keys[a][k])
            const len = ab.reduce((s, v) => s + v * v, 0)
            const t = Math.max(0, Math.min(1, ab.reduce((s, v, k) => s + v * ap[k], 0) / len))
            const dist = keys[a].reduce((s, v, k) => s + (v + ab[k] * t - p[k]) ** 2, 0)
            if (dist < best) {
              best = dist
              // a is 0 only for the tile: that end of the blend is clear.
              if (a === 0) {
                color = targets[b]
                alpha = t
              } else {
                color = targets[a].map((v, k) => v + (targets[b][k] - v) * t)
                alpha = 1
              }
            }
          }
        }
        d[i] = color[0]
        d[i + 1] = color[1]
        d[i + 2] = color[2]
        d[i + 3] = Math.round(alpha * 255)
      }
      ctx.putImageData(image, 0, 0)
      return canvas.toDataURL('image/png').split(',')[1]
    },
    { source, colors },
  )

// One size and shape of an art icon, as base64. kind: 'legacy' (square
// composite), 'round' (circle composite), 'background' / 'foreground' (the
// adaptive layers). The badge is the personal build's DEV pill.
const render = (page, bunny, background, opts) =>
  page.evaluate(
    async ({ bunny, background, size, kind, badge, type, quality }) => {
      const load = async (src) => {
        const img = new Image()
        img.src = src
        await img.decode()
        return img
      }
      const fg = await load(`data:image/png;base64,${bunny}`)
      const bg = await load(`data:image/webp;base64,${background}`)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      const centered = (img, s) => ctx.drawImage(img, (size - s) / 2, (size - s) / 2, s, s)
      // The visible middle 72 of 108dp on the adaptive layers.
      const visible = size * (72 / 108)

      if (kind === 'background') {
        ctx.filter = `blur(${size / 40}px)`
        centered(bg, size * 1.15)
        ctx.filter = 'none'
        centered(bg, visible)
      } else if (kind === 'foreground') {
        centered(fg, visible)
      } else {
        if (kind === 'round') {
          ctx.beginPath()
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
          ctx.clip()
        }
        centered(bg, size)
        centered(fg, size)
      }

      if (badge) {
        const unit = kind === 'foreground' ? size / 108 : size / 72
        const w = 30 * unit
        const h = 12 * unit
        const x = (size - w) / 2
        const y = kind === 'foreground' ? size / 2 + 21 * unit : size - h - 5 * unit
        ctx.fillStyle = '#F5C542'
        ctx.strokeStyle = '#17111C'
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
      return canvas.toDataURL(type, quality).split(',')[1]
    },
    { bunny, background, type: 'image/webp', quality: WEBP_QUALITY, ...opts },
  )

const bytes = (base64) => Buffer.from(base64, 'base64')

// Writes every image of one art icon. bunny is bunnyLayer's output; art is the
// path of a full-bleed square WebP. The icon's activity-alias in
// AndroidManifest.xml and its name in project.pbxproj's
// ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES are added by hand.
export async function writeArtIcon(page, { id, bunny, art }) {
  const background = readFileSync(art).toString('base64')
  mkdirSync(join(root, 'public/app-icons'), { recursive: true })
  writeFileSync(
    join(root, `public/app-icons/${id}.webp`),
    bytes(await render(page, bunny, background, { size: PICKER_SIZE, kind: 'legacy' })),
  )

  // Lossless here: the iPhone icon is re-encoded as PNG.
  const ios = await render(page, bunny, background, { size: 1024, kind: 'legacy', type: 'image/png' })
  writeIosIconSet(id, await iosIconPng(page, `data:image/png;base64,${ios}`))

  const name = `ic_launcher_${id.replace(/-/g, '_')}`
  for (const [resDir, badge] of [
    ['android/app/src/main/res', false],
    ['android/app/src/personal/res', true],
  ]) {
    for (const [density, [legacy, adaptive]] of Object.entries(DENSITIES)) {
      const dir = join(root, resDir, `mipmap-${density}`)
      mkdirSync(dir, { recursive: true })
      const write = async (file, opts) => writeFileSync(join(dir, file), bytes(await render(page, bunny, background, { badge, ...opts })))
      await write(`${name}.webp`, { size: legacy, kind: 'legacy' })
      await write(`${name}_round.webp`, { size: legacy, kind: 'round' })
      await write(`${name}_foreground.webp`, { size: adaptive, kind: 'foreground' })
      // The background carries no badge, so both flavors share main's.
      if (!badge) await write(`${name}_background.webp`, { size: adaptive, kind: 'background' })
    }
  }
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/${name}_background"/>\n    <foreground android:drawable="@mipmap/${name}_foreground"/>\n</adaptive-icon>\n`
  const anydpi = join(root, 'android/app/src/main/res/mipmap-anydpi-v26')
  writeFileSync(join(anydpi, `${name}.xml`), adaptiveXml)
  writeFileSync(join(anydpi, `${name}_round.xml`), adaptiveXml)
}
