// Writes iPhone app icon sets into ios/App/App/Assets.xcassets (#169): the main
// icon (generate-ios-icons.mjs) and the alternate theme and seasonal icons
// (generate-theme-icons.mjs, generate-seasonal-icons.mjs). Each is a flat,
// opaque 1024px PNG; iOS rounds the corners itself.
//
// App Store Connect rejects icons with an alpha channel, so every PNG is written
// as plain RGB with a tiny encoder below.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
export const IOS_ASSETS = join(root, 'ios/App/App/Assets.xcassets')
const SIZE = 1024

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
// rgb: a Buffer of width*height*3 bytes.
export const encodeRgbPng = (width, height, rgb) => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB, no alpha
  const rows = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    rgb.copy(rows, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// An icon image (a data: URL) as a 1024px RGB PNG, drawn on a Playwright page.
// The icon tile's own colour fills any transparent corners first, then the
// image is drawn over it at full size.
export async function iosIconPng(page, dataUrl) {
  const rgb = await page.evaluate(
    async ({ dataUrl, size }) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      const probe = document.createElement('canvas')
      probe.width = probe.height = 512
      probe.getContext('2d').drawImage(img, 0, 0, 512, 512)
      const [r, g, b] = probe.getContext('2d').getImageData(256, 24, 1, 1).data
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
      ctx.fillRect(0, 0, size, size)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, size, size)
      const d = ctx.getImageData(0, 0, size, size).data
      const out = new Uint8Array(size * size * 3)
      for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
        out[j] = d[i]
        out[j + 1] = d[i + 1]
        out[j + 2] = d[i + 2]
      }
      let binary = ''
      for (let i = 0; i < out.length; i += 0x8000) binary += String.fromCharCode(...out.subarray(i, i + 0x8000))
      return btoa(binary)
    },
    { dataUrl, size: SIZE },
  )
  return encodeRgbPng(SIZE, SIZE, Buffer.from(rgb, 'base64'))
}

// Writes Assets.xcassets/<name>.appiconset with one 1024px universal image.
// An alternate icon's name is the id the JS passes to AppIcon.setName, and it
// must also be listed in ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES in
// ios/App/App.xcodeproj/project.pbxproj (added by hand, both configurations).
export function writeIosIconSet(name, png, file = `${name}-1024.png`) {
  const dir = join(IOS_ASSETS, `${name}.appiconset`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, file), png)
  const contents = {
    images: [{ filename: file, idiom: 'universal', platform: 'ios', size: '1024x1024' }],
    info: { author: 'xcode', version: 1 },
  }
  writeFileSync(join(dir, 'Contents.json'), `${JSON.stringify(contents, null, 2).replace(/": /g, '" : ')}\n`)
}
