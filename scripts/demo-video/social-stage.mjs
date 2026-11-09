// The 1080x1920 social stage shared by the launch intros (social-intro.mjs)
// and the progressive overload video (overload-video.mjs): the recorded app
// in a rounded card on the brand background (cards/social-stage.html), each
// spoken line as a caption above it inside TikTok and Reels' safe zone, the
// gym music under the voice, and the Google Play outro card at the end.

import { execFileSync } from 'node:child_process'
import { statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderCard, serveRepo } from './cards.mjs'
import { AUDIO, FFMPEG, FFPROBE, cardPiece, stitch } from './review/kit.mjs'

const MUSIC_LEVEL = 0.08
const TITLE_SECONDS = 1.8

// Screenshots one layer of cards/social-stage.html.
export async function stageLayer(browser, params, out) {
  const size = params.layer === 'mask' ? { width: 660, height: 1320 } : { width: 1080, height: 1920 }
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 })
  await serveRepo(context)
  const page = await context.newPage()
  await page.goto(`http://card.local/scripts/demo-video/cards/social-stage.html?${new URLSearchParams(params)}`)
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})))
  })
  const stage = await page.evaluate(() => window.STAGE)
  await page.screenshot({ path: out, omitBackground: !['bg', 'mask'].includes(params.layer) })
  await context.close()
  return stage
}

// Composites a recordSegment clip onto the stage and writes `<out>.mp4`,
// `<out>.vtt` (the spoken lines), and `<out>.jpg` (the frame at `coverAt`
// seconds, for the cover image). `title` ({ a, b }) opens on a two-line title
// in the caption's place while the first line starts, instead of a title card
// before it (no dead air), and then shows the small RepBunny mark above the
// captions. `follow: false` drops the outro's "Follow along on TikTok" line.
export async function composeCut(browser, clip, dir, out, { title, follow = true, coverAt }) {
  const { card } = await stageLayer(browser, { layer: 'bg', ...(title ? { name: '0' } : {}) }, join(dir, 'stage-bg.png'))
  await stageLayer(browser, { layer: 'mask' }, join(dir, 'stage-mask.png'))
  // A caption per line, up from its line until the next one starts.
  const caps = []
  for (const [i, m] of clip.marks.entries()) {
    const file = join(dir, `cap-${i}.png`)
    await stageLayer(browser, { layer: 'cap', text: m.text }, file)
    caps.push({ file, start: m.at, end: clip.marks[i + 1]?.at ?? Math.min(clip.duration, m.at + m.duration + 0.8) })
  }
  if (title) {
    const titleFile = join(dir, 'title.png')
    const name = join(dir, 'name.png')
    await stageLayer(browser, { layer: 'title', ...title }, titleFile)
    await stageLayer(browser, { layer: 'name' }, name)
    caps[0].start = TITLE_SECONDS
    caps.unshift({ file: titleFile, start: 0, end: TITLE_SECONDS }, { file: name, start: TITLE_SECONDS, end: clip.duration + 1 })
  }

  const total = clip.duration
  const f = (n) => n.toFixed(3)
  const C = 3 // input index of the first caption
  const music = C + caps.length
  const inputs = [
    '-loop', '1', '-framerate', '30', '-t', f(total), '-i', join(dir, 'stage-bg.png'),
    '-i', clip.mp4,
    '-loop', '1', '-framerate', '30', '-t', f(total), '-i', join(dir, 'stage-mask.png'),
    ...caps.flatMap((c) => ['-loop', '1', '-framerate', '30', '-t', f(total), '-i', c.file]),
    '-stream_loop', '-1', '-i', join(AUDIO, 'bumper-gym-hype.mp3'),
  ]
  const graph = [
    `[1:v]fps=30,format=rgba[app0]`,
    `[2:v]format=gray[mask]`,
    `[app0][mask]alphamerge[app]`,
    `[0:v]format=rgba[bg]`,
    `[bg][app]overlay=${card.x}:${card.y}:shortest=1[c0]`,
    ...caps.map((c, i) => `[${C + i}:v]format=rgba,fade=t=in:st=${f(c.start)}:d=0.15:alpha=1,fade=t=out:st=${f(Math.max(c.start, c.end - 0.15))}:d=0.15:alpha=1[k${i}]`),
    ...caps.map((_, i) => `[c${i}][k${i}]overlay=0:0[c${i + 1}]`),
    `[c${caps.length}]format=yuv420p,setsar=1[v]`,
    `[${music}:a]aresample=44100,atrim=0:${f(total)},afade=t=in:d=0.5,afade=t=out:st=${f(total - 1)}:d=1,volume=${MUSIC_LEVEL}[m]`,
    `[1:a][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`,
  ].join(';')
  const main = join(dir, 'main.mp4')
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', f(total),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', main,
  ], { stdio: 'inherit' })

  // The outro card is drawn at 480x1040; scaled to full height on black, its own background.
  const outro = await renderCard(browser, 'outro', ['Get it on', 'Google Play'], null, join(dir, 'cards', 'outro'), follow ? {} : { follow: '0' })
  const small = cardPiece(outro, join(dir, 'outro-small.mp4'), { music: 'end' })
  const end = join(dir, 'outro.mp4')
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-i', small, '-vf', 'scale=-2:1920:flags=lanczos,pad=1080:1920:(ow-iw)/2:0:black,setsar=1',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-r', '30', '-c:a', 'copy', end,
  ], { stdio: 'inherit' })

  const video = `${out}.mp4`
  stitch([main, end], video, { crf: 20 })

  const ts = (s) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23)
  const cues = clip.marks.flatMap((m, i) => [`${i + 1}`, `${ts(m.at)} --> ${ts(m.at + m.duration)}`, m.text, ''])
  writeFileSync(`${out}.vtt`, ['WEBVTT', '', ...cues].join('\n'))
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', f(coverAt), '-i', video, '-frames:v', '1', '-q:v', '2', `${out}.jpg`])

  const length = Number(String(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video])).trim())
  console.log(`${video}: ${length.toFixed(1)}s, ${(statSync(video).size / 1024).toFixed(0)} KB`)
}
