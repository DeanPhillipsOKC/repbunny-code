// #925: setup's look step drops the empty circles and shows a theme picked
// from the full list as the selection on the link row.
export default {
  issue: 925,
  title: ['Your look,', 'picked'],
  note: 'In setup, the look you picked always shows as picked. A theme you chose from the full list now shows by name, with a tap to change it.',
  spoken: '[warm, friendly] In setup, the look you picked always shows as picked.',
  prepare: async (page, kit) => {
    await kit.seed(page, { premium: false })
  },
  lines: {
    open: 'Open your account, then Preferences, and tap Run setup again.',
    more: 'Tap the link under the two looks to see every theme.',
    pick: 'Pick Minimal to hide the bunny, then go back to setup.',
    shown: '[excited] Classic, no bunny now shows as your theme. Tap it to change it.',
  },
  demo: async (page, { say, tap, sleep, zoom }) => {
    const wizard = page.getByRole('dialog', { name: 'Set up RepBunny' })
    await say('open', async () => {
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Preferences/ }), 500)
      await tap(page.getByRole('button', { name: /^Run setup again/ }), 500)
      await tap(wizard.getByRole('button', { name: 'Next' }))
    }, 0.2)
    await wizard.getByRole('group', { name: 'Look' }).waitFor()
    await say('more', () => tap(wizard.getByRole('button', { name: 'See every theme, seasonal ones too' })), 0.5)
    const sheet = page.getByRole('dialog', { name: 'Theme' })
    await say('pick', async () => {
      await tap(sheet.getByRole('button', { name: 'Minimal', exact: true }), 500)
      await tap(sheet.getByRole('button', { name: 'Back to setup' }))
    }, 0.2)
    const row = wizard.getByRole('button', { name: 'Classic, no bunny, your theme. Change' })
    await row.waitFor()
    const poster = Date.now() / 1000
    await say('shown', () => zoom(row, 1.6), 0.1)
    await sleep(1200)
    return poster
  },
}
