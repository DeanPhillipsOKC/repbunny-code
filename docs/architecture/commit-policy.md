# Architecture: Commit and push policy

> Part of the architecture reference; index at `docs/architecture.md`.

### Commit & push policy

**Standing rule for code changes:** once `npm run build` (typecheck) passes and the full
`npm run test:e2e` regression suite is green, including any spec added/extended for the
change, commit it and ship it through a pull request automatically, without stopping to ask
first. **`main` takes only pull requests** (#681): GitHub's `main` ruleset and the pre-push hook
refuse a direct push, the owner's included (see Main ruleset below).
**The gate is only for application code** (owner rule, 2026-10-10). Application code is
anything the app build or the e2e suite reads: `src/`, `public/`, `index.html`,
`vite.config.ts`, the `tsconfig*.json` files, `package.json` and `package-lock.json`,
`capacitor.config.ts`, `android/`, `ios/`, `e2e/`, `playwright.config.ts`, and
`scripts/lib/` (the Vite config, Playwright config, and e2e fixtures import it). A change that
touches none of these skips both `npm run build` and `npm run test:e2e`: docs, skills
(`.claude/`), GitHub workflows and other repo config, and standalone scripts under
`scripts/` (outside `scripts/lib/`). Review the diff, run `git diff --check` and
`npm run check:docs`, give a changed script a quick run or `node --check` where that's safe,
then commit and open the PR. If a change touches application code at all, the full gate
applies to the whole change.
Changes limited to the static site (`site/`, plus its capture scripts) skip the full e2e suite
too. Check the page at 390px and 1280px instead (see Marketing site, "Checking changes") and run
`npm run check:docs`. **Except `site/guides/`** (#568): the app build reads every guide into the
in-app Help & guides search (`scripts/lib/guide-index.mjs`, run by `vite.config.ts`), and a guide
it can't parse fails `npm run build`. So a change under `site/guides/` also runs `npm run build`
and `npx playwright test e2e/guides-index-unit.spec.ts e2e/whats-new-unit.spec.ts
e2e/guide-search-unit.spec.ts e2e/local/guide-search.spec.ts` (the specs that read the guides;
`guide-search.spec.ts` asserts some guide copy, so rewording a guide can need a matching spec
edit). All must pass before the push.
Laptop and cloud sessions ship the same way: a `claude/` branch, a PR opened by the Builder bot,
CI and `/review-pr`, then the merge (see Shipping a change outside a lane, and Main ruleset).
Cloudflare Pages deploys `main` when the PR merges.

**File-size ratchet (#626).** Before every commit, gate or no gate, run `npm run check:size`
(`scripts/check-file-size.mjs`). No `.ts` or `.vue` file under `src/` may be over 800 lines, and the
files already over, listed with their line counts in `scripts/file-size-baseline.json`, may not grow.
When a change needs new code in a listed file, put it in a new component or composable beside it and
wire it in. When a listed file shrinks, run `npm run check:size -- --update` and commit the lowered
baseline (a file that drops under 800 leaves the list). Adding a file to the baseline takes an owner OK.

Still stop and ask before:

- Force-pushing, rewriting history, or anything else destructive (see the general git
  safety rules — those are not overridden by this policy).
- Pushing a code change that couldn't be run through `npm run test:e2e` (dev server or
  Playwright unavailable, etc.) — commit locally and flag why it wasn't pushed instead of
  pushing unverified. This exception does not apply to changes that touch no application code.
- A change the user asked to review before it ships.

Agents never create or push release tags (`store/v*`, which start the store builds; see Native
apps > Releasing), and never run the **Cut release** workflow (#219), which pushes one. Pushing
`main` only deploys the PWA; when to release to the stores is the owner's call, and the owner
starts Cut release themselves. The one exception is the `/release` command (#221): when the owner
types `/release` in a session, that session runs Cut release as the command describes. The skill
has `disable-model-invocation: true`, so an agent can't start it on its own, and a prompt like
"ship it" or "release this" never counts as the owner typing it.

**Cloud sessions: branch, PR, self-merge (#222).** On the laptop, work happens on `main` as above.
A Claude Code cloud session (claude.ai/code, or a routine) works on its own `claude/...` branch
instead, runs the same gate there, and code reaches `main` only through a pull request merged after
a green gate. If `main` moved meanwhile, the session merges `origin/main` into its branch, resolves
conflicts (release notes are one file each and never conflict, #558), and reruns the full gate before merging. The PR
is squash-merged so `main` keeps one commit per issue. Most PRs are a browsable record, merged by
the run itself after the `/review-pr` routine passes it. Every PR has a risk tier
(`scripts/review-risk.mjs`, #680): tier 1 gets a lighter review, tier 2 (a loosened test, effort 5
or more) the full adversarial one, and tier 3 (the paths in `scripts/risk-tiers.json`: workflows,
`.claude/`, the gate and dispatch scripts, this file, `docs/decisions.md`, the SQLite
schema or migrations, native config; or an added network call) the full review plus the
owner's approval. The review approves it and turns on auto-merge (GitHub does the merge, #1020), sends it back to the lane once, or asks the owner
(#374; `docs/backlog-runner.md` > Review). A red gate never leaves the branch. The `next-item` skill calls this "branch mode"
(`.claude/skills/next-item/SKILL.md` steps 0 and 7.5).

The cloud environment (set up once in claude.ai/code > the environment's settings):

- **Environment variables** (private to the environment): `PW_WORKERS=2`; `GH_TOKEN`, a fine-grained token for this repo
  with Contents, Pull requests, and Issues read and write, plus Actions read and write for
  `/release` and `ask-dean`. Optional: `GMAIL_SENDER_ADDRESS`, `GMAIL_APP_PASSWORD`,
  `NOTIFY_EMAIL_RECIPIENTS` for `next-item`'s email card; `REVIEW_ROUTINE_ID` and
  `REVIEW_ROUTINE_TOKEN` to turn on the review of lane PRs (#374, #680; optionally `REVIEW_LIGHT_ROUTINE_ID` and
  `REVIEW_LIGHT_ROUTINE_TOKEN` for the cheaper tier 1 routine) (sent through PowerShell, so it's skipped
  unless the image has `pwsh`); `ELEVENLABS_API_KEY` to voice the sprint review clips lanes record
  (#605; without it they're recorded silent with captions). The e2e suite and the capture scripts
  need no keys or accounts (#940); the old `TEST_SUPABASE_*` and `TEST_ACCOUNT_EMAIL` variables can
  be deleted from the environment.
- **Network access:** the npm registry, Playwright's
  browser download (`cdn.playwright.dev` and `playwright.download.prss.microsoft.com`), Ubuntu's
  package mirrors (`archive.ubuntu.com`, `security.ubuntu.com`) for the browser's system libraries
  and `gh`, GitHub, and `api.elevenlabs.io` for the sprint review clips' voice (#605).
- **Setup script:** `npx -y playwright@<version> install --with-deps chromium` (the exact
  `@playwright/test` version from `package.json`) and the GitHub CLI if the image lacks it
  (`command -v gh || apt-get install -y gh`), and ffmpeg for the sprint review clips (#605;
  `command -v ffmpeg || apt-get install -y ffmpeg`). It's cached when it finishes in about 5 minutes. It
  doesn't run inside the repo, so `npm ci` there fails (#238); a SessionStart hook
  (`.claude/settings.json` > `scripts/cloud-session-start.mjs`, cloud sessions only) runs `npm ci`
  once the session is in the repo, plus `npx playwright install chromium` to pick up a browser
  for a newer Playwright than the setup script pinned.
- **Limits:** about 4 vCPUs and 16 GB; foreground commands run up to 10 minutes and then up to 30
  more in the background, so the full suite (about 12 minutes on 2 workers) fits.

**Repo backups.** Since #681 the `main` ruleset refuses force pushes and deleting `main`, and
`scripts/git-hooks/pre-push` refuses any push to `main` before it leaves the machine (active through
`core.hooksPath`, which `npm install` sets; the cloud session hook sets it itself because it installs
with `--ignore-scripts`). Losing the repo itself (the account, or a bad change somewhere the ruleset
doesn't cover) is what the backup is for:

- `scripts/Backup-Repo.ps1` (`npm run backup:repo`) writes `repbunny-YYYY-MM-DD.bundle` (every
  branch, tag, and commit, checked with `git bundle verify`) and `env-local-YYYY-MM-DD.txt` (a
  copy of the untracked `.env.local`) to `My Drive\RepBunny Backups\repo` through Google Drive
  for desktop, keeping the newest 30 of each. The "RepBunny repo backup" scheduled task runs it
  nightly at 9:30 PM and catches up after a missed run; `-Register` recreates the task. A
  failure emails through `Send-Notification.ps1`. To restore: `git clone
  repbunny-YYYY-MM-DD.bundle repbunny`, point `origin` back at GitHub with `git remote set-url
  origin https://github.com/DeanPhillipsOKC/repbunny.git`, copy the env file back to
  `.env.local`, and push `main` if GitHub lost it.

**Keeping docs current (#112).** `npm run check:docs` (`scripts/check-docs-refs.mjs`) lists
every file path, file name, and `npm run` command cited in `docs/`, `CLAUDE.md`,
`README.md`, and `.claude/skills/` that no longer exists, and exits nonzero if any do.
`docs/backlog-archive.md` is skipped as frozen history; a deliberate mention of a removed or
generated file opts out with `<!-- docs-refs: ignore -->` at the end of its line. The
`next-item` skill greps the docs for what each change touched, fixes what it made wrong, runs
this check before committing, and lists the docs it read in the close-out comment
("Docs checked"). `/help-review` runs it too and reports stale docs alongside stale guides.

**Dependency updates (#232).** `.github/dependabot.yml` opens pull requests once a month, at
most 8 open for npm and 3 for each other ecosystem:

- **npm** (repo root): one grouped PR for minor and patch updates, plus a separate grouped PR
  for `@capacitor/*` minor and patch updates, since the JS packages and their native side must
  move together. The Vite stack (`vite`, `@vitejs/*`) gets one grouped
  major PR, and `typescript` with `vue-tsc` get one grouped PR, so a held pair takes one slot
  (#348). TypeScript 7 and later are ignored until `vue-tsc` can load them (#519; the Gradle wrapper major is held the same way, #512). Other major updates (Vue, Capacitor, Playwright, the Supabase client) each get their
  own PR.
- **github-actions** (`.github/workflows/`): one grouped PR for every update.
- **gradle** (`android/`): one grouped PR for minor and patch updates, majors separate. Capacitor
  pins the native side: `capacitor-android` is a project dependency, and the `androidx*` versions
  in `android/variables.gradle` come from Capacitor's template and are rewritten by `npx cap
  migrate`, so Dependabot can't see them. Don't hand-merge a PR that bumps them; move them with
  a Capacitor upgrade.
- GitHub's own security updates stay on and open separate PRs outside the grouping.

Every ecosystem has a 7-day `cooldown`, so a release is proposed only a week after it is published (most malicious npm releases are pulled within days, #697). A `package-lock.json` change is at least risk tier 2. Installs in cloud sessions, the Android build, the release workflows, and the sprint review use `npm ci --ignore-scripts`; the only install scripts in the lockfile are `core-js`'s banner and macOS-only `fsevents`, and the build and gate pass without them. That also skips `prepare`, so `cloud-session-start.mjs` sets `core.hooksPath` itself.

**Testing and merging (#258).** `.github/workflows/dependabot-issue.yml` files one `tooling`
issue per Dependabot PR, "Gate and merge Dependabot PR #N": effort 1 for a minor/patch group,
effort 3 plus `status:needs-review` for a major, so the owner reads the changelog line and removes
the label to release it. Lane runs only ever pick issues, so this is how a PR reaches one. In
branch mode `next-item` checks out the PR's head branch, runs `npm run build` and the full
`npm run test:e2e`, and squash-merges the PR on green; on red it never pushes to Dependabot's
branch. A bump that needs code changes becomes its own backlog issue and the PR is closed. When a
Dependabot PR closes without merging, the workflow's `close-orphan` job comments on and closes its
issue as not planned (#544). The native apps pick up a merged update only with the next store release. Issues the workflow files
with `GITHUB_TOKEN` don't fire other workflows, so they don't start a dispatch run, but the next 2-hourly issue digest email lists them (#542).

### CI on pull requests (#675)

The gate above is self-reported: the agent runs it in its own session. `.github/workflows/ci.yml`
adds independent evidence on every pull request to `main`, on a hosted runner (a few minutes):

- **One job, `ci-required`**, the check the ruleset requires. It used to be three jobs (`checks`,
  `security`, and an aggregator), but each job bills at least a minute, so they were merged on
  2026-10-22 to save Actions minutes (see `docs/decisions.md`, the minutes guard, 2026-11-02).
- **Every PR:** gitleaks on the PR's commits, `npm run check:docs`, `npm run check:public` (no
  private names, addresses, or support email, `docs/public-content.md`, #942), and `git diff --check`
  against the base.
- **Only when a path other than Markdown or `docs/` changed:** `npm ci --ignore-scripts`,
  `npm run build`, `npm run check:size`, actionlint on the workflows,
  `npm audit --omit=dev --audit-level=high`, and Semgrep OSS (JavaScript, TypeScript, and GitHub
  Actions rulesets). A docs-only PR still gets a `ci-required` result, so it never sits waiting on
  a skipped required check. See Security scanning below.
- `permissions: contents: read` only; one run per PR, a newer push cancels the older run.

`next-item` (branch mode) waits for `ci-required` on the PR head before merging, like the Android
build check, and treats red as a red gate. Its local gate stays for fast feedback. Full e2e is not
in CI (per-PR e2e stays in the agent's own session; the hosted run below gates releases instead),
and making the check required is a ruleset setting, not part of this workflow.

### Release gate (#677)

A clean full e2e run on a GitHub-hosted runner gates every store release, so the evidence for
anything that reaches users doesn't come only from the agent that wrote it. There is no
self-hosted VM (#676 closed; `docs/decisions.md`).

- **`.github/workflows/e2e.yml`** (`workflow_call` and `workflow_dispatch`, input `ref`, default
  `main`): `ubuntu-latest`, the full e2e suite with no secrets (every spec starts on its own empty
  on-device database, #940), `permissions: contents: read`, npm and the Playwright browser cached. Retries are Playwright's own (2 under `CI`); there is no
  workflow-level re-run loop, and a spec that still flakes gets the usual `Flaky:` issue. On failure
  the `playwright-report` artifact (HTML report and traces, 7 days) is attached to the run, and
  failing specs are annotated in its summary (`playwright-report-1` and `-2`, one per half).
  **Two halves (#933):** the run is split across two jobs that run at the same time, each on one
  worker per core (`nproc`). Each runs half of the `local` project
  (`--project=local --shard=<part>/2`), and the first also runs the `unit`, `personal`, and
  `build` projects, so the wall clock is about half a single job's for about one extra minute of
  setup per run. Playwright's plain `--shard` splits by test count across all projects, which
  would put the 500-odd fast `unit` specs in one half. `e2e/e2e-workflow-unit.spec.ts` fails if a
  project in `playwright.config.ts` isn't named in the workflow, so a new project can't drop out
  of the gate. Runs share no data, so a hand-started run and Cut release's run can overlap (the
  queueing #755 added went with the shared test accounts, #940).
- **`cut-release.yml`** runs an `e2e` job on the exact commit about to be tagged, and the `tag`
  job `needs:` it. Red e2e means no tag, no Play upload, and no Codemagic build.
- **By hand:** GitHub app > Actions > **E2E** > Run workflow, any ref.
- **Not gated:** the personal Android nightly (`release-android.yml`) isn't a store release.
- **Minutes:** record the run time in the close-out and keep the month inside Pro's 3,000 with
  the `ci.yml` checks. About weekly releases keep this well under.
- **Break glass if hosted Actions is down during an urgent release:** Cut release can't tag
  either, so tag by hand only on the owner's say-so, after running `npm run test:e2e` locally on
  the commit being tagged and recording the pass count on the release
  issue. Fix the gate afterward; don't remove it from the workflow.

### Security scanning (#678)

The security steps of `ci.yml`'s `ci-required` job run on every PR (gitleaks on docs-only PRs too). Free tools only (CodeQL
needs Advanced Security on a private repo), and no third-party actions: gitleaks and actionlint are
downloaded by exact version and checked against their SHA-256, and Semgrep is an exact pip version
at least a week old (the #697 cooldown). To move a tool, change its version and checksum together in
the job's `env`, from the checksums file on the release page.

| Scanner | Checks | Fails the job on |
|---|---|---|
| gitleaks | the PR's commits (`origin/main..HEAD`) for keys, tokens, passwords | any finding |
| actionlint | every workflow under `.github/workflows/` (expressions, `if:`, shell) | any finding |
| `npm audit --omit=dev` | production dependencies (GitHub's advisory database) | high or critical |
| Semgrep OSS | `p/javascript`, `p/typescript`, `p/github-actions`; skipped when a PR changes only `*.md` and `docs/` | ERROR severity; WARNING and INFO go to the job summary (`scripts/semgrep-summary.mjs`) |

`npm audit` was picked over osv-scanner because it needs no extra binary and reads the same advisory
data; it found nothing on the lockfile on 2026-10-21.

**A full-history gitleaks scan** (1,275 commits, every branch) ran on 2026-10-21 with gitleaks
8.30.1 and found nothing. Rerun it after any history import: `gitleaks git . --redact`.

**Handling a finding.** Fix it in the PR. A real secret is rotated first, then removed; deleting the
line is not enough, since it stays in history. If it can't be fixed in the PR (a false positive, or
an upstream issue with no patched version), allowlist it with a reason and file a follow-up issue in
the same PR, never a silent skip:

- gitleaks: a `[[allowlists]]` entry in `.gitleaks.toml` (create it) with `description`, or a
  `gitleaks:allow` comment on the line.
- Semgrep: `# nosemgrep: <rule-id>` (or `// nosemgrep: <rule-id>`) with the reason on the same line.
- actionlint: fix it; for a shellcheck rule that can't apply, `# shellcheck disable=SCxxxx` with the
  reason inside the `run:` script.
- npm audit: no allowlist. Upgrade, replace the package, or file an `upstream-hold` issue and let
  the check stay red until the owner decides.

### Agent identities (#679)

Two GitHub Apps (set up in #674) give the agents their own names on GitHub:

| Bot | App ID | Permissions | Does |
|---|---|---|---|
| `repbunny-builder[bot]` | 5411081 | Contents, Pull requests, Issues, Actions: write | opens lane PRs; authors cloud-session commits |
| `repbunny-reviewer[bot]` | 5411172 | Pull requests, Issues, Actions, Contents: write | posts `/review-pr` verdicts as real reviews. Contents write is there because GitHub counts an approval toward the ruleset only from a reviewer with write access (#770) |

Turning on auto-merge needs Contents write, so `post-review.yml` does that one step with a Builder
token; the Reviewer only ever posts the review.

**Why through Actions.** A cloud session reaches GitHub through a proxy that replaces whatever token
it sends with the session's own credentials (the owner's), so an app token minted in a session
changes nothing. The bot actions run in two workflows instead, which mint a one-hour installation
token from the app key (repo secrets `BUILDER_APP_ID`/`BUILDER_APP_KEY` and
`REVIEWER_APP_ID`/`REVIEWER_APP_KEY`; the key may be raw PEM or base64) with
`scripts/gh-app-token.mjs`:

- `.github/workflows/open-pr.yml` opens a PR from a `claude/` branch into `main` as the Builder.
- `.github/workflows/post-review.yml` posts `APPROVE`, `REQUEST_CHANGES`, or `COMMENT` on a given
  PR and commit as the Reviewer. On `APPROVE` or `COMMENT` it first dismisses the Reviewer's own
  earlier `CHANGES_REQUESTED` reviews on that PR (#1000), since a COMMENT doesn't replace one.
- `.github/workflows/support-evidence.yml` posts triage's "seen again" note on an open issue as the
  Builder (#695). `scripts/support-evidence.mjs` builds the note from a date, version, platform,
  error codes, and a Gmail link, and rejects anything else, so the normal path can't carry an
  email's words into an issue. Sessions start it with `bot-dispatch.mjs support-evidence ...`.
  A session could still comment as the owner (#768), which only the triage skill's rules forbid.
- `.github/actions/backlog-token` gives the workflows that touch issues from the code repo a
  token for the backlog repo: their own while it's this repo, a Builder token once it isn't
  (#944; `docs/backlog-runner.md` > Backlog repo).

The three workflows run only from `main`, check out only `scripts/` from `main` (never the PR), and take checked
inputs. Sessions start them with `node scripts/bot-dispatch.mjs open-pr ...`, `post-review ...`, or `support-evidence ...`,
which waits for the result; exit 3 means the bot path is unavailable and the caller falls back to
acting as the owner and says so. **`support-evidence` is the exception:** its caller never falls
back, because a note posted by hand is the free-text path that command closes. On exit 3 it posts
nothing and retries on its next run, and exit 2 means the validator refused a field (the message
says which). Cloud sessions also set `git config user.name/email` to the Builder
(`scripts/cloud-session-start.mjs`), so their commits show as the bot. Laptop sessions with the
owner keep the owner's name.

**What this enforces, and what it doesn't.** A Builder-authored PR can be approved by the owner,
which GitHub refuses for your own PR, so the ruleset's owner approval on tier 3 (#681) is real. The
Reviewer's approval is a record, not proof: every session has Actions write, so any session could
start `.github/workflows/post-review.yml`. That's an accepted risk (`docs/governance/threat-model.md` > Accepted risks).

### Main ruleset (#681)

`main` is protected by a GitHub ruleset, kept in `.github/rulesets/main.json` and applied with
`node scripts/apply-ruleset.mjs --apply` (the owner's admin `gh`; `--check` reports drift). **No
bypass actors**, the owner included.

- A pull request is required, with **1 approval** and **code owner review**. `.github/CODEOWNERS`
  is generated from `scripts/risk-tiers.json` (`node scripts/review-risk.mjs --codeowners`), so a
  PR touching a tier 3 path needs the owner's own approval. Approvals are dismissed when the PR
  gets a new push.
- The `ci-required` check must pass. It doesn't have to be up to date with `main`: a PR whose base
  moved can still merge if it has no conflicts, and the release e2e gate (#677) runs on the exact
  commit before anything ships.
- Squash merges only, linear history, no force pushes, no deleting `main`. The repo settings match
  (`scripts/apply-ruleset.mjs` sets them): squash only, auto-merge on, branches deleted after merge.

Who approves what:

| Tier | Approval | Who merges |
|---|---|---|
| 1 and 2 | `repbunny-reviewer[bot]`, posted by `/review-pr` (see Agent identities) | `/review-pr`, right after approving |
| 3 | the owner, in GitHub (Files changed > Review changes > Approve) | auto-merge, which `/review-pr` turns on pinned to the reviewed commit |

A tier 3 PR merges itself the moment the owner approves and CI is green. A push to the PR after the review
turns its auto-merge off again (`.github/workflows/pr-pushed.yml`): GitHub checks the pinned commit
only when auto-merge is turned on, so without this a later push would ride the old auto-merge in.
The PR then needs a new review, and the ruleset has already dismissed any approval.
`.github/workflows/pr-merged.yml` then starts the review routine to post the close-out. The owner
no longer has to reply A, though an A reply still works.

**Why the bots matter here.** GitHub refuses approving your own PR. Agents' PRs are opened by the
Builder bot, so the owner can approve them. A PR the owner opens from their own account can't get
the owner's approval; for a tier 3 change, have a session ship it.

### Shipping a change outside a lane

Interactive sessions on the laptop and skills that change repo files (`/help-review`,
`/pm-review`, `/ux-review`) ship the same way a lane does:

1. `git checkout -b claude/<short-slug>` from an up-to-date `main`, commit (only your own files),
   `git push -u origin HEAD`.
2. `node scripts/bot-dispatch.mjs open-pr --head <branch> --title "<subject>" --body-file <f>`
   opens the PR as the Builder. The body has the commit subject and body (with `Fixes #<N>`, or `Issue: #<N>` for an owner check, `docs/backlog.md`), and
   `Tier: <T> (<reasons>)` from `node scripts/review-risk.mjs`.
3. Wait for `ci-required`, post a `<!-- next-item hand-off -->` comment (issue, tier, commit
   subject and body, close-out draft), label the PR `review:requested`, and fire the review:
   `node scripts/fire-review.mjs --pr <P> --tier <T>` where its secrets are set, or in a Claude Code
   session the Review (Opus) routine's run with the text `Review PR #<P> (tier <T>)`.

### Break-glass

For a real emergency only: production is down or CI itself is broken, and the normal PR flow
can't get a fix in. The owner, never an agent:

1. GitHub > repbunny > Settings > Rules > Rulesets > `main` > Bypass list > add yourself (Repository
   admin role), with "Always allow". Save.
2. Make the one change (merge the fix PR, or push the fix).
3. Remove yourself from the bypass list right away, then run `node scripts/apply-ruleset.mjs
   --check` on the laptop to confirm the ruleset matches the file again.
4. File an issue labeled `tooling` titled `Break-glass: <what>`, saying what changed, why the
   normal flow couldn't do it, and when the bypass was on and off. The ruleset change is also in
   the audit log (Settings > Rules > Insights).

To pause all automation instead (a runaway lane, not a broken release), use the pause switch
(`docs/backlog-runner.md` > Pausing automation).

### Native build check (#346)

Cloud sessions can't compile the Android app: their proxy refuses `dl.google.com`, where Gradle
fetches the Android Gradle Plugin. `.github/workflows/android-build.yml` does it instead. On a
pull request that touches `android/`, `capacitor.config.ts`, `package.json`, or
`package-lock.json`, it runs `npm run android:sync` and `./gradlew assemblePersonalDebug` (no
signing, no secrets, about 4 minutes). **The native build check is that workflow's `Android build`
check being green on the PR head.** `next-item` waits for it before merging a PR that touches those
paths, in addition to the normal gate; a red check is a red gate. A branch-mode run that changes
`android/` itself opens its PR first, then merges once the check is green.

### Native-only checks (#341)

The e2e suite runs in desktop Chromium and trusts app logic. A shipped change needs a manual
Android test case only when it touches behavior a real device decides:

- notifications, exact alarms, lock-screen controls
- home screen widgets, app icon switching
- Play billing
- keyboard and autocomplete behavior
- the OS killing and resuming the app, the back button
- file picker and share sheet, permission prompts
- SQLite migrations on upgrade over an existing install
- real-phone layout (notch, gesture bar, font scale)

Logic the e2e suite covers does not qualify, even inside a native-only screen. When a change
qualifies, `next-item` adds or updates the case in `scripts/qa/procedure.mjs` and queues it with
`node scripts/qa-batch.mjs --add`; see `docs/qa-procedure.md` > Android QA batches.
