# Architecture: Marketing site, demo videos, manual QA

> Part of the architecture reference; index at `docs/architecture.md`.

## Marketing site (`site/`)

`repbunny.app` is a small static site kept in `site/` (#58), separate from the Vue app: plain
HTML and one shared `styles.css`, no framework, and no build step. One exception: the app's
build reads `site/guides/` for its in-app guide search (#568, see Guides below), so a guide change
needs `npm run build` and the guide specs (`docs/architecture/commit-policy.md`). Nothing else in
`site/` touches the app's `vite.config.ts`, `dist/`, or e2e suite.

- **Pages:** `/` (landing, `site/index.html`), `/privacy/` (the native apps' privacy policy, iPhone and Android, also the Play listing's URL,
  which Apple needs as a live URL), `/support/` (FAQ plus the `hello@repbunny.app` contact), and
  `/guides/` (#102). `/testers/` is unlisted (no menu or footer link, `noindex`): the closed
  testers' getting-started page, sent in their invite email, with the Play opt-in link
  (`play.google.com/apps/testing/app.repbunny`) behind a live Google Play badge, and a "Premium is on us" card telling Play license testers
  to look for Google's test card before buying, plus the owner's intro video (#649). Those are for
  the people the owner adds as license testers. `/testers/community/` is the same page for the
  Testing Community group, who can't be license testers (Play takes an email list or a Google
  group, not both), so it has no Premium card and no video; keep the two in step. All share the same header, footer, Open Graph tags (`og-image.png`, absolute
  `https://repbunny.app/og-image.png`), and favicons.
- **Guides:** `site/guides/index.html` lists one card per guide, grouped under topic headings
  (`<section class="guide-group">` with an `h2.guide-group-title`: Logging, Routines & programs,
  Progress, Make it yours, Your data & help; #178). A new guide's card goes in the group it fits,
  and `e2e/guides-index-unit.spec.ts` checks every guide folder is listed exactly once inside a
  group. Each guide is
  `site/guides/<slug>/index.html` with a lede and an `<ol class="steps">` of numbered step cards,
  some with a phone screenshot (`.guide-shot`, beside the text from 760px up). Support links the
  index. Today: `log-a-workout/`, `routines/`, `load-types/`, `exercise-history/`, `report-a-bug/`,
  `partial-backups/`, `rest-timer/`, `plate-calculator/`, `themes/`, `progress-reports/`, `next-set-targets/`, `strength-levels/`, `starter-programs/`, `body-measurements/`, `extras/`, `home-screen-widgets/`, `swap-exercises/`, `edit-past-workouts/`, `workout-feel/`, `milestones/`, `import-from-strong-hevy/`. Release notes link a guide by
  its slug (see "What's new"), and `e2e/whats-new-unit.spec.ts` checks every linked folder exists.
  The app also carries every guide's text for its in-app Help & guides search (#568,
  `docs/architecture/client.md`): `scripts/lib/guide-index.mjs` reads each card's group and
  caption, and each page's `h1`, `p.guide-lede`, and the `h2` and `p`/`li` text inside each
  `div.step-text`, at every build. Keep that markup when writing a guide; a page it can't read
  fails `npm run build`.
  The routines, starter programs, log a workout, import from Strong or Hevy, exercise history,
  monthly reports, and next-set targets guides also open with a short how-to clip
  (#401, narrated in #424, the last four added in #434): a `<section class="guide-clip">` with numbered step text beside a
  `<video controls preload="none">` (sound on once someone taps Play; no autoplay, no loop) from
  `site/video/guides/<slug>.mp4` (480x1040 H.264 + AAC, about 1 to 1.3 MB each), a default
  captions `<track>` from `site/video/guides/<slug>.vtt`, and a poster at
  `site/img/guides/clip-<slug>.webp`. Self-hosted on purpose: no YouTube
  or other third-party player, per the privacy promise. Re-record them with
  `scripts/demo-video/guide-clips.mjs` (see Demo videos) when those flows change.
  Only new features whose use isn't obvious from their note get a guide, and a removed or reverted
  feature's guide is deleted with it (rule in `docs/backlog.md`).
- **Guide coverage (`/help-review`, #110):** a user-triggered, interactive skill
  (`.claude/skills/help-review/`) that inventories every
  user-facing feature from the live source, compares it against `site/guides/`, and reports
  missing, stale, and orphaned guides, ranked by how non-obvious each feature is. The user picks
  which to write; it writes the page, index card, and capture-script screenshots, links the
  feature's existing release note, fixes stale guides and stale docs (`npm run check:docs`),
  and deletes orphaned guides only with the user's OK. It never changes app code beyond a `guide` link in a `release-notes/` file.
  It also runs headless as a monthly routine (`/help-review headless`, the 28th, #571;
  `docs/backlog-runner.md` > Scheduled reviews), which writes nothing: it files each gap as a
  scored `status:needs-review` issue (at most 5 a run) for the owner to release to the runner.
- **Look:** dark plum in both light and dark system modes (`color-scheme: dark`), using the
  brand tokens from `docs/brand-identity.md`. One breakpoint at 760px switches the phone layout
  to the desktop one. The landing page (reworked 2026-10-07 as a launch page written as if the
  App Store listing exists) uses `l-`-prefixed classes in `styles.css`: hero with an App Store
  badge and floating record toasts, a tilted ticker, gym-floor cards (a swipe row with dots on
  phones, four across from 760px up, each with a phone shot peeking up from the bottom: level machines, assisted, cardio, and
  timed sets with the stopwatch (a real goal-hit frame with the name, set number, and last time from #191); swapping lives in the screenshot strip, so it has no card),
  a privacy card right after it (moved up from a small card above the closing CTA on
  2026-10-08, since privacy is a main selling point: three points and the policy link, with
  the small masked shush bunny, `site/img/bunny-shush.webp`, peeking over its top-right
  corner), a starter-program split,
  a tap-to-log record demo with confetti, a no-guilt card, a theme picker that recolors a mini
  phone (theme colors copied from `src/lib/theme.ts`; Halloween and Autumn swap in
  `theme-*.webp`), a scrolling screenshot strip (marketing and guide shots), Free vs Premium,
  a "Who's behind RepBunny" section (#213, `#about`: Dean and Christa, first names only, with
  `site/img/about-dean-christa.webp` from `docs/design/art/about-dean-christa.png`; every
  footer links it as About us), and a closing CTA (`#get`, where the header's Get the app button goes). The hero and closing
  CTA each show an App Store and a Google Play badge. The Google Play badges link to
  `details?id=app.repbunny` (public since 2026-11). The App Store badges stay "Coming soon"
  stamps until the iPhone listing is live. Sections fade in on scroll; all motion stops under
  `prefers-reduced-motion`, and content shows without JS. Anything that looks like a card is a
  link: the gym cards, the screenshot strip, and the no-guilt list each open the matching guide
  (or `/privacy/`), since a card that does nothing on tap reads as broken. Hover styles sit
  under `@media (hover: hover)` so a tap on a phone doesn't leave a stuck highlight.
- **Stylesheet version:** every page links `/styles.css?v=<date>`. The repbunny.app zone tells
  browsers to keep files for 4 hours (`max-age=14400`), while the `*.pages.dev` previews revalidate
  every time. Without the version, a visitor's browser keeps the old CSS under new HTML, as
  happened when the launch page went live on 2026-10-07. When `styles.css` changes, bump the date
  on all pages (`grep -rl 'styles.css?v=' site`). The same cache holds images, and the
  HTML too: an image replaced under the same name (a recaptured shot, say) needs a `?v=<date>`
  on its `src`, as the gym card shots have, or returning visitors see the old one for hours.
- **Assets:** Baloo 2 and Manrope are self-hosted as latin-subset variable `woff2` files in
  `site/fonts/` (both SIL Open Font License), plus Caveat (bold, latin, also OFL) for the About
  photo's handwritten caption only, so the site makes no third-party requests; the
  privacy page says so. Images in `site/img/` are downscaled to about 2x display size.
  Screenshots come from `node scripts/capture-marketing-screenshots.mjs` (logging, rest timer,
  load types, progress chart, templates), converted to WebP, with the build version string
  painted out of the templates shot (the landing page no longer uses the load-types and
  templates shots). The gym cards' `site/img/gym-*.webp` shots (level, assisted, cardio, stopwatch) come from
  `node scripts/capture-landing-shots.mjs` (dev server running), which adds a level machine, a
  treadmill, a wall sit, and a "Gym floor" template to the sample history (`scripts/lib/sample-account.mjs`) and writes
  480px WebP files straight into `site/img/`. The bunny art in `bunny-dumbbell.webp`, `bunny-thumbs.webp`, and
  `theme-*.webp` is the app's mascot art downscaled to 360px with Chromium's canvas.
  `site/img/bunny-shush.webp` is `docs/design/art/bunny-shush.png` cropped to the bunny and scaled to
  640px tall (WebP with alpha, quality 85), the same way. The only
  script is the landing page's inline one (scroll reveal, gym card dots, record demo, theme picker).
- **Store listing:** the draft Play and App Store text and the captioned store screenshots live in `docs/store-listing.md` (#725). The screenshots come from `npx playwright test --config docs/store-listing/playwright.config.ts`, which runs the app in local mode on its own port, seeds the sample history on the device database, and frames each screen with a caption at 1080x1920 (`STORE_SIZE=appstore` for 1290x2796). Like the other capture scripts, it needs no account.
- **Guide screenshots:** `node scripts/capture-guide-screenshots.mjs` (dev server running) uses the
  same sample setup as the marketing script (`scripts/lib/sample-account.mjs`: a fresh local
  database seeded with ten weeks of history, #940) at the installed app's full 390x844 screen,
  paints out the build version, and writes 480px-wide WebP files straight into
  `site/img/guides/` (encoded by Chromium's canvas, no extra image tooling), so one run
  regenerates every guide image. A failed screen leaves `logs/guides/<timestamp>/fail-*.png` and
  exits 1.
- **Deploy:** its own Cloudflare Pages project connected to this repo, build command empty,
  output directory `site`, custom domain `repbunny.app`. Setting that up, and Email Routing for
  `hello@repbunny.app`, are dashboard steps for the user. Once connected, pushes to `main`
  redeploy it the same way the app redeploys.
- **Checking changes:** serve `site/` with any static server (for example
  `python -m http.server` inside it; links are root-relative, so `file://` won't work) and take
  a Playwright screenshot at 390px and 1280px.

## Demo videos (`scripts/demo-video/`)

A proof of concept (2026-10-01) for short vertical feature clips (TikTok, Reels, Shorts), parked
for App Store launch: marketing is on hold until then, and clips would go stale while the UI is
still changing. One social clip exists so far, the timed-set stopwatch (#85), plus the guide
clips below. Not part of any gate.

- **Run:** start the local-mode dev server (`VITE_DATA=local`, `npm run dev -- --port 5174
  --strictPort`), then `node scripts/demo-video/stopwatch.mjs` (about a minute) and
  `node scripts/demo-video/make-video.mjs`. Output lands in the gitignored
  `logs/demo-video/out/`: `stopwatch-demo.mp4` (1080x1920, 30fps, H.264 + AAC) and a
  `thumbnail.png` cover. ffmpeg is needed (`winget install Gyan.FFmpeg`). <!-- docs-refs: ignore -->
- **Capture:** local mode gives an empty database each run, so no test accounts or "E2E" names
  are on screen. Setup happens off camera; only the demo itself is captured. Headless Chromium's
  `recordVideo` and CDP screencast both capture CSS pixels (a 3x phone came out 360px wide), so
  frames are back-to-back `Page.captureScreenshot` calls (about 60fps at full resolution), each
  timestamped, stitched with an ffconcat list. Taps get an injected pink ripple. `page.clock`
  fast-forwards the timer, and the badge shows the measured speed-up so it stays honest.
- **Pacing:** each step's caption goes up about a second before its tap (feedback on the first
  cut: reading and watching a tap at once was hard to follow). The recorder logs a mark per step
  and the compositor times every overlay off those marks, so timing changes need no re-sync.
- **Audio:** none is captured; `public/rest-chime.mp3` is laid in at the goal mark. Music, if
  any, is better added in the posting app from its own library.
- **Layout:** overlays are rendered on the app's origin so Baloo 2 and Manrope load, then
  composited by ffmpeg. The app is a rounded 800x1244 card on the brand background, keeping
  everything that matters inside TikTok/Reels' safe zone (clear of the top ~140px tabs, right
  ~120px button rail, and bottom ~350px caption area). A 1.8s end card (icon, name, tagline,
  "Coming soon to iPhone") closes it; update that copy at launch.
- **Guide clips (#401, narrated in #424):** `node scripts/demo-video/guide-clips.mjs [slug ...]`,
  against the same local-mode server, records the routines, starter programs,
  log a workout, import from Strong or Hevy, exercise history, monthly reports, next-set
  targets, rest timer, swap a taken machine, plate calculator, and fix a past workout clips at a 390x845 phone size in Classic, with the tap ripple and the build
  version hidden, and writes the MP4s, caption files, and posters straight into `site/` (about 1.5
  minutes a clip). Frames stay in the gitignored `logs/demo-video/guides/`. Each clip is
  one entry in its `CLIPS` map: the intro and outro card words, a `setup` line (what they'll
  learn and why, about 2 sentences, said over the first screen held still), its step `lines`,
  an optional off-camera `prepare(page)`, and a `demo` that speaks each line by key with
  `say(key, step)` (`reveal(locator, block)` scrolls a section into view without a tap).
  - **Seeded history (#434):** the exercise history, monthly reports, and next-set targets clips
    `prepare` with `seed(page, { premium: true })`: ten weeks of push / pull / legs (nine lifts,
    a rep a session through a 10 to 12 range, RPE on every set) restored through the app's own
    backup restore, with Premium on, since their main feature is Premium (the narration says
    what's free). The import clip starts from a fresh install and imports a made-up six-week
    Strong export the script writes to `logs/demo-video/guides/strong_workouts.csv`, never
    real user data. The monthly reports clip opens last month's report, so it reads the right month on
    any date. The mid-workout clips (#433: rest timer, swap, plate calculator, fix a past
    workout) seed the same history; `quietRest` hides the one-time first-rest tip and the
    "Rest alerts are off" box (headless Chromium reports notifications as blocked) and, for
    swap and plates, turns the default rest off so a logged set doesn't cover the screen.
    A step starts partway into its
  line (so the tap lands as the line names it), and the next one waits until the line has
  finished plus a short beat, so the screen never runs ahead of the voice. Say button names as
  "tap the Next button", not a bare "tap Next".
  - **Order:** the intro card (`cards/intro.html`, about 4.2 s) with the bumper music, which
    fades as the card zooms out onto the first screen; the setup line; "Here's how." and the
    steps; the outro card (`cards/outro.html`, about 3.8 s, with the TikTok handle as one
    constant) with the chime and the music's clean ending. Every tap gets the soft tap sound.
    The cards are one template each and take only their two lines of words, so changing the look
    means editing one file. `scripts/demo-video/cards.mjs` renders them frame by frame at 30fps by pausing their
    CSS animations and setting each one's `currentTime`, serving the repo root so they use the
    site's fonts and art; keep all text in the cards (ffmpeg's `drawtext` crashes on Windows
    here). ffmpeg mixes everything with `adelay` placement, `amix normalize=0`, and `alimiter`
    (CRF 28, AAC 96k). The `.vtt` cues come from the same line timings.
  - **Narration:** `scripts/demo-video/narration.mjs` voices the lines with the ElevenLabs text-to-speech API
    (`eleven_v4`, with `previous_text` / `next_text` for flow; Jessica for the guide clips and lifting
    basics, the owner's clone Deaner2 for release demos, #648; lines carry audio tags such as
    `[warm]`, which captions drop via `stripTags`) and
    caches each one in `scripts/demo-video/audio/lines/<hash>.mp3`, keyed on the line's text,
    voice, model, and settings. Re-running with unchanged lines makes no ElevenLabs calls, so
    `ELEVENLABS_API_KEY` (from the environment) is only needed when a line is new or reworded;
    a line the owner flags is fixed by editing just that line. A full run (no slugs) deletes
    cached lines no clip uses any more. Only our own script text goes to ElevenLabs. The music
    and sound effects in `scripts/demo-video/audio/` were generated once and are shared by every
    clip (see its README); don't generate new ones per video.
  - **Voice POC (#643):** `scripts/demo-video/voice-poc.mjs` (notes in `scripts/demo-video/voice-poc.README.md`) A/Bs tagged
    `eleven_v3` delivery against today's voice. v3 rejects `previous_text` / `next_text` and costs the same per character. Not wired into the pipeline.
- **Lifting basics video (#426):** `node scripts/demo-video/lifting-basics.mjs`, against the
  same local-mode server (about 3 minutes), makes the narrated video for the lifting basics guide
  and the app's basics cards: the intro card, six concept cards, a real clip of logging a set,
  then the outro card, with the same music, effects, and cached voice as the guide clips. Its
  words live in `scripts/demo-video/lifting-basics-script.mjs` (which `guide-clips.mjs` reads so
  its full-run prune keeps them). The concept cards are one template,
  `scripts/demo-video/cards/concept.html`: `?kind=` picks the visual (setup, rep, set, weight,
  rest, rpe, words), and `?d=` and `?t=` (the card's length and each line's start) time each
  visual to its lines; `cards.mjs` renders it like the intro and outro (its `extra` argument
  passes those). It uses only existing art from `site/img/`. Output: `site/video/guides/` and the
  poster as for the guide clips, plus a copy of the MP4, captions, and poster in `public/video/`
  for the app (keep it under about 4 MB; it's about 2 MB at 89 s).
  Social cuts (2026-11-07): `node --env-file=.env.local scripts/demo-video/lifting-basics.mjs [facebook] [--voice=deaner]`.
  `facebook` drops the outro's "Follow along on TikTok" line for the Facebook Reel; `--voice=deaner` narrates in the
  owner's clone, its lines cached in the gitignored `logs/demo-video/audio-lines/`. Either one writes only
  `logs/demo-video/guides/lifting-basics[-facebook][-deaner].mp4` (posted by hand) and leaves the site and app copies alone.
- **Tester intro video (#649):** `node --env-file=.env.local scripts/demo-video/tester-intro.mjs`,
  against the same local-mode server, records the owner's one minute hello on the tester page
  (`site/testers/`) in their voice (Deaner2): the owner-approved script, spoken over quick shots
  of the app with seeded data, captions burned in (`captions: true` on the review kit's spec),
  between the intro and outro cards. It reuses `review/kit.mjs` (`recordSegment`, `cardPiece`,
  `stitch`). Output: `site/video/tester-intro.{mp4,vtt}` and `site/img/tester-intro.webp`. The
  `/send-tester-info` email points at it.
- **Google Play promo video (#816):** `node --env-file=.env.local scripts/demo-video/play-promo.mjs`,
  against the same local-mode server, records a 35 second promo in the owner's voice (Deaner2,
  with audio tags) and lays it out landscape at 1920x1080: the clip in a phone on the left, a
  headline per line on the right in the store screenshots' style (`cards/promo-stage.html`), the
  outro card without its TikTok line (`?follow=0`), and a quiet music bed. Output stays in the
  gitignored `logs/demo-video/play-promo/` (`play-promo.mp4`, a `.vtt` for YouTube captions, and
  `thumbnail.jpg`); the owner uploads it to the RepBunny YouTube channel (unlisted, ads off) and
  puts the link in Play Console.
- **Launch intro videos (2026-10-30, reworked 2026-10-31):** `node --env-file=.env.local scripts/demo-video/social-intro.mjs [facebook|tiktok|both]`,
  against the same local-mode server, records a 55 second Facebook cut and a 30 second TikTok cut
  in the owner's voice (Deaner2, audio tags), ending on a "Get it on Google Play" card (iPhone is
  "coming soon" in the spoken line). Both are 1080x1920: the app (a 390x780 view, recorded at 660x1320)
  plays in a rounded card on the brand background (`cards/social-stage.html`), with each spoken line as a
  caption above it and the same TikTok/Reels safe zone as the stopwatch clip, over a quiet music bed.
  Facebook opens on a 1.8 s "Meet RepBunny" title in the caption's place while the first line plays;
  TikTok opens on the full-screen record celebration (rest off, so it isn't the rest screen's badge);
  a record has to beat the best set's weight times reps, so the seeded 145 x 12 needs 165 x 12. The seed
  adds a Full body routine with a bodyweight, a timed, and a timed-with-distance exercise, with a past
  session so their numbers fill in. Output stays in the gitignored `logs/demo-video/social-intro/`
  (`facebook.mp4`, `tiktok.mp4`, `.vtt`, cover `.jpg`). The kit's `view`, `outWidth`, `crf`, and
  `openingStep` spec options (`review/kit.mjs`) exist for these cuts. The shared stage and compositing
  code lives in `scripts/demo-video/social-stage.mjs` (`stageLayer`, `composeCut`), which the overload
  video below uses too.
- **Progressive overload video (2026-10-31, #891):** `node --env-file=.env.local scripts/demo-video/overload-video.mjs [--silent-ok]`,
  against the same local-mode server, records the "One more rep" video on sets and progressive overload:
  1080x1920, about 50 seconds, in the owner's voice, on the same stage as the launch intros
  (`social-stage.mjs`). `--silent-ok` renders with captions only when there's no ElevenLabs key. It
  rewrites Push day in the seed so each beat lands (last time's numbers, one more rep, the Next time card,
  then the Premium RPE targets and lighter week, ending on a record set). Output stays in the gitignored
  `logs/demo-video/overload/` (`one-more-rep.mp4`, `.vtt`, cover `.jpg`).
- **Sprint review (#605, #606):** `scripts/demo-video/review/`. When a lane ships a change with a
  release note, `next-item` step 7 has it follow `README.md` there: write a clip spec
  (`clips/<issue>.mjs`: title, the release note, optional seeding, 3 to 5 short step lines, and a
  `demo`), record it with `scripts/demo-video/review/record.mjs` into `logs/demo-video/review/<issue>/segment.mp4` (narrated,
  no cards or music; it starts the local-mode server itself if none is up), commit the spec, upload
  the MP4 and poster to the issue-assets branch with `scripts/issue-shot.mjs`, and link them in the
  close-out, or write `No clip: <reason>` (trivial, native-only, invisible). A clip never blocks
  shipping: two failed tries is `No clip: couldn't record (<error>)`. Its voice cache is the
  gitignored `logs/demo-video/review/lines/`, so a full `guide-clips.mjs` run never prunes it;
  without `ELEVENLABS_API_KEY` (or when ElevenLabs refuses) the clip is recorded silent, each line
  shown as a caption. `zoom(locator)` enlarges a small change. The seeding (`history`, `seed`,
  `quietRest`) is shared with the guide clips in `scripts/demo-video/seed.mjs`.
  Before a store release the owner runs the **Sprint review** workflow
  (`.github/workflows/sprint-review.yml`; #606), from a Claude session with `/sprint-review`
  (it starts the run, sends the video into the chat, and posts the owner's reply on the
  review issue) or from Actions > Sprint review > Run workflow. It needs
  no Claude and records nothing: `collect.mjs` reads the release-note files added since the latest
  `store/v*` tag, each issue's `Clip:` or `No clip:` line, and copies the clips off the
  issue-assets branch into `logs/demo-video/review/`; `sprint-review.mjs` stitches them into one video (the intro
  card, a `cards/review-title.html` card before each clip, and `cards/review-end.html` listing the
  other changes, not the trivial ones, plus the top user-facing work in progress and queued);
  `scripts/demo-video/review/review-issue.mjs` uploads it to `claude/issue-assets/review-<version>/`, opens
  `Sprint review: v<X.Y.Z> candidate` (labeled `sprint-review` and `awaiting-dean`; an older open
  one is closed with a link), and the workflow emails the link with the release email's secrets.
  The owner reviews the whole release in one comment (#664), on the issue or through
  `/sprint-review looks good` or `/sprint-review <what they don't like>`; anything not mentioned
  counts as good, and `#535 good`, `#536: make the button bigger`, `#547 pull it` lines still
  work. Each reply on the open review issue fires the Review (Opus) routine
  (`dean-replied.yml`, `fire-sprint-review` job; #607), which runs `/sprint-review-reply`: it
  matches each complaint to a change by title, release note, and clip, and uses
  `scripts/demo-video/review/review-reply.mjs` to file a scored follow-up issue for a change and a
  value 13 revert issue for a pull (never a release or a code revert), accept the rest
  (`accept-rest`), ask on the issue when a complaint can't be matched (accepting nothing else from
  that comment until it's answered), and rewrite the status line ("2 accepted, 1 change requested
  (#601), 1 pulled (#602). Release after #602 ships.", then "Ready to release.") and the body's
  read-only `## Outcome` list. A review that reaches "Ready to release." is closed. What it did is
  kept in the issue body's `sprint-review-actions` and `sprint-review-read` markers
  (`scripts/demo-video/review/review-state.mjs`). `review-issue.mjs --status` prints the same
  summary for `/release`'s preview (a closed review reads "closed, ready to release" or "closed
  by you, N not reviewed"), which never waits on the review. `collect.mjs --since <older tag>` dry-runs it locally against
  changes that already shipped.
- **New clips:** copy `stopwatch.mjs` and change the setup, the on-camera steps and their
  `cap` marks, and `STEPS`. The capture, overlay, and compositing parts are generic and can move
  into a shared helper once there's a second clip. When the UI changes, a clip only breaks where
  a selector it uses changed.

## Manual QA (`scripts/qa/`)

The Android manual test procedure (#211) is a claude.ai artifact page built from
`scripts/qa/procedure.mjs`, with one generated data file per test case on Google Drive
(`npm run qa:fixtures`, `npm run qa:page`). See `docs/qa-procedure.md`.
