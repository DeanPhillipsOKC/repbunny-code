# Backlog

**The backlog lives in GitHub Issues: https://github.com/DeanPhillipsOKC/repbunny/issues** (moved here
from this file on 2026-09-28, backlog item 122). Use the `gh` CLI to read and change it. This file
now only holds the conventions and the old-number map. `docs/backlog-archive.md` is frozen history
of everything shipped before the move; for work after it, closed issues and their close-out
comments are the record.

## Conventions

- **Check `docs/decisions.md` before filing.** Don't file an issue for an idea it rules out; if a request conflicts with it, flag that to the owner instead.

- **One issue per item.** GitHub assigns the number (`#N`); never pick one yourself.
- **Scores are labels:** `effort:N` and `value:N` on the Fibonacci scale (1, 2, 3, 5, 8, 13).
  Effort is implementation size; Value is combined technical and business worth. ROI = Value /
  Effort, computed on the fly (not stored). Whoever files an item scores it; the user doesn't want
  to be asked.
- **Kind:** `feature`, `bug`, or `tooling`.
- **`ux-intensive`:** layout/visual-heavy work (faithful mockup builds, new screens or dialogs,
  alignment and spacing, phone-width responsiveness). Smaller models tend to struggle here and the
  user finds a frontier model cheaper overall since it usually gets it right the first time.
  `next-item` always drafts a mockup (`docs/design/issue-<N>-*.html` + `.png`) before writing any
  code or running e2e. On a frontier model (Opus class) it picks the design itself, headless too,
  and records it as an issue comment starting `Mockup chosen by next-item:` (since 2026-10-09).
  On a smaller model it warns and asks before starting one (or, headless, stops with
  `UX_INTENSIVE: ...`), and the user approves the mockup (`Mockup approved:`);
  `node scripts/next-issue.mjs --top --no-ux` gives the best pick without them.
- **`lane:<ux|features|bugs|tech>` / `model:<opus|sonnet>`** (#236): optional overrides for the
  backlog lanes. Without them an issue's lane comes from its labels (`ux-intensive` > `bug` >
  `feature` > tech) and its model from the lane. See `docs/backlog-runner.md` > Backlog lanes.
- **Skip markers** (the runner never picks these): `status:blocked`, `status:needs-review`. Put the
  reason in a comment. Remove the label to unblock. `status:verify` and `verify:iphone` are skipped
  too (Owner check below).
- **Owner check, `status:verify` / `verify:iphone`** (2026-11-03, after the Play launch): the owner wants eyes on every
  change they could see before it goes into a store release. A shipped change gets an owner check
  when it **adds or changes how the app works, changes the UI or UX, or fixes a bug that's easy to
  reproduce by hand**. It doesn't when it fixes an obscure edge case that's hard to reproduce, only
  touches tests or e2e, or is tooling, CI, docs, or a refactor with no visible change. When unsure,
  give it one. Such a change's commit and PR body say `Issue: #N` instead of `Fixes #N`, so the merge
  leaves the issue open; then the issue gets `status:verify`, is assigned to the owner, and its
  close-out comment has a **How to test** section (which Dev build has it, the steps, what to look
  for). When the nightly `RepBunny (Dev)` release includes it, `scripts/Release-PersonalAndroid.ps1`
  comments the exact Obtainium version on the issue.
  **Which phone:** the How to test section starts with `Test on: Android`, `Test on: Android and
  iPhone (<why>)`, or `Test on: iPhone only (<why>)`. Android is the default; iPhone is added when
  the platforms can differ (native functionality, `ios/` or `android/`, a Capacitor plugin,
  platform-branching code, or a separate path per store). Android in that line means
  `status:verify`; iPhone means `verify:iphone`. There's no iPhone build before a store release, so
  the iPhone check happens on the TestFlight build `/release` uploads, before submitting to App
  Review. When Android checks out on an issue that has both, `status:verify` comes off and
  `verify:iphone` stays until the TestFlight check.
  The owner closes it once it works the way they meant, or says what's wrong: that becomes a
  new `bug` issue linked to it (`Caused by #N`), and the original closes. `/release` lists the
  `status:verify` issues going out and asks before cutting, and lists the `verify:iphone` ones to
  check in that TestFlight build (`.claude/skills/release/SKILL.md`). `/waiting` shows both.
  Everything else keeps `Fixes #N` and closes on merge. The close-out says which with an
  `Owner check: yes` or `Owner check: no (<reason>)` line.
