import { test, expect, type Page } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openAccountSection } from '../fixtures/account'

// Issue #145: alternate app icons per theme (Premium, native apps). The Theme
// screen's App icon group runs against the AppIcon plugin's browser stand-in
// (src/lib/appIconWeb.ts), which keeps the icon in localStorage the way the
// phone keeps its launcher icon.

test.use({ viewport: { width: 375, height: 800 } })

async function firstLaunch(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
}

async function setPremium(page: Page, on: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, on)
}

async function openTheme(page: Page) {
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Theme/ }).click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  await expect(theme).toBeVisible()
  return theme
}

function storedIcon(page: Page) {
  return page.evaluate(() => localStorage.getItem('app-icon-web'))
}

test('free: Default is in use, other icons preview with Keep it with Premium / Go back', async ({ page }) => {
  await firstLaunch(page)
  const theme = await openTheme(page)
  const icons = theme.getByRole('group', { name: 'App icon' })
  // Issue #861: Default and Classic are separate tiles, and the Halloween and
  // Autumn themes have no flat icon of their own any more.
  await expect(icons.getByRole('button')).toHaveCount(6)
  expect(await icons.getByRole('button').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).toEqual(
    ['Default', 'Classic', 'Cotton Candy', 'Chalk', 'Carrot Patch', 'Sunrise'].map((name) => `${name} app icon`),
  )
  await expect(icons.getByRole('button', { name: 'Default app icon' })).toHaveAttribute('aria-pressed', 'true')
  await expect(icons.getByRole('button', { name: 'Default app icon' })).toHaveAccessibleDescription('Changes with the seasons')
  await expect(icons.locator('img[src*="halloween"], img[src*="autumn"]')).toHaveCount(0)
  // Default and Classic are free; the rest are Premium.
  await expect(icons.locator('.premium-mark')).toHaveCount(4)
  await expect(theme.getByText('Changes the icon on your home screen.', { exact: false })).toBeVisible()

  // Four across: the first four share a top edge, the fifth starts row two,
  // and nothing runs past the sheet at phone width.
  const boxes = await icons.getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
  expect(new Set(boxes.slice(0, 4).map((b) => Math.round(b.top))).size).toBe(1)
  expect(boxes[4].top).toBeGreaterThan(boxes[0].bottom)
  const group = (await icons.boundingBox())!
  for (const b of boxes) expect(b.right).toBeLessThanOrEqual(group.x + group.width)
  // Labels in a row share a top edge, Premium sparkle or not, and stay inside
  // the group even at 320px.
  const labelTops = await icons.locator('.icon-label').evaluateAll((els) => els.slice(0, 4).map((el) => Math.round(el.getBoundingClientRect().top)))
  expect(new Set(labelTops).size).toBe(1)
  await page.setViewportSize({ width: 320, height: 700 })
  const narrow = (await icons.boundingBox())!
  const labelRights = await icons.locator('.icon-label').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right))
  for (const right of labelRights) expect(right).toBeLessThanOrEqual(narrow.x + narrow.width)
  await page.setViewportSize({ width: 375, height: 800 })

  await icons.getByRole('button', { name: 'Cotton Candy app icon' }).click()
  const preview = theme.getByRole('group', { name: 'App icon preview' })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('This is the Cotton Candy icon on your home screen. Icons are part of Premium.')
  await expect(preview.locator('img')).toHaveAttribute('src', '/app-icons/cotton-candy.webp')
  // Nothing changes on the phone.
  await expect(icons.getByRole('button', { name: 'Default app icon' })).toHaveAttribute('aria-pressed', 'true')
  expect(await storedIcon(page)).toBeNull()

  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect(preview).toHaveCount(0)

  // Keep it with Premium opens the Premium sheet; unlocking switches to it.
  await icons.getByRole('button', { name: 'Chalk app icon' }).click()
  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  await expect(page.getByRole('dialog', { name: 'Premium' })).toBeVisible()
  await setPremium(page, true)
  await expect(icons.getByRole('button', { name: 'Chalk app icon' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => storedIcon(page)).toBe('chalk')
})

