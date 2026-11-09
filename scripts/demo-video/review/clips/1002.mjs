// #1002: setup's look step stays on one screen. A Bunny art switch, Classic
// and Chalk cards, and every other theme under More themes, free for 7 days.
export default {
  issue: 1002,
  title: ['Pick your', 'look'],
  note: "Picking your look in setup is all on one screen now. Flip the Bunny art switch, tap Classic or Chalk, or open More themes to see every theme. Pick one of those and it's yours free for 7 days.",
  spoken: '[warm, friendly] Picking your look in setup is all on one screen now.',
  prepare: async (page, kit) => {
    await kit.seed(page, { premium: false })
  },
  lines: {
    open: 'Open your account, then Preferences, and tap Run setup again.',
    bunny: 'Flip the Bunny art switch to hide the bunny. Every card follows it.',
    chalk: 'Tap Chalk, then turn the bunny back on.',
    more: 'Open More themes to see every theme.',
    pick: "[excited] Tap Halloween. Finish setup and it's yours free for 7 days.",
  },
  demo: async (page, { say, tap, sleep, reveal }) => {
    const wizard = page.getByRole('dialog', { name: 'Set up RepBunny' })
    await say('open', async () => {
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Preferences/ }), 500)
      await tap(page.getByRole('button', { name: /^Run setup again/ }), 500)
      await tap(wizard.getByRole('button', { name: 'Next' }))
    }, 0.2)
    const look = wizard.getByRole('group', { name: 'Look' })
    await look.waitFor()
    const bunny = wizard.getByRole('switch', { name: 'Bunny art' })
    await say('bunny', () => tap(bunny), 0.4)
    await say('chalk', async () => {
      await tap(look.getByRole('button', { name: 'Chalk', exact: true }), 700)
      await tap(bunny)
    }, 0.2)
    await say('more', () => tap(wizard.getByRole('button', { name: /^More themes/ })), 0.4)
    const halloween = look.getByRole('button', { name: 'Halloween', exact: true })
    let poster
    await say('pick', async () => {
      await tap(halloween, 600)
      poster = Date.now() / 1000
      await reveal(halloween, 'center')
    }, 0.1)
    await sleep(1200)
    return poster
  },
}
