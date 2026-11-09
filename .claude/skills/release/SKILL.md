---
name: release
description: Cut a store release (TestFlight and Play closed testing) by running the Cut release GitHub workflow. Owner-only; runs only when the owner types /release. Shows the commits going out, starts the workflow, waits for it, and reports the version, links, and anything that failed.
argument-hint: "[patch|minor|major|X.Y.Z] [classic|season-autumn|season-halloween|season-snow-globe|season-christmas]"
disable-model-invocation: true
---

# release

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

Cuts a store release from any session, including Claude Code on the web or the Claude app with the
laptop closed (#221). It runs the **Cut release** workflow (`.github/workflows/cut-release.yml`,
#219), which tags `main`'s HEAD as the next `store/vX.Y.Z`, starts the Play upload, and lets
Codemagic start the TestFlight build from the tag. See `docs/architecture/native-releases.md` >
Releasing.

`disable-model-invocation: true` means only the owner typing `/release` runs this. Agents never cut
a release any other way: not from a prompt like "ship it" or "release this", not by pushing a
`store/v*` tag, and not by running the workflow outside this command (Commit & push policy in
`docs/architecture/commit-policy.md`). If you got here without the owner typing `/release` in this session, stop.

Don't change, commit, or push any files. This only starts and watches a workflow.

## 1. Set up `gh`

Use `gh` on PATH; on the owner's Windows laptop it's `C:\Program Files\GitHub CLI\gh.exe`. Run
`gh auth status`. If `gh` is missing or not signed in, stop and say what's missing, pointing at
`docs/architecture/native-releases.md` > Releasing > "From a Claude session" (a cloud session needs `gh` installed
and a `GH_TOKEN` that can run workflows). Don't try other ways to start the release.

## 2. Read the argument

`$ARGUMENTS` is one of:

- empty: pick `patch` or `minor` from what's going out (step 3, item 4), never `major`
- `patch`, `minor`, or `major`: that bump, whatever the changes are
- an exact version like `1.2.0` (or `v1.2.0`): that version, passed as `version`

Optionally followed (or, alone, replaced) by the store builds' default icon (#857): `classic`,
`season-autumn`, `season-halloween`, `season-snow-globe`, or `season-christmas`. Without one, pick
it by today's date (`date +%m-%d`), from the yearly schedule in `docs/architecture/native-releases.md`
> Releasing > Seasonal default icon. Every release sets the icon, so a release between the
scheduled dates keeps the season's one:

| Today | `default_icon` |
| --- | --- |
| Aug 20 to Sep 19 | `season-autumn` |
| Sep 20 to Oct 19 | `season-halloween` |
| Oct 20 to Nov 19 | `season-autumn` |
| Nov 20 to Dec 9 | `season-christmas` |
| Dec 10 to Feb 19 | `season-snow-globe` |
| Feb 20 to Aug 19 | `classic` |

Anything else: stop and show the accepted forms. Don't guess.

## 3. Preview what's going out

1. `git fetch origin main --tags --force`, so the tags and `main` are current (a cloud session's
   clone can be stale).
2. If `origin/main` already has a store tag (`git tag --points-at origin/main --list "store/v*"`
   prints one), stop: there's nothing new to release.
3. Work out the version the workflow will cut, the same way `scripts/next-store-version.mjs` does:
   the latest tag is the first line of `git tag --list "store/v*" --sort=-v:refname`, and the bump
   raises its patch, minor (patch to 0), or major (minor and patch to 0). With no store tag yet it's
   `store/v1.0.0`. An exact version must be above the latest tag; if it isn't, stop and say so. The
   workflow computes the real tag itself, so this is only the preview.
4. **With no argument, pick the bump** (owner, 2026-10-15: new features should get a minor bump,
   not a patch). The user-facing changes going out are the release-note files added since the
   tag: `git diff --name-only --diff-filter=A <latest store tag>..origin/main -- release-notes/`,
   minus `archive.json`. Each file is `<issue>.json` or `<issue>-2.json`. Read each issue's labels
   (`gh issue view <N> --json labels`). If any of them has `feature` or `ux-intensive`, it's
   `minor`; otherwise (bug fixes, small polish, or no notes at all) it's `patch`. Then work out the
   version as in item 3. Never pick `major` yourself; that's only when the owner types it.
5. List the commits going out: `git log --oneline <latest store tag>..origin/main` (all of
   `origin/main` when there's no store tag yet). Show the count and the subjects.
6. Show, in this order: the version it will cut (`store/vX.Y.Z`); when you picked the bump, one
   line on why (for example "minor: new features #568, #535, #536"); the default icon, and
   "(by date)" when you picked it; the sprint review line
   (#606) that `node scripts/demo-video/review/review-issue.mjs --status` prints, such as
   `Sprint review: <issue link> (3 of 5 accepted)`, when it prints one; the commit it tags
   (`origin/main`'s short SHA); and the commit list. The review never blocks the release: show the
   line and carry on, whatever it says.
7. **Owner check** (`docs/backlog.md` > Owner check, 2026-11-03): collect every `#<N>` in the
   commit subjects from item 5 and keep the issues that are open and labeled `status:verify`
   (`gh issue view <N> --json state,labels,title`; a PR number never has the label). These are
   changes going out that the owner hasn't tried on Android yet. When there are none, show
   `Owner check: all verified` and carry on. Separately, keep the open ones labeled
   `verify:iphone`: they need a look on the iPhone, which only this release's TestFlight build can
   give. They never block the cut; show them as `Check on iPhone in this TestFlight build before
   submitting to App Review:` plus `#<N> <title>` lines, and repeat that list in the final report.
   The testing email the workflow sends after the Play upload lists the same issues in its
   **Check on iPhone** row (`scripts/collect-release-notes.mjs`), so the owner has it on the phone.

Then start it. The owner typing `/release` is the go-ahead, so don't ask again; the preview is so
they can see what went out (and cancel the run from GitHub if it's wrong). The one exception is
item 7: when it found unverified issues, list them (`#<N> <title>`) and ask once whether to cut
anyway. The code is already on `main`, so leaving one out takes a revert or a flag, not a skip;
say so. On anything but a yes, stop without starting the workflow.

## 4. Start the workflow

```
gh workflow run "Cut release" --ref main -f bump=<bump> -f default_icon=<icon>            # bump forms
gh workflow run "Cut release" --ref main -f version=<X.Y.Z> -f default_icon=<icon>        # exact version
```

Then find the run it started: wait a few seconds and take the newest
`gh run list --workflow "Cut release" --branch main --event workflow_dispatch --limit 1 --json databaseId,url,createdAt,status`
created after you started it. If none shows up within a minute, say so with the
`gh workflow run` output and stop.

## 5. Wait for it

`gh run watch <id> --exit-status --interval 30` (run it in the background if your shell has a short
timeout, and wait for it to finish). The run first runs the full e2e suite on `main`'s HEAD as its `e2e` job
(#677; expect a full e2e run plus a few minutes, likely 20+ minutes on 2 hosted workers), then tags `main`, then calls Release to Google Play
as its `play` job. Don't cancel or re-run anything.

## 6. Report

`gh run view <id> --json conclusion,url,jobs` plus `git fetch --tags` to read the tag it pushed
(`git tag --points-at origin/main --list "store/v*"`). Report:

- **Default icon:** the icon the builds ship with (#857).
- **Version:** the `store/vX.Y.Z` tag, or "no tag" if the tag job failed. If the `e2e` job failed,
  `tag` and `play` show as skipped: report no tag, the failing specs (annotated in the run
  summary), and the run's `playwright-report-1` and `playwright-report-2` artifact links, one per half (part 1 also holds the unit, personal, and build report; the run page lists them). No tag and no
  builds went out. Don't re-run.
- **Commits:** the count from step 3's list.
- **Cut release run:** the run URL (the Play upload is its `play` job, in the same run).
- **Codemagic:** https://codemagic.io/apps (RepBunny > Builds; the `ios-testflight` build for the
  tag starts from Codemagic's webhook, so this command can't see it). If no build shows up, the
  Codemagic GitHub webhook is off (docs: "If Codemagic doesn't start on a tag").
- **Next:** the testing email arrives after the Play upload; then the QA procedure's smoke pass and
  Release tab, as in Releasing > "The flow".
- **Failures:** for any failed job, its name and the failing step's last useful log lines
  (`gh run view <id> --log-failed`, trimmed). A failed tag job means nothing was released. A failed
  `play` job after a pushed tag means the tag exists and Codemagic may still build; say that, and
  that Release to Google Play can be re-run by hand with the tag (Actions > Release to Google Play >
  Run workflow). Don't re-run it yourself.
