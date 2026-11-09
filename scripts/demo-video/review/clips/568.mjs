// #568: search the how-to guides inside the app, offline.
export default {
  issue: 568,
  title: ['Guide', 'search'],
  note: 'Help & guides now opens right in the app: search every how-to guide as you type, even offline, and read the steps without leaving RepBunny. Typos and other words for the same thing (like "one rep max") still find the right guide.',
  spoken: 'Help and guides now opens right in the app. Search every how-to guide as you type, even offline. Typos and other words for the same thing still find the right guide.',
  prepare: async (page, kit) => {
    await kit.quietRest(page, { rest: false })
    await kit.seed(page, { premium: false })
  },
  lines: {
    account: 'Tap the Account button.',
    help: 'Then tap Help and guides.',
    typo: 'Type a search. Even with a typo, it finds the backup guide.',
    synonym: 'Try another word for the same thing, like one rep max.',
    open: 'Tap a guide to read the steps right here.',
    done: 'No need to leave RepBunny.',
  },
  demo: async (page, { say, tap, type, sleep }) => {
    await say('account', () => tap(page.getByRole('button', { name: 'Account', exact: true })), 0.5)
    await say('help', () => tap(page.getByRole('group', { name: 'About' }).getByRole('button', { name: 'Help & guides' })), 0.5)
    const sheet = page.getByRole('dialog', { name: 'Help & guides' })
    const box = sheet.getByRole('searchbox', { name: 'Search the guides' })
    await say('typo', () => type(box, 'bakup'), 0.2)
    await sleep(800)
    await say('synonym', async () => {
      await box.fill('')
      await sleep(300)
      await box.pressSequentially('one rep max', { delay: 90 })
      await sleep(600)
    }, 0.2)
    const poster = Date.now() / 1000
    await say('open', () => tap(sheet.getByRole('list', { name: 'Search results' }).getByRole('button').first()), 0.4)
    await say('done', () => sleep(1500))
    return poster
  },
}
