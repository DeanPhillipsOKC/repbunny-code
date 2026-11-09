// #851: library duplicates merged, and the short names people type.
export default {
  issue: 851,
  title: ['Short names', 'work'],
  note: 'The exercise library now understands the short names people use, like OHP, RDL, and DB bench. A few entries that were the same exercise twice are now one.',
  spoken: 'The exercise library now understands the short names people use.',
  prepare: (page, kit) => kit.seed(page, { premium: false }),
  lines: {
    open: 'Open the Exercises tab, and tap Library.',
    ohp: 'Type OHP, and there is the overhead press.',
    rdl: 'Or try DB RDL for the dumbbell Romanian deadlift.',
  },
  demo: async (page, { say, tap, type, sleep, nav }) => {
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Exercises', exact: true }), 500)
      await tap(page.getByRole('group', { name: 'Exercises view' }).getByRole('button', { name: 'Library' }))
    }, 0.3)
    const search = page.getByRole('searchbox', { name: 'Search the library' })
    await say('ohp', () => type(search, 'ohp'), 0.4)
    const poster = Date.now() / 1000
    await say('rdl', async () => {
      await search.fill('')
      await type(search, 'db rdl')
    }, 0.4)
    await sleep(1500)
    return poster
  },
}
