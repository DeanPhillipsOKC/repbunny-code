import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'
import { openNewExerciseSheet, pickMuscleGroup, clickExerciseRowAction } from '../fixtures/exercise'

// Issue #138: the Balance card on Muscle groups, push vs pull and upper vs
// lower sets over the last 4 weeks. Issue #173: push or pull is per exercise,
// with a fix-up screen for the ones Balance can't place. A fresh local
// database starts empty, so the counts are exact.

async function setPremium(page: Page, unlocked: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, unlocked)
}

interface SeedExercise {
  name: string
  group: string
  sets: number
  push_pull?: string
}

// Restores a backup with one workout 3 days ago holding each exercise's sets.
async function seed(page: Page, list: SeedExercise[]) {
  const now = new Date()
  const performedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 12).toISOString()
  await page.evaluate(
    async ({ at, list }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      let i = 0
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: list.map((e, n) => ({
          id: `e${n}`,
          name: e.name,
          muscle_group: e.group,
          also_works: [],
          load_type: 'weight',
          is_archived: false,
          push_pull: e.push_pull ?? null,
        })),
        workout_templates: [],
        workout_template_exercises: [],
        workouts: [{ id: 'w1', performed_at: at, template_id: null, notes: null }],
        sets: list.flatMap((e, n) =>
          Array.from({ length: e.sets }, () => ({
            id: `s${i}`,
            workout_id: 'w1',
            exercise_id: `e${n}`,
            set_index: i++,
            reps: 8,
            weight: 100,
            weight_unit: 'lb',
          })),
        ),
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { at: performedAt, list },
  )
}

// E2E Row is a custom back exercise, so it needs its own push_pull to count.
function classic(counts: { bench: number; row: number; squat: number }): SeedExercise[] {
  return [
    { name: 'E2E Bench', group: 'chest', sets: counts.bench },
    { name: 'E2E Row', group: 'back', sets: counts.row, push_pull: 'pull' },
    { name: 'E2E Squat', group: 'legs', sets: counts.squat },
  ]
}

async function openMuscleGroups(page: Page, list: SeedExercise[], premium: boolean) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page, list)
  await setPremium(page, premium)
  await page.reload()
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Muscle groups', exact: true }).click()
  await expect(page).toHaveURL(/\/progress\/muscles$/)
}

