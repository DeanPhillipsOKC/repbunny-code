import type { Page } from '@playwright/test'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { pickMuscleGroup, openNewExerciseSheet, clickExerciseRowAction } from '../fixtures/exercise'

// Issue #42: exercises get a main muscle group (picked first when creating)
// plus optional "also works" groups, and existing exercises are auto-matched
// to the library and confirmed on a one-time check screen.

test('Exercises tab create: muscle group is required and persists with also works', async ({ page, stamp }) => {
  const exerciseName = `E2E Cable Kickback ${stamp}`
  await startLocal(page)
  await goTo(page, 'Exercises')

  await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(exerciseName)
  const create = page.getByRole('button', { name: 'Add exercise' })
  await expect(create).toBeDisabled()

  await pickMuscleGroup(page, 'Glutes')
  const alsoWorks = page.getByRole('group', { name: 'Also works (optional)' })
  // Never offers the main group as an "also works" group.
  await expect(alsoWorks.getByRole('button', { name: 'Glutes', exact: true })).toHaveCount(0)
  await alsoWorks.getByRole('button', { name: 'Legs', exact: true }).click()
  await expect(create).toBeEnabled()
  await create.click()
  const row = page.locator('.row-wrap', { hasText: exerciseName })
  await expect(row).toBeVisible()

  await page.reload()
  await expect(row.locator('.muscle-badge')).toBeVisible()
  await expect(row.getByText('Glutes · also works Legs')).toBeVisible()

  const { data } = await localDb(page)
    .from('exercises')
    .select('muscle_group, also_works')
    .eq('name', exerciseName)
    .single()
  expect(data).toEqual({ muscle_group: 'glutes', also_works: ['legs'] })
})

