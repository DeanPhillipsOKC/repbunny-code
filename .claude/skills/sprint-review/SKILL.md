---
name: sprint-review
description: Runs the owner's sprint review from a Claude session, so it can all happen in the Claude Code phone app. With no argument (or a version), starts the Sprint review GitHub workflow, waits for it, sends the video, and links the review issue. With any other text ("looks good", "the PDF toggle is hard to find", or `#581 good` lines), posts it verbatim as one comment on the open review issue as the owner, which fires /sprint-review-reply. With `status`, prints where the review stands. Owner-only; runs only when the owner types /sprint-review.
argument-hint: "[X.Y.Z | status | looks good | what you don't like]"
disable-model-invocation: true
---

# sprint-review

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

The owner runs releases from the Claude Code phone app and doesn't want to switch to GitHub for
the sprint review (#606). This skill is the front door to it: it starts the **Sprint review**
workflow (`.github/workflows/sprint-review.yml`), brings the video and the review issue back into
the chat, and posts the owner's reply for them. How the review works (clips, the video, the
reply routine) is in `docs/architecture/site-and-tools.md` > Sprint review.

`disable-model-invocation: true` means only the owner typing `/sprint-review` runs this. Don't
change, commit, or push any files. Never cut a release here; that's `/release`.

## 1. Set up `gh`

Use `gh` on PATH; on the owner's Windows laptop it's `C:\Program Files\GitHub CLI\gh.exe`. Run
`gh auth status`. If `gh` is missing or not signed in, stop and say what's missing (a cloud
session needs `gh` and a `GH_TOKEN` that can run workflows and comment on issues).

## 2. Read the argument

`$ARGUMENTS` is one of:

- empty, or a version like `1.4.0` (or `v1.4.0`): **run** a new review (step 3).
- `status`: **status** (step 4).
- anything else: **reply** (step 5). The owner reviews the whole release in one comment
  (#664): "looks good", or what they don't like, such as `/sprint-review the PDF toggle is hard
  to find`. Anything they don't mention counts as good. `#N ...` lines work too.

## 3. Run

1. `git fetch origin main --tags --force`. If `origin/main` already has a store tag
   (`git tag --points-at origin/main --list "store/v*"`), say there's nothing new since the last
   release and stop.
2. If an open `sprint-review` issue already exists
   (`gh issue list --label sprint-review --state open --json number,title,url`), say so in one
   line before starting. The workflow closes it with a link to the new one; that's expected.
3. Start it on `main`:
   ```
   gh workflow run "Sprint review" --ref main                    # version picked like /release
   gh workflow run "Sprint review" --ref main -f version=<X.Y.Z> # exact version
   ```
   Wait a few seconds, then take the newest
   `gh run list --workflow "Sprint review" --branch main --event workflow_dispatch --limit 1 --json databaseId,url,createdAt,status`
   created after you started it. If none shows up within a minute, say so and stop.
4. `gh run watch <id> --exit-status --interval 30`, in the background if your shell has a short
   timeout. It takes several minutes (install, then ffmpeg). Don't cancel or re-run anything.
5. On success:
   - Find the review issue: the newest open `sprint-review` issue, created after the run started.
     Read its body (`gh issue view <N> --json body,url`) for the status line and the list of
     changes. If the run succeeded with no issue, the step summary says "nothing to review"
     (`gh run view <id> --log | grep -i "nothing to review"`); report that and stop.
   - Get the video into the chat: `gh run download <id> -n sprint-review -D <scratchpad>/sprint-review-<id>`,
     then send `sprint-review.mp4` with `SendUserFile` (display `render`) so it plays in the app.
     If `SendUserFile` isn't available or the send fails, give the issue's **Video:** link
     instead.
6. On failure: the failing job step and its last useful log lines (`gh run view <id> --log-failed`,
   trimmed). Don't retry.

## 4. Status

`node scripts/demo-video/review/review-issue.mjs --status` prints the review line (or nothing
when there's no review). Also list the open review issue's comments since the owner's last one
(`gh issue view <N> --comments`), since the reply routine asks there when a line is unclear: show
any such question so the owner can answer it with `/sprint-review <answer>`.

## 5. Reply

1. Find the open review issue (newest open `sprint-review` issue). If there's none, say so and
   stop.
2. Don't reword, trim, or check the owner's text; the reply routine matches it to the changes.
3. Post it verbatim as **one** comment:
   `gh issue comment <N> --body-file <file>`. Posting as the owner fires the Review (Opus)
   routine (`dean-replied.yml` > `fire-sprint-review`), which runs `/sprint-review-reply`. Don't
   run `/sprint-review-reply` yourself.
4. Report: the comment link, and that the routine updates the status line in a few minutes;
   `/sprint-review status` shows it.

## 6. Report (run)

In this order, short:

- **Version:** the candidate version from the issue title.
- **Video:** sent above, or the link.
- **Review issue:** the link, and the status line.
- **Changes:** one line each from the issue body (`#N title`, shown in the video or not).
- **Reply:** "Reply here with `/sprint-review looks good`, or `/sprint-review` and what you
  don't like. Anything you don't mention counts as good. Then `/release` when it says Ready to
  release." The review never blocks `/release`.

## Hard rules

- Only post what the owner typed in this session, on the open review issue, verbatim.
- Never close, edit, or relabel the review issue; the workflow and the reply routine own it.
- Never cut a release, push a tag, revert code, or file issues here.
