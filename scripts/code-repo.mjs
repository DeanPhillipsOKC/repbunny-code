// #946: where the code lives. PRs, reviews, rulesets, and Actions runs go to the code repo; issues go
// to the backlog repo (scripts/backlog-repo.mjs). Until the public-code cutover (#937) both are
// DeanPhillipsOKC/repbunny; after it the code is in DeanPhillipsOKC/repbunny-code. Scripts read the
// repo they run in instead of naming one, so the same file works on either side of the cutover.
//
//   node scripts/code-repo.mjs          # prints the code repo, e.g. DeanPhillipsOKC/repbunny-code
//
// Order: CODE_REPO (an override, such as a scratch repo for a dry run), then GITHUB_REPOSITORY
// (set inside GitHub Actions), then the `origin` remote of the checkout, then the old default.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const DEFAULT_CODE_REPO = 'DeanPhillipsOKC/repbunny'
const SHAPE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/

// Pure: `owner/repo` from a remote URL. Handles https, ssh (`git@github.com:o/r.git`), and the cloud
// session proxy (`http://proxy@127.0.0.1:1234/git/o/r`), whose path ends in owner and repo too.
export function repoFromRemote(url) {
  const match = (url ?? '').trim().match(/[/:]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/)
  return match ? `${match[1]}/${match[2]}` : null
}

function originUrl() {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

// The code repo for an environment. Throws on an override that isn't `owner/repo`, so a typo can't
// send PR writes to a path GitHub would read differently.
export function codeRepo(env = process.env, remote = originUrl) {
  const override = (env.CODE_REPO ?? '').trim()
  if (override) {
    if (!SHAPE.test(override)) throw new Error(`CODE_REPO must be owner/repo, got "${override}"`)
    return override
  }
  const actions = (env.GITHUB_REPOSITORY ?? '').trim()
  if (SHAPE.test(actions)) return actions
  return repoFromRemote(remote()) ?? DEFAULT_CODE_REPO
}

export const CODE_REPO = codeRepo()

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(CODE_REPO)
