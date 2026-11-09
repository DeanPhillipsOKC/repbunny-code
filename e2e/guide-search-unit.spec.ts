import { test, expect } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { buildGuideIndex, inlineRuns, parseGuidePage } from '../scripts/lib/guide-index.mjs'
import { createGuideSearch, excerptFor, expandQuery, runsText } from '../src/lib/guideSearch'

// Issue #568: the in-app guide search's index and ranking, on the real
// site/guides/ pages.

const guides = buildGuideIndex('site')
const search = createGuideSearch(guides)
const top = (q: string) => search.search(q)[0]?.guide.slug

test('the index has every guide folder, with a title, topic, summary, and steps', () => {
  const folders = readdirSync('site/guides', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  expect(guides.map((g) => g.slug).sort()).toEqual(folders.sort())
  for (const g of guides) {
    expect(g.title, g.slug).not.toBe('')
    expect(g.topic, g.slug).not.toBe('')
    expect(g.summary, g.slug).not.toBe('')
    expect(g.steps.length, g.slug).toBeGreaterThan(0)
    for (const s of g.steps) expect(s.heading, g.slug).not.toBe('')
  }
})

test('the index holds text only: no markup, image paths, or video', () => {
  const json = JSON.stringify(guides)
  expect(json).not.toMatch(/<[a-z/]/i)
  expect(json).not.toMatch(/\.(webp|png|mp4|vtt)\b/)
  expect(json).not.toContain('Still stuck')
})

test('bold words in a guide come through as bold runs', () => {
  expect(inlineRuns('Tap <strong>Save backup</strong>. Keep it &amp; go.')).toEqual([
    { text: 'Tap ' },
    { text: 'Save backup', strong: true },
    { text: '. Keep it & go.' },
  ])
  const page = parseGuidePage(
    '<main><h1>T</h1><p class="guide-lede">L</p><ol class="steps"><li class="step"><div class="step-text"><h2>One</h2><p>A</p><ul><li><img src="x.webp" /><span>B</span></li></ul></div></li></ol></main>',
  )
  expect(page.steps).toEqual([{ heading: 'One', blocks: [{ runs: [{ text: 'A' }] }, { bullet: true, runs: [{ text: 'B' }] }] }])
})

test('a typo still finds the guide: "bakup" opens with Back up just what you need', () => {
  expect(top('bakup')).toBe('partial-backups')
})

test('a synonym finds the guide: "one rep max" opens with Exercise history', () => {
  expect(expandQuery('one rep max')).toContain('1rm')
  expect(top('one rep max')).toBe('exercise-history')
})

test('as-you-type prefixes and plain titles land first', () => {
  expect(top('plate calc')).toBe('plate-calculator')
  expect(top('rest tim')).toBe('rest-timer')
  expect(top('widget')).toBe('home-screen-widgets')
  expect(top('hevy')).toBe('import-from-strong-hevy')
  expect(top('swap')).toBe('swap-exercises')
})

test('nothing matches gibberish', () => {
  expect(search.search('zzqxv')).toEqual([])
  expect(search.search('   ')).toEqual([])
})

test('the excerpt marks the matched words around the first match', () => {
  const parts = excerptFor('Open Your data. Then tap Back up my data and pick what goes in.', ['back'], 'summary')
  expect(parts.some((p) => p.match && p.text === 'Back')).toBe(true)
  expect(excerptFor('No hits here', ['zzz'], 'The summary')).toEqual([{ text: 'The summary' }])
  const hit = search.search('bakup')[0]
  expect(hit.excerpt.some((p) => p.match)).toBe(true)
  expect(runsText(hit.guide.lede)).toContain('backup')
})

test('a guide has to match most of the question, not one stray word', () => {
  expect(search.search('apple health sync')).toEqual([])
  expect(top('how do I back up my data')).toBe('partial-backups')
  expect(top('how long should I rest')).toBe('rest-timer')
})
