// #863: the theme app icons get painted backgrounds behind the bunny.
export default {
  issue: 863,
  title: ['Painted', 'icons'],
  note: 'The Cotton Candy, Chalk, Carrot Patch, and Sunrise app icons now have painted backgrounds behind the bunny. Pick one under Theme, then App icon.',
  spoken: '[warm, friendly] The theme app icons now have painted backgrounds behind the bunny.',
  prepare: (page, kit) => kit.seed(page, { premium: true }),
  lines: {
    open: 'Open your account, then Preferences, then Theme.',
    find: 'Scroll down to App icon.',
    pick: 'Tap Carrot Patch. Your home screen icon changes right away.',
  },
  demo: async (page, { say, tap, reveal, sleep, zoom }) => {
    await say('open', async () => {
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Preferences/ }), 500)
      await tap(page.getByRole('dialog', { name: 'Preferences', exact: true }).getByRole('button', { name: /^Theme/ }))
    }, 0.2)
    const icons = page.getByRole('group', { name: 'App icon', exact: true })
    await say('find', () => reveal(icons, 'center'), 0.4)
    await say('pick', () => tap(icons.getByRole('button', { name: 'Carrot Patch app icon' })), 0.3)
    const poster = Date.now() / 1000
    await zoom(icons, 1.6)
    await sleep(1500)
    return poster
  },
}
