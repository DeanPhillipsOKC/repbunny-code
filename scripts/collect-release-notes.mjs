// Issue #216: store release notes from release-notes/ (#558). A store/vX.Y.Z
// tag builds the iPhone and Play apps (#215); this collects the notes shipped
// since the previous store/v* tag, by build number (`git rev-list --count`).
//
//   node scripts/collect-release-notes.mjs --tag store/v1.0.3 --store android --out whatsnew/whatsnew-en-US
//   node scripts/collect-release-notes.mjs --tag store/v1.0.3 --store ios --out release_notes.json
//   node scripts/collect-release-notes.mjs --tag store/v1.0.3 --email <file.html> --run-url <url>
//
// Without --out or --email it prints the store's notes. Without --tag it uses
// HEAD as the new release. See docs/architecture.md > Native apps > Releasing.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadReleaseNotes } from './lib/release-notes.mjs'
import { backlogApi } from './backlog-repo.mjs'

// Play's "What's new" limit. TestFlight's "What to Test" allows 4000.
export const LIMITS = { android: 500, ios: 4000 }

// The first store release has no earlier tag, and the whole history is too
// long for either store, so it gets this instead.
export const FIRST_RELEASE_NOTE =
  "RepBunny's first release. Log your workouts and watch your lifts go up. Everything stays on your phone, no account needed."

export const QA_PAGE_URL = 'https://claude.ai/artifact/LC4VqFUPErxCLSbEKx1v8n'
export const TESTFLIGHT_URL = 'https://appstoreconnect.apple.com/apps'
export const PLAY_CONSOLE_URL = 'https://play.google.com/console'

function itemText(item) {
  return typeof item === 'string' ? item : item.text
}

function forStore(item, store) {
  return typeof item === 'string' || !item.platforms || item.platforms.includes(store)
}

// The notes for one store ('ios' or 'android') shipped after build `from` up
// to and including build `to`, newest first. `from` null means the first
// release, which gets FIRST_RELEASE_NOTE.
export function storeNotes(notes, store, from, to) {
  if (from == null) return [FIRST_RELEASE_NOTE]
  return notes
    .flatMap((n) =>
      n.items
        .filter((item, i) => (n.builds?.[i] ?? n.build) > from && (n.builds?.[i] ?? n.build) <= to)
        .filter((item) => forStore(item, store))
        .map(itemText),
    )
}

// Whole lines up to `limit` characters, as a bulleted list. If any don't fit,
// it ends with "...and more". A first line too long by itself is cut at a word.
export function fitNotes(lines, limit) {
  const bullets = lines.map((line) => `• ${line}`)
  const more = '...and more'
  const all = bullets.join('\n')
  if (all.length <= limit) return all
  const kept = []
  for (const bullet of bullets) {
    if ([...kept, bullet, more].join('\n').length > limit) break
    kept.push(bullet)
  }
  if (kept.length === 0) {
    const room = limit - more.length - 2
    const cut = bullets[0].slice(0, room)
    kept.push(cut.slice(0, cut.lastIndexOf(' ')) + '…')
  }
  return [...kept, more].join('\n')
}

