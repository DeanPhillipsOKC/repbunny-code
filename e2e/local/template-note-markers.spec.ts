import { test, expect, type Page } from '@playwright/test'

// Issue #168: on Routine progress a session with a note gets a marker, and
// tapping it shows the note in the session card. One badge per point: a
// pencil for a note alone, the story bubble with a pink dot when the session
// also has a story (#158). On a dense range every badge drops to a pip.

const TEMPLATE = 'E2E Push day'
const NOTE = 'Shoulder felt tight, dropped the bench to 155.'
const BOTH_NOTE = 'Gym was packed, cut it short.'

// `count` Push day sessions, 4 days apart, oldest first. Session 1 has a note
// only; the newest has a note and skipped the fly.
async function seed(page: Page, count: number) {
  const dates = Array.from({ length: count }, (_, i) => new Date(Date.now() - (count - i) * 4 * 86_400_000).toISOString())
  await page.evaluate(
    async ({ dates, template, note, bothNote }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const last = dates.length - 1
      const { error } = await repos.backup.restore({
        format: 'repbunny-backup',
        version: 2,
        exported_at: new Date().toISOString(),
        exercises: [
          { id: 'e1', name: 'E2E Bench', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false },
          { id: 'e2', name: 'E2E Cable Fly', muscle_group: 'chest', also_works: [], load_type: 'weight', is_archived: false },
        ],
        workout_templates: [{ id: 't1', name: template, is_archived: false, category: 'upper' }],
        workout_template_exercises: [
          { id: 'te1', template_id: 't1', exercise_id: 'e1', position: 0, target_sets: 1 },
          { id: 'te2', template_id: 't1', exercise_id: 'e2', position: 1, target_sets: 1 },
        ],
        workouts: dates.map((at: string, i: number) => ({
          id: `w${i}`,
          performed_at: at,
          template_id: 't1',
          notes: i === 1 ? note : i === last ? bothNote : i === 2 ? '   ' : null,
          events: i === last ? [{ type: 'skip', exercise: { id: 'e2', name: 'E2E Cable Fly' } }] : null,
        })),
        sets: dates.flatMap((_: string, i: number) => [
          { id: `a${i}`, workout_id: `w${i}`, exercise_id: 'e1', set_index: 0, reps: 8, weight: 135 + (i % 5) * 10, weight_unit: 'lb' },
          ...(i === last ? [] : [{ id: `b${i}`, workout_id: `w${i}`, exercise_id: 'e2', set_index: 1, reps: 12, weight: 30, weight_unit: 'lb' }]),
        ]),
        body_weight_entries: [],
      })
      if (error) throw new Error(error.message)
      const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
      setPremiumUnlocked(true)
    },
    { dates, template: TEMPLATE, note: NOTE, bothNote: BOTH_NOTE },
  )
}

async function open(page: Page, count: number) {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await seed(page, count)
  await page.reload()
  await page.goto('/progress/templates')
  await page.getByRole('link', { name: new RegExp(`^${TEMPLATE}`) }).click()
  await expect(page.getByRole('heading', { name: TEMPLATE })).toBeVisible()
}

test('local mode: a noted session gets a pencil marker that opens its note', async ({ page }) => {
  await open(page, 5)

  // Session 1: note only. The newest: story plus note, one badge with a dot.
  // A blank note gets nothing.
  const noteMarker = page.getByTestId('note-marker')
  const storyMarker = page.getByTestId('story-marker')
  await expect(noteMarker).toHaveCount(1)
  await expect(storyMarker).toHaveCount(1)
  await expect(storyMarker).toHaveAttribute('data-note', 'true')
  await expect(storyMarker.locator('.note-dot')).toHaveCount(1)
  await expect(noteMarker.locator('.note-dot')).toHaveCount(0)

  // The latest session leads with its note, then its story.
  const session = page.getByTestId('template-session')
  await expect(session).toContainText('Latest session')
  await expect(session.getByRole('note', { name: 'Workout note' })).toHaveText(BOTH_NOTE)
  await expect(session.getByTestId('workout-story')).toHaveText('Skipped E2E Cable Fly.')
  const noteBox = await session.getByTestId('workout-note').boundingBox()
  const storyBox = await session.getByTestId('workout-story').boundingBox()
  expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(storyBox!.y)

  // Tapping the pencil opens session 1's note, with no story.
  await noteMarker.click()
  await expect(session).toContainText('Selected session')
  await expect(session.getByRole('note', { name: 'Workout note' })).toHaveText(NOTE)
  await expect(session.getByTestId('workout-story')).toHaveCount(0)

  // A session with neither shows neither.
  await page.locator('.hit').first().click()
  await expect(session.getByTestId('workout-note')).toHaveCount(0)
  await expect(session.getByTestId('workout-story')).toHaveCount(0)

  // Full badges sit clear of each other and inside the chart.
  const chart = (await page.locator('.chart-svg').boundingBox())!
  for (const marker of [noteMarker, storyMarker]) {
    const box = (await marker.boundingBox())!
    expect(box.width).toBeGreaterThan(12)
    expect(box.x).toBeGreaterThanOrEqual(chart.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(chart.x + chart.width + 1)
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('local mode: on a dense range the markers drop to pips that never overlap', async ({ page }) => {
  // 40 sessions over 160 days: All shows every one, about 7px apart at 375px.
  await open(page, 40)
  await page.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: 'All' }).click()

  const markers = page.locator('.story-marker')
  await expect(markers).toHaveCount(2)
  await expect(page.locator('.story-marker.pip')).toHaveCount(2)
  const boxes = await markers.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect))
  for (const box of boxes) {
    expect(box.width).toBeLessThan(8)
    expect(box.height).toBeLessThan(8)
  }

  // Neighboring points' pips never touch: lay a pip at every point and check.
  const spacing = await page.evaluate(() => {
    const dots = [...document.querySelectorAll('.chart-svg .dot')].map((d) => d.getBoundingClientRect())
    const centers = dots.map((d) => d.x + d.width / 2)
    return Math.min(...centers.slice(1).map((c, i) => c - centers[i]))
  })
  const pipWidth = Math.max(...boxes.map((b) => b.width))
  expect(spacing).toBeGreaterThan(pipWidth)

  // Tapping the noted point still opens its note.
  await page.getByTestId('note-marker').click({ force: true })
  await expect(page.getByTestId('template-session').getByRole('note', { name: 'Workout note' })).toHaveText(NOTE)

  // Back on 3M (about 23 sessions, ~13px apart) the badges stay pips; on 1M
  // (7 sessions) they're full badges.
  await page.getByRole('group', { name: 'Chart range' }).getByRole('button', { name: '1M' }).click()
  await expect(page.locator('.story-marker.pip')).toHaveCount(0)
  await expect(page.locator('.story-marker')).toHaveCount(1)
})
