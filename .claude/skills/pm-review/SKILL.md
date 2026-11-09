---
name: pm-review
description: Reviews the app as a senior product manager would. Walks the shipped screens and source, measures them against docs/brand-identity.md and docs/product-roadmap.md, and adds scored backlog items for real, unbuilt feature gaps. Every gap is checked against the live source and deduped against docs/backlog.md and docs/backlog-archive.md before it's logged. Gaps that need a product decision are logged as needs-review so the unattended runner skips them. User-triggered, or headless as a monthly routine (/pm-review headless), which files every finding as needs-review.
argument-hint: "[headless]"
---

# pm-review

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

**Paused?** Headless runs first run `node scripts/automation-paused.mjs --strict`. If it prints `PAUSED` (exit 10), output `PAUSED` and stop: no claims, no issues filed, nothing changed (#682, `docs/backlog-runner.md` > Pausing automation).

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

Reviews RepBunny the way a senior product manager would. Look at what the app actually does today,
hold it up against the product promise in `docs/brand-identity.md` and the direction in
`docs/product-roadmap.md`, and turn the real gaps between the two into backlog items that
`next-item` can pick up.

This is the feature-level sibling of `ux-review`. `ux-review` asks "is this screen well made?"
`pm-review` asks "is the right thing here at all, and what's missing?" Leave visual polish,
alignment, and touch-target findings to `ux-review`. Only log them here if the gap is really a
missing capability.

Read the `docs/architecture.md` index and `docs/backlog.md` first if you haven't already this session
(required reading per `CLAUDE.md`). Read `docs/decisions.md` too and drop any gap it rules out instead of logging it. Also read `docs/brand-identity.md` and
`docs/product-roadmap.md` in full, since they are the yardstick for this review. Skim
`docs/backlog-archive.md` so you know what has already shipped.

## Headless mode (monthly routine)

Runs headless when invoked as `/pm-review headless` (the monthly routine's prompt; see
`docs/backlog-runner.md` > Scheduled reviews), or when no user can answer (`claude -p`). The steps
below still apply, with these changes:

- **Never ask.** No `AskUserQuestion`, no waiting. Make the most reasonable call and say what you
  chose in the issue or the report.
- **Dev server (step 2).** If nothing answers on 5173, start `npm run dev` in the
  background and stop it at the end. If something answers, use it and don't stop it (the app has
  no backend, so any server is the same app).
- **Every new finding is filed with `status:needs-review`**, whatever its classification, so it
  waits for the owner's prioritization and the runner skips it. It still gets its kind
  (`feature`, `bug`, or `tooling`), `effort:<E>`, `value:<V>`, and `ux-intensive` where it fits.
  The body ends with `Filed by /pm-review (headless) on <YYYY-MM-DD>. Remove status:needs-review to
  release it to the runner.`
