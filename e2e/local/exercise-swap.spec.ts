import { test, expect, type Page } from '@playwright/test'
import { goTo, openLibrary } from '../fixtures/nav'
import { selectExercise } from '../fixtures/exercise'
import { createTemplateViaUi } from '../fixtures/template'
import { dismissCelebrationIfShown, skipUnlockCelebrations } from '../fixtures/celebration'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #150: "Try instead" when the machine is taken. Free shows the
// suggestions as a preview that leads to Premium; with Premium a pick swaps
// the exercise for this workout only, keeping the remaining planned sets and
// leaving the template alone. The swapped-in exercise rests like the one it
// replaced.

const LEG_PRESS = 'Leg Press'
const HACK_SQUAT = 'Hack Squat'

async function addFromLibrary(page: Page, name: string) {
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(name)
  await page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: name }).getByText('Added', { exact: true })).toBeVisible()
}

async function logSet(page: Page, reps: string, weight: string) {
  const row = page.locator('.set-row-draft').first()
  await row.getByLabel('Reps').fill(reps)
  await row.getByLabel('Weight').fill(weight)
  await row.getByRole('button', { name: 'Add set' }).click()
  await dismissCelebrationIfShown(page)
}

async function unlockPremium(page: Page) {
  await page.evaluate(async () => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(true)
  })
}

