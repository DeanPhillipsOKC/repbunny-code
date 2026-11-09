// Issue #568: the in-app guide search's index, built from the website's guides
// (site/guides/<slug>/index.html) so the app can search and show them with no
// network request. vite.config.ts serves it as the `virtual:guide-index`
// module, so every dev server and `npm run build` reads the guides as they are
// now and the index can't go stale. Text only: no images, videos, or markup.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', times: '×' }

function decode(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

function squash(text) {
  return text.replace(/\s+/g, ' ').trim()
}

// Plain text of an HTML fragment.
export function plainText(html) {
  return squash(decode(html.replace(/<[^>]*>/g, ' '))).replace(/ ([.,:;!?)])/g, '$1').replace(/\( /g, '(')
}

// A paragraph as runs of plain and bold text, so the app can show the
// guide's <strong> words without rendering any HTML.
export function inlineRuns(html) {
  const runs = []
  const re = /<strong[^>]*>([\s\S]*?)<\/strong>/gi
  let last = 0
  let m
  const push = (raw, strong) => {
    const text = decode(raw.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ')
    if (text) runs.push(strong ? { text, strong: true } : { text })
  }
  while ((m = re.exec(html))) {
    push(html.slice(last, m.index), false)
    push(m[1], true)
    last = m.index + m[0].length
  }
  push(html.slice(last), false)
  if (runs.length) {
    runs[0].text = runs[0].text.replace(/^\s+/, '')
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '')
  }
  return runs.filter((r) => r.text)
}

function inner(html, re) {
  return re.exec(html)?.[1] ?? ''
}

// The website's topic groups and card captions, keyed by slug, in page order.
export function parseGuidesIndex(html) {
  const cards = []
  const groupRe = /<h2[^>]*class="guide-group-title"[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2[^>]*class="guide-group-title"|<\/main>)/gi
  let g
  while ((g = groupRe.exec(html))) {
    const topic = plainText(g[1])
    const cardRe = /<a class="guide-card" href="\/guides\/([^/"]+)\/"[\s\S]*?guide-card-caption">([\s\S]*?)<\/span>/gi
    let c
    while ((c = cardRe.exec(g[2]))) cards.push({ slug: c[1], topic, summary: plainText(c[2]) })
  }
  return cards
}

// One guide page: title, lede, and its numbered steps. A step's blocks are
// its paragraphs and list items; images, the video clip, and the "Still
// stuck?" card are left out.
export function parseGuidePage(html) {
  const main = inner(html, /<main[^>]*>([\s\S]*?)<\/main>/i)
  const title = plainText(inner(main, /<h1[^>]*>([\s\S]*?)<\/h1>/i))
  const ledeHtml = inner(main, /<p class="guide-lede">([\s\S]*?)<\/p>/i)
  const stepsHtml = inner(main, /<ol class="steps">([\s\S]*)<\/ol>/i)
  const steps = []
  const stepRe = /<div class="step-text">([\s\S]*?)<\/div>/gi
  let s
  while ((s = stepRe.exec(stepsHtml))) {
    const body = s[1]
    const heading = plainText(inner(body, /<h2[^>]*>([\s\S]*?)<\/h2>/i))
    const blocks = []
    const blockRe = /<p[^>]*>([\s\S]*?)<\/p>|<li[^>]*>([\s\S]*?)<\/li>/gi
    let b
    while ((b = blockRe.exec(body))) {
      const runs = inlineRuns(b[1] ?? b[2])
      if (runs.length) blocks.push(b[2] !== undefined ? { bullet: true, runs } : { runs })
    }
    steps.push({ heading, blocks })
  }
  return { title, lede: inlineRuns(ledeHtml), steps }
}

// Every guide listed on the website's guides index, in its order. Throws when
// a guide folder isn't listed or a listed guide is missing or has no steps,
// so a broken guide fails the build instead of shipping an empty result.
export function buildGuideIndex(siteDir = 'site') {
  const guidesDir = join(siteDir, 'guides')
  const cards = parseGuidesIndex(readFileSync(join(guidesDir, 'index.html'), 'utf8'))
  const folders = readdirSync(guidesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(guidesDir, d.name, 'index.html')))
    .map((d) => d.name)
  const listed = new Set(cards.map((c) => c.slug))
  const unlisted = folders.filter((f) => !listed.has(f))
  if (unlisted.length) throw new Error(`guide-index: not on site/guides/index.html: ${unlisted.join(', ')}`)

  return cards.map(({ slug, topic, summary }) => {
    const file = join(guidesDir, slug, 'index.html')
    if (!existsSync(file)) throw new Error(`guide-index: site/guides/index.html lists a missing guide: ${slug}`)
    const page = parseGuidePage(readFileSync(file, 'utf8'))
    if (!page.title || page.steps.length === 0) throw new Error(`guide-index: ${slug} has no title or steps`)
    return { slug, topic, title: page.title, summary, lede: page.lede, steps: page.steps }
  })
}
