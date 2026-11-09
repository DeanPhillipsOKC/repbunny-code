import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { dismissCelebrationIfShown } from '../fixtures/celebration'
import { selectExercise } from '../fixtures/exercise'
import type { Page } from '@playwright/test'

// Issue #535: a note on one exercise for this workout ("Note for today"),
// separate from its setup notes. It shows under that exercise on the History
// card and under "Last time" the next time the lift is logged, and it goes
// through backup, restore, and reset with the rest of the history.

async function logOneSet(page: Page, exerciseName: string) {
  await page.getByRole('button', { name: 'Freeform' }).click()
  await selectExercise(page, exerciseName, false)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('100')
  await page.getByRole('button', { name: 'Add set', exact: true }).click()
  await dismissCelebrationIfShown(page)
}

async function writeTodayNote(page: Page, note: string) {
  await page.getByRole('button', { name: '+ Note for today' }).click()
  const box = page.getByLabel('Note for today')
  await expect(box).toBeFocused()
  await box.fill(note)
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByRole('button', { name: "Change today's note" })).toContainText(note)
}

async function finish(page: Page) {
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
}

test('a note for today shows on History and under Last time next workout, and setup notes stay put', async ({ page, stamp }) => {
  const exerciseName = `E2E Session Note Press ${stamp}`
  const setupNote = 'Seat 4, handles at pin 2'
  const note = 'Left shoulder pinched on set 3'
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName, setup_notes: setupNote })
    },
  })
  await page.setViewportSize({ width: 375, height: 800 })

  await logOneSet(page, exerciseName)
  // A first session has nothing from last time.
  await expect(page.getByTestId('last-note')).toHaveCount(0)
  await page.getByRole('button', { name: '+ Note for today' }).click()
  await expect(page.getByText('Seat height and other machine settings go in the machine setup note')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await writeTodayNote(page, note)
  await expect(page.locator('.exercise-card-notes')).toHaveText(setupNote)

  // Editing it keeps one note; blanking it out clears it.
  await page.getByRole('button', { name: "Change today's note" }).click()
  await expect(page.getByLabel('Note for today')).toHaveValue(note)
  await page.getByLabel('Note for today').fill('  ')
  await page.getByRole('button', { name: 'Save note' }).click()
  await expect(page.getByRole('button', { name: '+ Note for today' })).toBeVisible()
  await writeTodayNote(page, note)
  await finish(page)

  const { data: exercise } = await admin.from('exercises').select('setup_notes').eq('name', exerciseName).single()
  expect(exercise!.setup_notes).toBe(setupNote)
  const { data: saved } = await admin.from('workout_exercise_notes').select('note')
  expect(saved).toEqual([{ note }])

  await goTo(page, 'Workout log')
  const card = page.locator('.card', { hasText: exerciseName })
  await expect(card.getByTestId('exercise-note')).toHaveText(note)

  // Next time: last session's note under "Last time", and today starts blank.
  await goTo(page, 'Home')
  await logOneSet(page, exerciseName)
  await expect(page.getByTestId('last-note')).toContainText('Last time')
  await expect(page.getByTestId('last-note')).toContainText(note)
  await expect(page.getByRole('button', { name: '+ Note for today' })).toBeVisible()
  await expect(page.locator('.exercise-card-notes')).toHaveText(setupNote)
})

test('exercise notes go through backup, reset, and restore', async ({ page, stamp }) => {
  const exerciseName = `E2E Session Note Row ${stamp}`
  const note = 'Narrow grip next time'
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
    },
  })
  await page.setViewportSize({ width: 375, height: 800 })
  await logOneSet(page, exerciseName)
  await writeTodayNote(page, note)
  await finish(page)

  const file = await page.evaluate(async () => {
    const { buildBackup } = await window.__rbImport('/src/lib/backup.ts')
    return JSON.parse(JSON.stringify(await buildBackup()))
  })
  expect(file.workout_exercise_notes).toHaveLength(1)
  expect(file.workout_exercise_notes[0]).toMatchObject({
    note,
    workout_id: file.workouts[0].id,
    exercise_id: file.exercises.find((e: { name: string }) => e.name === exerciseName).id,
  })

  await page.evaluate(async () => {
    const { resetMyData } = await window.__rbImport('/src/lib/backup.ts')
    const { error } = await resetMyData()
    if (error) throw new Error(error.message)
  })
  expect((await admin.from('workout_exercise_notes').select('note')).data).toEqual([])

  await page.evaluate(async (backup) => {
    const { restoreBackup } = await window.__rbImport('/src/lib/backup.ts')
    const { error } = await restoreBackup(backup)
    if (error) throw new Error(error.message)
  }, file)
  await page.reload()
  await goTo(page, 'Workout log')
  await expect(page.locator('.card', { hasText: exerciseName }).getByTestId('exercise-note')).toHaveText(note)
})