- **Not-before dates** (#749): an issue that can't be worked until a date (it needs time to
  pass, not the owner) carries `<!-- not-before: YYYY-MM-DD | <one-line reason> -->` in its body
  or a comment; the latest marker wins. `next-issue.mjs` skips it, so `dispatch-lanes.mjs` never
  fires a lane for it, until that date (UTC), then it is eligible with no label change. Lanes write
  it with `node scripts/snooze-issue.mjs <N> <date> "<reason>"` (at most 30 days out; a longer wait
  is an owner question). Use it instead of `status:blocked` plus an owner reminder. Skills that
  file date-bound follow-ups (`review-pr`, the monthly reviews) add the marker when they file.
  `node scripts/next-issue.mjs --snoozed` lists them; `/process-review` reports them.
- **`upstream-hold`** (waiting on an outside release: a package, plugin, or tool): the issue
  also carries `status:needs-review` so the runner skips it, and its body has an **Unblock check**
  section with a concrete, repeatable test (a version to look for, a compatibility table to read).
  The monthly `/process-review` runs each check. When every condition holds it comments with the
  evidence and removes `upstream-hold` and `status:needs-review` itself, so the runner picks the
  issue up (an issue that also has `interaction-required` waits for an attended session, as #512
  does for its laptop build). Otherwise it reports how long the hold has aged. Pair every
  Dependabot ignore with one of these so a hold can't rot (examples: #519, #512).
- **Blocked by another issue:** use GitHub's "blocked by" link (issue sidebar > Relationships, or
  `gh api -X POST repos/{owner}/{repo}/issues/<N>/dependencies/blocked_by -F issue_id=<blocker id>`)
  rather than `status:blocked`. `next-issue.mjs` skips an issue while any of its blockers is open
  and picks it up on its own once they close.
