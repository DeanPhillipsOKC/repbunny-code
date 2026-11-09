import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup, selectExercise, openNewExerciseSheet } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { openAccountSection } from '../fixtures/account'
import { chimeCount, installRestChimeSpy } from '../fixtures/restChime'

// Issue #78: in local mode (the native apps) rest timer alerts are the
// phone's own scheduled notifications. In this browser local-mode build the
// LocalNotifications plugin falls back to the Notification API and keeps its
// scheduled alerts in memory, which getPending() below reads through the
// plugin Capacitor registers on window.

type PendingAlert = { id: number; title: string; body: string; schedule?: { at?: string } }

async function pendingAlerts(page: Page): Promise<PendingAlert[]> {
  return page.evaluate(async () => {
    const plugins = (window as unknown as { Capacitor: { Plugins: Record<string, any> } }).Capacitor.Plugins
    const { notifications } = await plugins.LocalNotifications.getPending()
    return JSON.parse(JSON.stringify(notifications))
  })
}

// Headless Chromium reports Notification.permission as 'denied' whatever
// context.grantPermissions says, so Notification itself is replaced with a
// fake standing in for the phone: it holds the permission and records each
// alert shown in window.__shownAlerts.
async function stubNotificationPermission(page: Page, permission: NotificationPermission) {
  await page.addInitScript((initial) => {
    let current = initial
    const shown: string[] = []
    class FakeNotification extends EventTarget {
      static get permission() {
        return current
      }
      static async requestPermission() {
        current = 'granted'
        return current
      }
      tag: string
      constructor(title: string, options?: { body?: string; tag?: string }) {
        super()
        this.tag = options?.tag ?? ''
        if (title) shown.push(options?.body ?? title)
      }
      close() {}
    }
    Object.assign(window, { Notification: FakeNotification, __shownAlerts: shown })
  }, permission)
}

function shownAlerts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __shownAlerts: string[] }).__shownAlerts)
}

async function firstLaunch(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
}

// Issue #63: the setting moved from the Exercises tab to Account, under
// Preferences.
async function openRestAlertSetting(page: Page) {
  return (await openAccountSection(page, 'Preferences')).getByRole('group', { name: 'Rest timer alerts' })
}

test('the Account setting turns rest alerts on before permission is granted', async ({ page }) => {
  await stubNotificationPermission(page, 'default')
  await firstLaunch(page)
  const setting = await openRestAlertSetting(page)

  await expect(setting.getByRole('button', { name: 'Turn on rest timer alerts' })).toBeVisible()
  // The retired web app's push button (#939) never shows.
  await expect(page.getByRole('button', { name: 'Enable rest timer alerts' })).toHaveCount(0)

  await setting.getByRole('button', { name: 'Turn on rest timer alerts' }).click()
  await expect(setting.getByText('Rest timer alerts are on for this phone.')).toBeVisible()
  await expect(setting.getByText('On', { exact: true })).toBeVisible()
  await expect(setting.getByRole('button')).toHaveCount(0)
})

test('the Account setting points to Settings once notifications are off', async ({ page }) => {
  await stubNotificationPermission(page, 'denied')
  await firstLaunch(page)
  const setting = await openRestAlertSetting(page)

  await expect(setting.getByText('Notifications are off for RepBunny')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Turn on rest timer alerts' })).toHaveCount(0)
})

test('the first rest timer asks for permission, schedules an alert, and Skip cancels it', async ({ page }) => {
  // Not asked yet: the card's button is left alone, so the rest timer asks.
  await stubNotificationPermission(page, 'default')
  await firstLaunch(page)

  const name = `Local Rest Row ${Date.now()}`
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
  const loggedAt = Date.now()
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()

  // One alert, due when the 90s rest ends.
  await expect.poll(async () => (await pendingAlerts(page)).length).toBe(1)
  const [alert] = await pendingAlerts(page)
  expect(alert.title).toBe('Rest is over')
  expect(alert.body).toBe(`Time for your next set of ${name}.`)
  const dueIn = new Date(alert.schedule!.at!).getTime() - loggedAt
  expect(dueIn).toBeGreaterThan(85_000)
  expect(dueIn).toBeLessThan(95_000)

  // +15s moves it rather than adding a second one.
  await page.getByRole('button', { name: '+15s' }).click()
  await expect
    .poll(async () => {
      const alerts = await pendingAlerts(page)
      return alerts.length === 1 ? new Date(alerts[0].schedule!.at!).getTime() - loggedAt : 0
    })
    .toBeGreaterThan(100_000)

  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect.poll(async () => (await pendingAlerts(page)).length).toBe(0)

  const setting = await openRestAlertSetting(page)
  await expect(setting.getByText('Rest timer alerts are on for this phone.')).toBeVisible()
})

// Scheduled plus already-fired alerts still on the shade.
async function alertCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const plugins = (window as unknown as { Capacitor: { Plugins: Record<string, any> } }).Capacitor.Plugins
    const pending = (await plugins.LocalNotifications.getPending()).notifications.length
    const delivered = (await plugins.LocalNotifications.getDeliveredNotifications()).notifications.length
    return pending + delivered
  })
}

