import { readFileSync } from 'node:fs'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { clickExerciseRowAction } from '../fixtures/exercise'

// Issue #842: the library grew from free-exercise-db (scripts/import-exercises.mjs).
// Imported entries search, browse, and link like the originals.

const LIBRARY: { id: string; name: string; muscleGroup: string }[] = JSON.parse(
  readFileSync(new URL('../../src/data/exercise-library.json', import.meta.url), 'utf-8'),
)

test('library: imported entries show up in search, by alias, and in their muscle group', async ({ page }) => {
  await startLocal(page)
  await goTo(page, 'Exercises')
  await page.getByRole('group', { name: 'Exercises view' }).getByRole('button', { name: 'Library' }).click()

  expect(LIBRARY.length).toBeGreaterThanOrEqual(300)
  await expect(page.getByText(`${LIBRARY.length} exercises, ready to go`)).toBeVisible()

  // An imported name, and an imported entry found by its alias.
  const search = page.getByRole('searchbox', { name: 'Search the library' })
  await search.fill('zottman')
  await expect(page.getByRole('button', { name: 'View Zottman Curl', exact: true })).toBeVisible()
  await search.fill('yates row')
  await expect(page.getByRole('button', { name: 'View Reverse-Grip Barbell Row', exact: true })).toBeVisible()
  // A source alias added to an original entry.
  await search.fill('thigh abductor')
  await expect(page.getByRole('button', { name: 'View Hip Abductor Machine', exact: true })).toBeVisible()
  await search.fill('')

  // Browse by muscle lists originals and imports together, alphabetically.
  const legs = LIBRARY.filter((e) => e.muscleGroup === 'legs').length
  await page.getByRole('button', { name: `Legs, ${legs} exercises` }).click()
  await expect(page.locator('.library-row')).toHaveCount(legs)
  const names = await page.locator('.library-row .library-row-name').allTextContents()
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
  expect(names).toContain('Leg Press')
  expect(names).toContain('Nordic Hamstring Curl')

  // An imported entry's detail has its own how-to and tracking.
  await page.getByRole('button', { name: 'View Nordic Hamstring Curl', exact: true }).click()
  await expect(page).toHaveURL(/\/exercises\/library\/nordic_hamstring_curl$/)
  await expect(page.getByText('Bodyweight × reps')).toBeVisible()
  await page.getByRole('button', { name: 'How to' }).click()
  await expect(page.locator('.how-to-steps li')).toHaveCount(3)
})

test('library link: custom exercises are offered matching imported entries', async ({ page }) => {
  await startLocal(page, {
    beforeNavigate: async (id) => {
      const { error } = await localDb(page)
        .from('exercises')
        .insert([
          { user_id: id, name: 'Zottman Curls', muscle_group: 'arms', load_type: 'weight' },
          { user_id: id, name: 'Nordic Curls', muscle_group: 'legs', load_type: 'bodyweight' },
        ])
      if (error) throw new Error(error.message)
    },
  })
  await goTo(page, 'Exercises')

  const banner = page.getByRole('link', { name: /might match the library/ })
  await expect(banner).toHaveText(/2 exercises might match the library/)
  await banner.click()
  await expect(page.getByRole('listitem', { name: 'Zottman Curls' })).toContainText('Same as Zottman Curl?')
  await expect(page.getByRole('listitem', { name: 'Nordic Curls' })).toContainText('Same as Nordic Hamstring Curl?')
  await page.getByRole('button', { name: 'Done' }).click()

  // The edit sheet's Library match row suggests and links the same entry.
  await goTo(page, 'Exercises')
  await clickExerciseRowAction(page.locator('.row-wrap', { hasText: 'Nordic Curls' }), 'Edit exercise')
  const field = page.getByRole('dialog', { name: 'Edit exercise' }).getByRole('group', { name: 'Library match' })
  await expect(field).toContainText('Looks like Nordic Hamstring Curl.')
  await field.getByRole('button', { name: 'Link it' }).click()
  await expect(field.getByTestId('library-link-status')).toHaveText('Linked to Nordic Hamstring Curl')
})
