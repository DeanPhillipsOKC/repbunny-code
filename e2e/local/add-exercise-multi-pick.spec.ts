import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { closeAddExerciseSheet } from '../fixtures/exercise'

// Issue #43: in the active-workout logger the Add exercise sheet stays open
// across picks. Each pick joins the deck and stays listed as "✓ Added"
// (tapping it again un-picks it), a floating "{N} added · Done" bar appears,
// and Done makes the first pick current.

const LIBRARY: { id: string; name: string }[] = JSON.parse(
  readFileSync(new URL('../../src/data/exercise-library.json', import.meta.url), 'utf-8'),
)

async function clearLibraryExercise(page: Page, userId: string, name: string) {
  const admin = localDb(page)
  const id = LIBRARY.find((entry) => entry.name === name)!.id
  await admin.from('exercises').delete().eq('user_id', userId).eq('name', name)
  await admin.from('exercises').delete().eq('user_id', userId).eq('library_id', id)
}

test('freeform: pick several exercises without reopening the sheet, un-pick one, then Done', async ({ page, stamp }) => {
  const nameA = `E2E Multi A ${stamp}`
  const nameB = `E2E Multi B ${stamp}`
  const nameC = `E2E Multi C ${stamp}`
  const libraryName = 'Hack Squat'
  const admin = localDb(page)
  let userId = ''

  try {
    userId = await startLocal(page, {
      beforeNavigate: async (id) => {
        await clearLibraryExercise(page, id, libraryName)
        await admin.from('exercises').insert([
          { user_id: id, name: nameA, muscle_group: 'chest' },
          { user_id: id, name: nameB, muscle_group: 'back' },
          { user_id: id, name: nameC, muscle_group: 'arms' },
        ])
      },
    })

    await page.getByRole('button', { name: 'Freeform' }).click()
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add exercise' })
    const bar = sheet.getByRole('status').filter({ hasText: 'added' })

    // Nothing picked: the X, no bar.
    await expect(sheet.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
    await expect(bar).toHaveCount(0)

    const search = sheet.getByPlaceholder('Search exercises')
    await search.fill(`E2E Multi`)
    await sheet.getByRole('button', { name: nameA, exact: true }).click()
    await expect(sheet.getByRole('button', { name: nameA, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(bar).toContainText('1 added')
    // The search text survives a pick.
    await expect(search).toHaveValue('E2E Multi')

    await sheet.getByRole('button', { name: nameB, exact: true }).click()
    await sheet.getByRole('button', { name: nameC, exact: true }).click()
    await expect(bar).toContainText('3 added')

    // Tapping an added row again un-picks it.
    await sheet.getByRole('button', { name: nameC, exact: true }).click()
    await expect(sheet.getByRole('button', { name: nameC, exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(bar).toContainText('2 added')

    // A library "+ Add" joins the same session; the chip stays selected.
    await search.fill('')
    const chips = sheet.getByRole('group', { name: 'Filter by muscle group' })
    await chips.getByRole('button', { name: 'Legs', exact: true }).click()
    await sheet.getByRole('button', { name: `Add ${libraryName}` }).click()
    await expect(bar).toContainText('3 added')
    await expect(chips.getByRole('button', { name: 'Legs', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.getByRole('button', { name: libraryName, exact: true })).toHaveAttribute('aria-pressed', 'true')

    await closeAddExerciseSheet(page)

    // All 3 in the deck (C was un-picked), and the first pick is current.
    await expect(page.locator('.exercise-card-name')).toHaveText(nameA)
    await expect(page.getByText('1 / 3', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: nameB, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: libraryName, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: nameC, exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Finish workout' }).click()
    await page.getByRole('button', { name: 'Discard workout' }).click()
  } finally {
    if (userId) await clearLibraryExercise(page, userId, libraryName)
  }
})

test('templated: one pick followed by Done still works', async ({ page, stamp }) => {
  const templateExercise = `E2E Multi Template Ex ${stamp}`
  const extra = `E2E Multi Extra ${stamp}`
  const templateName = `E2E Multi Template ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercises } = await admin
        .from('exercises')
        .insert([
          { user_id: userId, name: templateExercise },
          { user_id: userId, name: extra },
        ])
        .select('id, name')
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      const templateExerciseId = exercises!.find((e) => e.name === templateExercise)!.id
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: templateExerciseId, position: 0 })
    },
  })

  await page.getByRole('button', { name: templateName, exact: true }).click()
  await expect(page.locator('.exercise-card-name')).toHaveText(templateExercise)
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByPlaceholder('Search exercises').fill(extra)
  await sheet.getByRole('button', { name: extra, exact: true }).click()
  await expect(sheet.getByRole('status').filter({ hasText: 'added' })).toContainText('1 added')
  await closeAddExerciseSheet(page)

  await expect(page.locator('.exercise-card-name')).toHaveText(extra)
  // (Matched by text: the card's slide transition briefly mounts two.)
  await expect(page.getByText('2 / 2', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()
})

test('layout at 375px: the floating bar never covers the last row', async ({ page, stamp }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  const names = Array.from({ length: 12 }, (_, i) => `E2E Multi Row ${String(i).padStart(2, '0')} ${stamp}`)
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert(names.map((name) => ({ user_id: userId, name, muscle_group: 'chest' })))
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByPlaceholder('Search exercises').fill(`E2E Multi Row`)
  await sheet.getByRole('button', { name: names[0], exact: true }).click()
  const bar = sheet.getByRole('status').filter({ hasText: 'added' })
  await expect(bar).toContainText('1 added')

  // Scroll the list to its end: the last row sits fully above the bar.
  const last = sheet.getByRole('button', { name: names[names.length - 1], exact: true })
  await last.scrollIntoViewIfNeeded()
  await sheet.locator('.sheet-body').evaluate((el) => el.scrollTo(0, el.scrollHeight))
  const lastBox = (await last.boundingBox())!
  const barBox = (await bar.boundingBox())!
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barBox.y)
  // And the bar stays inside the viewport.
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(667)
  // "Manage exercises" reads as a text link, not a boxed row like the exercises.
  const manage = sheet.getByRole('button', { name: 'Manage exercises', exact: true })
  await expect(manage).toHaveCSS('border-top-style', 'none')
  await expect(manage).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  await closeAddExerciseSheet(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()
})
