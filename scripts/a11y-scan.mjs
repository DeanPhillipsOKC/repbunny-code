#!/usr/bin/env node
// Issue #575: the measurements behind the monthly accessibility review
// (.claude/skills/accessibility-review/SKILL.md). Not part of the
// npm run test:e2e gate: it makes no assertions, it only measures and
// screenshots, and the skill decides what's a real finding.
//
// It starts its own Vite dev server in local mode (VITE_DATA=local, on-device
// SQLite in the browser, the native apps' data path) on port 5175, so it needs
// no accounts, writes nothing anywhere, and never touches a server someone
// else is using. Every pass is a fresh browser context with a fresh database,
// seeded with a few weeks of workouts so Progress and the logs have content.
//
// Passes (all on a 390x844 phone unless noted):
// - default: every theme at default text size. Contrast of text and icons
//   (WCAG AA), plus, on Classic only, tap targets under 44 CSS px, controls
//   with no accessible name, images and charts with no text alternative, and
//   the headings and landmarks of each screen.
// - large-150 and large-200: Classic at 150% and 200% text on a 320px phone
//   (a 24px / 32px root and body font, the way large-font-layout.spec.ts
//   stands in for Android's font size setting). Page-wide horizontal
//   scrolling, clipped and truncated text, text running into other text, and
//   controls that are covered or can't be scrolled to.
// - reduce-motion: Classic with prefers-reduced-motion: reduce, including a
//   PR celebration. Every animation still running on each screen.
//
// Output: logs/a11y-review/<timestamp>/ with a PNG per screen and pass, and
// results.json. Prints a short JSON summary (outDir, counts, failures).
// A step that fails (a stale selector after a UI change) is listed under
// `failures` with that screen's accessibility tree, and the run carries on.
//
// Usage: node scripts/a11y-scan.mjs [--themes classic,chalk] [--port 5175]

import { chromium, devices } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const argValue = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const PORT = Number(argValue('--port') ?? 5175)
const BASE_URL = `http://localhost:${PORT}`
const outDir = join('logs', 'a11y-review', String(Date.now()))
mkdirSync(outDir, { recursive: true })

const ROUTINE = 'Upper Body Strength Day'
const results = { outDir, passes: [], failures: [] }

// --- dev server -------------------------------------------------------------

async function serverUp() {
  try {
    const res = await fetch(BASE_URL)
    return res.ok
  } catch {
    return false
  }
}

async function startServer() {
  if (await serverUp()) throw new Error(`port ${PORT} is already in use; pass --port <free port>`)
  const env = { ...process.env, VITE_DATA: 'local' }
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { env, stdio: 'ignore', shell: true, detached: true })
  for (let i = 0; i < 120; i++) {
    if (await serverUp()) return child
    await new Promise((r) => setTimeout(r, 500))
  }
  stopServer(child)
  throw new Error('the local-mode dev server did not start within 60 s')
}

function stopServer(child) {
  try {
    process.kill(-child.pid)
  } catch {}
}

// --- seeding ----------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000
const EXERCISES = [
  { name: 'Barbell Bench Press', muscle_group: 'chest' },
  { name: 'Barbell Back Squat', muscle_group: 'legs' },
  { name: 'Seated Cable Row', muscle_group: 'back' },
  { name: 'Overhead Press', muscle_group: 'shoulders' },
]

// Runs in the page, against the app's own connection, with the adapter's
// column encoding (the same route e2e/fixtures/local.ts takes).
async function seedInPage({ exercises, routine, now, dayMs }) {
  const { encode } = await import('/src/data/sqlite/repos.ts')
  const db = await window.__rbLocalDb()
  const insert = async (table, row) => {
    const values = { id: crypto.randomUUID(), ...row }
    const cols = Object.keys(values)
    await db.run(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      cols.map((c) => encode(table, c, values[c])),
    )
    return values.id
  }
  await db.run("UPDATE settings SET weight_unit = 'lb', default_rest_seconds = NULL")
  const template = await insert('workout_templates', { name: routine })
  const ids = []
  for (const [position, ex] of exercises.entries()) {
    const id = await insert('exercises', ex)
    ids.push(id)
    await insert('workout_template_exercises', { template_id: template, exercise_id: id, position })
  }
  // Two workouts a week for four weeks, a little heavier each time.
  for (let w = 0; w < 8; w++) {
    const performed = new Date(now - (29 - w * 3.5) * dayMs).toISOString()
    const workout = await insert('workouts', { template_id: template, performed_at: performed, finished_at: performed })
    for (const [i, exercise_id] of ids.entries()) {
      for (let s = 0; s < 3; s++) {
        await insert('sets', { workout_id: workout, exercise_id, set_index: s, reps: 8, weight: 95 + i * 20 + w * 5, weight_unit: 'lb' })
      }
    }
  }
  await insert('body_weight_entries', { weight: 182, weight_unit: 'lb', recorded_at: new Date(now - 7 * dayMs).toISOString() })
  await insert('body_weight_entries', { weight: 181, weight_unit: 'lb', recorded_at: new Date(now - dayMs).toISOString() })
}

