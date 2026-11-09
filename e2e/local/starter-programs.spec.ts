import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #148: Templates' Starter programs. Add makes a program's templates
// from the library, reusing an exercise the user already has. Since #209 they
// are free within the 3-template limit.

async function firstLaunch(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
}

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

// Routine name -> [exercise name, target sets, rest seconds][] in order.
async function savedTemplates(page: Page) {
  return page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const { data: templates } = await repos.templates.list()
    const { data: exercises } = await repos.exercises.list()
    const out: Record<string, { category: string | null; rows: [string, number | null, number | null][] }> = {}
    for (const t of templates.filter((t) => !t.is_archived)) {
      const { data: rows } = await repos.templates.listExercises(t.id)
      out[t.name] = {
        category: t.category,
        rows: rows.map((r) => {
          const e = exercises.find((e) => e.id === r.exercise_id)!
          return [e.name, r.target_sets, e.rest_seconds]
        }),
      }
    }
    return { templates: out, exerciseCount: exercises.filter((e) => !e.is_archived).length }
  })
}

// Issues #209 and #1012: programs are free and count toward the 3-routine
// limit. Without Premium a meter counts the free routines, each free program
// says Fits or No room, and the two 5-routine splits sit in a closed Bigger
// programs accordion whose sheets offer See Premium instead of Add.
test('local mode: a fresh install shows the free routine meter, every program fits, and Bigger programs is closed', async ({
  page,
}) => {
  await firstLaunch(page)
  await goTo(page, 'Routines')

  const section = page.getByRole('region', { name: 'Starter programs' })
  await expect(section.getByTestId('routine-meter')).toHaveText('0 of 3 free routines used.')
  await expect(section.getByRole('button', { name: /Beginner full body/ })).toContainText('3 days a week · 2 routines · Fits')
  await expect(section.getByRole('button', { name: /Upper \/ lower/ })).toContainText('4 days a week · 2 routines · Fits')
  await expect(section.getByRole('button', { name: /^Push \/ pull \/ legs/ })).toContainText('3 or 6 days a week · 3 routines · Fits')
  await expect(section.locator('.group .program-row')).toHaveCount(5)
  await expect(section.locator('.group .program-row', { hasText: 'No room' })).toHaveCount(0)
  // No sparkles: the plain-text Premium tag on the accordion replaces them.
  await expect(section.locator('.premium-mark')).toHaveCount(0)

  const bigger = section.getByRole('button', { name: /Bigger programs/ })
  await expect(bigger).toHaveAttribute('aria-expanded', 'false')
  await expect(bigger).toContainText('5 routines each. Free holds up to 3 routines.')
  await expect(section.getByRole('button', { name: /Body-part split/ })).toHaveCount(0)
  await expect(section.getByRole('button', { name: /Machine 6-day split/ })).toHaveCount(0)

  // Long names wrap: nothing runs past a 320px phone.
  await page.setViewportSize({ width: 320, height: 800 })
  const widest = await section.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(widest).toBeLessThanOrEqual(0)
})

