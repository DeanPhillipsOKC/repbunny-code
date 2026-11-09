// #874: the automatic copy is on by default, and Your copies restores one.
export default {
  issue: 874,
  title: ['Automatic', 'copy'],
  note: 'Your workouts now get an automatic copy after every workout, with nothing to set up. On iPhone it goes to your iCloud Drive, and on Android to the Documents folder on your phone. To bring one back, open Account, then Your data, then Your copies. A new install offers your copies on its welcome screen.',
  spoken: '[warm, friendly] Your workouts now get an automatic copy after every workout. There is nothing to set up.',
  prepare: async (page, kit) => {
    await kit.seed(page, { premium: false })
    // The copy a finished workout would have saved.
    await page.evaluate(async () => {
      const { saveAutoCopy } = await import('/src/lib/backupFolder.ts')
      await saveAutoCopy()
    })
  },
  lines: {
    open: 'Open your account, then Your data.',
    status: 'Tap Automatic copy. It is already saving to iCloud Drive.',
    copies: 'Go back and tap Your copies. Pick one to bring it back.',
  },
  demo: async (page, { say, tap, sleep, zoom }) => {
    await say('open', async () => {
      await tap(page.getByRole('button', { name: 'Account', exact: true }), 500)
      await tap(page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: /^Your data/ }))
    }, 0.2)
    const data = page.getByRole('dialog', { name: 'Your data', exact: true })
    await say('status', () => tap(data.getByRole('button', { name: /^Automatic copy/ })), 0.3)
    await sleep(1200)
    const sheet = page.getByRole('dialog', { name: 'Automatic copy', exact: true })
    await say('copies', async () => {
      await tap(sheet.getByRole('button', { name: 'Back' }), 400)
      await tap(page.getByRole('dialog', { name: 'Your data', exact: true }).getByRole('button', { name: /^Your copies/ }))
    }, 0.3)
    const list = page.getByRole('list', { name: 'Saved copies' })
    await list.waitFor()
    const poster = Date.now() / 1000
    await zoom(list, 1.4)
    await sleep(1500)
    return poster
  },
}
