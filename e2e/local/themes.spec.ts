import { test, expect, type Page } from '@playwright/test'
import { openAccountSection } from '../fixtures/account'
import { selectExercise } from '../fixtures/exercise'
import { goTo, openLibrary } from '../fixtures/nav'
import { turnOffDefaultRest } from '../fixtures/local'

// Issue #107, reworked by #118: Premium themes. A theme sets the whole
// palette and can bring its own bunny art; the Mascot setting (Full/Minimal)
// combines with any theme. Free users preview a pick live, with a bar to keep
// it with Premium or go back; leaving the screen reverts.

test.use({ viewport: { width: 375, height: 800 } })

const BENCH = 'Barbell Bench Press'
const CLASSIC_ACCENT = '#f2879c'
const CLASSIC_BG = '#17111c'
const TEST_ACCENT = '#7fd4c1'
const TEST_BG = '#101a18'
const TEST_LABEL = 'E2E Mint'

async function firstLaunch(page: Page) {
  await page.goto('/')
  await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
  // Issue #429: not about the rest timer, so no 2:00 default rest.
  await turnOffDefaultRest(page)
}

function token(page: Page, name: string) {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
}

async function setPremium(page: Page, on: boolean) {
  await page.evaluate(async (unlocked) => {
    const { setPremiumUnlocked } = await window.__rbImport('/src/lib/premium.ts')
    setPremiumUnlocked(unlocked)
  }, on)
}

// A theme that exists only for this page load: Classic with a mint accent, a
// green-black background, and its own outfit whose rest art doesn't exist
// (#130: a theme image that 404s falls back to the original; #146 moved art
// from themes to outfits).
async function addTestTheme(page: Page) {
  await page.evaluate(
    async ([accent, bg, label]) => {
      const { OUTFITS, THEMES } = await window.__rbImport('/src/lib/theme.ts')
      if (THEMES.some((t) => t.id === 'e2e-mint')) return
      OUTFITS.push({ id: 'e2e-mint', label, art: ['rest'] })
      THEMES.push({
        id: 'e2e-mint',
        label,
        scheme: 'dark',
        tokens: { ...THEMES[0].tokens, '--accent': accent, '--bg': bg },
        outfit: 'e2e-mint',
      })
    },
    [TEST_ACCENT, TEST_BG, TEST_LABEL],
  )
}

async function openTheme(page: Page) {
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByRole('button', { name: /^Theme/ }).click()
  const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
  await expect(theme).toBeVisible()
  return theme
}

async function addBenchAndRestTimer(page: Page) {
  await openLibrary(page)
  await page.getByRole('searchbox', { name: 'Search the library' }).fill(BENCH)
  await page.getByRole('button', { name: `Add ${BENCH}`, exact: true }).click()
  await expect(page.locator('.library-row', { hasText: BENCH }).getByText('Added', { exact: true })).toBeVisible()
  const prefs = await openAccountSection(page, 'Preferences')
  await prefs.getByLabel('Default rest timer').fill('60')
  await prefs.getByLabel('Default rest timer').blur()
  await prefs.getByRole('button', { name: 'Close' }).click()
}

async function logFirstSet(page: Page) {
  await goTo(page, 'Home')
  await page.getByRole('button', { name: 'Freeform', exact: true }).click()
  await selectExercise(page, BENCH, false)
  await page.getByLabel('Reps').fill('8')
  await page.getByLabel('Weight').fill('135')
  await page.getByRole('button', { name: 'Add set' }).click()
}