test('Premium: picking an icon switches it, and losing Premium keeps it', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  let theme = await openTheme(page)
  let icons = theme.getByRole('group', { name: 'App icon' })
  await icons.getByRole('button', { name: 'Carrot Patch app icon' }).click()
  await expect(icons.getByRole('button', { name: 'Carrot Patch app icon' })).toHaveAttribute('aria-pressed', 'true')
  await expect(icons.getByRole('button', { name: 'Default app icon' })).toHaveAttribute('aria-pressed', 'false')
  await expect(theme.getByRole('group', { name: 'App icon preview' })).toHaveCount(0)
  // The icon is its own pick: the theme stays Classic.
  await expect(theme.getByRole('button', { name: 'Classic', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => storedIcon(page)).toBe('carrot-patch')

  // Losing Premium keeps the icon; Classic and Default are still free, and a
  // new pick previews.
  await setPremium(page, false)
  await page.reload()
  theme = await openTheme(page)
  icons = theme.getByRole('group', { name: 'App icon' })
  await expect(icons.getByRole('button', { name: 'Carrot Patch app icon' })).toHaveAttribute('aria-pressed', 'true')
  await icons.getByRole('button', { name: 'Sunrise app icon' }).click()
  await expect(theme.getByRole('group', { name: 'App icon preview' })).toBeVisible()
  expect(await storedIcon(page)).toBe('carrot-patch')
  await icons.getByRole('button', { name: 'Classic app icon' }).click()
  await expect(theme.getByRole('group', { name: 'App icon preview' })).toHaveCount(0)
  await expect(icons.getByRole('button', { name: 'Classic app icon' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => storedIcon(page)).toBe('rose')
  await icons.getByRole('button', { name: 'Default app icon' }).click()
  await expect(icons.getByRole('button', { name: 'Default app icon' })).toHaveAttribute('aria-pressed', 'true')
  await expect(icons.getByRole('button', { name: 'Classic app icon' })).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => storedIcon(page)).toBe('classic')
})

// Issue #861: a phone still on the old Halloween or Autumn theme icon moves to
// the seasonal one at launch, before the Theme screen is ever opened.
for (const [old, season, name] of [
  ['halloween', 'season-halloween', 'Halloween'],
  ['autumn', 'season-autumn', 'Autumn'],
]) {
  test(`a phone on the retired ${name} icon moves to the ${name} seasonal icon at launch`, async ({ page }) => {
    // The old icon is on the phone before the app first opens (once, so the
    // move isn't undone by a later load).
    await page.addInitScript((id) => {
      if (sessionStorage.getItem('icon-seeded')) return
      localStorage.setItem('app-icon-web', id)
      sessionStorage.setItem('icon-seeded', '1')
    }, old)
    await firstLaunch(page)
    await expect.poll(() => storedIcon(page)).toBe(season)
    const theme = await openTheme(page)
    await expect(theme.getByRole('button', { name: `${name} seasonal app icon` })).toHaveAttribute('aria-pressed', 'true')
    await expect(theme.getByRole('button', { name: 'Default app icon' })).toHaveAttribute('aria-pressed', 'false')
  })
}

// Issue #841: the seasonal icons, a second grid under the theme icons.
test('free: the seasonal icons sit in their own group and preview like the rest', async ({ page }) => {
  await firstLaunch(page)
  const theme = await openTheme(page)
  const seasonal = theme.getByRole('group', { name: 'Seasonal icons' })
  await expect(seasonal.getByRole('button')).toHaveCount(4)
  await expect(theme.getByRole('group', { name: 'App icon', exact: true }).getByRole('button')).toHaveCount(6)
  for (const name of ['Autumn', 'Halloween', 'Snow Globe', 'Christmas']) {
    await expect(seasonal.getByRole('button', { name: `${name} seasonal app icon` })).toHaveAttribute('aria-pressed', 'false')
  }
  // One row of four, every picture loaded, each marked Premium.
  const boxes = await seasonal.getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
  expect(new Set(boxes.map((b) => Math.round(b.top))).size).toBe(1)
  await expect.poll(() => seasonal.locator('img').evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0))).toBe(true)
  await expect(seasonal.locator('.premium-mark')).toHaveCount(4)

  await seasonal.getByRole('button', { name: 'Snow Globe seasonal app icon' }).click()
  const preview = theme.getByRole('group', { name: 'App icon preview' })
  await expect(preview).toContainText('This is the Snow Globe seasonal icon on your home screen. Icons are part of Premium.')
  await expect(preview.locator('img')).toHaveAttribute('src', '/app-icons/season-snow-globe.webp')
  expect(await storedIcon(page)).toBeNull()
})