- **`human`** (only the user can do it: accounts, devices, money, dashboard settings): scored with
  effort/value like everything else (effort = the user's time and hassle). The unattended runner
  never works them, but lists the top few as "Waiting on you" in its summaries and emails, and an
  interactive `/next-item` offers to walk the user through the top one when it outranks the best
  AI pick (skippable each time). `node scripts/next-issue.mjs --human` lists them ranked. A weekly
  email digest (`.github/workflows/human-digest.yml`, Mondays) sends the top three, the ones that
  unblock AI issues, and stale ones. To pause one, comment `On hold until YYYY-MM-DD` (as the
  latest comment; the calendar's sync records after it don't count): the digest lists it as on
  hold until that date instead, and the date goes on
  the owner's Google Calendar (`docs/backlog-runner.md` > Owner calendar, #746).
- **`interaction-required`** (2026-10-10): an agent can do most of the work, but the issue can't be
  finished without the user, e.g. it needs a device test, or a native build or signing step the
  cloud can't run (Swift/WidgetKit, Xcode). Scored like any issue. No unattended run or lane
  routine picks it; like `human`, it's listed by `next-issue.mjs --human`, sent in the weekly
  digest, and offered by an interactive `/next-item`, which then works it with the user there for
  the parts only they can do. A run that finds out partway that its issue needs the user adds this
  label, comments what's left and why, releases its claim, and asks the owner on the issue
  (`scripts/ask-dean.mjs`, which notifies their phone) so it can't sit unseen. The owner's answer
  A ("unblocked") is picked up by the next headless or lane run, which removes the label so the
  issue is eligible again (2026-10-14; before that an answered issue sat until someone removed the
  label by hand). Otherwise remove the label when the blocker is gone (e.g. the cloud gains the tool).
- **Screenshots in issues** (2026-10-10): `node scripts/issue-shot.mjs <N> <image>...` puts
  images on the `claude/issue-assets` branch (images and sprint review clips only, never merged, one folder per issue) and
  prints `[Screenshot: <name>](<link>)` lines to paste into the issue or a comment. They're links,
  not inline images: the GitHub app doesn't show private-repo images inline, and the owner chose
  tapping a link over a public image host. Keep images at phone width and small (well under the
  helper's 2 MB cap). ux-review and pm-review attach the screenshots behind each finding;
  next-item attaches a mockup or guide screenshot it already has to its close-out.
  It also takes a sprint review clip's `segment.mp4` (up to 10 MB, printed as `[Clip: ...]`, #605), and the
  whole review video as `node scripts/issue-shot.mjs review-<X.Y.Z> <mp4>` (up to 25 MB, #606).
- **`notify-reporter` / `reporter-notified`:** set by `triage-support` only. `notify-reporter`
  means someone asked to be emailed when the fix ships ("Email me when it's fixed" in Report a
  bug). Their Gmail link in the issue is marked `(asked to hear back)`, and their address never
  goes in GitHub. Once the issue is closed and the note has gone out, it becomes
  `reporter-notified`. Neither label affects the runner.
- **`awaiting-dean` / `dean-replied`** (#227): a skill or routine asked the owner a question on the
  issue through `.github/workflows/ask-dean.yml` (`awaiting-dean`), and the owner answered
  (`dean-replied`, set by `.github/workflows/dean-replied.yml`). The asker acts on the answer and removes
  `dean-replied` and any leftover `awaiting-dean`. Agents never comment on an `awaiting-dean` issue
  themselves. See `docs/backlog-runner.md` > Asking the owner. Lanes and `next-issue.mjs` never pick an
  issue labeled `support`, `awaiting-dean` or `dean-replied` (#335), whatever else it carries.
- **`review:requested` / `review:changes-requested` / `review:approved` / `review:auto-merge` / `review:owner-approved` / `review:asked-owner`**
  (#374, #680): the adversarial review of every lane PR. The first four go on the PR: waiting for
  the `/review-pr` routine, sent back with blockers, passed while `main` moved, or a tier 1 or 2
  PR that passed and merges itself once CI is green (#1020; `pr-merged.yml` fires the close-out).
  `review:owner-approved` goes on a tier 3 PR the owner approved while `main` moved, so the lane
  may merge it. `review:asked-owner` goes on the issue when a second review still found blockers,
  or a tier 3 PR passed review, and the owner was asked. Lanes skip
  an issue whose PR is `review:requested` and one labeled `review:asked-owner`; an issue whose PR
  is `review:changes-requested` or `review:approved` comes first in its lane so the lane finishes
  that PR. See `docs/backlog-runner.md` > Review.
- **`android-qa-batch`** (#341): the one open issue that collects manual Android checks from shipped
  items (see `docs/qa-procedure.md` > Android QA batches). Created and appended to by
  `scripts/qa-batch.mjs`, labeled `human` and `status:needs-review` so lanes skip it; the owner
  closes it after testing a build.
- **`accessibility`:** work that keeps the app usable with larger phone text, a screen reader,
  reduce-motion, or low color vision. The monthly `/accessibility-review` routine (#575) files its
  findings with it, always with `status:needs-review`, under `docs/decisions.md`'s "Accessibility
  means usable, not redesigned for large type".
- **`expiry-radar`** (#576): issues the monthly `/expiry-radar` routine files. A dated `human`
  checklist (`Expiry radar <YYYY-MM>: ...`) when something in `docs/expiry-register.md` or a store
  deadline is close, and the standing `Expiry radar: monthly log` issue (`status:needs-review`, so
  lanes skip it) that gets one all-clear comment in quiet months. The owner closes a checklist
  once every line is renewed. See `docs/backlog-runner.md` > Scheduled reviews.
- **`marketing`** (#577): issues the monthly `/marketing-review` routine files. Small `human`
  tasks (`Marketing <YYYY-MM>: ...`) with the text drafted, audit findings for this repo's site
  or app (always `status:needs-review`), with no monthly limit on either, and the standing
  `Marketing: monthly log` issue (`status:needs-review`, so lanes skip it) that holds the monthly
  budget, the owner's `Numbers` comments, and one log comment per run. `Posted <YYYY-MM-DD>:` comments there list what's actually been posted, and the routine reads them, so an agent told about a post adds one. The owner closes a task
  with a line on how it went. See `docs/backlog-runner.md` > Scheduled reviews.
- **Picking the next item:** `node scripts/next-issue.mjs` lists the eligible issues ranked by ROI,
  then Value, then oldest first; `--top` prints just the pick. The `next-item` skill ships one issue
  per run with a `Fixes #N` commit (`Issue: #N` when it gets an owner check, above) and a close-out
  comment (what changed, files, decisions, docs checked, gate result); the lane routines run it (see
  `docs/backlog-runner.md`).
- **Release notes (#101):** a shipped change a user would notice (a new feature, a visible behavior
  change, or a fix to a bug a user could have hit) adds one short, user-facing line in the same
  commit, as its own file `release-notes/<issue>.json` (`{ "text": "..." }`, #558). The commit
  that adds the file sets its date and build, so there's no shared list to edit or conflict on.
  Tests, e2e flakiness, tooling, CI, refactors, docs, and the
  backlog runner add nothing, and so do catch-alls like "Improved reliability". See
  `docs/architecture/client.md` "What's new".
- **Guides (#102):** a new feature whose use isn't obvious from its one-line note gets a how-to
  page under `site/guides/<slug>/`, with screenshots from `scripts/capture-guide-screenshots.mjs`,
  and its release note links it as `{ "text": "...", "guide": "<slug>/" }`. Tweaks, fixes, and
  self-explanatory features don't. Reverting or removing a feature deletes its guide (folder,
  index card, images, script steps) and unlinks its note; changing one updates its guide. See
  `docs/architecture/site-and-tools.md` "Marketing site". To catch guides that were never written or went
  stale, run `/help-review` (#110) interactively: it reports the gaps, the user picks which to
  write, and it dedupes against open and closed issues before offering one. Its monthly routine
  (`/help-review headless`, #571) files the same gaps as `status:needs-review` issues instead.
- **Rough issues are fine.** File a quick issue with no labels (e.g. from the GitHub phone app while
  testing); it stays invisible to the runner until `/refine-backlog` researches it against the
  source, asks the user anything only they can decide, rewrites it into a builder-ready spec
  (Problem / Evidence / Scope / Out of scope / Acceptance, original report kept in a collapsed
  block), and adds the labels. Run it interactively, not headless.
- **Support email:** `/triage-support` reads the "RepBunny Support" Gmail label (hello@repbunny.app,
  including in-app Report a bug emails), recommends an issue for each real bug or request and asks
  before filing it (as recommended, changed, or parked as `status:needs-review`; never naming the
  sender), drafts a reply and offers Send, Discard, or Revise, and labels each thread
  "RepBunny Support/Triaged". Run it interactively, or as a routine with
  `/triage-support headless` (#228): it opens a `support` tracking issue per thread, asks the owner
  there through `ask-dean`, and on their reply sends the approved text in the thread and files the item. A routine runs it
  only when mail is waiting (#309; `docs/backlog-runner.md` > Support triage).
- **Design references** (mockups, the brand guide, architecture) stay in the repo under `docs/`;
  issues link to them.
- **Dedupe before filing:** `gh issue list --state all --search "<keywords>"` covers open and closed
  issues; also grep `docs/backlog-archive.md` for anything shipped before the move.

## Old item numbers → issues

Code comments and older docs cite `docs/backlog.md` item numbers ("item 117"). Those are not issue
numbers. Items open at the move:

| Old item | Issue | Title |
| --- | --- | --- |
| 99 | #1 | "Reset my data" alongside Delete account |
| 112 | #2 | Let the user pick a template's category |
| 113 | #3 | Rename a template |
| 114 | #4 | Celebrate a first-ever exercise as a first, not a PR |
| 116 | #5 | Quieter Finish button; confirm before finishing early |
| 118 | #6 | Redesign the Templates page's create/edit flow |
| 119 | #7 | Keep exercise lists alphabetical |
| 120 | #8 | `edit-past-workout.spec.ts` notes flake (likely a real race) |
| 121 | #9 | Replace the rest-screen bunny art |
| (human setup) | #10–#18 | Device tests, RLS check, domain, and other manual tasks (label `human`) |

Item 122 (this migration) was done interactively and isn't an issue. Every other item number up to
121 had already shipped or been dropped; see `docs/backlog-archive.md`.
