# next-item: interactive human-issue check

Side file of `SKILL.md` (step 1). Read only in an interactive session.

### Human-issue check (interactive only, before the UX-intensive check)

`human` issues are things only the user can do (accounts, devices, dashboards, money). The user
has a full-time job and forgets these, so they go stale unless something brings them up. In an
**interactive** session, also run `node scripts/next-issue.mjs --top --include-human`. If its pick
has `"human": true` or `"interactionRequired": true`, it outranks the best AI pick, so offer it
before anything else (for an `interaction-required` issue, "Do it now" means a normal run of
steps 2 to 9, with the user doing the parts only they can, such as the device test):

- Say, at the top of your message: `#<N> "<title>" is the most valuable thing on the backlog
  right now, and it needs you. Want to knock it out together?` Add one line on what it involves
  and roughly how long it takes (from the issue body).
- Ask with `AskUserQuestion` (one question, header "Your turn"): "Do #<N> with me now", "Skip it
  this time" (continue with the `--top` pick as normal, including `BACKLOG_EMPTY` if there is
  none), or "Stop" (make no changes and end).
- **Do it now:** read the issue and its comments (`gh issue view <N> --comments`), do every part
  you can yourself first (look up values, write the SQL or commands, draft text, open the right
  page), then walk the user through the rest one step at a time, waiting for each step to be
  confirmed. Verify what you can (query the result, check a deploy, read a setting back). When
  the "done when" is met, comment what was done (date, outcome, anything worth remembering) and
  close the issue. If it stalls partway, comment the progress and leave it open. Never put secrets
  in a comment. If it needed repo changes, the normal gate and commit rules (steps 4 to 7) apply
  to those; otherwise skip the gate. Skip steps 2 to 7 and the report in step 9, then stop: this
  counts as this invocation's one issue.

**Headless:** never work a human issue and never ask. Use the `--top` pick as normal; step 9's
report lists what's waiting on the user instead.