async function newSeededPage(browser, { theme = 'classic', viewport, reducedMotion = 'no-preference' } = {}) {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL: BASE_URL,
    ...(viewport ? { viewport } : {}),
    reducedMotion,
  })
  await context.addInitScript((themeId) => {
    localStorage.setItem('rb-setup-done', '1')
    localStorage.setItem('rb-muscle-check-dismissed', '1')
    localStorage.setItem('rb-rest-tip-seen', '1')
    localStorage.setItem('repbunny-premium-unlocked', 'true')
    localStorage.setItem('repbunny-theme', themeId)
  }, theme)
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  // Milestone unlocks would cover whatever screen is being measured.
  await page.addLocatorHandler(page.getByTestId('unlock-celebration'), async (overlay) => {
    await overlay.getByRole('button', { name: /^(Not now|See my recap)$/ }).click()
  })
  await page.goto('/')
  await page.waitForFunction(() => '__rbLocalDb' in window)
  await page.evaluate(seedInPage, { exercises: EXERCISES, routine: ROUTINE, now: Date.now(), dayMs: DAY_MS })
  await page.reload()
  await page.getByRole('navigation', { name: 'Primary' }).waitFor()
  return { context, page }
}

// --- navigation -------------------------------------------------------------

async function tab(page, name) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name, exact: true }).click()
}

const SCREENS = [
  { id: 'home', open: async (page) => tab(page, 'Home') },
  { id: 'exercises', open: async (page) => tab(page, 'Exercises') },
  { id: 'routines', open: async (page) => tab(page, 'Routines') },
  { id: 'progress', open: async (page) => tab(page, 'Progress') },
  {
    id: 'workout-log',
    open: async (page) => {
      await tab(page, 'Progress')
      await page.getByRole('link', { name: 'Workout log', exact: true }).click()
    },
  },
  {
    id: 'body',
    open: async (page) => {
      await tab(page, 'Progress')
      await page.getByRole('link', { name: 'Body weight', exact: true }).click()
    },
  },
  // Last: starting the routine leaves a workout in progress.
  {
    id: 'workout',
    open: async (page) => {
      await tab(page, 'Home')
      await page.getByRole('button', { name: ROUTINE, exact: true }).click()
      await page.getByLabel('Reps').first().waitFor()
    },
  },
]

// A PR set (heavier than anything seeded), then the recap after finishing.
async function logPrAndFinish(page, onCelebration) {
  await page.getByLabel('Reps').first().fill('8')
  await page.getByLabel('Weight').first().fill('140')
  await page.getByRole('button', { name: 'Add set' }).first().click()
  // The big-jump check, in case the seeded weights ever change.
  const logAnyway = page.getByRole('button', { name: 'Log anyway' })
  if (await logAnyway.isVisible().catch(() => false)) await logAnyway.click()
  const overlay = page.locator('.celebration-overlay')
  try {
    await overlay.waitFor({ state: 'visible', timeout: 4000 })
    await page.waitForTimeout(300)
    await onCelebration?.('pr-celebration')
    await page.getByRole('button', { name: 'Nice!' }).click()
    await overlay.waitFor({ state: 'hidden' })
  } catch {}
  await page.getByRole('button', { name: 'Finish workout' }).click()
  // Unlogged exercises ask first.
  const finishAnyway = page.getByRole('button', { name: 'Finish anyway' })
  if (await finishAnyway.isVisible({ timeout: 2000 }).catch(() => false)) await finishAnyway.click()
  await page.getByTestId('post-finish-card').waitFor()
}

async function settle(page) {
  await page.waitForTimeout(500)
  await page.evaluate(() => window.scrollTo(0, 0))
}

async function step(page, name, fn) {
  try {
    await fn()
    return true
  } catch (err) {
    let tree = ''
    try {
      tree = (await page.locator('body').ariaSnapshot()).split('\n').slice(0, 60).join('\n')
    } catch {}
    results.failures.push({ step: name, error: String(err.message).split('\n')[0], tree })
    await page.keyboard.press('Escape').catch(() => {})
    return false
  }
}

