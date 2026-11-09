// Issue #219: the next store/vX.Y.Z tag for the Cut release workflow
// (.github/workflows/cut-release.yml). Reads the existing store/v* tags,
// applies a bump (or checks an explicit version), and refuses when HEAD
// already has a store tag.
//
//   node scripts/next-store-version.mjs --bump patch
//   node scripts/next-store-version.mjs --version 1.2.0
//
// Prints the new tag (store/vX.Y.Z), or an error and exits 1. See
// docs/architecture.md > Native apps > Releasing.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { withPreCutoverTags } from './lib/history.mjs'

export const BUMPS = ['patch', 'minor', 'major']
const TAG = /^store\/v(\d+)\.(\d+)\.(\d+)$/

function parse(tag) {
  const m = TAG.exec(tag)
  return m ? m.slice(1).map(Number) : null
}

function compare(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

// The highest store/vX.Y.Z tag in `tags`, or null when there are none.
export function latestTag(tags) {
  const valid = tags.filter((t) => parse(t))
  return valid.sort((a, b) => compare(parse(a), parse(b))).at(-1) ?? null
}

// The tag to cut. `headTags` are the tags already on the commit being
// released. Throws with a message for the workflow log when it can't.
export function nextTag({ tags, headTags = [], bump = 'patch', version = '' }) {
  const onHead = headTags.find((t) => parse(t))
  if (onHead) throw new Error(`This commit is already released as ${onHead}.`)
  const latest = latestTag(tags)
  const base = latest ? parse(latest) : [1, 0, 0]
  let next
  if (version) {
    const tag = `store/v${version.trim().replace(/^v/, '')}`
    next = parse(tag)
    if (!next) throw new Error(`Version ${version} isn't MAJOR.MINOR.PATCH.`)
    if (latest && compare(next, base) <= 0) {
      throw new Error(`Version ${version} isn't above the latest release, ${latest}.`)
    }
  } else {
    if (!BUMPS.includes(bump)) throw new Error(`Bump must be patch, minor, or major, not ${bump}.`)
    if (!latest) next = base
    else if (bump === 'major') next = [base[0] + 1, 0, 0]
    else if (bump === 'minor') next = [base[0], base[1] + 1, 0]
    else next = [base[0], base[1], base[2] + 1]
  }
  return `store/v${next.join('.')}`
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const list = (text) => text.split('\n').filter(Boolean)
  try {
    console.log(
      nextTag({
        tags: withPreCutoverTags(list(git('tag', '--list', 'store/v*'))),
        headTags: list(git('tag', '--points-at', 'HEAD', '--list', 'store/v*')),
        bump: arg('bump') ?? 'patch',
        version: arg('version') ?? '',
      }),
    )
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2))
