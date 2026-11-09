---
name: ux-review
description: Drives the app as a senior UX reviewer would — captures screenshots across onboarding, a normal logging session, and exercise/template management, then adds scored backlog items for real, unfixed UX issues. Every finding is verified against the live source and deduped against docs/backlog.md and docs/backlog-archive.md before being logged. User-triggered, or headless as a monthly routine (/ux-review headless), which files every finding as needs-review.
argument-hint: "[headless]"
---

# ux-review

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

> **The backlog is GitHub Issues now (2026-09-28).** `docs/backlog.md` is a stub and
> `docs/backlog-archive.md` is frozen history. Wherever the steps below say to read, search, add
> to, enrich, number, or commit `docs/backlog.md`, do this instead, with the `gh` CLI:
> - **Read / dedupe:** `gh issue list --state all --limit 500 --search "<keywords>"` (open *and*
>   closed; closed issues and `docs/backlog-archive.md` are what already shipped). Enrich a match
>   with `gh issue comment <N>` instead of filing a duplicate.
> - **Add:** `gh issue create --title "<title>" --body-file <file> --label feature --label
>   effort:<E> --label value:<V>` (plus `--label ux-intensive` for layout/visual-heavy work, see
>   `docs/backlog.md`) (add `--label status:needs-review` for anything needing a
>   product decision, and put the decision needed in the body). Never pick an item number; GitHub
>   assigns `#N`. No Priority line to regenerate; `scripts/next-issue.mjs` ranks on the fly.
> - **Commit:** nothing to commit for issue changes. Only commit if you also edited a repo file.
> - In your final report, refer to issues as `#N`.
> - **Cloud sessions** refuse GitHub GraphQL and the search API, which `gh issue list`, `gh issue
>   create`, and `gh issue comment` use. Where those fail (always in a routine), use the REST
>   equivalents, which work everywhere:
>   - Dedupe: dump every issue, open and closed, then `grep -i` the file. Use explicit pages:
>     `gh api --paginate` follows links the cloud proxy refuses, and fails after the first 100.
>     ```
>     p=1; while out=$(gh api "repos/DeanPhillipsOKC/repbunny/issues?state=all&per_page=100&page=$p" --jq '.[] | "\(if .pull_request then "PR" else "#" end)\(.number) [\(.state)] \(.title) {\([.labels[].name] | join(","))}"') && [ -n "$out" ]; do echo "$out"; p=$((p+1)); done | grep '^#' > <scratch>/issues.txt
>     ```
>     Read one with `gh api repos/DeanPhillipsOKC/repbunny/issues/<N> --jq .body`.
>   - Add: `gh api repos/DeanPhillipsOKC/repbunny/issues -f title='<title>' -F body=@<file>
>     -f 'labels[]=<label>' ... --jq .number` (one `-f 'labels[]=...'` per label).
>   - Enrich: `gh api repos/DeanPhillipsOKC/repbunny/issues/<N>/comments -F body=@<file>`.

Reviews the app's UI the way a senior UX developer would: look at real screens across the main
journeys, judge them on visual polish, alignment, touch-target size, legibility (this app's
audience includes users with presbyopia/farsightedness — see the set-row-redesign item in
`docs/backlog.md`), and clarity, then write up anything genuinely wrong as a scored backlog item.

There's direct precedent for this in the repo: `docs/backlog.md`'s note above the Features section
describes items 49–55 coming from exactly this kind of screenshot-based review, done once by hand.
Several of that review's initial claims turned out to already be fixed once checked against the
actual source, and were dropped rather than logged — that verification step is not optional, it's
the entire difference between this being useful and this being noise. Read the `docs/architecture.md` index
(then the `docs/architecture/` topic files for screens you review) and `docs/backlog.md` first if you haven't already this session (required reading per
`CLAUDE.md`), read `docs/decisions.md` (don't log a finding that asks for something it rules out), and skim `docs/backlog-archive.md` for anything relevant already shipped.

## Headless mode (monthly routine)

Runs headless when invoked as `/ux-review headless` (the monthly routine's prompt; see
`docs/backlog-runner.md` > Scheduled reviews), or when no user can answer (`claude -p`). The steps
below still apply, with these changes:

- **Never ask.** No `AskUserQuestion`, no waiting. Make the most reasonable call and say what you
  chose in the issue or the report.
- **Dev server (step 1).** If nothing answers on 5173, start `npm run dev` in the
  background and stop it at the end. If something answers, use it and don't stop it (the app has
  no backend, so any server is the same app).