// TestFlight rejects < and > in the notes (Codemagic's docs), so they go.
export function testFlightNotes(lines) {
  return fitNotes(lines, LIMITS.ios).replace(/[<>]/g, '')
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const row = (label, value) =>
  `<tr><td style="width:84px;padding:5px 10px 5px 0;color:#b79cf0;font-size:12px;vertical-align:top;">${label}</td><td style="padding:5px 0;word-break:break-word;overflow-wrap:anywhere;">${value}</td></tr>`
const link = (href, text) => `<a href="${escapeHtml(href)}" style="color:#f2879c;">${escapeHtml(text)}</a>`
const list = (lines) =>
  `<ul style="margin:0;padding-left:18px;">${lines.map((l) => `<li style="margin:0 0 4px;">${escapeHtml(l)}</li>`).join('')}</ul>`

// The testing email, in /next-item's card style (docs/brand-identity.md tokens). `iphoneChecks`
// are the open `verify:iphone` issues in this release ({ number, title, url }), to try on the
// TestFlight build before it goes to App Review (docs/backlog.md > Owner check).
export function releaseEmail({ version, ios, android, runUrl, iphoneChecks = [] }) {
  const same = ios.length === android.length && ios.every((line, i) => line === android[i])
  const notes = same
    ? [row("What's new", list(ios))]
    : [row('iPhone', list(ios)), row('Android', list(android))]
  const rows = [
    ...notes,
    row(
      'Test it',
      `Open the ${link(QA_PAGE_URL, 'QA procedure')}, set the Smoke filter, and work through the Release tab, including the update test (TC-UPG-001).`,
    ),
    row(
      'iPhone',
      `The build should appear in ${link(TESTFLIGHT_URL, 'TestFlight')} once Codemagic finishes. Paste the notes above into App Store Connect's What's New when you submit.`,
    ),
    row(
      'Android',
      `A draft on the closed testing track, for testers only, with these notes already attached. Roll it out from ${link(PLAY_CONSOLE_URL, 'Play Console')} > Test and release > Closed testing.`,
    ),
    row(
      'Get it (Android)',
      `A draft can't be installed from Play. Right after Cut release, run Release to Google Play on the same tag with track internal, then roll that draft out in ${link(PLAY_CONSOLE_URL, 'Play Console')} > Test and release > Internal testing, then update RepBunny from Play on the phone and smoke test that build. Fallback: Play Console > App bundle explorer > that version > Downloads > Signed, universal APK.`,
    ),
    ...(iphoneChecks.length
      ? [
          row(
            'Check on iPhone',
            `Before you submit the TestFlight build for review, try these on the iPhone (each issue's How to test has the steps), then close each one:<ul style="margin:6px 0 0;padding-left:18px;">${iphoneChecks
              .map((i) => `<li style="margin:0 0 4px;">${link(i.url, `#${i.number} ${i.title}`)}</li>`)
              .join('')}</ul>`,
          ),
        ]
      : []),
    row(
      'Then',
      `When the smoke pass${iphoneChecks.length ? ' and the iPhone checks are' : ' is'} clean, promote it: in Play Console, promote the closed testing release to production, and in App Store Connect, submit the TestFlight build for review.`,
    ),
  ]
  if (runUrl) rows.push(row('Build log', link(runUrl, 'GitHub Actions run')))
  return {
    subject: `RepBunny ${version} is ready to test`,
    html: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
  </head>
  <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Manrope,-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
    <div style="max-width:520px;width:100%;margin:0 auto;background:#211829;border-radius:14px;">
      <div style="padding:14px 20px;background:#17111c;border-radius:14px 14px 0 0;">
        <span style="font-family:'Baloo 2',ui-rounded,Segoe UI,Arial,sans-serif;color:#f2879c;font-size:14px;font-weight:700;">🐰 RepBunny</span>
      </div>
      <div style="padding:10px 20px;background:#f2879c;">
        <span style="color:#241a2c;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Ready to test</span>
      </div>
      <div style="padding:20px;background:#211829;border-radius:0 0 14px 14px;">
        <h2 style="margin:0 0 16px;font-family:'Baloo 2',ui-rounded,Segoe UI,Arial,sans-serif;font-size:18px;color:#f2879c;word-break:break-word;overflow-wrap:anywhere;">Version ${escapeHtml(version)}</h2>
        <table style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:14px;color:#f5edf2;">
          ${rows.join('\n          ')}
        </table>
      </div>
    </div>
  </body>
</html>
`,
  }
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

// Pure: the issue numbers in commit subjects, from "(#<issue>)" and "(#<issue>) (#<PR>)".
export function subjectNumbers(subjects) {
  return [...new Set(subjects.flatMap((s) => [...s.matchAll(/\(#(\d+)\)/g)].map((m) => Number(m[1]))))]
}

// The open `verify:iphone` issues among the commits in `range`. A PR number never has the label.
// Any failure (no token, no network) means no list: the email still goes out.
function iphoneChecksIn(range) {
  try {
    const numbers = subjectNumbers(git('log', '--format=%s', range).split('\n').filter(Boolean))
    return numbers.flatMap((n) => {
      const i = JSON.parse(execFileSync('gh', ['api', `${backlogApi()}/issues/${n}`], { encoding: 'utf8' }))
      const labels = i.labels.map((l) => l.name)
      return i.state === 'open' && labels.includes('verify:iphone') ? [{ number: n, title: i.title, url: i.html_url }] : []
    })
  } catch {
    return []
  }
}

// The store/v* tag before `tag` by version, or null for the first release.
export function previousTag(tags, tag) {
  const parse = (t) => t.replace('store/v', '').split('.').map(Number)
  const cmp = (a, b) => {
    const [x, y] = [parse(a), parse(b)]
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
    return 0
  }
  const valid = tags.filter((t) => /^store\/v\d+\.\d+\.\d+$/.test(t))
  const earlier = tag ? valid.filter((t) => cmp(t, tag) < 0) : valid
  return earlier.sort(cmp).at(-1) ?? null
}

function write(path, text) {
  if (dirname(path) !== '.') mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const tag = arg('tag')
  const prev = previousTag(git('tag', '--list', 'store/v*').split('\n').filter(Boolean), tag)
  const to = Number(git('rev-list', '--count', tag ?? 'HEAD'))
  const from = prev ? Number(git('rev-list', '--count', prev)) : null
  const releaseNotes = loadReleaseNotes()
  const notes = (store) => storeNotes(releaseNotes, store, from, to)

  const email = arg('email')
  if (email) {
    const { subject, html } = releaseEmail({
      version: tag ? tag.replace('store/v', '') : `build ${to}`,
      ios: notes('ios'),
      android: notes('android'),
      runUrl: arg('run-url'),
      iphoneChecks: prev ? iphoneChecksIn(`${prev}..${tag ?? 'HEAD'}`) : [],
    })
    write(email, html)
    console.log(subject)
    return
  }

  const store = arg('store') ?? 'android'
  if (!(store in LIMITS)) throw new Error(`--store must be ios or android, not ${store}`)
  const text = store === 'ios' ? testFlightNotes(notes(store)) : fitNotes(notes(store), LIMITS.android)
  const out = arg('out')
  if (!out) return console.log(text)
  // Codemagic reads release_notes.json for App Store Connect (TestFlight's What to Test).
  write(out, out.endsWith('.json') ? JSON.stringify([{ language: 'en-US', text }], null, 2) + '\n' : text)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
