# Store listing draft

Draft text and screenshots for the Google Play listing (#198) and the App Store listing (#35), written for #725 after the Testers Community feedback on the Play closed test (2026-10-21): the old description was short with no search keywords, and the screenshots were plain phone captures. Nothing here is uploaded; the owner approves and pastes it in.

The copy works in the terms people search for (workout log, gym tracker, strength training, lifting log, sets and reps, progress) and leads with what sets RepBunny apart: everything stays on the phone, no account, no ads, no tracking, and a one-time Premium. Voice follows `docs/brand-identity.md`, and the claims match the app and `site/index.html` as of 2026-10-21. Character counts are checked against each store's limit.

## Store title

Both stores index words in the store title, so each listing's title carries a short keyword suffix (owner, 2026-10-21). This is the store title only: the app's name on the home screen, in the app, and everywhere else stays plain "RepBunny".

- **Google Play app name** (30 max, 25 used): `RepBunny: Gym Workout Log`
- **App Store name** (30 max, 25 used): `RepBunny: Workout Tracker`. It's different from Play's because the App Store subtitle already says "gym & workout log", and Apple gives no extra weight to a word that appears twice.

## Google Play

**Short description** (80 max, 80 used)

> Private gym workout log. Track sets, reps, and progress, all kept on your phone.

Submitted 2026-10-23. Keep it to what the app does: no price or promotion words ("free", "no ads", "sale", "best"). Play Console showed a "price or promotion" warning on the earlier "...Logging is always free." text, and it stayed through draft saves, so it may only clear once the reviewed listing is live. The full description can say logging is free and there are no ads.

**Full description** (4,000 max)

> RepBunny is a quick, private workout log for strength training. Log your sets and reps between lifts, repeat the routines you love, and watch every lift get stronger. Your training stays on your phone. No account, no ads, no tracking.
>
> PRIVATE BY DESIGN
> • No sign-up, no email, no password
> • Everything you log stays on your phone. We can't see it.
> • No ads, no trackers, nothing sold
> • Back up or export your data anytime
>
> A FAST GYM TRACKER
> • Log a set in a tap or two. Last time's weight and reps are already filled in.
> • A rest timer that starts on its own, with a bunny who waits with you
> • Machines with a setting, assisted pull-ups and dips, bodyweight, dumbbells, and barbells
> • Cardio and timed sets in the same workout: treadmill, bike, planks, wall sits
> • Pounds or kilograms, per exercise
>
> ROUTINES, NOT SCHEDULES
> • Save the workouts you repeat as routines and start one in a tap
> • New to lifting? Add a starter program like Beginner full body and change it any way you like
> • Missed a day? Nothing resets. Just pick your next workout.
>
> SEE YOUR PROGRESS
> • Lift progress charts built from your own sets
> • New records, celebrated with the numbers behind them
> • A Next time card that shows what you did last time and what to try today
> • Milestones that only add up. Never streaks, never guilt.
> • A training log of every workout you've done
>
> LOGGING IS FREE. ALWAYS.
> Every workout, set, and rep is free, with no limits and no trial timer. Premium is a one-time unlock for extra tools around your log. No subscription.
>
> Premium adds:
> • Unlimited routines and the bigger starter programs
> • Est. one rep max, volume, and all-time lift charts
> • Next-set targets and strength levels
> • Monthly reports and a year recap
> • Swap suggestions when a machine is taken
> • A plate calculator for your gym's plates
> • Home screen widgets
> • Themes with matching app icons, and Extras you earn by training
>
> Small wins. Stronger every set.

## App Store

**Subtitle** (30 max, 25 used)

> Private gym & workout log

**Keywords** (100 max, 98 used; commas, no spaces, and no words already in the name or subtitle, which Apple indexes on their own)

> lifting,weightlifting,strength,training,weights,sets,reps,progress,fitness,exercise,routine,1rm,pr

**Promotional text** (170 max, 133 used; can change without a new build)

> Log sets and reps in seconds, repeat your routines, and watch every lift climb. Your workouts stay on your phone. No account, no ads.

**Description** (4,000 max): the Google Play full description above, word for word. Apple shows no formatting either, so the capital headings and bullets carry over as is.

## Screenshots

Eight captioned phone screenshots in `docs/store-listing/play/`, at 1080x1920 for Google Play. The caption design is option A of `docs/design/issue-725-store-screenshots.html`: a caption on top with one pink phrase, the real screen below in a dark phone frame. Store search shows only the first two or three, so the order is the pitch:

| File | Caption | Screen |
|---|---|---|
| `1-private.png` | Your log stays on your phone | First-run welcome: no account, data stays on the phone |
| `2-logging.png` | Log a set in seconds | Push day, three bench sets logged, the last one Heaviest yet |
| `3-progress.png` | See every lift get stronger | Bench press est. 1RM chart over 3 months, and Next time |
| `4-record.png` | Celebrate real records | The new record celebration, 140 lb × 8 |
| `5-routines.png` | Repeat the routines you love | Routines list and starter programs |
| `6-rest.png` | Rest, then go again | The rest timer |
| `7-milestones.png` | Milestones, never streaks | Milestones: workouts, records, strong weeks |
| `8-themes.png` | Make it yours | Theme picker with Autumn on |

Play takes 2 to 8 phone screenshots, so all eight fit. The Premium screens (est. 1RM, themes) are labeled in the copy as Premium where it matters.

**Regenerate** (no dev server needed; the config starts the app in local mode on port 5176):

```
npx playwright test --config docs/store-listing/playwright.config.ts
STORE_SIZE=appstore npx playwright test --config docs/store-listing/playwright.config.ts
```

`docs/store-listing/capture.ts` opens the app on an empty on-device database, seeds ten weeks of push/pull history (the same history as `scripts/lib/sample-account.mjs`), logs three bench sets so the record, rest timer, and milestones come from real app logic, and saves the raw screens to `logs/store-listing/raw/<size>/`. `docs/store-listing/frame.html` then adds the caption band at the store's size. Captions live in `CAPTIONS` in the capture script; wrap the pink phrase in `*stars*`. A screen that fails leaves `fail-<name>.png` next to the raw shots, and the run fails naming it.

**App Store sizes (#35).** `STORE_SIZE=appstore` renders 1290x2796, which App Store Connect accepts for the 6.9-inch display, the one size it requires (it scales down for smaller iPhones). It writes to an `appstore` folder beside `play`; those aren't committed until #35 needs them. If Apple ever insists on 1320x2868, add it to `SIZES` in the capture script with a raw viewport of the same shape as its phone window.

The feature graphic (1024x500) is separate: `node scripts/og-image/render.mjs --play`.
