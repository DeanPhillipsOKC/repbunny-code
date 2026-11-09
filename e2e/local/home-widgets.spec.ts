import { test, expect, type Page } from '@playwright/test'
import { goTo } from '../fixtures/nav'

// Issue #144: home screen widgets (Premium, native apps). A browser has no
// home screen, so this runs against the plugin's web stand-in
// (src/lib/homeWidgetsWeb.ts): it keeps the snapshot the app writes, and
// simulateWidgetTap plays a tap on a widget. How the widgets draw it is
// checked on a device; the snapshot rules are in widget-snapshot-unit.spec.ts.

type Snapshot = {
  premium: boolean
  colors: { accent: string }
  dayMark: string
  week: { count: number; days: boolean[] }
  next: { templateId: string; name: string; sub: string } | null
  record: { exerciseName: string; detail: string; date: string } | null
}

function readSnapshot(page: Page): Promise<Snapshot | null> {
  return page.evaluate(async () => {
    const { readWidgetSnapshot } = await window.__rbImport('/src/lib/homeWidgets.ts')
    return readWidgetSnapshot()
  })
}

function tapWidget(page: Page, action: { action: 'start'; templateId: string } | { action: 'premium' }) {
  return page.evaluate(async (action) => {
    const { simulateWidgetTap } = await window.__rbImport('/src/lib/homeWidgets.ts')
    await simulateWidgetTap(action)
  }, action)
}

// Two templates; Legs eight days ago and Push a minute ago (this week),
// where the bench set beats Legs' one.
async function seed(page: Page) {
  const earlier = new Date(Date.now() - 8 * 86_400_000).toISOString()
  const latest = new Date(Date.now() - 60_000).toISOString()
  await page.evaluate(
    async ({ earlier, latest }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [
          { id: 'e1', name: 'E2E Bench', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false },
          { id: 'e2', name: 'E2E Squat', muscle_group: 'legs', also_works: [], load_type: 'weight', is_archived: false },
        ],
        workout_templates: [
          { id: 't1', name: 'E2E Push', is_archived: false, category: 'upper' },
          { id: 't2', name: 'E2E Legs', is_archived: false, category: 'lower' },
        ],
        workout_template_exercises: [
          { id: 'te1', template_id: 't1', exercise_id: 'e1', position: 0, target_sets: 3 },
          { id: 'te2', template_id: 't2', exercise_id: 'e2', position: 0, target_sets: 3 },
        ],
        workouts: [
          { id: 'w1', performed_at: earlier, template_id: 't2', notes: null },
          { id: 'w2', performed_at: latest, template_id: 't1', notes: null },
        ],
        sets: [
          { id: 's1', workout_id: 'w1', exercise_id: 'e1', set_index: 0, reps: 8, weight: 135, weight_unit: 'lb' },
          { id: 's2', workout_id: 'w1', exercise_id: 'e2', set_index: 1, reps: 5, weight: 185, weight_unit: 'lb' },
          { id: 's3', workout_id: 'w2', exercise_id: 'e1', set_index: 0, reps: 8, weight: 155, weight_unit: 'lb' },
        ],
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
    },
    { earlier, latest },
  )
}

async function setUp(page: Page, init: Record<string, string>) {
  await page.addInitScript((init) => {
    for (const [key, value] of Object.entries(init)) localStorage.setItem(key, value)
  }, init)
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page)
  await page.reload()
}

test('with Premium the widgets follow your week, next template, latest record, and theme, and Next workout starts it', async ({
  page,
}) => {
  await setUp(page, { 'repbunny-premium-unlocked': 'true', 'repbunny-theme': 'halloween' })

  // Push was last, so Legs is next. The templates may land a moment after
  // the sets, so wait for both. (Restore gives every row a new id.)
  await expect
    .poll(async () => (await readSnapshot(page))?.next)
    .toMatchObject({ name: 'E2E Legs', sub: 'Lower body' })
  const snapshot = (await readSnapshot(page))!
  expect(snapshot.premium).toBe(true)
  expect(snapshot.week.count).toBe(1)
  expect(snapshot.week.days[new Date().getDay()]).toBe(true)
  expect(snapshot.record).toMatchObject({ exerciseName: 'E2E Bench', detail: '8 × 155 lb' })
  expect(snapshot.colors.accent).toBe('#ff9a3c')
  expect(snapshot.dayMark).toBe('candy-corn')

  // A theme change reaches the widgets.
  await page.evaluate(async () => {
    const { chooseTheme } = await window.__rbImport('/src/lib/theme.ts')
    chooseTheme({ theme: 'chalk' })
  })
  await expect.poll(async () => (await readSnapshot(page))?.colors.accent).toBe('#8fb4d9')
  expect((await readSnapshot(page))?.dayMark).toBe('paw')

  // Tapping Next workout from another screen starts Legs on Home.
  await goTo(page, 'Progress')
  const legsId = snapshot.next!.templateId
  await tapWidget(page, { action: 'start', templateId: legsId })
  await expect(page).toHaveURL(/localhost:5174\/$/)
  await expect(page.getByRole('button', { name: 'Finish workout' })).toBeVisible()
  await expect(page.getByText('E2E Legs').first()).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('repbunny-active-workout-id'))).not.toBeNull()

  // A second tap while it's going doesn't start another.
  const activeId = await page.evaluate(() => localStorage.getItem('repbunny-active-workout-id'))
  await tapWidget(page, { action: 'start', templateId: legsId })
  await expect(page.getByText('E2E Legs').first()).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('repbunny-active-workout-id'))).toBe(activeId)
})

test('free: the widgets get the Premium placeholder, and its tap opens the Premium sheet', async ({ page }) => {
  await setUp(page, {})

  await expect.poll(async () => (await readSnapshot(page))?.week.count).toBe(1)
  expect((await readSnapshot(page))?.premium).toBe(false)

  await goTo(page, 'Progress')
  await tapWidget(page, { action: 'premium' })
  const sheet = page.getByRole('dialog', { name: 'Premium' })
  await expect(sheet.getByRole('heading', { name: 'Home screen widgets' })).toBeVisible()

  // Unlocking reaches the widgets too.
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
  await expect.poll(async () => (await readSnapshot(page))?.premium).toBe(true)
})
