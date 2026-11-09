import { test, expect } from '@playwright/test'
import { startLocal } from '../fixtures/local'

// Issue #825: the native apps lock the viewport so the web view can't zoom
// (pinch, double tap, focus), since the Log screen's pan-y blocks pinching
// back out. The browser build keeps its viewport.

const WEB = 'width=device-width, initial-scale=1.0, viewport-fit=cover'

async function lockWithPlatform(page: import('@playwright/test').Page, platform: string) {
  return page.evaluate(async (p) => {
    const w = window as any
    const meta = document.querySelector('meta[name="viewport"]')!
    meta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
    const real = w.Capacitor.isNativePlatform
    w.Capacitor.isNativePlatform = () => p !== 'web'
    try {
      const { lockNativeViewport } = await window.__rbImport('/src/lib/nativeViewport.ts')
      lockNativeViewport()
    } finally {
      w.Capacitor.isNativePlatform = real
    }
    return meta.getAttribute('content')
  }, platform)
}

test('the native viewport blocks zoom and the web one is left alone', async ({ page }) => {
  await startLocal(page)
  const meta = page.locator('meta[name="viewport"]')

  expect(await lockWithPlatform(page, 'web')).toBe(WEB)

  const locked = await lockWithPlatform(page, 'ios')
  expect(locked).toContain('maximum-scale=1.0')
  expect(locked).toContain('user-scalable=no')
  expect(locked).toContain('viewport-fit=cover')
  await expect(meta).toHaveAttribute('content', locked!)

  expect(await lockWithPlatform(page, 'android')).toContain('user-scalable=no')
})

test('a double tap never zooms', async ({ page }) => {
  await startLocal(page)
  const touch = await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)
  expect(touch).toBe('manipulation')
})
