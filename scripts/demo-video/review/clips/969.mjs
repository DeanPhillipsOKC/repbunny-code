// #969: the Valentine's Day theme and outfit, with candy hearts on the week tracker.
export default {
  issue: 969,
  title: ['Valentine', 'theme'],
  note: "New Valentine's Day theme. Hot pink on deep burgundy, a bunny soaking in a heart shaped hot tub, and candy hearts on your week tracker. The Holidays outfit wears it all February.",
  spoken: "[warm, playful] Meet the new Valentine's Day theme. Hot pink on deep burgundy, with a bunny soaking in a heart shaped hot tub.",
  prepare: async (page, kit) => {
    await kit.seed(page, { premium: true })
  },
  lines: {
    open: 'Open your account, then Preferences, and tap Theme.',
    pick: "Tap Valentine's Day. The whole app changes right away.",
    home: '[delighted] Back on Home, candy hearts mark every day you trained.',
  },
  demo: async (page, { say, tap, sleep, reveal }) => {
    await say('open', async () => {
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Preferences/ }), 500)
      await tap(page.getByRole('button', { name: /^Theme/ }))
    }, 0.2)
    const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
    await theme.waitFor()
    const valentine = theme.getByRole('button', { name: "Valentine's Day", exact: true })
    await reveal(valentine, 'center')
    await say('pick', () => tap(valentine), 0.2)
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
