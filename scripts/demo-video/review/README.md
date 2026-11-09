# Sprint review clips (lane instructions, #605)

When you ship a **user-facing** change (one that adds a release note), record a short clip of it so
the owner can see it in the sprint review before release. `next-item` step 7 sends you here after a
green gate. The clip shows the change working in the real app (local mode,
seeded test data, phone size, dark theme), narrated by the release note you wrote plus a few short
step lines.

## Is it demoable?

Record a clip when the change is something a person can see on screen in a browser: a new button,
sheet, screen, label, or a changed flow.

The owner wants to see most user-facing changes, so when in doubt, record one.

Don't record one, and write `No clip: <reason>` in the closing comment instead, when the change is:
native-only (home-screen widgets, the lock-screen rest timer, notifications, the Android back
gesture, Play Billing), only about speed or reliability, invisible (data fixes, imports that just
stop failing), or only visible at an unusual setting (huge text). The review lists these as "not
shown" with their release note, so nothing is hidden.

**Trivial** changes (a space between a number and its unit, a reworded label, a color tweak) get
`No clip: trivial`. The review issue lists them in one line each, and the video doesn't show or
mention them at all (owner, 2026-10-15).

## Write the spec

Create `scripts/demo-video/review/clips/<issue>.mjs`:

```js
export default {
  issue: 535,
  title: ['Note for', 'today'],      // title card, two short lines (about 12 characters each)
  note: '<your release note text, exactly as in release-notes/>',
  // What the voice says first: the note's point in one or two short sentences,
  // following Writing for the voice below.
  spoken: 'Add a note to a lift for just this workout. It shows up next time.',
  // Off camera, optional. kit.seed restores ten weeks of push / pull / legs
  // (Push day, Pull day, Leg day; bench, squat, rows, ...). kit.quietRest hides
  // the rest-timer tip; { rest: false } turns the default rest off.
  // kit.seed's `edit` hook changes the history before it's restored, for example
  // to make the last workout freeform (template_id = null) or add a note to it.
  // See clips/535.mjs and clips/536.mjs. The seed ends on Home.
  prepare: async (page, kit) => {
    await kit.quietRest(page, { rest: false })
    await kit.seed(page, { premium: false, edit: (backup) => { backup.workouts.at(-1).template_id = null } })
  },
  lines: {
    start: 'Start a workout, like Push day.',
    open: 'Under your sets, tap the Note for today button.',
  },
  demo: async (page, { say, tap, type, reveal, sleep, nav }) => {
    await say('start', () => tap(page.getByRole('button', { name: 'Push day', exact: true })), 0.5)
    await say('open', () => tap(page.getByRole('button', { name: '+ Note for today' }).first()), 0.5)
    // return the time of the best poster frame, or nothing
  },
}
```

- `spoken` is said first, over the opening screen (Home). Then each `say(key, step,
  lead)` speaks one line and runs its step `lead` of the way through it (0 to 1), so the tap lands
  as the line names it.
- `tap(locator)` scrolls the target into view, shows a pink ripple, and clicks. `type(locator,
  text)` taps then types. `reveal(locator, 'start' | 'center')` scrolls without tapping.
  `nav()` is the bottom tab bar (`nav().getByRole('link', { name: 'Progress' })`).
- Use the same locators as your e2e spec: roles and accessible names, not CSS classes.
- A small visual change (a label, a badge) is hard to read at phone size. End on it with
  `zoom(locator, scale)` (default 2), which centers the page on it and enlarges it, never past the
  screen's width, so pick the smallest element that shows the change (see `clips/547.mjs`).
  `unzoom()` goes back; a zoom otherwise lasts to the end.
- Keep it short: 3 to 6 steps, under about 45 seconds. Show the change and its result, not a full
  tour. Say button names as "tap the Save note button", not a bare "tap Save".
- Lines are our own words only. Never put user data in them; they go to ElevenLabs to be voiced.

## Writing for the voice

