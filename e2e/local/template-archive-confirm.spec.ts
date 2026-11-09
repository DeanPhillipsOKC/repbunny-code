import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Covers docs/backlog.md item 35: archiving a template used to fire
// immediately on click with no way back — this checks the inline confirm
// step (same pattern as WorkoutHistory.vue's workout delete) both cancels
// without archiving and, once confirmed, actually archives.
test('archiving a template requires an explicit confirm step', async ({ page, stamp }) => {
  const templateName = `E2E Archive Confirm ${stamp}`

  const admin = localDb(page)

  // The template is pre-existing state this test archives, not behavior
  // under test -- seed it directly via the admin client instead of driving
  // the Templates UI (item 57's pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('workout_templates').insert({ user_id: userId, name: templateName })
    },
  })

  await goTo(page, 'Routines')
  await expect(page.getByText(templateName)).toBeVisible()

  // TemplateManager.vue's own fetch orders templates by name, so a
  // freshly-seeded template (unlike one just created through the UI, which
  // the store simply appends to its in-memory list) can land anywhere in
  // the row list, not necessarily last -- resolve its position once up
  // front instead. Grabbed by position from there on rather than via
  // `hasText: templateName`, since the confirm step swaps the template's
  // name out of the row entirely — a hasText filter would stop matching the
  // instant the confirm UI appears.
  const rows = page.locator('.row-wrap')
  const index = await rows.evaluateAll(
    (elements, name) => elements.findIndex((el) => el.textContent?.includes(name)),
    templateName,
  )
  const row = rows.nth(index)
  await row.getByRole('button', { name: 'Archive' }).click()
  const warning = row.getByText("Archive this routine? You can restore it from Archived routines.")
  await expect(warning).toBeVisible()
  // Issue #6: tapping the row opens the editor, but the archive button must not.
  await expect(page).toHaveURL(/\/templates$/)

  // item 74: the warning text must stack above the button row, not squeeze
  // into a narrow wrapped column beside it.
  const warningBox = await warning.boundingBox()
  const actionsBox = await row.getByRole('button', { name: 'Confirm archive' }).boundingBox()
  expect(warningBox).not.toBeNull()
  expect(actionsBox).not.toBeNull()
  expect(actionsBox!.y).toBeGreaterThanOrEqual(warningBox!.y + warningBox!.height - 1)

  await row.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText(templateName)).toBeVisible()
  await expect(row.getByRole('button', { name: 'Archive' })).toBeVisible()

  await row.getByRole('button', { name: 'Archive' }).click()
  await row.getByRole('button', { name: 'Confirm archive' }).click()
  // Issue #495: it moves to Archived routines, out of the active list.
  await expect(page.locator('.archived').getByText(templateName)).toBeVisible()
  await expect(page.locator('.archived')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Archive routine' })).toHaveCount(0)
})
