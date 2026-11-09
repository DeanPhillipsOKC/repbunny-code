// Attaches screenshots to a GitHub issue as tappable links (docs/backlog.md > Screenshots in
// issues). Images go on the `claude/issue-assets` branch, which holds nothing else and never
// merges into main, under `<issue>/<name>`. The GitHub app doesn't show private-repo images
// inline, so the owner taps the link to open one (owner decision 2026-10-10).
//
//   node scripts/issue-shot.mjs 282 shots/before.png shots/after.png
//
// Prints one Markdown line per image, `[Screenshot: <name>](<url>)`, to paste into the issue
// body or comment. Builds the commit with git plumbing on top of the branch's latest commit, so
// the working tree and the current branch are never touched, and retries if another run pushed
// first. Keep images small: phone width, PNG or JPEG/WebP, ideally under 200 KB. A sprint
// review clip (#605) goes up the same way as an MP4 (up to 10 MB) and prints as `[Clip: ...]`.
// The whole sprint review video (#606) goes in a `review-<X.Y.Z>` folder instead of an issue's,
// up to 25 MB.
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import { statSync } from 'node:fs'

const BRANCH = 'claude/issue-assets'
const MAX_BYTES = 2 * 1024 * 1024
const MAX_VIDEO_BYTES = 10 * 1024 * 1024
const MAX_REVIEW_BYTES = 25 * 1024 * 1024
const isVideo = (f) => /\.mp4$/i.test(f)

const [issue, ...files] = process.argv.slice(2)
const review = /^review-\d+\.\d+\.\d+$/.test(issue ?? '')
if (!(/^\d+$/.test(issue ?? '') || review) || files.length === 0) {
  console.error('Usage: node scripts/issue-shot.mjs <issue number | review-X.Y.Z> <image or mp4> [...]')
  process.exit(2)
}
for (const f of files) {
  if (isVideo(f)) {
    const max = review ? MAX_REVIEW_BYTES : MAX_VIDEO_BYTES
    if (statSync(f).size > max) throw new Error(`${f}: over ${max / 1024 / 1024} MB; shorten the clip.`)
    continue
  }
  if (!/\.(png|jpe?g|webp|gif)$/i.test(f)) throw new Error(`${f}: not an image (png, jpg, webp, gif) or an mp4.`)
  if (statSync(f).size > MAX_BYTES) throw new Error(`${f}: over 2 MB; shrink it first.`)
}

const git = (args, input) => execFileSync('git', args, { encoding: 'utf8', input }).trim()

// owner/repo from origin, for the links.
const origin = git(['remote', 'get-url', 'origin'])
const repo = origin.match(/github\.com[:/](.+?)(\.git)?$/)?.[1]
if (!repo) throw new Error(`Can't tell the GitHub repo from origin (${origin}).`)

// Blobs for the new images, named by file name (made safe for a URL).
const added = files.map((f) => ({ name: basename(f).replace(/[^\w.-]+/g, '-'), blob: git(['hash-object', '-w', f]), video: isVideo(f) }))

function tryPush() {
  let parent = null
  try {
    git(['fetch', '-q', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`])
    parent = git(['rev-parse', `refs/remotes/origin/${BRANCH}`])
  } catch {
    // The branch doesn't exist yet: this commit starts it.
  }
  const root = new Map() // top-level folder name -> tree line
  if (parent) {
    for (const line of git(['ls-tree', parent]).split('\n').filter(Boolean)) root.set(line.split('\t')[1], line)
  }
  // This issue's folder: what's there already, plus the new images (same name replaces).
  const folder = new Map()
  if (root.has(issue)) {
    for (const line of git(['ls-tree', `${parent}:${issue}`]).split('\n').filter(Boolean)) folder.set(line.split('\t')[1], line)
  }
  for (const a of added) folder.set(a.name, `100644 blob ${a.blob}\t${a.name}`)
  const sub = git(['mktree'], [...folder.values()].join('\n') + '\n')
  root.set(issue, `040000 tree ${sub}\t${issue}`)
  const tree = git(['mktree'], [...root.values()].join('\n') + '\n')
  const commit = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', review ? `Sprint review video, ${issue}` : `Screenshots for #${issue}`])
  git(['push', '-q', 'origin', `${commit}:refs/heads/${BRANCH}`])
}

for (let attempt = 1; ; attempt++) {
  try {
    tryPush()
    break
  } catch (error) {
    if (attempt >= 3) throw error
  }
}

for (const a of added) {
  console.log(`[${a.video ? 'Clip' : 'Screenshot'}: ${a.name}](https://github.com/${repo}/blob/${BRANCH}/${issue}/${a.name})`)
}