async function logSetWithRest(page: Page, name: string, restSeconds: number) {
  await goTo(page, 'Exercises')
  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(name)
  await pickMuscleGroup(page)
  await page.getByLabel('Rest timer (seconds)').fill(String(restSeconds))
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.locator('.row-wrap', { hasText: name })).toBeVisible()

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
}

// On the phone the in-app countdown often runs out in the seconds the app
// keeps running after the screen locks, a moment before the alarm. Found
// 2026-10-01 on the Pixel: that used to cancel every alert before it fired.
test('a rest that runs out off screen keeps its alert', async ({ page }) => {
  await stubNotificationPermission(page, 'granted')
  await firstLaunch(page)
  // Stands in for a locked phone: the app doesn't have focus.
  await page.evaluate(() => {
    document.hasFocus = () => false
  })

  const name = `Local Rest Locked ${Date.now()}`
  await logSetWithRest(page, name, 3)
  await expect.poll(() => alertCount(page)).toBe(1)
  await expect(page.locator('.rest-headline')).toHaveCount(0, { timeout: 6000 })
  await expect.poll(() => shownAlerts(page)).toEqual([`Time for your next set of ${name}.`])
  expect(await alertCount(page)).toBe(1)
})

test('a rest that runs out on screen drops its alert, since the app already chimed', async ({ page }) => {
  await stubNotificationPermission(page, 'granted')
  await firstLaunch(page)

  await logSetWithRest(page, `Local Rest Watched ${Date.now()}`, 3)
  await expect.poll(() => alertCount(page)).toBe(1)
  await expect(page.locator('.rest-headline')).toHaveCount(0, { timeout: 6000 })
  await expect.poll(() => alertCount(page)).toBe(0)
})

// Issue #339: how many times the app asked the phone for its notification
// settings (the browser stand-in counts the calls).
function settingsOpened(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const { restSettingsOpened } = await window.__rbImport('/src/lib/restLive.ts')
    return restSettingsOpened()
  })
}

async function hideApp(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  })
}

test('with notifications off, the first rest of a workout says so and Open settings opens them', async ({ page }) => {
  await stubNotificationPermission(page, 'denied')
  await firstLaunch(page)

  await logSetWithRest(page, `Local Rest Off ${Date.now()}`, 90)
  const notice = page.getByRole('group', { name: 'Rest alerts are off' })
  await expect(notice.getByText("Rest alerts are off, so you won't hear when rest ends with your phone locked.")).toBeVisible()

  await notice.getByRole('button', { name: 'Open settings' }).click()
  await expect.poll(() => settingsOpened(page)).toBe(1)

  await notice.getByRole('button', { name: 'Dismiss' }).click()
  await expect(notice).toHaveCount(0)

  // A second rest in the same workout stays quiet about it.
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  await expect(notice).toHaveCount(0)
})

for (const permission of ['default', 'granted'] as const) {
  test(`no rest alerts notice when notifications are ${permission === 'default' ? 'not asked yet' : 'on'}`, async ({ page }) => {
    await stubNotificationPermission(page, permission)
    await firstLaunch(page)

    await logSetWithRest(page, `Local Rest No Notice ${Date.now()}`, 90)
    await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Rest alerts are off' })).toHaveCount(0)
  })
}

test('the Account setting offers Open settings once notifications are off', async ({ page }) => {
  await stubNotificationPermission(page, 'denied')
  await firstLaunch(page)
  const setting = await openRestAlertSetting(page)

  await setting.getByRole('button', { name: 'Open settings' }).click()
  await expect.poll(() => settingsOpened(page)).toBe(1)
})

test('the rest chime plays while the app is on screen, on the full screen and the bar', async ({ page }) => {
  await installRestChimeSpy(page)
  await stubNotificationPermission(page, 'granted')
  await firstLaunch(page)

  await logSetWithRest(page, `Local Rest Chime ${Date.now()}`, 3)
  await expect(page.locator('.rest-headline')).toHaveCount(0, { timeout: 6000 })
  expect(await chimeCount(page)).toBe(1)

  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0, { timeout: 6000 })
  expect(await chimeCount(page)).toBe(2)
})

