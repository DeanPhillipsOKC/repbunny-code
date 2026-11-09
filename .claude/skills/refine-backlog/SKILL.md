---
name: refine-backlog
description: Refines this repo's GitHub Issues backlog. Finds open issues that aren't scored yet (no effort/value labels, e.g. ones the user filed from their phone), checks each against the live source and existing issues, asks the user for anything only they can decide, then rewrites the title and body into a clear, AI-ready spec and adds effort/value/kind/status labels so the next-item runner can pick it up. User-triggered and interactive; never implements anything.
---

# refine-backlog

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

Turns rough issues into specs the `next-item` skill can build without guessing. The backlog lives
in GitHub Issues (conventions in `docs/backlog.md`); use the `gh` CLI for everything. Read
the `docs/architecture.md` index first (then only the topic files an issue touches) if you haven't this session, `docs/decisions.md` (an issue that asks for something it rules out gets flagged to the user, not refined into a spec), and `docs/brand-identity.md` if an issue
touches UI or copy.

This skill is interactive: the user is present and wants to be asked when something is genuinely
theirs to decide. Their standing preference: put every question in one numbered **Asks** list at
the very top of a message, one line each, and never bury a question at the end.

## 1. Find issues that need refining

```
gh issue list --state open --limit 500 --json number,title,labels,body,createdAt
```

An issue **needs refining** if it is open, isn't a tracking issue (a checklist of other issues,
usually titled "(tracking)"), and is missing an `effort:N` or a `value:N` label. That includes
`human` issues, but for those only add the missing labels and any "blocked by" links (step 3's
label rules); don't rewrite their bodies unless the user names them. If the user named specific issues (`/refine-backlog #12 #14`), refine exactly
those instead, even if they're already scored (re-refining is allowed on request).

If nothing needs refining, say so in one line and stop.

## 2. Research each one (before asking anything)

For each issue, oldest first:

1. `gh issue view <N> --comments`. The body and every comment are input; later comments win.
2. **Verify against the live source.** Find the files, components, stores, and specs involved. If
   it's a bug, reproduce the reasoning to a concrete root cause where you can (which condition,
   which function, which data). If a claim is wrong or already fixed, note that. Evidence beats
   restating the report: cite `path:line` and, for data-dependent bugs, what you checked.
   Users' data lives only on their phones (#938), so there's no live data to query. When
   diagnosis needs it, ask for a backup file or a bug report (its error log and action trail);
   never ask for more than the user chooses to send.
3. **Dedupe:** `gh issue list --state all --limit 500 --search "<keywords>"`, and grep
   `docs/backlog-archive.md` (history from before the move to Issues). If it duplicates an open
   issue, plan to fold it in; if it was already shipped or deliberately dropped, plan to say so.
4. Decide what, if anything, only the user can answer: a product or design choice, which of two
   readings they meant, a priority tradeoff, missing information you can't get from the code (what
   device, what they tapped, what they expected). Don't ask about things you can determine
   yourself or that have an obvious sensible default; pick the default and state it in the spec.

## 3. Ask, once, in a batch

If any issue has open questions, send one message to the user that starts with an **Asks** list
covering every issue in this run, numbered, one line each, tagged with the issue (`#14:`). Offer a
recommended answer where you have one. Below the list, a short note per issue on what you found
(root cause, duplicate, already fixed) so the user has context. Then wait for the answers.

Issues with no open questions don't wait: refine them now (step 4) and list them in that same
message as done.

If the user can't or doesn't want to answer something yet, refine the issue anyway with the
question recorded under "Open questions" and label it `status:needs-review`.

If an issue needs a visual design decision, offer a mockup (a throwaway HTML page screenshotted
with Playwright, as prior items did under `docs/design/`) rather than asking the user to picture
it. Only build it if they say yes.

## 4. Rewrite the issue

Write the new body to a temp file and apply it with
`gh issue edit <N> --title "<title>" --body-file <file> --add-label <labels...>`.

