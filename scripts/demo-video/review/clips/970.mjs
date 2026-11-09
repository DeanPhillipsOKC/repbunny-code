// #970: the Easter theme and outfit, with carrots on the week tracker.
export default {
  issue: 970,
  title: ['Easter', 'theme'],
  note: "New Easter theme. Soft lavender and robin's egg blue on cream, a bunny napping in an Easter basket, and carrots on your week tracker. The Holidays outfit wears it all through the month Easter falls in.",
  spoken: "[warm, playful] Meet the new Easter theme. Soft pastels on cream, with a bunny napping in an Easter basket.",
  prepare: async (page, kit) => {
    await kit.seed(page, { premium: true })
  },
  lines: {
    open: 'Open your account, then Preferences, and tap Theme.',
    pick: 'Tap Easter. The whole app changes right away.',
    home: '[delighted] Back on Home, carrots mark every day you trained.',
  },
  demo: async (page, { say, tap, sleep, reveal }) => {
    await say('open', async () => {
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Preferences/ }), 500)
      await tap(page.getByRole('button', { name: /^Theme/ }))
    }, 0.2)
    const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
    await theme.waitFor()
    const easter = theme.getByRole('button', { name: 'Easter', exact: true })
    await reveal(easter, 'center')
    await say('pick', () => tap(easter), 0.2)
    await sleep(1200)
    const poster = Date.now() / 1000
    await say('home', async () => {
      await tap(theme.getByRole('button', { name: 'Close' }), 400)
      const prefs = page.getByRole('dialog', { name: 'Preferences' })
      if (await prefs.isVisible()) await tap(prefs.getByRole('button', { name: 'Close' }), 400)
      const account = page.getByRole('dialog', { name: 'Account', exact: true })
      if (await account.isVisible()) await tap(account.getByRole('button', { name: 'Close' }), 400)
      await reveal(page.locator('.stat-tile-week'), 'center')
    }, 0.1)
    await sleep(1500)
    return poster
  },
}
