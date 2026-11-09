# Exercise demo animations: spike results (#901)

Spike, 2026-11-02. Nothing here ships in the app. Files:

- `docs/design/issue-901-squat-prototype.html`: working prototype. One lift (bodyweight squat) drawn as SVG from extracted motion data, with play, scrub, style and theme pickers, and a draw-time readout.
- `docs/design/issue-901-exercise-demos.html` (`.png`): style mockup (A, B, C), three themes, and where it sits.
- `docs/design/issue-901-figure.js`: the figure renderer both pages use (about 120 lines, no libraries).
- `docs/design/issue-901-squat-motion.js`: the motion data (5 KB).
- `scripts/exercise-motion/bvh-to-keyframes.mjs`: turns a motion capture clip (BVH) into that data: forward kinematics, side-view projection, smoothing, 15 frames per second, integers in a 0 to 1000 box.

## Recommendation

1. **Draw the figure in the app from joint keyframes, style A (Line).** About 5 KB per lift (2.4 KB gzipped), one file works in every theme, and it costs well under a millisecond of script per frame. Pre-rendered WebP is 12 to 25 times bigger and needs one copy per theme.
2. **Source the motion ourselves, free.** For bodyweight squats and lunges, the CMU set is usable now. For everything with a bar, dumbbell, or machine, the free sets have nothing; the only free path is filming side-view clips and extracting joints with MediaPipe (the footage is never shipped). Before committing to that, run one test: film one barbell back squat from the side and push it through the same converter (proposed follow-up below).
3. **Paid is the fallback, not the plan.** Cheap FBX animation packs on asset stores (around $10 to $50 per pack) might cover the big lifts, but each license needs checking for use inside an app, and form quality varies. GIF libraries (ExerciseDB-type) don't fit: no source motion, can't restyle, too big, and their provenance is questioned.
4. **Put it inside the existing How to section** (History sheet and the library's exercise detail, both use `HowToSection.vue`). It only plays after a tap, never mid-set, and adds no control to the logger card. Free or Premium is the owner's call; the spike leans free, since it's form and safety help like the written steps.

## 1. Free paths, ranked

| Path | Quality | Effort | License | Lifts covered |
|---|---|---|---|---|
| **CMU motion capture** | Lab-grade optical capture, 120 frames per second. Clean after light smoothing. | Low: the converter already handles it. | "Free for use in research and commercial projects worldwide"; the BVH conversion adds no restrictions (READMEFIRST.txt of the cgspeed conversion). Some secondary sources add "may not resell the data directly", which we don't. A credit line is polite, not required. | Very few. Bodyweight squats (13_29, 13_30, 14_06, 14_14, 22_14, 23_14, 86_02, 86_08), lunges (144_11, 144_12, 144_17, 144_18). "Weight lifting" (79_93) is a pantomime. No barbell, bench, row, press, or machine lifts. About 3 of the 355 library entries. |
| **Do-it-yourself capture (MediaPipe)** | Not measured in this spike (see below). Expected: fine for the near side in a strict side view, weaker for the far limbs, which a side view hides anyway, and for depth. | Medium: film each lift from the side on a tripod, run MediaPipe Pose (Apache 2.0) offline, then the same smoothing and projection. A bar or dumbbell is drawn by the app from the hand or shoulder positions. | Ours. Only joint positions are kept; no person, face, or gym appears. | Any lift someone can film. |
| **wger** | Mostly still images and drawings, no motion data. | Low to fetch, but nothing to animate. | Exercise data CC-BY-SA 3.0; images are licensed one by one (some from Wikipedia). Share-alike means anything we derive from them (a restyled image) must be released under CC-BY-SA too, with credit and a license link shown in the app. | Not a motion source. Could only seed static pictures, which isn't what #901 asks. |

**MediaPipe wasn't run.** The cloud session can't reach any source of openly licensed lifting video (Wikimedia, Hugging Face, and the MediaPipe model CDN are all blocked), and the spike rules say not to ask the owner to film. Judging jitter on a phone clip is the first thing the follow-up does. The converter's smoothing (a moving average at capture rate before thinning to 15 frames per second) is the step that would absorb it.

## 2. Paid paths, quotes only

Vendor sites weren't reachable from this session (gymvisual.com didn't resolve), so these come from search results and listings, not the vendors' own terms. Every number needs confirming by the owner before any spend.

