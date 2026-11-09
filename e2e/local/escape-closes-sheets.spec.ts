import { test, expect, localDb, startLocal } from '../fixtures/local'

// Freeform only shows once the account has an exercise.
async function startWithExercise(page: Parameters<typeof startLocal>[0], name: string) {
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (id) => {
      await admin.from('exercises').insert({ user_id: id, name, muscle_group: 'chest' })
    },
  })
}

// Issue #783: Android's back gesture sends Escape to the topmost dialog
// (src/lib/androidBack.ts), so a sheet that ignores Escape leaves back doing
// nothing. The Add exercise sheet used to.
test('Escape closes the Add exercise sheet and leaves the workout open', async ({ page, stamp }) => {
  await startWithExercise(page, `E2E Escape ${stamp}`)
  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add your first exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await expect(sheet).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add your first exercise' })).toBeVisible()
})

test('Escape closes the New exercise sheet before the Add exercise sheet', async ({ page, stamp }) => {
  await startWithExercise(page, `E2E Escape ${stamp}`)
  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByRole('button', { name: /New exercise/ }).click()
  // Issue #781: New exercise opens its own sheet on top, so the footer button stays on the list below.
  const form = page.getByRole('dialog', { name: 'New exercise' })
  await expect(form).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(form).toHaveCount(0)
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: /New exercise/ })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
})
