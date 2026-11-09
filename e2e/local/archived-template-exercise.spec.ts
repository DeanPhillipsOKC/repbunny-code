import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { clickExerciseRowAction } from '../fixtures/exercise'

// Covers docs/backlog.md item 25: archiving an exercise only flips
// exercises.is_archived, it never touches workout_template_exercises, so an
// archived exercise attached to a template kept surfacing as a suggested
// chip and a loggable dropdown option every time that template was used.
test('archived exercise stops appearing in a template it is still attached to', async ({ page, stamp }) => {
  const exerciseName = `E2E Archived ${stamp}`
  const templateName = `E2E Push Day ${stamp}`

  const admin = localDb(page)

  // This test deletes (archives) its own only exercise partway through —
  // without a second, still-active exercise on the account, that leaves
  // exercises.activeExercises at zero, which flips WorkoutLogger.vue over to
  // its zero-exercise welcome card (docs/backlog-archive.md item 27) and
  // pulls the Home screen's template chips out from under the later steps
  // below. Seed a throwaway second exercise directly via the admin client
  // (item 57's pattern) so archiving `exerciseName` never zeroes the count.
  // `exerciseName` and its template are also pre-existing state here, not
  // behavior under test (only the later archive/delete steps are) — seeded
  // the same way (item 83). Seeded via startLocal's beforeNavigate
  // hook rather than seed-then-reload, which can leave two competing
  // onMounted fetches racing each other (docs/backlog.md item 58).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: `E2E Baseline ${stamp}` })
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName })
        .select('id')
        .single()
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template!.id, exercise_id: exercise!.id, position: 0 })
    },
  })

  await goTo(page, 'Exercises')
  // The confirm step swaps the exercise's name out of the row entirely (same
  // shape as e2e/local/template-archive-confirm.spec.ts), so the "Confirm delete"
  // click can't stay scoped to a `hasText: exerciseName` locator — query it
  // directly instead, safe since only one row is ever mid-confirm at a time.
  await clickExerciseRowAction(page.locator('.row-wrap', { hasText: exerciseName }), 'Delete exercise')
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByText(exerciseName)).toHaveCount(0)

  // Back on Templates, in the same session: the "Archived" tag reads the
  // live exercises store rather than the template's cached exercise join,
  // which only fetches once per template per session.
  await goTo(page, 'Routines')
  await page.getByText(templateName).click()
  const templateExerciseRow = page.locator('.ex-card', { hasText: exerciseName })
  await expect(templateExerciseRow.getByText('Archived', { exact: true })).toBeVisible()

  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()

  // With the archived exercise excluded, this template now has zero
  // loggable exercises left, so the carousel deck is empty -- wait for that
  // state to actually mount (activeWorkoutId/activeTemplateId still settling
  // after the start-workout request) before checking it, rather than
  // trivially "passing" against a not-yet-rendered section.
  await page.locator('.deck-empty').waitFor({ state: 'attached' })

  await expect(page.getByRole('button', { name: exerciseName, exact: true })).toHaveCount(0)

  // Started but never logged a set — Finish here would just discard it (see
  // e2e/local/zero-set-cleanup.spec.ts), which also keeps this spec from leaving a
  // permanent zero-set `workouts` row behind on every run (backlog item 56).
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()
})
