// #578: tapping a dot on a lift's chart shows its math, and See the sets
// highlights the set behind it.
export default {
  issue: 578,
  title: ['Chart point', 'receipts'],
  note: "Tap a dot on a lift's chart to see how the number was worked out. Estimated one rep max shows the formula with your own set, Volume adds up every set, and each dot shows the session before it. See the sets jumps to that workout and highlights the set. Tap the change next to the big number to see what it compares.",
  spoken: "Tap a dot on a lift's chart to see how the number was worked out.",
  prepare: (page, kit) => kit.seed(page, { premium: true }),
  lines: {
    open: 'Open the Progress tab, tap Lift progress, and pick bench press.',
    dot: 'Tap the latest dot. It shows the formula with your own set, and the session before it.',
    sets: 'Tap See the sets. The workout below opens with that set highlighted.',
    pill: 'Back up top, tap the change next to the big number to see what it compares.',
  },
  demo: async (page, { say, tap, reveal, nav }) => {
    const history = page.getByRole('dialog', { name: 'Barbell Bench Press history' })
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 500)
      await tap(page.getByRole('link', { name: 'Lift progress', exact: true }), 500)
      await tap(page.getByRole('button', { name: /Barbell Bench Press/ }).first())
    }, 0.2)
    await say('dot', () => tap(history.locator('.hit').last()), 0.1)
    const poster = Date.now() / 1000
    await say('sets', () => tap(history.getByRole('button', { name: 'See the sets ›' })), 0.2)
    await say('pill', async () => {
      await reveal(history.getByRole('group', { name: 'Chart metric' }), 'start')
      await tap(history.locator('.change-pill'))
    }, 0.4)
    return poster
  },
}