test('the rest chime stays quiet when the app is off screen, on the full screen and the bar', async ({ page }) => {
  await installRestChimeSpy(page)
  await stubNotificationPermission(page, 'granted')
  await firstLaunch(page)

  await logSetWithRest(page, `Local Rest Quiet ${Date.now()}`, 3)
  await hideApp(page)
  await expect(page.locator('.rest-headline')).toHaveCount(0, { timeout: 6000 })
  expect(await chimeCount(page)).toBe(0)

  await page.evaluate(() => {
    delete (document as unknown as { visibilityState?: string }).visibilityState
  })
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await hideApp(page)
  await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0, { timeout: 6000 })
  expect(await chimeCount(page)).toBe(0)
})

// Issue #642: Android's "Alarms & reminders" starts off, so alerts can arrive
// a few seconds late. The browser build can't be Android, so the phone's
// switch is stood in for through lib/restAlert.ts.
async function simulateExactAlerts(page: Page, state: 'granted' | 'denied') {
  await page.evaluate(async (s) => {
    const { simulateExactRestAlerts } = await window.__rbImport('/src/lib/restAlert.ts')
    simulateExactRestAlerts(s)
  }, state)
}

function exactSettingOpened(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const { exactRestSettingOpened } = await window.__rbImport('/src/lib/restAlert.ts')
    return exactRestSettingOpened()
  })
}

test('with on-time alerts off, the first rest says so once and Not now keeps it gone', async ({ page }) => {
  await stubNotificationPermission(page, 'granted')
  await firstLaunch(page)
  await simulateExactAlerts(page, 'denied')

  await logSetWithRest(page, `Local Rest Exact ${Date.now()}`, 90)
  const notice = page.getByRole('group', { name: 'On-time rest alerts' })
  await expect(notice.getByText('Your phone may send the rest alert a few seconds late.')).toBeVisible()

  await notice.getByRole('button', { name: 'Not now' }).click()
  await expect(notice).toHaveCount(0)
  expect(await exactSettingOpened(page)).toBe(0)

  // The next rest stays quiet about it.
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('95')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  await expect(notice).toHaveCount(0)
})

test('Allow on-time alerts opens the setting, and the notice goes once it is allowed', async ({ page }) => {
  await stubNotificationPermission(page, 'granted')
  await firstLaunch(page)
  await simulateExactAlerts(page, 'denied')

  await logSetWithRest(page, `Local Rest Exact Allow ${Date.now()}`, 90)
  const notice = page.getByRole('group', { name: 'On-time rest alerts' })
  await notice.getByRole('button', { name: 'Allow on-time alerts' }).click()
  await expect.poll(() => exactSettingOpened(page)).toBe(1)
  // Still off on the phone, so the notice waits for the app to come back.
  await expect(notice).toBeVisible()

  await simulateExactAlerts(page, 'granted')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(notice).toHaveCount(0)
})

for (const [label, permission, exact] of [
  ['on-time alerts are allowed', 'granted', 'granted'],
  ['notifications are off', 'denied', 'denied'],
] as const) {
  test(`no on-time alerts notice when ${label}`, async ({ page }) => {
    await stubNotificationPermission(page, permission)
    await firstLaunch(page)
    await simulateExactAlerts(page, exact)

    await logSetWithRest(page, `Local Rest Exact None ${Date.now()}`, 90)
    await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'On-time rest alerts' })).toHaveCount(0)
  })
}

test('when the phone refuses to open settings, the notice and the Account setting give written directions', async ({ page }) => {
  await stubNotificationPermission(page, 'denied')
  await firstLaunch(page)
  await page.evaluate(async () => {
    const { simulateSettingsFail } = await window.__rbImport('/src/lib/restLive.ts')
    await simulateSettingsFail(true)
  })

  const setting = await openRestAlertSetting(page)
  await setting.getByRole('button', { name: 'Open settings' }).click()
  await expect(setting.getByText('Settings > Notifications > RepBunny > Allow Notifications', { exact: false })).toBeVisible()
  await expect(setting.getByRole('button', { name: 'Open settings' })).toHaveCount(0)
  expect(await settingsOpened(page)).toBe(0)
})

test('the rest notice shows written directions when settings cannot be opened', async ({ page }) => {
  await stubNotificationPermission(page, 'denied')
  await firstLaunch(page)
  await page.evaluate(async () => {
    const { simulateSettingsFail } = await window.__rbImport('/src/lib/restLive.ts')
    await simulateSettingsFail(true)
  })

  await logSetWithRest(page, `Local Rest Directions ${Date.now()}`, 90)
  const notice = page.getByRole('group', { name: 'Rest alerts are off' })
  await notice.getByRole('button', { name: 'Open settings' }).click()
  await expect(notice.getByText('Settings > Notifications > RepBunny > Allow Notifications')).toBeVisible()
  await expect(notice.getByRole('button', { name: 'Open settings' })).toHaveCount(0)
})
