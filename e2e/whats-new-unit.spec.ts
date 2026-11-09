import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import type { ReleaseNote } from '../src/lib/releaseNotes'
import { checkItem, groupReleaseNotes, loadReleaseNotes } from '../scripts/lib/release-notes.mjs'
import {
  buildNumber,
  formatNoteDate,
  GUIDES_URL,
  hasNotesSince,
  noteGuideUrl,
  noteText,
  NOTES_PAGE_SIZE,
  themeNoteSince,
  visibleNotes,
} from '../src/lib/whatsNew'
import {
  FIRST_RELEASE_NOTE,
  fitNotes,
  LIMITS,
  previousTag,
  QA_PAGE_URL,
  releaseEmail,
  storeNotes,
  subjectNumbers,
  testFlightNotes,
} from '../scripts/collect-release-notes.mjs'

// Issue #101's pieces that don't need a page (same "no separate unit-test
// runner" reasoning as client-error-log-unit.spec.ts).

// Issue #558: the real notes, from release-notes/ (the app gets the same list baked in).
const releaseNotes = loadReleaseNotes()

function days(n: number): ReleaseNote[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-09-${String(28 - i).padStart(2, '0')}`,
    build: 400 - i,
    items: [`Change ${i}`],
  }))
}

test('the build number comes from the version string', () => {
  expect(buildNumber('v384+6dcdf63')).toBe(384)
  expect(buildNumber('v389+4c91dad-dirty')).toBe(389)
  expect(buildNumber('dev')).toBeNull()
})

test('notes count as new only past the seen build', () => {
  const notes = days(3)
  expect(hasNotesSince(notes, 399)).toBe(true)
  expect(hasNotesSince(notes, 400)).toBe(false)
  expect(hasNotesSince(notes, null)).toBe(false)
})

test('the sheet lists 10 days until Show older', () => {
  const notes = days(13)
  expect(NOTES_PAGE_SIZE).toBe(10)
  expect(visibleNotes(notes, false)).toHaveLength(10)
  expect(visibleNotes(notes, false)[0]).toBe(notes[0])
  expect(visibleNotes(notes, true)).toHaveLength(13)
})

test('dates read as calendar days', () => {
  expect(formatNoteDate('2026-10-02')).toBe('Oct 2, 2026')
})

test('release notes are one entry per day, newest first', () => {
  const dates = releaseNotes.map((n) => n.date)
  expect(new Set(dates).size).toBe(dates.length)
  expect([...dates].sort().reverse()).toEqual(dates)
  for (let i = 1; i < releaseNotes.length; i++) expect(releaseNotes[i].build).toBeLessThan(releaseNotes[i - 1].build)
  for (const note of releaseNotes) expect(note.items.length).toBeGreaterThan(0)
})

// Issue #558: one file per change, dated by the commit that added it.
test('note files merge into the archive by day, newest first', () => {
  const archive: ReleaseNote[] = [
    { date: '2026-10-15', build: 719, items: ['Archived today'] },
    { date: '2026-10-14', build: 706, items: ['Yesterday'] },
  ]
  const notes = groupReleaseNotes(archive, [
    { file: '560.json', date: '2026-10-16', build: 725, item: 'Tomorrow' },
    { file: '558.json', date: '2026-10-15', build: 721, item: 'Older new note' },
    { file: '559.json', date: '2026-10-15', build: 723, item: { text: 'Newest note', guide: 'rest-timer/' } },
  ])
  expect(notes.map((n) => [n.date, n.build])).toEqual([
    ['2026-10-16', 725],
    ['2026-10-15', 723],
    ['2026-10-14', 706],
  ])
  expect(notes[1].items).toEqual([{ text: 'Newest note', guide: 'rest-timer/' }, 'Older new note', 'Archived today'])
  // The archive passed in is left alone.
  expect(archive[0].items).toEqual(['Archived today'])
})

// Issue #610: a later note on the same day as a tag must not re-send the day's shipped notes.
test('store notes are picked per note, not per day', () => {
  const notes = groupReleaseNotes(
    [{ date: '2026-10-14', build: 704, items: ['Archived'] }],
    [
      { file: '1.json', date: '2026-10-15', build: 710, item: 'Shipped in the tag' },
      { file: '2.json', date: '2026-10-15', build: 712, item: 'Added after the tag' },
    ],
  )
  expect(notes[0].build).toBe(712)
  expect(storeNotes(notes, 'android', 710, 720)).toEqual(['Added after the tag'])
  expect(storeNotes(notes, 'android', 703, 711)).toEqual(['Shipped in the tag', 'Archived'])
})

test('a note file holds one item and nothing else', () => {
  expect(checkItem({ text: 'Plain' }, 'a.json')).toBe('Plain')
  expect(checkItem({ text: 'Widget', platforms: ['android'] }, 'a.json')).toEqual({ text: 'Widget', platforms: ['android'] })
  expect(() => checkItem({ text: '' }, 'a.json')).toThrow(/text/)
  expect(() => checkItem({ text: 'x', build: 3 }, 'a.json')).toThrow(/unknown key "build"/)
  expect(() => checkItem([{ text: 'x' }], 'a.json')).toThrow(/one/)
  expect(() => checkItem({ text: 'x', guide: 'rest-timer' }, 'a.json')).toThrow(/guide/)
  expect(() => checkItem({ text: 'x', platforms: ['web'] }, 'a.json')).toThrow(/platform/)
  expect(checkItem({ text: 'Spooky', theme: 'halloween' }, 'a.json')).toEqual({ text: 'Spooky', theme: 'halloween' })
  expect(() => checkItem({ text: 'x', theme: 'Halloween!' }, 'a.json')).toThrow(/theme/)
})

test('the banner picks the newest unseen note that ships a theme (#887)', () => {
  const notes: ReleaseNote[] = [
    { date: '2026-10-31', build: 510, items: ['Newer fix', { text: 'New Halloween theme', theme: 'halloween' }], builds: [510, 500] },
    { date: '2026-10-01', build: 480, items: [{ text: 'New Autumn theme', theme: 'autumn' }] },
  ]
  expect(themeNoteSince(notes, 400)).toEqual({ text: 'New Halloween theme', theme: 'halloween' })
  // Seen past the theme's own build: a later fix the same day doesn't bring it back.
  expect(themeNoteSince(notes, 505)).toBeNull()
  expect(themeNoteSince(notes, 490)).toEqual({ text: 'New Halloween theme', theme: 'halloween' })
  expect(themeNoteSince(notes, null)).toBeNull()
  expect(themeNoteSince(days(3), 0)).toBeNull()
})

test('every theme a note names is a real theme', () => {
  const themeSource = readFileSync('src/lib/theme.ts', 'utf8')
  for (const note of releaseNotes) {
    for (const item of note.items) {
      if (typeof item === 'string' || item.theme === undefined) continue
      expect(themeSource, `theme "${item.theme}"`).toContain(`id: '${item.theme}'`)
    }
  }
})

test('a note item is plain text or text with a guide link (#102)', () => {
  expect(GUIDES_URL).toBe('https://repbunny.app/guides/')
  expect(noteText('Plain change')).toBe('Plain change')
  expect(noteGuideUrl('Plain change')).toBeNull()
  const guided = { text: 'Rest timer change', guide: 'rest-timer/' }
  expect(noteText(guided)).toBe('Rest timer change')
  expect(noteGuideUrl(guided)).toBe('https://repbunny.app/guides/rest-timer/')
})

test('every guide a note links to exists in site/guides', () => {
  for (const note of releaseNotes) {
    for (const item of note.items) {
      expect(noteText(item).trim()).not.toBe('')
      if (typeof item === 'string' || item.guide === undefined) continue
      expect(item.guide).toMatch(/^[a-z0-9-]+\/$/)
      expect(existsSync(`site/guides/${item.guide}index.html`), `site/guides/${item.guide}index.html`).toBe(true)
    }
  }
})

test('a platform tag names only real platforms (#216)', () => {
  expect(noteGuideUrl({ text: 'Web push', platforms: ['pwa'] })).toBeNull()
  for (const note of releaseNotes) {
    for (const item of note.items) {
      if (typeof item === 'string' || item.platforms === undefined) continue
      expect(item.platforms.length).toBeGreaterThan(0)
      for (const p of item.platforms) expect(['pwa', 'ios', 'android']).toContain(p)
    }
  }
})

// Issue #216: the store notes a store/v* tag collects.
const STORE_NOTES: ReleaseNote[] = [
  { date: '2026-10-12', build: 540, items: ['Newest change', { text: 'Web push', platforms: ['pwa'] }] },
  { date: '2026-10-11', build: 530, items: [{ text: 'Android widget', guide: 'home-screen-widgets/', platforms: ['android'] }] },
  { date: '2026-10-10', build: 520, items: ['Shipped last release'] },
]

test('store notes cover the builds since the last tag, per store, newest first', () => {
  expect(storeNotes(STORE_NOTES, 'android', 520, 540)).toEqual(['Newest change', 'Android widget'])
  expect(storeNotes(STORE_NOTES, 'ios', 520, 540)).toEqual(['Newest change'])
  expect(storeNotes(STORE_NOTES, 'android', 520, 535)).toEqual(['Android widget'])
  expect(storeNotes(STORE_NOTES, 'ios', 540, 545)).toEqual([])
  expect(storeNotes(STORE_NOTES, 'ios', null, 540)).toEqual([FIRST_RELEASE_NOTE])
})

test('the previous store tag is the highest version below the new one', () => {
  const tags = ['store/v1.0.9', 'store/v1.0.10', 'store/v1.1.0', 'v1.0.300']
  expect(previousTag(tags, 'store/v1.1.0')).toBe('store/v1.0.10')
  expect(previousTag(tags, 'store/v1.0.9')).toBeNull()
  expect(previousTag([], 'store/v1.0.0')).toBeNull()
})

test('Play notes keep whole lines under 500 characters', () => {
  expect(fitNotes(['One', 'Two'], LIMITS.android)).toBe('• One\n• Two')
  const long = Array.from({ length: 8 }, (_, i) => `Line ${i} `.padEnd(100, 'x'))
  const fitted = fitNotes(long, LIMITS.android)
  expect(fitted.length).toBeLessThanOrEqual(500)
  expect(fitted.endsWith('\n...and more')).toBe(true)
  expect(fitted.split('\n').slice(0, -1)).toEqual(long.slice(0, 4).map((l) => `• ${l}`))
  const huge = fitNotes(['word '.repeat(200)], LIMITS.android)
  expect(huge.length).toBeLessThanOrEqual(500)
  expect(huge).toMatch(/…\n\.\.\.and more$/)
  // Real notes, all of them, still fit both stores.
  const all = releaseNotes.flatMap((n) => n.items.map(noteText))
  expect(fitNotes(all, LIMITS.android).length).toBeLessThanOrEqual(500)
  expect(testFlightNotes(all).length).toBeLessThanOrEqual(4000)
  expect(testFlightNotes(['a <b> c'])).toBe('• a b c')
})

test('the testing email links the QA page and lists the notes', () => {
  const { subject, html } = releaseEmail({ version: '1.0.3', ios: ['Same & new'], android: ['Same & new'], runUrl: 'https://example.com/run' })
  expect(subject).toBe('RepBunny 1.0.3 is ready to test')
  expect(html).toContain(QA_PAGE_URL)
  expect(html).toContain('TC-UPG-001')
  expect(html).toContain('Same &amp; new')
  expect(html).toContain('once Codemagic finishes')
  // One list when both stores get the same notes, one per store otherwise.
  expect(html.match(/<ul /g)).toHaveLength(1)
  const split = releaseEmail({ version: '1.0.3', ios: ['Both'], android: ['Both', 'Widget'] }).html
  expect(split.match(/<ul /g)).toHaveLength(2)
  expect(split).toContain('Widget')
  expect(split).not.toContain('GitHub Actions run')
  expect(split).not.toContain('Check on iPhone')
})

test('the testing email lists the iPhone checks to do in TestFlight (owner check)', () => {
  const { html } = releaseEmail({
    version: '1.2.0',
    ios: ['New'],
    android: ['New'],
    iphoneChecks: [{ number: 926, title: 'Back & swipe', url: 'https://github.com/o/r/issues/926' }],
  })
  expect(html).toContain('Check on iPhone')
  expect(html).toContain('https://github.com/o/r/issues/926')
  expect(html).toContain('#926 Back &amp; swipe')
  expect(html).toContain('the iPhone checks are clean')
  expect(subjectNumbers(['Fix the sheet (#823) (#922)', 'Revert "x"', 'Add y (#5)'])).toEqual([823, 922, 5])
})
