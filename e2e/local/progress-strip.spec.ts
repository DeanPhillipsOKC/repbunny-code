import { test, expect, localDb, startLocal } from '../fixtures/local'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Finishing a workout with at least one set shows the post-finish recap
// (item 106; earlier, a freeform finish showed a "Resume your workout?" card)
// in place of the Home screen, including the progress strip this spec reads,
// until it's dismissed with "Done". Two earlier next-item runs misdiagnosed
// that covering card as the shared-account row-leak flake; it's just the
// card, so it's dismissed below before the strip is read.

// Covers docs/backlog.md item 19: Log home screen's progress strip. Reads
// the "workouts this week" tile before/after so the test doesn't depend on
// the account's pre-existing count (other specs also log workouts). Each
// Playwright worker signs in as its own dedicated test account (item 82,
// e2e/fixtures/auth.ts) and runs one test at a time, so no other spec can
// log a workout against *this* account between this test's before/after
// reads, regardless of how many workers the suite runs with.
test('progress strip: workouts-this-week count and recent-PR tile update after finishing a workout', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Deadlift ${stamp}`

  const admin = localDb(page)

  // The progress strip and the start-workout form both only render once the
  // account has at least one active exercise (docs/backlog-archive.md item
  // 27's zero-exercise welcome card) — seed a throwaway one directly via the
  // admin client (item 57's pattern) so this test's own before/after tile
  // reads aren't gated behind creating `exerciseName` first. `exerciseName`
  // itself is also pre-existing state this test logs a workout against, not
  // behavior under test, so it's seeded the same way rather than through the
  // Exercises UI (item 83). Seeded via startLocal's beforeNavigate hook
  // (rather than seed-then-reload) so there's only ever one onMounted
  // fetchProgressStats() call — two calls across two mounts can resolve out
  // of order and silently overwrite the fresher "this week" count with the
  // stale one, which is exactly what broke this test's own before/after
  // comparison the first time this fix was tried with a reload (docs/backlog.md
  // item 58).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert([
        { user_id: userId, name: `E2E Baseline ${stamp}` },
        { user_id: userId, name: exerciseName },
      ])
    },
  })

  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()
  // fetchProgressStats() (workouts.ts) runs in the background from onMounted
  // alongside the exercises/templates fetches — wait for it to land instead
  // of racing the stat tile's initial `0` placeholder.
  await page.waitForLoadState('networkidle')

  const weekCountBefore = Number(await page.locator('.stat-tile').first().locator('.stat-value').textContent())

  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('135')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(1)
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Weight').fill('145')
  await page.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await page.getByRole('button', { name: 'Finish workout' }).click()

  // Item 106: the recap covers the progress strip until dismissed. Its own
  // "This week" count agrees with the strip's.
  const recap = page.getByTestId('post-finish-card')
  await expect(recap.getByTestId('recap-week-workouts')).toContainText(String(weekCountBefore + 1))
  await recap.getByRole('button', { name: 'Done', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()
  await expect(page.locator('.stat-tile').first().locator('.stat-value')).toHaveText(String(weekCountBefore + 1))

  // The second set beats the first in the same workout.
  await expect(page.locator('.stat-tile-pr .stat-label')).toHaveText(exerciseName)
})
