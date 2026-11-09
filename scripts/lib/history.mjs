// #946: the code moved to this repo as one snapshot commit with no history, so `git rev-list --count`
// restarted at 1 and the old store/v* tags stayed behind in the private backlog repo. Everything that
// turns git history into a build number or a store release goes through here, so builds keep counting
// up from where the old repo stopped and releases from before the move still count.
//
// - Build numbers: a commit's build is its commit count plus BUILD_OFFSET. The snapshot commit (count
//   1) is build 969, the old repo's last build, since it has the same files.
// - Pre-cutover facts in pre-cutover.json, generated once and never edited: each release note's real
//   date and build (the snapshot commit "added" them all), and each old store tag's build.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PRE = JSON.parse(readFileSync(new URL('./pre-cutover.json', import.meta.url), 'utf8'))

export const SNAPSHOT_COMMIT = PRE.snapshotCommit
// The snapshot commit's count is 1, and it has the old repo's last build's files.
export const BUILD_OFFSET = PRE.sourceBuild - 1
// release-notes/<file> -> { date, build } for the notes the snapshot commit brought over.
export const PRE_CUTOVER_NOTES = PRE.notes
// store/vX.Y.Z -> build, for the store releases cut before the move. The tags aren't in this repo.
export const PRE_CUTOVER_STORE_TAGS = PRE.storeTags

const STORE_TAG = /^store\/v\d+\.\d+\.\d+$/

// Pure: the build number for a commit count.
export const buildFromCount = (count) => count + BUILD_OFFSET

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).trim()
}

// The build number of a commit (or any rev) in this checkout.
export function commitBuild(rev = 'HEAD', cwd = process.cwd()) {
  return buildFromCount(Number(git(cwd, 'rev-list', '--count', rev)))
}

// Pure: the store tags git has plus the pre-cutover ones, deduplicated.
export function withPreCutoverTags(gitTags) {
  return [...new Set([...gitTags.filter((t) => STORE_TAG.test(t)), ...Object.keys(PRE_CUTOVER_STORE_TAGS)])]
}

// Every store tag, this repo's and the pre-cutover ones.
export function storeTags(cwd = process.cwd()) {
  return withPreCutoverTags(git(cwd, 'tag', '--list', 'store/v*').split('\n').filter(Boolean))
}

// Pure: whether a store tag is one from before the move (so git doesn't have it).
export const isPreCutoverTag = (tag) => Object.hasOwn(PRE_CUTOVER_STORE_TAGS, tag)

// The build a store tag was cut at.
export function tagBuild(tag, cwd = process.cwd()) {
  return isPreCutoverTag(tag) ? PRE_CUTOVER_STORE_TAGS[tag] : commitBuild(tag, cwd)
}

// A git range covering the commits after `tag` up to `to`. A pre-cutover tag's commits aren't here,
// so its range starts at the snapshot commit (whose own message names no issue).
export function sinceTagRange(tag, to = 'HEAD') {
  return isPreCutoverTag(tag) ? `${SNAPSHOT_COMMIT}..${to}` : `${tag}..${to}`
}
