import { test, expect, localDb, startLocal } from '../fixtures/local'
import { goTo } from '../fixtures/nav'
import {
  classifyExercise,
  classifyExerciseMix,
  classifyTemplateName,
  templateCategory,
} from '../../src/lib/templateCategory'

// Item 111: each routine's category icon (Home tiles, Templates rows) is
// guessed from keyword tables in lib/templateCategory.ts: the user's own
// pick first (item 112), then the template name, then its exercises.

test('classifier: exercise names', () => {
  const cases: [string, ReturnType<typeof classifyExercise>][] = [
    ['Leg Press', 'lower'],
    ['Back Squat', 'lower'],
    ['Romanian Deadlift', 'lower'],
    ['Calf Raises', 'lower'],
    ['Cable Pull-Through', 'lower'],
    ['Shoulder Press', 'upper'],
    ['Lat Pulldown', 'upper'],
    ['Pull-ups', 'upper'],
    ['Lateral Raise', 'upper'],
    ['Seated Row', 'upper'],
    ['Hanging Leg Raise', 'core'],
    ['Plank', 'core'],
    ['Treadmill', 'cardio'],
    ['Stair Stepper', 'cardio'],
    ['Rower', 'cardio'],
    ['Zorbnik', null],
  ]
  for (const [name, expected] of cases) {
    expect(classifyExercise(name, 'weight', false), name).toBe(expected)
  }
  // A timed exercise that tracks distance is cardio whatever it's called.
  expect(classifyExercise('Zorbnik', 'timed', true)).toBe('cardio')
})

test('classifier: template names', () => {
  const cases: [string, ReturnType<typeof classifyTemplateName>][] = [
    ['Push Day', 'upper'],
    ['Pull', 'upper'],
    ['Back & Bis', 'upper'],
    ['Leg Day', 'lower'],
    ['Leg - Quads', 'lower'],
    ['Upper A', 'upper'],
    ['Upper/Lower', 'full'],
    ['Full Body', 'full'],
    ['Cardio Tuesday', 'cardio'],
    ['Abs Finisher', 'core'],
    ['Legs + Core', null],
    ['Tuesday', null],
  ]
  for (const [name, expected] of cases) {
    expect(classifyTemplateName(name), name).toBe(expected)
  }
})

test('classifier: exercise mix and precedence', () => {
  expect(classifyExerciseMix(['lower', 'lower'])).toBe('lower')
  expect(classifyExerciseMix(['upper', 'lower', 'core'])).toBe('full')
  expect(classifyExerciseMix(['cardio', 'cardio', 'upper'])).toBe('cardio')
  expect(classifyExerciseMix(['core', 'core'])).toBe('core')
  expect(classifyExerciseMix(['cardio', 'core'])).toBe('cardio')
  expect(classifyExerciseMix([null, null])).toBe('other')
  expect(classifyExerciseMix([])).toBe('other')

  const squat = { name: 'Squat', load_type: 'weight' as const, tracks_distance: false }
  expect(templateCategory(null, 'Tuesday', [squat])).toBe('lower')
  expect(templateCategory(null, 'Push Day', [squat])).toBe('upper')
  expect(templateCategory('core', 'Push Day', [squat])).toBe('core')
})

test('Home tiles and Templates rows show each routine’s category', async ({ page, stamp }) => {
  const admin = localDb(page)
  // Routine names avoid every keyword unless the name itself is under test.
  const names = {
    lower: `E2E Cat Alpha ${stamp}`,
    upper: `E2E Push Day ${stamp}`,
    full: `E2E Cat Gamma ${stamp}`,
    cardio: `E2E Cat Delta ${stamp}`,
    other: `E2E Cat Epsilon ${stamp}`,
  }

  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const insertExercise = async (name: string, extra: Record<string, unknown> = {}) =>
        (await admin.from('exercises').insert({ user_id: userId, name, ...extra }).select('id').single()).data!.id
      const squat = await insertExercise(`E2E Cat Squat ${stamp}`)
      const legPress = await insertExercise(`E2E Cat Leg Press ${stamp}`)
      const bench = await insertExercise(`E2E Cat Bench ${stamp}`)
      const jogger = await insertExercise(`E2E Cat Jogger ${stamp}`, { load_type: 'timed', tracks_distance: true })
      const zorb = await insertExercise(`E2E Cat Zorbnik ${stamp}`)

      const templates: [string, string[]][] = [
        [names.lower, [squat, legPress]],
        [names.upper, [zorb]],
        [names.full, [squat, bench]],
        [names.cardio, [jogger]],
        [names.other, [zorb]],
      ]
      for (const [name, exerciseIds] of templates) {
        const { data: template } = await admin
          .from('workout_templates')
          .insert({ user_id: userId, name })
          .select('id')
          .single()
        await admin
          .from('workout_template_exercises')
          .insert(exerciseIds.map((exercise_id, position) => ({ template_id: template!.id, exercise_id, position })))
      }
    },
  })

  const labels = { lower: 'Lower body', upper: 'Upper body', full: 'Full body', cardio: 'Cardio', other: 'Other' }
  for (const [category, name] of Object.entries(names) as [keyof typeof names, string][]) {
    const tile = page.getByRole('button', { name, exact: true })
    await expect(tile, name).toHaveAttribute('data-category', category)
    await expect(tile, name).toHaveAccessibleDescription(`${labels[category]} routine`)
  }

  await goTo(page, 'Routines')
  for (const [category, name] of Object.entries(names) as [keyof typeof names, string][]) {
    const row = page.locator('.row', { hasText: name })
    await expect(row.locator('.template-icon'), name).toHaveAttribute('data-category', category)
    await expect(row.locator('.row-sub'), name).toContainText(labels[category])
  }
})

