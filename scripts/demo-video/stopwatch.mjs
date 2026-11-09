#!/usr/bin/env node
// Records the frames and overlays for a short vertical social clip of the
// timed-set stopwatch (#85). First half of the demo-video pipeline; see
// docs/architecture.md#demo-videos-scriptsdemo-video. Not part of any gate.
// It makes no assertions, it only captures state.
//
// Runs against the local-mode dev server (VITE_DATA=local on :5174), so every
// run starts from an empty on-device database with no test accounts and no
// "E2E ..." names on screen.
//
// Output (logs/demo-video/out/, gitignored):
//   frames/, frames.txt  full-res screenshots + an ffconcat list with timings
//   *.png                background, step captions, speed badge, mask, end card
//   marks.json           seconds into the clip of each step
//   layout.json          where the app card sits in the 1080x1920 frame
// Then make-video.mjs composites them.
//
// Usage: node scripts/demo-video/stopwatch.mjs

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = 'http://localhost:5174'
const OUT = join('logs', 'demo-video', 'out')
mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) rmSync(join(OUT, f), { recursive: true, force: true })

const VIEW = { width: 360, height: 560 } // x3 = 1080x1680, plus a 240px caption band = 1080x1920
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: VIEW,
  deviceScaleFactor: 3,
  colorScheme: 'dark',
})
const page = await context.newPage()
const t0 = Date.now()

// Headless Chrome's recordVideo and screencast both capture CSS pixels, so a
// 3x phone came out 360px wide. Screenshots do honor deviceScaleFactor, so
// the on-camera part is captured as back-to-back full-res screenshots, each
// stamped with wall-clock time, and stitched into a video afterwards.
const frames = []
const cdp = await context.newCDPSession(page)
let capturing = false
let captureDone
async function startCapture() {
  capturing = true
  captureDone = (async () => {
    while (capturing) {
      const t = Date.now() / 1000
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 })
      frames.push({ t, data })
    }
  })()
}
async function stopCapture() {
  capturing = false
  await captureDone
}
const marks = {}
const mark = (name) => (marks[name] = (Date.now() - t0) / 1000)

// A pink ripple wherever a "finger" taps, so viewers can follow along.
// Silent AudioContext stand-in that records when the chime would play.
await page.addInitScript(() => {
  window.__chimeAt = []
  class FakeAudioContext {
    state = 'running'
    currentTime = 0
    destination = {}
    decodeAudioData() { return Promise.resolve({}) }
    createBufferSource() {
      return { buffer: null, connect() {}, start: () => window.__chimeAt.push(performance.timeOrigin + performance.now()) }
    }
    createGain() { return { gain: { value: 1, setValueAtTime() {} }, connect() {} } }
    resume() { return Promise.resolve() }
  }
  window.AudioContext = FakeAudioContext
  window.webkitAudioContext = FakeAudioContext

  addEventListener('pointerdown', (e) => {
    if (!window.__showTaps) return
    const dot = document.createElement('div')
    dot.style.cssText = `position:fixed;left:${e.clientX - 22}px;top:${e.clientY - 22}px;width:44px;height:44px;
      border-radius:50%;background:rgba(242,135,156,.45);border:2px solid #f2879c;pointer-events:none;z-index:2147483647;
      transition:transform .45s ease-out,opacity .45s ease-out;`
    document.documentElement.appendChild(dot)
    requestAnimationFrame(() => { dot.style.transform = 'scale(1.6)'; dot.style.opacity = '0' })
    setTimeout(() => dot.remove(), 500)
  }, true)
})
await page.clock.install()