test('Premium: a seasonal icon switches the home-screen icon and stays after a reload', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  let theme = await openTheme(page)
  let seasonal = theme.getByRole('group', { name: 'Seasonal icons' })
  await seasonal.getByRole('button', { name: 'Christmas seasonal app icon' }).click()
  await expect(seasonal.getByRole('button', { name: 'Christmas seasonal app icon' })).toHaveAttribute('aria-pressed', 'true')
  await expect(theme.getByRole('button', { name: 'Default app icon' })).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => storedIcon(page)).toBe('season-christmas')

  await page.reload()
  theme = await openTheme(page)
  seasonal = theme.getByRole('group', { name: 'Seasonal icons' })
  await expect(seasonal.getByRole('button', { name: 'Christmas seasonal app icon' })).toHaveAttribute('aria-pressed', 'true')
})

test('every seasonal icon has its Android launcher alias and images', async ({ page }) => {
  await firstLaunch(page)
  const ids = await page.evaluate(async () => {
    const { SEASONAL_ICONS } = await window.__rbImport('/src/lib/appIcon.ts')
    return SEASONAL_ICONS.map((icon: { id: string }) => icon.id)
  })
  expect(ids).toHaveLength(4)
  const res = join(process.cwd(), 'android/app/src/main/res')
  const manifest = readFileSync(join(process.cwd(), 'android/app/src/main/AndroidManifest.xml'), 'utf8')
  for (const id of ids) {
    // AppIconPlugin.java maps Icon<PascalCase id> back to the id.
    const pascal = id.replace(/(^|-)([a-z])/g, (_: string, __: string, c: string) => c.toUpperCase())
    const name = `ic_launcher_${id.replace(/-/g, '_')}`
    expect(manifest).toContain(`android:name=".Icon${pascal}"`)
    expect(manifest).toContain(`android:icon="@mipmap/${name}"`)
    expect(existsSync(join(process.cwd(), `public/app-icons/${id}.webp`))).toBe(true)
    expect(readFileSync(join(res, `mipmap-anydpi-v26/${name}.xml`), 'utf8')).toContain(`@mipmap/${name}_background`)
    for (const file of [`${name}.webp`, `${name}_round.webp`, `${name}_foreground.webp`, `${name}_background.webp`]) {
      expect(existsSync(join(res, 'mipmap-xxxhdpi', file)), file).toBe(true)
    }
  }
})

