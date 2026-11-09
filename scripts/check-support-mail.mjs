// Issue #309: prints how many support threads are waiting to be triaged, so the routine only
// starts when there is mail. No AI. Read-only: the mailbox is opened with EXAMINE, nothing is
// fetched, and no flag or label is touched. It only runs a SEARCH, so message bodies never leave
// Gmail. .github/workflows/dispatch-support.yml runs it; docs/backlog-runner.md > Support triage.
//
//   GMAIL_SENDER_ADDRESS=... GMAIL_APP_PASSWORD=... node scripts/check-support-mail.mjs
//
// Gmail's X-GM-RAW search matches label:repbunny-support (the "RepBunny Support" label) and
// excludes label:repbunny-support-triaged (its "RepBunny Support/Triaged" child label).
import tls from 'node:tls'

const QUERY = 'label:repbunny-support -label:repbunny-support-triaged'

// Sends one tagged command and resolves with its untagged lines once the tagged reply arrives.
function imapSession(socket) {
  let buffer = ''
  let tag = 0
  let pending = null
  socket.setEncoding('utf8')
  socket.on('data', (chunk) => {
    buffer += chunk
    if (pending) pending.check()
  })
  const waitFor = (test) =>
    new Promise((resolve, reject) => {
      const check = () => {
        const result = test(buffer)
        if (result) {
          pending = null
          buffer = ''
          resolve(result)
        }
      }
      pending = { check }
      socket.once('error', reject)
      check()
    })
  return {
    greeting: () => waitFor((b) => (b.includes('\r\n') ? b : null)),
    command: (text) => {
      const id = `a${++tag}`
      const done = waitFor((b) => {
        const m = b.match(new RegExp(`^${id} (OK|NO|BAD)[^\\r\\n]*`, 'm'))
        return m ? { status: m[1], text: b } : null
      })
      socket.write(`${id} ${text}\r\n`)
      return done
    },
  }
}

export async function countWaiting(user, password) {
  const socket = tls.connect({ host: 'imap.gmail.com', port: 993, servername: 'imap.gmail.com' })
  socket.setTimeout(30000, () => socket.destroy(new Error('IMAP timed out')))
  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve)
    socket.once('error', reject)
  })
  const imap = imapSession(socket)
  try {
    await imap.greeting()
    const quote = (s) => `"${s.replace(/(["\\])/g, '\\$1')}"`
    // Never log the server's reply to LOGIN: it can echo the account name.
    if ((await imap.command(`LOGIN ${quote(user)} ${quote(password)}`)).status !== 'OK') {
      throw new Error('IMAP login failed')
    }
    if ((await imap.command('EXAMINE "[Gmail]/All Mail"')).status !== 'OK') {
      throw new Error('could not open the mailbox read-only')
    }
    const search = await imap.command(`SEARCH X-GM-RAW "${QUERY}"`)
    if (search.status !== 'OK') throw new Error('IMAP search failed')
    const line = search.text.split('\r\n').find((l) => l.startsWith('* SEARCH'))
    return line ? line.slice('* SEARCH'.length).trim().split(/\s+/).filter(Boolean).length : 0
  } finally {
    socket.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const user = process.env.GMAIL_SENDER_ADDRESS
  const password = process.env.GMAIL_APP_PASSWORD
  if (!user || !password) {
    console.error('GMAIL_SENDER_ADDRESS and GMAIL_APP_PASSWORD must be set')
    process.exit(1)
  }
  try {
    console.log(await countWaiting(user, password))
  } catch (error) {
    console.error(`check-support-mail: ${error.message}`)
    process.exit(1)
  }
}
