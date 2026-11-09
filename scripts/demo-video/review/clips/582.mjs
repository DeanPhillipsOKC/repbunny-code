// #582: on one muscle's chart, tap a week's bar to see what counted, and
// How? under the average shows its sum.
export default {
  issue: 582,
  title: ['Tap a', 'week'],
  note: "On a muscle group's chart, tap any week's bar to see which exercises counted that week and on what day. Tap How under the average to see the math behind it.",
  spoken: "[warm, friendly] Curious what made a week's bar so tall? Now you can tap it.",
  prepare: (page, kit) => kit.seed(page, { premium: false }),
  lines: {
    open: 'Open the Progress tab, tap Muscle groups, and pick chest.',
    bar: "Tap last week's bar.",
    list: 'The list below shows the exercises that counted, and the day you did them.',
    how: 'Tap How, next to the average, to see the math.',
  },
  demo: async (page, { say, tap, reveal, sleep, nav }) => {
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 500)
      await tap(page.getByRole('link', { name: 'Muscle groups', exact: true }), 500)
      await tap(page.getByRole('link', { name: /^Chest, / }))
    }, 0.2)
    await say('bar', () => tap(page.getByRole('button', { name: /^Week of / }).last()), 0.6)
    await say('list', async () => {
      await reveal(page.getByRole('button', { name: 'Back to this week' }), 'center')
      await sleep(800)
    }, 0.3)
    const poster = Date.now() / 1000
    await say('how', async () => {
      await reveal(page.getByRole('button', { name: 'How?' }), 'start')
      await tap(page.getByRole('button', { name: 'How?' }))
    }, 0.6)
    await sleep(1200)
    return poster
  },
}