// Issue #861: Classic (rose) is an alternate icon like the theme ones, and
// the retired Halloween and Autumn aliases stay so a phone still on one keeps
// its launcher entry, showing the seasonal art. Issue #863: the theme icons
// sit on background art, as WebP with an art adaptive background like the
// seasonal ones; Classic stays a flat PNG tile.
test('every theme app icon has its Android launcher alias, and the retired ones show seasonal art', async ({ page }) => {
  await firstLaunch(page)
  const ids = await page.evaluate(async () => {
    const { APP_ICONS } = await window.__rbImport('/src/lib/appIcon.ts')
    return APP_ICONS.map((icon: { id: string }) => icon.id).filter((id: string) => id !== 'classic')
  })
  expect(ids).toEqual(['rose', 'cotton-candy', 'chalk', 'carrot-patch', 'sunrise'])
  const res = join(process.cwd(), 'android/app/src/main/res')
  const manifest = readFileSync(join(process.cwd(), 'android/app/src/main/AndroidManifest.xml'), 'utf8')
  const alias = (pascal: string) => new RegExp(`android:name="\\.Icon${pascal}"[^>]*android:icon="@mipmap/([a-z_]+)"`).exec(manifest)?.[1]
  for (const id of ids) {
    const pascal = id.replace(/(^|-)([a-z])/g, (_: string, __: string, c: string) => c.toUpperCase())
    const name = `ic_launcher_${id.replace(/-/g, '_')}`
    expect(alias(pascal), id).toBe(name)
    if (id === 'rose') {
      expect(existsSync(join(process.cwd(), 'public/app-icons/classic.png'))).toBe(true)
      for (const file of [`${name}.png`, `${name}_round.png`, `${name}_foreground.png`]) {
        expect(existsSync(join(res, 'mipmap-xxxhdpi', file)), file).toBe(true)
      }
      continue
    }
    expect(existsSync(join(process.cwd(), `public/app-icons/${id}.webp`)), id).toBe(true)
    expect(existsSync(join(process.cwd(), `public/app-icons/${id}.png`)), id).toBe(false)
    expect(readFileSync(join(res, `mipmap-anydpi-v26/${name}.xml`), 'utf8')).toContain(`@mipmap/${name}_background`)
    for (const file of [`${name}.webp`, `${name}_round.webp`, `${name}_foreground.webp`, `${name}_background.webp`]) {
      expect(existsSync(join(res, 'mipmap-xxxhdpi', file)), file).toBe(true)
      // Android fails to build with a PNG and a WebP of one name.
      expect(existsSync(join(res, 'mipmap-xxxhdpi', file.replace('.webp', '.png'))), file).toBe(false)
    }
  }
  expect(alias('Classic')).toBe('ic_launcher')
  expect(alias('Halloween')).toBe('ic_launcher_season_halloween')
  expect(alias('Autumn')).toBe('ic_launcher_season_autumn')
  expect(existsSync(join(res, 'mipmap-xxxhdpi/ic_launcher_halloween.png'))).toBe(false)
})

// Issue #169: the iPhone switches icons with setAlternateIconName, so every id
// the picker can pass (each but Default, the primary icon, #861) needs an icon
// set in Assets.xcassets and its name in both build configurations.
test('every app icon has its iPhone alternate icon set', async ({ page }) => {
  await firstLaunch(page)
  const ids = await page.evaluate(async () => {
    const { APP_ICONS, SEASONAL_ICONS } = await window.__rbImport('/src/lib/appIcon.ts')
    return [...APP_ICONS, ...SEASONAL_ICONS].map((icon: { id: string }) => icon.id).filter((id: string) => id !== 'classic')
  })
  expect(ids).toHaveLength(9)
  expect(ids).toContain('rose')
  const ios = join(process.cwd(), 'ios/App/App')
  const project = readFileSync(join(process.cwd(), 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8')
  const lists = [...project.matchAll(/ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES = "([^"]*)";/g)].map((m) => m[1].split(' ').sort())
  expect(lists).toHaveLength(2)
  for (const list of lists) expect(list).toEqual([...ids].sort())
  for (const id of ids) {
    const contents = JSON.parse(readFileSync(join(ios, `Assets.xcassets/${id}.appiconset/Contents.json`), 'utf8'))
    const file = contents.images[0].filename
    expect(contents.images[0].size).toBe('1024x1024')
    // A flat RGB PNG: byte 25 of the header is the colour type, 2 is RGB with no alpha.
    const png = readFileSync(join(ios, `Assets.xcassets/${id}.appiconset/${file}`))
    expect(png.readUInt32BE(16), id).toBe(1024)
    expect(png[25], id).toBe(2)
  }
  expect(readFileSync(join(ios, 'MainViewController.swift'), 'utf8')).toContain('registerPluginInstance(AppIconPlugin())')
  expect(project).toContain('AppIconPlugin.swift in Sources')
})
