import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers issue #429: a 2:00 default rest for new installs, the rest screen's
// source line (where the time came from, with links to change it), "Keep"
// after -15s/+15s, and the one-time first-rest tip.

async function logSet(page: Page) {
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
}

async function countdownSeconds(page: Page) {
  const text = (await page.locator('.rest-countdown').textContent())?.trim() ?? ''
  const [m, s] = text.split(':').map(Number)
  return m * 60 + s
}

const restScreen = (page: Page) => page.locator('.rest-overlay')

test('rest source: a new install rests 2:00 by default and the line links to Account', async ({ page, stamp }) => {
  const name = `E2E Fresh Rest ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    defaultRestSeconds: 'fresh',
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await logSet(page)
  await expect(page.locator('.rest-countdown')).toBeVisible()
  const seconds = await countdownSeconds(page)
  expect(seconds).toBeGreaterThan(110)
  expect(seconds).toBeLessThanOrEqual(120)
  await expect(restScreen(page).getByText('Default rest 2:00')).toBeVisible()

  // Edit opens Account at the default rest; the rest keeps running, and
  // closing Account brings the rest screen back.
  await restScreen(page).getByRole('button', { name: 'Edit default rest' }).click()
  const prefs = page.getByRole('dialog', { name: 'Preferences', exact: true })
  await expect(prefs.getByLabel('Default rest timer')).toBeFocused()
  await expect(prefs.getByLabel('Default rest timer')).toHaveValue('120')
  await expect(page.locator('.rest-mini-bar')).toBeVisible()
  await prefs.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.rest-countdown')).toBeVisible()
  expect(await countdownSeconds(page)).toBeGreaterThan(90)

  // Set for opens the exercise's form at its rest field.
  await restScreen(page).getByRole('button', { name: `Set for ${name}` }).click()
  const form = page.getByRole('dialog', { name: 'Edit exercise' })
  await expect(form.getByLabel('Rest timer (seconds)')).toBeFocused()
  await form.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.rest-countdown')).toBeVisible()
})

test("rest source: an exercise's own rest is named, and Edit opens its form", async ({ page, stamp }) => {
  const name = `E2E Own Rest ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    defaultRestSeconds: 120,
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name, rest_seconds: 90 })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await logSet(page)
  await expect(restScreen(page).getByText(`${name} rest 1:30`)).toBeVisible()
  await expect(restScreen(page).getByText('Default rest')).toHaveCount(0)

  await restScreen(page).getByRole('button', { name: `Edit rest for ${name}` }).click()
  const form = page.getByRole('dialog', { name: 'Edit exercise' })
  await expect(form.getByLabel('Rest timer (seconds)')).toBeFocused()
  await expect(form.getByLabel('Rest timer (seconds)')).toHaveValue('90')
  await form.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.rest-countdown')).toBeVisible()
  await expect(restScreen(page).getByText(`${name} rest 1:30`)).toBeVisible()
})

test("rest source: Keep saves an adjusted rest as the exercise's own, and the next set uses it", async ({ page, stamp }) => {
  const name = `E2E Keep Rest ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    defaultRestSeconds: 120,
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await logSet(page)
  await expect(restScreen(page).getByText('Default rest 2:00')).toBeVisible()
  // No adjustment, no offer.
  await expect(restScreen(page).getByRole('button', { name: /^Keep/ })).toHaveCount(0)

  await restScreen(page).getByRole('button', { name: '-15s' }).click()
  await restScreen(page).getByRole('button', { name: `Keep 1:45 for ${name}` }).click()
  await expect(restScreen(page).getByText(`Saved for ${name}`)).toBeVisible()
  await expect(restScreen(page).getByText(`${name} rest 1:45`)).toBeVisible()
  await expect
    .poll(async () => (await admin.from('exercises').select('rest_seconds').eq('name', name).single()).data?.rest_seconds)
    .toBe(105)
  // The Account default is untouched.
  expect((await admin.from('profiles').select('default_rest_seconds').single()).data?.default_rest_seconds).toBe(120)

  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await logSet(page)
  await expect(page.locator('.rest-countdown')).toBeVisible()
  const seconds = await countdownSeconds(page)
  expect(seconds).toBeGreaterThan(95)
  expect(seconds).toBeLessThanOrEqual(105)
  await expect(restScreen(page).getByText(`${name} rest 1:45`)).toBeVisible()
})

test('rest source: the first-rest tip shows once and never again after dismissal', async ({ page, stamp }) => {
  const name = `E2E Rest Tip ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    defaultRestSeconds: 'fresh',
    restTip: true,
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await logSet(page)
  const tip = page.getByRole('group', { name: 'Rest timer tip' })
  await expect(tip).toContainText("Your rest timer starts after each set. It's 2:00 for now.")
  await expect(tip.getByRole('button', { name: 'all exercises' })).toBeVisible()
  await expect(tip.getByRole('button', { name: `just ${name}` })).toBeVisible()
  // The tip stands in for the source line.
  await expect(restScreen(page).getByText('Default rest 2:00')).toHaveCount(0)

  await tip.getByRole('button', { name: 'Dismiss tip' }).click()
  await expect(tip).toHaveCount(0)
  await expect(restScreen(page).getByText('Default rest 2:00')).toBeVisible()

  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await logSet(page)
  await expect(page.locator('.rest-countdown')).toBeVisible()
  await expect(tip).toHaveCount(0)
  await expect(restScreen(page).getByText('Default rest 2:00')).toBeVisible()
})
