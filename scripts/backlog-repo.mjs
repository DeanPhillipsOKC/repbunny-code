// #944: where the backlog lives. Issues, labels, and issue comments go to the backlog repo;
// code, PRs, commits, check runs, and Actions stay on the repo the script runs in
// (`{owner}/{repo}` in `gh api` paths). Until the public-code cutover (#937) both are this repo,
// so the default changes nothing.
//
//   node scripts/backlog-repo.mjs          # prints the backlog repo, e.g. DeanPhillipsOKC/repbunny
//
// Set BACKLOG_REPO=<owner>/<repo> to point every issue read and write somewhere else, such as a
// scratch repo for a dry run. See docs/backlog-runner.md > Backlog repo.
import { fileURLToPath } from 'node:url'

export const DEFAULT_BACKLOG_REPO = 'DeanPhillipsOKC/repbunny'

// Pure: the backlog repo for an environment. Throws on a value that isn't `owner/repo`, so a typo
// can't send issue writes to a path GitHub would read differently.
export function backlogRepo(env = process.env) {
  const value = (env.BACKLOG_REPO ?? '').trim() || DEFAULT_BACKLOG_REPO
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(value)) throw new Error(`BACKLOG_REPO must be owner/repo, got "${value}"`)
  return value
}

export const BACKLOG_REPO = backlogRepo()

// `repos/<backlog>` plus a path, for `gh api`: backlogApi('/issues/12/comments').
export const backlogApi = (path = '') => `repos/${BACKLOG_REPO}${path}`

// Pure: a regex source matching an issue reference, `#12` or `<backlog repo>#12`, with the number
// in its last group. Closing lines after the cutover read `Fixes DeanPhillipsOKC/repbunny#12`.
export function issueRefSource(repo = BACKLOG_REPO) {
  return `(?:${repo.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')})?#(\\d+)`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(BACKLOG_REPO)
