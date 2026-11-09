import { execSync } from 'node:child_process'
import { buildFromCount } from './history.mjs'

function run(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

// Cloudflare Pages (and most CI checkouts) clone shallowly, which truncates
// `git rev-list --count`. Unshallow first so the commit count reflects full
// history; if that fails (offline, already complete, etc.) fall through and
// use whatever history is available rather than failing the build.
export function ensureFullHistory(cwd) {
  try {
    if (run('git rev-parse --is-shallow-repository', cwd) === 'true') {
      execSync('git fetch --unshallow --quiet', { cwd, stdio: 'ignore' })
    }
  } catch {
    // best effort — fall back to whatever history is present
  }
}

/**
 * Build identifier derived purely from git, no external tooling: commit
 * count on the current branch plus the short SHA, e.g. "v142+a1b2c3d".
 * Not a semver bump — just a value that visibly changes on every deploy so
 * a stale build is obvious at a glance (docs/backlog.md item 10).
 */
export function getBuildVersion(cwd = process.cwd()) {
  try {
    ensureFullHistory(cwd)
    // Commit count plus the pre-cutover offset (#946), so builds keep counting up across the move.
    const count = buildFromCount(Number(run('git rev-list --count HEAD', cwd)))
    const sha = run('git rev-parse --short HEAD', cwd)
    // Compare tracked-file content only, ignoring the executable-bit-only
    // diffs that CI checkouts (Cloudflare's included) can introduce — those
    // aren't a developer's uncommitted work, so they shouldn't read as dirty.
    // `diff --quiet` exits 1 on any difference, hence the try/catch.
    let dirty = false
    try {
      execSync('git -c core.fileMode=false diff --quiet HEAD --', { cwd, stdio: 'ignore' })
    } catch {
      dirty = true
    }
    return `v${count}+${sha}${dirty ? '-dirty' : ''}`
  } catch {
    return 'dev'
  }
}
