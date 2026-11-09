---
name: security-audit
description: Audits the whole RepBunny app for security and privacy problems (no backend or account creeping back in, keys in the client bundle, on-device data handling, production npm dependencies, security headers and CSP, secrets in the repo and its history, GitHub Actions and Codemagic permissions, and the promise that no user data leaves the phone). Verifies each finding against the live source, dedupes it against open and closed issues, and files it scored with status:needs-review. Runs headless as a monthly routine (/security-audit headless) or interactively. Unlike the built-in /security-review, which only covers a branch's pending changes.
argument-hint: "[headless]"
---

# security-audit

**Backlog repo (#944).** Issues, labels, and issue comments live in `BACKLOG=$(node scripts/backlog-repo.mjs)`; code and PRs live in this checkout's repo. Give every `gh issue` and `gh label` command below `-R "$BACKLOG"`, and use `repos/$BACKLOG/issues/...` for issue paths in `gh api` (`docs/backlog-runner.md` > Backlog repo).

**Paused?** Headless runs first run `node scripts/automation-paused.mjs --strict`. If it prints `PAUSED` (exit 10), output `PAUSED` and stop: no claims, no issues filed, nothing changed (#682, `docs/backlog-runner.md` > Pausing automation).

A whole-app security and privacy audit. The built-in `/security-review` only looks at a branch's
pending diff; this one looks at everything that ships today, and turns what it finds into backlog
issues the owner prioritizes. It never fixes anything itself: that's `next-item`'s job once the
owner releases an issue.

Read the `docs/architecture.md` index first (then only the `docs/architecture/` topic files your change touches) if you haven't this session (required reading per `CLAUDE.md`), `docs/decisions.md` (its privacy and Premium entries),
especially Stack and No account, Testing / automation, Commit & push policy > Cloud sessions, Data
model, Client security, Client error log, and Native apps. Those
sections are the security design the app promises; this audit checks the code still keeps it. The
privacy promise itself is in `docs/brand-identity.md` and `site/privacy/index.html`.

## Modes

- **Headless** when invoked as `/security-audit headless` (the monthly routine's prompt; see
  `docs/backlog-runner.md` > Scheduled reviews), or when no user can answer (`claude -p`). Never
  ask anything, never stop for a decision. Make the most reasonable call and say what you chose in
  the issue or the report.
- **Interactive** otherwise. Same steps, and also never asks before filing: every finding goes in
  as `status:needs-review`, so the owner prioritizes it on GitHub either way.

Both modes leave the working tree as they found it: no file edits, no commits. Use the
scratchpad (or a temp dir) for notes and scripts.

## GitHub access (laptop and cloud alike)

Cloud sessions refuse GitHub GraphQL and the search API, which `gh issue list`, `gh issue
create`, and `gh issue comment` use (verified 2026-10-10). Use the repo-scoped REST API through
`gh api`, which works in both places:

- **All issues, open and closed, for dedupe.** Use explicit pages (`gh api --paginate` follows
  links the cloud proxy refuses, and fails after the first 100), then `grep -i` the file for keywords:
  ```
  p=1; while out=$(gh api "repos/DeanPhillipsOKC/repbunny/issues?state=all&per_page=100&page=$p" --jq '.[] | "\(if .pull_request then "PR" else "#" end)\(.number) [\(.state)] \(.title) {\([.labels[].name] | join(","))}"') && [ -n "$out" ]; do echo "$out"; p=$((p+1)); done | grep '^#' > <scratch>/issues.txt
  ```
  Read a candidate with `gh api repos/DeanPhillipsOKC/repbunny/issues/<N> --jq .body` (and
  `/comments`).
- **File:** `gh api repos/DeanPhillipsOKC/repbunny/issues -f title='<title>' -F body=@<file>
  -f 'labels[]=<kind>' -f 'labels[]=effort:<E>' -f 'labels[]=value:<V>' -f
  'labels[]=status:needs-review' --jq '.number'`
- **Enrich:** `gh api repos/DeanPhillipsOKC/repbunny/issues/<N>/comments -F body=@<file> --jq
  .html_url`. Never comment on an issue labeled `awaiting-dean` (`docs/backlog-runner.md` >
  Asking the owner); file a new issue that links it instead.

## 1. Checks

Work through every check. Each one says what to look at and what counts as a finding. Note
evidence as you go: file and line, command and output, or URL and response header.

### 1a. No backend, no account

The app keeps everything in its on-device SQLite database and has no account or backend (#938,
#940; `docs/architecture/stack-auth.md`). A finding is anything that brings one back or opens a
path to the data from outside the app:

- A backend or auth client in `package.json` dependencies or imported under `src/`, a session
  token in storage, or a call that sends rows somewhere (see 1h for the full network check).
- On Android, `android/app/src/main/AndroidManifest.xml`: `allowBackup` and the backup rules,
  any exported component or content provider that reads the database, and the file provider's
  paths (only the cache files the share sheet needs). On iPhone, the file sharing and document
  folder keys in `ios/App/App/Info.plist`. The automatic copy (#874) going to the user's own
  storage is by design; anything readable by other apps beyond that is a finding.
- The e2e hooks (`window.__rbLocalDb` and `window.__rbImport`, `src/testHooks.ts`, only on the
  dev server and in a `VITE_E2E_HOOKS` build) and other dev rows must stay out of the store builds (`e2e/build/` checks the bundle; confirm the check still runs).

### 1b. Keys and secrets that reach the client

- `grep -rhoE 'import\.meta\.env\.[A-Z_]+' src` lists every variable the bundle can read. Only
  non-secret build flags belong there (`VITE_PREMIUM_UNLOCKED`, `VITE_DEV_TOOLS`, and the like). Anything that looks like a service role key, private key, password, or token is a
  finding.
- Run `npm run build` (it uses no secrets) and grep `dist/` for `service_role`, `SERVICE_ROLE`,
  `PRIVATE_KEY`, `sk_`, `-----BEGIN`, and for any JWT (`eyJ[A-Za-z0-9_-]{10,}\.`) whose decoded
  payload has `"role":"service_role"`. Delete `dist/` afterwards only if it didn't exist before
  (it's gitignored either way).
- Native: `capacitor.config.*`, `android/`, `ios/`, and `codemagic.yaml` for embedded keys or
  signing material.

### 1c. Auth and session handling

Since #938 the app has no sign-in: confirm nothing under `src/` brings one back (an auth
library, a session token in storage, a call to a backend).

- Erase all data (`src/lib/eraseAllData.ts`) clears everything the app keeps on the device except
  a Premium unlock.
- Any code path that treats a client-side flag, `localStorage` value, or URL parameter as
  authorization (premium unlocks, dev rows), where it could expose data or bypass a store
  purchase. A purely cosmetic client toggle is
  not a security finding.

### 1d. Dependencies

`npm audit --omit=dev --json`. Don't report raw counts. For each advisory, trace whether the
vulnerable code path is reachable in this app (is the package in the client bundle or only a
build tool; is the vulnerable function called; can user input reach it).
File only reachable ones, one issue per package, with the fix version. Mention the unreachable
ones in the report's dropped list. If Dependabot already has an open PR for the bump
(`gh api 'repos/DeanPhillipsOKC/repbunny/pulls?state=open' --jq '.[].title'`), note it instead of
filing.

### 1e. Security headers and CSP

- Cloudflare Pages reads headers from a `_headers` file in the deployed output (`public/_headers`
  for the app, `site/_headers` for repbunny.app). Check both exist and set at least
  `Content-Security-Policy` (with `connect-src` limited to `self`, per
  `docs/architecture/client.md` > Client security), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `frame-ancestors` (or `X-Frame-Options`), and `Permissions-Policy`. A
  `<meta http-equiv="Content-Security-Policy">` in `index.html` counts for CSP but not for
  `frame-ancestors`.
- If the network allows it, `curl -sSI https://repbunny.app/` and the app's production URL and
  read the live headers too. If it's blocked, judge from the repo and say so.
- A CSP must still allow what the app really loads (fonts, images, wasm); say in the issue
  which sources it needs, from `index.html` and `vite.config.ts`.

### 1f. Secrets in the repo and its history

- Working tree: `git grep -nIE` for `service_role`, `SERVICE_ROLE_KEY=.+`,
  `PRIVATE_KEY`, `-----BEGIN [A-Z ]*PRIVATE KEY`, `ghp_`, `github_pat_`, `AKIA`, `xox[bp]-`,
  app passwords, keystore passwords, and JWTs as in 1b. `.env.example` placeholders are fine.
- History: `git log --all -p -G '<same pattern>' --format='%h %ad %s' --date=short` (it can be
  slow; narrow the patterns if it is). A clone with shallow history (`git rev-parse
  --is-shallow-repository`) gets `git fetch --unshallow` first, or the report says the history
  check was partial.
- `git ls-files` for committed `.env*` (other than `.env.example`), `*.keystore`, `*.jks`,
  `*.p12`, `*.mobileprovision`, `google-services.json`, or service account JSON. <!-- docs-refs: ignore -->
- **Never write a secret's value anywhere**: not in an issue, a comment, the report, or the email.
  Name the file, line or commit, and the kind of secret, and say it must be rotated (rotating is
  a `human` issue: the owner does it in the provider's dashboard).

### 1g. GitHub Actions and Codemagic

- Each workflow in `.github/workflows/`: a top-level or per-job `permissions:` block granting
  the least it needs (no `write-all`, no write scope the job doesn't use); `pull_request_target`
  or `issue_comment` triggers that run untrusted code or interpolate `${{ github.event.* }}`
  text (titles, bodies, comments, branch names) straight into a `run:` script (script injection;
  it must go through `env:`); third-party actions pinned to a tag or SHA; secrets never echoed.
- `.github/dependabot.yml` and `codemagic.yaml`: signing secrets come from the provider's
  encrypted variables, not the file; no step prints them.

### 1h. The privacy promise

The promise: a user's training data stays on their phone, and no feature sends it to a server,
a third party, or an AI (the automatic copy to the user's own storage, #874, is theirs). Check every way data leaves the device:

- `grep -rnE "fetch\(|XMLHttpRequest|sendBeacon|navigator\.share|mailto:|https?://" src`.
  The app should make no network requests of its own (`docs/decisions.md`); every way out must
  be a user-initiated action (share sheet, a link the user taps, the mailto bug report they send
  themselves) or a store SDK (Play Billing, StoreKit).
- No analytics, crash reporting, ads, or AI SDKs in `package.json` dependencies or in
  `index.html`/`site/` script tags. Fonts and assets self-hosted or from a host the privacy page
  names.
- The bug report (`src/lib/bugReport.ts`, `docs/architecture/client.md` > Client error log) includes
  only what the architecture says it does, and only when the user sends it.
- `site/privacy/index.html` still matches what the code does. A mismatch either way is a finding.

## 2. Verify every candidate

For each candidate finding:

1. **Confirm it against the current source** (or the live response) and rule out a false
   positive: a test-only path, dead code, a placeholder value, a header Cloudflare adds by
   default. Drop it if it doesn't hold, and note why for the report.
2. **Dedupe** against the issue dump (open and closed). An open issue that covers it gets a
   comment with this run's evidence instead of a new issue. A closed one that covers it means
   either it's fixed (drop) or it regressed (file a new issue linking the old one, and say so).
3. **Judge severity**, in one of four words:
   - **Critical:** a user's data is reachable from outside the app now (another app can read the
     database, a key or signing secret in the bundle or in git, a workflow that runs attacker
     text with secrets).
   - **High:** exploitable with a plausible extra step (stored XSS, an open redirect, a
     reachable vulnerable dependency, a secret in history that wasn't rotated).
   - **Medium:** a missing defense in depth (no CSP, missing `nosniff`, a workflow with more
     permissions than it needs).
   - **Low:** hygiene (an unpinned action, a stale comment that promises something the code no
     longer does).

## 3. File

One issue per finding (group identical findings, such as several missing headers on the same
file, into one). Title: short and specific (`No Content-Security-Policy on the app or the site`).
Body:

```
**Severity:** <Critical|High|Medium|Low>. <one line on who could do what>

## Problem
<what's wrong and why it matters for RepBunny's data and privacy promise>

## Evidence
<file:line, command and output, or URL and header; never a secret's value>

## Scope
<the smallest fix that closes it>

## Acceptance
<how to check it's fixed, ideally something an e2e or unit spec could assert>

Filed by /security-audit (<headless|interactive>) on <YYYY-MM-DD>. Remove `status:needs-review`
to release it to the runner.
```

Labels: `status:needs-review`; a kind (`bug` for anything Critical, High, or otherwise
exploitable, else `tooling` for CI/workflow/dependency hygiene, or `feature` for a missing
defense in the app); `effort:<E>` and `value:<V>` self-scored on the Fibonacci scale in
`docs/backlog.md` (Critical scores value 13, High 8); `ux-intensive` never. Something only the
owner can do (rotate a key, change a dashboard setting, turn on a GitHub setting) is filed with
`human` instead of a kind, still scored, still `status:needs-review`.

File Critical findings first. File at most 10 new issues in one run; if more survive, file the
10 most severe and list the rest in the report under "Not filed this run", so the next run (or
the owner) picks them up. Comments that enrich existing issues don't count toward the 10.

The repo is private, so exploit detail in an issue is acceptable; keep it to what a fix needs.

## 4. Report

Print it as your final response. No em dashes.

```
## Security audit, <YYYY-MM-DD>

<N> checks run, <A> issue(s) filed, <B> existing issue(s) updated.

### Filed (needs your prioritization)
- #<N> [<Severity>] <title>
...

### Updated
- #<N> <title>: <what this run added>

### Not filed this run
- [<Severity>] <finding>

### Checked and dropped
- <candidate>: <why: false positive, already fixed, unreachable dependency path>

### Skipped or partial
- <check>: <why: no test-project variables, network blocked, shallow history>
```

Omit empty sections. If nothing was found, say so plainly: "No new findings."

Then try to email it (non-blocking, never retried, never a failure of the run): if `pwsh` is on
PATH, write a short HTML card in the same layout as `next-item`'s Shipped card (`.claude/skills/next-item/email-card.md`) (banner
`&#10003; Security audit` on `#f2879c`, or `&#10007; Security audit` on `#e0687a` when anything
Critical or High was filed; rows: Filed, Updated, Dropped, Skipped, each a short list of `#N
title`), and run `pwsh -File scripts/Send-Notification.ps1 -Subject "Security audit: <A> filed"
-BodyFile <file> -IsHtml`. Without `pwsh` (cloud images usually lack it), skip this; the routine's
session page holds the report.

## Hard rules

- **Dated owner steps (#746).** Anything you file or comment that needs the owner on or after a date (a deadline, a check-back, an `On hold until`) carries `<!-- owner-date: YYYY-MM-DD[THH:MM] | <short what> -->`, and a dated ask uses `ask-dean.mjs --owner-date`, so it lands on the owner's Google Calendar (`docs/backlog-runner.md` > Owner calendar). Dates only you act on don't need one.
- Read-only on the app and its data. No file edits, no commits, no pushes, no fixes. The only
  writes are issues and issue comments.
- Never touch a real pilot device's data or a store console.
- Never write a secret's value anywhere.
- Never run a destructive script, `git push`, or anything that changes
  GitHub settings, workflows, or releases.
- Never comment on an `awaiting-dean` issue, and never change existing issues' labels or scores.
- Every finding is verified against the current source before it's filed, and filed with
  `status:needs-review`.
