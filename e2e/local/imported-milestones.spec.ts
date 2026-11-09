import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { openAccountSection } from '../fixtures/account'

// Issue #462: milestones an import crossed read "Before RepBunny" and never
// celebrate or reward; ones crossed in RepBunny still do.

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(9, 0, 0, 0)
  return d.toISOString()
}

test('milestones crossed by imported workouts are tagged Before RepBunny and not announced', async ({ page, stamp }) => {
  const name = `E2E Imported Press ${stamp}`
  const db = localDb(page)
  await page.setViewportSize({ width: 375, height: 800 })
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await db.from('exercises').insert({ user_id: userId, name }).select('id').single()
      // Five imported workouts of three flat sets: workouts 1 and 5, no records.
      for (let w = 0; w < 5; w++) {
        const { data: workout } = await db.from('workouts').insert({ user_id: userId, performed_at: daysAgo(40 - w), imported: true }).select('id').single()
        for (let i = 0; i < 3; i++) {
          await db.from('sets').insert({ workout_id: workout!.id, exercise_id: exercise!.id, set_index: i, reps: 5, weight: 100, weight_unit: 'lb' })
        }
      }
    },
  })

  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, name, false)
  for (const [i, weight] of ['110', '120', '130'].entries()) {
    const row = page.locator('.set-row-draft').first()
    await row.getByLabel('Reps').fill('5')
    await row.getByLabel('Weight').fill(weight)
    await row.getByRole('button', { name: 'Add set' }).click()
    await dismissCelebrationIfShown(page)
    await expect(page.locator('.set-row-logged')).toHaveCount(i + 1)
  }
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()

  // Only what happened in RepBunny celebrates: the first record, not the
  // first workout or the fifth that the import already crossed.
  const card = page.getByTestId('recap-milestones')
  await expect(card.getByTestId('recap-milestone')).toHaveText(['First record!Unlocked: Air horn record fanfare'])
  await expect(card.getByTestId('recap-milestones-intro')).toHaveCount(0)

  await card.getByRole('link', { name: 'See all milestones' }).click()
  const workouts = page.getByTestId('milestone-track-workouts')
  for (const id of ['workouts-1', 'workouts-5']) {
    await expect(workouts.getByTestId(`milestone-tier-${id}`)).toHaveAttribute('data-unlocked', 'true')
    await expect(workouts.getByTestId(`milestone-before-${id}`)).toHaveText('Before RepBunny')
  }
  // The imported history still counts: this is the 6th workout.
  await expect(workouts.getByTestId('milestone-next')).toHaveText(/^6 of 10 workouts/)
  await expect(page.getByTestId('milestone-tier-records-1')).toHaveAttribute('data-unlocked', 'true')
  await expect(page.getByTestId('milestone-before-records-1')).toHaveCount(0)

  // The Extras of the imported tiers stay locked (Stars week mark is the
  // first workout's reward).
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Theme/ }).click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  await theme.getByRole('button', { name: 'Week mark', exact: true }).click()
  const picker = page.getByRole('dialog', { name: 'Week mark', exact: true })
  await expect(picker.getByRole('button', { name: /^Stars, locked/ })).toBeVisible()
})
