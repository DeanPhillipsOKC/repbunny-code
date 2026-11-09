---
name: sprint-review-reply
description: Acts on the owner's replies on a `Sprint review: v<X.Y.Z> candidate` issue (#607, #664). Reads each comment as prose about the whole release ("looks good", or what the owner doesn't like; anything not mentioned counts as good) plus any `#535 good` / `#536: make the button bigger` / `#547 pull it` lines, accepts changes, files a scored follow-up issue for a requested change and a value 13 revert issue for a pulled one, asks on the issue when a reply is unclear, and rewrites the review's status line and Outcome list (down to "Ready to release", which closes the review). Only files issues and edits or closes the review issue; never reverts code or cuts a release. Runs headless from the Review (Opus) routine when the owner comments on a sprint-review issue (dean-replied.yml fires it), or by hand.
---

# sprint-review-reply

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

**Paused?** First run `node scripts/automation-paused.mjs --strict`. If it prints `PAUSED` (exit 10), output `PAUSED` and stop: change nothing (#682, `docs/backlog-runner.md` > Pausing automation).

The owner answers a sprint review (#606) with one comment about the whole release (#664): "looks
good", or what they don't like. This turns it into accepted changes, follow-up issues, and revert
issues, so the owner files nothing. Read
`docs/decisions.md` first only if a requested change looks like something it rules out; then
don't file it, ask on the review issue instead.

Never cut a release, never revert code, never push. You only file issues and edit the review
issue (the script closes it once it's ready). Never spawn a sub-agent. Use `gh api` (cloud sessions refuse GraphQL).

**Dated owner steps (#746).** Anything you file or comment that needs the owner on or after a date (a deadline, a check-back, an `On hold until`) carries `<!-- owner-date: YYYY-MM-DD[THH:MM] | <short what> -->`, and a dated ask uses `ask-dean.mjs --owner-date`, so it lands on the owner's Google Calendar (`docs/backlog-runner.md` > Owner calendar). Dates only you act on don't need one.

## 1. Find the review issue

The issue number is in the run text ("The owner replied on issue #N") when fired by the
workflow. Otherwise take the newest open issue labeled `sprint-review`
(`gh api "repos/$BACKLOG/issues?state=open&labels=sprint-review&per_page=5&page=1"`). With
none, output `NOTHING_TO_DO` and stop.

## 2. Plan

`node scripts/demo-video/review/review-reply.mjs plan <review#>` prints:

- `comments`: each of the owner's comments on the review, whole, with its `id` and `seen`
  (`null` is new, `held` means you asked about it and it waits on the answer, `read` is done).
- `items`: every change with its `title`, release `note`, the owner's latest `#N` line (`said`,
  `guess`, `todo`), and what was already done (`state`, `followUp`).
- `unsettled`: the changes with no verdict yet.

Work the comments whose `seen` is `null` or `held`, oldest first. A held comment waits on your
question: its answer is a later comment (`A`, `B`, `C`, or a sentence). Read them together.

## 3. Act on each comment

The owner reviews the whole release in one comment (#664). Read it as prose about the release;
the decision is yours, and the script only records it. Pass `--comment <id>` on every command
for that comment, and `--said "<the owner's words about that change>"` whenever they aren't a
`#N` line.

1. **`#N` lines**, mixed into prose or alone, work exactly as before: each one is a verdict on
   change N (below). `todo: true` on an item means its line is new.
2. **Complaints in prose** ("the PDF toggle is hard to find", "pull the calendar guide"): match
   each to the change it's about by its title, release note, and what the clip shows. Then
   change or pull it (below).
3. **Can't match a complaint to one change with confidence**, or can't tell what it asks: never
   guess. `review-reply.mjs ask <review#> [<N>] --question "<question>" --comment <id>` (leave
   out `<N>` when you don't know which change). It holds the comment: **accept nothing else
   from it** this run, so a misread can't wave a change through. The owner's answer starts the
   next run.
4. **Everything else counts as good.** Once every complaint in the comment is acted on (and
   none is held), `review-reply.mjs accept-rest <review#> --said "<the comment, or its first
   line>" --comment <id>` accepts every unsettled change the comment didn't mention. "Looks
   good", "all good", or "ship it" is just this step. A comment of only `#N` lines doesn't
   accept the rest: mark it with `review-reply.mjs read <review#> --comment <id>` instead.
   A held comment stays held, whatever else you file from it, until `accept-rest` or `read`
   names it: once its answer is acted on, run one of them for the held comment and for the
   answer.

Verdicts on one change:

- **Accept** ("good", "ok", "ship it"): `review-reply.mjs accept <review#> <N>`.
- **Change** (a specific ask, such as "make the button bigger"): `review-reply.mjs change
  <review#> <N> --effort <E> --value <V>`, scoring it yourself on the Fibonacci scale (1, 2, 3, 5,
  8, 13); value is at least 5 because the owner asked. It quotes the owner, links the original,
  and carries no `status:needs-review`, so the lanes pick it up. Add `--title "<short title>"`
  when the default `Change #N: <original title>` is vague.
- **Pull** ("pull it", "revert"): `review-reply.mjs pull <review#> <N>`. It files a revert at
  value 13, effort 2 (raise it with `--effort` only when the change was large).
- **Unclear** (a bare "hmm", a question, a line that could mean accept or change):
  `review-reply.mjs ask <review#> <N>` as in item 3. It asks on the review issue with the
  `awaiting-dean` label so the owner's phone is notified, and the change stays not settled.

Each command rewrites the review issue's status line and `## Outcome` list and records what it
did, so a rerun on the same comment does nothing. Once every change is accepted or its follow-up
has shipped, the script closes the review (completed) with a comment saying it's ready to
release.

## 4. Finish

1. `review-reply.mjs status <review#>` if nothing needed acting (it refreshes the line, for
   example after a follow-up shipped, and closes the review when that made it ready).
2. `node scripts/ask-dean.mjs --done <review#>` when you did anything, to clear `dean-replied`
   (run it before any `ask` of step 3, otherwise it clears that ask's `awaiting-dean`; if you
   already asked, re-add the label with `gh api -X POST
   repos/$BACKLOG/issues/<review#>/labels -f "labels[]=awaiting-dean"`).
3. Print one line per change you acted on (`#535 accepted`, `#536 change filed as #601`, `#547
   pulled as #602`, `#548 asked`) and the new status line. No other report.

The status line reads like "2 accepted, 1 change requested (#601), 1 pulled (#602). Release
after #602 ships." and says "Ready to release." once every change is accepted or its follow-up
has shipped. `/release` shows the same text in its preview and still never waits on it.
