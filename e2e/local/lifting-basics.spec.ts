import { test, expect, type Page } from '@playwright/test'

// Issue #419 (design docs/design/new-to-lifting.html, option A): the setup
// wizard's train step links "the basics", five in-app cards for people new
// to sets and reps, also in Account > About. Like setup-wizard.spec.ts, this
// clears the preset "setup done" flag so the wizard opens.
test.use({ viewport: { width: 375, height: 800 }, storageState: { cookies: [], origins: [] } })

function wizard(page: Page) {
  return page.getByRole('dialog', { name: 'Set up RepBunny' })
}

function basics(page: Page) {
  return page.getByRole('dialog', { name: 'Lifting basics' })
}

async function openStartStep(page: Page) {
  await page.goto('/')
  const w = wizard(page)
  await w.getByRole('button', { name: 'Set up in 30 seconds' }).click()
  // Units, look, and the automatic copy (#874).
  await w.getByRole('button', { name: 'Next' }).click()
  await w.getByRole('button', { name: 'Next' }).click()
  await w.getByRole('button', { name: 'Next' }).click()
  await expect(w.getByRole('heading', { name: 'How do you want to train?' })).toBeVisible()
}

const TITLES = ['Reps and sets', 'Picking a weight', 'Rest', 'RPE', 'Logging a set']

test('the train step links the basics, which page through five cards and come back on Done', async ({ page }) => {
  await openStartStep(page)
  const link = wizard(page).getByRole('button', { name: /^New to lifting\? Learn the basics/ })
  await expect(link).toBeVisible()
  // Below the three choices, and on the phone.
  const last = await wizard(page).getByRole('button', { name: 'Just log as I go' }).boundingBox()
  const box = (await link.boundingBox())!
  expect(box.y).toBeGreaterThan(last!.y + last!.height)
  expect(box.x + box.width).toBeLessThanOrEqual(375)

  await link.click()
  const b = basics(page)
  await expect(b.getByText('The basics · 1 of 5')).toBeVisible()
  await expect(b.getByRole('heading', { name: 'Reps and sets' })).toBeFocused()
  await expect(b.getByText('3 sets of 8 reps')).toBeVisible()

  for (let i = 1; i < TITLES.length; i++) {
    await b.getByRole('button', { name: 'Next' }).click()
    await expect(b.getByRole('heading', { name: TITLES[i] })).toBeVisible()
    await expect(b.getByText(`The basics · ${i + 1} of 5`)).toBeVisible()
  }
  // The last card shows a set row in the unit picked in step 1 (lb here).
  await expect(b.getByRole('img', { name: /135 lb for 8 reps/ })).toBeVisible()
  await expect(b.getByRole('button', { name: 'Next' })).toHaveCount(0)
  await expect(b.getByRole('button', { name: 'Use a starter program' })).toBeVisible()
  await expect(b.getByRole('button', { name: 'Back to setup' })).toBeVisible()

  // Back pages back.
  await b.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(b.getByRole('heading', { name: 'RPE' })).toBeVisible()

  // Done comes back to the train step with nothing picked.
  await b.getByRole('button', { name: 'Done' }).click()
  await expect(basics(page)).toHaveCount(0)
  await expect(wizard(page).getByRole('heading', { name: 'How do you want to train?' })).toBeVisible()
  await expect(link).toBeFocused()

  // Back on the first card closes it too, and Back to setup on the last.
  await link.click()
  await b.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(basics(page)).toHaveCount(0)
  await link.click()
  for (let i = 1; i < TITLES.length; i++) await b.getByRole('button', { name: 'Next' }).click()
  await b.getByRole('button', { name: 'Back to setup' }).click()
  await expect(basics(page)).toHaveCount(0)
  await expect(wizard(page).getByRole('heading', { name: 'How do you want to train?' })).toBeVisible()
})

test('a sideways swipe pages the basics', async ({ page }) => {
  await openStartStep(page)
  await wizard(page).getByRole('button', { name: /^New to lifting\?/ }).click()
  const b = basics(page)
  const card = b.locator('.card')
  const swipe = async (fromX: number, toX: number) => {
    const box = (await card.boundingBox())!
    const y = box.y + box.height / 2
    await card.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: fromX, clientY: y }] })
    await card.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: toX, clientY: y }] })
  }
  await swipe(300, 80)
  await expect(b.getByRole('heading', { name: 'Picking a weight' })).toBeVisible()
  await swipe(80, 300)
  await expect(b.getByRole('heading', { name: 'Reps and sets' })).toBeVisible()
  // A right swipe on the first card stays put.
  await swipe(80, 300)
  await expect(b.getByRole('heading', { name: 'Reps and sets' })).toBeVisible()
})

