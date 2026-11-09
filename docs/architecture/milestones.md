# Architecture: Milestones and extras

> Part of the architecture reference; index at `docs/architecture.md`.

## Milestones

Issue #153. Training unlocks rewards directly; there's no currency, balance, or streak.

- **Rules** (`src/lib/milestones.ts`, pure): three tracks, each a tier table (`TIERS`).
  Workouts finished counts workouts with 3+ sets, at most 2 per calendar day (1 to 500).
  Records counts sets that beat the best before them on the same exercise, replayed oldest
  first with the record celebration's `beatsBest` rule; an exercise's first set is the
  baseline, and timed sets never count (1 to 100). Strong weeks counts Sunday-start weeks with
  2+ counted workouts, in total, not in a row (4 to 52). "Plateaus broken" joins with #133.
  A tier can name an Extras reward (#154, below), which only Premium earns (#190); a tier
  without one still counts. Four tiers grant free users a Premium trial pass (#155; see
  "Trial passes" under Native apps), and three of those also carry a rest chime (#184).
  `tierRewardLabel(tier, premium)` names what a tier unlocks for this user: the Extra for
  Premium, the pass for free users, never both. A tier that unlocks nothing for them reads as
  an achievement only.
- **Derived, not stored:** counts come from `repos.workouts.listProgressSets()` (which carries
  `set_index` for the record replay) every time, so edits and deletes adjust them. The only
  state is per device: localStorage `repbunny-milestones-seen` (tier ids already shown as
  unlocked) and `repbunny-milestones-intro` (the pending one-time note). A seen tier stays
  unlocked even if deletes lower the count, and is never announced again.
- **First run:** the first finish (or Milestones visit) on a device without the seen list
  marks everything the earlier history reached as seen, and stores the note "Your 31 workouts
  already unlocked 5 rewards." ("reached N milestones" when none of the tiers carry a reward,
  which is always the case for a free user, whose Extras aren't theirs; their passes are named
  instead). It shows on that recap or the Milestones screen and is cleared on Done or "Got it".
- **Unlock moment:** `fetchFinishRecap` computes newly reached tiers alongside the recap
  (`workouts.finishMilestones`, so the recap never changes shape after it shows), and
  `FinishRecap.vue` shows them in a card with a carrot that pops in once. Done marks them seen
  (`commitFinishMilestones`); resuming doesn't, so a refinish shows them again.
- **Next unlock** (#188): when a workout crossed nothing (and there's no history note),
  `findFinishMilestones` sets `finishMilestones.next` from `nextUnlock`/`nextUnlockText` in
  `milestones.ts`: the single nearest tier that unlocks something for this user (an Extra for
  Premium, a trial pass for free users, #190), when it's within `CLOSE_WITHIN` (3 workouts or
  records, 1 strong week). A tie goes to the earlier track. `FinishRecap.vue` shows it as one
  line linking to Milestones: "2 workouts to your next unlock: Hearts confetti".
- **Unlock screen** (#187, mockup `docs/design/issue-187-unlock-celebration.html`, option A):
  when the finish crossed tiers with an Extra and the user has Premium, `WorkoutLogger.vue`
  shows `src/components/UnlockCelebration.vue` over the recap, once per finish
  (`workouts.finishUnlockShown`, so leaving Home doesn't replay it; a resume and refinish
  does, like the recap card). One unlock gets a card with a full preview (week strip, falling
  confetti, sample lines, or a play button) and Use it now / Not now, both on to the recap;
  several get a row each with its own Use it now and a See my recap button. Use it now calls
  `chooseExtra`. Free users never see it (their unlock moment is the trial pass on the recap).
  It uses the `celebration` art and the `mascot-art`/`mascot-motion` classes, so Minimal hides
  the bunny, rays, and confetti; reduced motion stills them. Specs that finish a Premium workout
  without testing it register `skipUnlockCelebrations` (`e2e/fixtures/celebration.ts`);
  `startLocal` always does, since it turns Premium on by default.
- **Screen:** the Progress hub's Milestones tile opens `/progress/milestones`
  (`src/components/MilestonesScreen.vue`): per track, the count, progress to the next tier, and every tier as
  a chip.
- **Switch** (#186): Account > Preferences > "Milestone moments" (localStorage
  `repbunny-milestone-moments-off`, per device, on by default; `milestoneMomentsOn` in
  `milestones.ts`). Off hides the moments only: the recap card, the next-unlock line
  (`WorkoutLogger.vue` passes no milestones to `FinishRecap.vue`), and the unlock screen (#187). Counting, Extras, and trial passes carry on, and Done still marks crossed tiers
  seen, so turning it back on replays nothing. Passes earned while off start from Milestones.
  The small-win chips on set rows and the rest screen (#475, `src/lib/smallWins.ts`) aren't
  milestone moments, so the switch leaves them on. Preferences > Record celebrations (#476,
  `src/lib/recordCelebrations.ts`, per device, `repbunny-record-celebrations`) picks **Big ones
  only** (default: small wins stay a chip and a rest line) or **All wins** (`WorkoutLogger.vue`
  also opens `RecordCelebration.vue` for the set's top small win, from the store's `newSmallWin`;
  a new record always takes the screen instead). Backups carry it as `record_celebrations`.
- **Imported history** (#462): workouts added by the importer carry `workouts.imported`. They count for records, progress, and targets, but a tier whose crossing workout (the nth counted workout, record, or strong week, replayed oldest first: `importedTierIds`) was imported reads "Before RepBunny" on the Milestones screen and never announces, grants a trial pass, or unlocks an Extra: `findFinishMilestones` and `initSeenTiers` skip those tiers, and Extras read `useMilestoneState().unlockedTiers`, which leaves out an imported tier unless this device has shown it, so they stay locked. Test: `e2e/local/imported-milestones.spec.ts`.
- **Backups:** a file with preferences carries `milestones_seen`; restoring or merging one adds
  those ids to the device's list, never removes any. It also carries `milestone_moments` (the
  switch), applied on restore when present.
- No anti-cheat. Tests: `e2e/milestones-unit.spec.ts`, `e2e/local/milestones.spec.ts`,
  `e2e/local/unlock-celebration.spec.ts`.
- `src/lib/milestoneState.ts` (`useMilestoneState`) holds the live counts and the seen-list
  setup, shared by the Milestones screen and Extras.

### Extras (milestone rewards)

Issue #154 (mockup `docs/design/issue-154-milestone-rewards.html`, option B). Cosmetics that
milestone tiers unlock. Premium only, earned by training (#190, which replaced #185's
"Premium has them all from the start"); free users earn trial passes from milestones instead.
Marks and confetti are drawn in CSS/SVG; the sounds are short recorded clips (#184, below).

- **Catalog** (`src/lib/extras.ts`): 16 rewards in five kinds (week mark, confetti, rest chime,
  record fanfare, bunny personality), one per tier. Three trial-pass tiers (`workouts-10`,
  `workouts-50`, `strongWeeks-12`) also carry a rest chime: Premium gets the chime there, a free
  user the pass. `milestones.ts`
  builds its tier rewards from this table, so `src/lib/extras.ts` must not import `src/lib/milestones.ts`.
  A reward is unlocked with Premium once its tier is seen on this device or reached now (a
  trial pass doesn't count). The seen list is written for free users too, so going Premium
  unlocks every tier already reached at once. `premium.ts` hands `isPremium` to `extras.ts`
  through `setExtrasPremiumSource`, since the Node unit specs load `extras.ts` and can't load
  `premium.ts`.
- **Fallback:** everything that applies a pick reads `playablePick(kind)`, which gives the
  kind's default when the pick is locked (no Premium, or its tier not seen). The picker shows
  the default as selected then; the stored pick comes back once it's unlocked again. No
  migration was needed for picks made under #185.
- **Picks** are per device in localStorage `repbunny-extras` (Erase all resets them with
  `resetExtrasState`); `repbunny-extras-viewed` drives the New pill. Not in backups.
- **Screen:** Theme > Extras, five rows that each open `src/components/ExtrasPicker.vue` in place of the
  Theme screen. For Premium, locked options show their unlock rule; a tap previews them (and
  plays a sound) with progress, but never picks them. For a free user every option but the
  default carries the `premium-tag`, the rows count 1 of M, and a preview offers "Keep it with
  Premium" (`openPremiumSheet('extras')`) instead of progress.
- **Applied:** `DayMark.vue` draws the week mark over the theme's; `installTheme()` sets
  `data-confetti` to the pick over the theme's (style.css masks each piece, so it keeps its
  token color); `restChime.ts` plays the chime and the record fanfare (`RecordCelebration.vue`);
  `RestTimer.vue` and `FinishRecap.vue` speak in the picked bunny personality (below). "Match
  theme" (or Classic/Off) restores what was there before. Home screen widgets keep the theme's
  own mark.
- **Bunny lines and personalities** (#183): `src/lib/bunnyLines.ts` (pure) picks the rest
  timer headline and the recap line from facts about the workout, for everyone. Rest:
  `compareSet` checks the set just logged against the same set last time (the one its row
  pre-filled from: the template's last session, else item 88's fallback, cached in
  `WorkoutLogger.vue`): more weight (or more added weight, or less assist), more reps, a level
  up, or the same numbers at a lower RPE. No comparison for a first-ever set, timed sets, mixed
  units, or one number up while another is down. Otherwise "One more set of X" when one
  planned set is left in the workout, then "Matched last time", then a plain line. The line is
  picked when the set is logged and kept on the rest (`activeRest.headline` in
  `src/stores/rest.ts`), so minimizing keeps it; a rest restored from the lock screen gets a
  plain line. Recap: records (count, or "Your heaviest X yet" for one), exercises up on last
  time (2+), the week's workout count (2+), then a plain line. **Kind dip lines:** a set under
  last time (same load and fewer reps, or a lighter load without more reps; more assist for
  assisted) gets a kind line on `DIP_CHANCE` (1 in 3) of draws, at most once per workout on the
  rest timer (localStorage `repbunny-bunny-dip` holds the workout id) and once per recap (a
  lighter day: some "Lighter" chip and nothing up or a record). If the workout's feel tags
  (#149) say under 6 hours of sleep, low energy, or high stress, the dip line names that tag;
  otherwise it never states a cause. The recap's random draws are fixed at mount, so picking a
  tag only swaps a dip line for its tagged one. **No repeats:** each situation has a pool per
  personality, and a pick skips the last `RECENT_LIMIT` (8) lines shown (localStorage
  `repbunny-bunny-recent`). **Personalities** set the voice and the plain lines: Classic
  (default), Punny (`strongWeeks-4`), Coach (`records-25`), and Hype (`workouts-300`), replacing
  #154's Gym puns, Coach mode, and Extra soft on the same tiers. The kind id stays `lines`;
  stored picks `puns`/`soft` read as `punny`/`hype` and viewed ids `lines-*` as
  `personality-*` (`LEGACY_LINES`, `LEGACY_REWARD_IDS`), so picks and New pills survive. Tests:
  `e2e/bunny-lines-unit.spec.ts`, `e2e/local/bunny-lines.spec.ts`.
- **Sounds** (#184): each chime and fanfare value is a clip at `public/sounds/<value>.mp3`
  (`EXTRA_SOUND_VALUES`), precached by the `mp3` glob in `vite.config.ts` like
  `public/rest-chime.mp3`, so they play offline after one online launch. `restChime.ts` fetches
  and decodes the picked chime and fanfare whenever a rest is primed (and a preview tap decodes
  its own), caching decoded buffers per URL. Extras play through a gain node (0.7, or 0.67 for the air horn, whistle, cheer, and ta-da;
  `EXTRA_GAINS` in `restChime.ts`, #458); Classic plays at full volume. Classic measures -18.1 LUFS and the
  Extras about -19.6 after gain, within 2 LU. The picker shows "These are louder than Classic" once a sound is picked or tried. Each clip was trimmed of silence, cut to 3s or less (the cheer with a 0.6s
  fade), normalized to about -16 LUFS with peaks under -1.5 dBFS, and encoded as mono 96 kbps
  MP3 (ffmpeg; source files are not in the repo). A stored pick of a removed sound (`bells`,
  `marimba`, `tada`, `trumpets` from #154's synthesized set) fails `validPick` and reads as
  the default.

  | Clip | Tier | Source | Original file | License |
  | --- | --- | --- | --- | --- |
  | `boxing-bell` ("Opening bell") | `workouts-100` | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-opening-bell-421471/) | `audio_becf266b23.mp3` | Pixabay Content License |
  | `whistle` ("Coach" whistle) | `workouts-50` | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-086761-quotcoachquot-whistleaiff-89588/) | `audio_d8b80f8429.mp3` | Pixabay Content License |
  | `boing` ("Cartoon spring boing") | `workouts-10` | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-cartoon-spring-boing-140378/) | `audio_be301496db.mp3` | Pixabay Content License |
  | `bike-bell` ("Bike bell ring", #595) | `strongWeeks-12` | [Mixkit](https://mixkit.co/free-sound-effects/bell/) | `595.wav` | Mixkit Sound Effects Free License |
  | `air-horn` ("DJ air horn") | `records-1` | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-dj-airhorn-sound-39405/) | `audio_5cb595572d.mp3` | Pixabay Content License |
  | `cheer` ("Small crowd ovation", #437) | `strongWeeks-52` | [Mixkit](https://mixkit.co/free-sound-effects/applause/) | `437.wav` | Mixkit Sound Effects Free License |
  | `tada-horns` ("Successful horns fanfare", #722) | `workouts-200` | [Mixkit](https://mixkit.co/free-sound-effects/horn/) | `722.wav` | Mixkit Sound Effects Free License |

  Licenses checked 2026-10-07: both allow commercial use with no credit as part of a larger
  product, and neither allows redistributing a sound on its own. Bundling in the app is fine.
- Tests: `e2e/local/extras.spec.ts` (including every sound's preview, the rest-end chime, and
  the record fanfare through the `e2e/fixtures/restChime.ts` spy), plus the reward checks in `e2e/milestones-unit.spec.ts`.
