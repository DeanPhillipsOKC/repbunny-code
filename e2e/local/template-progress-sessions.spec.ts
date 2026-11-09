import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'

// Issue #157 with Premium on: the hub tile, the list's trend, and the chart
// with the tapped session. Free is covered by
// e2e/local/template-progress.spec.ts. Issue #168: the
// older session has a note, so it gets a marker that opens the note.

test('template progress: volume per session of a template, with each session behind its point', async ({ page, stamp }) => {
  const admin = localDb(page)
  const template = `E2E Pull day ${stamp}`
  const row = `E2E Row ${stamp}`
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: ex } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: row, muscle_group: 'back', also_works: [] })
        .select('id')
        .single()
      const { data: t } = await admin.from('workout_templates').insert({ user_id: userId, name: template }).select('id').single()
      await admin.from('workout_template_exercises').insert({ template_id: t!.id, exercise_id: ex!.id, position: 0, target_sets: 2 })
      // Two sessions, newer than anything else on the shared account, so the
      // hub tile names this template. 10 × 100 + 10 × 100 lb, then 10 × 60 kg twice.
      for (const [minutesAgo, weight, unit] of [
        [20, 100, 'lb'],
        [10, 60, 'kg'],
      ] as const) {
        const { data: w } = await admin
          .from('workouts')
          .insert({
            user_id: userId,
            template_id: t!.id,
            performed_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
            notes: minutesAgo === 20 ? 'Elbow was cranky, kept it light.' : null,
          })
          .select('id')
          .single()
        await admin.from('sets').insert(
          [0, 1].map((i) => ({ workout_id: w!.id, exercise_id: ex!.id, set_index: i, reps: 10, weight, weight_unit: unit })),
        )
      }
    },
  })

  // 1,200 kg is 2,646 lb in the profile's unit (lb).
  await goTo(page, 'Progress')
  const tile = page.getByRole('link', { name: /^Routine progress/ })
  await expect(tile).toContainText(template)
  await expect(tile).toContainText('2,646 lb')
  await tile.click()

  const listRow = page.getByRole('link', { name: `${template}, 2,646 lb` })
  await expect(listRow).toContainText('2 sessions')
  await expect(listRow).toContainText('▲ 646')
  await listRow.click()

  await expect(page.getByRole('heading', { name: template })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Total volume over 3 months, from 2,000 to 2,646 lb' })).toBeVisible()
  const session = page.getByTestId('template-session')
  await expect(session).toContainText('2,646 lb')
  await expect(session).toContainText('10 × 60 kg')
  await expect(session.getByTestId('workout-note')).toHaveCount(0)

  // The noted session's pencil marker opens it, note first.
  await expect(page.getByTestId('note-marker')).toHaveCount(1)
  await expect(page.getByTestId('story-marker')).toHaveCount(0)
  await page.getByTestId('note-marker').click()
  await expect(session).toContainText('Selected session')
  await expect(session).toContainText('2,000 lb')
  await expect(session).toContainText('10 × 100 lb')
  await expect(session.getByRole('note', { name: 'Workout note' })).toHaveText('Elbow was cranky, kept it light.')

  await page.getByRole('link', { name: 'Back to Routine progress' }).click()
  await expect(page).toHaveURL(/\/progress\/templates$/)
})