async function shoot(page, file) {
  await page.screenshot({ path: join(outDir, file) })
  return file
}

// --- in-page measurements ---------------------------------------------------

// Shared helpers, injected once per page as window.__a11y.
function installHelpers() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  // Any CSS color (rgb, color-mix results, oklch) to [r, g, b, a].
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b, a / 255]
  }
  const over = (top, bottom) => {
    const a = top[3] + bottom[3] * (1 - top[3])
    if (a === 0) return [0, 0, 0, 0]
    const mix = (i) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a
    return [mix(0), mix(1), mix(2), a]
  }
  const luminance = ([r, g, b]) => {
    const lin = (c) => {
      c /= 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  }
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  // The solid color behind an element: semi-transparent backgrounds are
  // composited up the tree; a background image is noted, not guessed.
  const background = (el) => {
    const layers = []
    let image = false
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.backgroundImage !== 'none') image = true
      const color = rgba(style.backgroundColor)
      if (color[3] > 0) layers.push(color)
      if (color[3] >= 1) break
    }
    let result = rgba(getComputedStyle(document.body).backgroundColor)
    if (result[3] < 1) result = [255, 255, 255, 1]
    for (const layer of layers.reverse()) result = over(layer, result)
    return { color: result, image }
  }
  const visible = (el) => {
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    // 1px boxes are screen-reader-only text (.sr-only), not something on screen.
    return r.width > 1 && r.height > 1
  }
  const hiddenFromAT = (el) => !!el.closest('[aria-hidden="true"], [inert]')
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : ''
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50)
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ''}`
  }
  const CONTROLS = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'
  const controls = () => [...document.querySelectorAll(CONTROLS)].filter((el) => visible(el) && !hiddenFromAT(el) && !el.disabled)
  const textOf = (el) => (el ? (el.innerText || el.textContent || '').trim() : '')
  const accessibleName = (el) => {
    const by = el.getAttribute('aria-labelledby')
    if (by) {
      const t = by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(' ').trim()
      if (t) return t
    }
    const label = el.getAttribute('aria-label')
    if (label && label.trim()) return label.trim()
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map(textOf).join(' ').trim()
      if (t) return t
    }
    if (el.tagName === 'IMG') return (el.getAttribute('alt') || '').trim()
    const own = textOf(el)
    if (own) return own
    const img = el.querySelector('img[alt]:not([alt=""]), svg[aria-label], [role="img"][aria-label]')
    if (img) return (img.getAttribute('alt') || img.getAttribute('aria-label')).trim()
    return (el.getAttribute('title') || '').trim()
  }
  // Text nodes with something to read, and their element.
  const textElements = () => {
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue
      const el = node.parentElement
      if (!el || !visible(el) || hiddenFromAT(el)) continue
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName)) continue
      out.push({ node, el })
    }
    return out
  }
  window.__a11y = { rgba, ratio, background, visible, hiddenFromAT, describe, controls, accessibleName, textElements }
}

// Text and icon contrast against WCAG AA: 4.5:1 for text, 3:1 for large text
// (24px, or 18.66px bold) and for icons in controls with no text.
function measureContrast() {
  const { rgba, ratio, background, describe, controls, visible } = window.__a11y
  const seen = new Set()
  const out = []
  for (const { el } of window.__a11y.textElements()) {
    if (seen.has(el)) continue
    seen.add(el)
    const style = getComputedStyle(el)
    const size = parseFloat(style.fontSize)
    const bold = Number(style.fontWeight) >= 700
    const large = size >= 24 || (bold && size >= 18.66)
    const need = large ? 3 : 4.5
    const bg = background(el)
    let fg = rgba(style.color)
    // Faded text (opacity on the element or an ancestor) reads fainter.
    let opacity = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity)
    fg = [fg[0], fg[1], fg[2], fg[3] * opacity]
    const blended = fg.map((c, i) => (i < 3 ? c * fg[3] + bg.color[i] * (1 - fg[3]) : 1))
    const r = ratio(blended, bg.color)
    if (r < need) {
      out.push({ kind: 'text', element: describe(el), ratio: Math.round(r * 100) / 100, need, fontSize: size, color: style.color, background: `rgb(${bg.color.slice(0, 3).map(Math.round).join(', ')})`, backgroundImage: bg.image })
    }
  }
  for (const el of controls()) {
    if ((el.innerText || '').trim()) continue
    const icon = el.querySelector('svg')
    if (!icon || !visible(icon)) continue
    const style = getComputedStyle(icon)
    const paint = style.stroke !== 'none' && style.stroke ? style.stroke : style.fill
    if (!paint || paint === 'none' || paint.startsWith('url')) continue
    const bg = background(el)
    const fg = rgba(paint)
    const r = ratio(fg.map((c, i) => (i < 3 ? c * fg[3] + bg.color[i] * (1 - fg[3]) : 1)), bg.color)
    if (r < 3) out.push({ kind: 'icon', element: describe(el), ratio: Math.round(r * 100) / 100, need: 3, color: paint, background: `rgb(${bg.color.slice(0, 3).map(Math.round).join(', ')})`, backgroundImage: bg.image })
  }
  return out
}

// Tap targets, names, images and charts, headings and landmarks.
function measureStructure() {
  const { controls, describe, accessibleName, visible, hiddenFromAT } = window.__a11y
  const small = []
  const unnamed = []
  for (const el of controls()) {
    let r = el.getBoundingClientRect()
    // A checkbox or radio inside a bigger label is tapped through the label.
    const label = el.closest('label')
    if (label && ['checkbox', 'radio'].includes(el.type)) r = label.getBoundingClientRect()
    // WCAG's exception: a link inside a sentence.
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && (el.parentElement?.innerText || '').trim().length > (el.innerText || '').trim().length + 10
    if (!inline && (r.width < 44 || r.height < 44)) small.push({ element: describe(el), width: Math.round(r.width), height: Math.round(r.height) })
    if (!accessibleName(el)) unnamed.push({ element: describe(el), html: el.outerHTML.slice(0, 160) })
  }
  const images = []
  for (const img of document.querySelectorAll('img')) {
    if (!visible(img) || hiddenFromAT(img)) continue
    if (!img.hasAttribute('alt')) images.push({ element: describe(img), src: img.getAttribute('src'), problem: 'no alt attribute' })
  }
  // A chart-sized SVG that isn't hidden needs a name or a text alternative.
  const charts = []
  for (const svg of document.querySelectorAll('svg')) {
    if (!visible(svg) || hiddenFromAT(svg)) continue
    const r = svg.getBoundingClientRect()
    if (r.width < 120 || r.height < 60) continue
    const name = svg.getAttribute('aria-label') || svg.getAttribute('aria-labelledby') || svg.querySelector('title')?.textContent
    charts.push({ element: describe(svg.parentElement || svg), role: svg.getAttribute('role'), name: name || null, width: Math.round(r.width), height: Math.round(r.height) })
  }
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, [role="heading"]')]
    .filter((h) => visible(h) && !hiddenFromAT(h))
    .map((h) => `${h.tagName === 'DIV' || h.tagName === 'SPAN' ? 'h' + (h.getAttribute('aria-level') || '?') : h.tagName.toLowerCase()} ${(h.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 60)}`)
  const landmarks = [...document.querySelectorAll('main, nav, header, footer, aside, [role="main"], [role="navigation"], [role="banner"], [role="dialog"], [role="region"][aria-label]')]
    .filter((el) => visible(el))
    .map((el) => `${el.getAttribute('role') || el.tagName.toLowerCase()}${el.getAttribute('aria-label') ? ` "${el.getAttribute('aria-label')}"` : ''}`)
  return { smallTargets: small, unnamedControls: unnamed, images, charts, headings, landmarks, lang: document.documentElement.lang || null }
}

// Large text: page-wide sideways scroll, clipped or truncated text, text on
// top of other text, and controls covered or out of reach.
// `width` is the phone's width: a mobile browser widens its layout viewport
// to fit a too-wide page, so innerWidth can't tell.
function measureLayout(width) {
  const { textElements, controls, describe } = window.__a11y
  const fixedAncestor = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const p = getComputedStyle(n).position
      if (p === 'fixed' || p === 'sticky') return n
    }
    return null
  }
  const out = { horizontalScroll: null, clipped: [], truncated: [], overlaps: [], covered: [], unreachable: [] }
  const doc = document.documentElement
  const pageWidth = Math.max(doc.scrollWidth, window.innerWidth)
  if (pageWidth > width + 1) {
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 1 && window.__a11y.visible(el))
      .filter((el) => !el.parentElement || el.parentElement.getBoundingClientRect().right <= width + 1)
      .slice(0, 5)
      .map(describe)
    out.horizontalScroll = { pageWidth, phoneWidth: width, widestElements: wide }
  }

  const items = textElements()
  const checked = new Set()
  for (const { el } of items) {
    if (checked.has(el)) continue
    checked.add(el)
    const style = getComputedStyle(el)
    const hides = (v) => v === 'hidden' || v === 'clip'
    const wide = el.scrollWidth > el.clientWidth + 1 && hides(style.overflowX)
    const tall = el.scrollHeight > el.clientHeight + 1 && hides(style.overflowY)
    if (!wide && !tall) continue
    const entry = { element: describe(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }
    if (style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none') out.truncated.push(entry)
    else out.clipped.push(entry)
  }

  // One box per line of text, then pairs from different elements that cross.
  const boxes = []
  for (const { node, el } of items) {
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue
      boxes.push({ el, fixed: fixedAncestor(el), r: { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height } })
    }
  }
  const seenPairs = new Set()
  for (let i = 0; i < boxes.length && out.overlaps.length < 40; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.el === b.el || a.fixed !== b.fixed) continue
      const w = Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x)
      const h = Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y)
      // A few px of line-height overlap between stacked lines is normal.
      if (w <= 2 || h <= Math.min(a.r.h, b.r.h) * 0.3) continue
      const key = `${describe(a.el)}|${describe(b.el)}`
      if (seenPairs.has(key)) continue
      seenPairs.add(key)
      out.overlaps.push({ a: describe(a.el), b: describe(b.el), overlap: `${Math.round(w)}x${Math.round(h)}` })
    }
  }

  const all = controls()
  for (const el of all) {
    const r0 = el.getBoundingClientRect()
    const fixed = fixedAncestor(el)
    if (fixed) {
      // Fixed panels can't be scrolled to, so they must sit on the visible
      // part of the screen (the visual viewport, which a too-wide page shrinks).
      const vv = window.visualViewport ?? { offsetLeft: 0, offsetTop: 0, width: innerWidth, height: innerHeight }
      const visibleRight = Math.min(vv.offsetLeft + vv.width, width)
      if (r0.right <= vv.offsetLeft || r0.left >= visibleRight || r0.bottom <= vv.offsetTop || r0.bottom > vv.offsetTop + vv.height + 1) out.unreachable.push({ element: describe(el), why: 'off screen inside a fixed or sticky panel that does not scroll' })
      continue
    }
    if (r0.right + scrollX <= 0 || r0.left + scrollX >= doc.scrollWidth) {
      out.unreachable.push({ element: describe(el), why: 'outside the page horizontally' })
      continue
    }
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1)
    const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1)
    const hit = document.elementFromPoint(x, y)
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) out.covered.push({ element: describe(el), coveredBy: describe(hit) })
  }
  window.scrollTo(0, 0)
  return out
}

// Animations still running (reduce-motion pass).
function measureMotion() {
  const { describe } = window.__a11y
  return document
    .getAnimations()
    .filter((a) => a.playState === 'running')
    .map((a) => {
      const timing = a.effect?.getComputedTiming?.() ?? {}
      return {
        name: a.animationName || a.transitionProperty || a.constructor.name,
        target: a.effect?.target ? describe(a.effect.target) : null,
        duration: Math.round(Number(timing.duration) || 0),
        iterations: timing.iterations === Infinity ? 'infinite' : timing.iterations,
      }
    })
}

async function measure(page, fn, arg) {
  await page.evaluate(installHelpers)
  return page.evaluate(fn, arg)
}

// --- passes -----------------------------------------------------------------

async function themeIds(browser) {
  const only = argValue('--themes')
  if (only) return only.split(',')
  const { context, page } = await newSeededPage(browser)
  try {
    return await page.evaluate(async () => (await import('/src/lib/theme.ts')).THEMES.map((t) => t.id))
  } finally {
    await context.close()
  }
}

async function defaultPass(browser, theme) {
  const pass = { pass: 'default', theme, setting: `${theme} theme, default text, 390x844`, screens: [] }
  results.passes.push(pass)
  const { context, page } = await newSeededPage(browser, { theme })
  try {
    for (const screen of SCREENS) {
      await step(page, `default/${theme}/${screen.id}`, async () => {
        await screen.open(page)
        await settle(page)
        const entry = { screen: screen.id, screenshot: await shoot(page, `default-${theme}-${screen.id}.png`), contrast: await measure(page, measureContrast) }
        if (theme === 'classic') Object.assign(entry, await measure(page, measureStructure))
        pass.screens.push(entry)
      })
    }
    if (theme === 'classic') {
      await step(page, `default/${theme}/recap`, async () => {
        await logPrAndFinish(page)
        await settle(page)
        pass.screens.push({ screen: 'recap', screenshot: await shoot(page, `default-${theme}-recap.png`), contrast: await measure(page, measureContrast), ...(await measure(page, measureStructure)) })
      })
    }
  } finally {
    await context.close()
  }
}

async function largePass(browser, px) {
  const pct = Math.round((px / 16) * 100)
  const pass = { pass: `large-${pct}`, theme: 'classic', setting: `Classic theme, ${pct}% text (${px}px root and body), 320x700`, screens: [] }
  results.passes.push(pass)
  const { context, page } = await newSeededPage(browser, { viewport: { width: 320, height: 700 } })
  const largeText = (size) => {
    const add = () => {
      const style = document.createElement('style')
      style.textContent = `html, body { font-size: ${size}px !important; }`
      document.head.append(style)
    }
    if (document.head) add()
    else document.addEventListener('DOMContentLoaded', add)
  }
  await context.addInitScript(largeText, px)
  await page.evaluate(largeText, px)
  try {
    for (const screen of SCREENS) {
      await step(page, `large-${pct}/${screen.id}`, async () => {
        // A too-wide screen can push the tab bar out of reach, so each
        // screen starts from a fresh load of Home.
        await page.goto('/')
        await page.getByRole('navigation', { name: 'Primary' }).waitFor()
        await screen.open(page)
        await settle(page)
        const screenshot = await shoot(page, `large-${pct}-${screen.id}.png`)
        pass.screens.push({ screen: screen.id, screenshot, ...(await measure(page, measureLayout, 320)) })
      })
    }
    await step(page, `large-${pct}/recap`, async () => {
      await logPrAndFinish(page)
      await settle(page)
      pass.screens.push({ screen: 'recap', screenshot: await shoot(page, `large-${pct}-recap.png`), ...(await measure(page, measureLayout, 320)) })
    })
  } finally {
    await context.close()
  }
}

async function motionPass(browser) {
  const pass = { pass: 'reduce-motion', theme: 'classic', setting: 'Classic theme, prefers-reduced-motion: reduce, 390x844', screens: [] }
  results.passes.push(pass)
  const { context, page } = await newSeededPage(browser, { reducedMotion: 'reduce' })
  try {
    for (const screen of SCREENS) {
      await step(page, `reduce-motion/${screen.id}`, async () => {
        await screen.open(page)
        await page.waitForTimeout(300)
        pass.screens.push({ screen: screen.id, running: await measure(page, measureMotion) })
      })
    }
    await step(page, 'reduce-motion/pr-celebration', async () => {
      await logPrAndFinish(page, async (id) => {
        pass.screens.push({ screen: id, screenshot: await shoot(page, `reduce-motion-${id}.png`), running: await measure(page, measureMotion) })
      })
      await page.waitForTimeout(300)
      pass.screens.push({ screen: 'recap', running: await measure(page, measureMotion) })
    })
  } finally {
    await context.close()
  }
}

// --- main -------------------------------------------------------------------

const server = await startServer()
const browser = await chromium.launch()
try {
  for (const theme of await themeIds(browser)) await defaultPass(browser, theme)
  await largePass(browser, 24)
  await largePass(browser, 32)
  await motionPass(browser)
} catch (err) {
  results.failures.push({ step: 'run', error: String(err.message).split('\n')[0] })
} finally {
  await browser.close()
  stopServer(server)
}

writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2))

const count = (key) => results.passes.flatMap((p) => p.screens).reduce((n, s) => n + (Array.isArray(s[key]) ? s[key].length : s[key] ? 1 : 0), 0)
console.log(JSON.stringify({
  outDir,
  results: join(outDir, 'results.json'),
  passes: results.passes.map((p) => `${p.pass}${p.pass === 'default' ? `/${p.theme}` : ''}: ${p.screens.length} screens`),
  counts: {
    lowContrast: count('contrast'),
    smallTargets: count('smallTargets'),
    unnamedControls: count('unnamedControls'),
    imagesWithoutAlt: count('images'),
    horizontalScroll: count('horizontalScroll'),
    clipped: count('clipped'),
    truncated: count('truncated'),
    overlaps: count('overlaps'),
    covered: count('covered'),
    unreachable: count('unreachable'),
    runningAnimations: count('running'),
  },
  failures: results.failures,
}, null, 2))
