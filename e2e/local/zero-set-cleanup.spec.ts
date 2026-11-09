import { test, expect, localDb, startLocal } from '../fixtures/local'

// Covers docs/backlog.md item 9: a workout finished with zero sets logged
// must not leave a `workouts` row behind. Confirms via the admin client that
// the row is actually gone from the database, not just hidden from the UI.
test('finishing a workout with no sets deletes the workout row', async ({ page, stamp }) => {
  const admin = localDb(page)

  // The start-workout tiles only render once the
  // account has at least one active exercise (docs/backlog-archive.md item
  // 27's zero-exercise welcome card) — this test doesn't care which
  // exercise, just that the account isn't empty, so seed a throwaway one
  // directly via the admin client (item 57's pattern) instead of driving the
  // Exercises UI just to get past the welcome screen.
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: `E2E Baseline ${stamp}` })
    },
  })

  // Item 111: notes moved off the start screen, so the row is tracked by the
  // active-workout id the app persists (stores/workouts.ts) instead.
  await page.getByRole('button', { name: 'Freeform' }).click()
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible()
  const workoutId = await page.evaluate(() => localStorage.getItem('repbunny-active-workout-id'))
  expect(workoutId).toBeTruthy()
  const before = await admin.from('workouts').select('id').eq('id', workoutId!)
  expect(before.data).toHaveLength(1)
  await page.getByRole('button', { name: 'Finish workout' }).click()

  // Backlog item 51: an empty finish now asks for confirmation before the
  // workout row gets discarded.
  await expect(page.getByText('Finish with no sets logged?')).toBeVisible()
  await page.getByRole('button', { name: 'Discard workout' }).click()

  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()

  const { data, error } = await admin.from('workouts').select('id').eq('id', workoutId!)
  expect(error).toBeNull()
  expect(data).toEqual([])
})
