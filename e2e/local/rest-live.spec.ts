import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup, selectExercise, openNewExerciseSheet } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'

// Issue #143: with Premium, the native apps show the rest timer on the lock
// screen with +15s and Skip. A browser can't drive a lock screen, so this
// runs against the plugin's web stand-in (src/lib/restActivityWeb.ts): it
// keeps the rest in sessionStorage like the phone keeps it across the app
// being killed, and simulateRestLiveAction plays the lock screen's buttons.
// The timer rules themselves are in e2e/rest-live-unit.spec.ts.

type LiveRest = { exerciseName: string; endsAt: number; totalSeconds: number; status: string } | null

function readLive(page: Page): Promise<LiveRest> {
  return page.evaluate(async () => {
    const { readRestLive } = await window.__rbImport('/src/lib/restLive.ts')
    return readRestLive()
  })
}

function tapOnLockScreen(page: Page, action: 'add' | 'skip') {
  return page.evaluate(async (action) => {
    const { simulateRestLiveAction } = await window.__rbImport('/src/lib/restLive.ts')
    await simulateRestLiveAction(action)
  }, action)
}

async function pendingAlertCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const plugins = (window as unknown as { Capacitor: { Plugins: Record<string, any> } }).Capacitor.Plugins
    return (await plugins.LocalNotifications.getPending()).notifications.length
  })
}

// Headless Chromium always reports notifications as denied; this fake
// grants them, as on a phone where alerts are on (see local-rest-alerts.spec.ts).
async function setUp(page: Page, premium: boolean) {
  await page.addInitScript((premium) => {
    class FakeNotification extends EventTarget {
      static get permission() {
        return 'granted'
      }
      static async requestPermission() {
        return 'granted'
      }
      close() {}
    }
    Object.assign(window, { Notification: FakeNotification })
    if (premium) localStorage.setItem('repbunny-premium-unlocked', 'true')
  }, premium)
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
}

async function logSetWithRest(page: Page, name: string) {
  await goTo(page, 'Exercises')
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(name)
  await pickMuscleGroup(page)
  await page.getByLabel('Rest timer (seconds)').fill('90')
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.locator('.row-wrap', { hasText: name })).toBeVisible()

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
}

async function countdownSeconds(page: Page): Promise<number> {
  const [m, s] = (await page.locator('.rest-countdown').innerText()).split(':').map(Number)
  return m * 60 + s
}

test('with Premium the rest shows on the lock screen, and its +15s and Skip reach the app', async ({ page }) => {
  await setUp(page, true)
  const name = `Lock Screen Row ${Date.now()}`
  const loggedAt = Date.now()
  await logSetWithRest(page, name)

  await expect.poll(async () => (await readLive(page))?.status).toBe('running')
  const live = (await readLive(page))!
  expect(live.exerciseName).toBe(name)
  expect(live.endsAt - loggedAt).toBeGreaterThan(85_000)
  expect(live.endsAt - loggedAt).toBeLessThan(95_000)
  // The lock-screen timer posts the end-of-rest alert itself.
  expect(await pendingAlertCount(page)).toBe(0)

  await tapOnLockScreen(page, 'add')
  await expect.poll(() => countdownSeconds(page)).toBeGreaterThan(100)

  // The in-app buttons move the lock screen too.
  await page.getByRole('button', { name: '-15s' }).click()
  await expect.poll(async () => (await readLive(page))!.endsAt - Date.now()).toBeLessThan(91_000)

  await tapOnLockScreen(page, 'skip')
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toHaveCount(0)
  await expect.poll(() => readLive(page)).toBeNull()
})

test('Skip Rest in the app takes the rest off the lock screen', async ({ page }) => {
  await setUp(page, true)
  await logSetWithRest(page, `Lock Screen Skip ${Date.now()}`)
  await expect.poll(async () => (await readLive(page))?.status).toBe('running')

  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect.poll(() => readLive(page)).toBeNull()
})

test('a rest still running on the lock screen comes back when the app is reopened', async ({ page }) => {
  await setUp(page, true)
  await logSetWithRest(page, `Lock Screen Reopen ${Date.now()}`)
  await expect.poll(async () => (await readLive(page))?.status).toBe('running')
  await tapOnLockScreen(page, 'add')
  await expect.poll(() => countdownSeconds(page)).toBeGreaterThan(100)

  // Stands in for the app being killed and opened again.
  await page.reload()
  await page.getByRole('button', { name: 'Resume workout' }).click()
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  expect(await countdownSeconds(page)).toBeGreaterThan(95)
})

test('free users keep the end-of-rest alert and no lock-screen timer', async ({ page }) => {
  await setUp(page, false)
  await logSetWithRest(page, `Lock Screen Free ${Date.now()}`)

  await expect.poll(() => pendingAlertCount(page)).toBe(1)
  expect(await readLive(page)).toBeNull()
})

// Issue #166: the full rest screen shows over the lock screen (Android's
// setShowWhenLocked), and only while it's up.
function overLockScreen(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const { restOverLockScreen } = await window.__rbImport('/src/lib/restLive.ts')
    return restOverLockScreen()
  })
}

test('with Premium the rest screen shows over the lock screen only while it is up', async ({ page }) => {
  await setUp(page, true)
  await logSetWithRest(page, `Over Lock ${Date.now()}`)
  await expect.poll(() => overLockScreen(page)).toBe(true)

  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toHaveCount(0)
  await expect.poll(() => overLockScreen(page)).toBe(false)

  // Back to the full screen from the bar, then Skip.
  await page.locator('.rest-mini-bar').getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  await expect.poll(() => overLockScreen(page)).toBe(true)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect.poll(() => overLockScreen(page)).toBe(false)
})

test('Back to workout on a locked phone stays on the rest screen if unlocking is cancelled', async ({ page }) => {
  await setUp(page, true)
  await logSetWithRest(page, `Over Lock Cancel ${Date.now()}`)
  await page.evaluate(async () => {
    const { simulateLockedPhone } = await window.__rbImport('/src/lib/restLive.ts')
    await simulateLockedPhone(true)
  })

  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  expect(await overLockScreen(page)).toBe(true)
})

test('free users never get the rest screen over the lock screen', async ({ page }) => {
  await setUp(page, false)
  await logSetWithRest(page, `Over Lock Free ${Date.now()}`)
  // Give the store a beat to (not) turn it on.
  await page.waitForTimeout(500)
  expect(await overLockScreen(page)).toBe(false)
})