- **Human tasks** (step 5's third kind) are filed with the `human` label instead of a kind,
  scored, and also `status:needs-review`.
- **Roadmap corrections** (step 5's last paragraph) go in the report's "Roadmap corrections"
  section instead of being edited, so the owner can apply them.
- **Dedupe as always**, against open and closed issues (the REST dump above). Enrich an open match
  with a comment; never comment on an `awaiting-dean` issue (file a new one that links it).
- **At most 10 new issues per run.** If more survive, file the 10 highest-value and list the rest
  in the report under "Not filed this run".
- **No repo changes.** No file edits, commits, or pushes. A broken selector in
  `scripts/capture-ux-screenshots.mjs` is filed (deduped) as a `tooling` issue with the failing
  step and its accessibility tree instead of fixed, and the review reads that screen's source.
- **Cleanup (step 6)** still deletes older `logs/ux-review/` runs and stops a server you started;
  nothing is committed.
- **Report (step 7)** is printed as the final response, with every issue as `#N`. Then try to
  email it (non-blocking, never retried, never a failure of the run): if `pwsh` is on PATH, write
  a short HTML card in the layout of `next-item`'s Shipped card (`.claude/skills/next-item/email-card.md`) (banner
  `&#10003; pm-review`; rows Filed, Updated, Dropped, each a short `#N title` list) and run `pwsh
  -File scripts/Send-Notification.ps1 -Subject "pm-review: <A> filed" -BodyFile <file> -IsHtml`.
  Without `pwsh` (cloud images usually lack it), skip it; the routine's session page holds the
  report.

## 1. Build the product inventory from source

Before judging anything, write down what the app does today. Derive it from the code, not from
the docs, because the roadmap's "RepBunny today" column goes stale as items ship. For example,
`src/components/ExerciseHistoryDetail.vue` exists even though the roadmap's gap table still says
there's no per-exercise history view.

- Walk `src/App.vue`, `src/components/BottomNav.vue`, and every component under `src/components/`
  to list the screens, sheets, and modals a user can reach.
- Walk `src/stores/` to list what data the user can create, read, edit, and delete. Also note what
  gets persisted and what lives only in memory.
- Check `src/data/sqlite/schema.ts` for columns the UI never surfaces. Stored-but-unused data is often a
  cheap gap to close.

Keep this inventory as a working list in your head or a scratchpad file. Don't commit it.

## 2. See the app running

Make sure the dev server is up, exactly as `ux-review` step 1 does. Check `http://localhost:5173`.
If it's responding, leave it alone. If not, start `npm run dev` in the background and stop it in
step 6. The app has no backend, so any running server works, and the screenshot scripts seed their own
local database (#940). Ask the user before stopping a server you didn't start.

Then run:

```
node scripts/capture-ux-screenshots.mjs
```

Each browser context starts on its own empty local database, so nothing is left behind (see
`ux-review` step 2 for details). Read every screenshot in the manifest's
`outDir`. You aren't grading pixels. You're walking the user journeys end to end and noticing
where a lifter would get stuck, need a workaround, or leave the app to answer a question:

- **First session:** can a brand-new user get from sign-in to a logged set without help?
- **Normal gym session:** start a routine, log sets, rest, switch exercises, finish. Where are the
  extra taps or the dead ends?
- **Interruption:** what happens on reload, lost signal, or an accidentally finished workout?
- **Looking back:** can the user answer "what did I do last time on this lift?" and "am I getting
  stronger?"
- **Reuse:** can the user turn what they did into something they can repeat?
- **Account lifecycle:** what would a user beyond the two-person pilot need (per the roadmap's
  "Before a public launch" section)?

If the capture script's journeys don't reach a screen in your inventory, read that component's
source instead. If a selector in the script is broken, fix it the same way `ux-review` does.

## 3. Identify candidate gaps

Compare the inventory and screenshots against three sources:

1. **Brand promise and personality** (`docs/brand-identity.md`). Where does the app fall short
   of "your training, clearly recorded, with a little delight and no extra work"? Look for
   extra taps, missing reuse of data the user already entered, celebrations that aren't tied to
   a real event, copy that breaks the voice rules, or privacy defaults that aren't private.
2. **Roadmap** (`docs/product-roadmap.md`). For each item in Now / Next / After that / Before a
   public launch, check whether it's shipped (per the inventory and archive), already in the
   backlog, or still missing. Missing roadmap items are the strongest gap candidates.
3. **The user journeys from step 2.** Any place where a lifter would need a workaround.

Run every candidate through the brand's five-question filter in "Product decisions through the
brand lens". If it fails (it's a streak mechanic, a social feed, nutrition tracking, a coach that
prescribes training, a metric nobody asked for), drop it. Also drop anything the roadmap lists
under "Not prioritized for the current product promise." Don't propose features just because a
competitor has them. The brand doc says "Could a fitness app have this?" is not enough.

Take gaps seriously, but don't manufacture them. A short list of real gaps beats a long wish list.

## 4. Verify every candidate before logging it

For each candidate:

1. **Confirm it's really missing** by reading the source that would implement it. Search
   `src/` for the obvious component, store action, or column name. A gap you "saw" in a
   screenshot may be behind a button the capture script never tapped.
2. **Check it's not already tracked.** Search `docs/backlog.md` for an open item covering the same
   capability. If one exists and your finding adds detail, enrich that item instead of creating
   a duplicate. Include the `[human]` section, since a product decision may already be parked
   there.
3. **Check it's not already shipped or deliberately removed.** Search `docs/backlog-archive.md`.
   Some features were cut on purpose (for example, the in-app JSON export was removed
   2026-09-26 as unneeded for the pilot). Don't re-propose a cut feature unless something has
   materially changed, and say what changed if you do.
4. **Check it's not an open decision.** `docs/architecture.md` has an "Open decisions" section.
   A gap that depends on one of those gets logged as needs-review (step 5), not as open work.

Drop anything that doesn't survive this step, and note why for the report.

## 5. Log surviving gaps

Classify each surviving gap before writing it up. The roadmap is explicit: "Do not put research
hypotheses into the unattended `next-item` queue as if they were approved features."

- **Ready to build:** scope is bounded, the brand and roadmap already support it, and you can
  write acceptance criteria without inventing product policy. Log as a normal open item.
- **Needs a product decision:** the gap is real, but building it requires a choice only the user
  can make (pricing, who the audience is, whether a feature fits, which of two reasonable
  designs). Log it with `Status: needs-review` in the tag so `next-item` skips it. State the
  specific decision needed at the top of the item.
- **Needs a human to do something** (user research, device testing, a dashboard setting): add
  it under `## Human setup / device verification` with a `**[human]**` tag instead. No score.

For each item added to `## Features`:

- Number it one higher than the highest `item N` / `Item N` referenced anywhere in
  `docs/backlog.md` or `docs/backlog-archive.md`.
- Match the house format: `- [ ] **Item <N> — <title>.** <body> [Effort: N, Value: N, ROI: X]`.
- The body states the user problem first (which journey, what the lifter can't do today), then
  the proposed scope, then acceptance criteria that a Playwright spec could check. Cite the
  evidence: the screenshot filename and/or the source location that proves the gap, and the brand
  or roadmap passage that makes it worth doing.
- Keep scope small. If a gap is big, split it into ordered items and note "Depends on" between
  them, the way items 76–81 are ordered.
- Self-score Effort and Value on the Fibonacci scale in `docs/backlog.md`'s Prioritization section.
  Don't ask the user. Value should reflect how directly the item serves the brand's core loop
  (record, repeat, understand). Items that only matter for a public launch score lower while the
  product is still a two-user pilot, unless the roadmap says otherwise.
- If you add a group of related items, add a short dated intro paragraph above them in
  `## Features` (like the notes above items 49–55 and 76–81) saying they came from a pm-review
  run and summarizing any cross-item decisions.

When step 2's screenshots show the gap, attach them once the issue exists:
`node scripts/issue-shot.mjs <N> <screenshot file>...`, then comment the link lines it prints on
the issue (`docs/backlog.md` > Screenshots in issues). If the helper fails, skip them.

Then regenerate the "Priority order" line the same way `next-item` does: eligible items only
(no blocked, needs-review, or human), ROI descending, then Value descending, then document order.

If an inventory check found that `docs/product-roadmap.md`'s "RepBunny today" column or roadmap
list is out of date (a feature listed as missing has shipped), fix those specific cells so the
next review starts from accurate ground. Don't rewrite the roadmap's direction or priorities.
That's the user's call.

## 6. Clean up, commit, and push

If you started the dev server in step 2, stop it now.

Delete every screenshot run's directory under `logs/ux-review/` except the one from this
invocation. Leave this run's screenshots in place so the user can spot-check a finding.

If a repo file changed (for example `docs/product-roadmap.md`, if you corrected it), ship it as a
pull request: `docs/architecture/commit-policy.md` > Shipping a change outside a lane (`main`
takes only PRs, #681). This is a docs-only change, so no build or e2e gate applies. Commit subject:
`Add backlog item(s) from pm-review: <short summary>`. If nothing changed, there's nothing to
commit.

## 7. Report

Summarize directly in your response, not in a file. No em dashes in the report.

```
## PM review

<N> screens and <M> components reviewed. <A> ready-to-build item(s), <B> needs-review item(s),
<C> human task(s) added.

### Ready to build
- Item <N>, <Title> [ROI X]: <one-sentence user problem, citing evidence>
...

### Needs your decision (logged as needs-review)
- Item <N>, <Title>: <the specific decision needed>
...

### Considered and dropped
- <gap>: <why dropped: already shipped / already tracked / off-brand / deliberately cut>
...

### Roadmap corrections
- <what was stale and what it now says>
```

Omit any empty section. If nothing was added, say so plainly. For each needs-review item, tell
the user that removing `Status: needs-review` from its tag (or asking you to) releases it to the
runner.

## Hard rules

- **Dated owner steps (#746).** Anything you file or comment that needs the owner on or after a date (a deadline, a check-back, an `On hold until`) carries `<!-- owner-date: YYYY-MM-DD[THH:MM] | <short what> -->`, and a dated ask uses `ask-dean.mjs --owner-date`, so it lands on the owner's Google Calendar (`docs/backlog-runner.md` > Owner calendar). Dates only you act on don't need one.
- Never log a gap you haven't verified against the current source.
- Never log a duplicate of an open, parked, or already-shipped backlog item. Enrich instead.
- Never log a feature that fails the brand's five-question filter or sits in the roadmap's
  "Not prioritized" list.
- Never put an item that needs a product decision into the queue as open work. Use
  `Status: needs-review`.
- Never touch existing `[human]`-tagged items or change existing items' scores.
- Never run against a real pilot device's data. The capture script only uses its own fresh local
  database.
- This skill only edits `docs/backlog.md`, factual cells in `docs/product-roadmap.md`, and (if a
  selector broke) `scripts/capture-ux-screenshots.mjs`. It doesn't build the features it finds.
  That's `next-item`'s job on a later run.
