// Issue #238: a cloud environment's setup script doesn't run inside the repo,
// so `npm ci` there fails ("can only install with an existing
// package-lock.json"). This SessionStart hook (.claude/settings.json) installs
// the project's packages once the session is in the repo instead. The setup
// script keeps the parts that don't need the repo (the browser's system
// libraries and gh). Does nothing outside a cloud session, so the laptop
// never pays for it. Node rather than bash so the hook runs the same on
// Windows.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0)

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const run = (command) => execSync(command, { cwd, stdio: 'inherit' })

// --ignore-scripts (#697): a dependency's install script would otherwise run with the session's tokens.
// Nothing the app or gate needs is built by one (only core-js's banner and macOS-only fsevents have any).
if (!existsSync(join(cwd, 'node_modules'))) run('npm ci --ignore-scripts --no-audit --no-fund')
// Skipping scripts also skips `prepare`, which is what sets the pre-push hook (commit-policy.md), so set it here on every start.
run('git config core.hooksPath scripts/git-hooks')
// Issue #679: commits from cloud sessions are authored by the Builder bot, so `git log` tells agent
// work from the owner's. Pushes still go through the session's git proxy whatever the author says.
run('git config user.name "repbunny-builder[bot]"')
run('git config user.email "345832184+repbunny-builder[bot]@users.noreply.github.com"')
// A no-op when the setup script already fetched this version's browser; picks
// up a new one after @playwright/test is bumped.
run('npx playwright install chromium')
// Issue #904: one line on what's waiting for the owner (scripts/owner-queue.mjs --summary), so the
// first reply of an interactive session can say so. Labels only, a few seconds; it never fails the hook.
try {
  execSync('node scripts/owner-queue.mjs --summary', { cwd, stdio: ['ignore', 'inherit', 'ignore'], timeout: 30000 })
} catch {
  // no line this time
}
