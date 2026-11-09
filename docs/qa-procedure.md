# Android QA procedure (#211)

The manual test pass for the Android app, run by a person before a store release (the full plan)
and on every build (the smoke subset). The e2e suite covers the automated side; this covers what
only a phone and a human can: the user experience, device states, and real data.

- **The page:** https://claude.ai/artifact/LC4VqFUPErxCLSbEKx1v8n (private to the owner). Four
  tabs: Run, Journeys, Release, Data. Mockup: `docs/design/issue-211-qa-procedure.html`, option A.
- **The data files:** `My Drive\RepBunny QA\Test data\`, one subfolder per area, plus
  a README.txt saying when they were made and for which build. <!-- docs-refs: ignore --> Keep the previous store bundle in
  `My Drive\RepBunny QA\Builds\` for the update test (TC-UPG-001).
- **The release email:** a `store/v*` tag's testing email links this page and points at its
  Smoke filter, Release tab, and TC-UPG-001 (#216; docs/architecture/native-releases.md >
  Releasing).

## What's where

| File | What it is |
| --- | --- |
| `scripts/qa/procedure.mjs` | Every area (with the source paths it covers), test case, journey, and release check. Edit this to change the procedure. |
| `scripts/qa/fixtures.mjs` | The test data scenarios. Each builds a RepBunny backup (or a Strong or Hevy CSV) with dates counted back from today. |
| `scripts/qa/generate-fixtures.mjs` | `npm run qa:fixtures`: writes one file per test case to Drive (or `--out <folder>`). |
| `scripts/qa/page.html` | The page template (vanilla JS, the app's color tokens). |
| `scripts/qa/build-page.mjs` | `npm run qa:page`: fills the template with the procedure and recent commits per area, and writes the page to your temp folder (or `--out <file>`). |
| `e2e/qa-fixtures-unit.spec.ts` | Checks the procedure's shape and that every area path exists, restores every backup scenario through the SQLite repos (the store build's code), and checks the broken and import files behave as intended. |

## Refreshing

- **Before a run:** `npm run qa:fixtures`. Many test cases depend on today's date (this week, last
  month, a trial ending today), so files made weeks ago stop testing what they claim. A refresh
  replaces the files in place and removes ones no test case uses any more.
- **After changing the procedure or shipping code:** `npm run qa:page`, then ask Claude to publish
  the output to the page's URL above (Artifact tool, `url` set to it, no `capabilities` so the
  stored `db` and `user` declaration carries over). The page records each area's last dozen commits
  and their build numbers at build time, so republish after code changes for "Changed since last
  pass" to see them.

## How the page works

- **Saved state** lives in the artifact's `db`, so it survives a reload and shows on the phone
  and the laptop. Collections: `progress/<test case>` (this run's ticks, result, notes; Clear
  all deletes them), `history/<test case>` (last pass and last fail with build, device, and what
  was installed; never cleared), `journeys/<id>`, `perf/<build>_<device>`, and the `state/run` and
  `state/release` documents. Opened outside claude.ai, the page works but says it isn't saving.
- **Build numbers** are `git rev-list --count`, the number in About. The run's build, device, and
  **Premium on this install** (yes for the personal build, or a store install with Premium
  bought) are set at the top of the Run tab and stamped on every result. The Run tab has a Free
  section (cases with `tier` free or both) and a Premium section (`tier: 'premium'`), each with its own
  progress. With Premium set to no, the Premium section is collapsed and its cases don't count.
- **Changed since last pass:** a test case is marked when its area has a commit with a higher
  build number than the one it last passed on. The Changed filter shows only those, and changed
  areas sort first. Journeys are **Due** after their cadence and **Due early** when one of their
  areas changed since the last run.
- **Report a bug** on a failed test case fills in an issue body to paste into GitHub yourself.
  Fix it with an e2e regression test as usual; the test case then shows as changed on the next
  build, so it gets a manual rerun.
- **Speed:** the Release tab keeps cold start and set save per build and device from TC-PERF-001,
  and flags a jump of more than 20% over that phone's previous build.

## Adding a test case

Add it to `TEST_CASES` in `scripts/qa/procedure.mjs` with the next number in its area and a `tier`
(`free`, `premium`, or `both`). If it
needs data, give it `data: { scenario, label }` (an existing scenario, or a new one in
`scripts/qa/fixtures.mjs`); the file is named `<id> <label>.json`. Run
`npx playwright test e2e/qa-fixtures-unit.spec.ts`, then refresh the files and the page. A new
area needs `paths` that exist, or the spec fails.

The iPhone procedure is a separate issue and reuses this structure and the data files.

## Android QA batches (#341)

One open issue labeled `android-qa-batch` ("Android QA batch: since build N") is the checklist of
native-only work shipped since the last tested build. It also carries `human`, `tooling` and
`status:needs-review`, so no lane picks it.

- **What goes in:** only changes that meet the native-only rule in
  `docs/architecture/commit-policy.md` > Native-only checks. Everything the e2e suite covers stays out.
- **How:** `next-item` (step 7.2b) updates the full test case in `scripts/qa/procedure.mjs` (steps,
  expected, priority, tier (`free`, `premium`, or `both`), a `data` scenario when setup is needed, `ux` checks), adds any new native source files to
  the area's `paths`, then runs `node scripts/qa-batch.mjs --add <TC-ID> --issue <N> --summary "<one line>"`.
  That appends `- [ ] TC-XXX-000 (P1) summary, from #N (date)` or updates the line when the case is
  already listed. `--dry-run` prints the REST calls instead of writing; `--status` prints the open batch.
- **Threshold:** with 10 or more untested cases, or a P1 line 7 days old, the script asks the owner once
  (`ask-dean.mjs`: "N Android cases due (P P1). Cut a build?") and leaves a `qa-batch-asked` marker comment, so
  the next append stays quiet. A new batch asks again.
- **Closing:** the owner closes the batch after testing a build. Closing means "this build was tested",
  not "all passed"; bugs found get their own issues. The next native item starts a new batch.