// Issue #2: the user's own pick overrides the guess until "Use automatic".
test('picking a category overrides the guess, persists, and can go back to automatic', async ({ page, stamp }) => {
  const admin = localDb(page)
  const name = `E2E Cat Zeta ${stamp}`
  let templateId = ''

  await page.setViewportSize({ width: 375, height: 800 })
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      const { data: exercise } = await admin
        .from('exercises')
        .insert({ user_id: userId, name: `E2E Cat Zorbnik ${stamp}` })
        .select('id')
        .single()
      const { data: template } = await admin
        .from('workout_templates')
        .insert({ user_id: userId, name })
        .select('id')
        .single()
      templateId = template!.id
      await admin
        .from('workout_template_exercises')
        .insert({ template_id: templateId, exercise_id: exercise!.id, position: 0 })
    },
  })

  const tile = page.getByRole('button', { name, exact: true })
  const row = page.locator('.row', { hasText: name })
  // Issue #6: the picker lives in the full-screen template editor.
  const editor = page.locator('.editor')
  const picker = editor.getByRole('group', { name: 'Category' })
  // Issue #176: surface the query's own error instead of a null-data TypeError.
  const dbCategory = async () => {
    const { data, error } = await admin.from('workout_templates').select('category').eq('id', templateId).single()
    if (error) throw new Error(`reading template ${templateId}'s category: ${error.message}`)
    return data.category
  }

  await expect(tile).toHaveAttribute('data-category', 'other')

  await goTo(page, 'Routines')
  await expect(row.locator('.template-icon')).toHaveAttribute('data-category', 'other')
  await row.locator('.row-title').click()
  await expect(picker.getByText('Auto: Other')).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Use automatic' })).toHaveCount(0)

  // Six options, three per row, all inside the editor at phone width.
  const options = picker.locator('.category-option')
  await expect(options).toHaveCount(6)
  const editorBox = (await editor.boundingBox())!
  const boxes = await Promise.all([0, 1, 2, 3, 4, 5].map(async (i) => (await options.nth(i).boundingBox())!))
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(editorBox.x)
    expect(box.x + box.width).toBeLessThanOrEqual(editorBox.x + editorBox.width + 0.5)
  }
  expect(Math.abs(boxes[0].y - boxes[2].y)).toBeLessThan(1)
  expect(Math.abs(boxes[3].y - boxes[5].y)).toBeLessThan(1)
  expect(boxes[3].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 1)

  await picker.getByRole('button', { name: 'Core', exact: true }).click()
  await expect(picker.getByRole('button', { name: 'Core', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(picker.getByRole('button', { name: 'Use automatic' })).toBeVisible()
  await expect.poll(dbCategory).toBe('core')
  await page.getByRole('button', { name: 'Back to routines' }).click()
  await expect(row.locator('.template-icon')).toHaveAttribute('data-category', 'core')
  await expect(row.locator('.row-sub')).toContainText('Core')

  await goTo(page, 'Home')
  await expect(tile).toHaveAttribute('data-category', 'core')
  await expect(tile).toHaveAccessibleDescription('Core routine')

  await page.reload()
  await expect(tile).toHaveAttribute('data-category', 'core')
  await goTo(page, 'Routines')
  await expect(row.locator('.template-icon')).toHaveAttribute('data-category', 'core')

  await row.locator('.row-title').click()
  await picker.getByRole('button', { name: 'Use automatic' }).click()
  await expect(picker.getByText('Auto: Other')).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Core', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(dbCategory).toBeNull()
  await page.getByRole('button', { name: 'Back to routines' }).click()
  await expect(row.locator('.template-icon')).toHaveAttribute('data-category', 'other')

  await goTo(page, 'Home')
  await expect(tile).toHaveAttribute('data-category', 'other')
})