test('local mode: swap a taken machine for this workout, free preview first', async ({ page }) => {
  // #187: the first workout unlocks Extras; that screen isn't what's tested here.
  await skipUnlockCelebrations(page)
  await page.setViewportSize({ width: 375, height: 800 })
  const premium = page.getByRole('dialog', { name: 'Premium' })
  const swapSheet = page.getByRole('dialog', { name: 'Try instead' })
  const card = page.locator('.exercise-card').last()

  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
  await openLibrary(page)
  await addFromLibrary(page, LEG_PRESS)
  await addFromLibrary(page, HACK_SQUAT)
  // A 90s rest on the Leg Press only; Hack Squat has none.
  await page.evaluate(async (name) => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const { data } = await repos.exercises.list()
    const legPress = data.find((e: { name: string }) => e.name === name)!
    const { error } = await repos.exercises.update(legPress.id, { rest_seconds: 90 })
    if (error) throw new Error(error.message)
  }, LEG_PRESS)
  await page.reload()

  // Some Hack Squat history, so it ranks first and shows its last set.
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, HACK_SQUAT, false)
  await logSet(page, '10', '200')
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByTestId('post-finish-card').getByRole('button', { name: 'Done', exact: true }).click()

  await createTemplateViaUi(page, 'Leg Day', [{ name: LEG_PRESS, sets: 3 }])
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Leg Day', exact: true }).click()
  await expect(card.locator('.exercise-card-name')).toHaveText(LEG_PRESS)

  // Free: the suggestions show, but picking one or "Keep it" opens Premium.
  await page.getByRole('button', { name: 'Swap exercise' }).click()
  await expect(swapSheet).toBeVisible()
  const options = swapSheet.getByRole('list', { name: 'Alternatives' }).getByRole('button')
  await expect(options.first()).toContainText(HACK_SQUAT)
  await expect(options.first()).toContainText('Last: 10 × 200 lb')
  await expect(options).toHaveCount(6)
  await options.first().click()
  await expect(premium.getByRole('heading', { name: 'Swap suggestions' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await swapSheet.getByRole('button', { name: 'Keep it with Premium' }).click()
  await expect(premium).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await swapSheet.getByRole('button', { name: 'Go back' }).click()
  await expect(swapSheet).toHaveCount(0)
  await expect(card.locator('.exercise-card-name')).toHaveText(LEG_PRESS)

  // Premium: one set on the Leg Press, then the machine's taken.
  await unlockPremium(page)
  await logSet(page, '12', '300')
  await expect(page.locator('.rest-countdown')).toHaveText(/^1:[23]\d$/)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(card).toContainText('1 of 3 sets logged')
  await page.getByRole('button', { name: 'Swap exercise' }).click()
  await expect(swapSheet.getByRole('group', { name: 'Swap preview' })).toHaveCount(0)
  await swapSheet.getByRole('button', { name: new RegExp(`^${HACK_SQUAT}`) }).click()
  await expect(swapSheet).toHaveCount(0)

  // Hack Squat takes the remaining two sets, pre-filled from last time.
  await expect(card.locator('.exercise-card-name')).toHaveText(HACK_SQUAT)
  await expect(card).toContainText('0 of 2 sets logged')
  await expect(page.locator('.set-row-draft')).toHaveCount(2)
  await expect(page.locator('.set-row-draft').first().getByLabel('Weight')).toHaveValue('200')
  await logSet(page, '10', '210')
  // Hack Squat has no rest of its own, but it took the Leg Press's place.
  await expect(page.locator('.rest-countdown')).toHaveText(/^1:[23]\d$/)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await expect(card).toContainText('1 of 2 sets logged')

  // The Leg Press set stays in the workout as an open-ended extra.
  await expect(page.getByRole('button', { name: LEG_PRESS, exact: true })).toBeVisible()

  // Swapping again picks up what's left (one set), here with a library
  // exercise the user doesn't have yet, which gets added.
  await page.getByRole('button', { name: 'Swap exercise' }).click()
  const fromLibrary = swapSheet.getByRole('button', { name: /Adds it to your exercises/ }).first()
  const libraryName = (await fromLibrary.locator('.option-name').textContent())!.trim()
  await fromLibrary.click()
  await expect(card.locator('.exercise-card-name')).toHaveText(libraryName)
  await expect(card).toContainText('0 of 1 sets logged')

  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('dialog', { name: 'Finish now?' }).getByRole('button', { name: 'Finish anyway' }).click()

  // The recap labels the swap that got sets (#156), even though it was
  // swapped out again; the library pick had none, so it isn't listed.
  const recap = page.getByTestId('post-finish-card')
  await expect(recap.getByTestId('recap-swap-note')).toHaveCount(1)
  await expect(recap.getByRole('button', { name: new RegExp(`^${HACK_SQUAT} \\(swapped in for ${LEG_PRESS}\\)`) })).toContainText(
    `swapped in for ${LEG_PRESS}`,
  )
  await expect(recap.getByRole('button', { name: new RegExp(`^${LEG_PRESS} progress`) })).not.toContainText('swapped in')
  await recap.getByRole('button', { name: 'Done', exact: true }).click()

  // Lift progress lists the one-workout Leg Press with no trend yet (#156).
  await goTo(page, 'Progress')
  await page.getByRole('link', { name: 'Lift progress', exact: true }).click()
  await expect(page.locator('.lift-row', { hasText: LEG_PRESS })).toContainText('1 session')
  await expect(page.locator('.lift-row', { hasText: HACK_SQUAT })).not.toContainText('1 session')

  // The sets went to the exercises they were logged on, and the template
  // still plans three Leg Press sets.
  const result = await page.evaluate(async () => {
    const { repos } = await window.__rbImport('/src/data/index.ts')
    const { data: templates } = await repos.templates.list()
    const legDay = templates.find((t: { name: string }) => t.name === 'Leg Day')!
    const { data: rows } = await repos.templates.listExercises(legDay.id)
    const { data: history } = await repos.workouts.listHistory()
    const latest = history.find((w: { template_id: string | null }) => w.template_id === legDay.id)!
    return {
      template: rows.map((r: { exercises: { name: string } | null; target_sets: number | null }) => [r.exercises?.name, r.target_sets]),
      sets: latest.sets.map((s: { exercises: { name: string } | null; reps: number | null }) => [s.exercises?.name, s.reps]),
    }
  })
  expect(result.template).toEqual([[LEG_PRESS, 3]])
  expect(result.sets).toEqual(expect.arrayContaining([[LEG_PRESS, 12], [HACK_SQUAT, 10]]))
  expect(result.sets).toHaveLength(2)
})
