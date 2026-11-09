import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import { closeAddExerciseSheet } from '../fixtures/exercise'

// Issue #39: browsing and adding from the starter exercise library. Library
// entries join the user's own list as normal exercises, so every name this
// spec adds is an exact library name that can't carry the cleanup stamp.
// Each test clears those names (and their library ids) from this worker's
// account before and after, so "owned" starts false every time.

const LIBRARY: { id: string; name: string; muscleGroup: string }[] = JSON.parse(
  readFileSync(new URL('../../src/data/exercise-library.json', import.meta.url), 'utf-8'),
)

async function clearLibraryExercises(page: Page, userId: string, names: string[]) {
  const admin = localDb(page)
  const ids = LIBRARY.filter((entry) => names.includes(entry.name)).map((entry) => entry.id)
  await admin.from('exercises').delete().eq('user_id', userId).in('name', names)
  await admin.from('exercises').delete().eq('user_id', userId).in('library_id', ids)
}

test('add sheet: muscle chips, library rows, "+ Add", and in-sheet detail in a freeform workout', async ({
  page,
  stamp,
}) => {
  const ownLegs = `E2E Legs ${stamp}`
  const names = ['Hack Squat', 'Goblet Squat', 'Leg Press']
  const admin = localDb(page)
  let userId = ''

  try {
    userId = await startLocal(page, {
      beforeNavigate: async (id) => {
        await clearLibraryExercises(page, id, names)
        await admin.from('exercises').insert({ user_id: id, name: ownLegs, muscle_group: 'legs' })
      },
    })

    await page.getByRole('button', { name: 'Freeform' }).click()
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add exercise' })

    // "All" by default: the library section sits below the user's own.
    const chips = sheet.getByRole('group', { name: 'Filter by muscle group' })
    await expect(chips.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet.getByText('From the library', { exact: true })).toBeVisible()

    await chips.getByRole('button', { name: 'Legs', exact: true }).click()
    await expect(sheet.getByText('Your leg exercises')).toBeVisible()
    await expect(sheet.getByRole('button', { name: ownLegs, exact: true })).toBeVisible()
    await expect(sheet.getByText('From the library · Legs')).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'View Leg Press', exact: true })).toBeVisible()
    // Other groups' entries are filtered out.
    await expect(sheet.getByRole('button', { name: 'View Pec Deck' })).toHaveCount(0)

    await sheet.getByRole('button', { name: 'Add Hack Squat' }).click()
    // Issue #43: the sheet stays open, listing it as added, until Done.
    await expect(sheet.getByRole('button', { name: 'Hack Squat', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await closeAddExerciseSheet(page)
    await expect(sheet).toHaveCount(0)
    await expect(page.locator('.exercise-card-name')).toHaveText('Hack Squat')

    // A library row's name opens its detail inside the sheet (#313).
    await page.getByRole('button', { name: 'Add exercise' }).click()
    await chips.getByRole('button', { name: 'Legs', exact: true }).click()
    // Now owned, so no longer offered from the library.
    await expect(sheet.getByRole('button', { name: 'Add Hack Squat' })).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: 'Hack Squat', exact: true })).toHaveCount(0)
    await sheet.getByRole('button', { name: 'View Goblet Squat' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(sheet.getByRole('heading', { name: 'Goblet Squat' })).toBeVisible()
    await expect(sheet.getByText('Legs · also works Glutes, Core')).toBeVisible()
    await sheet.getByRole('button', { name: 'Add to workout' }).click()
    await expect(sheet.getByRole('button', { name: 'Goblet Squat', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await closeAddExerciseSheet(page)
    await expect(page.locator('.exercise-card-name')).toHaveText('Goblet Squat')
    await expect(page.getByRole('button', { name: 'Hack Squat', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Finish workout' }).click()
    await page.getByRole('button', { name: 'Discard workout' }).click()

    await goTo(page, 'Exercises')
    const row = page.locator('.row-wrap', { hasText: 'Hack Squat' })
    await expect(row.locator('.muscle-badge')).toBeVisible()
    await expect(row.getByText('Legs · also works Glutes')).toBeVisible()

    const { data } = await admin
      .from('exercises')
      .select('name, library_id, muscle_group, load_type, rest_seconds, setup_notes')
      .eq('user_id', userId)
      .in('name', ['Hack Squat', 'Goblet Squat'])
      .order('name')
    expect(data).toEqual([
      { name: 'Goblet Squat', library_id: 'goblet_squat', muscle_group: 'legs', load_type: 'weight', rest_seconds: null, setup_notes: null },
      { name: 'Hack Squat', library_id: 'hack_squat', muscle_group: 'legs', load_type: 'weight', rest_seconds: null, setup_notes: null },
    ])
  } finally {
    if (userId) await clearLibraryExercises(page, userId, names)
  }
})

test('add sheet: "+ Add" works in a templated workout', async ({ page, stamp }) => {
  const templateExercise = `E2E Template Legs ${stamp}`
  const templateName = `E2E Library Day ${stamp}`
  const names = ['Hack Squat']
  const admin = localDb(page)
  let userId = ''

  try {
    userId = await startLocal(page, {
      beforeNavigate: async (id) => {
        await clearLibraryExercises(page, id, names)
        const { data: exercise } = await admin
          .from('exercises')
          .insert({ user_id: id, name: templateExercise, muscle_group: 'legs' })
          .select('id')
          .single()
        const { data: template } = await admin
          .from('workout_templates')
          .insert({ user_id: id, name: templateName })
          .select('id')
          .single()
        await admin
          .from('workout_template_exercises')
          .insert({ template_id: template!.id, exercise_id: exercise!.id, position: 0 })
      },
    })

    await page.getByRole('button', { name: templateName, exact: true }).click()
    await expect(page.locator('.exercise-card-name')).toHaveText(templateExercise)
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add exercise' })
    await sheet.getByRole('group', { name: 'Filter by muscle group' }).getByRole('button', { name: 'Legs', exact: true }).click()
    await sheet.getByRole('button', { name: 'Add Hack Squat' }).click()
    await closeAddExerciseSheet(page)
    await expect(page.locator('.exercise-card-name')).toHaveText('Hack Squat')
    await expect(page.getByRole('button', { name: templateExercise, exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Finish workout' }).click()
    await page.getByRole('button', { name: 'Discard workout' }).click()

    const { data } = await admin.from('exercises').select('library_id').eq('user_id', userId).eq('name', 'Hack Squat').single()
    expect(data).toEqual({ library_id: 'hack_squat' })
  } finally {
    if (userId) await clearLibraryExercises(page, userId, names)
  }
})

test('add sheet: no duplicates of owned entries, and search matches aliases', async ({ page }) => {
  const names = ['Leg Press', 'leg press', 'Pec Deck']
  let userId = ''

  try {
    userId = await startLocal(page, {
      beforeNavigate: async (id) => {
        await clearLibraryExercises(page, id, names)
        // A custom exercise, not added from the library, that matches by name.
        await localDb(page).from('exercises').insert({ user_id: id, name: 'leg press', muscle_group: 'legs' })
      },
    })

    await page.getByRole('button', { name: 'Freeform' }).click()
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add exercise' })
    await expect(sheet.getByText('From the library', { exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'View Leg Press', exact: true })).toHaveCount(0)

    await sheet.getByRole('group', { name: 'Filter by muscle group' }).getByRole('button', { name: 'Legs', exact: true }).click()
    await expect(sheet.getByRole('button', { name: 'leg press', exact: true })).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'View Leg Press', exact: true })).toHaveCount(0)

    // Search runs across aliases, narrowed by the chip: Pec Deck is Chest.
    await sheet.getByPlaceholder('Search exercises').fill('butterfly')
    await expect(sheet.getByText('No exercises match "butterfly".')).toBeVisible()
    await sheet.getByRole('group', { name: 'Filter by muscle group' }).getByRole('button', { name: 'All', exact: true }).click()
    await expect(sheet.getByRole('button', { name: 'View Pec Deck' })).toBeVisible()

    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Finish workout' }).click()
    await page.getByRole('button', { name: 'Discard workout' }).click()
  } finally {
    if (userId) await clearLibraryExercises(page, userId, names)
  }
})

test('create form: a library match offers "Use it" instead of a custom exercise', async ({ page, stamp }) => {
  const names = ['Cable Glute Kickback', 'Cable kickback']
  const admin = localDb(page)
  let userId = ''

  try {
    userId = await startLocal(page, {
      beforeNavigate: async (id) => {
        await clearLibraryExercises(page, id, names)
        // So the account isn't empty (an empty one shows the first-run state).
        await admin.from('exercises').insert({ user_id: id, name: `E2E Suggest ${stamp}`, muscle_group: 'chest' })
      },
    })

    await page.getByRole('button', { name: 'Freeform' }).click()
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add exercise' })
    await sheet.getByRole('button', { name: 'New exercise', exact: true }).click()
    const form = page.getByRole('dialog', { name: 'New exercise' })
    await form.getByLabel('Name', { exact: true }).fill('Ca')
    await expect(form.getByText('Already in the library', { exact: false })).toHaveCount(0)
    await form.getByLabel('Name', { exact: true }).fill('Cable kickback')
    const card = form.getByRole('status').filter({ hasText: 'Cable Glute Kickback' })
    await expect(card).toContainText('Already in the library · Glutes · Weight')
    await card.getByRole('button', { name: 'Use it' }).click()
    await closeAddExerciseSheet(page)

    await expect(sheet).toHaveCount(0)
    await expect(page.locator('.exercise-card-name')).toHaveText('Cable Glute Kickback')

    await page.getByRole('button', { name: 'Finish workout' }).click()
    await page.getByRole('button', { name: 'Discard workout' }).click()

    const { data } = await admin
      .from('exercises')
      .select('name, library_id')
      .eq('user_id', userId)
      .in('name', names)
    expect(data).toEqual([{ name: 'Cable Glute Kickback', library_id: 'cable_glute_kickback' }])
  } finally {
    if (userId) await clearLibraryExercises(page, userId, names)
  }
})

test('Exercises tab Library: banner count, group cards, detail with collapsed how-to, and back', async ({ page }) => {
  const names = ['Barbell Hip Thrust']
  let userId = ''

  try {
    userId = await startLocal(page, {
      beforeNavigate: async (id) => clearLibraryExercises(page, id, names),
    })

    await goTo(page, 'Exercises')
    const segments = page.getByRole('group', { name: 'Exercises view' })
    await expect(segments.getByRole('button', { name: 'My exercises' })).toHaveAttribute('aria-pressed', 'true')
    await segments.getByRole('button', { name: 'Library' }).click()
    await expect(page).toHaveURL(/\/exercises\?view=library$/)

    await expect(page.getByText(`${LIBRARY.length} exercises, ready to go`)).toBeVisible()
    const cards = page.locator('.library-group-card')
    await expect(cards).toHaveCount(8)
    const counts = await page.locator('.library-group-count').allTextContents()
    expect(counts.reduce((sum, text) => sum + parseInt(text, 10), 0)).toBe(LIBRARY.length)

    await page.getByRole('button', { name: /^Glutes, \d+ exercises$/ }).click()
    await page.getByRole('button', { name: 'View Barbell Hip Thrust' }).click()
    await expect(page).toHaveURL(/\/exercises\/library\/barbell_hip_thrust$/)
    await expect(page.getByRole('heading', { name: 'Barbell Hip Thrust' })).toBeVisible()
    await expect(page.getByText('Glutes · also works Legs')).toBeVisible()
    await expect(page.getByText('Weight × reps')).toBeVisible()

    const howTo = page.getByRole('button', { name: 'How to' })
    await expect(howTo).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.how-to-steps li')).toHaveCount(0)
    await howTo.click()
    await expect(page.locator('.how-to-steps li')).toHaveCount(4)

    // No active workout: only "Add to my exercises".
    await expect(page.getByRole('button', { name: 'Add to this workout' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Add to my exercises' }).click()
    await expect(page.getByText('In your exercises')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add to my exercises' })).toHaveCount(0)

    // Back returns to the Library segment's Glutes list, now marked Added.
    await page.getByRole('button', { name: 'Back to Library' }).click()
    await expect(page).toHaveURL(/\/exercises\?view=library&group=glutes$/)
    await expect(segments.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-pressed', 'true')
    const row = page.locator('.library-row', { hasText: 'Barbell Hip Thrust' })
    await expect(row.getByText('Added', { exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Add Barbell Hip Thrust' })).toHaveCount(0)

    // Its own history shows the same collapsed how-to.
    await segments.getByRole('button', { name: 'My exercises' }).click()
    await page
      .locator('.row-wrap', { hasText: 'Barbell Hip Thrust' })
      .getByRole('button', { name: 'View exercise history' })
      .click()
    const history = page.getByRole('dialog', { name: 'Barbell Hip Thrust history' })
    await expect(history.getByRole('button', { name: 'How to' })).toHaveAttribute('aria-expanded', 'false')
    await history.getByRole('button', { name: 'How to' }).click()
    await expect(history.locator('.how-to-steps li')).toHaveCount(4)
  } finally {
    if (userId) await clearLibraryExercises(page, userId, names)
  }
})

test('layout at 375px: chip row does not scroll the page and group cards are 2 equal columns', async ({ page, stamp }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await startLocal(page, {
    beforeNavigate: async (id) => {
      await localDb(page).from('exercises').insert({ user_id: id, name: `E2E Layout ${stamp}`, muscle_group: 'arms' })
    },
  })

  const pageOverflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  await page.getByRole('button', { name: 'Freeform' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  const chips = sheet.getByRole('group', { name: 'Filter by muscle group' })
  await expect(chips).toBeVisible()
  expect(await pageOverflow()).toBeLessThanOrEqual(0)
  // The row scrolls sideways inside itself instead.
  expect(await chips.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  const sheetBox = (await sheet.boundingBox())!
  const chipsBox = (await chips.boundingBox())!
  expect(chipsBox.x).toBeGreaterThanOrEqual(sheetBox.x - 1)
  expect(chipsBox.x + chipsBox.width).toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1)

  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Discard workout' }).click()

  await page.goto('/exercises?view=library')
  const cards = page.locator('.library-group-card')
  await expect(cards).toHaveCount(8)
  expect(await pageOverflow()).toBeLessThanOrEqual(0)
  const boxes = await Promise.all((await cards.all()).map(async (card) => (await card.boundingBox())!))
  const lefts = [...new Set(boxes.map((b) => Math.round(b.x)))]
  expect(lefts).toHaveLength(2)
  for (const box of boxes) expect(Math.abs(box.width - boxes[0].width)).toBeLessThanOrEqual(1)
  // Each row's pair sits side by side at the same height.
  for (let i = 0; i < boxes.length; i += 2) {
    expect(Math.abs(boxes[i].y - boxes[i + 1].y)).toBeLessThanOrEqual(1)
    expect(boxes[i + 1].x).toBeGreaterThan(boxes[i].x + boxes[i].width)
  }
})