Every spoken line, including the release note the review reads first, goes through text-to-speech
(ElevenLabs `eleven_v4`, in the owner's voice, Deaner2, since #648; guide clips and lifting basics
use Jessica). Punctuation that reads fine on screen makes the voice hesitate or
pause oddly (owner, 2026-10-15). So:

- Short, plain sentences. One idea each. End with a period or a question mark.
- No colons, semicolons, em or en dashes, or parentheses. Split the sentence instead.
- Spell out what a symbol means: "8 times 150 pounds", "10 to 20 sets", "plus", not "×", "10–20",
  "lb", or "+". Say the button's words, not its icon ("tap the More button", not "tap ⋯").
- No abbreviations or shorthand: "one rep max", not "1RM"; "minutes", not "min".
- Quotes only around a button's exact words, and only when it helps.
- Audio tags direct the delivery (#648): a short mood in square brackets, put before the words it
  shapes, like `[warm, friendly] Not sure what to train?` or `[excited] They're in!`. Use one or two
  per line at most, on the opening line and the payoff, and leave plain step instructions
  untagged so the voice doesn't overact. Captions and on-screen text drop the tags
  (`stripTags` in `narration.mjs`). Keep them on-brand: warm, upbeat, a little playful.

- Keep the narration short: `spoken` is the release note's first sentence (rewritten for the
  voice), then 3 to 5 step lines. Cloud sessions have no saved voice cache, so every line is a new
  ElevenLabs call.

## Record it

```
node scripts/demo-video/review/record.mjs scripts/demo-video/review/clips/<issue>.mjs
```

It starts the local-mode dev server on :5174 for the run if none is up, and writes
`logs/demo-video/review/<issue>/segment.mp4`, `poster.jpg`, and `clip.json`. It fails, naming the
line, if a step can't find its target or the clip runs over 75 seconds. Look at `poster.jpg` (and a
few frames: `ffmpeg -ss <seconds> -i segment.mp4 -frames:v 1 frame.jpg`) to confirm the screen shows
what the line says.

The voice needs `ELEVENLABS_API_KEY` and network access to `api.elevenlabs.io`. Its cache is
`logs/demo-video/review/lines/` (gitignored, never committed). Without the key, or when ElevenLabs
refuses, the clip is still recorded, **silent with each line as a caption**, and `clip.json`'s
`silent` field says why. Say so in the closing comment.

## Ship it

1. Commit `clips/<issue>.mjs` with the change.
2. Upload the recording to the issue-assets branch (`claude/issue-assets/<issue>/`):
   `node scripts/issue-shot.mjs <issue> logs/demo-video/review/<issue>/segment.mp4 logs/demo-video/review/<issue>/poster.jpg`.
   It prints a link line for each.
3. In the closing comment, add a `Clip:` line with both links (plus `silent, captions only
   (<reason>)` when it is), or the `No clip: <reason>` line. The sprint review reads that line.

**Never block on a clip.** If it won't record in two tries, write `No clip: couldn't record
(<error>)`, leave the spec out of the commit, and ship. Clip time doesn't count against
the gate, and a clip failure never fails the issue.

## Sprint review

Before a store release the owner runs the Sprint review workflow
(`.github/workflows/sprint-review.yml`, #606). It reads your `Clip:` or `No clip:` line, so write
it exactly as above: the clip line keeps issue-shot's `[Clip: segment.mp4](...)` link, and the
reason after `No clip:` starts with `trivial` when it is. Trivial changes stay out of the video
and are listed one line each in the review issue. To try it locally:

```
node scripts/demo-video/review/collect.mjs --since <an older store/v tag>
node scripts/demo-video/review/sprint-review.mjs
```

`review-issue.mjs` files the issue and is only for the workflow. The owner answers it with one
comment about the whole release (#664): "looks good", or what they don't like, and anything not
mentioned counts as good. `/sprint-review-reply` turns that into follow-up issues and the issue's
`## Outcome` list, and closes the review once it's ready to release.
