import { test, expect, localDb, startLocal } from '../fixtures/local'
import { selectExercise } from '../fixtures/exercise'

// Covers issue #88: on a narrow phone, a two-line exercise name on a card
// with setup notes used to spill off the top of the fixed-height card.
for (const width of [360, 390]) {
  test(`a long name and a note both fit on the workout card at ${width}px`, async ({ page, stamp }) => {
    const exerciseName = `Seated Chest Press Machine ${stamp}`
    const note = 'Seat 3, handles at pin 2, back pad all the way forward, slow negatives on every rep'

    await page.setViewportSize({ width, height: 800 })

    const admin = localDb(page)
    await startLocal(page, {
      beforeNavigate: async (userId) => {
        await admin.from('exercises').insert({ user_id: userId, name: exerciseName, setup_notes: note })
      },
    })

    await page.getByRole('button', { name: 'Freeform' }).click()
    await selectExercise(page, exerciseName, false)
    await expect(page.locator('.exercise-card-notes')).toHaveText(note)

    const viewport = await page.locator('.exercise-card-viewport').boundingBox()
    const name = await page.locator('.exercise-card-name').boundingBox()
    const footer = await page.locator('.exercise-card-footer').boundingBox()
    const notes = await page.locator('.exercise-card-notes').boundingBox()
    if (!viewport || !name || !footer || !notes) throw new Error('card parts not laid out')

    // The name wraps to two lines here, which is the case that clipped.
    expect(name.height).toBeGreaterThan(30)
    expect(name.y).toBeGreaterThanOrEqual(viewport.y)
    expect(footer.y).toBeGreaterThanOrEqual(name.y + name.height)
    expect(notes.y).toBeGreaterThanOrEqual(footer.y + footer.height)
    expect(notes.y + notes.height).toBeLessThanOrEqual(viewport.y + viewport.height)
  })
}
