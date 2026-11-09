#!/usr/bin/env node
// Second half of the demo pipeline: composites stopwatch.mjs's frames and
// overlays into a 1080x1920 MP4. The app sits as a rounded card on the brand
// background, numbered step captions and a speed badge come and go on the
// recorded marks, an end card fades in last, and the app's real chime is laid
// in at the goal moment (headless recording captures no audio). Also exports
// the "Goal hit" frame as a cover thumbnail.
//
// Needs ffmpeg: FFMPEG if set, else winget's Gyan.FFmpeg install, else PATH.
//
// Usage: node scripts/demo-video/make-video.mjs   (after stopwatch.mjs)

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG
  const pkgs = join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages')
  const gyan = existsSync(pkgs) && readdirSync(pkgs).find((d) => d.startsWith('Gyan.FFmpeg'))
  if (gyan) {
    for (const build of readdirSync(join(pkgs, gyan))) {
      const exe = join(pkgs, gyan, build, 'bin', 'ffmpeg.exe')
      if (existsSync(exe)) return exe
    }
  }
  return 'ffmpeg'
}
const FFMPEG = findFfmpeg()
const OUT = join('logs', 'demo-video', 'out')
const m = JSON.parse(readFileSync(join(OUT, 'marks.json'), 'utf8'))
const L = JSON.parse(readFileSync(join(OUT, 'layout.json'), 'utf8'))

const MAIN = m.end // demo length
const END_CARD = 2.2 // end card length, including the crossfade
const XFADE = 0.4
const TOTAL = MAIN + END_CARD - XFADE
const f = (n) => n.toFixed(3)

// [file, show from, show until] for each timed overlay.
// Each caption runs from its own mark to the next one's.
const starts = [m.cap1 + 0.25, m.cap2, m.goalHit, m.cap4, m.cap5, MAIN]
const steps = starts.slice(0, -1).map((a, i) => [`step-${i + 1}.png`, a, starts[i + 1]])
const S = 4 // input index of the first step caption
const END_IN = S + steps.length
const still = (file, secs) => ['-loop', '1', '-framerate', '30', '-t', f(secs), '-i', join(OUT, file)]

const inputs = [
  '-f', 'concat', '-safe', '0', '-i', join(OUT, 'frames.txt'), // 0
  ...still('bg.png', MAIN), // 1
  ...still('mask.png', MAIN), // 2
  ...still('badge.png', MAIN), // 3
  ...steps.flatMap(([file]) => still(file, MAIN)), // S..
  ...still('end.png', END_CARD), // END_IN
  '-i', join('public', 'rest-chime.mp3'), // END_IN + 1
]

// Fade an overlay in at `a` and out at `b` (alpha only, so it just appears and leaves).
const window = (a, b) => `fade=in:st=${f(a)}:d=0.15:alpha=1,fade=out:st=${f(Math.max(a, b - 0.15))}:d=0.15:alpha=1`
const chimeMs = Math.round(m.chime * 1000)

const graph = [
  `[0:v]fps=30,scale=${L.appW}:${L.appH},format=rgba,trim=duration=${f(MAIN)}[app0]`,
  `[2:v]format=gray[mask]`,
  `[app0][mask]alphamerge[app]`,
  `[1:v]format=rgba[bg]`,
  `[bg][app]overlay=${L.appX}:${L.appY}[c0]`,
  ...steps.map(([, a, b], i) => `[${S + i}:v]format=rgba,${window(a, b)}[s${i}]`),
  ...steps.map((_, i) => `[c${i}][s${i}]overlay=0:${L.appY - 125}[c${i + 1}]`),
  `[3:v]format=rgba,${window(m.ffStart, m.goalHit)}[badge]`,
  `[c${steps.length}][badge]overlay=${L.appX + 24}:${L.appY + 24},fade=in:st=0:d=0.25,setsar=1,fps=30,format=yuv420p[main]`,
  `[${END_IN}:v]setsar=1,fps=30,format=yuv420p[end]`,
  `[main][end]xfade=transition=fade:duration=${XFADE}:offset=${f(MAIN - XFADE)},scale=out_range=tv,format=yuv420p[v]`,
  `[${END_IN + 1}:a]adelay=${chimeMs}|${chimeMs},apad[a]`,
].join(';')

const mp4 = join(OUT, 'stopwatch-demo.mp4')
execFileSync(FFMPEG, [
  '-y', '-loglevel', 'error', ...inputs,
  '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', f(TOTAL),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', '30',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', mp4,
], { stdio: 'inherit' })

execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', f(m.goalHit + 0.4), '-i', mp4,
  '-frames:v', '1', join(OUT, 'thumbnail.png')], { stdio: 'inherit' })
console.log(`${mp4} (${TOTAL.toFixed(1)}s) + thumbnail.png`)
