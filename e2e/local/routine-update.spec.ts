import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal, type LocalDb } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown } from '../fixtures/celebration'

// Issue #263: after a routine workout that strayed from the plan, the finish
// recap offers "Update <routine>?" with one tickable line per change.
// Nothing is written without "Update routine"; "Not now" keeps the routine
// as it was and doesn't ask again for that workout. Routines and exercises
// are seeded (item 83's pattern); the workout itself is logged through the
// UI, since the card reads what this session did.

type Admin = LocalDb

async function seedRoutine(admin: Admin, userId: string, name: string, lifts: { name: string; targetSets: number | null }[]) {
  const { data: template, error } = await admin.from('workout_templates').insert({ user_id: userId, name }).select('id').single()
  if (error) throw error
  for (const [position, lift] of lifts.entries()) {
    const { data: exercise, error: exerciseError } = await admin
      .from('exercises')
      .insert({ user_id: userId, name: lift.name, rest_seconds: null })
      .select('id')
      .single()
    if (exerciseError) throw exerciseError
    const { error: linkError } = await admin
      .from('workout_template_exercises')
      .insert({ template_id: template.id, exercise_id: exercise.id, position, target_sets: lift.targetSets })
    if (linkError) throw linkError
  }
  return template.id as string
}

async function routineRows(admin: Admin, templateId: string) {
  const { data, error } = await admin
    .from('workout_template_exercises')
    .select('position, target_sets, exercises(name)')
    .eq('template_id', templateId)
    .order('position')
  if (error) throw error
  return (data ?? []).map((row) => ({
    name: (row.exercises as unknown as { name: string }).name,
    sets: row.target_sets,
  }))
}

async function logOpenRow(page: Page, expectedLogged: number) {
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill('8')
  await row.getByLabel('Weight').fill('60')
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
  await expect(page.locator('.set-row-logged')).toHaveCount(expectedLogged)
}

async function finishAnyway(page: Page) {
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click()
  await page.getByRole('dialog', { name: 'Finish now?' }).getByRole('button', { name: 'Finish anyway' }).click()
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
}

