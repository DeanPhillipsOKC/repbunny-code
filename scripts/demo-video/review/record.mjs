#!/usr/bin/env node
// Records one clip spec on its own, so whoever wrote it can check it:
//   node scripts/demo-video/review/record.mjs scripts/demo-video/review/clips/535.mjs
// Output: logs/demo-video/review/<issue>/segment.mp4, poster.jpg, and clip.json
// (its `silent` field says why, when the clip has captions instead of a voice).
// Starts the local-mode dev server on :5174 for the run when none is up, so a
// lane can call it with nothing else running (#605).

import { chromium } from 'playwright'
import { spawn, execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { recordSegment, BASE_URL, sleep } from './kit.mjs'

const file = process.argv[2]
if (!file) throw new Error('Usage: node scripts/demo-video/review/record.mjs <clip spec>')
const spec = (await import(pathToFileURL(resolve(file)).href)).default

const WIN = process.platform === 'win32'
const up = () => fetch(BASE_URL).then((r) => r.ok, () => false)
let server = null
if (!(await up())) {
  console.log('Starting the local-mode dev server on :5174')
  server = spawn('npx', ['vite', '--port', '5174', '--strictPort'], {
    stdio: 'ignore',
    detached: !WIN,
    shell: WIN,
    env: {
      ...process.env,
      VITE_DATA: 'local',
    },
  })
  for (let i = 0; !(await up()); i++) {
    if (i >= 60) throw new Error('The local-mode dev server did not start on :5174')
    await sleep(1000)
  }
}

const browser = await chromium.launch()
try {
  await recordSegment(browser, spec, join('logs', 'demo-video', 'review', String(spec.issue)))
} finally {
  await browser.close()
  if (server && WIN) execFileSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
  else if (server) process.kill(-server.pid)
}
