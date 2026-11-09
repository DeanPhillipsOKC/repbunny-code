import { expect, type Page } from '@playwright/test'
import { goTo } from './nav'

// Issue #6: creating a template through the UI is now "Add routine" → name →
// "Next", which lands in the full-screen editor (TemplateEditor.vue) with
// the Add exercise sheet already open. Picks are added at 3 sets; each
// entry's `sets` is then stepped to its target with the card's −/+ buttons,
// waiting for every save so a caller that starts a workout right after reads
// the saved counts.
export async function createTemplateViaUi(page: Page, templateName: string, exercises: { name: string; sets: number }[]) {
  await goTo(page, 'Routines')
  await page.getByRole('button', { name: 'Add routine' }).click()
  const nameSheet = page.getByRole('dialog', { name: 'New routine' })
  await nameSheet.getByLabel('Name', { exact: true }).fill(templateName)
  await nameSheet.getByRole('button', { name: 'Next' }).click()

  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  for (const [index, exercise] of exercises.entries()) {
    await sheet.getByPlaceholder('Search exercises').fill(exercise.name)
    await sheet.getByRole('button', { name: exercise.name, exact: true }).click()
    await expect(page.locator('.ex-card')).toHaveCount(index + 1)
  }
  await sheet.getByRole('button', { name: 'Done' }).click()

  for (const exercise of exercises) {
    const card = page.locator('.ex-card', { hasText: exercise.name })
    for (let sets = 3; sets !== exercise.sets; sets += exercise.sets > sets ? 1 : -1) {
      const label = exercise.sets > sets ? `More sets for ${exercise.name}` : `Fewer sets for ${exercise.name}`
      // Issue #415: the on-device database queues every call in order, so a
      // later read always sees this save.
      await card.getByRole('button', { name: label }).click()
      await expect(card.locator('.sets-value b')).toHaveText(String(exercise.sets > sets ? sets + 1 : sets - 1))
    }
    await expect(card.locator('.sets-value b')).toHaveText(String(exercise.sets))
  }
}
