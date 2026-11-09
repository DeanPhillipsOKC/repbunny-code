# RepBunny (Workout Tracker)

Strength workout tracker for Android and iPhone, currently in a small invite-only pilot (Vue 3 + TS + Capacitor, all data in on-device SQLite; the marketing site on Cloudflare Pages).

Project knowledge lives under `docs/`, shared with any agent working in this repo — read it before making changes:

- `docs/architecture.md` — short index plus the rules every run needs; read it, then only the `docs/architecture/` topic files your change touches (stack, data model, RLS, PWA, native apps, verification policy). Canonical reference.
- `docs/decisions.md` — product and working-rule decisions the owner has already made (privacy, no schedules, milestones, Premium split, and more). Read it before pitching, filing, or building anything, and don't re-propose what it rules out.
- **GitHub Issues** (https://github.com/DeanPhillipsOKC/repbunny/issues, via the `gh` CLI) — the active backlog: features, bugs, tooling, and human-only setup tasks. Check open issues before starting new work. Issues labeled `human` are not yours to attempt — flag if one is open and blocking. `docs/backlog.md` has the label conventions and maps old "item N" numbers to issues.
- `docs/backlog-archive.md` — frozen history of backlog items shipped before the move to Issues (2026-09-28). Not required reading; check it only for history on something already shipped.
- `docs/public-content.md` — what may appear in this repo's files, commits, and PR text, since the code goes public (no testers' names, personal addresses, or support email). Check with `npm run check:public`, or `node scripts/check-public.mjs --stdin` for a PR body.
- `docs/ARCHITECTURE.pdf` — original brief `architecture.md` was transcribed from. Treat the markdown as source of truth going forward.

Keep this file a thin pointer to `docs/` — put new project knowledge there, not here.

Changes that touch no application code (docs, skills, workflows, standalone scripts) do not require `npm run build` or `npm run test:e2e`; see the verification and commit policy in `docs/architecture/commit-policy.md`.

## Reply format

Start every reply with a one-line status of what's done. Put anything the owner has to do in a short **Needs you** block with the exact step, or say "Nothing needed from you." Don't open a reply with questions; ask them after the status, and only when the answer changes what you do next.