// ---- Off-camera setup (trimmed out of the final clip) ----
await page.goto(BASE_URL)
await page.getByRole('dialog', { name: 'Which unit do you lift in?' }).getByRole('button', { name: 'lb' }).click()
await page.getByRole('button', { name: 'Add your first exercise' }).click()
await page.getByRole('searchbox', { name: 'Search the library' }).fill('Plank')
await page.getByRole('button', { name: 'Add Plank', exact: true }).click()
await page.locator('.library-row', { hasText: 'Plank' }).getByText('Added', { exact: true }).first().waitFor()
await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home', exact: true }).click()
await page.getByRole('button', { name: 'Freeform', exact: true }).click()
await page.getByRole('button', { name: 'Add exercise' }).click()
const sheet = page.getByRole('dialog', { name: 'Add exercise' })
await sheet.getByPlaceholder('Search exercises').fill('Plank')
await sheet.getByRole('button', { name: 'Plank', exact: true }).click()
await sheet.getByRole('button', { name: 'Done', exact: true }).click()
await sheet.waitFor({ state: 'detached' })
const time = page.getByLabel('Time, minutes and seconds')
await time.waitFor()
await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
await sleep(800)

// ---- On camera ----
await page.evaluate(() => (window.__showTaps = true))
await startCapture()
// Each step's caption (cap1..cap5 in marks) goes up about a second before
// its tap, so a viewer reads what's about to happen and then watches it.
const LEAD = 1100
mark('cap1')
await sleep(300 + LEAD)
await time.click()
await sleep(400)
await time.pressSequentially('30', { delay: 320 })
await page.evaluate(() => document.activeElement?.blur())
await sleep(900)
mark('cap2')
await sleep(LEAD)
await page.getByRole('button', { name: 'Start timer' }).click()
const overlay = page.getByRole('dialog', { name: /^Timing / })
await overlay.waitFor()
await sleep(700)

mark('ffStart')
// Fast-forward the 30s goal; the badge shows the real speed-up afterwards.
for (let i = 0; i < 100; i++) {
  await page.clock.runFor(400)
  await sleep(50)
  if (await overlay.getByText('Goal hit').isVisible()) break
}
mark('goalHit') // cap3 starts here: the chime is the step
await sleep(2200) // let "Goal hit" land, at real speed
mark('cap4')
await sleep(LEAD)
await overlay.getByRole('button', { name: 'Stop' }).click()
await overlay.waitFor({ state: 'detached' })
await sleep(1300)
mark('cap5')
await sleep(LEAD)
await page.getByRole('button', { name: 'Add set' }).click()
await sleep(2000)
mark('end')
await stopCapture()

// The chime fires on the tick that shows Goal hit, which the loop above polls for.
marks.chime = marks.goalHit

// ---- Overlays, drawn on the app's origin so its fonts load ----
// Layout (1080x1920) keeps everything that matters inside TikTok/Reels'
// safe zone: clear of the top ~140px tabs, the right ~120px button rail,
// and the bottom ~350px caption area (only the app's own nav sits there).
const LAYOUT = { appX: 140, appY: 400, appW: 800, appH: 1244 }
writeFileSync(join(OUT, 'layout.json'), JSON.stringify(LAYOUT))

const STEPS = ['Set your goal', 'Tap start', 'Chime at your goal', 'Tap stop to save the time', 'Log the set']
const speed = Math.round(30 / (marks.goalHit - marks.ffStart))
const ovCtx = await browser.newContext({ viewport: { width: 1080, height: 1920 } })
const ov = await ovCtx.newPage()
await ov.goto(BASE_URL)
const BG = `background:radial-gradient(120% 70% at 50% 0%, #2c1f36 0%, #17111c 60%), #17111c;`
async function render(file, w, h, html, transparent = true) {
  await ov.setViewportSize({ width: w, height: h })
  await ov.evaluate(({ html, w, h }) => {
    document.head.insertAdjacentHTML('beforeend', '<style>html,body{background:transparent!important;margin:0}</style>')
    document.body.innerHTML = `<div style="width:${w}px;height:${h}px;position:relative;overflow:hidden">${html}</div>`
  }, { html, w, h })
  await ov.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]))
  await ov.screenshot({ path: join(OUT, file), omitBackground: transparent })
}
const title = `font-family:'Baloo 2',sans-serif;font-weight:800;color:#f5edf2;`
const body = `font-family:Manrope,sans-serif;color:#f5edf2;`

