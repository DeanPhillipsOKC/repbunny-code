import { test, expect, localDb, startLocal } from '../fixtures/local'
import type { Locator } from '@playwright/test'
import { selectExercise } from '../fixtures/exercise'

// Issue #273: at phone width the exercise card's name shared its row with
// the position pill and the swap and pencil icons, so "Barbell Bench Press"
// needed three lines and the two-line clamp cut it to "Barbell / Bench...",
// and the Time field's "mm:ss" placeholder overflowed its box.

// Baloo 2's glyphs reach a few px past its 1.1 line box even when nothing
// is clamped, so allow that much; a clamped third line adds ~23px.
async function linesHidden(name: Locator, text: string) {
  return name.evaluate((el, t) => {
    el.textContent = t
    return el.scrollHeight - el.clientHeight > 8
  }, text)
}

for (const width of [375, 390]) {
  test(`a three-word library name fits the workout card at ${width}px`, async ({ page, stamp }) => {
    const exerciseName = `E2E Bench ${stamp}`

    await page.setViewportSize({ width, height: 800 })
    const admin = localDb(page)
    await startLocal(page, {
      beforeNavigate: async (userId) => {
        await admin.from('exercises').insert({ user_id: userId, name: exerciseName })
      },
    })

    await page.getByRole('button', { name: 'Freeform' }).click()
    await selectExercise(page, exerciseName, false)

    const name = page.locator('.exercise-card-name')
    await expect(name).toHaveText(exerciseName)
    await expect(name).toHaveAttribute('title', exerciseName)

    // The position pill sits in the dot row above the card now, not beside
    // the name.
    const position = page.locator('.exercise-card-position')
    await expect(position).toHaveText('1 / 1')
    const pill = await position.boundingBox()
    const card = await page.locator('.exercise-card-viewport').boundingBox()
    if (!pill || !card) throw new Error('card parts not laid out')
    expect(pill.y + pill.height).toBeLessThanOrEqual(card.y)

    // Stamped names can't be the real library ones, so lay the real names
    // out in the same element.
    expect(await linesHidden(name, 'Barbell Bench Press')).toBe(false)
    expect(await linesHidden(name, 'Incline Barbell Bench Press')).toBe(false)
  })
}

test('the Time placeholder fits its field at 375px', async ({ page, stamp }) => {
  const plankName = `E2E Plank ${stamp}`
  const treadmillName = `E2E Treadmill ${stamp}`

  await page.setViewportSize({ width: 375, height: 800 })
  const admin = localDb(page)
  await startLocal(page, {
    beforeNavigate: async (userId) => {
      await admin.from('exercises').insert({ user_id: userId, name: plankName, load_type: 'timed' })
      await admin
        .from('exercises')
        .insert({ user_id: userId, name: treadmillName, load_type: 'timed', tracks_distance: true })
    },
  })

  await page.getByRole('button', { name: 'Freeform' }).click()

  // Plank uses the single-line row; Treadmill the stacked, labeled one.
  for (const exerciseName of [plankName, treadmillName]) {
    await selectExercise(page, exerciseName, false)
    await expect(page.locator('.exercise-card-name')).toHaveText(exerciseName)
    const time = page.getByLabel('Time, minutes and seconds').first()
    await expect(time).toHaveAttribute('placeholder', '0:00')
    await expect(time).toHaveValue('')
    const fits = await time.evaluate((el) => {
      const input = el as HTMLInputElement
      const style = getComputedStyle(input, '::placeholder')
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const box = getComputedStyle(input)
      const padding = parseFloat(box.paddingLeft) + parseFloat(box.paddingRight)
      return ctx.measureText(input.placeholder).width <= input.clientWidth - padding
    })
    expect(fits).toBe(true)
  }
})
