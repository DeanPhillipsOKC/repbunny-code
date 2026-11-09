---
name: help-review
description: Finds RepBunny features that have no how-to guide on repbunny.app, guides that no longer match the app, and docs that cite files or commands that no longer exist. Inventories every user-facing feature from the live source, compares it against site/guides/, ranks the gaps by how non-obvious each feature is, asks the user which guides to write, then writes them (page, index card, screenshots, release-note link), fixes stale guides, and removes guides for features that are gone. User-triggered, or headless as a monthly routine (/help-review headless), which files each gap as a scored needs-review issue and changes no files. Interactive runs never change app code beyond a guide link in release-notes/.
argument-hint: "[headless]"
---

# help-review

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

**Paused?** Headless runs first run `node scripts/automation-paused.mjs --strict`. If it prints `PAUSED` (exit 10), output `PAUSED` and stop: no claims, no issues filed, nothing changed (#682, `docs/backlog-runner.md` > Pausing automation).

Guides (#102) get written one at a time, when someone remembers. This skill checks the whole app
against `site/guides/` so the gaps show up in one place. Read the `docs/architecture.md` index first (then only the `docs/architecture/` topic files your change touches) if you
haven't this session (required reading per `CLAUDE.md`), especially "Marketing site" and "What's
new", and `docs/brand-identity.md` for the voice guide copy is written in. The guide rule itself
lives in `docs/backlog.md`'s conventions ("Guides (#102)"): a guide is for a feature whose use
isn't obvious from a one-line note.

Interactive by default: the user is present and picks what gets written (headless runs follow
the next section instead). Their standing
preference: put every question in one numbered **Asks** list at the very top of a message, one
line each, never buried at the end. Use the `gh` CLI for issue operations (backlog conventions in
`docs/backlog.md`).

## Headless mode (monthly routine)

Runs headless when invoked as `/help-review headless` (the monthly routine's prompt; see
`docs/backlog-runner.md` > Scheduled reviews), or when no user can answer (`claude -p`). Read
`docs/decisions.md` first: don't file a guide for a feature it rules out or removes. Steps 1 to 3
still apply; steps 4 to 6 are replaced by these rules:

- **Never ask.** No `AskUserQuestion`, no waiting. Make the most reasonable call and say what you
  chose in the issue or the report.
- **No repo changes.** Don't write or fix guides, take screenshots, start a dev server, or edit,
  commit, or push any file. `node scripts/check-docs-refs.mjs` is read-only and still runs.
- **GitHub access.** Cloud sessions refuse GitHub GraphQL and the search API, which `gh issue
  list`, `gh issue create`, and `gh issue comment` use. Use the repo-scoped REST API with explicit
  pages (`gh api --paginate` follows links the cloud proxy refuses, and fails after the first 100):
  - Dedupe: dump every issue, open and closed, then `grep -i` the file.
    ```
    p=1; while out=$(gh api "repos/DeanPhillipsOKC/repbunny/issues?state=all&per_page=100&page=$p" --jq '.[] | "\(if .pull_request then "PR" else "#" end)\(.number) [\(.state)] \(.title) {\([.labels[].name] | join(","))}"') && [ -n "$out" ]; do echo "$out"; p=$((p+1)); done | grep '^#' > <scratch>/issues.txt
    ```
    Read one with `gh api repos/DeanPhillipsOKC/repbunny/issues/<N> --jq .body`.
  - Add: `gh api repos/DeanPhillipsOKC/repbunny/issues -f title='<title>' -F body=@<file>
    -f 'labels[]=<label>' ... --jq .number` (one `-f 'labels[]=...'` per label).
  - Enrich: `gh api repos/DeanPhillipsOKC/repbunny/issues/<N>/comments -F body=@<file>`.
- **Dedupe** each candidate against open and closed issues (the dump above; grep the feature
  name, the guide slug, and "guide"). Enrich an open match with a comment holding this run's
  evidence; never comment on an `awaiting-dean` issue (file a new one that links it). Don't
  re-file a guide a closed issue deliberately dropped.
- **File each gap as one issue with `status:needs-review`**, so it waits for the owner and the
  runner skips it. Labels: `documentation`, a kind (`feature` for a missing guide, `bug` for a
  stale or orphaned guide or broken wiring, `tooling` for stale docs), and self-scored
  `effort:<E>` and `value:<V>` (Fibonacci). Title it for the fix (`Add a how-to guide for <feature>`,
  `Update the <slug> guide: <what changed>`, `Remove the <slug> guide: <feature> is gone`,
  `Fix stale docs: <path>`). The body says what the gap is, cites `path:line` for every claim
  (the feature's entry point, the guide step that's wrong and the source that contradicts it, or
  where you confirmed a feature is gone), and for a missing guide lists the taps to reach the
  feature and the release note it would link. It ends with `Filed by /help-review (headless) on
  <YYYY-MM-DD>. Remove status:needs-review to release it to the runner.`
- **At most 5 new issues per run**, across all gap types. Rank stale and orphaned guides and broken
  wiring first (a wrong guide misleads people; a missing one only fails to help), then missing
  guides by step 3's rank, then stale docs. List the rest in the report under "Not filed this run".
- **Report** (step 7's layout, with `Filed`, `Updated`, `Not filed this run`, and `Still missing`
  sections in place of Written, Fixed, Removed, and Docs fixed, every issue as `#N`, and no commit
  line) is printed as the final response. Then try to email it (non-blocking, never retried,
  never a failure of the run): if `pwsh` is on PATH, write a short HTML card in the layout of
  `next-item`'s Shipped card (`.claude/skills/next-item/email-card.md`) (banner `&#10003;
  help-review`; rows Filed, Updated, Not filed, each a short `#N title` list) and run `pwsh -File
  scripts/Send-Notification.ps1 -Subject "help-review: <A> filed" -BodyFile <file> -IsHtml`.
  Without `pwsh` (cloud images usually lack it), skip it; the routine's session page holds the
  report.

## 1. Inventory the shipped features

Build the list from the live source, not from memory or old docs:

- `src/router.ts` and the routed components it imports from `src/components/` for screens; the Account sheet's sections (Preferences, Your
  data, Account & privacy, About, Premium) and every sheet/dialog under `src/components/`.
- `release-notes/` (one file per note, plus the frozen `release-notes/archive.json`; #558) for what shipped, and
  which notes already link a guide. `git log --diff-filter=A -- release-notes/<file>` says when.
- `docs/architecture/` topic files (index: `docs/architecture.md`) for features the screens don't make obvious (load types,
  next-time targets, rest timer, backup/restore, offline queue, units, Premium gating in local
  mode, and so on).

Write down each feature as one line: a name a user would recognize, where it lives (the taps to
reach it), and which builds have it (Android, iPhone, Premium-only). Group small
settings under their screen rather than listing every toggle. Skip internals a user never sees.

## 2. Compare against the guides

List `site/guides/*/` and the cards in `site/guides/index.html`. For each guide, read its page
and check every step against the current source: button labels, screen and section names, the
order of taps, options, and what each screenshot shows (`site/img/guides/`). Classify:

- **Missing:** a feature with no guide.
- **Stale:** a guide whose steps, names, or screenshots no longer match the app. Note exactly
  what changed, citing `path:line`.
- **Orphaned:** a guide for a feature that was removed. Confirm it's gone from the source, not
  renamed or moved.
- **Broken wiring:** an index card with no folder, a folder with no card, a guide whose images
  aren't produced by `scripts/capture-guide-screenshots.mjs`, or a slug referenced from app code
  (`grep -rn "'<slug>/'" src`, e.g. `PremiumSheet.vue`'s `COPY`) that doesn't exist.

Then check the docs themselves (#112). Run `node scripts/check-docs-refs.mjs`: it lists file
paths, file names, and `npm run` commands cited in `docs/`, `CLAUDE.md`, and the
skills that no longer exist. For each one, find what replaced it (a rename or move) or confirm it
was removed. Also grep `docs/` for the feature names, screens, and settings you inventoried in
step 1 and flag any passage that describes them differently from the source. Classify these as
**Stale docs**, citing `path:line` and what changed. They don't need asking: fix them in step 5.

## 3. Rank the missing ones

Score each missing feature on how non-obvious it is, highest first:

1. It takes several taps, or lives somewhere a user wouldn't look (a long-press, a sheet inside a
   sheet, a setting in Preferences that changes another screen).
2. It has options to pick, or a choice with consequences (restore replaces or merges, a mode
   that changes later targets).
3. It's a core loop feature people use every session (logging sets, templates, load types),
   where a guide saves the most confusion overall.

Drop features a one-line note already explains, or that the screen itself makes obvious (a
labeled button that does one thing). Say why in the report rather than padding the list.

**Dedupe:** for each candidate, `gh issue list --state all --limit 500 --search "<feature>
guide"`. If an open issue already covers writing that guide, list it as "tracked in #N" and don't
offer it. Also check closed issues so you don't re-propose a guide that was deliberately dropped.

## 4. Ask, once, in a batch

Send one message that starts with an **Asks** list, then the gap report below it:

- Ask which missing guides to write. Use `AskUserQuestion` with `multiSelect: true`, the top
  four ranked gaps as options (mark the first "(Recommended)"), and the rest listed in the
  message text so the user can name them under "Other".
- Ask before deleting any orphaned guide, naming what's gone and where you checked.
- Stale guides don't need asking: fix them in step 5 and say so.

The gap report: a short table or list of every feature with its status (has guide, missing with
rank and one-line reason, stale with what changed, orphaned, tracked in #N, skipped as obvious).

If the user picks nothing and nothing is stale or orphaned, report and stop.

## 5. Write, fix, and remove

Make sure the dev server is up first (`curl -s -o /dev/null -w '%{http_code}'
http://localhost:5173`). If it's already responding, leave it alone; if not, start `npm run dev`
in the background and stop it again at the end. The app has no backend, so any running server works, and the screenshot scripts seed their own
local database (#940). Ask the user before stopping a server you didn't start.

**New guide** (for each one the user picked):

1. Pick a short kebab-case slug named for the task (`rest-timer`, `plate-calculator`).
2. Copy an existing guide (`site/guides/rest-timer/index.html` is a good model) to
   `site/guides/<slug>/index.html`. Keep the shared header, footer, Open Graph tags, and
   favicons; change the `<title>`, description, lede (what it's for, one or two sentences), and
   the `<ol class="steps">`: 3 to 6 numbered steps naming the real buttons and screens, with a
   `.guide-shot` screenshot on a step or two where a picture saves words.
3. Add a card to `site/guides/index.html` (`guide-card` link, title, one-line caption) in the
   same style as the others, inside the `guide-group` section whose topic heading fits it
   (Logging, Routines & programs, Progress, Make it yours, Your data & help). Add a new group
   only when none fits. `e2e/guides-index-unit.spec.ts` fails if a guide folder has no card or
   a card sits outside a group.
4. Add the screenshot steps to `scripts/capture-guide-screenshots.mjs`, in its existing `step()` /
   `shot()` pattern with a comment naming the feature and issue. Seed any data the shot needs in
   the sample account the way the bug-report shots do, never against a real pilot account. Run
   `node scripts/capture-guide-screenshots.mjs` and open every new image to check it shows what
   the step says. A failed step leaves `logs/guides/<timestamp>/fail-<name>.png`; fix the
   selector and rerun.
5. Link it. If a `release-notes/` file (or an item in `release-notes/archive.json`) has a note for
   this feature, add `"guide": "<slug>/"` to it (keep the text as it is; editing a file keeps its
   date and build, which come from the commit that added it). Don't invent a backdated note for an
   older feature that has none. The app's Account > About > Help & guides sheet (#568) builds
   its list and search index from `site/guides/` at build time, so a card on
   `site/guides/index.html` is all it takes to reach a guide from the app; there's no in-app list
   to update. If people would search for it with words the guide doesn't use, add them to
   `src/lib/guideSynonyms.ts`.

**Stale guide:** update its steps and copy to match the source, update or add its screenshot
steps in the capture script, and rerun the script. Keep the slug so existing links still work.

**Orphaned guide** (only with the user's OK): delete `site/guides/<slug>/`, its card in
`site/guides/index.html`, its images in `site/img/guides/`, and its steps in the capture script,
and turn any release note linking it back into a plain string. If app code other than
`release-notes/` still references the slug, don't delete yet: file an issue
(`gh issue create ... --label bug --label effort:<E> --label value:<V>`, self-scored, Fibonacci)
to remove that reference, and leave the guide in place until it ships.

**Docs:** update the "Today:" list of guides in `docs/architecture/site-and-tools.md` "Marketing site" so it
matches `site/guides/`. Fix each stale doc from step 2 to match the source (a historical mention
of a removed file can stay, marked `<!-- docs-refs: ignore -->` at the end of its line), then
rerun `node scripts/check-docs-refs.mjs` until it exits 0.

**Check the pages:** serve `site/` (for example `python -m http.server` inside it; links are
root-relative) and take a Playwright screenshot of each new or changed guide and the index at
390px and 1280px, into the scratchpad, not the repo. Open them and fix anything that breaks the
layout the other guides use.

## 6. Gate, commit, push

- If anything under `site/guides/` or `release-notes/` changed: `npm run build`, then
  `npx playwright test e2e/guides-index-unit.spec.ts e2e/whats-new-unit.spec.ts e2e/guide-search-unit.spec.ts e2e/local/guide-search.spec.ts`.
  All must pass. The app build reads every guide into the in-app Help & guides search (#568), so
  a guide its parser (`scripts/lib/guide-index.mjs`) can't read fails the build, and
  `guide-search.spec.ts` checks some guide copy (reword it there too if you reword those steps).
  Keep each guide's markup: `h1`, `p.guide-lede`, and an `h2` plus `p`/`li` text inside each
  `div.step-text`, with its card in an `h2.guide-group-title` group on `site/guides/index.html`.
- Otherwise (only images, the capture script, or docs): `git diff --check` and `npm run check:docs`.

`git add` only the files this run touched (guide folders, `site/guides/index.html`, images
under `site/img/guides/`, the capture script, the `release-notes/` files it edited, and any docs it fixed).
Never `git add -A`: another session may be editing this folder. One commit, subject
`Add guides from help-review: <short list>` (or `Update guides from help-review: ...` when it
only fixed or removed), then ship it as a pull request (`main` takes only PRs, #681):
`docs/architecture/commit-policy.md` > Shipping a change outside a lane. Cloudflare Pages
redeploys repbunny.app when it merges.

No release note for any of this: guides are site content, not an app change (`docs/backlog.md`).

## 7. Report

```
## Help review

<F> features checked, <G> had guides. Wrote <W>, fixed <S> stale, removed <R>, fixed <D> stale docs.

### Written
- <slug>: <feature>, linked from <release note date | not linked from the app yet>

### Fixed
- <slug>: <what was out of date>

### Removed
- <slug>: <why>

### Docs fixed
- <path:line>: <what was out of date>

### Still missing
- <feature>: <rank reason> (or "tracked in #N", or "skipped: obvious from the screen")

Commit: <short SHA> <subject>
```

Omit empty sections. Get the short SHA from `git log -1 --format=%h` after the push.

## Hard rules

- **Dated owner steps (#746).** Anything you file or comment that needs the owner on or after a date (a deadline, a check-back, an `On hold until`) carries `<!-- owner-date: YYYY-MM-DD[THH:MM] | <short what> -->`, and a dated ask uses `ask-dean.mjs --owner-date`, so it lands on the owner's Google Calendar (`docs/backlog-runner.md` > Owner calendar). Dates only you act on don't need one.
- Never change app code other than `release-notes/`, and there only to add or remove a
  `guide` link on an existing note. Anything else in `src/` that needs changing becomes an issue.
- Never write a guide the user didn't pick, and never delete one without their OK.
- Never describe a step you haven't checked against the current source.
- Never run against the real pilot accounts: screenshots only come from the capture script's
  sample account.
- Never add a release note for guide work, and never backdate one.
- No social posts or other promotion of the guides (marketing is on hold until the App Store
  launch).