await render('bg.png', 1080, 1920, `<div style="position:absolute;inset:0;${BG}"></div>
  <div style="position:absolute;left:${LAYOUT.appX - 3}px;top:${LAYOUT.appY - 3}px;width:${LAYOUT.appW + 6}px;height:${LAYOUT.appH + 6}px;
    border-radius:51px;background:rgba(242,135,156,.35);box-shadow:0 30px 90px rgba(242,135,156,.18)"></div>
  <div style="position:absolute;top:160px;width:100%;text-align:center;${title}font-size:74px;line-height:1">Timed sets, <span style="color:#f2879c">hands free</span></div>`, false)
for (const [i, text] of STEPS.entries()) {
  await render(`step-${i + 1}.png`, 1080, 110, `<div style="display:flex;justify-content:center;align-items:center;height:110px">
    <div style="display:flex;align-items:center;gap:18px;padding:14px 34px 14px 16px;border-radius:999px;background:#241a2c;border:2px solid #3a2a45">
      <span style="width:56px;height:56px;border-radius:50%;background:#f2879c;color:#17111c;display:grid;place-items:center;${title}font-size:36px;line-height:1">${i + 1}</span>
      <span style="${body}font-weight:700;font-size:42px">${text}</span></div></div>`)
}
await render('badge.png', 220, 90, `<div style="display:flex;align-items:center;justify-content:center;gap:10px;margin:10px;height:70px;border-radius:999px;
  background:#f2c069;color:#17111c;${title}font-size:44px;line-height:1">
  <svg width="38" height="30" viewBox="0 0 38 30"><path d="M2 2l16 13L2 28zM20 2l16 13-16 13z" fill="#17111c"/></svg>${speed}x</div>`)
await render('mask.png', LAYOUT.appW, LAYOUT.appH, `<div style="position:absolute;inset:0;background:#000"></div>
  <div style="position:absolute;inset:0;border-radius:48px;background:#fff"></div>`, false)
await render('end.png', 1080, 1920, `<div style="position:absolute;inset:0;${BG}display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:180px">
  <img src="/icon-512.png" style="width:340px;height:340px;border-radius:76px;box-shadow:0 30px 90px rgba(242,135,156,.25)">
  <div style="${title}font-size:120px;line-height:1;margin-top:56px">RepBunny</div>
  <div style="${body}font-size:44px;opacity:.8;margin-top:22px">Strength tracking, minus the fuss</div>
  <div style="${body}font-weight:700;font-size:40px;margin-top:70px;padding:20px 44px;border-radius:999px;background:#f2879c;color:#17111c">Coming soon to iPhone</div></div>`, false)
await ovCtx.close()

await context.close()
await browser.close()

// Frames + an ffconcat list with each frame's on-screen duration.
mkdirSync(join(OUT, 'frames'))
let list = 'ffconcat version 1.0\n'
frames.forEach((f, i) => {
  const name = String(i).padStart(5, '0') + '.jpg'
  writeFileSync(join(OUT, 'frames', name), Buffer.from(f.data, 'base64'))
  const next = frames[i + 1]?.t ?? f.t + 0.5
  list += `file 'frames/${name}'\nduration ${(next - f.t).toFixed(4)}\n`
})
writeFileSync(join(OUT, 'frames.txt'), list)
// Marks are relative to the first frame, i.e. the start of the stitched video.
const firstFrame = frames[0].t - t0 / 1000
for (const k of Object.keys(marks)) marks[k] = +(marks[k] - firstFrame).toFixed(3)
writeFileSync(join(OUT, 'marks.json'), JSON.stringify(marks, null, 2))
console.log(JSON.stringify(marks))
