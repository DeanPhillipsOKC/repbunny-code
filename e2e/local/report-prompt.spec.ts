import { test, expect, startLocal } from '../fixtures/local'
import { selectExercise } from '../fixtures/exercise'

// Issue #234: an error the user would notice offers a one-tap bug report,
// once per kind and message in a session, and the report it opens has that
// error checked, the steps that led to it, and the device lines, never the
// values typed or the user's own names. Issue #938 moved this here from the
// retired Supabase-mode spec, which failed a set save over the network; on
// the device an unhandled rejection stands in for it.

test.use({ viewport: { width: 375, height: 800 } })

function reject(page: import('@playwright/test').Page, message: string) {
  return page.evaluate((m) => {
    void Promise.reject(new Error(m))
  }, message)
}

test('an error offers a report once, and Send report opens it with the steps', async ({ page, db, stamp }) => {
  const name = `E2E Report Prompt ${stamp}`
  await startLocal(page, {
    beforeNavigate: async () => {
      const { error } = await db.from('exercises').insert({ name })
      if (error) throw new Error(error.message)
    },
  })
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, name, false)
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('7')
  await row.getByLabel('Weight').fill('437.5')

  await reject(page, `first failure ${stamp}`)
  const prompt = page.getByRole('region', { name: 'Something went wrong' })
  await expect(prompt).toContainText('Something went wrong. Send a report?')
  // Not a modal: the set row stays usable underneath.
  await expect(row.getByRole('button', { name: 'Add set' })).toBeEnabled()

  // The same error again doesn't ask twice in one session.
  await prompt.getByRole('button', { name: 'Not now' }).click()
  await expect(prompt).toBeHidden()
  await reject(page, `first failure ${stamp}`)
  await page.waitForTimeout(500)
  await expect(prompt).toBeHidden()

  // A different error asks again; Send report opens Report a bug on it.
  await reject(page, `e2e rejection ${stamp}`)
  await prompt.getByRole('button', { name: 'Send report' }).click()
  await expect(prompt).toBeHidden()
  const sheet = page.getByRole('dialog', { name: 'Report a bug' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('checkbox', { name: new RegExp(`e2e rejection ${stamp}`) })).toBeChecked()
  // The first error was logged twice: both listed, neither checked.
  const earlier = sheet.getByRole('checkbox', { name: new RegExp(`first failure ${stamp}`) })
  await expect(earlier).toHaveCount(2)
  for (const box of await earlier.all()) await expect(box).not.toBeChecked()

  await sheet.getByText('Preview report').click()
  const preview = sheet.getByLabel('Report preview')
  await expect(preview).toContainText(`Message: e2e rejection ${stamp}`)
  await expect(preview).toContainText('Steps before it:')
  await expect(preview).toContainText('Screen home')
  await expect(preview).toContainText('Tap "Freeform')
  await expect(preview).toContainText('Build: ')
  await expect(preview).toContainText('Device model: ')
  await expect(preview).toContainText('Storage: On this device')
  // Names and typed values stay out of the trail.
  await expect(preview).not.toContainText('437.5')
  await expect(preview).not.toContainText(name)
})