- **Every new finding is filed with `status:needs-review`**, whatever its classification, so it
  waits for the owner's prioritization and the runner skips it. It still gets its kind
  (`feature`, `bug`, or `tooling`), `effort:<E>`, `value:<V>`, and `ux-intensive` where it fits.
  The body ends with `Filed by /ux-review (headless) on <YYYY-MM-DD>. Remove status:needs-review to
  release it to the runner.`
- **Dedupe as always**, against open and closed issues (the REST dump above). Enrich an open match
  with a comment; never comment on an `awaiting-dean` issue (file a new one that links it).
- **At most 10 new issues per run.** If more survive, file the 10 highest-value and list the rest
  in the report under "Not filed this run".
- **No repo changes.** No file edits, commits, or pushes. A broken selector in
  `scripts/capture-ux-screenshots.mjs` is filed (deduped) as a `tooling` issue with the failing
  step and its accessibility tree instead of fixed, and the review reads that screen's source.
- **Cleanup (step 5)** still deletes older `logs/ux-review/` runs and stops a server you started;
  nothing is committed.
- **Report (step 6)** is printed as the final response, with every issue as `#N`. Then try to
  email it (non-blocking, never retried, never a failure of the run): if `pwsh` is on PATH, write
  a short HTML card in the layout of `next-item`'s Shipped card (`.claude/skills/next-item/email-card.md`) (banner
  `&#10003; ux-review`; rows Filed, Updated, Dropped, each a short `#N title` list) and run `pwsh
  -File scripts/Send-Notification.ps1 -Subject "ux-review: <A> filed" -BodyFile <file> -IsHtml`.
  Without `pwsh` (cloud images usually lack it), skip it; the routine's session page holds the
  report.

## 1. Make sure the dev server is up

