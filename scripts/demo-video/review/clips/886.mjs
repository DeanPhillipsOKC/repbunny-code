// #886: setup's look step is two tiles, Playful and Just your numbers, plus a
// link to every theme.
export default {
  issue: 886,
  title: ['Pick your', 'look'],
  note: 'Setup now asks one simple question about your look. Pick Playful for the pink bunny and confetti, or Just your numbers for a clean steel blue look. A link right under them shows every theme, seasonal ones too.',
  spoken: '[warm, friendly] Setup now asks one simple question about your look. Playful, or just your numbers.',
  prepare: async (page, kit) => {
    await kit.seed(page, { premium: false })
  },
  lines: {
    open: 'Open your account, then Preferences, and tap Run setup again.',
    numbers: 'Tap Just your numbers. The whole app turns steel blue, with no bunny art.',
    playful: '[excited] Tap Playful to bring the bunny back.',
    more: 'Want more? Tap the link under them to see every theme, seasonal ones too.',
  },
  demo: async (page, { say, tap, sleep }) => {
    const wizard = page.getByRole('dialog', { name: 'Set up RepBunny' })
    await say('open', async () => {
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Preferences/ }), 500)
      await tap(page.getByRole('button', { name: /^Run setup again/ }), 500)
      await tap(wizard.getByRole('button', { name: 'Next' }))
    }, 0.2)
    const looks = wizard.getByRole('group', { name: 'Look' })
    await looks.waitFor()
    const poster = Date.now() / 1000
    await say('numbers', () => tap(looks.getByRole('button', { name: 'Just your numbers', exact: true })), 0.2)
    await sleep(800)
    await say('playful', () => tap(looks.getByRole('button', { name: 'Playful', exact: true })), 0.2)
    await sleep(600)
    await say('more', () => tap(wizard.getByRole('button', { name: 'See every theme, seasonal ones too' })), 0.5)
    await page.getByRole('dialog', { name: 'Theme' }).waitFor()
    await sleep(1500)
    return poster
  },
}
