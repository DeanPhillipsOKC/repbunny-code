import { test, expect, type Page } from '@playwright/test'
import { openAccountSection } from '../fixtures/account'
import { selectExercise } from '../fixtures/exercise'
import { dismissCelebrationIfShown, skipUnlockCelebrations } from '../fixtures/celebration'
import { goTo, openLibrary } from '../fixtures/nav'

// Issue #183: the rest timer and the recap say what actually happened, in
// the picked bunny personality's voice, and the old line packs' picks carry
// over to the personalities on the same tiers.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'

// Classic's plain rest lines (src/lib/bunnyLines.ts).
const CLASSIC_PLAIN = [
  'Nice work. Take a breather.',
  "Take a load off. You've earned it.",
  'Keep it up.',
  'Solid set. Recover up.',
  'Breathe. You’re crushing it.',
  'Great effort. Reset for the next one.',
]

async function firstLaunchWithBench(page: Page, storage: Record<string, string> = {}) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()
  // A 30s rest on the bench.
  await page.evaluate(
    async ({ name, storage }) => {
      const { repos } = await window.__rbImport('/src/data/index.ts')
      const { data } = await repos.exercises.list()
      const bench = data.find((e: { name: string }) => e.name === name)!
      const { error } = await repos.exercises.update(bench.id, { rest_seconds: 30 })
      if (error) throw new Error(error.message)
      for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value)
    },
    { name: BENCH, storage },
  )
  await page.reload()
}

async function startBench(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
}

async function addSet(page: Page, reps: string, weight: string) {
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill(reps)
  await row.getByLabel('Weight').fill(weight)
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
}

async function finish(page: Page) {
  await page.getByRole('button', { name: 'Finish workout' }).click()
  const recap = page.getByTestId('post-finish-card')
  await expect(recap).toBeVisible()
  return recap
}

test('the rest timer and recap talk about this workout against last time', async ({ page }) => {
  await firstLaunchWithBench(page)

  // First workout: nothing to compare, so plain Classic lines.
  await startBench(page)
  await addSet(page, '5', '100')
  const headline = page.locator('.rest-headline')
  await expect(headline).toBeVisible()
  expect(CLASSIC_PLAIN).toContain(await headline.textContent())
  // Minimizing and coming back keeps the same line.
  const first = await headline.textContent()
  await page.getByRole('button', { name: 'Back to workout' }).click()
  await expect(headline).toHaveCount(0)
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await expect(headline).toHaveText(first!)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await addSet(page, '5', '100')
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  let recap = await finish(page)
  // Classic now has a recap line too, with nothing notable a plain one.
  await expect(recap.getByTestId('recap-bunny-line')).toHaveText(/^(Nice work today\.|Another one logged\.|Good session\. Rest up\.)$/)
  await recap.getByRole('button', { name: 'Done', exact: true }).click()

  // Second workout: 2 more reps at the same weight than the same set last time.
  await startBench(page)
  await expect(page.locator('.set-row-draft').first().getByLabel('Reps')).toHaveValue('5')
  await addSet(page, '7', '100')
  await expect(headline).toHaveText(/^(2 more reps than last time on Barbell Bench Press\.|Barbell Bench Press: 2 more reps than last time\.)$/)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  recap = await finish(page)
  // Up on one exercise (not 2+), so the week count leads.
  await expect(recap.getByTestId('recap-bunny-line')).toHaveText(/^(That's your 2nd workout this week\.|Workout number 2 this week\.)$/)
})

test('old line pack picks become personalities, and Premium hears its voice', async ({ page }) => {
  await skipUnlockCelebrations(page)
  // Picked Gym puns before #183, with its New pill already seen.
  await firstLaunchWithBench(page, {
    'repbunny-extras': JSON.stringify({ lines: 'puns' }),
    'repbunny-extras-viewed': JSON.stringify(['lines-puns']),
    'repbunny-milestones-seen': JSON.stringify(['strongWeeks-4']),
  })
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })

  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Theme/ }).click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  const row = theme.getByRole('button', { name: 'Bunny personality', exact: true })
  await expect(row).toHaveAccessibleDescription('Punny')
  await expect(row).not.toContainText('New')
  await row.click()
  const picker = page.getByRole('dialog', { name: 'Bunny personality', exact: true })
  await expect(picker.getByRole('button', { name: 'Punny', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(picker.getByRole('button', { name: 'Coach, locked, unlocks at 25 records' })).toBeVisible()
  await expect(picker.getByRole('button', { name: 'Hype, locked, unlocks at 300 workouts' })).toBeVisible()
  await picker.getByRole('button', { name: 'Close', exact: true }).click()

  // Two workouts: the second set beats the first one's reps, in Punny's voice.
  await startBench(page)
  await addSet(page, '5', '100')
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await finish(page).then((recap) => recap.getByRole('button', { name: 'Done', exact: true }).click())
  await startBench(page)
  await expect(page.locator('.set-row-draft').first().getByLabel('Reps')).toHaveValue('5')
  await addSet(page, '8', '100')
  await expect(page.locator('.rest-headline')).toHaveText(/^(3 more reps than last time\. Hare-raising\.|3 more reps on Barbell Bench Press\. Hoppy days\.)$/)
})