**Title:** short, imperative, specific to the outcome ("Keep exercise lists alphabetical after
creating or renaming"), not the symptom's wording from the report.

**Body**, in this order (omit a section only if it truly doesn't apply):

```markdown
## Problem
What the user experiences and why it matters, in plain language. Who hit it and when, if known.

## Evidence
What you verified: files and functions with `path:line`, the root cause for a bug, data you
checked, related or duplicate issues (#N) and archive history.

## Scope
The change to make, concrete enough to build without guessing: which files/components, the rule
or behavior, copy text in quotes, defaults you chose and why. Decisions the user made, marked
"decided with the user <date>" so no later agent relitigates them.

## Out of scope
What not to touch, especially nearby things a builder might "helpfully" change.

## Acceptance
Checkable outcomes. For UI changes, the e2e spec to add or extend and what it asserts (per
`docs/architecture/testing.md`, UI changes need e2e coverage). For bugs, the repro that must now pass.

## Design source
Only if there is one: `docs/design/<file>` or a mockup link, "build true to it".

## Open questions
Only if something is still undecided (and then the issue gets `status:needs-review`).

<details><summary>Original report</summary>

<the issue's previous title and body, verbatim, so nothing the user wrote is lost>
</details>
```

Write for an AI builder that has the repo but not this conversation: name exact files and
identifiers, spell out rules instead of implying them, and avoid "etc." and "as discussed".
Keep the user's own words for anything about how it should feel or read.

**Labels** (add; remove stale ones with `--remove-label`):
- `effort:N` and `value:N`, Fibonacci (1, 2, 3, 5, 8, 13), self-scored, never ask the user
  (their standing preference). Effort is implementation size including tests; Value is combined
  user and technical worth, weighted toward the core logging loop.
- Exactly one kind: `feature`, `bug`, or `tooling`.
- `ux-intensive` when getting it right depends mostly on visual/layout judgment: building a
  mockup faithfully, new or reworked screens, dialogs, or components, alignment/spacing/sizing
  fixes, responsive behavior at phone width, animation. Not for copy-only changes, a one-line style
  tweak, or logic with an incidental UI touch. The user routes these to a frontier model, and
  `next-item` warns before starting one. When unsure, apply it.
- `status:needs-review` if a decision is still open; `status:blocked` plus a comment if it's
  waiting on something outside the code (artwork, an account, a dashboard setting).
- `human` if only the user can do it (device testing, accounts, artwork), **plus** the usual
  effort/value labels: effort is the user's time and hassle. Interactive `next-item` offers the
  top human issue to the user when it outranks the AI work, so unscored ones would go stale.
- `interaction-required` if an agent can do most of it but can't finish it without the user: it
  needs a device test, or a native build the cloud can't run (Swift/WidgetKit, Xcode). No
  unattended run picks these; see `docs/backlog.md`.
- If it can't start until another open issue is done, add a GitHub "blocked by" link instead of
  `status:blocked`, so it unblocks itself when that issue closes:
  `gh api -X POST repos/$BACKLOG/issues/<N>/dependencies/blocked_by -F issue_id=<id>`, where
  `<id>` is the blocker's database id (`gh api repos/$BACKLOG/issues/<blocker> --jq .id`).

Then post one short comment: `Refined by refine-backlog on <YYYY-MM-DD>: <what changed and why,
one or two sentences>` (get the date with `date +%Y-%m-%d`).

**Duplicates:** don't close anything without the user's OK. Ask in the batch; on a yes, move any
new detail into the surviving issue as a comment, then `gh issue close <dup> --reason "not planned"
--comment "Duplicate of #<N>"`.

## 5. Report

End with a short summary: each issue refined (`#N title` with its effort/value/ROI and kind),
anything labeled needs-review or blocked and why, duplicates closed, and what's now at the top of
`node scripts/next-issue.mjs`.

## Hard rules

- Never implement, commit, or push anything. This skill only edits issues (and, if the user
  approves a mockup, writes it under `docs/design/`; committing that is a normal docs commit).
- Never drop information from a report: the original always goes in the `<details>` block.
- Never invent product decisions. Ask, or record the question and label `status:needs-review`.
- On `human` issues, only add missing scores and "blocked by" links unless the user names them.
- Never ask the user to score anything.
