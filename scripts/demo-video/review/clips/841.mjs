// #841: four seasonal app icons in their own group on the Theme screen.
export default {
  issue: 841,
  title: ['Seasonal', 'icons'],
  note: 'Four seasonal app icons are here. Pick Autumn, Halloween, Snow Globe, or Christmas under Theme, then Seasonal icons. They come with Premium.',
  spoken: '[excited] Four seasonal app icons are here!',
  prepare: (page, kit) => kit.seed(page, { premium: true }),
  lines: {
    open: 'Open your account, then Preferences, then Theme.',
    find: 'Scroll down to Seasonal icons.',
    pick: 'Tap Halloween. Your home screen icon changes right away.',
  },
  demo: async (page, { say, tap, reveal, sleep, zoom }) => {
    await say('open', async () => {
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Preferences/ }), 500)
      await tap(page.getByRole('dialog', { name: 'Preferences', exact: true }).getByRole('button', { name: /^Theme/ }))
    }, 0.2)
    const seasonal = page.getByRole('group', { name: 'Seasonal icons' })
    await say('find', () => reveal(seasonal, 'center'), 0.4)
    await say('pick', () => tap(seasonal.getByRole('button', { name: 'Halloween seasonal app icon' })), 0.3)
    const poster = Date.now() / 1000
    await zoom(seasonal, 1.6)
    await sleep(1500)
    return poster
  },
}