| Source | Modify and restyle? | Bundle in the app? | Commercial? | Source motion (FBX or BVH)? | Price |
|---|---|---|---|---|---|
| **Gymvisual-type 3D library** | Unknown; their main products are rendered images and videos. | Unknown. | Sold for commercial fitness content. | Not offered as a product; custom work through Fiverr gigs. | Custom animation gigs listed at about $50 to $600 each. Rough: 20 lifts about $1,000 to $12,000; 350 lifts not realistic. |
| **ExerciseDB-type API** | No: GIF or video only. | API use is online, which the privacy rule rules out; a separate one-time dataset (Gumroad, "commercial rights") exists. | Claimed. A May 2026 forum post questions where the GIFs came from. | No. | Dataset up to about $300 one-time, tiers by GIF size. API plans not visible from here. Same rough cost for 20 or 350, but it can't be restyled. |
| **Asset store FBX packs** (Unity Asset Store, CGTrader, itch.io) | Yes, it's raw animation. | Usually yes inside a product; redistributing the files themselves is not allowed. Check each EULA. | Yes, single-entity license. | Yes, FBX. | Around $10 for a 33-animation gym pack (one Unity listing). Coverage of our exact lifts and form quality unknown. |

## 3. Render approach

Measured with the prototype in headless Chromium, playing for 5 seconds at screen rate, with CPU throttling as a stand-in for a phone. A real mid-range Android phone wasn't measured.

| | Size per lift | Themes | Script per frame | Main thread busy |
|---|---|---|---|---|
| **SVG from keyframes** | 5.0 KB JSON (2.4 KB gzipped) | All, from one file | 0.17 ms; 0.52 ms at 4x slower CPU; 0.70 ms at 6x | 7%; 20% at 4x; 27% at 6x (includes software painting, no GPU here) |
| **Animated WebP, 240px** | 63 KB | One file per theme | None | Image decode |
| **Animated WebP, 480px** | 128 KB | One file per theme | None | Image decode |

Bundled, 20 lifts are about 100 KB of data (about 50 KB gzipped); all 355 would be about 1.8 MB, and many entries share a motion (barbell and dumbbell Romanian deadlift, the bench press variants), so far less in practice. If the main-thread cost matters on a real phone, cap the redraw at 30 frames per second and stop when the sheet closes. With reduce motion on, show the bottom of the rep as a still with a Play button.

## 4. Style

See the mockup. **A (Line)** is the pick: accent-colored near side and trunk, dimmer far side, round head. It matches the line icons and keeps the joint angles readable. **B (Solid)** turns blobby at the bottom of the squat and hides the angles. **C (Bunny ears)** is on brand but the ears move with the head and pull the eye from the hips and knees. If the owner wants the bunny, C could show only when the bunny is on, like the theme corners.

## 5. Placement

Inside **How to** on the History sheet (`ExerciseHistoryDetail.vue`) and the library's exercise detail (`LibraryEntryFacts.vue`), above the steps. The section is collapsed by default, so it only plays after a tap. From the logger it's History, then How to; the exercise card's footer is already full (#492), so nothing new goes there.

## Core list: the first 20

There's no logging data to rank by (nothing the user logs leaves the phone), so this takes the lifts the starter programs use most, then the big free-weight lifts. Machine lifts come last: the figure would need the machine drawn too.

1. Barbell Back Squat
2. Barbell Bench Press
3. Deadlift
4. Romanian Deadlift (also serves Dumbbell Romanian Deadlift)
5. Barbell Row
6. Overhead Press
7. Goblet Squat
8. Bulgarian Split Squat
9. Dumbbell Bench Press (also Incline Dumbbell Press, with the bench angle changed)
10. Seated Dumbbell Shoulder Press
11. Dumbbell Row
12. Dumbbell Lateral Raise
13. Dumbbell Curl (also Hammer Curl)
14. Lat Pulldown
15. Seated Cable Row
16. Tricep Pushdown
17. Leg Press
18. Hip Thrust (Dumbbell Hip Thrust)
19. Lunge (CMU has it)
20. Bodyweight Squat (done in this spike)

## Proposed follow-ups (not filed)

- **Capture test:** the owner or a tester films one barbell back squat from the side (tripod, hip height, whole body in frame). An agent runs MediaPipe Pose on it offline, extends the converter to read its landmarks, draws a bar from the shoulders, and compares jitter and form against the CMU squat. Go or no-go for the do-it-yourself path.
- **Build:** a `ExerciseDemo` component in `HowToSection.vue`, the 20 motions bundled, style A, reduce-motion still. Only after the capture test passes and the owner picks free or Premium.