test('the last card’s Use a starter program finishes setup like the choice does', async ({ page }) => {
  await openStartStep(page)
  await wizard(page).getByRole('button', { name: /^New to lifting\?/ }).click()
  const b = basics(page)
  for (let i = 1; i < TITLES.length; i++) await b.getByRole('button', { name: 'Next' }).click()
  await b.getByRole('button', { name: 'Use a starter program' }).click()

  await expect(basics(page)).toHaveCount(0)
  await expect(wizard(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/templates/)
  await expect(page.getByRole('heading', { name: 'Starter programs' })).toBeInViewport()
  await page.reload()
  await expect(wizard(page)).toHaveCount(0)
})

test('Account > About opens the basics in the app, and its starter program button opens Starter programs', async ({ page }) => {
  await page.goto('/')
  await wizard(page).getByRole('button', { name: 'Skip setup' }).click()
  await page.getByRole('button', { name: 'Account', exact: true }).click()
  const about = page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('group', { name: 'About' })
  await expect(about.locator('.data-title')).toContainText(['Help & guides', 'Lifting basics', 'Privacy policy'])

  await about.getByRole('button', { name: 'Lifting basics' }).click()
  const b = basics(page)
  await expect(b.getByRole('heading', { name: 'Reps and sets' })).toBeVisible()
  await b.getByRole('button', { name: 'Done' }).click()
  await expect(basics(page)).toHaveCount(0)
  await expect(about).toBeVisible()

  await about.getByRole('button', { name: 'Lifting basics' }).click()
  for (let i = 1; i < TITLES.length; i++) await b.getByRole('button', { name: 'Next' }).click()
  await expect(b.getByRole('button', { name: 'Back to Account' })).toBeVisible()
  await b.getByRole('button', { name: 'Use a starter program' }).click()
  await expect(basics(page)).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Account', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/templates/)
  await expect(page.getByRole('heading', { name: 'Starter programs' })).toBeInViewport()
})

// Issue #426 (design docs/design/issue-426-lifting-basics-video.html, option
// A): the first card has a tile that opens the narrated video full screen,
// with captions on, from the bundled public/video/ copy.
test('the first card’s Watch the basics tile opens the video with captions, and Back to the cards returns', async ({ page }) => {
  await openStartStep(page)
  await wizard(page).getByRole('button', { name: /^New to lifting\?/ }).click()
  const b = basics(page)
  const tile = b.getByRole('button', { name: /^Watch the basics/ })
  await expect(tile).toBeVisible()
  // Above the card's step label, inside the phone.
  const label = (await b.getByText('The basics · 1 of 5').boundingBox())!
  const box = (await tile.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(label.y)
  expect(box.x + box.width).toBeLessThanOrEqual(375)

  await tile.click()
  const video = b.locator('video')
  await expect(video).toHaveCount(1)
  await expect(video).toBeVisible()
  await expect(video).toHaveAttribute('src', '/video/lifting-basics.mp4')
  await expect(video).toHaveAttribute('controls', '')
  const track = video.locator('track')
  await expect(track).toHaveAttribute('kind', 'captions')
  await expect(track).toHaveAttribute('src', '/video/lifting-basics.vtt')
  await expect(track).toHaveAttribute('default', '')
  // The files are served (bundled in the app, so they work offline there).
  for (const path of ['/video/lifting-basics.mp4', '/video/lifting-basics.vtt', '/video/lifting-basics.webp']) {
    const res = await page.request.get(path)
    expect(res.ok(), path).toBe(true)
  }

  await b.getByRole('button', { name: 'Back to the cards' }).click()
  await expect(b.locator('video')).toHaveCount(0)
  await expect(b.getByRole('heading', { name: 'Reps and sets' })).toBeVisible()
  await expect(tile).toBeFocused()

  // Only the first card has it.
  await b.getByRole('button', { name: 'Next' }).click()
  await expect(b.getByRole('heading', { name: 'Picking a weight' })).toBeVisible()
  await expect(b.getByRole('button', { name: /^Watch the basics/ })).toHaveCount(0)
})
