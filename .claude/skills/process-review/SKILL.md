---
name: process-review
description: Reviews how RepBunny's work gets built, tested, released, and automated, as a DevOps / platform engineer would. Measures gate health (e2e duration, pass counts, flaky specs, blocked runs), CI and release workflows (duration, failure rate, Actions minutes), the agent workflow (skills, runner, routines, token waste, model choice), docs and config drift, human bottlenecks, and upstream holds (issues labeled upstream-hold: runs each one's Unblock check and comments when the runway is clear). Dedupes against open and closed issues and files up to 5 scored findings with status:needs-review, then prints a trend summary. Runs headless as a monthly routine (/process-review headless) or interactively. Not for app architecture or product (pm-review, ux-review) or security (security-audit).
argument-hint: "[headless]"
---

# process-review

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

**Paused?** Headless runs first run `node scripts/automation-paused.mjs --strict`. If it prints `PAUSED` (exit 10), output `PAUSED` and stop: no claims, no issues filed, nothing changed (#682, `docs/backlog-runner.md` > Pausing automation).

A periodic look at the delivery machinery as a whole: the build and e2e gate, GitHub Actions,
Codemagic, the release and store flow, the `next-item` runner, skills, routines, and notification
workflows. Nobody else reviews it together, so slow steps, flaky tests, wasted tokens, and doc
drift pile up quietly. This skill measures, then files improvements as backlog issues the owner
prioritizes. It never fixes anything itself.

Read the `docs/architecture.md` index first (then only the `docs/architecture/` topic files your change touches) if you haven't this session (required reading per `CLAUDE.md`),
especially End-to-end tests, Commit & push policy (including Cloud sessions and Dependency
updates), and Native apps > Releasing, plus `docs/backlog-runner.md`.

Out of scope: app architecture and product (`/pm-review`, `/ux-review`) and security
(`/security-audit`). This one is about how the work gets built, tested, released, and automated.

## Modes

- **Headless** when invoked as `/process-review headless` (the monthly routine's prompt; see
  `docs/backlog-runner.md` > Scheduled reviews), or when no user can answer (`claude -p`). Never
  ask anything. Make the most reasonable call and say what you chose in the issue or the report.
- **Interactive** otherwise. Same steps, and also never asks before filing: every finding goes in
  as `status:needs-review`, so the owner prioritizes it on GitHub either way.

Both modes leave the working tree as they found it: no file edits, no commits. Use the
scratchpad (or a temp dir) for notes and scripts.

## GitHub access (laptop and cloud alike)

Cloud sessions refuse GitHub GraphQL and the search API, which `gh issue list`, `gh issue
create`, and `gh issue comment` use. Use the repo-scoped REST API through `gh api`:

- **All issues, open and closed, for dedupe.** Explicit pages (`gh api --paginate` fails after the
  first 100), then `grep -i` the file for keywords:
  ```
  p=1; while out=$(gh api "repos/DeanPhillipsOKC/repbunny/issues?state=all&per_page=100&page=$p" --jq '.[] | "\(if .pull_request then "PR" else "#" end)\(.number) [\(.state)] \(.title) {\([.labels[].name] | join(","))}"') && [ -n "$out" ]; do echo "$out"; p=$((p+1)); done | grep '^#' > <scratch>/issues.txt
  ```
  Read a candidate with `gh api repos/DeanPhillipsOKC/repbunny/issues/<N> --jq .body` (and
  `/comments?per_page=100&page=1`).
- **File:** `gh api repos/DeanPhillipsOKC/repbunny/issues -f title='<title>' -F body=@<file>
  -f 'labels[]=tooling' -f 'labels[]=effort:<E>' -f 'labels[]=value:<V>' -f
  'labels[]=status:needs-review' --jq '.number'`
- **Enrich:** `gh api repos/DeanPhillipsOKC/repbunny/issues/<N>/comments -F body=@<file> --jq
  .html_url`. Never comment on an issue labeled `awaiting-dean` (`docs/backlog-runner.md` >
  Asking the owner); file a new issue that links it instead.
- **Workflow runs:** `gh api "repos/DeanPhillipsOKC/repbunny/actions/runs?per_page=100&page=1"`
  and `.../actions/workflows`. If the API refuses (403), say so under "Skipped or partial".

## 1. Measure

Measure; don't guess. Every claim in a finding carries a number or a link. Set the window to the
period since the last `Filed by /process-review` issue or comment (find it in the issue dump), or
the last 30 days if there is none. Record the window; the trend summary compares against the
previous run's numbers, which the previous run's issues quote.

### 1a. Gate health

- From recent `next-item` close-out comments (`Verified via npm run build and a full npm run
  test:e2e run (<passed>/<total>...)`), collect e2e pass counts, totals, and any `excluded <spec>`
  mentions. Pull them from closed issues in the window (`/comments`).
- Read `<M> min` and `attempt <K> of 4` from the same close-outs (and the `Gate: <M> min, <K> of 4
  attempts` line in `Blocked by next-item` comments, #545): report the median gate minutes and
  its trend. Older comments lack them; say so rather than guessing.
- Note the gate's duration where `docs/architecture/` states it too, and whether
  `PW_WORKERS`/memory notes show the gate getting slower or tighter.
- Flaky and failed specs: every open issue labeled `tooling` and `bug` about a spec (for example
  #217, #218), how old each is, and how many close-outs cite it as an excluded spec. A flake
  excluded in three or more runs, or one open for weeks, is a finding.
- Blocked runs: issues with `status:blocked` and issues whose comments start `Blocked by
  next-item`. Count them in the window and group the reasons (flaky gate, vague spec, wrong model,
  environment). A repeated reason is a finding.

### 1b. CI and release

- For each workflow in `.github/workflows/`: runs in the window, failure rate, median duration
  (`created_at` to `updated_at`, or `run_started_at`). Note a workflow that fails often, runs far
  longer than its peers, or has never run.
- Actions minutes: sum run durations for private-repo runner minutes (Linux 1x, Windows 2x, macOS
  10x) and compare with the 3,000 a month in Pro. Count each run that wasn't skipped as its wall
  time rounded up to a whole minute, the way the minutes guard does (`node scripts/run-budget.mjs`
  prints this month's; for October 2026 it was within 2% of the billing page). Say it's an
  estimate, and note days the guard lowered the cap (`automation-log` comments).
- Codemagic and store builds: if reachable (`codemagic.yaml`, `release-android.yml`,
  `release-play.yml`, any release run in the Actions list), note build duration and failures. If
  not reachable, say so.
- Look for: missing caches (`actions/setup-node` without `cache`), unpinned or outdated action
  versions, Node versions that differ between workflows, `.nvmrc`/`engines`, and jobs that could
  run in parallel or be skipped on a docs-only change.

### 1c. Agent workflow

Read `.claude/skills/*/SKILL.md`, `scripts/next-issue.mjs`, and
`docs/backlog-runner.md`.

- Duplicated or contradictory instructions between skills, or between a skill and
  `docs/architecture.md` (for example two places stating the gate rule, lane/model rules, or the
  GitHub REST fallback table).
- Steps that burn tokens without value: whole-file reads required on every run, repeated full
  gates for doc-only work, long reports nobody reads, instructions to read large files before the
  cheap exit (empty-run cost, #236).
- Where a cheaper model would do: use the lane/model rule (`next-issue.mjs`: ux always opus,
  other lanes sonnet below effort 5) and the recent close-outs to judge whether the effort
  cutoff or the review skills' model (Opus, `docs/backlog-runner.md`) is right.
- Missing automation: things the owner or an agent does by hand repeatedly (manual `gh` steps,
  copy-pasted commands, reminders) that a script, workflow, or routine could do.
- Routines: the configured lane and monthly routines in `docs/backlog-runner.md` against what the
  recent issue activity shows (is a lane producing anything; is a review's last report recent).

### 1d. Docs and config drift

- `node scripts/check-docs-refs.mjs`: every stale reference it lists.
- Sections of `docs/architecture.md` and `docs/backlog-runner.md` that contradict the files they
  describe (a workflow, script, or setting that changed). Spot-check by grepping a handful of
  concrete claims (worker counts, schedules, env var names, file paths) against the source.
- `npm outdated` (summarize: how many majors, minors; which are runtime vs dev), and whether
  Dependabot (`.github/dependabot.yml`) PRs are open and how old (`gh api
  'repos/DeanPhillipsOKC/repbunny/pulls?state=open&per_page=100'`). Node and action versions as in
  1b.

- `docs/decisions.md` size and fit: count its words (`wc -w`). Over about 3,000 words, or a skill
  that loads it and plainly doesn't need most of it (a bug-only lane, say), is a finding: propose
  splitting it along its three sections (Product, How agents work here, Writing) so each skill
  reads only what it needs. Also flag entries that are stale (the issue closed and the rule no
  longer applies), duplicated in another doc, or that contradict each other or the code.
  Decisions made lately that only exist in chat or issue comments are findings too.

- **Governance controls (#684):** for each row of `docs/governance.md`'s control matrix, check that
  its evidence still exists and its control is still in place: the cited files (check-docs-refs
  covers paths), the ruleset (`gh api repos/{owner}/{repo}/rules/branches/main` lists `pull_request`,
  `required_status_checks`, `non_fast_forward`, and `deletion`; the owner's
  `node scripts/apply-ruleset.mjs --check` is the full comparison, so ask for it if this session
  can't run it), `node scripts/review-risk.mjs --check-codeowners`, and the security steps of the
  `ci-required` job in `.github/workflows/ci.yml`. A row whose control was removed or weakened, or whose "Enforced by"
  claims more than the source does, is a finding. A row marked planned whose issue closed is a
  finding too (update the row).

### 1e. Human bottlenecks

- Open issues labeled `interaction-required` (the owner's finishing step): age since the label was
  added (the run's "needs the user" comment), whether an ask went out (`awaiting-dean` or an
  `<!-- ask-dean -->` comment), and whether an answered ask is still sitting (`dean-replied` plus
  the label: the run that should have released it didn't). More than 14 days with no ask, or any
  answered-but-unreleased issue, is a finding about the process, not a nag.
- Open issues labeled `human` or `awaiting-dean`: age (`created_at`, latest comment), what each
  blocks (open issues that name it under "Blocked by"), and which have waited longest. A `human`
  issue that blocks AI-workable issues is a finding; the fix is usually a smaller ask, a script
  that does most of it, or a reminder, not "do it faster".
- Issues stuck at `status:needs-review` for more than a month (the owner's queue), counted and
  grouped by kind. Report the count as a trend; file only if the queue is a real bottleneck.

### 1f. PR review audit (#443)

Is the Review (Opus) routine (`/review-pr`, #374) earning its runs? Over the window, use merged
and closed PRs with a review comment containing `<!-- review-pr -->` (`gh api
'repos/DeanPhillipsOKC/repbunny/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1'`, then each PR's reviews and its
body's `Tier: <T> (...)` line; PRs before #680 have `Review: needed (...)` / `Review: not needed`
instead, and each review since ends with its `Cost:` line, so compare review cost by tier). The repo closes ~25 PRs a day, so one
page covers only a few days: page with explicit `&page=$p` (`--paginate` fails in cloud sessions;
see "GitHub access"), most recently updated first, until a page is empty or its last `updated_at` is before the
window start, and drop PRs whose `closed_at` is before it. If #374's review hasn't produced any yet, say so
under "Skipped or partial".

- **Sort every finding** (blocker, should-fix, nit) into: **bug** (wrong behavior, broken
  automation, permissions), **data safety or privacy**, **agent-maintainability** (duplicated
  logic, two sources of truth, hidden coupling, a change that forces reading many files), or
  **style or human convention**. Mark each real or not by what happened next (fixed, follow-up
  issue closed, or ignored).
- **Payoff check:** reviewed vs unreviewed PRs by follow-up bugs: `bug` or `support` issues filed
  later that touch the same files or name the PR's issue. State how each link was made. Small
  numbers are a trend, not proof.
- **Mechanical candidates:** findings a script could catch every time. Each becomes a proposed
  test, lint rule, or `scripts/review-risk.mjs` trigger, so the Opus review spends its run on
  judgment.
- **Agent change cost:** per closed issue, grouped by effort score, the lane run's duration, gate
  attempts (failed gates before green), and tokens and API-equivalent dollars from the close-out
  comment's `<!-- run-cost: {...} -->` line (`scripts/run-cost.mjs`; older comments have none).
  Report medians per effort score, not means: one stuck run skews a small sample. Also list the
  costliest few changes with the largest touched file's line count, so a pattern like "changes in
  `WorkoutLogger.vue` cost 2x" shows up. Compare with the previous run's numbers. A rising cost at the same effort
  score means the codebase is getting harder for agents to change; name the files or areas.
- **Regression-spec payoff (#627):** bug fixes closed in the window, split by the close-out's
  `Regression spec: ... failed before the fix: yes|no` line (or missing), against how many later
  reopened or got a follow-up fix (a later `bug` issue naming the same issue number or touching the
  same files; state how each link was made). Report counts for each group; small numbers are a trend.
- **Risk check calibration:** reviewed PRs where the review found nothing (is a trigger too
  broad?) and unreviewed PRs that later needed a fix (is a trigger missing?).
- **Delivery quality (#685):** run `node scripts/delivery-metrics.mjs --days 130` (a few
  minutes; 130 days so three complete months show for the trend) and put its tables in the report under
  "Delivery metrics", with each `all` row's change since the previous run's numbers. Definitions:
  `docs/backlog-runner.md` > Delivery metrics. When its Trend says change failure rate or escaped
  bugs rose two months running, that's a finding: list the failed changes or escaped bugs behind
  the rise and what they share (a lane, a model, an area, a missing spec). If the script fails,
  say so under "Skipped or partial".

Findings go through the normal path below. Put the numbers in the trend summary (finding counts
by category, reviewed vs unreviewed follow-up bugs, cost per effort score, and the delivery
metrics' change failure rate, escaped bugs, review catch rate, and lead times).

### 1g. Upstream holds

Things held back on an outside release (a Dependabot ignore, a pinned version) must not rot. Every
open issue labeled `upstream-hold` has an **Unblock check** section in its body with a repeatable
test. For each one (`gh api 'repos/DeanPhillipsOKC/repbunny/issues?state=open&labels=upstream-hold&per_page=100'`):

- Run its check exactly as written: `npm view <pkg> version`, a release-notes lookup with
  `gh api`, a compatibility table read with WebFetch, or a throwaway install in a scratch directory.
  Never touch the working tree, and never run the unattended build or any release.
- **Cleared** (every condition in the check held, and each was actually run this session, not
  skipped): release the issue so the runner picks it up. Comment first with the versions and
  evidence ("Runway clear, released to the runner: ..."), then remove `upstream-hold` and
  `status:needs-review` (`gh api -X DELETE repos/DeanPhillipsOKC/repbunny/issues/<N>/labels/<name>`,
  URL-encode the colon as `%3A`). Leave every other label alone: an issue that also carries
  `interaction-required` stays for an attended session. List it under "Upstream holds" in the
  report. This is the one case where the review changes an existing issue's labels (the owner
  decided this on 2026-10-14 so holds release themselves).
- **Partly cleared:** one comment saying which half holds and what's still missing. Labels stay.
- **Not cleared:** no comment. Report one line: the issue, what the check found, and its age in
  days. A hold older than 90 days with no movement is a finding if the check itself looks wrong,
  or if the thing it waits on has been abandoned (then propose dropping the hold).
- **No Unblock check, or one that can't run** (the source needs access the session lacks): list it
  under "Skipped or partial" and propose a fixed check.
- Also flag any Dependabot `ignore:` entry in `.github/dependabot.yml` whose comment doesn't name
  an open `upstream-hold` issue: that hold has no memory. Propose a tracking issue.

### 1h. Snoozed issues (#749)

Lanes snooze date-bound issues with `<!-- not-before: YYYY-MM-DD | reason -->` (a comment from
`scripts/snooze-issue.mjs`). Run `node scripts/next-issue.mjs --snoozed` and list every issue with
its date and reason under "Snoozed issues". Count the issue's snooze comments (`Snoozed until`);
flag any snoozed more than twice as a finding if the wait keeps moving, since the date or the
issue's premise is probably wrong.

## 2. Verify every candidate

For each candidate finding:

1. **Confirm it with the evidence.** Re-read the file or re-run the command. Drop it if it
   doesn't hold (a one-off, a failure already fixed, a cost that's trivial). Prefer fewer, solid
   findings to many thin ones.
2. **Dedupe** against the issue dump. An open issue that covers it gets a comment with this
   run's numbers instead of a new issue. A closed one that covers it means either it's fixed
   (drop) or it regressed (file new, linking the old one).
3. **Estimate the payoff** in a concrete unit: minutes saved per gate run, fewer flaky reruns per
   month, tokens saved per run (say how you estimated), Actions minutes, or owner time.
4. **Rank by payoff.** Highest first.

## 3. File

At most **5** new issues per run, highest payoff first. The rest go under "Not filed this run" in
the report so the next run or the owner can pick them up. Comments on existing issues don't count.

Title: short and specific. Body:

```
## Problem
<what's slow, flaky, wasteful, or drifting, and who pays for it>

## Evidence
<numbers, run links, file:line, command and output; the window measured>

## Proposed change
<the smallest change that fixes it>

## Expected payoff
<minutes saved per run, fewer flakes per month, tokens saved, or owner time; how it was estimated>

## Done when
<something checkable>

Filed by /process-review (<headless|interactive>) on <YYYY-MM-DD>. Remove `status:needs-review`
to release it to the runner.
```

Labels: `tooling`, `status:needs-review`, and `effort:<E>` / `value:<V>` self-scored on the
Fibonacci scale in `docs/backlog.md`. Something only the owner can do (a dashboard setting, a
billing change, a key) is filed with `human` in place of nothing else, still scored, still
`status:needs-review`. Never `ux-intensive`.

**Guardrail changes go to the owner.** A finding that would loosen agent rules (a skill's hard
rules, the release or push policy, permissions, the gate requirement) says so in the **first
line** of its body: `**Guardrail change:** needs the owner's decision.` Agents can't approve their
own guardrail changes. Never phrase one as safe to just do. (All findings are `needs-review`
anyway, so this line tells the owner it is a rules change, not routine tooling.)

## 4. Report

Print it as your final response. No em dashes.

```
## Process review, <YYYY-MM-DD> (window: <start> to <end>)

<N> areas checked, <A> issue(s) filed, <B> existing issue(s) updated.

### Filed (needs your prioritization)
- #<N> [payoff: <short>] <title>

### Updated
- #<N> <title>: <what this run added>

### Trends since the last run
- <metric>: <previous> -> <now> (e.g. e2e duration 5.5 min -> 7.5 min; include the 1f numbers)

### Delivery metrics
<the tables scripts/delivery-metrics.mjs printed, and each month's `all` row change since the last run>

### Snoozed issues
- #<N> <title>: until <date> (<reason>)[, snoozed <K> times: check whether the wait is real]

### Upstream holds
- #<N> <title>: <cleared | partly cleared | not cleared> (<what the check found>, held <D> days)

### Not filed this run
- <finding> (<payoff>)

### Checked and dropped
- <candidate>: <why>

### Skipped or partial
- <check>: <why: API refused, Codemagic unreachable, no previous run>
```

Omit empty sections. The trend list is always present: when there is no previous run, say "First
run: baseline recorded" and list the baseline numbers (gate pass count and duration, workflow
failure rates, blocked-run count, open `human` issues and their ages) so the next run can compare.
If nothing was found, say so plainly: "No new findings."

Then try to email it (non-blocking, never retried, never a failure of the run): if `pwsh` is on
PATH, write a short HTML card in the same layout as `next-item`'s Shipped card (`.claude/skills/next-item/email-card.md`) (banner
`&#10003; Process review` on `#f2879c`; rows: Filed, Updated, Trends, Skipped, each a short list),
and run `pwsh -File scripts/Send-Notification.ps1 -Subject "Process review: <A> filed" -BodyFile
<file> -IsHtml`. Without `pwsh`, skip this; the routine's session page holds the report.

## Hard rules

- **Dated owner steps (#746).** Anything you file or comment that needs the owner on or after a date (a deadline, a check-back, an `On hold until`) carries `<!-- owner-date: YYYY-MM-DD[THH:MM] | <short what> -->`, and a dated ask uses `ask-dean.mjs --owner-date`, so it lands on the owner's Google Calendar (`docs/backlog-runner.md` > Owner calendar). Dates only you act on don't need one.
- Read-only on the repo and the app. No file edits, no commits, no pushes, no fixes. The only
  writes are issues and issue comments.
- Never run a destructive script, trigger a workflow or release, or create or push a tag.
- Never comment on an `awaiting-dean` issue, and never change existing issues' labels or scores,
  with one exception: step 1g removes `upstream-hold` and `status:needs-review` from an issue whose
  Unblock check fully cleared. Never touch scores, and never touch any other issue's labels.
- Every finding is verified with evidence before it's filed, and filed with
  `status:needs-review`. Guardrail-loosening findings say so in their first line.
