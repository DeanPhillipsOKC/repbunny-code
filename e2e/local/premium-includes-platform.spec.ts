import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'

// Issue #831: the Premium list only promises what the platform has. iPhone has
// no home screen widgets yet (#175); Android has them. Both native apps have
// the theme and seasonal app icons (#145, #841, #169); the browser has neither.

const ICONS_LINE = 'Themes, matching app icons, and seasonal icons'

async function labels(page: import('@playwright/test').Page, platform: string) {
  return page.evaluate(async (p) => {
    const { premiumIncludes } = await window.__rbImport('/src/lib/premium.ts')
    return premiumIncludes(p).map((i) => i.label)
  }, platform)
}

test('the iPhone Premium list has app icons but no widgets line', async ({ page }) => {
  await startLocal(page)
  const ios = await labels(page, 'ios')
  expect(ios.some((l) => /widget/i.test(l))).toBe(false)
  expect(ios).toContain(ICONS_LINE)
  expect(ios).not.toContain('Themes')
  const web = await labels(page, 'web')
  expect(web.some((l) => /widget|icons/i.test(l))).toBe(false)
  expect(web).toContain('Themes')
})

test('the Android Premium list keeps widgets and app icons', async ({ page }) => {
  await startLocal(page)
  const android = await labels(page, 'android')
  expect(android).toContain('Home screen widgets: this week, next workout, and latest record')
  expect(android).toContain(ICONS_LINE)
  expect(android).not.toContain('Themes')
})
