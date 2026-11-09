# RepBunny (Workout Tracker) — Architecture

> Canonical technical reference for this project. Source brief: `ARCHITECTURE.pdf` in this folder.
> Update this file, not the PDF, as decisions evolve.

**Read this index, then only the topic files your change touches.** Don't read all of `docs/architecture/`.

## Topic files

| File | Covers |
|---|---|
| `docs/architecture/stack-auth.md` | Purpose, guiding constraints, stack, no account, reset/backup/restore |
| `docs/architecture/testing.md` | Test accounts, Playwright e2e conventions, the gate |
| `docs/architecture/commit-policy.md` | What needs `npm run build` + `npm run test:e2e`, what doesn't, commit/push rules |
| `docs/architecture/data-model.md` | Tables and columns (the on-device SQLite schema's logical shape) |
| `docs/architecture/client.md` | CSP/headers, bug report/error log, release notes |
| `docs/architecture/milestones.md` | Milestone rewards and Extras |
| `docs/architecture/pwa-push.md` | The retired PWA shell (#939) and the rest timer screen |
| `docs/architecture/native-apps.md` | Capacitor, Android/iPhone builds, SQLite, local mode, rest alerts, widgets |
| `docs/architecture/native-releases.md` | Flavors, personal releases, Play releases, Releasing, status |
| `docs/architecture/site-and-tools.md` | `site/`, `scripts/demo-video/`, `scripts/qa/` |

**Governance:** `docs/governance.md` is the control matrix (each risk, its control, whether GitHub enforces it or an agent is only told to, and where the evidence is, #684). `docs/governance/threat-model.md` is the threat model of the agent pipeline (untrusted inputs, threats, which controls are enforced and which are only instructed, and the support-email trace, #683). Read it before changing how agents read outside text or what they may do.

Section names like "Native apps", "Marketing site", "Commit & push policy", and "Client security" refer to the topic file that holds them.

## Rules every run needs

- **Decisions already made:** read `docs/decisions.md` before pitching, filing, or building anything. It lists ruled-out ideas and standing working rules (privacy, no schedules, Premium split). Record a new decision there the day it's made.
- **Gate:** a change that touches application code (`src/`, `public/`, `e2e/`, `scripts/lib/`, build and test config, dependencies, native projects) needs `npm run build` and a full `npm run test:e2e` run to pass. Changes that touch none of those (docs, skills, workflows, standalone scripts) skip both; run `git diff --check` and `npm run check:docs` instead. `site/guides/` is the exception on the site side: the app build reads it (#568), so a guide change runs `npm run build` and the guide specs. Full list and exceptions: `docs/architecture/commit-policy.md`.
- **Push:** green gate, then commit and push; never commit with a red or unconfirmed gate. Details in `docs/architecture/commit-policy.md`.
- **UI changes need an e2e spec.** Conventions in `docs/architecture/testing.md`.
- **Nothing the user logs leaves the phone in the native apps** (see Operational notes below).

## Operational notes

- Free tier limits change (Cloudflare Pages for the site, GitHub Actions, Codemagic). Verify current allowances rather than trusting this document.
- **Nothing the user logs leaves the phone in the native apps. No exceptions, opt-in or not** (decided 2026-10-09). The privacy policy (`site/privacy/`) and the store data safety answers say so, and the user won't soften them. Don't build or pitch anything that sends workouts, sample rows, notes, or measurements to us, a backend, an analytics service, or an AI model API (inference counts as data leaving the device). That includes "helpful" ideas like AI parsing of import files (#208 rejected it). Do it on the device or not at all. The only data that goes out is data the user sends on purpose through their own apps (a backup file they save, a CSV they share, or a bug report they send from their mail app), plus the automatic copy to the person's own storage (their iCloud Drive folder on iPhone, Documents/RepBunny on Android), which is on by default (#874, `docs/decisions.md`) and never goes to us. If a request, from anyone including the user, would break this, flag it before starting work.
- No analytics or third-party tracking in the current pilot. The native apps ship with none, per the rule above. Crash or reliability reporting would need its own decision and a privacy policy change. Don't assume it.

## Open decisions