Check `http://localhost:5173` (e.g. a quick `curl -s -o /dev/null -w '%{http_code}'`). If it's
already responding, leave it alone — don't touch a server the user may be relying on elsewhere.
If nothing's there, start `npm run dev` yourself in the background and remember to stop it
again in step 5. The app has no backend, so any running server works, and the screenshot scripts seed their own
local database (#940). Ask the user before stopping a server you didn't start.

## 2. Capture screenshots

Run:

```
node scripts/capture-ux-screenshots.mjs
```

This drives a mobile viewport (iPhone 13) through onboarding, the first-run unit sheet, the empty
Home, the exercise library, exercise create/edit/delete/history, template create and editing, every
Progress screen (with a few weeks of seeded history), the Account sheet, and a live workout (set
entry, plate calculator, editing a set, a timed exercise, finishing), each browser context on its own fresh local database (#940). Shots are phone-screen sized, with
extra `-p2`…`-p4` shots for long pages. It prints a JSON manifest (`outDir`, `screenshots`, and
`failures`); the databases go away with the browser, so re-running it never accumulates test
data. Each step is wrapped so a
stale selector is reported under `failures` (with that screen's accessibility tree) instead of
killing the run; fix those selectors the same way you'd fix a stale e2e spec. It's maintained like
one, just outside the `test:e2e` gate since it makes no assertions. A full run takes about 3 to 5
minutes.

## 3. Review every screenshot

Read each file in the manifest's `outDir` (the Read tool renders PNGs directly). For each screen,
look with a senior-UX eye at:

- **Alignment and layout** — do elements line up to a clean grid, or does content wrap/spill
  unevenly (the set-row and exercise-chip issues already in `docs/backlog.md` are the shape of
  thing to catch here)?
- **Touch targets and sizing** — is anything cramped or fiddly to tap accurately on a real phone?
- **Legibility** — text size/contrast, especially for the farsightedness consideration already
  called out in the set-row redesign item.
- **Clarity and safety of the flow** — is any state ambiguous, easy to trigger by accident, or
  missing feedback (the "no default selection" and "resume an accidentally-finished workout"
  items in `docs/backlog.md` are exactly this category)?
- **Consistency** — with the rest of the app and with the brand identity (cute, functional, cool —
  see the canvas mockup link above the Features section in `docs/backlog.md`).

Take real UX issues seriously; don't manufacture findings to have something to report. A clean
screen is a fine outcome.

## 4. Verify every candidate finding before logging it

For each thing that looks wrong in a screenshot:

1. **Read the actual source** backing that screen (the relevant `.vue`/CSS) and confirm the issue
   is real and current, not something already fixed since the screenshot's build, and not a
   screenshot artifact (headless rendering quirk, animation caught mid-transition, etc.).
2. **Check it's not already tracked** — search `docs/backlog.md` for an existing open item
   covering the same UI area. If one exists and your finding adds detail, enrich that item instead
   of creating a duplicate (this is what happened earlier this session with the set-row spillover
   report). If your finding is materially different, it's a new item.
3. **Check it's not already shipped** — skim `docs/backlog-archive.md` for the same area. Drop the
   finding if it's already fixed.

Findings that don't survive this step get silently dropped, the same way the original items 49–55
review dropped several of its own initial claims. Don't log something you haven't checked against
the live source.

## 5. Log surviving findings and clean up

For each real, novel finding: add a backlog item to `docs/backlog.md` in the same style as the
rest of the file — cite the specific screenshot filename and the source location backing the
claim, and give it its own `[Effort: N, Value: N, ROI: X]` tag (self-scored; the user doesn't want
to be asked). Regenerate the "Priority order" line the same way `next-item` does (highest ROI
first, tie-break by Value, then document order).

**Attach the screenshots.** Once a finding's issue exists, run `node scripts/issue-shot.mjs <N>
<screenshot file>...` with the screenshot(s) that show it, and comment the link lines it prints
on the issue (the owner reviews findings on a phone and taps them; `docs/backlog.md` > Screenshots
in issues). If the helper fails, file the issue without them and move on.

If you started the dev server in step 1, stop it now.

Delete every screenshot run's directory under `logs/ux-review/` except the one from this
invocation, so repeated runs don't pile up gitignored screenshots forever. Leave this run's own
screenshots in place — the user may want to spot-check a finding against the actual image.

If a repo file changed, ship it as a pull request: `docs/architecture/commit-policy.md` >
Shipping a change outside a lane (`main` takes only PRs, #681). No build or e2e gate applies to a
documentation-only change. Commit subject: `Add backlog item(s) from
ux-review: <short summary>`. If nothing was added, there's nothing to commit.

## 6. Report

Summarize directly in your response, not a file:

```
## UX review

<N> screen(s) reviewed, <M> new backlog item(s) added.

### Added
- <Title>: <one-sentence reason, citing the screenshot and source location>
...

### Checked and dropped (already fixed, or not actually a problem)
- <what it looked like> — <why it was dropped>
...
```

Omit the "Checked and dropped" section if nothing was dropped. If nothing was added at all, say so
plainly rather than padding the report.

## Hard rules

- **Dated owner steps (#746).** Anything you file or comment that needs the owner on or after a date (a deadline, a check-back, an `On hold until`) carries `<!-- owner-date: YYYY-MM-DD[THH:MM] | <short what> -->`, and a dated ask uses `ask-dean.mjs --owner-date`, so it lands on the owner's Google Calendar (`docs/backlog-runner.md` > Owner calendar). Dates only you act on don't need one.
- Never invent a finding you haven't verified against the current source.
- Never log a duplicate of an existing open or already-shipped backlog item — enrich instead.
- Never touch a `[human]`-tagged item or anything under `## Human setup / device verification`.
- Never run against a real pilot device's data — `scripts/capture-ux-screenshots.mjs` only ever
  uses its own fresh local database, and this skill never changes that.
- This skill only edits `docs/backlog.md` (plus, if you needed to fix a stale selector, the
  capture script). It doesn't fix the UX issues it finds — that's `next-item`'s job on a later
  invocation, once a human has had a chance to glance over what got added.
