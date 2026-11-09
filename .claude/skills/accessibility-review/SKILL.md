---
name: accessibility-review
description: Monthly check that people with limitations can still use RepBunny, without redesigning the default look (#575). Runs scripts/a11y-scan.mjs (every theme at default size for contrast, tap targets, names and alt text, headings and landmarks; 150% and 200% text on a 320px phone for overlap, clipping, sideways scroll, and controls out of reach; reduce-motion for what keeps moving), then reads the screenshots and source for what the scan can't see (meaning carried by color alone, chart text alternatives). Verifies every candidate against the live source, drops anything whose fix would change the default look, dedupes against open and closed issues, and files at most 5 scored findings with accessibility and status:needs-review, each with a screenshot, the setting used, and the smallest fix. Prints a summary of everything checked so quiet months are visible. Runs headless as a monthly routine (/accessibility-review headless) or interactively.
argument-hint: "[headless]"
---

# accessibility-review

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

**Paused?** Headless runs first run `node scripts/automation-paused.mjs --strict`. If it prints `PAUSED` (exit 10), output `PAUSED` and stop: no claims, no issues filed, nothing changed (#682, `docs/backlog-runner.md` > Pausing automation).

Checks whether someone with low vision, larger phone text, a screen reader, motion sensitivity, or
color blindness can still use the app, and files what's broken as backlog issues the owner
prioritizes. It never fixes anything itself.

Read the `docs/architecture.md` index first (then `docs/architecture/testing.md` if a scan step
fails), and read `docs/decisions.md`. Its entry **"Accessibility means usable, not redesigned for
large type"** is the rule this whole review runs under:

- The app looks its best at default text size. Larger fonts or looser layouts for everyone are
  ruled out. People who need bigger text use the phone's text-size setting.
- At those sizes the app must stay **usable**: nothing overlaps, clips, or blends together,
  scrolling works, every control can be reached and tapped. It doesn't need to be pretty there.
- **A finding whose fix would make the default look worse for most people is not a finding.**
  Propose a fix that only changes behavior at large sizes (a `rem`-based breakpoint, wrapping
  instead of a fixed width, a container query), or that changes nothing visible (a label, an
  `aria-` attribute, a reduce-motion rule), or drop it.

Out of scope: general visual polish and flow (`/ux-review`), product gaps (`/pm-review`).

## Modes

- **Headless** when invoked as `/accessibility-review headless` (the monthly routine's prompt; see
  `docs/backlog-runner.md` > Scheduled reviews), or when no user can answer (`claude -p`). Never
  ask anything; make the most reasonable call and say what you chose in the issue or the report.
- **Interactive** otherwise. Same steps, and it also files without asking: every finding goes in
  as `status:needs-review`, so the owner prioritizes it on GitHub either way.

Both modes leave the working tree as they found it: no file edits, no commits. The scan writes
only to `logs/a11y-review/` (gitignored). A scan step that fails after a UI change (a stale
selector) is filed, deduped, as a `tooling` issue with the failing step and its accessibility
tree from `failures`, never fixed here, and the review reads that screen's source instead.

## GitHub access (laptop and cloud alike)

Cloud sessions refuse GitHub GraphQL and the search API (`gh issue list`, `gh issue create`, `gh
issue comment`). Use the repo-scoped REST API through `gh api`:

- **Dedupe:** dump every issue, open and closed, with explicit pages (`gh api --paginate` fails
  after the first 100), then `grep -i` the file:
  ```
  p=1; while out=$(gh api "repos/DeanPhillipsOKC/repbunny/issues?state=all&per_page=100&page=$p" --jq '.[] | "\(if .pull_request then "PR" else "#" end)\(.number) [\(.state)] \(.title) {\([.labels[].name] | join(","))}"') && [ -n "$out" ]; do echo "$out"; p=$((p+1)); done | grep '^#' > <scratch>/issues.txt
  ```
  Read one with `gh api repos/DeanPhillipsOKC/repbunny/issues/<N> --jq .body`.
- **File:** `gh api repos/DeanPhillipsOKC/repbunny/issues -f title='<title>' -F body=@<file> -f
  'labels[]=accessibility' -f 'labels[]=status:needs-review' ... --jq .number` (one
  `-f 'labels[]=...'` per label).
- **Comment:** `gh api repos/DeanPhillipsOKC/repbunny/issues/<N>/comments -F body=@<file>`.

## 1. Scan

```
node scripts/a11y-scan.mjs
```

It starts its own local-mode dev server on port 5175 (on-device SQLite in the browser, the native
apps' data path: no accounts, nothing written anywhere), seeds a month of workouts in a fresh
database per pass, and stops the server when done. About 5 minutes for all themes. It prints a
JSON summary (`outDir`, `results`, per-check counts, `failures`); the detail is in
`<outDir>/results.json`, with a PNG per screen and pass beside it. `--themes classic,sunrise`
limits the theme list for a quick rerun; `--port` moves it if 5175 is taken.

What each pass measured (all in the results file under `passes[].screens[]`):

| Pass | Setting | Fields |
|---|---|---|
| `default` | each theme (`theme`), default text, 390x844 | `contrast` (text under 4.5:1, large text under 3:1, icon-only controls under 3:1; `backgroundImage: true` means the background was a gradient or image and the ratio is a guess). Classic only: `smallTargets` (under 44 CSS px either way), `unnamedControls`, `images` (no `alt`), `charts` (chart-sized SVGs and their name, or `null`), `headings`, `landmarks`, `lang` |
| `large-150`, `large-200` | Classic, 150% and 200% text (24px and 32px root and body, how `e2e/local/large-font-layout.spec.ts` stands in for Android's font size), 320x700 | `horizontalScroll` (page wider than the phone, with the widest elements), `clipped` (text cut off with no ellipsis), `truncated` (ellipsis or line clamp: a real finding only if the hidden part matters and can't be reached another way), `overlaps` (text lines from different elements crossing), `covered` (a control another element sits on), `unreachable` (a control that can't be scrolled to, or a fixed bar pushed off screen) |
| `reduce-motion` | Classic, `prefers-reduced-motion: reduce`, including a PR celebration | `running` (animations still playing: name, target, duration, iterations) |

The screens: Home, Exercises, Routines, Progress, Workout log, Body weight, an active workout, and
the finish recap. Each has a screenshot named `<pass>-[<theme>-]<screen>.png`.

## 2. Look at what the scan can't measure

Read the screenshots the scan flagged, plus the Classic default and `large-200` set even where it
flagged nothing (the Read tool renders PNGs). Then, from the source:

- **Color alone** (check 6): anything important told only by color. PR badges and records,
  locked vs. unlocked items (Premium previews, milestones), the weekly paw dots, chart series,
  error and success states, the selected option in a segmented control. Each needs a second cue
  (text, an icon, a shape, `aria-pressed`). Grep the components for the class names in the shots.
- **Charts** (check 4): each chart in `charts` needs a name that says what it shows, and a way to
  get the numbers as text (a summary line, a table, or the "show the math" receipts, #578). A chart
  with `name: null` that isn't `aria-hidden` is a candidate.
- **Screen reader order** (check 4): `headings` should read as an outline (one `h2` page title,
  sections under it), and `landmarks` should include `main` and the `Primary` nav. A dialog needs
  `role="dialog"` and a name. The scan only covers what the DOM says; TalkBack on a device is
  #493 (`interaction-required`), so don't refile that.
- **Motion** (check 5): for each entry in `running`, read its CSS. Under reduce-motion, confetti,
  rotating rays, bunny bounces, and slide or zoom transitions should stop or become a fade. Short
  opacity fades and spinners that show progress are fine. `src/style.css` and the components with
  a `prefers-reduced-motion` block (`UnlockCelebration.vue`, `FinishRecap.vue`,
  `ExtrasPicker.vue`) are the pattern; also check the Minimal mascot setting, which stops
  celebration motion for anyone who picks it.
- **Native text size** (check 1): the scan's 150% and 200% stand in for Android's font size
  setting in the WebView (the comment at the top of `e2e/local/large-font-layout.spec.ts`, and
  #492, which fixed the first round). iPhone Dynamic Type and Android's display size can't be set
  from here; say so in the report. A finding only a real phone can confirm says so in its Check
  line, and whoever fixes it adds the device check to the QA batch (`docs/qa-procedure.md`).

## 3. Verify every candidate

The scan is a lead list, not a finding list. Most raw counts are noise; a month with 200 contrast
rows can have two real findings. For each candidate:

1. **Confirm it on the screenshot and in the source.** Read the component and its CSS. Drop
   screenshot artifacts (an animation caught mid-frame, a tooltip open on purpose), contrast rows
   whose element is decorative or disabled (WCAG exempts both), hits on text inside an overlay
   that's meant to cover the page, and tap targets that sit inside a bigger tappable row or label.
   A 44 px target is the iOS guideline; Android asks for 48 dp, so a control between 44 and 48 is
   not worth filing alone.
2. **Group it.** One cause, one finding: the same token failing contrast on every screen (for
   example `--text-dim` on `--surface` in one theme) is one issue that names the token and theme,
   not one per screen. The same layout bug in three screens is one issue if one fix covers them.
3. **Apply the design rule.** Write the smallest fix that leaves the default look alone: a
   theme-token tweak that keeps the theme's feel, a wrap or breakpoint that only triggers at large
   text, a missing label, a reduce-motion rule. If the only fix changes the default for everyone,
   drop the finding and list it under "Dropped" with that reason.
4. **Dedupe** against the issue dump (open and closed) by component, screen, and symptom. A closed
   issue that already fixed it means drop it, unless it regressed: then file a new one that links
   the old one. An open match gets a comment with this run's evidence instead of a new issue (never
   comment on an `awaiting-dean` issue; file a new one that links it).

## 4. File

At most **5 new issues per run**, the highest-value first; list the rest under "Not filed this run".
Each issue:

- **Title:** the symptom and where, e.g. `Workout log runs wider than the phone at 150% text`.
- **Labels:** `accessibility`, `status:needs-review`, its kind (`bug` for something broken,
  `feature` for something missing such as a chart's text alternative, `tooling` for a stale scan
  step), `effort:<E>` and `value:<V>` (Fibonacci, self-scored, never asked), and `ux-intensive`
  when the fix is layout-heavy.
- **Body:**
  ```
  **What:** <one or two sentences, in plain words: who it affects and what they can't do>

  **Setting:** <the pass setting from results.json, e.g. "Classic theme, 150% text (24px root and body), 320x700"> on <screen>

  **Evidence:** <the measured numbers: contrast ratio and colors, the overlapping elements, the page width>, and the source location (`src/components/<File>.vue:<line>`)

  **Smallest fix:** <what to change, and why it leaves the default look alone>

  **Check:** <how to confirm the fix, ideally an e2e assertion in e2e/local/, e.g. extend large-font-layout.spec.ts>

  Filed by /accessibility-review (headless) on <YYYY-MM-DD>. Remove status:needs-review to release it to the runner.
  ```
  (Drop `(headless)` in an interactive run.)
- **Screenshot:** once the issue exists, `node scripts/issue-shot.mjs <N> <outDir>/<png>...` and
  comment the link lines it prints (`docs/backlog.md` > Screenshots in issues). If the helper
  fails, leave the screenshot out and move on.

## 5. Clean up

Delete every run directory under `logs/a11y-review/` except this one. The scan stops its own dev
server; check nothing still answers on its port.

## 6. Report

Print as the final response, every issue as `#N`:

```
## Accessibility review <YYYY-MM-DD>

Checked: <themes> at default size (contrast, tap targets, names, images, charts, headings);
Classic at 150% and 200% text on a 320px phone; reduce-motion with a PR celebration.
<screens> screens, <K> scan rows. Scan failures: <none | steps>.

### Filed
- #N <title> (<setting>)

### Updated
- #N <title>: <what this run added>

### Dropped
- <candidate>: <why: noise, decorative, changes the default look, already fixed in #N>

### Not filed this run
- <title>: <why it ranked below the cap>

### Clean
- <checks with nothing found, e.g. "No unnamed controls on any screen">
```

The "Clean" section is what makes a quiet month visible: always list every check that came back
clean. Leave out other sections that are empty. Then, if `pwsh` is on PATH, email a short HTML card
in the layout of `next-item`'s Shipped card (`.claude/skills/next-item/email-card.md`, banner
`&#10003; accessibility-review`, rows Filed, Updated, Clean) with `pwsh -File
scripts/Send-Notification.ps1 -Subject "accessibility-review: <A> filed" -BodyFile <file> -IsHtml`.
It's non-blocking and never retried; cloud images usually lack `pwsh`, so the session page holds
the report.

## Hard rules

- **Dated owner steps (#746).** Anything you file or comment that needs the owner on or after a date (a deadline, a check-back, an `On hold until`) carries `<!-- owner-date: YYYY-MM-DD[THH:MM] | <short what> -->`, and a dated ask uses `ask-dean.mjs --owner-date`, so it lands on the owner's Google Calendar (`docs/backlog-runner.md` > Owner calendar). Dates only you act on don't need one.
- Never file a finding you haven't confirmed against the current source and a screenshot.
- Never file a fix that makes the default look worse for most people (`docs/decisions.md`).
- Never more than 5 new issues a run, and every one goes in with `status:needs-review`.
- Never edit, commit, or push repo files. A broken scan step is filed, not fixed.
- Never point the scan at a real pilot device's data. It runs in local mode
  with its own throwaway database, and that doesn't change.
