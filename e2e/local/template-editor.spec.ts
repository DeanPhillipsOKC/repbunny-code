import type { Locator, Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup } from '../fixtures/exercise'

// Issue #6: the Templates tab's inline expand was replaced by a full-screen
// editor at /templates/:id (TemplateEditor.vue), reached right after naming
// a new template or by tapping an existing template's row.

const cards = (page: Page) => page.locator('.ex-card')
const setsValue = (card: Locator) => card.locator('.sets-value b')

async function openTemplate(page: Page, name: string) {
  await goTo(page, 'Routines')
  await page.locator('.row-wrap', { hasText: name }).locator('.row-title').click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

test('new template: Next opens the editor with the picker up, picks keep it open', async ({ page, stamp }) => {
  const templateName = `E2E Editor New ${stamp}`
  const benchName = `E2E Editor Bench ${stamp}`
  const rowName = `E2E Editor Row ${stamp}`
  const createdName = `E2E Editor Created ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert([
        { user_id: userId, name: benchName },
        { user_id: userId, name: rowName },
      ])
    },
  })

  await goTo(page, 'Routines')
  await page.getByRole('button', { name: 'Add routine' }).click()
  const nameSheet = page.getByRole('dialog', { name: 'New routine' })
  await expect(nameSheet.getByRole('heading', { name: 'New routine' })).toBeVisible()
  await nameSheet.getByLabel('Name', { exact: true }).fill(templateName)
  await nameSheet.getByRole('button', { name: 'Next' }).click()

  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: templateName })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav.getByRole('link', { name: 'Routines' })).toHaveClass(/active/)

  // The picker opens by itself on a brand-new template, and stays open
  // across picks.
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(sheet).toBeVisible()
  await sheet.getByPlaceholder('Search exercises').fill(benchName)
  await sheet.getByRole('button', { name: benchName, exact: true }).click()
  await expect(sheet.getByRole('button', { name: benchName, exact: true })).toBeDisabled()
  await expect(sheet.getByRole('button', { name: benchName, exact: true })).toContainText('✓ Added · 3 sets')

  await sheet.getByPlaceholder('Search exercises').fill(rowName)
  await sheet.getByRole('button', { name: rowName, exact: true }).click()
  await expect(sheet.getByRole('button', { name: rowName, exact: true })).toBeDisabled()

  // A brand-new exercise can be created here too, and lands at 3 sets.
  await sheet.getByPlaceholder('Search exercises').fill('')
  await sheet.getByRole('button', { name: 'New exercise', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'New exercise' })
  await pickMuscleGroup(form)
  await form.getByLabel('Name', { exact: true }).fill(createdName)
  await form.getByRole('button', { name: 'Add exercise' }).click()
  await expect(form).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'New exercise' })).toBeVisible()
  await expect(sheet).toBeVisible()

  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)

  await expect(cards(page)).toHaveCount(3)
  await expect(cards(page).nth(0)).toContainText(benchName)
  await expect(cards(page).nth(1)).toContainText(rowName)
  await expect(cards(page).nth(2)).toContainText(createdName)
  for (let i = 0; i < 3; i++) await expect(setsValue(cards(page).nth(i))).toHaveText('3')

  await page.getByRole('button', { name: 'Back to routines' }).click()
  await expect(page).toHaveURL(/\/templates$/)
  const row = page.locator('.row-wrap', { hasText: templateName })
  await expect(row.locator('.row-sub')).toHaveText(/^3 exercises ·/)

  // Opening an existing template never auto-opens the picker.
  await row.locator('.row-title').click()
  await expect(page.getByRole('heading', { name: templateName })).toBeVisible()
  await expect(cards(page)).toHaveCount(3)
  await expect(page.getByRole('dialog', { name: 'Add exercise' })).toHaveCount(0)
})

test('existing template: rename, category, stepper, reorder and remove + Undo all persist', async ({ page, stamp }) => {
  const oldName = `E2E Editor Zorb ${stamp}`
  const newName = `E2E Editor Renamed ${stamp}`
  const names = {
    a: `E2E Editor Alpha ${stamp}`,
    b: `E2E Editor Bravo ${stamp}`,
    c: `E2E Editor Charlie With A Really Long Exercise Name ${stamp}`,
  }
  const admin = localDb(page)
  let templateId = ''

  await page.setViewportSize({ width: 375, height: 800 })
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercises } = await admin
        .from('exercises')
        .insert([names.a, names.b, names.c].map((name) => ({ user_id: userId, name })))
        .select('id, name')
      const idOf = (name: string) => exercises!.find((e) => e.name === name)!.id
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: oldName })
        .select('id')
        .single()
      templateId = template!.id
      // C is a legacy row with no set count.
      await admin.from('workout_template_exercises').insert([
        { template_id: templateId, exercise_id: idOf(names.a), position: 0, target_sets: 3 },
        { template_id: templateId, exercise_id: idOf(names.b), position: 1, target_sets: 3 },
        { template_id: templateId, exercise_id: idOf(names.c), position: 2, target_sets: null },
      ])
    },
  })

  await openTemplate(page, oldName)
  await expect(page.getByRole('dialog', { name: 'Add exercise' })).toHaveCount(0)
  await expect(cards(page)).toHaveCount(3)

  // Rename: blank is rejected, then a real name saves.
  await page.getByRole('heading', { name: oldName }).getByRole('button').click()
  await page.getByLabel('Name', { exact: true }).fill('   ')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Name cannot be empty.')).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill(newName)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: newName })).toBeVisible()
  await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0)

  // Category: automatic guess first, then a pick, back to automatic, then a
  // pick that's left in place for the reload check.
  const picker = page.getByRole('group', { name: 'Category' })
  await expect(picker.getByText('Auto: Other')).toBeVisible()
  await expect(picker.locator('.category-option.auto')).toHaveAttribute('data-category', 'other')
  await picker.getByRole('button', { name: 'Core', exact: true }).click()
  await expect(picker.getByRole('button', { name: 'Core', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await picker.getByRole('button', { name: 'Use automatic' }).click()
  await expect(picker.getByText('Auto: Other')).toBeVisible()
  await picker.getByRole('button', { name: 'Upper', exact: true }).click()
  await expect(picker.getByRole('button', { name: 'Upper', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // Stepper: minimum of 1, and a legacy null row starts at 1 on its first +.
  const cardA = cards(page).filter({ hasText: names.a })
  const cardC = cards(page).filter({ hasText: names.c })
  await cardA.getByRole('button', { name: `Fewer sets for ${names.a}` }).click()
  await expect(setsValue(cardA)).toHaveText('2')
  await cardA.getByRole('button', { name: `Fewer sets for ${names.a}` }).click()
  await expect(setsValue(cardA)).toHaveText('1')
  await expect(cardA.getByRole('button', { name: `Fewer sets for ${names.a}` })).toBeDisabled()
  await cardA.getByRole('button', { name: `More sets for ${names.a}` }).click()
  await expect(setsValue(cardA)).toHaveText('2')

  await expect(setsValue(cardC)).toHaveText('–')
  await expect(cardC.getByRole('button', { name: `Fewer sets for ${names.c}` })).toBeDisabled()
  await cardC.getByRole('button', { name: `More sets for ${names.c}` }).click()
  await expect(setsValue(cardC)).toHaveText('1')

  // Layout at phone width: one line per card, stepper and trash inside the
  // card, the long name ellipsized, and no horizontal page scroll.
  for (let i = 0; i < 3; i++) {
    const card = cards(page).nth(i)
    const cardBox = (await card.boundingBox())!
    const stepperBox = (await card.locator('.stepper').boundingBox())!
    const trashBox = (await card.locator('.trash-btn').boundingBox())!
    expect(cardBox.height).toBeLessThan(70)
    expect(trashBox.x + trashBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5)
    expect(Math.abs(stepperBox.y + stepperBox.height / 2 - (trashBox.y + trashBox.height / 2))).toBeLessThan(2)
    expect(stepperBox.x + stepperBox.width).toBeLessThanOrEqual(trashBox.x)
  }
  const nameEl = cardC.locator('.ex-name')
  expect(await nameEl.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  const chips = picker.locator('.category-option')
  const pickerBox = (await picker.boundingBox())!
  for (let i = 0; i < 6; i++) {
    const box = (await chips.nth(i).boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(pickerBox.x + pickerBox.width + 0.5)
  }

  // Drag: C's grip dragged above A. Order becomes C, A, B.
  const gripC = cardC.locator('.grip')
  const gripBox = (await gripC.boundingBox())!
  const firstBox = (await cards(page).nth(0).boundingBox())!
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(gripBox.x + gripBox.width / 2, firstBox.y + 4, { steps: 12 })
  await expect(page.locator('.drop-slot')).toHaveCount(1)
  await page.mouse.up()
  await expect(cards(page).nth(0)).toContainText(names.c)
  await expect(cards(page).nth(1)).toContainText(names.a)
  await expect(cards(page).nth(2)).toContainText(names.b)

  // Keyboard: arrow up on B's grip moves it above A. Order C, B, A.
  await page.getByRole('button', { name: `Reorder ${names.b}` }).focus()
  await page.keyboard.press('ArrowUp')
  await expect(cards(page).nth(1)).toContainText(names.b)
  await expect(cards(page).nth(2)).toContainText(names.a)
  await expect(page.getByRole('button', { name: `Reorder ${names.b}` })).toBeFocused()

  // Remove B, then Undo puts it back where it was, with its set count.
  await page.getByRole('button', { name: `Remove ${names.b}` }).click()
  await expect(cards(page)).toHaveCount(2)
  const toast = page.getByRole('status').filter({ hasText: `Removed ${names.b}` })
  await expect(toast).toBeVisible()
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(toast).toHaveCount(0)
  await expect(cards(page)).toHaveCount(3)
  await expect(cards(page).nth(1)).toContainText(names.b)
  await expect(setsValue(cards(page).nth(1))).toHaveText('3')

  // Remove A for good (no Undo); its toast goes away on its own.
  await page.getByRole('button', { name: `Remove ${names.a}` }).click()
  await expect(page.getByRole('status').filter({ hasText: `Removed ${names.a}` })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: `Removed ${names.a}` })).toHaveCount(0, { timeout: 8000 })

  // Everything survives a reload.
  await page.reload()
  await expect(page.getByRole('heading', { name: newName })).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Upper', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(cards(page)).toHaveCount(2)
  await expect(cards(page).nth(0)).toContainText(names.c)
  await expect(cards(page).nth(1)).toContainText(names.b)
  await expect(setsValue(cards(page).nth(0))).toHaveText('1')
  await expect(setsValue(cards(page).nth(1))).toHaveText('3')

  const { data: rows } = await admin
    .from('workout_template_exercises')
    .select('position, target_sets, exercises(name)')
    .eq('template_id', templateId)
    .order('position')
  expect(rows!.map((r) => (r.exercises as unknown as { name: string }).name)).toEqual([names.c, names.b])
  expect(rows!.map((r) => r.target_sets)).toEqual([1, 3])
})

test('an unknown template id goes back to the Templates list', async ({ page }) => {
  await startLocal(page)
  await page.goto('/templates/00000000-0000-0000-0000-000000000000')
  await expect(page).toHaveURL(/\/templates$/)
  await expect(page.getByRole('button', { name: 'Add routine' })).toBeVisible()
})
