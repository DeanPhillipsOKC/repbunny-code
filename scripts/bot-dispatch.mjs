// Issue #679: how sessions act as the repo's bots. Cloud sessions reach GitHub through a proxy
// that swaps any token for the session's own (the owner's), so the bot actions run in two
// workflows that mint an app token themselves. This script starts one and waits for its result.
//
//   node scripts/bot-dispatch.mjs open-pr --head <branch> --title <title> --body-file <file>
//     -> opens the PR as repbunny-builder[bot]; prints the PR number
//   node scripts/bot-dispatch.mjs post-review --pr <N> --sha <40-char sha> --event APPROVE|REQUEST_CHANGES|COMMENT --body-file <file>
//       [--auto-merge --merge-subject <subject> --merge-body-file <file>]
//     -> posts the review as repbunny-reviewer[bot], and with --auto-merge turns on squash
//        auto-merge pinned to that sha (#681), or squash-merges it at that sha when it's already
//        mergeable (#1020); prints the review id. With --auto-merge it also waits for the PR to
//        show auto-merge on or merged, and exits 5 if neither happens (the review is posted, but
//        nothing will merge the PR on its own).
//   node scripts/bot-dispatch.mjs support-evidence --issue <N> --date <YYYY-MM-DD> --version <v|unknown>
//       --platform Android|iOS|Web|unknown --codes <a,b|none> --gmail <thread link> [--notify]
//     -> posts triage's "seen again" note on an open issue as repbunny-builder[bot] (#695); the
//        workflow builds it from these checked fields only (scripts/support-evidence.mjs), so no
//        free text from an email can ride in. Prints the comment id.
//
// Exit 5 (post-review --auto-merge only): the review is posted but auto-merge isn't on and the PR
// didn't merge.
// Exit 0: done. Exit 3: the bot path isn't available (a read or the dispatch failed, or no result
// within the wait); the caller checks the bot didn't act after all, then falls back to acting as
// the owner, as before #679, and says so in its report. Exit 2: bad arguments. A failed read while
// waiting is retried, so there's no other exit code (#760).
// support-evidence is the exception to the fall-back: its caller never acts as the owner, because a
// note by hand is the free-text path that command closes. A field the validator refuses exits 2
// right away with the reason (nothing is dispatched); on exit 3 the caller posts nothing and retries
// on its next run.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { BACKLOG_REPO } from './backlog-repo.mjs'
import { buildEvidence } from './support-evidence.mjs'

// The code repo, where PRs and reviews live. support-evidence writes an issue comment, so it runs in
// the backlog repo instead (#944); until the cutover they are the same repo.
const REPO = 'DeanPhillipsOKC/repbunny'
// workflow_dispatch inputs share one 65,535-character payload; each text input is capped so the
// review body plus a squash commit body still fit with the rest.
const MAX_BODY = 30000
const WAIT_MS = 4 * 60 * 1000
const POLL_MS = 10 * 1000

const BOTS = {
  'open-pr': { workflow: 'open-pr.yml', login: 'repbunny-builder[bot]' },
  'post-review': { workflow: 'post-review.yml', login: 'repbunny-reviewer[bot]' },
  'support-evidence': { workflow: 'support-evidence.yml', login: 'repbunny-builder[bot]' },
}

function usage(message) {
  console.error(`bot-dispatch: ${message}`)
  process.exit(2)
}

