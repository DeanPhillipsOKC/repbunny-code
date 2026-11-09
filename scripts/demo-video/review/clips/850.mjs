// #850: 35 more common exercises, and machines found by their brand names.
export default {
  issue: 850,
  title: ['35 more', 'exercises'],
  note: 'The exercise library now has 35 more common moves, like Burpees, Jumping Jacks, the Air Bike, and the ab glider machine. Machines also turn up by their brand names, so a search for Hammer Strength or Assault Bike finds them.',
  spoken: '[excited] 35 more common moves just joined the exercise library. And machines turn up by their brand names too.',
  prepare: (page, kit) => kit.seed(page, { premium: false }),
  lines: {
    open: 'Open the Exercises tab, and tap Library.',
    brand: 'Search for a machine by its brand, like Assault Bike.',
    glider: 'Or by what your gym calls it, like ab sled.',
    detail: 'Tap it to see how to do it. This one logs by level, not weight.',
  },
  demo: async (page, { say, tap, type, sleep, nav }) => {
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Exercises', exact: true }), 500)
      await tap(page.getByRole('group', { name: 'Exercises view' }).getByRole('button', { name: 'Library' }))
    }, 0.3)
    const search = page.getByRole('searchbox', { name: 'Search the library' })
    await say('brand', () => type(search, 'assault bike'), 0.4)
    const poster = Date.now() / 1000
    await say('glider', async () => {
      await search.fill('')
      await type(search, 'ab sled')
    }, 0.4)
    await say('detail', async () => {
      await tap(page.getByRole('button', { name: 'View Ab Glider Machine', exact: true }))
      await tap(page.getByRole('button', { name: 'How to' }))
      await sleep(600)
    }, 0.3)
    await sleep(1200)
    return poster
  },
}
