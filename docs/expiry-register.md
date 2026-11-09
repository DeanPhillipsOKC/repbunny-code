# Expiry register

Everything that can expire, lapse, or fall behind a store deadline and quietly break RepBunny (#576).
The monthly `/expiry-radar headless` routine reads this table, checks what it can from public
sources and the repo, and files one `human` issue when something is close (see
`.claude/skills/expiry-radar/SKILL.md`).

**The owner fills in the "Expires on" dates** (`YYYY-MM-DD`) from each dashboard. Leave `?` when
unknown; the radar lists every `?` row as something to look up. Rows marked `(radar)` are dates the
radar looks up itself each run (public lookups or the repo) and reports in its issue or comment;
it never edits this file, so copy a date here if you want it kept.

**Never put secrets here.** Names, dashboard paths, and dates only: no keys, passwords, key
fingerprints, account numbers, or where the key backups are kept (those stay in the owner's
private notes, `docs/decisions.md` > Stays outside the repo).

Lead time is how far ahead to start renewing. The radar alerts at 90 days for any row, and at 120
days for store deadlines.

**Impact** is what breaks if the item lapses, most serious first (owner, 2026-10-15). The radar
lists due and unknown items in this order, so fill in the `1 Users` dates first.

- **1 Users:** existing or new users are hit directly. The app leaves a store, new users can't
  find or buy it, or repbunny.app (privacy policy, support, guides, `hello@repbunny.app`) goes down.
- **2 Releases:** users keep working, but no update or fix can reach a store.
- **3 Pipeline:** automation stops (lanes, routines, CI uploads, notification emails); the same
  work can still be done by hand.
- **4 Low:** nothing breaks soon; it only matters for a later upgrade or an optional extra.

## Accounts, keys, and certificates

| Item | Impact | Where to check | Expires on | Who renews | Lead time |
|---|---|---|---|---|---|
| Apple Developer Program membership | 1 Users (the app leaves the App Store; Premium can't be bought) | developer.apple.com > Account > Membership details | 2027-10-08 | Owner (auto-renew if on) | 30 days |
| Google Play developer account standing | 1 Users (a suspension removes the app from Play) | play.google.com/console > Settings > Developer account > Account details | n/a (check for policy warnings) | Owner | n/a |
| Apple Distribution certificate (iPhone signing) | 2 Releases (installed apps keep working) | developer.apple.com > Certificates, IDs & Profiles > Certificates | 2027-10-08 | Owner; Codemagic reuses it through the API key (`codemagic.yaml`) | 30 days |
| App Store provisioning profiles (`app.repbunny`, `app.repbunny.RestLive`) | 2 Releases | developer.apple.com > Certificates, IDs & Profiles > Profiles | 2027-10-08 | Codemagic recreates them on build (`fetch-signing-files --create`); owner checks they're valid | 14 days |
| Apple agreements (updated Program License Agreement and others) | 2 Releases (an unaccepted update blocks signing and uploads; the 1.7.0 build failed on it, #951) | The banner in developer.apple.com, and appstoreconnect.apple.com > Business | No fixed date: Apple publishes updates any time (check monthly) | Owner (accept the agreement) | n/a |
| App Store Connect API key (Codemagic) | 2 Releases (Codemagic can't sign or upload) | appstoreconnect.apple.com > Users and Access > Integrations > App Store Connect API | No expiry unless revoked | Owner | n/a |
| Play upload key (store flavor keystore) | 2 Releases | play.google.com/console > RepBunny > Test and release > App integrity > Play app signing | ? (validity set when made, `scripts/New-StoreUploadKey.ps1`) | Owner (reset through Play support if lost) | 90 days |
| Personal Android keystore (`ANDROID_PERSONAL_KEYSTORE_*`, `release-android.yml`) | 2 Releases (personal-build installs can't be updated) | Owner's private notes | ? | Owner | 90 days |
| Play service-account key (`PLAY_SERVICE_ACCOUNT_JSON`, `release-play.yml`) | 3 Pipeline (manual upload in Play Console still works) | console.cloud.google.com > IAM & Admin > Service accounts > Keys | ? (none unless an org policy sets one) | Owner | 30 days |
| GitHub token for cloud sessions and routines (`GH_TOKEN`) | 3 Pipeline (every lane and routine stops) | github.com > Settings > Developer settings > Personal access tokens | ? (fine-grained tokens expire) | Owner | 14 days |
| Routine API tokens (`ROUTINE_TOKEN_*`, `REVIEW_ROUTINE_TOKEN`, `SUPPORT_ROUTINE_TOKEN`) | 3 Pipeline | claude.ai/code/routines > each routine > API trigger | ? | Owner | 14 days |
| Gmail app password (`GMAIL_APP_PASSWORD`, `MAIL_PASSWORD`) | 3 Pipeline (notification, digest, and support-dispatch emails) | myaccount.google.com > Security > App passwords | No expiry; revoked by a Google password change. The current one is kept in Proton Pass (entry `smtp.gmail.com`, note "RepBunny automation"); make a new one at myaccount.google.com/apppasswords and paste it into both `GMAIL_APP_PASSWORD` and `MAIL_PASSWORD` | Owner | n/a |
| npm publish token for `actions-minutes-estimator` (`NPM_TOKEN` on that repo, #949; granular, stage only, 90 days) | 4 Low (no new versions of the tool can be staged; the published package and RepBunny's dispatcher keep working) | npmjs.com > Access Tokens | 2027-02-02 (made 2026-11-04; owner has a calendar reminder for 2027-01-26) | Owner (new token into `NPM_TOKEN` and the owner's password manager, then delete the old one) | 14 days |
| ElevenLabs API key and plan (guide narration) | 4 Low (only new narration) | elevenlabs.io > Settings > API keys, and Subscription | ? | Owner | 14 days |

## Domain and hosting

| Item | Impact | Where to check | Expires on | Who renews | Lead time |
|---|---|---|---|---|---|
| repbunny.app registration | 1 Users (site, privacy URL the stores require, support email) | Registrar dashboard > Domains > repbunny.app | ? (radar) | Owner (auto-renew if on) | 60 days |
| repbunny.app registrar payment method | 1 Users (the domain can't auto-renew) | Registrar dashboard > Billing | ? | Owner | 30 days |
| repbunny.app TLS certificate | 1 Users (browsers block the site) | Cloudflare dashboard > repbunny.app > SSL/TLS > Edge Certificates | ? (radar; Cloudflare renews it) | Cloudflare (automatic) | 14 days |
| Cloudflare account and Pages project | 1 Users (hosts the site) | dash.cloudflare.com > Account home, and Workers & Pages | n/a (check plan and notices) | Owner | n/a |
| Retired PWA backend project | none (the PWA is retired; the owner shuts it down in #941, then this row goes) | its dashboard > Project > Settings | n/a | Owner | n/a |
| Codemagic account and build minutes | 2 Releases (no iPhone builds) | codemagic.io > Teams > Billing | ? | Owner | 14 days |

## Payment methods

| Item | Impact | Where to check | Expires on | Who renews | Lead time |
|---|---|---|---|---|---|
| Card on the Apple Developer account | 1 Users (the membership can't renew) | appleid.apple.com > Payment & Shipping | ? (card expiry month) | Owner | 30 days |
| Card on Cloudflare, Codemagic, ElevenLabs, and the registrar | 2 Releases (worst case: Codemagic; the registrar has its own row above) | Each dashboard's Billing page | ? | Owner | 30 days |
| Card on the Google Play / Google Payments profile | 4 Low (Play has no yearly fee) | pay.google.com > Payment methods | ? | Owner | 30 days |

## Store and platform deadlines

The radar looks these up every run from the official pages and fills in the dates; the repo
values come from the files named.

| Item | Impact | Where to check | Expires on | Who renews | Lead time |
|---|---|---|---|---|---|
| Google Play target API level (repo: `targetSdkVersion` in `android/variables.gradle`) | 1 Users (falling behind hides the app from new users on newer Android versions and blocks updates) | developer.android.com/google/play/requirements/target-sdk | ? (radar) | Agent (backlog issue) | 120 days |
| Apple minimum Xcode and iOS SDK for submissions (repo: `xcode:` in `codemagic.yaml`) | 2 Releases (no submissions, including the first one) | developer.apple.com/news/upcoming-requirements | ? (radar) | Agent (backlog issue) | 120 days |
| Android minimum SDK (repo: `minSdkVersion` in `android/variables.gradle`) | 4 Low (matters at the next Capacitor upgrade) | Capacitor's support policy for the major in use | ? (radar) | Agent (backlog issue) | 120 days |
| iOS deployment target (repo: `IPHONEOS_DEPLOYMENT_TARGET` in `ios/App/App.xcodeproj/project.pbxproj`) | 4 Low (matters at the next Capacitor upgrade) | Capacitor's support policy for the major in use | ? (radar) | Agent (backlog issue) | 120 days |
| Capacitor and plugin majors (repo: `@capacitor/*` in `package.json`) | 4 Low (until a store requirement needs a newer major) | capacitorjs.com/docs/main/reference/support-policy and `npm view` | ? (radar) | Agent (backlog issue) | 120 days |
