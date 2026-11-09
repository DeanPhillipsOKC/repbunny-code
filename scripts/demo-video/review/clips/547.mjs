// #547: the muscle Sets chart labels its grey 10 to 20 sets band.
export default {
  issue: 547,
  title: ['Sets band', 'labeled'],
  note: "A muscle's Sets chart now labels the grey 10–20 sets band and says why it's there.",
  spoken: "A muscle's sets chart now labels its grey band. It marks 10 to 20 sets a week, and says why it's there.",
  prepare: (page, kit) => kit.seed(page),
  lines: {
    open: 'Open the Progress tab, and tap Muscle groups.',
    pick: 'Tap a muscle, like chest.',
    band: 'The grey band on the chart is now labeled: 10 to 20 sets a week,',
    why: "with a line on why. It's a common weekly target for building muscle.",
  },
  demo: async (page, { say, tap, reveal, zoom, nav }) => {
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 500)
      await tap(page.getByRole('link', { name: 'Muscle groups', exact: true }), 500)
    }, 0.2)
    await say('pick', () => tap(page.getByRole('link', { name: /^Chest, / })), 0.4)
    await say('band', () => reveal(page.getByTestId('target-band')), 0.1)
    const poster = Date.now() / 1000
    // The label is small at phone size, so zoom in on it (#605).
    await say('why', () => zoom(page.getByTestId('band-label').locator('b'), 2.5), 0.1)
    return poster
  },
}
