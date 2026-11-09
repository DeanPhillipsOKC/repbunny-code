import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { goTo } from '../fixtures/nav'
import type { Page } from '@playwright/test'

// Covers issue #880: the apps rotate. A phone held sideways (844x390, an
// iPhone's landscape size) must stay fully usable: a slim bottom nav, the
// workout's controls reachable, the rest screen's buttons reachable, nothing
// scrolling sideways, and a rotation mid-rest losing nothing.

const LANDSCAPE = { width: 844, height: 390 }
const PORTRAIT = { width: 390, height: 844 }
const DAY_MS = 24 * 60 * 60 * 1000

async function noSidewaysScroll(page: Page, where: string) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(extra, `${where} scrolls sideways`).toBeLessThanOrEqual(0)
}

// A control is reachable when it can be scrolled into view and sits inside the
// window, so a tap on it lands.
async function expectReachable(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true })
  await button.scrollIntoViewIfNeeded()
  const box = await button.boundingBox()
  if (!box) throw new Error(`${name} is not laid out`)
  const view = page.viewportSize()!
  expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height, `${name} bottom`).toBeLessThanOrEqual(view.height)
}

test('landscape: Home, the nav, a workout, and the rest screen stay usable, and rotating loses nothing', async ({ page, stamp }) => {
  const routine = `Landscape Day ${stamp}`
  const exercise = `Landscape Press ${stamp}`
  const db = localDb(page)

  await startLocal(page, {
    defaultRestSeconds: 90,
    beforeNavigate: async () => {
      const { data: ex, error } = await db.from('exercises').insert({ name: exercise }).select('id').single()
      if (error) throw error
      const { data: tpl } = await db.from('workout_templates').insert({ name: routine }).select('id').single()
      await db.from('workout_template_exercises').insert({ template_id: tpl!.id, exercise_id: ex!.id, position: 0 })
      const { data: prior } = await db.from('workouts')
        .insert({ template_id: tpl!.id, performed_at: new Date(Date.now() - DAY_MS).toISOString() }).select('id').single()
      await db.from('sets').insert({ workout_id: prior!.id, exercise_id: ex!.id, set_index: 0, reps: 8, weight: 135, weight_unit: 'lb' })
    },
  })
  await page.setViewportSize(LANDSCAPE)

  // The nav is a slim bar with all four tabs, labels beside their icons.
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav.getByRole('link')).toHaveCount(4)
  const navBox = await nav.boundingBox()
  expect(navBox!.height).toBeLessThanOrEqual(60)
  await noSidewaysScroll(page, 'Home')

  // A workout: its Finish button stays above the nav and in view.
  await page.getByRole('button', { name: routine, exact: true }).click()
  await expect(page.locator('.workout-title')).toHaveText(routine)
  await expectReachable(page, 'Finish workout')
  await noSidewaysScroll(page, 'the workout')

  // Log a set: the rest screen opens, and both of its exits are reachable.
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('140')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.rest-countdown')).toBeVisible()
  await expectReachable(page, 'Skip Rest')
  await expectReachable(page, 'Back to workout')
  await noSidewaysScroll(page, 'the rest screen')

  // Rotate to portrait and back mid-rest: same rest, same workout. A restarted
  // timer would jump back up to 1:30, so the countdown must not grow.
  const countdown = async () => {
    const [m, s] = ((await page.locator('.rest-countdown').textContent()) ?? '').trim().split(':').map(Number)
    return m * 60 + s
  }
  await page.waitForTimeout(2_000)
  const before = await countdown()
  expect(before).toBeLessThan(90)
  await page.setViewportSize(PORTRAIT)
  await expect(page.locator('.rest-countdown')).toBeVisible()
  await page.setViewportSize(LANDSCAPE)
  await expect(page.locator('.rest-countdown')).toBeVisible()
  expect(await countdown()).toBeLessThanOrEqual(before)

  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.locator('.set-row-logged')).toHaveCount(1)
  await expectReachable(page, 'Finish workout')
})

test('landscape: every tab and the Account sheet work, with nothing scrolling sideways', async ({ page }) => {
  await startLocal(page)
  await page.setViewportSize(LANDSCAPE)

  for (const tab of ['Progress', 'Routines', 'Exercises', 'Home'] as const) {
    await goTo(page, tab)
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page')
    await noSidewaysScroll(page, tab)
  }

  // The Account sheet scrolls inside the short window, and closes.
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Account', exact: true })
  await expect(sheet).toBeVisible()
  const sheetBox = await sheet.boundingBox()
  expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(LANDSCAPE.height + 1)
  await noSidewaysScroll(page, 'the Account sheet')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})
