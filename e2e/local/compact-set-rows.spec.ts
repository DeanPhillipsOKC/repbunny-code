import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'

// Covers docs/backlog.md item 1: numbered rows matching the exercise's
// configured set count, replacing the old one-set-at-a-time form. A
// template exercise with target_sets: 3 should show three rows together;
// logging one leaves the others visible and independently completable,
// including while that set's rest timer is running.
test('compact set rows: target_sets rows show together, log sequentially, stay editable during rest', async ({
  page,
  stamp,
}) => {
  const exerciseName = `E2E Compact Squat ${stamp}`
  const templateName = `E2E Compact Leg Day ${stamp}`

  const admin = localDb(page)

  // The exercise's rest timer, the template, and its target_sets: 3 link are
  // all pre-existing state this test logs against, not behavior under test
  // (compact-set-rows.spec.ts covers the grid, not exercise/template setup
  // or the rest-timer config UI, which e2e/local/rest-timer.spec.ts already
  // covers) -- seed them directly via the admin client instead (item 57's
  // pattern, item 83).
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise, error: exerciseError } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName, rest_seconds: 30 })
        .select('id')
        .single()
      if (exerciseError) throw exerciseError
      const { data: template, error: templateError } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name: templateName })
        .select('id')
        .single()
      if (templateError) throw templateError
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: template.id, exercise_id: exercise.id, position: 0, target_sets: 3 })
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: templateName, exact: true }).click()
  await selectExercise(page, exerciseName, true)

  // Three configured sets means three rows, visible together — and that
  // total stays three throughout (a logged row switches to a compact
  // read-only display rather than disappearing from the grid).
  const rows = page.locator('.set-row')
  const openRows = page.locator('.set-row-draft')
  await expect(rows).toHaveCount(3)
  await expect(openRows).toHaveCount(3)

  // Row 1: log it. Its own "Add set" is disabled until both fields have a
  // value (an empty planned row must never be saved).
  const firstRow = openRows.nth(0)
  await expect(firstRow.getByRole('button', { name: 'Add set' })).toBeDisabled()
  await firstRow.getByLabel('Reps').fill('8')
  await expect(firstRow.getByRole('button', { name: 'Add set' })).toBeDisabled()
  await firstRow.getByLabel('Weight').fill('185')
  await firstRow.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)

  // Rest starts for this exercise. Minimizing ("Back to workout") proves
  // rows 2 and 3 are still there and usable while it counts down, not just
  // present once rest ends.
  await expect(page.locator('.rest-headline')).toBeVisible()
  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(page.getByText(/Resting \d:\d\d/)).toBeVisible()

  // Row 1 now shows as a done row; rows 2 and 3 remain open and numbered.
  await expect(rows).toHaveCount(3)
  await expect(openRows).toHaveCount(2)
  await expect(page.locator('.set-row-logged', { hasText: '8 × 185 lb' })).toBeVisible()

  // The logged row reads in the entry row's columns: its weight sits over
  // the Weight input and its reps over the Reps input (a reps-first
  // "8 × 185 lb" sentence led a user to type reps into the Weight box).
  const loggedRow = page.locator('.set-row-logged').first()
  const centerX = async (loc: import('@playwright/test').Locator) => {
    const box = (await loc.boundingBox())!
    return box.x + box.width / 2
  }
  expect(Math.abs((await centerX(loggedRow.locator('.set-logged-weight'))) - (await centerX(openRows.nth(0).getByLabel('Weight'))))).toBeLessThan(4)
  expect(Math.abs((await centerX(loggedRow.locator('.set-field-reps'))) - (await centerX(openRows.nth(0).getByLabel('Reps'))))).toBeLessThan(4)
  await expect(loggedRow.locator('.set-logged-weight')).toHaveText('185lb')
  await expect(loggedRow.locator('.set-field-reps')).toHaveText('8')

  // Row 2: log it while rest from row 1 is still running in the background.
  const secondRow = openRows.nth(0)
  await secondRow.getByLabel('Reps').fill('8')
  await secondRow.getByLabel('Weight').fill('185')
  await secondRow.getByRole('button', { name: 'Add set' }).click()

  // Logging row 2 restarts rest for this exercise (full-screen again).
  await expect(page.locator('.rest-headline')).toBeVisible()
  await page.getByRole('button', { name: 'Skip Rest' }).click()

  // Only row 3 is still open. Manual "+ Add row" for a fourth, unplanned
  // set (item 1's "allow adding or removing rows when the actual workout
  // differs from the configured count") before logging it -- an extra row in
  // progress also keeps item 109 from auto-finishing once row 3 completes
  // every planned set, so the grid stays around to check.
  await expect(openRows).toHaveCount(1)
  await page.getByRole('button', { name: '+ Add row' }).click()
  await expect(rows).toHaveCount(4)
  await expect(openRows).toHaveCount(2)

  // Row 3's RPE field is always available, no reveal step needed.
  const thirdRow = openRows.nth(0)
  await thirdRow.getByLabel('RPE (optional)').fill('9')
  await thirdRow.getByLabel('Reps').fill('6')
  await thirdRow.getByLabel('Weight').fill('195')
  await thirdRow.getByRole('button', { name: 'Add set' }).click()

  // Row 3 also starts rest — clear it before interacting with the grid again.
  await expect(page.locator('.rest-headline')).toBeVisible()
  await page.getByRole('button', { name: 'Skip Rest' }).click()

  // All three planned rows are now done, including the RPE on the last one;
  // only the unplanned fourth is open. Remove it again.
  await expect(rows).toHaveCount(4)
  await expect(openRows).toHaveCount(1)
  await expect(page.locator('.set-row-logged')).toHaveCount(3)
  await expect(page.locator('.set-row-logged', { hasText: '6 × 195 lb' })).toContainText('RPE 9')
  await openRows.nth(0).getByRole('button', { name: /Remove row/ }).click()
  await expect(rows).toHaveCount(3)
  await expect(openRows).toHaveCount(0)

  await page.getByRole('button', { name: 'Finish workout' }).click()
})
