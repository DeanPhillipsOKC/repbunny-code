# RepBunny — brand identity

## The idea

**RepBunny is a small, good-looking place to record strength training.** It helps you keep track of what you lifted, repeat the routines you care about, and see the progress that comes from showing up. It is cute enough to feel welcoming, cool enough to feel at home in the gym, and quick enough to use between sets.

**Brand promise:** Your training, clearly recorded, with a little delight and no extra work.

**Tagline:** Small wins. Stronger every set.

## Who it is for

RepBunny currently serves two invited users, but the brand is intended to work for anyone who wants a reliable record of their own lifting: exercises, sets, reps, weight, reusable routines, and past sessions. The phone is often in one hand, the workout is already underway, and attention belongs to the training rather than the app. Each person's training data should remain private by default even if the app becomes publicly available.

## What we are — and what we are not

| We are | We are not |
| --- | --- |
| A focused strength workout log | An all-in-one health or lifestyle platform |
| A way to repeat routines and compare them over time, with next-set targets the lifter can see the math for and ignore, and opt-in strength levels that point to the next level (#136). Starter programs (#148) are optional starting points the lifter adds as their own editable routines, described by who they suit, never assigned. They're free (#209) and count toward the free routine limit, so the two 5-day splits come with Premium's unlimited routines | A coach that prescribes whole training plans or judges performance: no "weak" or "below average", only "next level" |
| A personal record that is private by default | A feed or competition that interrupts logging |
| A fast tool for the gym floor | A dashboard that asks for constant attention |
| Encouraging when a real milestone happens | A streak machine that manufactures urgency or guilt |

Nutrition, calories, sleep, step counts, and endless metrics are outside the current product focus. Community features are not a present priority; wider distribution does not require them, though future user research may reveal a useful, opt-in form of sharing. New features should earn their place by making strength training easier to record, repeat, or understand. “Could a fitness app have this?” is not enough.

Timed gym work such as planks, treadmill, or stair-stepper blocks belongs in the log too (decided 2026-09-27), so a whole gym session, including a cardio-and-core day, lives in one place. Strength stays the center of the product. Tracking outside the session, such as steps, heart rate, or calories, stays out.

Decided 2026-09-30, so reviews don't re-propose cutting them:

- **BMI and height stay** on the Body screen. They're basic health context that matters to many people's fitness journey, and without them the Body screen gets too sparse. Don't expand them into broader health tracking.
- **RPE stays one tap away on every set row**, and so do notes. A primary pilot user logs RPE and comments on every workout. Optional fields that only some people use (such as rest timers) can live behind a setting, but don't hide RPE or make it slower to enter.

## Naming

Decided 2026-09-30. The product is just **RepBunny**, including the local-only iPhone app. Don't use "Pocket Edition" or another edition suffix; it was a working name only. There are no plans for a cloud-synced version. If one ever happens, it gets the suffix ("RepBunny Cloud" or similar) and the local app keeps the plain name.

The store listing titles add a keyword suffix for search (2026-10-21): "RepBunny: Gym Workout Log" on Google Play and "RepBunny: Workout Tracker" on the App Store. That's only the title on the store page. The home screen label and every mention in the app stay "RepBunny".

## Logging is never behind a paywall

Decided 2026-09-30. Recording a workout is always free: every set, rep, and exercise type, and the full workout history, with no caps and no trial timer. Backing up, restoring, and exporting your own data are free forever too. Paid extras (Premium in the RepBunny iPhone app) are tools around the log, such as the plate calculator, unlimited routines, and reports.

When deciding whether something is free or paid, ask: would locking it stop someone from recording their training or seeing what they recorded? If yes, it stays free. Say this plainly in marketing ("Logging is free. Always.") and never use a paywall to interrupt a set.

## Personality

**Cute, with restraint.** The bunny, rounded shapes, and warm pink make the app friendly. The charm should show up at entry points, rest, and genuine wins; it should not crowd every form field.

**Cool, without posing.** Dark plum surfaces, clear typography, and compact data make RepBunny feel composed. It can be playful without sounding childish or trying to perform gym culture.

**Efficient by default.** The next useful action should be obvious. Reuse what the user has already entered, keep optional detail optional, and make it easy to get back to a set. Every extra tap needs a reason.

**Quietly encouraging.** A personal record deserves a moment. An ordinary set needs a clear confirmation and a path forward. Progress is shown as evidence, not as pressure.

## Voice and copy

- Write like a helpful training partner: warm, brief, specific, and confident.
- Lead with the action or the fact. Use plain labels such as **Start workout**, **Add set**, **Finish workout**, **History**, and **Routines**. (Decided 2026-10-09, #206: a routine is the workout you repeat, a workout is one logged session. Never "Plans": it implies a calendar. Code, tables, and routes keep the old `template` names.)
- Use bunny language sparingly. “Let's hop in” works as an invitation; “hop” in every instruction would get in the way.
- Celebrate what actually happened. Show the exercise and numbers behind a record. Avoid generic superlatives for routine actions.
- Never shame someone for a missed day, a lighter set, or an unfinished workout. Do not imply that the app knows what their body needs.
- Keep errors useful: say what failed and what the person can do next. Keep confirmation of destructive actions explicit.
- **Support replies sound like Dean, upbeat and grateful** (decided 2026-11-06). Every email reply signed by Dean opens with real thanks, greets the person by first name when they gave one, says plainly that their note is welcome and useful, and closes by thanking them again. Keep it short and specific: no gushing, no promises of dates or fixes, and no em dashes.

**Good examples:** “Last time,” “Add set,” “New record,” “Back to workout.”

**Avoid:** “Crush your goals every day,” “You fell behind,” “Optimize your entire wellness journey,” or a joke where a clear button label should be.

## Visual identity

The current product uses a dark, phone-first interface. A deep plum background lets the workout data lead; Bunny Pink calls attention to the primary action. Lavender, gold, and green are supporting notes for variety, highlights, and positive progress. Pink is an accent, not a wall-to-wall fill.

| Role | Current token | Color |
| --- | --- | --- |
| Background | `--bg` | `#17111c` |
| Main surface | `--surface` | `#211829` |
| Raised surface | `--surface-2` | `#241a2c` |
| Primary accent, Bunny Pink | `--accent` | `#f2879c` |
| Supporting lavender | `--secondary` | `#b79cf0` |
| Highlight gold | `--highlight` | `#f2c069` |
| Progress green | `--success` | `#a9cb8d` |
| Main text | `--text` | `#f5edf2` |

**Themes (#107, reworked in #118; Premium).** A theme changes the whole look: every color token above plus `color-scheme`, and it can bring its own bunny art. Themes don't have to follow this brand palette, but they stay cute. **Classic** (the palette above) is the default; it and **Chalk**, plus the Minimal mascot, are free (#400). Themes live in `THEMES` in `src/lib/theme.ts`; holiday themes are unlocked all year once bought. Today: Classic and **Halloween** (#121: pumpkin `#ff9a3c` accent on near-black purple `#151019`, witch-purple secondary, candy-corn highlight, slime-green success, cardio moved to pink so it doesn't read as pumpkin, and costume bunny art for every slot but `loading` (reworked 2026-10-06 so each slot is a different costume: vampire celebration, devil flex, pirate dumbbell, mad-scientist clipboard, mummy library, bat body, ghost rest), plus #124's decorations: candy-corn day mark and confetti, and webs), **Autumn** (#129, to take over from Halloween in November: golden maple `#e9a23b` accent on dark bark `#1a1210`, rust secondary, olive success, cranberry danger, heather cardio, harvest bunny art for every slot but `loading` (reworked 2026-10-06: apple-basket celebration, wagon flex, plaid-sash dumbbell, field-vest clipboard, cocoa-and-books library, apple-on-the-scale body, leaf-pile rest), and decorations: maple leaf day mark, falling-leaf confetti, and corner sprigs), and **Cotton Candy** (#122, the first light theme: cream `#fff7f4` background, white and soft pink cards, berry `#bf3a65` accent with white `--accent-text`; original bunny art), and **Chalk** (#126, no pink anywhere: chalk white on graphite `#121417`, steel-blue `#8fb4d9` accent, chalk-gray secondary, brass highlight; original bunny art, no decorations. Muscle-group tints in `src/lib/muscleGroups.ts` are fixed data colors and stay the same in every theme, chest's pink included), and **Carrot Patch** (#128, a garden: carrot `#f28c3a` accent on dark soil green `#121710`, leaf-green secondary, mint success so records don't read as the leaf, original bunny art, and decorations: a carrot day mark and carrot confetti, no corner), and **Sunrise** (#127, a second light theme without the pink: warm cream `#fff8f0` background, peach cards, apricot `#b8501c` accent with white `--accent-text`, morning-sky `#3f6fb0` secondary, crimson danger, its own warm-brown shade `#b07a52`; original bunny art, no decorations). More holidays are #123.

Rules every theme follows (checked for each one in `e2e/local/themes.spec.ts`): it sets all fourteen color tokens; `--text` and `--text-dim` pass WCAG AA on `--bg`, `--surface`, and `--surface-2`; `--accent-text` passes on `--accent`, `--accent-pressed`, `--secondary`, and `--danger`; `--accent` passes on `--bg` and `--surface`; and `--success` and `--danger` are never the accent, so records and errors always stand out. Components use tokens or `color-mix()` on tokens, never a hard-coded palette color. Shadows and vignettes mix toward `--shade` (set per scheme in `src/lib/theme.ts`: black for dark themes, a soft mauve for light ones, so a shadow on cream doesn't read as a gray smudge; a theme can override it with its own `shade`, as Sunrise does), never a hard-coded black; tints over a surface mix `--text`, not white. Sheet scrims stay `rgba(0, 0, 0, 0.5)`. Data colors that mean something fixed (muscle groups, plates) stay as they are.

**Theme art and outfits (#146).** Bunny art comes in outfits (`OUTFITS` in `src/lib/theme.ts`), separate from themes. An outfit can replace any mascot slot (`rest`, `celebration`, `celebration-flex`, `celebration-dumbbell`, `clipboard`, `library`, `body`, `loading`) with a file of the same name in `public/themes/<outfit-id>/` (the folder name predates outfits), listed in its `art`. Slots it leaves out use the original. Each theme names the outfit it wears (`outfit`, default Classic), and the user's Outfit pick (Match theme, Holidays, or a fixed outfit) decides what shows, so the Halloween costumes can go on Chalk. A new seasonal outfit adds a row to `HOLIDAY_OUTFITS` for its month. Components get every mascot image from `themeArt(slot)`.

**Handing off new theme art (#130).** Theme art is always WebP: the original slot's file name with a `.webp` extension (`rest-bunny.png` becomes `rest-bunny.webp`), lossy with alpha at about quality 85, in `public/themes/<outfit-id>/`. Keep the source PNG out of the repo. Check a few at 176px on a dark and a light background for edge artifacts before committing. The native apps bundle every set.

**App icons (#145, reworked in #840).** The default icon is today's bunny art, bigger (about 74% of the width) on a full-bleed rose tile `#d96a7f` with no ring and no baked-in corners (the phone applies its own mask): body and plates plum `#2a1830`, inner ears and muzzle cream `#f8ead8`, nose Bunny Pink `#f2879c`. Source: `docs/design/art/app-icons/default-1024.png`; `node scripts/generate-web-icons.mjs` scales it into `public/icon-512.png`, the PWA and site icons, and the favicons (16 px included). The App icon picker offers it twice (#861): Default, the build's own icon (seasonal in a store build cut with one, #857), and Classic, an alternate icon that keeps this rose art all year. Each theme but Halloween and Autumn (their seasonal icons stand in) has a matching home-screen icon (Premium, native apps), made by recoloring `public/icon-512.png` rather than drawing new art, so it stays recognizably the same app. `node scripts/generate-theme-icons.mjs` reads `THEMES` from `src/lib/theme.ts` and maps the icon's flat colors: tile to `--bg`, the bunny to `--accent`, the inner ears and face to `--text` on dark themes or white on light ones, and the nose to the script's `NOSES` entry for that theme (the icon's own pink when there's none). Antialiased edges are blended between the two colors they sit between, so the edges stay smooth. **Theme icons on art (#863):** a theme with a background in `docs/design/art/app-icons/themes/<id>-bg.webp` (Cotton Candy, Chalk, Carrot Patch, and Sunrise today; 1024px full-bleed squares, approved look `docs/design/issue-863-theme-icons.png`) gets that art behind the bunny instead of the flat `--bg` tile, with the same bunny colors, size, and position. The script draws and writes those the way the seasonal icons are (below), through `scripts/lib/art-icon.mjs`: WebP picker and Android images and an art adaptive background. Classic stays the flat rose tile on purpose, as the brand mark, and so does Default. For a flat icon the script writes the picker image (`public/app-icons/<id>.png`, 144px), Classic's native sets under the id `rose`, the Android launcher sets in both flavors (the personal build's carry the DEV badge, like `scripts/generate-android-icons.mjs`), and the iPhone's alternate icon sets (`ios/App/App/Assets.xcassets/<id>.appiconset`, a flat 1024px PNG, #169). For a new theme: add it to `THEMES`, pick a nose in `NOSES` if the default pink disappears into the face, re-run the script, add its `activity-alias` in `android/app/src/main/AndroidManifest.xml` and its id to `ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES` in `ios/App/App.xcodeproj/project.pbxproj` (both configurations), and look at the result at 48px on a dark and a light wallpaper. After changing the source icon, re-run `generate-web-icons.mjs`, then the Android, iPhone, theme, and seasonal icon scripts.

**Seasonal app icons (#841).** Four more Premium icons, picked from their own Seasonal icons group and never switched by date: Autumn, Halloween, Snow Globe, and Christmas. Each is the default icon's bunny, at the same size and position, on generated seasonal art (`docs/design/art/app-icons/seasonal/*-bg.webp`, full bleed, decorations near the edges, empty center; design `docs/design/issue-840-app-icon.png`). Autumn and Halloween keep the plum bunny with an amber or orange nose; Snow Globe and Christmas use a Bunny Pink bunny with a `#dc8155` nose; the cream stays `#f8ead8`. `node scripts/generate-seasonal-icons.mjs` cuts the bunny out of `default-1024.png` (the rose tile becomes clear), recolors it, and writes the WebP picker images (`public/app-icons/season-<name>.webp`) and Android sets whose adaptive background layer is the art (fitted to the visible 72dp, with a blurred bleed so zooming launchers never show an edge) and whose foreground is the bunny. It also writes the iPhone's alternate icon sets: the square composite as a flat 1024px PNG (#169). Colors and art live in its `SEASONS` list, kept in step with `SEASONAL_ICONS` in `src/lib/appIcon.ts`.

**Theme decorations (#124).** A theme's `decor` can fill three more slots: `dayMark` (the This week tracker's mark for a logged day, drawn by `src/components/DayMark.vue`; default paw), `confetti` (the record celebration's confetti shape), and `corner` (a faint decoration, 17% `--text`, in the top-right corner of panels marked `.theme-corner`; `.theme-corner-feature` adds a little more: a hanging spider, or a drifting leaf). Corner decorations go sparingly: only on panels whose top-right corner is empty (Home's This week tile, Progress's hero, Body weight before it has a sparkline), never on set rows or inputs, never over text, a chevron, or a chart, and never blocking a tap. Minimal hides corners and confetti; the day mark stays. The shapes are in `src/style.css`. Halloween uses candy corn and webs. Autumn (#129) uses a maple leaf mark, confetti that mixes maple, birch, and oak leaves (each piece picked at random, falling slower with a sway over the same total time, straight down under reduced motion), and a sprig: a twig with two maple leaves and an acorn. Carrot Patch (#128) uses a tipped carrot for the day mark and the confetti, and no corner. Each `corner` value sets its own `--decor-corner` / `--decor-corner-feature` shapes, so values never collide. Later holidays can reuse the slots. New art: transparent PNG, same canvas size and framing as the original (1024×1024; the body bunny is 331×540), bold outlines since it shows at 92 to 176 px.

The **Mascot** setting combines with any theme. **Full** is the default. **Minimal** keeps the small bunny-and-dumbbell mark and drops the larger art and the celebration motion (rest timer, record and first-workout celebrations, empty states, the loading screen). Records and first workouts still say so in text. In code, large art carries the `mascot-art` class and celebration motion `mascot-motion`; `style.css` hides or stills them under `html[data-mascot="minimal"]`. New mascot art gets the class.

Baloo 2 gives the name and display moments their rounded character. Manrope keeps labels, numbers, and longer text legible. Use the bunny and dumbbell mark as the recognizable signature; reserve larger mascot art and motion for onboarding, rest, and record celebrations. The mascot should support the moment, while the set data stays readable.

Cards, pills, and rounded controls make the interface soft to touch. Keep the hierarchy firm: one obvious primary action, quieter secondary actions, readable contrast, and enough space for a thumb. Show a number or label alongside color when it carries meaning.

## Product decisions through the brand lens

Before adding a feature or changing a screen, ask:

1. Does it help someone record a lift, repeat a routine, or understand their strength progress?
2. Can it be used quickly in the middle of a workout?
3. Does it remove thought or taps from the core flow?
4. Is any celebration tied to a real event, and easy to leave?
5. Will it still feel like a focused tool that respects each person's privacy when the novelty wears off?

If the answer is no, simplify it or leave it out. RepBunny's confidence comes from doing a few useful things very well.

## Grounding in the current app

This identity reflects the shipped app's onboarding, sign-in, Home logging, History, Templates, Exercises, rest timer, and record celebration screens as of September 2026. The visual tokens and type are defined in `src/style.css`; the product and privacy boundaries are described in `docs/architecture.md`. Future brand work should preserve the same balance of warmth, clarity, and speed.