// Issue #173: Balance's push or pull, asked only for an upper-body group.
test('Exercises tab: push or pull saves and round-trips', async ({ page, stamp }) => {
  const exerciseName = `E2E Push Pull ${stamp}`
  await startLocal(page)
  await goTo(page, 'Exercises')

  const sheet = await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill(exerciseName)
  await pickMuscleGroup(sheet, 'Shoulders')
  const picker = sheet.getByRole('group', { name: 'Push or pull?' })
  await picker.getByRole('button', { name: 'Pull', exact: true }).click()
  await sheet.getByRole('button', { name: 'Add exercise' }).click()
  await expect(page.locator('.row-wrap', { hasText: exerciseName })).toBeVisible()

  const admin = localDb(page)
  const created = await admin.from('exercises').select('push_pull').eq('name', exerciseName).single()
  expect(created.data).toEqual({ push_pull: 'pull' })

  await page.reload()
  await clickExerciseRowAction(page.locator('.row-wrap', { hasText: exerciseName }), 'Edit exercise')
  const edit = page.getByRole('dialog', { name: 'Edit exercise' })
  const editPicker = edit.getByRole('group', { name: 'Push or pull?' })
  await expect(editPicker.getByRole('button', { name: 'Pull', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await editPicker.getByRole('button', { name: 'Neither', exact: true }).click()
  await edit.getByRole('button', { name: 'Save' }).click()
  await expect(edit).toHaveCount(0)

  const saved = await admin.from('exercises').select('push_pull').eq('name', exerciseName).single()
  expect(saved.data).toEqual({ push_pull: 'neither' })
})

test('logger create: Cardio suggests Timed, but a hand-picked load type sticks', async ({ page, stamp }) => {
  // Seeded so the account isn't empty (an empty one shows the first-run
  // state instead of the Freeform tile).
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: `E2E Muscle Logger ${stamp}`, muscle_group: 'chest' })
    },
  })
  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.getByRole('button', { name: 'New exercise', exact: true }).click()
  const form = page.getByRole('dialog', { name: 'New exercise' })

  await expect(form.getByRole('button', { name: 'Add exercise' })).toBeDisabled()
  await pickMuscleGroup(form, 'Cardio')
  await expect(form.getByRole('button', { name: 'Timed', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(form.getByText('Suggested from the muscle group. Change it anytime.')).toBeVisible()

  await form.getByRole('button', { name: 'Level', exact: true }).click()
  await pickMuscleGroup(form, 'Legs')
  await expect(form.getByRole('button', { name: 'Level', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // Even Cardio doesn't override a load type picked by hand.
  await pickMuscleGroup(form, 'Cardio')
  await expect(form.getByRole('button', { name: 'Level', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await form.getByRole('button', { name: 'Close', exact: true }).click()
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()
})

test('edit: the muscle group can change after sets are logged', async ({ page, stamp }) => {
  const exerciseName = `E2E Muscle Edit ${stamp}`
  const admin = localDb(page)

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: exerciseName, muscle_group: 'chest' })
        .select('id')
        .single()
      const { data: workout } = await admin
        .from('workouts')
        .insert({ user_id: userId, performed_at: new Date().toISOString() })
        .select('id')
        .single()
      await admin.from('sets').insert({
        workout_id: workout!.id,
        exercise_id: exercise!.id,
        set_index: 0,
        reps: 8,
        weight: 100,
        weight_unit: 'lb',
      })
    },
  })

  await goTo(page, 'Exercises')
  const row = page.locator('.row-wrap', { hasText: exerciseName })
  await clickExerciseRowAction(row, 'Edit exercise')
  const editSheet = page.getByRole('dialog', { name: 'Edit exercise' })
  // Load type locks once sets exist; the muscle group doesn't.
  await expect(editSheet.getByText('Locked')).toBeVisible()
  await pickMuscleGroup(editSheet, 'Back')
  await editSheet.getByRole('group', { name: 'Also works (optional)' }).getByRole('button', { name: 'Arms', exact: true }).click()
  await editSheet.getByRole('button', { name: 'Save' }).click()
  await expect(row.getByText('Back · also works Arms')).toBeVisible()

  const { data } = await admin.from('exercises').select('muscle_group, also_works').eq('name', exerciseName).single()
  expect(data).toEqual({ muscle_group: 'back', also_works: ['arms'] })
})

// The check screen lists every exercise with no group, so these give every
// other exercise on this worker's test account a group first. "Leg Press"
// has to be exactly that name to match the library, so it can't carry the
// cleanup stamp and is deleted by id at the end instead.
async function seedCheckScreenAccount(page: Page, userId: string, names: string[]) {
  const admin = localDb(page)
  await admin
    .from('exercises')
    .update({ muscle_group: 'chest' })
    .eq('user_id', userId)
    .eq('is_archived', false)
    .is('muscle_group', null)
  await admin.from('exercises').delete().eq('user_id', userId).eq('name', 'Leg Press')
  const { data } = await admin
    .from('exercises')
    .insert(names.map((name) => ({ user_id: userId, name })))
    .select('id, name')
  return data ?? []
}

test('check screen: auto-opens once, pre-fills library matches, and saves picks', async ({ page, stamp }) => {
  const burnerName = `Tuesday Burner ${stamp}`
  const admin = localDb(page)
  let seeded: { id: string; name: string }[] = []

  await page.setViewportSize({ width: 375, height: 800 })
  try {
    await startLocal(page, {
      muscleCheck: true,
      beforeNavigate: async (userId) => {
        seeded = await seedCheckScreenAccount(page, userId, ['Leg Press', burnerName])
      },
    })

    await expect(page.getByRole('heading', { name: 'Exercises now know their muscles' })).toBeVisible()
    await expect(page).toHaveURL(/\/exercises\/check$/)

    const legPress = page.getByRole('listitem', { name: 'Leg Press', exact: true })
    const burner = page.getByRole('listitem', { name: burnerName })
    await expect(legPress.locator('.guess-chip')).toHaveText(/Legs/)
    await expect(burner.locator('.guess-chip')).toHaveText(/Pick a group/)

    // Every chip is the same fixed width, whatever its label.
    const widths = await page.locator('.guess-chip').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))
    expect(widths.length).toBeGreaterThanOrEqual(2)
    for (const width of widths) expect(width).toBeCloseTo(116, 0)

    await burner.locator('.guess-chip').click()
    await burner
      .getByRole('group', { name: `Muscle group for ${burnerName}` })
      .getByRole('button', { name: 'Core', exact: true })
      .click()
    await expect(burner.locator('.guess-chip')).toHaveText(/Core/)

    await page.getByRole('button', { name: 'Looks good' }).click()
    await expect(page).toHaveURL(/\/$/)

    const { data } = await admin
      .from('exercises')
      .select('name, muscle_group, also_works, library_id')
      .in('id', seeded.map((row) => row.id))
      .order('name')
    expect(data).toEqual([
      { name: 'Leg Press', muscle_group: 'legs', also_works: ['glutes'], library_id: 'leg_press' },
      { name: burnerName, muscle_group: 'core', also_works: [], library_id: null },
    ])

    await page.reload()
    await expect(page.getByRole('button', { name: 'Freeform' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Exercises now know their muscles' })).toHaveCount(0)
    await expect(page).toHaveURL(/\/$/)
  } finally {
    const legPress = seeded.find((row) => row.name === 'Leg Press')
    if (legPress) await admin.from('exercises').delete().eq('id', legPress.id)
  }
})

test('check screen: "Later" leaves a link on the Exercises tab', async ({ page, stamp }) => {
  const burnerName = `Tuesday Burner ${stamp}`

  await startLocal(page, {
    muscleCheck: true,
    beforeNavigate: async (userId) => {
      await seedCheckScreenAccount(page, userId, [burnerName])
    },
  })

  await expect(page.getByRole('heading', { name: 'Exercises now know their muscles' })).toBeVisible()
  await page.getByRole('button', { name: 'Later' }).click()
  await expect(page).toHaveURL(/\/$/)

  await goTo(page, 'Exercises')
  const link = page.getByRole('link', { name: '1 exercise needs a muscle group' })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(/\/exercises\/check$/)
  await expect(page.getByRole('listitem', { name: burnerName }).locator('.guess-chip')).toHaveText(/Pick a group/)
})
