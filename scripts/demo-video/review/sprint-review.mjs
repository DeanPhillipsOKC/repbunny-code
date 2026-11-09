#!/usr/bin/env node
// Sprint review video (#606): stitches the clips for the changes going out in the next store
// release into one narrated video: the intro card ("Sprint review"), then for each change with a
// clip a title card and its segment, then an end card listing the release's other changes (not
// the trivial ones, which the video doesn't mention; owner, 2026-10-15) and what's up next.
// It reads logs/demo-video/review/release.json and the segments collect.mjs downloaded from the
// issue-assets branch, so nothing is recorded here. The Sprint review workflow
// (.github/workflows/sprint-review.yml) runs collect.mjs, this, then review-issue.mjs.
//
//   node scripts/demo-video/review/collect.mjs && node scripts/demo-video/review/sprint-review.mjs
//
// Output: logs/demo-video/review/sprint-review.mp4, and sprint-review.json with where each clip
// starts in the video ({ version, duration, clips: [{ issue, at }] }) for the review issue.

import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderCard } from '../cards.mjs'
import { FFPROBE, cardPiece, stitch } from './kit.mjs'

const WORK = join('logs', 'demo-video', 'review')
const RELEASE = join(WORK, 'release.json')
if (!existsSync(RELEASE)) throw new Error(`No ${RELEASE}: run node scripts/demo-video/review/collect.mjs first.`)
const release = JSON.parse(readFileSync(RELEASE, 'utf8'))

const probe = (file) => Number(String(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])).trim())

// First sentence, cut to fit one or two lines on the end card.
// A leading question ("Got a Premium code?") says nothing alone, so it's skipped.
function short(text) {
  const sentences = text.split(/(?<=[.?!:])\s/)
  const first = (sentences.find((s) => !s.endsWith('?')) ?? sentences[0]).replace(/[:.]$/, '')
  return first.length > 80 ? first.slice(0, 77).trimEnd() + '…' : first
}
const END_MAX = 11

// A two-line title card from the clip's spec, or the note's first words.
function cardTitle(change) {
  if (change.cardTitle) return change.cardTitle
  const words = short(change.notes[0]).split(' ')
  const a = words.slice(0, 2).join(' ')
  const b = words.slice(2, 4).join(' ')
  return [a, b || `#${change.issue}`]
}

const browser = await chromium.launch()
const pieces = []
try {
  const clips = release.changes.filter((c) => c.clip).map((c) => ({ change: c, mp4: join(WORK, String(c.issue), 'segment.mp4'), poster: join(WORK, String(c.issue), 'poster.jpg') }))
  for (const c of clips) if (!existsSync(c.mp4)) throw new Error(`${c.mp4} is missing: rerun collect.mjs.`)
  const posterFor = clips.find((c) => existsSync(c.poster))?.poster ?? null

  // ---- Intro ----
  const intro = await renderCard(browser, 'intro', ['Sprint', 'review'], posterFor, join(WORK, 'cards', 'intro'))
  pieces.push(cardPiece(intro, join(WORK, 'cards', 'intro.mp4'), { music: 'start' }))

  // ---- Each clip, after its title card ----
  const marks = []
  for (const [i, { change, mp4 }] of clips.entries()) {
    const card = await renderCard(browser, 'review-title', cardTitle(change), null, join(WORK, 'cards', `title-${change.issue}`), {
      n: `#${change.issue}`, k: `${i + 1} of ${clips.length}`,
    })
    const at = pieces.reduce((t, p) => t + probe(p), 0)
    marks.push({ issue: change.issue, at: Math.round(at) })
    pieces.push(cardPiece(card, join(WORK, 'cards', `title-${change.issue}.mp4`)))
    pieces.push(mp4)
  }

  // ---- End card: the rest of the release (not the trivial ones), and what's next ----
  const all = release.changes.filter((c) => !c.clip && !c.trivial).flatMap((c) => c.notes).map(short)
  const rest = all.length > END_MAX ? [...all.slice(0, END_MAX - 1), `…and ${all.length - END_MAX + 1} more in the review issue`] : all
  const cut = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t)
  const next = release.upNext.map((i) => `#${i.issue} ${cut(i.title, 70)}${i.note}`)
  const end = await renderCard(browser, 'review-end', ['', ''], null, join(WORK, 'cards', 'end'), {
    items: JSON.stringify(rest), total: String(all.length), next: JSON.stringify(next), d: '10',
  })
  pieces.push(cardPiece(end, join(WORK, 'cards', 'end.mp4'), { music: 'end' }))

  // ---- Stitch ----
  const out = join(WORK, 'sprint-review.mp4')
  stitch(pieces, out)
  const duration = probe(out)
  writeFileSync(join(WORK, 'sprint-review.json'), JSON.stringify({ version: release.version, duration: Math.round(duration), clips: marks }, null, 2))
  console.log(`${out}: v${release.version} candidate, ${duration.toFixed(1)}s, ${(statSync(out).size / 1024).toFixed(0)} KB; ${clips.length} clips, ${all.length} more changes on the end card`)
} finally {
  await browser.close()
}