test('local mode: opening Bigger programs shows the 5-routine splits, and their sheet reads See Premium', async ({ page }) => {
  await firstLaunch(page)
  await goTo(page, 'Routines')

  const section = page.getByRole('region', { name: 'Starter programs' })
  const bigger = section.getByRole('button', { name: /Bigger programs/ })
  await bigger.click()
  await expect(bigger).toHaveAttribute('aria-expanded', 'true')
  const rows = section.locator('.bigger-body .program-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Machines')
  await expect(rows.nth(0)).toContainText('Machine 6-day split')
  await expect(rows.nth(0)).toContainText('6 days a week · 5 routines')
  await expect(rows.nth(1)).toContainText('Free weights')
  await expect(rows.nth(1)).toContainText('Body-part split')
  await expect(rows.filter({ hasText: /Fits|No room/ })).toHaveCount(0)

  // Readable, but the sheet says why and offers See Premium; nothing is added.
  await rows.nth(1).click()
  const split = page.getByRole('dialog', { name: 'Body-part split' })
  await expect(split.getByRole('group', { name: 'Split: Arms' })).toBeVisible()
  await expect(split.locator('.fit-note')).toHaveText('This adds 5 routines. Free holds up to 3 routines. Get Premium for no limit.')
  await expect(split.getByRole('button', { name: /^Add/ })).toHaveCount(0)
  await expect(split.getByRole('button', { name: 'Manage my routines' })).toHaveCount(0)
  await split.getByRole('button', { name: 'See Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByRole('heading', { name: 'Bigger starter programs' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await expect(premium).toHaveCount(0)
  await split.getByRole('button', { name: 'Close', exact: true }).last().click()
  await expect(split).toHaveCount(0)
  await expect(page.locator('.row-wrap')).toHaveCount(0)
})

test('local mode: after adding a 3-routine program the meter is full, every program has No room, and the sheet explains', async ({
  page,
}) => {
  await firstLaunch(page)
  await goTo(page, 'Routines')
  const section = page.getByRole('region', { name: 'Starter programs' })

  // Push / pull / legs fits in the free 3: one tap on Add.
  await section.getByRole('button', { name: /^Push \/ pull \/ legs/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Push / pull / legs' })
  await expect(sheet).toContainText('Lifters who like a clear focus each day.')
  await expect(sheet.locator('.fit-note')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Add 3 routines' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('.row-wrap .row-title')).toHaveText(['PPL: Push', 'PPL: Pull', 'PPL: Legs'])
  // Issue #403: real counts straight away, no reload.
  await expect(page.locator('.row-wrap', { hasText: 'PPL: Push' })).toContainText('5 exercises')

  await expect(section.getByTestId('routine-meter')).toHaveText(
    '3 of 3 free routines used. Archive routines to make room, or get Premium for no limit.',
  )
  await expect(section.locator('.group .program-row', { hasText: 'No room' })).toHaveCount(5)
  await expect(section.locator('.group .program-row', { hasText: 'Fits' })).toHaveCount(0)

  await section.getByRole('button', { name: /Upper \/ lower/ }).click()
  const upper = page.getByRole('dialog', { name: 'Upper / lower' })
  await expect(upper.locator('.fit-note')).toHaveText(
    'This adds 2 routines. Free holds 3 and you have 3. Archive two of yours to make room, or get Premium for no limit.',
  )
  await expect(upper.getByRole('button', { name: /^Add/ })).toHaveCount(0)
  await upper.getByRole('button', { name: 'See Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByRole('heading', { name: 'Unlimited routines' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()

  // Manage my routines closes the sheet and goes back up to the routines.
  await upper.getByRole('button', { name: 'Manage my routines' }).click()
  await expect(upper).toHaveCount(0)
  await expect(page.locator('.row-wrap', { hasText: 'PPL: Push' })).toBeInViewport()
  await expect(page.locator('.row-wrap')).toHaveCount(3)
})

test('local mode: a free user with 2 routines sees No room and how many to archive', async ({ page }) => {
  await firstLaunch(page)
  await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    for (const name of ['Monday', 'Thursday']) {
      const { error } = await repos.templates.create(name)
      if (error) throw new Error(error.message)
    }
  })
  await page.reload()
  await goTo(page, 'Routines')
  await expect(page.locator('.row-wrap')).toHaveCount(2)
  const section = page.getByRole('region', { name: 'Starter programs' })
  await expect(section.getByTestId('routine-meter')).toHaveText('2 of 3 free routines used.')

  await section.getByRole('button', { name: /^Push \/ pull \/ legs/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Push / pull / legs' })
  await expect(sheet.locator('.fit-note')).toContainText('This adds 3 routines. Free holds 3 and you have 2. Archive two of yours')
  await sheet.getByRole('button', { name: 'See Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByRole('heading', { name: 'Unlimited routines' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await sheet.getByRole('button', { name: 'Close', exact: true }).last().click()

  // A 2-routine program doesn't fit either (2 + 2 > 3): archive one.
  await section.getByRole('button', { name: /Beginner full body/ }).click()
  await expect(page.getByRole('dialog', { name: 'Beginner full body' }).locator('.fit-note')).toContainText('Archive one of yours')

  // Nothing was added.
  const saved = await savedTemplates(page)
  expect(Object.keys(saved.templates).sort()).toEqual(['Monday', 'Thursday'])
  expect(saved.exerciseCount).toBe(0)
})

// Issues #148 and #167: the program data itself. Every lift is in the library,
// every day of a sample week names one of the program's own templates,
// template names never repeat across programs, and each group's lifts only
// need that group's equipment.
test('local mode: every starter program is well formed', async ({ page }) => {
  await page.goto('/')
  const problems = await page.evaluate(async () => {
    const { STARTER_GROUPS, STARTER_PROGRAMS } = await window.__rbImport('/src/lib/starterPrograms.ts')
    const { libraryEntry } = await window.__rbImport('/src/lib/exerciseLibrary.ts')
    const allowed: Record<string, string[] | null> = {
      machines: ['machine', 'cable', 'bodyweight'],
      dumbbells: ['dumbbell', 'bodyweight'],
      'free-weights': null,
    }
    const out: string[] = []
    const ids = new Set<string>()
    const names = new Set<string>()
    for (const program of STARTER_PROGRAMS) {
      if (ids.has(program.id)) out.push(`duplicate id ${program.id}`)
      ids.add(program.id)
      if (!STARTER_GROUPS.some((g: { id: string }) => g.id === program.group)) out.push(`${program.id}: no group`)
      const own = new Set(program.templates.map((t: { name: string }) => t.name))
      for (const slot of program.week) if (!own.has(slot.template)) out.push(`${program.id}: week names ${slot.template}`)
      for (const starter of program.templates) {
        if (names.has(starter.name)) out.push(`duplicate template ${starter.name}`)
        names.add(starter.name)
        for (const lift of starter.lifts) {
          const entry = libraryEntry(lift.libraryId)
          if (!entry) out.push(`${program.id}: ${lift.libraryId} not in library`)
          else if (allowed[program.group] && !allowed[program.group]!.includes(entry.equipmentType))
            out.push(`${program.id}: ${lift.libraryId} is ${entry.equipmentType}`)
          if (!(lift.sets > 0)) out.push(`${program.id}: ${lift.libraryId} has no sets`)
        }
      }
    }
    for (const group of STARTER_GROUPS)
      if (!STARTER_PROGRAMS.some((p: { group: string }) => p.group === group.id)) out.push(`empty group ${group.id}`)
    return out
  })
  expect(problems).toEqual([])
})

// Issue #167: programs are grouped by equipment, and the machine 6-day split
// adds five templates, one of them a cardio and core day.
test('local mode: programs are grouped by equipment, and the machine 6-day split adds its templates', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  await goTo(page, 'Routines')

  const section = page.getByRole('region', { name: 'Starter programs' })
  await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Machines', 'Free weights', 'Dumbbells only'])
  // Issue #1012: with Premium there's no meter, no fit labels, and no accordion.
  await expect(section.getByTestId('routine-meter')).toHaveCount(0)
  await expect(section.getByRole('button', { name: /Bigger programs/ })).toHaveCount(0)
  await expect(section.locator('.program-row', { hasText: /Fits|No room/ })).toHaveCount(0)
  const machines = section.getByRole('group', { name: 'Machines' })
  await expect(machines.getByRole('button')).toHaveCount(2)
  await expect(machines.getByRole('button', { name: /Machine push \/ pull \/ legs/ })).toContainText('3 days a week · 3 routines')
  await expect(machines.getByRole('button', { name: /Machine 6-day split/ })).toContainText('6 days a week · 5 routines')
  await expect(section.getByRole('group', { name: 'Free weights' }).getByRole('button', { name: /Body-part split/ })).toContainText(
    '5 days a week · 5 routines',
  )
  await expect(section.getByRole('group', { name: 'Dumbbells only' }).getByRole('button', { name: /Dumbbell full body/ })).toBeVisible()

  await machines.getByRole('button', { name: /Machine 6-day split/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Machine 6-day split' })
  await expect(sheet.locator('.week li')).toHaveCount(6)
  const cardio = sheet.getByRole('group', { name: '6-Day: Cardio & Core' })
  await expect(cardio.locator('li', { hasText: 'Treadmill' })).toContainText('20 to 30 min')
  await expect(cardio.locator('li', { hasText: 'Plank' })).toContainText('3 sets')

  // The sheet fits a 375px phone.
  const box = (await sheet.locator('.sheet').boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(375)

  await sheet.getByRole('button', { name: 'Add 5 routines' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('.row-wrap .row-title')).toHaveText([
    '6-Day: Push',
    '6-Day: Quads',
    '6-Day: Cardio & Core',
    '6-Day: Pull',
    '6-Day: Glutes & Hams',
  ])

  const saved = await savedTemplates(page)
  expect(saved.templates['6-Day: Cardio & Core'].category).toBe('cardio')
  expect(saved.templates['6-Day: Cardio & Core'].rows.map((r) => r.slice(0, 2))).toEqual([
    ['Treadmill', 1],
    ['Ab Crunch Machine', 3],
    ["Captain's Chair Knee Raise", 3],
    ['Plank', 3],
  ])
  expect(saved.templates['6-Day: Glutes & Hams'].category).toBe('lower')
  // 24 lifts across the five days, 21 different exercises.
  expect(saved.exerciseCount).toBe(21)
})

test('local mode: with Premium, adding a program makes its templates and reuses an owned exercise', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)

  // An exercise the user already has, under a library alias with its own rest.
  await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const { error } = await repos.exercises.create({
      name: 'Bench Press',
      setup_notes: null,
      rest_seconds: 200,
      load_type: 'weight',
      tracks_distance: false,
      tracks_incline: false,
      tracks_level: false,
      tracks_calories: false,
      muscle_group: 'chest',
      also_works: [],
      library_id: null,
    })
    if (error) throw new Error(error.message)
  })
  await page.reload()
  await goTo(page, 'Routines')

  await page.getByRole('region', { name: 'Starter programs' }).getByRole('button', { name: /Push \/ pull \/ legs/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Push / pull / legs' })
  await expect(sheet.getByRole('group', { name: 'Starter programs preview' })).toHaveCount(0)

  // The sheet fits a 375px phone.
  const box = (await sheet.locator('.sheet').boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(375)

  await expect(sheet.locator('.premium-mark')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Add 3 routines' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('Added PPL: Push, PPL: Pull, PPL: Legs. Tap one to change it.')
  await expect(page.locator('.row-wrap .row-title')).toHaveText(['PPL: Push', 'PPL: Pull', 'PPL: Legs'])

  const saved = await savedTemplates(page)
  expect(saved.templates['PPL: Push']).toEqual({
    category: 'upper',
    rows: [
      ['Bench Press', 3, 200],
      ['Incline Dumbbell Press', 3, 120],
      ['Seated Dumbbell Shoulder Press', 3, 120],
      ['Dumbbell Lateral Raise', 3, 90],
      ['Tricep Pushdown', 3, 90],
    ],
  })
  expect(saved.templates['PPL: Pull'].rows.map((r) => r.slice(0, 2))).toEqual([
    ['Lat Pulldown', 3],
    ['Barbell Row', 3],
    ['Seated Cable Row', 3],
    ['Face Pull', 3],
    ['Dumbbell Curl', 3],
  ])
  expect(saved.templates['PPL: Legs'].category).toBe('lower')
  expect(saved.templates['PPL: Legs'].rows[0]).toEqual(['Barbell Back Squat', 3, 150])
  // 15 lifts, 1 already owned: 14 new exercises plus the owned one.
  expect(saved.exerciseCount).toBe(15)

  // Adding it again reuses every exercise and doesn't collide on names.
  await page.getByRole('region', { name: 'Starter programs' }).getByRole('button', { name: /Push \/ pull \/ legs/ }).click()
  await sheet.getByRole('button', { name: 'Add 3 routines' }).click()
  await expect(page.locator('.row-wrap')).toHaveCount(6)
  const again = await savedTemplates(page)
  expect(Object.keys(again.templates)).toContain('PPL: Push (2)')
  expect(again.exerciseCount).toBe(15)

  // A program template is an ordinary template: it opens in the editor.
  await page.locator('.row-wrap', { hasText: 'PPL: Legs (2)' }).click()
  await expect(page.getByText('Seated Leg Curl')).toBeVisible()
})