test('free: a locked theme previews live, Go back and leaving restore Classic, Keep it opens Premium', async ({ page }) => {
  await firstLaunch(page)
  expect(await token(page, '--accent')).toBe(CLASSIC_ACCENT)
  expect(await token(page, '--bg')).toBe(CLASSIC_BG)
  await addTestTheme(page)

  const theme = await openTheme(page)
  const preview = theme.getByRole('group', { name: 'Theme preview' })
  await expect(theme.getByRole('button', { name: 'Classic', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(preview).toHaveCount(0)

  // Preview: the whole palette changes, not just the accent. Then Go back.
  await theme.getByRole('button', { name: TEST_LABEL, exact: true }).click()
  await expect.poll(() => token(page, '--accent')).toBe(TEST_ACCENT)
  expect(await token(page, '--bg')).toBe(TEST_BG)
  await expect(theme.getByRole('button', { name: TEST_LABEL, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(preview).toContainText(`You're trying ${TEST_LABEL}.`)
  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect(preview).toHaveCount(0)
  await expect.poll(() => token(page, '--accent')).toBe(CLASSIC_ACCENT)
  expect(await token(page, '--bg')).toBe(CLASSIC_BG)

  // Keep it with Premium opens the sheet over the Theme screen; Not now
  // leaves the preview up.
  await theme.getByRole('button', { name: TEST_LABEL, exact: true }).click()
  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByRole('heading', { name: 'Themes' })).toBeVisible()
  // The browser build has no matching app icons (#831), so its line is just "Themes".
  await expect(premium.getByRole('listitem').filter({ hasText: /^\s*Themes\s*$/ })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await expect(premium).toHaveCount(0)
  expect(await token(page, '--accent')).toBe(TEST_ACCENT)

  // Leaving the screen without buying reverts.
  await theme.getByRole('button', { name: 'Back to Preferences' }).click()
  await expect.poll(() => token(page, '--accent')).toBe(CLASSIC_ACCENT)
  const prefs = page.getByRole('dialog', { name: 'Preferences', exact: true })
  await expect(prefs.getByRole('button', { name: /^Theme/ })).toContainText('Classic · Full mascot')

  // Unlocking while previewing keeps the preview.
  await prefs.getByRole('button', { name: /^Theme/ }).click()
  await theme.getByRole('button', { name: TEST_LABEL, exact: true }).click()
  await setPremium(page, true)
  await expect(preview).toHaveCount(0)
  await theme.getByRole('button', { name: 'Back to Preferences' }).click()
  expect(await token(page, '--accent')).toBe(TEST_ACCENT)
  await expect(prefs.getByRole('button', { name: /^Theme/ })).toContainText(`${TEST_LABEL} · Full mascot`)

  // A refund (#105): no error, just the free theme.
  await setPremium(page, false)
  await expect.poll(() => token(page, '--accent')).toBe(CLASSIC_ACCENT)
  await expect(prefs.getByRole('button', { name: /^Theme/ })).toContainText('Classic · Full mascot')
})

test('with Premium: Minimal persists across a reload, and a removed #107 colorway loads as Classic', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  await page.evaluate(() => localStorage.setItem('repbunny-theme-colorway', 'lavender'))

  const theme = await openTheme(page)
  await expect(theme.getByText('Premium', { exact: true })).toHaveCount(0)
  await theme.getByRole('button', { name: 'Minimal' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-mascot', 'minimal')
  await expect(theme.getByRole('group', { name: 'Theme preview' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-mascot', 'minimal')
  expect(await token(page, '--accent')).toBe(CLASSIC_ACCENT)
  expect(await page.evaluate(() => localStorage.getItem('repbunny-theme-colorway'))).toBeNull()
  const prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('button', { name: /^Theme/ })).toContainText('Classic · Minimal mascot')
})

test('free: Chalk and Minimal are free, stick after leaving the screen and a reload, and Premium themes still preview', async ({ page }) => {
  await firstLaunch(page)
  const theme = await openTheme(page)
  const preview = theme.getByRole('group', { name: 'Theme preview' })
  await expect(theme.getByRole('button', { name: 'Chalk', exact: true }).getByText('Premium')).toHaveCount(0)
  await expect(theme.getByRole('button', { name: 'Minimal' }).getByText('Premium')).toHaveCount(0)

  await theme.getByRole('button', { name: 'Chalk', exact: true }).click()
  await theme.getByRole('button', { name: 'Minimal' }).click()
  await expect(preview).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-mascot', 'minimal')
  await theme.getByRole('button', { name: 'Back to Preferences' }).click()
  const prefs = page.getByRole('dialog', { name: 'Preferences', exact: true })
  await expect(prefs.getByRole('button', { name: /^Theme/ })).toContainText('Chalk · Minimal mascot')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-mascot', 'minimal')
  const prefs2 = await openAccountSection(page, 'Preferences')
  await expect(prefs2.getByRole('button', { name: /^Theme/ })).toContainText('Chalk · Minimal mascot')

  // A Premium theme still previews with the bar, and Go back returns to Chalk.
  await prefs2.getByRole('button', { name: /^Theme/ }).click()
  await theme.getByRole('button', { name: 'Halloween', exact: true }).click()
  await expect(preview).toContainText("You're trying Halloween.")
  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect(theme.getByRole('button', { name: 'Chalk', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test("a theme's own art replaces the bunny where it has one, and the original shows where it doesn't", async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  await addBenchAndRestTimer(page)
  await addTestTheme(page)
  const theme = await openTheme(page)
  await theme.getByRole('button', { name: TEST_LABEL, exact: true }).click()
  await theme.getByRole('button', { name: 'Close' }).click()

  await logFirstSet(page)
  const celebration = page.getByRole('dialog', { name: `First set: ${BENCH}` })
  await expect(celebration.locator('.celebration-mascot')).toHaveAttribute('src', /^\/celebration-(dumbbell-)?bunny\.png$/)
  await celebration.getByRole('button', { name: 'Nice!' }).click()
  // The theme's rest art is asked for first; it 404s, so the original shows
  // (loaded, not a broken image).
  const rest = page.locator('.rest-bunny')
  await expect(rest).toHaveAttribute('src', /\/rest-bunny\.png$/)
  await expect.poll(() => rest.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1024)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
})

// Issue #130: the theme's own art is WebP, and the original's name otherwise.
test('a theme art URL maps back to its original, and only theme art does', async ({ page }) => {
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const { defaultArtFor, artFor, findTheme } = await window.__rbImport('/src/lib/theme.ts')
    return {
      rest: artFor(findTheme('halloween'), 'rest'),
      restFallback: defaultArtFor('/themes/halloween/rest-bunny.webp'),
      loadingFallback: defaultArtFor('/themes/autumn/loading-bunny.webp'),
      notTheme: defaultArtFor('/rest-bunny.png'),
      unknown: defaultArtFor('/themes/halloween/nope.webp'),
    }
  })
  expect(results).toEqual({
    rest: '/themes/halloween/rest-bunny.webp',
    restFallback: '/rest-bunny.png',
    loadingFallback: '/loading-bunny.webp',
    notTheme: null,
    unknown: null,
  })
})

test('Minimal hides the mascot art on the rest timer and record celebration, but the record text still shows', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  await addBenchAndRestTimer(page)
  const theme = await openTheme(page)
  await theme.getByRole('button', { name: 'Minimal' }).click()
  await expect(theme.getByRole('button', { name: 'Minimal' })).toHaveAttribute('aria-pressed', 'true')
  await theme.getByRole('button', { name: 'Close' }).click()

  await logFirstSet(page)

  // The first set ever: the celebration says so in text, with no art.
  const celebration = page.getByRole('dialog', { name: `First set: ${BENCH}` })
  await expect(celebration).toBeVisible()
  await expect(celebration.getByText('First one!')).toBeVisible()
  await expect(celebration.getByText('First one logged for this exercise')).toBeVisible()
  await expect(celebration.locator('.celebration-mascot')).toHaveCount(1)
  await expect(celebration.locator('.celebration-mascot')).toBeHidden()
  await expect(celebration.locator('.confetti').first()).toBeHidden()
  await celebration.getByRole('button', { name: 'Nice!' }).click()

  // The rest screen keeps its countdown and drops the bunny.
  await expect(page.getByRole('button', { name: 'Skip Rest' })).toBeVisible()
  await expect(page.locator('.rest-countdown')).toBeVisible()
  await expect(page.locator('.rest-bunny')).toHaveCount(1)
  await expect(page.locator('.rest-bunny')).toBeHidden()
  await page.getByRole('button', { name: 'Skip Rest' }).click()
})

test('every theme sets every color token, passes WCAG AA, and keeps PRs and errors apart from the accent', async ({ page }) => {
  await firstLaunch(page)
  const results = await page.evaluate(async () => {
    const { THEMES, THEME_TOKENS } = await window.__rbImport('/src/lib/theme.ts')
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    return THEMES.map((theme) => {
      const t = theme.tokens as Record<string, string>
      const pairs: [string, string, string][] = []
      for (const fg of ['--text', '--text-dim']) for (const bg of ['--bg', '--surface', '--surface-2']) pairs.push([fg, bg, `${fg} on ${bg}`])
      for (const fill of ['--accent', '--accent-pressed', '--secondary', '--danger']) pairs.push(['--accent-text', fill, `--accent-text on ${fill}`])
      for (const bg of ['--bg', '--surface']) pairs.push(['--accent', bg, `--accent on ${bg}`])
      const failing = pairs.filter(([a, b]) => contrast(t[a], t[b]) < 4.5).map(([, , name]) => name)
      return {
        id: theme.id,
        missing: THEME_TOKENS.filter((name) => !/^#[0-9a-f]{6}$/i.test(t[name] ?? '')),
        failing,
        statusClash: t['--success'] === t['--accent'] || t['--danger'] === t['--accent'],
      }
    })
  })
  expect(results.map((r) => r.id)).toContain('classic')
  for (const r of results) {
    expect(r.missing, r.id).toEqual([])
    expect(r.failing, r.id).toEqual([])
    expect(r.statusClash, r.id).toBe(false)
  }
})

// Issue #121: the first holiday theme, with its own bunny art.
test('with Premium: Halloween persists across a reload and brings its own rest bunny', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  await addBenchAndRestTimer(page)
  const theme = await openTheme(page)
  await theme.getByRole('button', { name: 'Halloween', exact: true }).click()
  await expect.poll(() => token(page, '--accent')).toBe('#ff9a3c')
  await theme.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  expect(await token(page, '--accent')).toBe('#ff9a3c')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'halloween')

  await logFirstSet(page)
  const celebration = page.getByRole('dialog', { name: `First set: ${BENCH}` })
  await expect(celebration.locator('.celebration-mascot')).toHaveAttribute('src', /^\/themes\/halloween\/celebration-(dumbbell-)?bunny\.webp$/)
  await celebration.getByRole('button', { name: 'Nice!' }).click()
  const rest = page.locator('.rest-bunny')
  await expect(rest).toHaveAttribute('src', '/themes/halloween/rest-bunny.webp')
  await expect.poll(() => rest.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1024)
  await page.getByRole('button', { name: 'Skip Rest' }).click()
})

// Issue #124: Halloween's extras. Candy-corn confetti and week-tracker mark,
// and a faint web in the corner of the This week tile (gone in Classic and
// under Minimal).
test('Halloween extras: candy-corn confetti and tracker, a web on This week, none of it in Classic or Minimal', async ({ page }) => {
  const afterMask = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const after = getComputedStyle(el, '::after')
      return after.content === 'none' ? 'none' : after.maskImage || after.getPropertyValue('-webkit-mask-image')
    })

  await firstLaunch(page)
  await setPremium(page, true)
  await addBenchAndRestTimer(page)
  const theme = await openTheme(page)
  await theme.getByRole('button', { name: 'Halloween', exact: true }).click()
  await theme.getByRole('button', { name: 'Close' }).click()

  await logFirstSet(page)
  const confetti = page.getByRole('dialog', { name: `First set: ${BENCH}` }).locator('.confetti').first()
  await expect.poll(() => confetti.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('svg')
  await page.getByRole('button', { name: 'Nice!' }).click()
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  const week = page.locator('.stat-tile-week')
  await expect(week.locator('.paw-day-done .candy-corn')).toHaveCount(1)
  await expect(week.locator('.paw')).toHaveCount(0)
  expect(await afterMask('.stat-tile-week')).toContain('svg')

  // A web never blocks a tap on the panel under it.
  expect(await week.evaluate((el) => getComputedStyle(el, '::after').pointerEvents)).toBe('none')

  // Minimal: the web goes, the candy corn stays.
  let sheet = await openTheme(page)
  await sheet.getByRole('button', { name: 'Minimal' }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  expect(await afterMask('.stat-tile-week')).toBe('none')
  await expect(week.locator('.candy-corn')).toHaveCount(1)

  // Classic: paw prints, no web, plain confetti.
  sheet = await openTheme(page)
  await sheet.getByRole('button', { name: 'Full' }).click()
  await sheet.getByRole('button', { name: 'Classic', exact: true }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  expect(await afterMask('.stat-tile-week')).toBe('none')
  await expect(week.locator('.paw')).toHaveCount(1)
  await expect(page.locator('html')).not.toHaveAttribute('data-confetti', /.+/)
})

// Issue #129: Autumn. Maple leaf tracker mark, falling-leaf confetti, a sprig
// in the This week corner (gone under Minimal, the leaf mark stays), its own
// rest bunny, and none of it in Classic.
test('Autumn: maple leaf tracker, leaf confetti, a sprig on This week, its own rest bunny, none of it in Classic', async ({ page }) => {
  const afterMask = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const after = getComputedStyle(el, '::after')
      return after.content === 'none' ? 'none' : after.maskImage || after.getPropertyValue('-webkit-mask-image')
    })

  await firstLaunch(page)
  await setPremium(page, true)
  await addBenchAndRestTimer(page)
  const theme = await openTheme(page)
  await theme.getByRole('button', { name: 'Autumn', exact: true }).click()
  await expect.poll(() => token(page, '--accent')).toBe('#e9a23b')
  await expect(theme.locator('.theme-card', { hasText: 'Autumn' }).locator('.maple-leaf')).not.toHaveCount(0)
  await theme.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-confetti', 'leaves')

  await logFirstSet(page)
  const celebration = page.getByRole('dialog', { name: `First set: ${BENCH}` })
  const pieces = celebration.locator('.confetti')
  await expect(pieces).toHaveCount(10)
  const shapes = await pieces.evaluateAll((els) =>
    els.map((el) => ({ leaf: el.getAttribute('data-leaf'), image: getComputedStyle(el).backgroundImage, animation: getComputedStyle(el).animationName })),
  )
  for (const { leaf, image, animation } of shapes) {
    expect(['maple', 'birch', 'oak']).toContain(leaf)
    expect(image).toContain('svg')
    expect(animation).toBe('leaf-fall')
  }
  await expect(celebration.locator('.celebration-mascot')).toHaveAttribute('src', /^\/themes\/autumn\/celebration-(dumbbell-)?bunny\.webp$/)
  await celebration.getByRole('button', { name: 'Nice!' }).click()
  await expect(page.locator('.rest-bunny')).toHaveAttribute('src', '/themes/autumn/rest-bunny.webp')
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  const week = page.locator('.stat-tile-week')
  await expect(week.locator('.paw-day-done .maple-leaf')).toHaveCount(1)
  await expect(week.locator('.paw')).toHaveCount(0)
  // The sprig (its twig path), not Halloween's web, and it never takes a tap.
  expect(await afterMask('.stat-tile-week')).toContain('M59 3Q44 7')
  expect(await week.evaluate((el) => getComputedStyle(el, '::after').pointerEvents)).toBe('none')

  // Minimal: the sprig goes, the maple leaf stays.
  let sheet = await openTheme(page)
  await sheet.getByRole('button', { name: 'Minimal' }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  expect(await afterMask('.stat-tile-week')).toBe('none')
  await expect(week.locator('.maple-leaf')).toHaveCount(1)

  // Classic: paw prints, no sprig, plain confetti.
  sheet = await openTheme(page)
  await sheet.getByRole('button', { name: 'Full' }).click()
  await sheet.getByRole('button', { name: 'Classic', exact: true }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  expect(await afterMask('.stat-tile-week')).toBe('none')
  await expect(week.locator('.paw')).toHaveCount(1)
  await expect(page.locator('html')).not.toHaveAttribute('data-confetti', /.+/)
  await expect(page.locator('html')).not.toHaveAttribute('data-corner', /.+/)
})

// Issue #128: Carrot Patch. A carrot on the week tracker and its theme card,
// carrot confetti on a record, no corner decoration, and paws again in Classic.
test('Carrot Patch: carrot tracker and confetti, no corner decoration, paws again in Classic', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  await addBenchAndRestTimer(page)
  const theme = await openTheme(page)
  await expect(theme.locator('.theme-card', { hasText: 'Carrot Patch' }).locator('.carrot')).not.toHaveCount(0)
  await theme.getByRole('button', { name: 'Carrot Patch', exact: true }).click()
  await expect.poll(() => token(page, '--accent')).toBe('#f28c3a')
  await theme.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-confetti', 'carrot')
  await expect(page.locator('html')).not.toHaveAttribute('data-corner', /.+/)

  await logFirstSet(page)
  const pieces = page.getByRole('dialog', { name: `First set: ${BENCH}` }).locator('.confetti')
  await expect(pieces).toHaveCount(10)
  const images = await pieces.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundImage))
  // The carrot's root path, not another theme's shape.
  for (const image of images) expect(image).toContain('13.2 20.2 12 23.2')
  await page.getByRole('button', { name: 'Nice!' }).click()
  await page.getByRole('button', { name: 'Skip Rest' }).click()
  await page.getByRole('button', { name: 'Finish workout' }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  const week = page.locator('.stat-tile-week')
  await expect(week.locator('.paw-day-done .carrot')).toHaveCount(1)
  await expect(week.locator('.paw')).toHaveCount(0)
  expect(await week.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none')

  // Classic: paw prints and plain confetti.
  const sheet = await openTheme(page)
  await sheet.getByRole('button', { name: 'Classic', exact: true }).click()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(week.locator('.paw')).toHaveCount(1)
  await expect(week.locator('.carrot')).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveAttribute('data-confetti', /.+/)
})

// Issue #119: each theme is a card drawn in its own theme, two to a row, with
// a Preview button that opens a full-screen look at Home, the rest timer, and
// a record in that theme, whatever theme is active.
test('theme cards are drawn in their own theme, two to a row at phone width', async ({ page }) => {
  await firstLaunch(page)
  const theme = await openTheme(page)
  const accents = await page.evaluate(async () => {
    const { THEMES } = await window.__rbImport('/src/lib/theme.ts')
    return THEMES.map((t) => ({ label: t.label, accent: t.tokens['--accent'] }))
  })
  const toRgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
  for (const { label, accent } of accents) {
    const card = theme.locator('.theme-card').filter({ has: page.getByRole('button', { name: label, exact: true }) })
    await expect(card.locator('.mini-button')).toHaveCSS('background-color', toRgb(accent))
  }
  await expect(theme.locator('.theme-card', { hasText: 'Halloween' }).locator('.candy-corn')).not.toHaveCount(0)
  await expect(theme.locator('.theme-card', { hasText: 'Classic' }).locator('.paw')).not.toHaveCount(0)

  const boxes = await theme.locator('.theme-card').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))
  expect(boxes.length).toBeGreaterThanOrEqual(2)
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(1)
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThan(1)
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width)
  expect(await theme.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('free: Preview shows Halloween full screen while Classic is on, and Keep it opens Premium', async ({ page }) => {
  await firstLaunch(page)
  const theme = await openTheme(page)
  await theme.getByRole('button', { name: 'Preview Halloween' }).click()
  const preview = page.getByRole('dialog', { name: 'Halloween preview' })
  await expect(preview).toBeVisible()
  // Classic is still the app's theme; the preview draws Halloween itself.
  expect(await token(page, '--accent')).toBe(CLASSIC_ACCENT)
  await expect(preview.locator('.candy-corn')).not.toHaveCount(0)
  await expect(preview.locator('.m-rest-bunny')).toHaveAttribute('src', '/themes/halloween/rest-bunny.webp')
  await preview.getByRole('button', { name: 'Rest timer', exact: true }).click()
  await expect(preview.getByRole('button', { name: 'Rest timer', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await preview.getByRole('button', { name: 'Keep it with Premium' }).click()
  const premium = page.getByRole('dialog', { name: 'Premium' })
  await expect(premium.getByRole('heading', { name: 'Themes' })).toBeVisible()
  await premium.getByRole('button', { name: 'Not now' }).click()
  await preview.getByRole('button', { name: 'Not now' }).click()
  await expect(preview).toHaveCount(0)
  await expect(theme.getByRole('group', { name: 'Theme preview' })).toContainText("You're trying Halloween.")
})

test('with Premium: Preview offers Use this theme, which applies it', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  const theme = await openTheme(page)
  await theme.getByRole('button', { name: 'Preview Halloween' }).click()
  const preview = page.getByRole('dialog', { name: 'Halloween preview' })
  await expect(preview.getByRole('button', { name: 'Keep it with Premium' })).toHaveCount(0)
  await preview.getByRole('button', { name: 'Use this theme' }).click()
  await expect(preview).toHaveCount(0)
  await expect.poll(() => token(page, '--accent')).toBe('#ff9a3c')
  await expect(theme.getByRole('button', { name: 'Halloween', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

// Issue #122: the first light theme.
test('with Premium: Cotton Candy is a light theme and sets color-scheme: light on <html>', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
  const theme = await openTheme(page)
  await theme.getByRole('button', { name: 'Cotton Candy', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cotton-candy')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light')
  expect(await token(page, '--bg')).toBe('#fff7f4')
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#fff7f4')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light')
})

// Issue #126: a theme with no pink, for lifters who find Classic too cute.
test('with Premium: Chalk persists across a reload, with the original bunny art and no decorations', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  await addBenchAndRestTimer(page)
  const theme = await openTheme(page)
  await expect(theme.getByRole('button', { name: 'Preview Chalk' })).toBeVisible()
  await theme.getByRole('button', { name: 'Chalk', exact: true }).click()
  await expect.poll(() => token(page, '--accent')).toBe('#8fb4d9')
  await theme.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chalk')
  expect(await token(page, '--accent')).toBe('#8fb4d9')
  expect(await token(page, '--bg')).toBe('#121417')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
  await expect(page.locator('html')).not.toHaveAttribute('data-corner', /.+/)
  const prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('button', { name: /^Theme/ })).toContainText('Chalk · Full mascot')
  await prefs.getByRole('button', { name: 'Close' }).click()

  await logFirstSet(page)
  await expect(page.locator('html')).not.toHaveAttribute('data-confetti', /.+/)
  await page.getByRole('button', { name: 'Nice!' }).click()
  await expect(page.locator('.rest-bunny')).toHaveAttribute('src', '/rest-bunny.png')
  await page.getByRole('button', { name: 'Skip Rest' }).click()
})

// Issue #127: a second light theme, warm peach instead of pink, with its own
// warm shadow color instead of the light scheme's mauve.
test('with Premium: Sunrise is a light theme with its own shade, and persists across a reload', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  const theme = await openTheme(page)
  await expect(theme.getByRole('button', { name: 'Preview Sunrise' })).toBeVisible()
  await theme.getByRole('button', { name: 'Sunrise', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunrise')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light')
  await theme.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunrise')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light')
  expect(await token(page, '--bg')).toBe('#fff8f0')
  expect(await token(page, '--accent')).toBe('#b8501c')
  expect(await token(page, '--shade')).toBe('#b07a52')
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', '#fff8f0')
  const prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('button', { name: /^Theme/ })).toContainText('Sunrise · Full mascot')
})

// Issue #146: outfits are their own pick, so any theme can wear any outfit.
test('with Premium: the Halloween outfit on Chalk puts the Halloween bunny on Chalk colors, and persists', async ({ page }) => {
  await firstLaunch(page)
  await setPremium(page, true)
  await addBenchAndRestTimer(page)
  const theme = await openTheme(page)
  await expect(theme.getByRole('button', { name: 'Match theme' })).toHaveAttribute('aria-pressed', 'true')
  await theme.getByRole('button', { name: 'Chalk', exact: true }).click()
  await theme.getByRole('button', { name: 'Halloween outfit' }).click()
  await expect(theme.getByRole('button', { name: 'Halloween outfit' })).toHaveAttribute('aria-pressed', 'true')
  // The theme cards follow the outfit, and the theme is still Chalk.
  await expect(theme.locator('.theme-card', { hasText: 'Sunrise' }).locator('.mini-bunny')).toHaveAttribute('src', '/themes/halloween/celebration-bunny.webp')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'chalk')
  await theme.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  expect(await token(page, '--accent')).toBe('#8fb4d9')
  const prefs = await openAccountSection(page, 'Preferences')
  await expect(prefs.getByRole('button', { name: /^Theme/ })).toContainText('Chalk · Halloween outfit · Full mascot')
  await prefs.getByRole('button', { name: 'Close' }).click()

  await logFirstSet(page)
  const celebration = page.getByRole('dialog', { name: `First set: ${BENCH}` })
  await expect(celebration.locator('.celebration-mascot')).toHaveAttribute('src', /^\/themes\/halloween\/celebration-(dumbbell-)?bunny\.webp$/)
  // Chalk keeps its own (lack of) decorations: no candy-corn confetti.
  await expect(page.locator('html')).not.toHaveAttribute('data-confetti', /.+/)
  await celebration.getByRole('button', { name: 'Nice!' }).click()
  await expect(page.locator('.rest-bunny')).toHaveAttribute('src', '/themes/halloween/rest-bunny.webp')
  await expect(page.locator('.rest-bunny')).toBeVisible()
  await page.getByRole('button', { name: 'Skip Rest' }).click()

  // Classic outfit on a theme with its own: the original bunny.
  const sheet = await openTheme(page)
  await sheet.getByRole('button', { name: 'Halloween', exact: true }).click()
  await sheet.getByRole('button', { name: 'Classic outfit' }).click()
  await expect(sheet.getByRole('button', { name: 'Full' }).locator('img')).toHaveAttribute('src', '/celebration-bunny.png')
  // Match theme goes back to the theme's own.
  await sheet.getByRole('button', { name: 'Match theme' }).click()
  await expect(sheet.getByRole('button', { name: 'Full' }).locator('img')).toHaveAttribute('src', '/themes/halloween/celebration-bunny.webp')

  // Minimal still hides the art, and the Outfit group says so.
  await sheet.getByRole('button', { name: 'Minimal' }).click()
  await expect(sheet.getByText('Minimal hides the bunny. Outfits show with Full.')).toBeVisible()
})

test('Holidays wears the Halloween outfit in October and Classic in July', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 12, 9, 0))
  await firstLaunch(page)
  await setPremium(page, true)
  let theme = await openTheme(page)
  const holidays = theme.getByRole('button', { name: 'Holidays outfit' })
  await expect(holidays).toContainText("Valentine's Day in February, Easter in Easter's month, Halloween in October, Autumn in November, Christmas in December, Classic the rest of the year")
  await holidays.click()
  await expect(holidays).toHaveAttribute('aria-pressed', 'true')
  await expect(theme.getByRole('button', { name: 'Full' }).locator('img')).toHaveAttribute('src', '/themes/halloween/celebration-bunny.webp')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'classic')

  await page.clock.setFixedTime(new Date(2026, 6, 4, 9, 0))
  await page.reload()
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible()
  await setPremium(page, true)
  theme = await openTheme(page)
  await expect(theme.getByRole('button', { name: 'Holidays outfit' })).toHaveAttribute('aria-pressed', 'true')
  await expect(theme.getByRole('button', { name: 'Full' }).locator('img')).toHaveAttribute('src', '/celebration-bunny.png')
})

test('free: an outfit previews live with the Premium bar, Go back reverts, and losing Premium falls back to Match theme', async ({ page }) => {
  await firstLaunch(page)
  const theme = await openTheme(page)
  const preview = theme.getByRole('group', { name: 'Theme preview' })
  const full = theme.getByRole('button', { name: 'Full' }).locator('img')
  await expect(theme.getByRole('button', { name: 'Match theme' })).toHaveAttribute('aria-pressed', 'true')
  await expect(theme.getByRole('button', { name: 'Halloween outfit' }).locator('.premium-mark')).toHaveCount(1)
  await expect(theme.getByRole('button', { name: 'Holidays outfit' }).getByText('Premium')).toBeVisible()

  await theme.getByRole('button', { name: 'Halloween outfit' }).click()
  await expect(full).toHaveAttribute('src', '/themes/halloween/celebration-bunny.webp')
  await expect(preview).toContainText("You're trying the Halloween outfit.")
  await theme.getByRole('button', { name: 'Chalk', exact: true }).click()
  await expect(preview).toContainText("You're trying Chalk with the Halloween outfit.")
  await preview.getByRole('button', { name: 'Go back' }).click()
  await expect(preview).toHaveCount(0)
  await expect(full).toHaveAttribute('src', '/celebration-bunny.png')

  // Unlock keeps the preview; a refund falls back to Classic, Match theme.
  await theme.getByRole('button', { name: 'Autumn outfit' }).click()
  await setPremium(page, true)
  await expect(preview).toHaveCount(0)
  await expect(theme.getByRole('button', { name: 'Autumn outfit' })).toHaveAttribute('aria-pressed', 'true')
  await setPremium(page, false)
  await expect(theme.getByRole('button', { name: 'Match theme' })).toHaveAttribute('aria-pressed', 'true')
  await expect(full).toHaveAttribute('src', '/celebration-bunny.png')
})
