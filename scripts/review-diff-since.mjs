// Issue #543: after /review-pr approves a PR and main moved, next-item merges origin/main into the
// PR branch. A conflict there is only "new code" worth a second Opus review if the PR's own diff
// changed. This compares the PR's own diff (against main) at the reviewed sha with its own diff at
// HEAD and prints the paths whose own changes differ. src/lib/releaseNotes.ts counts as changed
// only if the PR's own entry lines changed; a different `build` number or date header is ignored.
// Since #558 each note is its own file under release-notes/, so only a PR from before that split
// can still conflict in src/lib/releaseNotes.ts.
//
//   node scripts/review-diff-since.mjs <reviewed sha> [conflicted path ...]
//
// Prints {"changed": [...], "newCode": bool}. `newCode` is true when any
// path other than src/lib/releaseNotes.ts differs, or the release-notes entry itself differs.
// Pass the paths the merge conflicted in (`git diff --name-only --diff-filter=U`, read before the
// merge commit): any other than src/lib/releaseNotes.ts is new code even if the PR's own diff
// matches, since a hand-resolved conflict there needs a second look.
// Run it after `git merge origin/main`, with origin/main fetched.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const NOTES = 'src/lib/releaseNotes.ts'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 })

// Added/removed content lines of a diff, per path (line numbers and index hashes dropped).
export function ownLines(diff) {
  const byPath = new Map()
  let path = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      path = line.slice(line.lastIndexOf(' b/') + 3)
      byPath.set(path, [])
    } else if (path && /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line)) {
      byPath.get(path).push(line)
    }
  }
  return byPath
}

// The release-notes file is shared by every PR: ignore the lines that only frame an entry.
// Removed lines count too: a merge that drops another PR's entry shows up as a `-` line.
const NOTES_FRAME = /^[+-]\s*(build:|date:|items: \[|\{|\},?|\],?)/
export function notesEntry(lines) {
  return lines.filter((l) => !NOTES_FRAME.test(l))
}

export function changedPaths(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()])
  const changed = []
  for (const p of [...paths].sort()) {
    let a = before.get(p) ?? []
    let b = after.get(p) ?? []
    if (p === NOTES) {
      a = notesEntry(a)
      b = notesEntry(b)
    }
    if (a.join('\n') !== b.join('\n')) changed.push(p)
  }
  return changed
}

export function ownDiff(base, tip) {
  const mergeBase = git('merge-base', base, tip).trim()
  return ownLines(git('diff', '--no-color', '-U0', mergeBase, tip))
}

function main() {
  const [sha, ...conflicted] = process.argv.slice(2)
  if (!sha) {
    console.error('usage: node scripts/review-diff-since.mjs <reviewed sha> [conflicted path ...]')
    process.exit(2)
  }
  const changed = changedPaths(ownDiff('origin/main', sha), ownDiff('origin/main', 'HEAD'))
  for (const p of conflicted) if (p !== NOTES && !changed.includes(p)) changed.push(p)
  changed.sort()
  const newCode = changed.length > 0
  console.log(JSON.stringify({ changed, newCode }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
