import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { clickExerciseRowAction } from '../fixtures/exercise'

// Linking existing exercises to the library (follow-up to #136). A name close
// to a library one is suggested (never linked on its own): the Strength levels
// card and the Exercises tab banner open a review screen with Yes / No, and
// the edit sheet's Library match row links, changes, or unlinks by hand.

async function seed(page: Page) {
  await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const at = new Date(Date.now() - 2 * 86400000).toISOString()
    const ex = (id: string, name: string, muscle_group: string) => ({ id, name, muscle_group, also_works: [], load_type: 'weight', is_archived: false })
    const { error } = await repos.backup.restore({
      format: 'repbunny-backup',
      version: 2,
      exported_at: new Date().toISOString(),
      exercises: [
        ex('dbb', 'Flat DB Bench', 'chest'),
        ex('sq', 'Barbell Back Squats', 'legs'),
        ex('tp', 'Cable Tricep Pushdowns', 'arms'),
        ex('ab', 'Arm Blaster', 'arms'),
        ex('lp', 'Lat Pulldwn', 'back'),
      ],
      workout_templates: [],
      workout_template_exercises: [],
      workouts: [{ id: 'w1', performed_at: at, template_id: null, notes: null }],
      sets: [
        ['sq', 1, 300],
        ['dbb', 5, 60],
      ].map(([exercise, reps, weight], i) => ({ id: `s${i}`, workout_id: 'w1', exercise_id: exercise, set_index: i, reps, weight, weight_unit: 'lb' })),
      body_weight_entries: [{ id: 'bw', weight: 200, weight_unit: 'lb', recorded_at: at }],
    })
    if (error) throw new Error(error.message)
  })
}

async function start(page: Page) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page)
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
    const { setStrengthSex } = await window.__rbImport('/src/lib/strengthLevels.ts')
    setStrengthSex('male')
  })
  await page.reload()
}

test('local mode: library link suggestions match close names, never exact ones or other load types', async ({ page }) => {
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const { suggestLibraryLink } = await window.__rbImport('/src/lib/libraryLink.ts')
    const names: [string, 'weight' | 'bodyweight'][] = [
      ['Flat DB Bench', 'weight'],
      ['Cable Tricep Pushdowns', 'weight'],
      ['DB Incline Press', 'weight'],
      ['Barbell RDLs', 'weight'],
      ['Chinups', 'bodyweight'],
      ['Chinups', 'weight'],
      ['Lat Pulldown', 'weight'],
      ['Arm Blaster', 'weight'],
    ]
    return names.map(([n, l]) => suggestLibraryLink(n, l)?.id ?? null)
  })
  expect(results).toEqual([
    'dumbbell_bench_press',
    'tricep_pushdown',
    'incline_dumbbell_press',
    'romanian_deadlift',
    'chin_up',
    // Chin-ups logged as weight don't match the bodyweight entry; they
    // match Weighted Pull-Up's "Weighted Chin-Up" alias (#850) instead.
    'weighted_pull_up',
    // An exact name already counts, so there's nothing to suggest.
    null,
    null,
  ])
})

test('local mode: review suggested links from Strength levels and the Exercises tab', async ({ page }) => {
  await start(page)

  await goTo(page, 'Progress')
  await page.getByRole('link', { name: /^Strength levels/ }).click()
  // Nothing counts yet: neither name is exact.
  await expect(page.getByTestId('strength-empty')).toBeVisible()
  const card = page.getByTestId('strength-link-card')
  await expect(card).toContainText('2 of your exercises might count here')
  await card.click()
  await expect(page).toHaveURL(/\/exercises\/link\?for=strength$/)

  // Only the two that would get a level; Cable Tricep Pushdowns waits for the full list.
  const rows = page.getByTestId('link-row')
  await expect(rows).toHaveCount(2)
  const squat = page.getByRole('listitem', { name: 'Barbell Back Squats' })
  await expect(squat).toContainText('Same as Barbell Back Squat?')
  await squat.getByRole('button', { name: 'Yes, link it' }).click()
  await expect(squat.getByRole('status')).toHaveText('Linked')
  const bench = page.getByRole('listitem', { name: 'Flat DB Bench' })
  await expect(bench).toContainText('Same as Dumbbell Bench Press?')
  await bench.getByRole('button', { name: 'No' }).click()
  await expect(bench.getByRole('status')).toHaveText('Kept separate')
  await page.getByRole('button', { name: 'Done' }).click()

  // Back on Strength levels: the squat is rated and nothing is left to ask.
  await expect(page).toHaveURL(/\/progress\/strength$/)
  await expect(page.getByTestId('strength-lift-squat').getByTestId('strength-tier')).toHaveText('Intermediate')
  await expect(page.getByTestId('strength-link-card')).toHaveCount(0)

  // The Exercises tab lists what's left, and the No is remembered after a reload.
  await page.reload()
  await goTo(page, 'Exercises')
  const banner = page.getByRole('link', { name: /might match the library/ })
  await expect(banner).toHaveText(/1 exercise might match the library/)
  await banner.click()
  await expect(page.getByTestId('link-row')).toHaveCount(1)
  await expect(page.getByRole('listitem', { name: 'Cable Tricep Pushdowns' })).toContainText('Same as Tricep Pushdown?')
})

