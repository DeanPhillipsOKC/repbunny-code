// #1012: Starter programs show the free routine limit before the tap.
export default {
  issue: 1012,
  title: ['Programs that', 'fit or not'],
  note: 'Starter programs now show how many of your 3 free routines you have used, and say whether each program fits before you tap it. The bigger 5 routine programs live in their own Bigger programs list.',
  spoken: '[warm, friendly] Starter programs now show your free routines, and whether each program fits, before you tap.',
  prepare: async (page, kit) => {
    await kit.quietRest(page, { rest: false })
    await kit.seed(page, { premium: false })
  },
  lines: {
    open: 'Go to Routines and scroll down to Starter programs.',
    meter: 'Your three routines fill the free slots, so each program says No room.',
    sheet: 'Tap one, like Upper and lower. It says how many routines to archive, or offers Premium.',
    bigger: 'The bigger five routine programs sit under Bigger programs at the end.',
  },
  demo: async (page, { say, tap, sleep, reveal, nav }) => {
    await say('open', async () => {
      await tap(nav().getByRole('link', { name: 'Routines' }))
      await reveal(page.getByRole('heading', { name: 'Starter programs' }), 'start')
    }, 0.4)
    const section = page.getByRole('region', { name: 'Starter programs' })
    await say('meter', () => reveal(section.getByRole('button', { name: /Upper \/ lower/ }), 'center'), 0.3)
    await sleep(600)
    await say('sheet', async () => {
      await tap(section.getByRole('button', { name: /Upper \/ lower/ }))
      await reveal(page.getByRole('dialog', { name: 'Upper / lower' }).getByRole('button', { name: 'See Premium' }), 'center')
    }, 0.3)
    await sleep(1200)
    const poster = Date.now() / 1000
    await tap(page.getByRole('dialog', { name: 'Upper / lower' }).getByRole('button', { name: 'Close', exact: true }).last())
    await say('bigger', () => tap(section.getByRole('button', { name: /Bigger programs/ })), 0.4)
    await sleep(1500)
    return poster
  },
}
