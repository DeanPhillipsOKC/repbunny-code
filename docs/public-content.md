# Public content rule

The code goes public as a snapshot of this repo (`repbunny-code`, #937, `docs/decisions.md` >
Public code repo), and its later PRs, commits, and files are public too. This repo's issues stay
private. So anything an agent writes into a file, a commit message, a PR title or body, a review,
or a PR comment is written for the public. Issues in the private backlog repo aren't covered.

## Never in files, commits, or PR text

- **People's names other than the owner's.** No pilot users' or testers' names. Write "the iPhone
  tester", "a pilot user", or "a tester". The owner, Dean Phillips, is named in `LICENSE` and on
  the site, and may be named.
- **Email addresses**, other than hello@repbunny.app, bot and noreply addresses (such as
  `noreply@anthropic.com` in a `Co-Authored-By` line), and documentation domains (`example.com`,
  `.test`). Placeholders use `you@example.com`.
- **Support email content.** No quotes from a support email, its headers, its sender, or a link to
  the Gmail thread. Describe the bug in your own words; the evidence stays on the private issue
  (`<!-- support-evidence -->` comments, #695).
- **Customer data.** Nothing a user logged or sent: workouts, notes, measurements, backups, bug
  report bodies, screenshots of a real person's data. Use seeded test data.
- **Private hostnames**: the retired pilot's hosts and backend, local network addresses, and
  dashboards only the owner can open.
- **Tokens and secrets**, even expired ones. gitleaks also checks every PR (`.github/workflows/ci.yml`).

## Issue references

Issues live in the private repo, so a bare `#N` in the public repo points at the wrong place.
In PR text and commits written in the public repo, write `DeanPhillipsOKC/repbunny#N`. Files
copied from this repo keep their bare `#N` (they mean this repo's issues); don't rewrite them.

## The check

`npm run check:public` (`scripts/check-public.mjs`) scans every tracked file, and file names, for
the patterns above and fails on a match. CI runs it on every PR. Before posting a PR body,
review, or comment, or committing, check the text with
`node scripts/check-public.mjs --stdin < <file>`.

A reviewed exception goes in `scripts/public-allowlist.json` as `{ "path", "rule", "reason" }`
(`path` is a file, or a folder ending in `/`). Add one only when the text is meant to be public,
such as the site's About section, which the owner wrote and which names its people on
repbunny.app. Never allowlist a personal address or support content. The check can't see
everything (a name it doesn't know, a paraphrased email), so the rule above still applies where
it's silent.
