import MiniSearch from 'minisearch'
import type { GuideEntry, GuideRun } from '../../scripts/lib/guide-index.mjs'
import { GUIDE_SYNONYMS } from './guideSynonyms'

// Issue #568: search the how-to guides on the device. The index is the
// website's guides, built into the app at build time (`virtual:guide-index`,
// scripts/lib/guide-index.mjs), so searching never makes a network request.
// MiniSearch ranks with BM25, matches prefixes as you type, and forgives a
// typo or two; titles count most, then step headings, then the text.
// Mockup: docs/design/issue-568-guide-search.html, option A.

export type { GuideEntry, GuideRun }

export const runsText = (runs: GuideRun[]): string => runs.map((r) => r.text).join('')

interface GuideDoc {
  id: string
  title: string
  summary: string
  headings: string
  body: string
}

function toDoc(g: GuideEntry): GuideDoc {
  return {
    id: g.slug,
    title: g.title,
    summary: g.summary,
    headings: g.steps.map((s) => s.heading).join('\n'),
    body: [runsText(g.lede), ...g.steps.flatMap((s) => s.blocks.map((b) => runsText(b.runs)))].join('\n'),
  }
}

// The query plus every synonym group it touches, each as its own phrase.
export function expandQuery(query: string, groups: string[][] = GUIDE_SYNONYMS): string[] {
  const q = ` ${query.toLowerCase().replace(/\s+/g, ' ').trim()} `
  const out = [query.trim()]
  for (const group of groups) {
    if (!group.some((term) => q.includes(` ${term} `))) continue
    for (const term of group) if (!out.some((o) => o.toLowerCase() === term)) out.push(term)
  }
  return out
}

export interface GuideHit {
  guide: GuideEntry
  // A short window of the guide's text around the first match, split so the
  // matched words can be highlighted.
  excerpt: { text: string; match?: true }[]
}

export interface GuideSearch {
  search: (query: string) => GuideHit[]
}

const EXCERPT_CHARS = 110

// Question words that would otherwise match every guide.
const STOP_WORDS = new Set(
  'a am an and are at be can do does find for get go how i im in is it me my need of on or see show that the there this to want what when where which why with you your'.split(' '),
)

export function queryWords(phrase: string): string[] {
  return MiniSearch.getDefault('tokenize')(phrase.toLowerCase()).filter((w: string) => w && !STOP_WORDS.has(w))
}

// Text around the first matched term, with every matched term marked.
export function excerptFor(text: string, terms: string[], summary: string): GuideHit['excerpt'] {
  const words = [...new Set(terms.map((t) => t.toLowerCase()).filter((t) => t.length > 1))].sort((a, b) => b.length - a.length)
  if (words.length === 0) return [{ text: summary }]
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'gi')
  const flat = text.replace(/\s+/g, ' ')
  const first = flat.search(re)
  if (first < 0) return [{ text: summary }]
  let start = Math.max(0, first - 30)
  if (start > 0) {
    const space = flat.indexOf(' ', start)
    if (space >= 0 && space < first) start = space + 1
  }
  let end = Math.min(flat.length, start + EXCERPT_CHARS)
  if (end < flat.length) {
    const space = flat.lastIndexOf(' ', end)
    if (space > first) end = space
  }
  const window = (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '')
  const parts: GuideHit['excerpt'] = []
  let last = 0
  for (const m of window.matchAll(re)) {
    if (m.index! > last) parts.push({ text: window.slice(last, m.index) })
    parts.push({ text: m[0], match: true })
    last = m.index! + m[0].length
  }
  if (last < window.length) parts.push({ text: window.slice(last) })
  return parts
}

export function createGuideSearch(guides: GuideEntry[]): GuideSearch {
  const bySlug = new Map(guides.map((g) => [g.slug, g]))
  const docs = guides.map(toDoc)
  const docBySlug = new Map(docs.map((d) => [d.id, d]))
  const mini = new MiniSearch<GuideDoc>({
    fields: ['title', 'summary', 'headings', 'body'],
    processTerm: (term) => {
      const t = term.toLowerCase()
      return STOP_WORDS.has(t) ? null : t
    },
    searchOptions: {
      boost: { title: 4, summary: 2, headings: 2, body: 1 },
      prefix: true,
      fuzzy: (term) => (term.length >= 4 ? 0.2 : false),
      combineWith: 'OR',
    },
  })
  mini.addAll(docs)

  return {
    search(query) {
      const phrases = expandQuery(query)
      if (!phrases[0]) return []
      // The query as typed (any of its words) counts double; a synonym
      // phrase only counts where all its words are.
      const results = mini.search({
        combineWith: 'OR',
        queries: phrases.map((p, i) =>
          i === 0 ? { queries: [p], combineWith: 'OR', boostDocument: () => 2 } : { queries: [p], combineWith: 'AND' },
        ),
      })
      // A guide has to match at least half the typed words (so "apple health
      // sync" doesn't list a guide for mentioning an Adam's apple), or every
      // word of one synonym.
      const typed = queryWords(phrases[0])
      const synonyms = phrases.slice(1).map(queryWords).filter((w) => w.length > 0)
      const relevant = results.filter((r) => {
        const matched = new Set(r.queryTerms)
        if (typed.filter((w) => matched.has(w)).length >= Math.ceil(typed.length / 2)) return true
        return synonyms.some((words) => words.every((w) => matched.has(w)))
      })
      return relevant.map((r) => {
        const guide = bySlug.get(r.id as string)!
        const doc = docBySlug.get(r.id as string)!
        return { guide, excerpt: excerptFor(`${doc.body}`, r.terms, guide.summary) }
      })
    },
  }
}
