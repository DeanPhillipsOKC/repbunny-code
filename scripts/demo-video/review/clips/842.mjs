// #842: the exercise library grew from 138 to 323 entries.
export default {
  issue: 842,
  title: ['A bigger', 'library'],
  note: 'The exercise library more than doubled, to over 300 exercises. Your usual lifts are probably already there.',
  spoken: '[excited] The exercise library more than doubled. Your usual lifts are probably already there.',
  prepare: (page, kit) => kit.seed(page, { premium: false }),
  lines: {
    open: 'Open the Exercises tab, and tap Library.',
    count: 'Over 300 exercises now, from machines to kettlebells.',
    search: 'Search for a lift, like Nordic curl.',
    detail: 'Tap it to see how to do it, then add it to your exercises.',
  },
  demo: async (page, { say, tap, type, sleep, nav, zoom, unzoom }) => {
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Exercises', exact: true }), 500)
      await tap(page.getByRole('group', { name: 'Exercises view' }).getByRole('button', { name: 'Library' }))
    }, 0.3)
    const poster = Date.now() / 1000
    await say('count', () => zoom(page.getByText(/exercises, ready to go/), 1.6), 0.3)
    await say('search', async () => {
      await unzoom()
      await type(page.getByRole('searchbox', { name: 'Search the library' }), 'nordic')
    }, 0.4)
    await say('detail', async () => {
      await tap(page.getByRole('button', { name: 'View Nordic Hamstring Curl', exact: true }))
      await tap(page.getByRole('button', { name: 'How to' }))
      await sleep(600)
    }, 0.3)
    await sleep(1200)
    return poster
  },
}
