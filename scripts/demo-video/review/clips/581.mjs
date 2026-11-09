// #581: the Progress hub's new bests and records counts open their lists.
export default {
  issue: 581,
  title: ['What counted', 'as a best?'],
  note: 'Tap new bests or records on Progress to see exactly which lifts and sets they counted. Each list explains its rule and opens the chart or the record check.',
  spoken: '[warm, friendly] Curious what counted as a new best? Tap the number to see.',
  prepare: (page, kit) => kit.seed(page, { premium: true }),
  lines: {
    open: 'Open the Progress tab and tap new bests.',
    list: 'Each lift it counted is listed, with the set behind it.',
    diff: 'Tap what is the difference to see how records are counted.',
    records: 'Then tap through to the records list.',
  },
  demo: async (page, { say, tap, sleep, nav }) => {
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Progress', exact: true }), 500)
      await tap(page.getByRole('button', { name: /new bests?, show them/ }))
    }, 0.3)
    const poster = Date.now() / 1000
    await say('list', () => sleep(1500), 0)
    await say('diff', () => tap(page.getByRole('button', { name: "What's the difference from records?" })), 0.5)
    await say('records', () => tap(page.getByRole('button', { name: /^See the \d+ records? ›$/ })), 0.5)
    await sleep(1500)
    return poster
  },
}
