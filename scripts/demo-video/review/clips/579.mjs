// #579: tapping a set in a lift's Sessions list opens its record check.
export default {
  issue: 579,
  title: ['Why not a', 'record?'],
  note: "Wondering why a set was or wasn't a record? Tap any set in a lift's Sessions list. RepBunny shows the rule, your best before it with both numbers worked out, and what would beat it. The PR line in the Workout log opens it too.",
  spoken: "Wondering why a set was or wasn't a record? Tap any set to find out.",
  prepare: (page, kit) => kit.seed(page, { premium: true }),
  lines: {
    open: 'Open the Progress tab, tap Lift progress, and pick bench press.',
    set: 'Scroll down to Sessions and tap a set.',
    sheet: 'It shows the rule, your best before it, and what would beat it.',
    jump: 'Tap the Open the record set button to see your best set.',
  },
  demo: async (page, { say, tap, reveal, sleep, nav }) => {
    const history = page.getByRole('dialog', { name: 'Barbell Bench Press history' })
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 500)
      await tap(page.getByRole('link', { name: 'Lift progress', exact: true }), 500)
      await tap(page.getByRole('button', { name: /Barbell Bench Press/ }).first())
    }, 0.2)
    await say('set', async () => {
      await reveal(history.getByRole('heading', { name: 'Sessions' }), 'start')
      await tap(history.getByRole('button', { name: 'Record check for set 2' }).first())
    }, 0.5)
    const poster = Date.now() / 1000
    await say('sheet', () => sleep(1500), 0)
    const open = page.getByRole('button', { name: /^Open the (record set|set it beat)$/ })
    if (await open.count()) await say('jump', () => tap(open), 0.6)
    return poster
  },
}