function arg(argv, flag) {
  const at = argv.indexOf(flag)
  return at === -1 ? null : argv[at + 1] ?? null
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

const ghJson = (path) => JSON.parse(gh(['api', path]))

// A read before the dispatch that fails means the bot path can't be trusted: exit 3, nothing sent.
function readBefore(read, what) {
  try {
    return read()
  } catch (error) {
    unavailable(`reading ${what} failed: ${String(error.stderr || error.message).trim().slice(0, 300)}`)
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function body(argv, flag = '--body-file') {
  const file = arg(argv, flag)
  if (!file) usage(`${flag} is required`)
  const text = readFileSync(file, 'utf8')
  if (text.length <= MAX_BODY) return text
  return `${text.slice(0, MAX_BODY)}\n\n_(Truncated by bot-dispatch: the full text was over ${MAX_BODY} characters.)_`
}

function unavailable(why) {
  console.error(`bot-dispatch: bot path unavailable, fall back to the owner: ${why}`)
  process.exit(3)
}

function dispatch(workflow, inputs, repo = REPO) {
  const fields = Object.entries(inputs).flatMap(([k, v]) => ['-f', `inputs[${k}]=${v}`])
  try {
    gh(['api', '-X', 'POST', `repos/${repo}/actions/workflows/${workflow}/dispatches`, '-f', 'ref=main', ...fields])
  } catch (error) {
    unavailable(`dispatching ${workflow} failed: ${String(error.stderr || error.message).trim().slice(0, 300)}`)
  }
}

async function waitFor(find, what) {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    await sleep(POLL_MS)
    // A failed read mid-poll (a proxy reset, a 5xx) is retried until the deadline, never fatal:
    // the workflow may already be acting (#760).
    let found
    try {
      found = find()
    } catch (error) {
      console.error(`bot-dispatch: poll failed, retrying: ${String(error.stderr || error.message).trim().slice(0, 200)}`)
    }
    if (found) return found
  }
  unavailable(`no ${what} within ${WAIT_MS / 60000} minutes (check the workflow's runs)`)
}

async function openPr(argv) {
  const head = arg(argv, '--head')
  const title = arg(argv, '--title')
  if (!head || !title) usage('open-pr needs --head and --title')
  if (!/^claude\/[A-Za-z0-9._/-]{1,200}$/.test(head)) usage(`only claude/ branches, not ${head}`)
  const text = body(argv)
  const openFor = () => ghJson(`repos/${REPO}/pulls?state=open&head=${REPO.split('/')[0]}:${encodeURIComponent(head)}`)[0]
  const already = readBefore(openFor, `open PRs for ${head}`)
  if (already) {
    console.log(already.number)
    return
  }
  dispatch(BOTS['open-pr'].workflow, { head, title, body: text })
  const pr = await waitFor(openFor, `PR for ${head}`)
  if (pr.user?.login !== BOTS['open-pr'].login) console.error(`bot-dispatch: PR #${pr.number} is open but authored by ${pr.user?.login}`)
  console.log(pr.number)
}

async function postReview(argv) {
  const pr = arg(argv, '--pr')
  const sha = arg(argv, '--sha')
  const event = arg(argv, '--event')
  if (!/^\d+$/.test(pr ?? '')) usage('--pr takes a number')
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) usage('--sha takes the full 40-character head sha')
  if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) usage('--event is APPROVE, REQUEST_CHANGES, or COMMENT')
  const text = body(argv)
  const mine = () => ghJson(`repos/${REPO}/pulls/${pr}/reviews?per_page=100`).filter((r) => r.user?.login === BOTS['post-review'].login && r.commit_id === sha)
  const before = new Set(readBefore(mine, `reviews on PR #${pr}`).map((r) => r.id))
  const inputs = { pr, commit: sha, event, body: text }
  if (argv.includes('--auto-merge')) {
    const subject = arg(argv, '--merge-subject')
    if (!subject) usage('--auto-merge needs --merge-subject and --merge-body-file')
    Object.assign(inputs, { auto_merge: 'true', merge_subject: subject, merge_body: body(argv, '--merge-body-file') })
  }
  dispatch(BOTS['post-review'].workflow, inputs)
  const review = await waitFor(() => mine().find((r) => !before.has(r.id)), `Reviewer review on PR #${pr}`)
  console.log(review.id)
  if (inputs.auto_merge) {
    // Auto-merge is on when the PR has an auto_merge request (REST shows it as `auto_merge`).
    const deadline = Date.now() + 90 * 1000
    while (Date.now() < deadline) {
      try {
        const pull = ghJson(`repos/${REPO}/pulls/${pr}`)
        // Merged counts too: a PR that was already mergeable is merged by the workflow (#1020).
        if (pull.auto_merge || pull.merged) return
      } catch {
        // retried until the deadline, like waitFor
      }
      await sleep(POLL_MS)
    }
    console.error(`bot-dispatch: review posted, but auto-merge isn't on for PR #${pr} and it hasn't merged (check the workflow run); the owner must merge it`)
    process.exit(5)
  }
}

async function supportEvidence(argv) {
  const issue = arg(argv, '--issue')
  if (!/^\d+$/.test(issue ?? '')) usage('--issue takes a number')
  const fields = { date: '--date', version: '--version', platform: '--platform', codes: '--codes', gmail: '--gmail' }
  const inputs = { issue }
  for (const [name, flag] of Object.entries(fields)) {
    const value = arg(argv, flag)
    if (!value) usage(`support-evidence needs ${flag}`)
    inputs[name] = value
  }
  if (argv.includes('--notify')) inputs.notify = 'true'
  // The workflow checks the same fields, but a refusal there looks like an outage (no comment, exit 3
  // after the wait). Checking here first says which field is wrong, immediately.
  try {
    buildEvidence({ ...inputs, notify: inputs.notify === 'true' })
  } catch (error) {
    usage(`support-evidence: ${error.message}`)
  }
  const mine = () => ghJson(`repos/${BACKLOG_REPO}/issues/${issue}/comments?per_page=100`).filter((c) => c.user?.login === BOTS['support-evidence'].login && c.body?.startsWith('<!-- support-evidence -->'))
  const before = new Set(readBefore(mine, `comments on issue #${issue}`).map((c) => c.id))
  dispatch(BOTS['support-evidence'].workflow, inputs, BACKLOG_REPO)
  const comment = await waitFor(() => mine().find((c) => !before.has(c.id)), `support-evidence note on issue #${issue}`)
  console.log(comment.id)
}

const [command, ...rest] = process.argv.slice(2)
if (command === 'open-pr') await openPr(rest)
else if (command === 'post-review') await postReview(rest)
else if (command === 'support-evidence') await supportEvidence(rest)
else usage('first argument is open-pr, post-review, or support-evidence')
