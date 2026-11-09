import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup, selectExercise, openNewExerciseSheet } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'

// Issue #836: scheduleRestAlert hands the plugin a different sound setting per
// platform (#828: an iOS alert with no sound is silent). Nothing else calls it
// with the platform set to iOS, so these read the scheduled alert back through
// LocalNotifications.getPending() with the platform stubbed.

type PendingAlert = { id: number; sound?: string; channelId?: string }

async function pendingAlerts(page: Page): Promise<PendingAlert[]> {
  return page.evaluate(async () => {
    const plugins = (window as unknown as { Capacitor: { Plugins: Record<string, any> } }).Capacitor.Plugins
    const { notifications } = await plugins.LocalNotifications.getPending()
    return JSON.parse(JSON.stringify(notifications))
  })
}

async function stubGrantedNotifications(page: Page) {
  await page.addInitScript(() => {
    class FakeNotification extends EventTarget {
      static get permission() {
        return 'granted'
      }
      static async requestPermission() {
        return 'granted'
      }
      constructor() {
        super()
      }
      close() {}
    }
    Object.assign(window, { Notification: FakeNotification })
  })
}

// The browser build can't be iOS or Android from the start (its SQLite is the
// web one), so the platform is reported only while the alert is scheduled.
async function scheduledAlertOn(page: Page, platform: 'ios' | 'android'): Promise<PendingAlert> {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()

  const name = `Rest Platform ${platform} ${Date.now()}`
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
  await page.evaluate((p) => {
    const w = window as any
    w.__realPlatform = w.Capacitor.getPlatform
    w.Capacitor.getPlatform = () => p
  }, platform)
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect.poll(async () => (await pendingAlerts(page)).length).toBe(1)
  await page.evaluate(() => {
    const w = window as any
    w.Capacitor.getPlatform = w.__realPlatform
  })
  const [alert] = await pendingAlerts(page)
  return alert
}

test('on iOS the rest alert carries the chime as a bundled .caf sound', async ({ page }) => {
  await stubGrantedNotifications(page)
  const alert = await scheduledAlertOn(page, 'ios')
  expect(alert.sound).toBe('rest-alert-classic.caf')
  expect(alert.channelId).toBeUndefined()
})

test('on Android the rest alert is on the chime channel with no sound of its own', async ({ page }) => {
  await stubGrantedNotifications(page)
  const alert = await scheduledAlertOn(page, 'android')
  expect(alert.channelId).toBe('rest-alert-classic-v1')
  expect(alert.sound).toBeUndefined()
})
