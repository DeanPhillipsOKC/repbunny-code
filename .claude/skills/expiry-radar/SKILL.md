---
name: expiry-radar
description: Monthly check for anything that can expire or fall behind a store deadline and quietly break RepBunny (#576). Checks what an agent can (Google Play target API and min SDK, Apple's minimum Xcode and iOS SDK, Capacitor majors and support policy, repbunny.app domain and TLS expiry, and the dates in docs/expiry-register.md), lists what only the owner can see with the exact dashboard path, and files one dated `human` checklist issue when something expires within 90 days or a store deadline is within 120 days; otherwise posts a one-line all-clear on the standing radar issue. Adds calendar reminders when a Google Calendar connector is available. Runs headless as a monthly routine (/expiry-radar headless) or interactively.
argument-hint: "[headless]"
---

# expiry-radar

**Paused?** Headless runs first run `node scripts/automation-paused.mjs --strict`. If it prints `PAUSED` (exit 10), output `PAUSED` and stop: no claims, no issues filed, nothing changed (#682, `docs/backlog-runner.md` > Pausing automation).

Certificates, keys, memberships, and store deadlines expire silently, and the owner has little
time to watch dashboards. This skill is the monthly nudge: it checks what it can, reads the dates
the owner keeps in `docs/expiry-register.md`, and raises one `human` issue only when something
needs action soon. A quiet month costs the owner nothing but a one-line comment.

Read `docs/expiry-register.md` (the source of truth for what's tracked) and the "Scheduled
reviews" section of `docs/backlog-runner.md`. Don't read `docs/architecture.md` or the topic files
unless a check below names one.

## Modes

- **Headless** when invoked as `/expiry-radar headless` (the monthly routine's prompt), or when no
  user can answer (`claude -p`). Never ask anything; make the most reasonable call and say what
  you chose in the issue or the report.
- **Interactive** otherwise. Same steps, and the owner can be asked for dates the register lacks
  and to add calendar events with a connector the cloud run didn't have (step 5).

Both modes leave the working tree as they found it: no file edits, no commits. The only writes
are GitHub issues, comments, labels, and (when the connector exists) calendar events. Use the
scratchpad for notes.

## GitHub access (laptop and cloud alike)

Cloud sessions refuse GraphQL and the search API, so use the repo-scoped REST API through
`gh api` with explicit `page=` numbers (never `--paginate`), as in `/process-review`:

- **Radar issues:** `gh api "repos/DeanPhillipsOKC/repbunny/issues?state=all&labels=expiry-radar&per_page=100&page=1"`.
- **Label, once:** if `gh api repos/DeanPhillipsOKC/repbunny/labels/expiry-radar` 404s, create it:
  `gh api repos/DeanPhillipsOKC/repbunny/labels -f name=expiry-radar -f color=c5def5 -f
  description='Monthly expiry radar (#576)'`.
- **File:** `gh api repos/DeanPhillipsOKC/repbunny/issues -f title='<title>' -F body=@<file>
  -f 'labels[]=...' --jq .number`; **comment:** `gh api repos/DeanPhillipsOKC/repbunny/issues/<N>/comments
  -F body=@<file> --jq .html_url`; **edit a body:** `gh api -X PATCH
  repos/DeanPhillipsOKC/repbunny/issues/<N> -F body=@<file>`.
- Never comment on an issue labeled `awaiting-dean`; note it in the report instead.

## 1. Gather the dates

Set `TODAY` from `date -u +%Y-%m-%d`. Build one list of items, each with: name, impact (1 to 4),
date (or `unknown`), source (register, repo, or the URL looked up), who renews, and the dashboard
path from the register.

### 1a. The register

Parse every table row in `docs/expiry-register.md`. A `YYYY-MM-DD` in "Expires on" is a date; `?`
is unknown; text like "No expiry" or "n/a" means the row is a standing check with no date. Rows
marked `(radar)` get their date from 1b or 1c. The leading digit of "Impact" is the item's impact
(1 Users, 2 Releases, 3 Pipeline, 4 Low; defined at the top of the register). An item found only
in 1b or 1c with no register row (a plugin, say) takes the impact of the closest row and says so.

### 1b. Store and platform deadlines (public pages)

Use WebFetch (or `curl`) on the official pages, and quote the requirement and its date:

- **Google Play target API.** developer.android.com/google/play/requirements/target-sdk (and
  support.google.com/googleplay/android-developer/answer/11926878). Compare the required level
  for new apps and updates, and its date, with `targetSdkVersion` in `android/variables.gradle`.
  Behind the requirement, or a future requirement the repo doesn't meet yet, is a deadline item
  dated the day it takes effect.
- **Apple minimum SDK.** developer.apple.com/news/upcoming-requirements. Compare the Xcode and
  iOS SDK it requires for new submissions, and the date, with `xcode:` in `codemagic.yaml`
  (Codemagic's image builds with that Xcode) and the highest `IPHONEOS_DEPLOYMENT_TARGET` in
  `ios/App/App.xcodeproj/project.pbxproj`.
- **Capacitor.** `npm view @capacitor/core version` and `npm view @capacitor/core time --json`
  for the latest major and when it shipped; capacitorjs.com/docs/main/reference/support-policy for
  how long the major in `package.json` gets fixes and which Android and iOS versions it needs.
  A newer major is a finding only when the current one has an end-of-support date or the store
  requirements above need it. Same for each `@capacitor*`/`capacitor-*` plugin in `package.json`
  whose major lags `@capacitor/core`.
- **Deprecation notices in build logs.** List the latest `android-build.yml`,
  `release-play.yml`, and `release-android.yml` runs (`gh api
  "repos/DeanPhillipsOKC/repbunny/actions/runs?per_page=50&page=1"`), fetch one job log each
  (`gh api repos/DeanPhillipsOKC/repbunny/actions/jobs/<id>/logs`), and grep for `deprecat`,
  `will be removed`, `no longer supported`, and Node runtime warnings on actions. Codemagic's logs
  aren't reachable from here; say so.

A page that won't load or doesn't state a date: record the item as `unknown (couldn't check:
<why>)`. Never fill in a date from memory.

### 1c. Domain and certificate (public lookups)

- **Registration expiry:** RDAP for `.app` (Google Registry):
  `https://pubapi.registry.google/rdap/domain/repbunny.app` (or `https://rdap.org/domain/repbunny.app`).
  The `events` entry with `eventAction: "expiration"` is the date.
- **TLS:** `echo | openssl s_client -connect repbunny.app:443 -servername repbunny.app 2>/dev/null
  | openssl x509 -noout -enddate`, or the newest entry from `https://crt.sh/?q=repbunny.app&output=json`.
  Cloudflare renews edge certificates itself, so a date inside 14 days is a finding (renewal
  stuck), not a routine reminder.
- **DNS sanity:** `https://dns.google/resolve?name=repbunny.app&type=NS` returns the nameservers.
  A change from Cloudflare's is worth a line in the report.

Cloud network policies can refuse these hosts (a proxy 403). Then record the item as `unknown
(couldn't check: network policy)` and move it to the owner's list with the register's dashboard
path. Don't retry around a refusal.

## 2. Classify

For each item with a date, `days = date - TODAY`:

- **Overdue:** `days < 0`.
- **Due:** `days <= 90`, or `days <= 120` for a store or platform deadline (the register's last
  table, and anything from 1b).
- **Later:** everything else.

Items with no date are **unknown** (a `?` in the register, or a lookup that failed). Standing
checks with no date (account standing, plan notices) are listed for the owner each
time an issue is filed, and not otherwise.

**Order** every list below by impact (1 first), then by date (earliest first; unknown last). The
owner cares most about what hits users, so a `1 Users` item leads even when a pipeline item is
sooner.

Things the agent can fix (store target API, Xcode in `codemagic.yaml`, a Capacitor major) get a
normal backlog issue too, deduped against open and closed issues
(`issues?state=all&per_page=100&page=N`, filter titles yourself), labeled `tooling`, scored on the
Fibonacci scale in `docs/backlog.md`, and `status:needs-review` so the owner releases it. Link it
from the radar issue. A routine-filed upgrade never goes straight to the runner.

## 3. File or all-clear

### Something is overdue or due

File one issue (or update this month's, if a run already filed one) titled
`Expiry radar <YYYY-MM>: <K> item(s) due, first <name> on <date>` (the first due item in the order
above), labeled `human`, `expiry-radar`, `effort:1` (`effort:2` with more than three items), and
`value:8` (`value:13` when anything is overdue or within 14 days, or any `1 Users` item is due). If an earlier month's radar issue is still open, close it
with a comment pointing at the new one so only one stays open, unless it's `awaiting-dean` (then
leave it and say so in the report).

Body:

```
Monthly expiry radar for <YYYY-MM-DD>. Tick each line once it's renewed, put the new date in
docs/expiry-register.md, and close this issue.

## Due
- [ ] **<name>** [<impact, e.g. 1 Users>]: <date> (<days> days). Check: <dashboard path>. Renews: <who>. <source or quote>
...

## Store and platform deadlines
- [<impact>] <requirement, its date, what the repo has now, the backlog issue filed for it>

## Unknown dates (look up and add to the register; 1 Users first)
- [ ] <name> [<impact>]: <dashboard path>  (<why it's unknown>)

## Standing checks (no date)
- [ ] <name>: <dashboard path>

## Later (no action now)
- <name>: <date>

## Calendar
<events added or updated, or: "No Google Calendar connector in this run; add them with
/expiry-radar in a live session (dates above).">

Filed by /expiry-radar (<headless|interactive>) on <YYYY-MM-DD>. Never put secrets in replies
here; names and dates only.
```

Then, if the session has a `PushNotification` tool (scheduled routines do), send one: lead with
the first due item in the order above (highest impact, then earliest), its impact and date, then
the issue link. Due items are the reason this routine
exists, so never skip that notification when an issue was filed or updated.

### Nothing is due

Post one comment on the standing issue: the open issue labeled `expiry-radar` and
`status:needs-review` titled `Expiry radar: monthly log`. Create it the first time
(labels `expiry-radar`, `tooling`, `status:needs-review`, `effort:1`, `value:1`, so lanes and the
human digest skip it; body: "Standing log for `/expiry-radar` (#576). One comment per quiet month.
The radar files a separate `human` issue when something is due."). The comment is one line:

`All clear on <YYYY-MM-DD>: nothing within 90 days (store deadlines: 120). Next: <name> on <date>. Unknown: <U>, <N> of them 1 Users (<names, 1 Users first>).`

No notification on an all-clear month, unless the run itself failed (step 6). If the number of
unknown dates went up since the last comment, add that to the line, nothing more.

## 4. Never put secrets anywhere

The register and every issue or comment carry names, dashboard paths, and dates only. If a log,
API response, or the owner's reply contains a key, password, token, fingerprint, or where a key
backup lives, leave it out and don't quote it. `docs/decisions.md` > Stays outside the repo.

## 5. Calendar reminders

Look for a Google Calendar connector: ToolSearch for `calendar` and use a tool that lists and
creates events (names vary, for example `mcp__google_calendar__*` or a `gcal` server).

- **Available:** for each item with a date (any class but unknown), make sure two all-day events
  exist: `RepBunny: renew <name> (60 days)` on date minus 60 and `RepBunny: renew <name> (14 days)`
  on date minus 14, each with the dashboard path and the radar issue link in the description.
  Search for an event with the same title first and move it when the date changed; never make
  duplicates. Skip a reminder whose day has already passed. Only these titled events are touched.
- **Not available:** say so in the issue's Calendar section and the report. In an interactive
  session, offer to add them now if the owner connects one; headless, the issue carries the dates.
  Without the connector, the checklist issue carries one `<!-- owner-date: <date minus 14> | renew <name> -->`
  marker for its nearest due item, so the Owner calendar routine adds it when this run couldn't (#746).
  With the connector, add no marker: the two reminders above are the events.

## 6. Report

Print it as your final response. No em dashes.

```
## Expiry radar, <YYYY-MM-DD>

<Filed #<N> | Updated #<N> | All clear, logged on #<N>>.

### Due
- <name>: <date> (<days> days)

### Unknown
- <name>: <why>

### Store and platform deadlines
- <requirement>: <date>, repo has <value> (<ok | backlog #N>)

### Calendar
- <added/updated K events | no connector>

### Couldn't check
- <check>: <why>
```

Omit empty sections. If the run couldn't check anything at all (GitHub refused, the register is
missing), that's a failure the owner needs to hear about: send a `PushNotification` saying what
broke, when the tool exists.

Then try to email it (non-blocking, never retried): only if `pwsh` is on PATH, send a short card
in the layout of `.claude/skills/next-item/email-card.md` (banner `&#9200; Expiry radar` on
`#f2879c`; rows: Due, Unknown, Deadlines) with `pwsh -File scripts/Send-Notification.ps1 -Subject
"Expiry radar: <K> due" -BodyFile <file> -IsHtml`. Cloud images don't have `pwsh`; skip it there.

## Hard rules

- Read-only on the repo: no file edits, commits, or pushes. The owner keeps
  `docs/expiry-register.md`; the radar only reads it.
- Never put secrets in an issue, comment, event, or the report. Names, paths, and dates only.
- Never invent a date. Unknown is a valid answer and goes on the owner's list.
- Never touch a store console, a workflow run, or a release tag.
- Never change labels on issues the radar didn't file, and never comment on `awaiting-dean`
  issues.