test('local mode: link, change, and unlink an exercise by hand from its edit sheet', async ({ page }) => {
  await start(page)
  await goTo(page, 'Exercises')

  const openEdit = async (name: string) => {
    await clickExerciseRowAction(page.locator('.row-wrap', { hasText: name }), 'Edit exercise')
    const sheet = page.getByRole('dialog', { name: 'Edit exercise' })
    await expect(sheet).toBeVisible()
    return sheet
  }

  // A close name offers its match inline.
  let sheet = await openEdit('Flat DB Bench')
  const field = () => sheet.getByRole('group', { name: 'Library match' })
  await expect(field().getByTestId('library-link-status')).toHaveText('Not linked')
  await expect(field()).toContainText('Looks like Dumbbell Bench Press.')
  await field().getByRole('button', { name: 'Link it' }).click()
  await expect(field().getByTestId('library-link-status')).toHaveText('Linked to Dumbbell Bench Press')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()

  // No suggestion: search the library by hand.
  sheet = await openEdit('Arm Blaster')
  await expect(field().getByTestId('library-link-status')).toHaveText('Not linked')
  await field().getByRole('button', { name: 'Link to library' }).click()
  await field().getByRole('searchbox', { name: 'Search the library' }).fill('skull')
  await field().getByRole('button', { name: /^Skull Crusher/ }).click()
  await expect(field().getByTestId('library-link-status')).toHaveText('Linked to Skull Crusher')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()

  // Saved across a reload, then unlinked.
  await page.reload()
  sheet = await openEdit('Arm Blaster')
  await expect(field().getByTestId('library-link-status')).toHaveText('Linked to Skull Crusher')
  await field().getByRole('button', { name: 'Unlink' }).click()
  await expect(field().getByTestId('library-link-status')).toHaveText('Not linked')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toBeHidden()
  sheet = await openEdit('Arm Blaster')
  await expect(field().getByTestId('library-link-status')).toHaveText('Not linked')
  await sheet.getByRole('button', { name: 'Cancel' }).click()

  // The linked bench now gets a strength level.
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: /^Strength levels/ }).click()
  await expect(page.getByTestId('strength-lift-db_bench').getByTestId('strength-tier')).toHaveText('Novice')
})

// Issue #488: a near miss the strict matcher skips still gets its closest
// library entries offered on the edit sheet, best first, one tap to link.
test('local mode: the edit sheet offers the closest library entries for a loose name', async ({ page }) => {
  await start(page)
  await goTo(page, 'Exercises')
  await clickExerciseRowAction(page.locator('.row-wrap', { hasText: 'Lat Pulldwn' }), 'Edit exercise')
  const sheet = page.getByRole('dialog', { name: 'Edit exercise' })
  const field = sheet.getByRole('group', { name: 'Library match' })
  await expect(field.getByTestId('library-link-status')).toHaveText('Not linked')
  await expect(field).toContainText('Looks like Lat Pulldown.')
  await field.getByRole('button', { name: 'Link it' }).click()
  await expect(field.getByTestId('library-link-status')).toHaveText('Linked to Lat Pulldown')
})
