// #549: exercise rows are one tap target (history) with a single More button (Edit and Delete).
export default {
  issue: 549,
  title: ['Roomier', 'exercises'],
  note: 'Roomier exercise list: tap an exercise to see its history, and tap ⋯ for Edit and Delete. Names fit on one line, and every button is easier to hit.',
  spoken: 'The exercise list is roomier. Names fit on one line, and every button is easier to hit.',
  prepare: async (page, kit) => {
    await kit.quietRest(page, { rest: false })
    await kit.seed(page, { premium: false })
  },
  lines: {
    tab: 'Open the Exercises tab.',
    row: 'Tap an exercise, like Barbell Bench Press, to see its history.',
    back: 'Tap the Close history button to go back.',
    more: 'For Edit and Delete, tap the More button.',
    done: 'Edit and Delete are right there under the row.',
  },
  demo: async (page, { say, tap, nav }) => {
    const row = page.locator('.row-wrap', { hasText: 'Barbell Bench Press' })
    await say('tab', () => tap(nav().getByRole('link', { name: 'Exercises' })), 0.5)
    await say('row', () => tap(row.getByRole('button', { name: 'View exercise history' }), 1800), 0.5)
    await say('back', () => tap(page.getByRole('dialog', { name: 'Barbell Bench Press history' }).getByRole('button', { name: 'Close history' })), 0.5)
    await say('more', () => tap(row.getByRole('button', { name: 'More options' })), 0.5)
    const poster = Date.now() / 1000
    await say('done')
    return poster
  },
}
