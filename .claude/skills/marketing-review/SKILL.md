---
name: marketing-review
description: Monthly marketing routine (#577). The owner is short on marketing time and experience and can't hire for it, so this skill does the thinking and files every small `human` task worth doing that brings in new users, with no monthly limit (post a clip of a new feature, reply to store reviews, pitch a fitness newsletter or subreddit by its rules, a capped paid test when the budget allows), each with drafted text, where to post it, time, expected effect, and cost. Also audits repbunny.app, Dean Phillips's blog (deanphillips.dev), the app, and the store listing for marketing problems and opportunities (brand and privacy drift, missing store links, unused share or rating moments), filing repo changes as needs-review issues, reads the owner's public social profiles when the network allows, and logs each month's numbers and trend on the standing marketing log issue. Never posts anything itself. Runs headless as a monthly routine (/marketing-review headless) or interactively.
argument-hint: "[headless]"
---

# marketing-review

**Paused?** Headless runs first run `node scripts/automation-paused.mjs --strict`. If it prints `PAUSED` (exit 10), output `PAUSED` and stop: no issues filed, nothing changed (#682, `docs/backlog-runner.md` > Pausing automation).

The agent does the marketing thinking; the owner does the doing. Each month this skill reads
where RepBunny stands, finds every action worth doing to bring in new users for the time and
money the owner has, and files them as small, ready-to-do `human` issues. It never posts, emails,
buys, or replies to anyone itself.

Read first: `docs/decisions.md` (Product and Writing sections: the privacy promise, Android-first
promotion, the marketing rules, no site analytics), `docs/brand-identity.md`,
`docs/store-listing.md`, and the "Scheduled reviews" section of `docs/backlog-runner.md`. Don't
read `docs/architecture.md` or the topic files unless a step names one.

## Modes

- **Headless** when invoked as `/marketing-review headless` (the monthly routine's prompt), or
  when no user can answer. Never ask anything; make the most reasonable call and say what you
  chose in the issue or the report.
- **Interactive** otherwise. Same steps, and the owner can be asked for this month's numbers and
  budget before tasks are sized, and shown the drafts before they're filed.

Both modes leave the working tree as they found it: no file edits, no commits. The only writes are
GitHub issues, comments, and labels. Use the scratchpad for notes and drafts.

## GitHub access (laptop and cloud alike)

Cloud sessions refuse GraphQL and the search API, so use the repo-scoped REST API through `gh api`
with explicit `page=` numbers (never `--paginate`), as in `/expiry-radar`:

- **Marketing issues:** `gh api "repos/DeanPhillipsOKC/repbunny/issues?state=all&labels=marketing&per_page=100&page=1"`.
- **Label, once:** if `gh api repos/DeanPhillipsOKC/repbunny/labels/marketing` 404s, create it:
  `gh api repos/DeanPhillipsOKC/repbunny/labels -f name=marketing -f color=f2879c -f
  description='Monthly marketing routine (#577)'`.
- **File:** `gh api repos/DeanPhillipsOKC/repbunny/issues -f title='<title>' -F body=@<file>
  -f 'labels[]=...' --jq .number`; **comment:** `gh api repos/DeanPhillipsOKC/repbunny/issues/<N>/comments
  -F body=@<file> --jq .html_url`; **comments on an issue:**
  `gh api "repos/DeanPhillipsOKC/repbunny/issues/<N>/comments?per_page=100&page=1"`.
- Never comment on an issue labeled `awaiting-dean`; note it in the report instead.

## 1. The standing log, budget, and numbers

Find the open issue labeled `marketing` and `status:needs-review` titled `Marketing: monthly log`.
Create it the first time (labels `marketing`, `status:needs-review`, `effort:1`, `value:1`, so lanes
skip it) with this body:

```
Standing log for `/marketing-review` (#577). The routine adds one comment a month: the numbers,
the trend, what last month's tasks did, and links to this month's tasks.

**Monthly budget:** $0
(Edit the amount above to change it. Tasks never cost more than this; bigger ideas worth
considering go in the monthly comment, never as tasks.)

**Social accounts:** none listed yet
(Add a public profile link per platform, for example `TikTok: https://www.tiktok.com/@...`. The
routine only reads public pages; it never signs in or posts.)

**Numbers for the routine:** once a month, before the 5th, add a comment starting with
`Numbers <YYYY-MM>:` and whatever you have from Play Console and App Store Connect: installs,
uninstalls, store listing visitors and conversion, ratings and reviews, Premium purchases, revenue,
and anything you spent. Rough is fine. Missing is fine too; the routine says what it couldn't see.

**Posts:** whenever you promote something, add a comment starting with `Posted <YYYY-MM-DD>:` saying
where and what, with a link if there is one. The routine reads these so it doesn't repeat them.
```

Read the budget from the body (`**Monthly budget:** $<n>`; anything unreadable means $0) and the
social profile links under `**Social accounts:**`. Read the
newest `Numbers <YYYY-MM>:` comment by the repo owner, and the routine's own earlier monthly
comments for the trend. Store dashboards aren't reachable from here, and site analytics are ruled
out (`docs/decisions.md`), so those comments are the only numbers. Never estimate a number that
wasn't given; write `not given`.

## 2. What happened since last month

- **Last month's tasks:** the `marketing` issues the routine filed last run (their `Filed by
  /marketing-review` line). For each: closed done, closed skipped, or still open. Check any comment
  the owner left on how it went. A task left open a whole month is a signal it was too big or not
  worth it; don't file the same kind again next month without making it smaller.
- **What's been done:** comments starting `Posted <YYYY-MM-DD>:` on `Marketing: monthly log` list
  everything actually posted, on which platform, and when, including work that never had an issue.
  Don't file a task to post something they already list on that platform, and use them to space out
  posts and pick what hasn't been promoted yet.
- **What shipped:** release notes since the last run (`release-notes/*.json`, newest first), and
  the merged PRs' titles from
  `gh api "repos/DeanPhillipsOKC/repbunny/pulls?state=closed&sort=updated&direction=desc&per_page=50&page=1"`.
  New user-facing features are the raw material for posts.
- **Where we're live:** `docs/decisions.md` says which stores are public and how to describe the
  others (the iPhone app is "coming soon" until the App Store launch). Every task follows it.
- **What exists to reuse:** demo video scripts in `scripts/demo-video/` (`social-intro.mjs`,
  `overload-video.mjs`, `guide-clips.mjs`, and the rest) and the guides in `site/guides/`. A task
  that needs a clip names the script and command that makes it, rather than asking the owner to film.

## 3. Audit the blog, the site, the app, and social

Look at everything a possible user or reader sees, for two things: **problems** (drift from
`docs/brand-identity.md` or the privacy promise, broken or stale paths to the app) and
**opportunities** (places that could bring in or keep users but don't yet). Check each candidate
against the live source before it counts.

- **The RepBunny site** (`site/` in this repo, live at repbunny.app): home, features, privacy,
  guides, release notes. Is the Google Play badge on every page someone lands on? Does the home
  page say in the first screen what RepBunny is and who it's for? Do guides end with a way to get
  the app? Are page titles and descriptions specific enough to be found in search? Is there a page
  for a search people actually make (for example "workout log app with no account") that we could
  honestly answer?
- **Dean Phillips's blog** (the `DeanPhillipsOKC/deanphillips.dev` repo when the session has it,
  otherwise the live deanphillips.dev, or `gh api repos/DeanPhillipsOKC/deanphillips.dev/contents/<path>`).
  The blog is the owner's own voice about building RepBunny with AI agents, so it reaches
  developers more than lifters. Check that posts mentioning RepBunny link to repbunny.app or the
  Play listing, that public posts point to the native app and never the web app, and that they
  stress that data stays on the phone. Opportunities: a post that would interest lifters, a
  RepBunny link or call to action missing from a popular post, a post worth turning into a social
  clip. The blog's own rule: the experiment framing (best practices apply to every app; personal
  claims scoped to RepBunny). Blog changes are the owner's; file them as `human` tasks, not edits.
- **The app** (the source under `src/`, the store listing in `docs/store-listing.md`): moments
  where a happy user could tell a friend or rate the app and nothing helps them (within the rating
  rules in `docs/decisions.md`), screens that would make good marketing shots and aren't used,
  onboarding copy that undersells it, a Premium pitch that's unclear. Anything that would add a
  network request, analytics, an account, or a prompt the decisions page rules out is not an
  opportunity; drop it.
- **Social accounts.** The handles live on the log issue (step 1). Read their public profile pages
  with WebFetch when the network allows (follower counts, the last few posts and their visible
  likes or views). Most platforms block logged-out reads; when one does, say so and use the
  owner's `Numbers` comment instead. Never sign in, follow, like, or post.
- **Pasted post text** in closed `marketing` issues since the last run.

Problems to flag: a claim the app doesn't back up, anything implying data leaves the phone or is
collected, a feature named the old way (Routines, not Plans), the iPhone described as available
before it is, an off-tone line the brand guide rules out, a "free" claim that contradicts the
Premium split, a dead or missing link to the store.

**Filing:** every finding worth fixing, problems first; there's no monthly limit. Something the
owner does (a blog edit, a profile bio, a pinned post) is a `human` task under step 5. Something an agent could change in this repo (site copy, a missing badge, an app
screen) is a normal backlog issue: label `marketing` plus `documentation` for site or listing text
or `feature` for app changes, scored on the Fibonacci scale in `docs/backlog.md`, deduped against open
and closed issues (`issues?state=all&per_page=100&page=N`, filter titles yourself), always with
`status:needs-review` so the owner releases it before a lane touches it. Nothing worth filing is a
fine result; say so in the log comment.

## 4. Pick this month's tasks

File every `human` task worth doing; there's no monthly limit, because the owner wants to promote
as much as they can (2026-11-06). Don't pad: a task still has to be likely to bring in new users.
Rank by expected new users per hour of the owner's time, using what last month's results showed,
and give the best ones the higher `value:` so they sort first. A run later in a month that already
had one still does the full review and files anything new that's worth doing; dedupe against what's
open instead of stopping. Good shapes:

- **Post a clip of something that shipped**, on one named platform the owner already uses
  (the intro videos went to Facebook and TikTok), with the caption drafted.
- **Reply to store reviews** the owner mentioned or that the numbers show arrived, with replies
  drafted for each kind (praise, bug, request). Never offer anything for a changed rating.
- **Ask the people who already use it** (the closed-test testers) for an honest rating, once,
  with the message drafted. Never ask only happy users or gate the ask on sentiment.
- **Pitch one community** (a small fitness newsletter, a lifting subreddit, a forum) whose rules
  allow it: link the rules, say what they allow, and draft a post that adds something on its own
  (a lifting tip, a how-it-works) rather than an ad. One community per task.
- **A paid test**, only when the monthly budget is above $0: one platform, a dollar cap at or under
  the budget, a run length, the one number to watch, and the stop condition.

**Over budget, worth considering.** Spending ideas that cost more than the budget are never filed
as tasks, but the owner wants to hear about the good ones. Put at most 2 in the log comment's
`Worth considering` line: what it is, the smallest sensible spend, why it could pay off now (tie it
to the numbers or what shipped), and how to measure it. Only ideas with a clear reason; never the
same one two months running unless something changed. A paid ad test, a sponsored spot in a small
lifting newsletter, or promo codes for a giveaway are the kind of thing that fits.
- **Fix the store listing's first impression** (the first screenshot, the short description), when
  the numbers show visitors but few installs.

Every task must:

- Take the owner 45 minutes or less. Split anything bigger.
- Carry its text ready to paste. Write it to read like the owner wrote it: follow the `humanizer`
  skill when it's available, and in any case no em dashes, no emojis, no hype words ("game-changer",
  "revolutionary", "unlock"), first person, plain and specific.
- Match `docs/decisions.md`: no claim that implies data collection or a cloud account, nothing that
  says the iPhone app is out before it is, the name is just "RepBunny".
- Never use dark patterns, fake accounts, astroturfing, review gating, buying reviews, or posting
  where the rules forbid self-promotion.
- Not repeat a task from the last two months unless last month's showed it worked.

## 5. File the tasks

Dedupe each against open `marketing` issues first. Title: `Marketing <YYYY-MM>: <the action, in a
few words>`. Labels: `human`, `marketing`, `effort:<1|2>`, `value:<2|3|5>` (higher when the numbers
or last month back it up). Body:

```
**What:** <one sentence>
**Where:** <platform, community, or console, with the link>
**Time:** <minutes>
**Cost:** <$0, or the cap>
**Why now:** <what shipped or what the numbers show>
**Expected effect:** <in plain words, honest about uncertainty>
**How we'll know:** <the number to report in next month's `Numbers` comment>

## Steps
1. ...

## Ready to paste
<the drafted text, per platform or reply kind>

When it's done, close this with a line on how it went (even "posted, no idea yet" helps next
month's pick). Close it as not planned if you'd rather skip it; the routine learns from that too.

Filed by /marketing-review (<headless|interactive>) on <YYYY-MM-DD>.
```

## 6. Log comment and notification

Post one comment per run on `Marketing: monthly log`:

```
## <YYYY-MM>

**Numbers:** <the given numbers with month-over-month change, or "No numbers comment this month.">
**Trend:** <one or two sentences>
**Last month's tasks:** <#N done / skipped / open, and what they seemed to do>
**Social:** <followers and recent post reach per account, or why it couldn't be read>
**Audit (site, blog, app):** <clean, or the issues filed>
**This month:** <#N, #N, #N>
**Budget:** $<n>
**Worth considering (over budget):** <at most 2 ideas with the smallest spend and why now, or "nothing this month">
```

Then, if the session has a `PushNotification` tool, send one: how many tasks were filed, the first
one's title, and the log link.

## 7. Report

Print it as your final response. No em dashes.

```
## Marketing review, <YYYY-MM-DD>

Filed <K> task(s): #N <title>, ...
Audit (site, blog, app): <clean | filed #N>
Numbers: <given | not given>
Budget: $<n>

### Considered and skipped
- <idea>: <why>
```

Then try to email it (non-blocking, never retried): only if `pwsh` is on PATH, send a short card in
the layout of `.claude/skills/next-item/email-card.md` (banner `&#128227; Marketing` on `#f2879c`;
rows: Tasks, Brand check, Numbers) with `pwsh -File scripts/Send-Notification.ps1 -Subject
"Marketing: <K> tasks" -BodyFile <file> -IsHtml`. Cloud images don't have `pwsh`; skip it there.

## Hard rules

- Never post, publish, email, message, reply to a review, buy an ad, or contact anyone, and never
  sign in to, follow, or like anything on a social account. Every outward action is the owner's.
- Never edit the blog repo; blog changes are `human` tasks.
- No limit on how many `human` tasks or `needs-review` audit issues a run files, but every one has
  to be worth doing. No filed task above the monthly budget; bigger spends go only in the log's
  `Worth considering` line.
- Read-only on the repo: no file edits, commits, or pushes.
- Never put user data, store dashboard exports beyond the totals the owner gave, or secrets in an
  issue or comment.
- Never change labels on issues the routine didn't file, and never comment on `awaiting-dean`
  issues.
