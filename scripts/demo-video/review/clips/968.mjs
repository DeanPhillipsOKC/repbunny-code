// #968: the Christmas theme and outfit, with candy canes on the week tracker.
export default {
  issue: 968,
  title: ['Christmas', 'theme'],
  note: 'New Christmas theme. Cranberry and evergreen on deep plum, a cozy bunny in a Santa hat, and candy canes on your week tracker. The Holidays outfit wears it all December.',
  spoken: '[warm, cheerful] Meet the new Christmas theme. Cranberry and evergreen, with a cozy bunny in a Santa hat.',
  prepare: async (page, kit) => {
    await kit.seed(page, { premium: true })
  },
  lines: {
    open: 'Open your account, then Preferences, and tap Theme.',
    pick: 'Tap Christmas. The whole app changes right away.',
    home: '[delighted] Back on Home, the whole app is dressed for the holidays.',
  },
  demo: async (page, { say, tap, sleep, reveal }) => {
    await say('open', async () => {
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Preferences/ }), 500)
      await tap(page.getByRole('button', { name: /^Theme/ }))
    }, 0.2)
    const theme = page.getByRole('dialog', { name: 'Theme', exact: true })
    await theme.waitFor()
    const christmas = theme.getByRole('button', { name: 'Christmas', exact: true })
    await reveal(christmas, 'center')
    await say('pick', () => tap(christmas), 0.2)
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
