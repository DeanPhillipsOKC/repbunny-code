# Exercise library source

The bundled exercise library (`src/data/exercise-library.json`) started as 138 hand-written
entries (#41, #39). Issue #842 grew it to 323 from a free exercise database, so a new user's usual
lifts are already there before their first workout. Issue #850 added 35 more by hand (358), from
research into what people commonly do; see "Hand-written additions" below. Issue #851 merged 3
duplicates (355) and added common short names; see "Merges and aliases".

## Source and license

| | |
|---|---|
| Source | free-exercise-db, https://github.com/yuhonas/free-exercise-db |
| File | `dist/exercises.json` (876 exercises) |
| Commit | `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` (2026-09-27) |
| License | The Unlicense: dedicated to the public domain, free for any use including commercial, no attribution required |
| Checked | 2026-10-26, from the repository's LICENSE.md file |

No attribution is required, but this page records it anyway. Only names and metadata were used:
no images, GIFs, or videos, and no source text. Every how-to step was written fresh in our voice
from what the exercise is, not copied from the source's instructions. The app never fetches
exercises; the data ships in the bundle, per `docs/decisions.md` (no requests to third-party
hosts).

wger (CC-BY-SA, needs attribution and share-alike on derived data) was not used.

## How it's built

`scripts/import-exercises.mjs` is run by hand, and its output is committed:

```
git clone https://github.com/yuhonas/free-exercise-db
git -C free-exercise-db checkout f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5
node scripts/import-exercises.mjs free-exercise-db/dist/exercises.json
npm run check:library
```

The curation lives in `scripts/exercise-import/curation.mjs`:

- **`PICKS`**: the source exercises that become new entries, each with our name, aliases, 3 to 5
  how-to steps, and any overrides. The importer maps the rest from the source: muscle group and
  "also works" from its primary and secondary muscles (grip is left out of "also works", or every
  deadlift would count as an arm exercise), equipment and load type from its equipment, and the
  swap `movement` from keyword rules on our name.
- **`MATCHES`**: source exercises reviewed as the same as an entry we already had ("Butterfly" is
  Pec Deck, "Thigh Abductor" is Hip Abductor Machine). They add no entry, only the aliases listed,
  such as plurals people type ("Hammer Curls").
- **`REVIEW`**: exercises the importer couldn't map with confidence, left out until someone picks
  a movement on purpose (below).

The importer refuses to write anything, and lists why, when a pick has no movement rule, a
movement outside its muscle group's swap targets (`TARGETS` in `src/lib/exerciseSwap.ts`),
equipment it doesn't know, or a name or alias that clashes with another entry. Clashes are checked
with the app's normalization and with a looser key (DB, BB, and KB expanded, plurals and filler
words dropped, word order ignored), so "DB Bench Presses" can't sneak in beside "Dumbbell Bench
Press". Original entries keep their ids and wording (`exercises.library_id` stores the ids); the
importer only adds aliases to them. `scripts/exercise-import/imported-ids.json` lists the ids it
wrote, so a re-run rebuilds those and never touches an original.

## What was kept, and why

Of the 876 source exercises:

| | Count | Why |
|---|---|---|
| Imported | 185 | Lifts and cardio people log in a gym or at home, under the name they'd search for |
| Matched to an entry we had | 141 | Added 45 aliases, no new entries |
| Stretches | 123 | Not logged as sets |
| Held for review | 13 | Listed below |
| Left out | 414 | Band and chain variants of barbell lifts, sprint and agility drills, medicine ball throws, most strongman events, neck work, and near-duplicates that differ only by a grip or stance most people don't log separately |

323 entries is the judgment call. Past that, the source's extra entries are mostly variations that
would bury the common lift in search (the source has 52 arm curls), not lifts people are missing.
Group sizes: Legs 74, Arms 63, Back 48, Shoulders 40, Chest 37, Core 32, Cardio 15, Glutes 14.

Choices worth knowing:

- Pullovers count as Back with the vertical pull movement, next to Straight-Arm Pulldown.
- Cleans and snatches count as Legs with the hip hinge movement, so swaps offer other hinges.
- Farmer's Walk counts as Arms with the hang (grip) movement, next to Dead Hang.
- Mountain Climber, Sled Push, and Sled Drag are Cardio and timed (the sleds track distance).
- Upright rows are Shoulders, like the original Upright Row.

## Held for review

