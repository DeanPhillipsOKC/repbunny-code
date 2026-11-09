import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { selectExercise, clickExerciseRowAction } from '../fixtures/exercise'

// Covers issue #22: the plate calculator (design source
// docs/design/issue-22-plate-calculator.html).

test('plate calculator: a library barbell lift shows Plates, breaks down a weight, and offers the closest when inexact', async ({ page, stamp }) => {
  const exerciseName = `E2E Plate Bench ${stamp}`
  const admin = localDb(page)
  // Seeded with a barbell library entry's id and no uses_barbell, so the
  // button comes from the library guess with no setup.
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName, library_id: 'barbell_bench_press' })
    },
  })
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)

  const weight = page.locator('.set-row-draft').first().getByLabel('Weight')
  await weight.fill('185')
  await page.getByRole('button', { name: 'Plates' }).click()

  const sheet = page.getByRole('dialog', { name: 'Load the bar' })
  await expect(sheet.getByLabel('Total weight')).toHaveValue('185')
  await expect(sheet.locator('.plate-chip')).toHaveText(['45', '25'])
  await expect(sheet.getByText('each side =')).toBeVisible()
  await sheet.getByRole('button', { name: 'Use 185 lb' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(weight).toHaveValue('185')

  // 187 can't be made with 2.5 lb as the smallest plate.
  await page.getByRole('button', { name: 'Plates' }).click()
  await sheet.getByLabel('Total weight').fill('187')
  await expect(sheet.getByText("You can't make")).toBeVisible()
  const lighter = sheet.getByRole('button', { name: /^185 lb/ })
  const heavier = sheet.getByRole('button', { name: /^190 lb/ })
  await expect(lighter).toHaveAttribute('aria-pressed', 'true')
  await expect(heavier).toContainText('Each side: 45, 25, 2.5')
  await heavier.click()
  await expect(heavier).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Use 190 lb' }).click()
  await expect(weight).toHaveValue('190')
})

test('plate calculator: a custom exercise has no Plates button until "Uses a barbell" is switched on', async ({ page, stamp }) => {
  const plain = `E2E Plate Plain ${stamp}`
  const switched = `E2E Plate Switched ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert([
        { user_id: userId, name: plain },
        { user_id: userId, name: switched },
      ])
    },
  })

  await goTo(page, 'Exercises')
  const row = page.locator('.row-wrap', { hasText: switched })
  await clickExerciseRowAction(row, 'Edit exercise')
  const editSheet = page.getByRole('dialog', { name: 'Edit exercise' })
  const toggle = editSheet.getByRole('switch', { name: 'Uses a barbell' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(editSheet.getByRole('button', { name: /45 lb\s*Standard/ })).toHaveAttribute('aria-pressed', 'true')
  await editSheet.getByRole('button', { name: 'Save' }).click()
  await expect(toggle).toHaveCount(0)

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, plain, false)
  await expect(page.locator('.set-row-draft').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Plates' })).toHaveCount(0)

  await selectExercise(page, switched, false)
  await expect(page.getByRole('button', { name: 'Plates' })).toBeVisible()
})

// Issue #48: the plate list moved from the Account sheet into "Load the bar".
test('plate calculator: turning off a plate from Edit in "Load the bar" changes the breakdown right away', async ({ page, stamp }) => {
  const exerciseName = `E2E Plate Gym ${stamp}`
  const admin = localDb(page)
  let userId = ''
  await startLocal(page, {
    beforeNavigate: async (id) => {
      userId = id
      await admin.from('profiles').update({ plates_lb: [45, 35, 25, 10, 5, 2.5] }).eq('id', id)
      await admin.from('exercises').insert({ user_id: id, name: exerciseName, uses_barbell: true })
    },
  })

  try {
    // The Account sheet no longer has the plate list.
    await page.getByRole('button', { name: 'Account' }).click()
    const account = page.getByRole('dialog', { name: 'Account' })
    await expect(account).toBeVisible()
    await expect(account.getByText('Plates at my gym')).toHaveCount(0)
    await account.getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: 'Freeform' }).click()
    await selectExercise(page, exerciseName, false)
    await page.locator('.set-row-draft').first().getByLabel('Weight').fill('185')
    await page.getByRole('button', { name: 'Plates' }).click()
    const sheet = page.getByRole('dialog', { name: 'Load the bar' })
    await expect(sheet.locator('.plate-chip')).toHaveText(['45', '25'])
    await expect(sheet.getByText('Your plates: 45, 35, 25, 10, 5, 2.5')).toBeVisible()

    await sheet.getByRole('button', { name: 'Edit' }).click()
    await expect(sheet.getByText('Plates at my gym')).toBeVisible()
    const plate45 = sheet.getByRole('button', { name: '45 lb plate' })
    await expect(plate45).toHaveAttribute('aria-pressed', 'true')
    await plate45.click()
    await expect(plate45).toHaveAttribute('aria-pressed', 'false')
    await expect(sheet.locator('.plate-chip')).toHaveText(['35', '35'])
    await expect(sheet.getByText('Your plates: 35, 25, 10, 5, 2.5')).toBeVisible()
    await expect
      .poll(async () => (await admin.from('profiles').select('plates_lb').eq('id', userId).single()).data?.plates_lb)
      .toEqual([35, 25, 10, 5, 2.5])

    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet.getByText('Plates at my gym')).toHaveCount(0)
  } finally {
    await admin.from('profiles').update({ plates_lb: [45, 35, 25, 10, 5, 2.5] }).eq('id', userId)
  }
})

test('plate calculator: Change bar stays available when the weight can\'t be made, and picking a bar re-runs it', async ({ page, stamp }) => {
  const exerciseName = `E2E Plate Unreachable ${stamp}`
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName, library_id: 'barbell_bench_press' })
    },
  })
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.locator('.set-row-draft').first().getByLabel('Weight').fill('187')
  await page.getByRole('button', { name: 'Plates' }).click()

  const sheet = page.getByRole('dialog', { name: 'Load the bar' })
  await expect(sheet.getByText("You can't make")).toBeVisible()
  await expect(sheet.getByText('Bar:')).toBeVisible()
  await sheet.getByRole('button', { name: 'Change', exact: true }).click()
  // Switching bars re-runs the calculation without retyping the weight.
  await sheet.getByRole('button', { name: /^35 lb/ }).click()
  await expect(sheet.getByText('Bar: 35 lb')).toBeVisible()
  await expect(sheet.getByLabel('Total weight')).toHaveValue('187')
})