test('local mode: a push-heavy month gets one gentle balance nudge', async ({ page }) => {
  await openMuscleGroups(page, classic({ bench: 12, row: 4, squat: 12 }), true)
  const card = page.getByTestId('balance-card')
  await expect(card.getByRole('heading', { name: 'Balance' })).toBeVisible()
  await expect(card.getByRole('group', { name: 'Push 12 sets, Pull 4 sets' })).toBeVisible()
  await expect(card.getByRole('group', { name: 'Upper 16 sets, Lower 12 sets' })).toBeVisible()
  // Push is 3x pull; upper is only 1.33x lower.
  await expect(card.getByTestId('balance-nudge')).toHaveCount(1)
  await expect(card.getByTestId('balance-push-pull').getByTestId('balance-nudge')).toHaveText(
    'Pull is behind push. A few more rows or pulldowns would even it out.',
  )
  // Everything upper-body has a side, so there's no "not counted" line.
  await expect(card.getByTestId('balance-uncounted')).toHaveCount(0)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('local mode: a balanced month shows the splits with no nudge', async ({ page }) => {
  await openMuscleGroups(page, classic({ bench: 10, row: 10, squat: 16 }), true)
  const card = page.getByTestId('balance-card')
  await expect(card.getByRole('group', { name: 'Push 10 sets, Pull 10 sets' })).toBeVisible()
  await expect(card.getByRole('group', { name: 'Upper 20 sets, Lower 16 sets' })).toBeVisible()
  await expect(card.getByTestId('balance-nudge')).toHaveCount(0)
})

test('local mode: without Premium, Balance is a preview of a sample', async ({ page }) => {
  await openMuscleGroups(page, classic({ bench: 12, row: 4, squat: 12 }), false)
  const card = page.getByTestId('balance-card')
  await expect(card.getByRole('heading', { name: 'Balance' })).toBeVisible()
  // The user's own numbers never show, nor the "not counted" line.
  await expect(card.getByRole('group', { name: /Push 12 sets/ })).toHaveCount(0)
  await expect(card.getByTestId('balance-uncounted')).toHaveCount(0)
  await card.getByRole('button', { name: 'Preview' }).click()
  const panel = card.getByRole('group', { name: 'Balance is part of Premium preview' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Keep it with Premium' })).toBeVisible()
  await panel.getByRole('button', { name: 'Go back' }).click()
  await expect(card.getByRole('button', { name: 'Preview' })).toBeVisible()
})

test('local mode: an unset shoulder exercise is flagged, and setting Pull moves its sets', async ({ page }) => {
  await openMuscleGroups(
    page,
    [
      { name: 'E2E Bench', group: 'chest', sets: 6 },
      // Matches the library by name (a curl), so it counts as pull unlinked.
      { name: 'Dumbbell Curl', group: 'arms', sets: 3 },
      { name: 'E2E Shoulder Thing', group: 'shoulders', sets: 5 },
      { name: 'E2E Squat', group: 'legs', sets: 4 },
    ],
    true,
  )
  const card = page.getByTestId('balance-card')
  await expect(card.getByRole('group', { name: 'Push 6 sets, Pull 3 sets' })).toBeVisible()
  // Upper vs lower still counts it.
  await expect(card.getByRole('group', { name: 'Upper 14 sets, Lower 4 sets' })).toBeVisible()
  await expect(card.getByTestId('balance-uncounted')).toContainText("1 exercise isn't counted.")
  await card.getByRole('link', { name: 'Set push or pull' }).click()

  await expect(page).toHaveURL(/\/exercises\/push-pull$/)
  await expect(page.getByRole('heading', { name: 'Push or pull?' })).toBeVisible()
  const rows = page.getByTestId('push-pull-row')
  // Only the one Balance can't place; never the legs one or the library curl.
  await expect(rows).toHaveCount(1)
  const row = page.getByRole('listitem', { name: 'E2E Shoulder Thing' })
  await row.getByRole('button', { name: 'Pull', exact: true }).click()
  await expect(row.getByRole('status')).toHaveText('Saved')
  await expect(row.getByRole('button', { name: 'Pull', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page).toHaveURL(/\/progress\/muscles$/)
  await expect(card.getByRole('group', { name: 'Push 6 sets, Pull 8 sets' })).toBeVisible()
  await expect(card.getByTestId('balance-uncounted')).toHaveCount(0)

  // It stuck, and the fix-up screen has nothing left.
  await page.reload()
  await expect(card.getByRole('group', { name: 'Push 6 sets, Pull 8 sets' })).toBeVisible()
  await page.goto('/exercises/push-pull')
  await expect(page.getByTestId('push-pull-empty')).toBeVisible()
  await page.getByRole('link', { name: 'Back to Muscle groups' }).click()
  await expect(page).toHaveURL(/\/progress\/muscles$/)
})

test('local mode: the library lookup goes by library_id, then by name', async ({ page }) => {
  await page.goto('/')
  const found = await page.evaluate(async () => {
    const { libraryMovementOf } = await window.__rbImport('/src/lib/exerciseLibrary.ts')
    return [
      libraryMovementOf({ name: 'My Rear Delts', library_id: 'face_pull' }),
      libraryMovementOf({ name: 'tricep pushdown', library_id: null }),
      libraryMovementOf({ name: 'Face Pull', library_id: 'no_such_entry' }),
      libraryMovementOf({ name: 'E2E Nothing Like It', library_id: null }),
    ]
  })
  expect(found).toEqual(['rear_delt', 'triceps_extension', 'rear_delt', null])
})

test('local mode: the exercise form asks push or pull only for upper body', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await goTo(page, 'Exercises')

  const sheet = await openNewExerciseSheet(page)
  await page.getByLabel('Name').fill('E2E Arm Thing')
  const picker = sheet.getByRole('group', { name: 'Push or pull?' })
  await expect(picker).toHaveCount(0)
  await pickMuscleGroup(sheet, 'Arms')
  await expect(picker).toBeVisible()
  // A custom arms exercise has no answer to pre-select.
  await expect(picker.getByRole('button', { pressed: true })).toHaveCount(0)
  await pickMuscleGroup(sheet, 'Legs')
  await expect(picker).toHaveCount(0)
  // Chest is pre-selected as push.
  await pickMuscleGroup(sheet, 'Chest')
  await expect(picker.getByRole('button', { name: 'Push', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await pickMuscleGroup(sheet, 'Arms')
  await picker.getByRole('button', { name: 'Pull', exact: true }).click()
  await expect(picker.getByRole('button', { name: 'Pull', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Add exercise' }).click()
  await expect(sheet).toHaveCount(0)

  await page.reload()
  await clickExerciseRowAction(page.locator('.row-wrap', { hasText: 'E2E Arm Thing' }), 'Edit exercise')
  const edit = page.getByRole('dialog', { name: 'Edit exercise' })
  await expect(edit.getByRole('group', { name: 'Push or pull?' }).getByRole('button', { name: 'Pull', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
