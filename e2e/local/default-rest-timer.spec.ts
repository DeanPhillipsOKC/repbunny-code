import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise, clickExerciseRowAction } from '../fixtures/exercise'
import { goTo } from '../fixtures/nav'
import { openAccountSection } from '../fixtures/account'

// Covers issue #90: Account > Preferences > Default rest timer
// (profiles.default_rest_seconds). An exercise's own rest_seconds wins;
// one without starts the default instead of no timer at all.

async function readCountdownSeconds(page: Page) {
  const text = (await page.locator('.rest-countdown').textContent())?.trim() ?? ''
  const [m, s] = text.split(':').map(Number)
  return m * 60 + s
}

async function logSet(page: Page) {
  await page.getByLabel('Reps').fill('10')
  await page.getByLabel('Weight').fill('45')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
}

test('default rest timer: set in Account, saved, and cleared back to off', async ({ page }) => {
  const userId = await startLocal(page)
  const account = page.getByRole('dialog', { name: 'Preferences' })
  const readDefault = async () => {
    const { data } = await localDb(page).from('profiles').select('default_rest_seconds').eq('id', userId).single()
    return data?.default_rest_seconds
  }

  await openAccountSection(page, 'Preferences')
  const input = account.getByLabel('Default rest timer')
  await expect(input).toHaveValue('')
  await expect(input).toHaveAttribute('placeholder', 'Off')

  await input.fill('90')
  await input.press('Enter')
  await expect.poll(readDefault, { timeout: 20_000 }).toBe(90)

  await page.reload()
  await openAccountSection(page, 'Preferences')
  await expect(account.getByLabel('Default rest timer')).toHaveValue('90')

  // Zero isn't a duration: the field goes back to the saved value.
  await account.getByLabel('Default rest timer').fill('0')
  await account.getByLabel('Default rest timer').press('Enter')
  await expect(account.getByLabel('Default rest timer')).toHaveValue('90')
  expect(await readDefault()).toBe(90)

  await account.getByLabel('Default rest timer').fill('')
  await account.getByLabel('Default rest timer').press('Enter')
  await expect.poll(readDefault, { timeout: 20_000 }).toBeNull()
})

test('default rest timer: an exercise without its own rest uses the default, one with its own keeps it', async ({
  page,
  stamp,
}) => {
  const plainName = `E2E Default Rest Plain ${stamp}`
  const ownName = `E2E Default Rest Own ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    defaultRestSeconds: 90,
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert([
        { user_id: userId, name: plainName },
        { user_id: userId, name: ownName, rest_seconds: 30 },
      ])
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, plainName, false)
  await logSet(page)
  await expect(page.locator('.rest-countdown')).toBeVisible()
  const plainSeconds = await readCountdownSeconds(page)
  expect(plainSeconds).toBeGreaterThan(80)
  expect(plainSeconds).toBeLessThanOrEqual(90)
  await page.getByRole('button', { name: 'Skip Rest' }).click()

  await selectExercise(page, ownName, false)
  await logSet(page)
  await expect(page.locator('.rest-countdown')).toBeVisible()
  expect(await readCountdownSeconds(page)).toBeLessThanOrEqual(30)
})

test('default rest timer: with no default, an exercise without rest gets no timer', async ({ page, stamp }) => {
  const name = `E2E No Default Rest ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await logSet(page)
  await expect(page.locator('.set-row-logged', { hasText: '10 × 45 lb' })).toBeVisible()
  await expect(page.locator('.rest-countdown')).toHaveCount(0)
})

test('default rest timer: exercise forms show the default as the Rest timer placeholder', async ({ page, stamp }) => {
  const name = `E2E Default Rest Form ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    defaultRestSeconds: 75,
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name })
    },
  })

  await goTo(page, 'Exercises')
  const row = page.locator('.row-wrap', { hasText: name })
  await clickExerciseRowAction(row, 'Edit exercise')
  const editSheet = page.getByRole('dialog', { name: 'Edit exercise' })
  await expect(editSheet.getByLabel('Rest timer (seconds)')).toHaveAttribute('placeholder', 'Default: 75, 0 = none')
  await editSheet.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'New exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'New exercise' })
  await expect(sheet.getByLabel('Rest timer (seconds)')).toHaveAttribute('placeholder', 'Default: 75, 0 = none')
})

test('default rest timer: 0 on an exercise turns its timer off while a default is set', async ({ page, stamp }) => {
  const name = `E2E Zero Rest ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    defaultRestSeconds: 90,
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name, rest_seconds: 45 })
    },
  })

  await goTo(page, 'Exercises')
  const row = page.locator('.row-wrap', { hasText: name })
  await clickExerciseRowAction(row, 'Edit exercise')
  const editSheet = page.getByRole('dialog', { name: 'Edit exercise' })
  await editSheet.getByLabel('Rest timer (seconds)').fill('0')
  await editSheet.getByRole('button', { name: 'Save' }).click()
  await expect(row.locator('.tag-pill', { hasText: 'No rest timer' })).toBeVisible()
  await expect(row.locator('.tag-pill', { hasText: 'Rest:' })).toHaveCount(0)
  const { data } = await admin.from('exercises').select('rest_seconds').eq('name', name).single()
  expect(data?.rest_seconds).toBe(0)

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, name, false)
  await logSet(page)
  await expect(page.locator('.set-row-logged', { hasText: '10 × 45 lb' })).toBeVisible()
  await expect(page.locator('.rest-countdown')).toHaveCount(0)

  // Clearing the field goes back to the default.
  await goTo(page, 'Exercises')
  await clickExerciseRowAction(row, 'Edit exercise')
  await editSheet.getByLabel('Rest timer (seconds)').fill('')
  await editSheet.getByRole('button', { name: 'Save' }).click()
  await expect(row.locator('.tag-pill', { hasText: 'No rest timer' })).toHaveCount(0)
  await expect
    .poll(async () => (await admin.from('exercises').select('rest_seconds').eq('name', name).single()).data?.rest_seconds)
    .toBeNull()
})