test('update routine: an added exercise and changed set counts carry into the routine', async ({ page, stamp }) => {
  const routineName = `E2E Update Push ${stamp}`
  const bench = `E2E Update Bench ${stamp}`
  const press = `E2E Update Press ${stamp}`
  const fly = `E2E Update Fly ${stamp}`
  const admin = localDb(page)
  let templateId = ''

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      templateId = await seedRoutine(admin, userId, routineName, [
        { name: bench, targetSets: 1 },
        { name: press, targetSets: 2 },
      ])
      await admin.from('exercises').insert({ user_id: userId, name: fly, rest_seconds: null })
    },
  })

  await page.getByRole('button', { name: routineName, exact: true }).click()
  // Bench: one planned set, two done (an extra row first, so finishing the
  // plan doesn't move the deck on).
  await selectExercise(page, bench, true)
  await page.getByRole('button', { name: '+ Add row' }).click()
  await logOpenRow(page, 1)
  await logOpenRow(page, 2)
  // Press: two planned, one done.
  await selectExercise(page, press, true)
  await logOpenRow(page, 1)
  // Fly: not in the routine.
  await selectExercise(page, fly, false)
  await logOpenRow(page, 1)
  await finishAnyway(page)

  const card = page.getByTestId('routine-update')
  await expect(card.getByRole('heading', { name: `Update ${routineName}?` })).toBeVisible()
  const boxes = card.getByRole('checkbox')
  await expect(boxes).toHaveCount(3)
  await expect(card.locator('.routine-update-row')).toHaveText([
    `${bench}: 1 → 2 sets`,
    `${press}: 2 → 1 set`,
    `Add ${fly} (1 set)`,
  ])
  for (const box of await boxes.all()) await expect(box).toBeChecked()

  await card.getByRole('button', { name: 'Update routine' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Updated ${routineName}.` })).toBeVisible()
  await expect(card).toHaveCount(0)
  expect(await routineRows(admin, templateId)).toEqual([
    { name: bench, sets: 2 },
    { name: press, sets: 1 },
    { name: fly, sets: 1 },
  ])

  // The routine editor shows the new plan, the added exercise last.
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await goTo(page, 'Routines')
  await page.locator('.row-wrap', { hasText: routineName }).locator('.row-title').click()
  const cards = page.locator('.ex-card')
  await expect(cards).toHaveCount(3)
  await expect(cards.nth(2)).toContainText(fly)
  await expect(cards.nth(2).locator('.sets-value b')).toHaveText('1')
  await expect(cards.nth(0).locator('.sets-value b')).toHaveText('2')
})

test('update routine: Not now changes nothing and stays dismissed after a resume and refinish', async ({ page, stamp }) => {
  const routineName = `E2E Update Pull ${stamp}`
  const row = `E2E Update Row ${stamp}`
  const curl = `E2E Update Curl ${stamp}`
  const admin = localDb(page)
  let templateId = ''

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      templateId = await seedRoutine(admin, userId, routineName, [
        { name: row, targetSets: 1 },
        { name: curl, targetSets: 1 },
      ])
    },
  })

  await page.getByRole('button', { name: routineName, exact: true }).click()
  await selectExercise(page, row, true)
  await logOpenRow(page, 1)
  await finishAnyway(page)

  // A skipped exercise is offered as a removal, unticked, so Update starts
  // disabled.
  const card = page.getByTestId('routine-update')
  await expect(card.locator('.routine-update-row')).toHaveText([`Remove ${curl} (skipped today)`])
  await expect(card.getByRole('checkbox')).not.toBeChecked()
  await expect(card.getByRole('button', { name: 'Update routine' })).toBeDisabled()

  await card.getByRole('button', { name: 'Not now' }).click()
  await expect(card).toHaveCount(0)
  expect(await routineRows(admin, templateId)).toEqual([
    { name: row, sets: 1 },
    { name: curl, sets: 1 },
  ])

  await page.getByRole('button', { name: 'Finished too early? Resume' }).click()
  await expect(page.locator('.set-row-logged')).toHaveCount(1)
  await finishAnyway(page)
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
  await expect(page.getByTestId('routine-update')).toHaveCount(0)
})

test('update routine: a ticked removal drops the exercise, and a workout done as planned shows no card', async ({ page, stamp }) => {
  const routineName = `E2E Update Legs ${stamp}`
  const squat = `E2E Update Squat ${stamp}`
  const calf = `E2E Update Calf ${stamp}`
  const admin = localDb(page)
  let templateId = ''

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      templateId = await seedRoutine(admin, userId, routineName, [
        { name: squat, targetSets: 1 },
        { name: calf, targetSets: 1 },
      ])
    },
  })

  await page.getByRole('button', { name: routineName, exact: true }).click()
  await selectExercise(page, squat, true)
  await logOpenRow(page, 1)
  await finishAnyway(page)

  const card = page.getByTestId('routine-update')
  await card.locator('.routine-update-row', { hasText: `Remove ${calf}` }).click()
  await expect(card.getByRole('checkbox')).toBeChecked()
  await card.getByRole('button', { name: 'Update routine' }).click()
  await expect(page.getByRole('status').filter({ hasText: `Updated ${routineName}.` })).toBeVisible()
  expect(await routineRows(admin, templateId)).toEqual([{ name: squat, sets: 1 }])

  // Next time the routine is just the squat; one set finishes it as
  // planned, and the recap has nothing to offer.
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('button', { name: routineName, exact: true }).click()
  await selectExercise(page, squat, true)
  await logOpenRow(page, 1)
  await expect(page.getByTestId('post-finish-card')).toBeVisible()
  await expect(page.getByTestId('routine-update')).toHaveCount(0)
})