These weren't imported because no movement fits without a guess. A second pass can add them
with a movement chosen on purpose (or a new movement, which also needs `TARGETS`):

- External and internal rotation (4 entries): rotator cuff work, which no target covers.
- Dumbbell Scaption: between a front and a lateral raise.
- Turkish Get-Up (2), Clean and Jerk, Kettlebell Thruster, Tire Flip: full-body, or two lifts in
  one.
- Medicine ball slams (2): logged by ball weight, but cardio entries are timed.

#850 later added Turkish Get-Up, Medicine Ball Slam, and Kettlebell Thruster (an alias of
Dumbbell Thruster) by hand; the source's entries for them stay held.
- Plate Pinch: a grip hold that would need a timed hold with a weight.

## Hand-written additions (#850)

Research into what people commonly log (big gym chains and machine lines, home gyms, group-fitness
and boot-camp classes, popular programs, and military PT drills a civilian can do with normal
equipment) found 35 common exercises still missing, plus the pilot users' own: a single-leg leg
press and Planet Fitness's incline knee-slide ab machine. They were written by hand, how-to steps
included, not imported: the source lacks most of them. They sit right after the original 138, so
`import-exercises.mjs` treats them as originals and a re-run keeps them. The same pass added about
85 aliases, mostly machine brand names (Hammer Strength, Iso-Lateral, Plate-Loaded), cardio brand
names (Assault Bike, Concept2, Peloton), and PT test names (PT Run, Leg Tuck, MDL). Aliases on
imported entries live in `curation.mjs`'s picks, the rest in the JSON.

Group sizes now: Legs 81, Arms 63, Back 51, Chest 40, Shoulders 40, Core 38, Cardio 27, Glutes 18.

Choices worth knowing:

- Ab Glider Machine logs by level and reps, with no weight. Its aliases include the names the
  pilot users typed for it (Ab Sled, Scrunch).
- Curtsy Lunge and Lateral Lunge are Legs with the lunge movement, like the other lunges, since
  swap places glutes work by hip thrust, kickback, hinge, or abduction.
- Flexed-Arm Hang is Back with the vertical pull movement, so swaps offer pull-ups, not Dead Hang.
- Ruck is timed with distance. No load type records both a carried weight and a distance, so the
  how-to says to note the weight.
- Burpee, Jumping Jack, Knee Push-Up, Superman, and the other rep-counted bodyweight moves are
  bodyweight (reps, optional added weight); High Knees, Butt Kicks, Bear Crawl, Sprint, Shuttle
  Run, and Lateral Shuffle are timed.

## Merges and aliases (#851)

Every group of entries with the same muscle group, movement, equipment, and load type was
compared by hand. Entries that differ in a way people log separately stay apart: incline or
decline, seated or standing, one arm or two, grip width, stance, and bodyweight versus a loaded
version (Lunge and Barbell Lunge). Three were the same exercise twice, all from the #842 import:

| Removed | Kept | Why |
|---|---|---|
| Alternating Dumbbell Curl | Dumbbell Curl | Alternating is how you do the set, like Hammer Curl's "Alternating Hammer Curl" alias |
| Seated Overhead Tricep Extension | Overhead Tricep Extension | The original's steps work seated or standing |
| Barbell Wrist Curl | Wrist Curl | Wrist Curl already covers the barbell |

Each removed name and its aliases are now aliases of the kept entry (through `MATCHES` in
`curation.mjs`). A one-off SQL file repointed `exercises.library_id` on the retired PWA's backend (removed in #940);
on the device an old id reads as unlinked in the app.

The same pass added 156 aliases people type: abbreviations (OHP, CGBP, HLR, OHS, RFESS, and DB,
BB, and KB forms), plurals the search wouldn't match ("Lateral Raises"), and gym slang (Pec Dec,
Skulls, Hypers). Names that fit two entries were left out ("Row Machine" could be the rower or a
seated row; "Glute Kickback" could be the cable or the machine).

## Speed

The Add exercise sheet lists every library entry the user doesn't own when no muscle chip or
search is set, which went from 138 rows to 323 (355 after #850 and #851). It now renders the first 40 with the sheet and
the rest two frames later (`src/lib/progressiveList.ts`), so it opens as fast as before. Measured
on the dev build at 6x CPU slowdown: first paint went from about 1.9 seconds to about 0.15
seconds. The Library tab's lists are per muscle group (74 at most) or a search, and stay fast as
they are. The library adds about 99 KB to the main bundle, 12.7 KB gzipped.
