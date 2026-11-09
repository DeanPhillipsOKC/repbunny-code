import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, existsSync } from 'node:fs'

// #178: the guides index groups its cards under topic headings, so a new
// guide has to land in a group to be listed at all.
const html = readFileSync('site/guides/index.html', 'utf8')
const groups = [...html.matchAll(/<section class="guide-group"[\s\S]*?<\/section>/g)].map((m) => m[0])

function cardSlugs(chunk: string) {
  return [...chunk.matchAll(/<a class="guide-card" href="\/guides\/([a-z0-9-]+)\/"/g)].map((m) => m[1])
}

test('every guide folder is listed exactly once on the guides index', () => {
  const folders = readdirSync('site/guides', { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(`site/guides/${d.name}/index.html`))
    .map((d) => d.name)
    .sort()
  expect([...cardSlugs(html)].sort()).toEqual(folders)
})

test('every guide card sits in a topic group with a heading', () => {
  expect(groups.length).toBeGreaterThan(1)
  for (const group of groups) {
    expect(group).toMatch(/<h2 [^>]*class="guide-group-title"[^>]*>[^<]+<\/h2>/)
    expect(cardSlugs(group).length).toBeGreaterThan(0)
  }
  expect(groups.flatMap(cardSlugs)).toHaveLength(cardSlugs(html).length)
})
