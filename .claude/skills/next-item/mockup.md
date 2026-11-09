# next-item: ux-intensive picks (check and mockup)

Side file of `SKILL.md` (steps 1 and 2b). Read only when the pick has `"uxIntensive": true`, after the check below, step 2b follows.

### UX-intensive check (before any other work)

If the pick has `"uxIntensive": true` (label `ux-intensive`), check which model you're running on
(your model ID is in your system prompt). In the user's experience, layout- and visual-heavy work
(alignment, spacing, building a mockup faithfully) is where smaller models struggle, and a frontier
model is cheaper overall because it usually gets it right the first time.

- **Frontier model** (Claude Opus class or newer; not Sonnet or Haiku): no heads-up and no
  question, interactive or headless. Proceed with the pick; step 2b drafts the mockup and you pick
  the design yourself (decided by the user 2026-10-09: they nearly always took the recommended
  option, and anything they dislike in testing becomes a normal issue).

Otherwise, stop before reading code or changing anything and warn the user first:

- **Interactive session:** say, at the top of your message:
  `Heads-up: #<N> "<title>" is labeled ux-intensive (layout/visual-heavy). It's likely best done
  with a frontier model.` Then ask with `AskUserQuestion` (one question, header "UX work"):
  "Proceed with #<N> on this model", "Skip to the next non-UX issue" (then use
  `node scripts/next-issue.mjs --top --no-ux` as the pick; if it prints nothing, output
  `BACKLOG_EMPTY`), or "Stop" (make no changes and end). Continue only as chosen. Proceeding
  with a ux-intensive issue on a non-frontier model goes through step 2b with the user approving
  the mockup (step 2b's item 4) before any code.
- **Headless** (no user to answer, e.g. `claude -p "/next-item"`): make no changes and output
  exactly `UX_INTENSIVE: #<N> <title> (best suited for a frontier model; run it interactively)`,
  then stop.

## 2b. Mockup first (ux-intensive picks only)

For a `ux-intensive` issue, settle the layout as a mockup before writing any app code or running
the gate. The full e2e runs are where most of the time goes, so the look gets settled first, while
changing it is cheap. On a frontier model (step 1), you choose the design yourself in item 4; on any
other model (interactive only; headless already stopped in step 1), the user approves it.

1. **Already approved?** If an issue comment from the user starts with `Mockup approved:` (naming
   the file and option), skip to step 3 and build to that mockup faithfully.
2. **Draft it.** Read the screens and components the issue touches, then write
   `docs/design/issue-<N>-<slug>.html` (same convention as the existing `docs/design/` pairs): a
   static page with no app code, using the real color tokens from `src/style.css` and the app's
   fonts, drawn as 375px-wide phone artboards. Use real copy and realistic data (long names,
   kg and lb, empty state, Premium preview, mid-workout, whatever the change can hit). Give 2 or 3
   labeled options (A, B, C) when the layout is genuinely open, and one when the issue already
   specifies it.
3. **Look at it yourself first.** Render it to `docs/design/issue-<N>-<slug>.png` with a throwaway
   Playwright script (not an e2e spec), open the image, and fix anything misaligned, clipped, or
   off-brand before showing it.
4. **Choose (frontier model).** Pick the option that best fits the issue, the brand guide
   (`docs/brand-identity.md`), and the screens around it, and continue to item 5 without asking.
   Interactive: show the PNG in one line with your pick and why, but don't wait for an answer.
   **Ask (any other model).** Show the PNG (and send it with `SendUserFile` when that's available, so it opens on a
   phone). Ask with `AskUserQuestion` (one question, header "Mockup"): one option per design
   ("Build option A", ...), plus "Stop" (commit nothing and end). The user's notes or an "Other"
   answer mean changes: revise the mockup and ask again. Repeat until a design is approved. No app
   code, build, or e2e runs happen during this loop.
5. **Record it.** Comment on the issue `Mockup approved: docs/design/issue-<N>-<slug>.html, option
   <X> (<YYYY-MM-DD>)` plus any notes the user gave (or, when you chose it, `Mockup chosen by
   next-item: ...` with one line on why), then continue to step 3. The mockup files go in the
   feature commit, and the close-out comment names the chosen option so the user can check it while
   testing. If the user stops, comment where it was left and change nothing else.

