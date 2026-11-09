// Issue #211: the Android manual test procedure. scripts/qa/build-page.mjs
// turns this into the QA artifact page; scripts/qa/generate-fixtures.mjs
// writes each test case's data file (scripts/qa/fixtures.mjs). See
// docs/qa-procedure.md.
//
// Test case fields: id (TC-<AREA>-<NNN>), area, title, tier ('free' = runs on a
// free install, 'premium' = needs Premium: the personal build or a store
// install with Premium bought, 'both' = same on either), priority (P1 to
// P3), minutes, smoke (run on every build), data ({ scenario, label }: the
// file to restore, named "<id> <label>"), pre (device state), steps,
// expected, and ux (checks beyond the standard three).
//
// Area `paths` are git pathspecs. A test case shows "Changed since last pass"
// when a commit after the build it last passed on touched one of them.

export const STANDARD_UX = [
  'Obvious what to tap next',
  'Every action gave feedback',
  'Could back out or undo, and nothing nagged',
]

const c = (name) => `src/components/${name}.vue`
const l = (name) => `src/lib/${name}.ts`

export const AREAS = [
  { id: 'ONB', name: 'First run and onboarding', paths: [c('SetupWizard'), c('SetupLookStep'), c('LiftingBasics'), 'public/video', l('setupWizard'), c('MuscleCheckScreen'), c('WeightUnitSheet'), c('FirstWorkoutCelebration'), c('SetupReplayRows'), c('LibrarySuggestion'), l('muscleCheck'), l('muscleFirstForm'), l('startingWeight')] },
  { id: 'LOG', name: 'Logging', paths: [c('WorkoutLogger'), c('SetStopwatch'), c('AddExerciseSheet'), c('WeightTypoWarning'), c('FinishEarlyDialog'), c('FinishRecap'), c('RecapRatingAsk'), l('storeRating'), c('SetupNotesSheet'), l('exerciseNotes'), l('setValidation'), l('timedInput'), l('setLabel'), l('finishRecap'), 'src/stores/workouts.ts'] },
  { id: 'REST', name: 'Rest timer and alerts', paths: [c('RestTimer'), c('RestMiniBar'), l('restAlert'), l('restChime'), l('restLive'), l('restLiveState'), 'src/stores/rest.ts', 'android/app/src/main/java/app/repbunny/RestLive.java', 'android/app/src/main/java/app/repbunny/RestActivityPlugin.java', 'android/app/src/main/java/app/repbunny/RestActionReceiver.java'] },
  { id: 'TPL', name: 'Templates and starter programs', paths: [c('TemplateManager'), c('TemplateEditor'), c('StarterPrograms'), c('LastTemplateHint'), l('templateCategory'), l('templateFromWorkout'), l('starterPrograms'), 'src/stores/templates.ts'] },
  { id: 'EXL', name: 'Exercise library', paths: [c('ExerciseList'), c('ExerciseFormSheet'), c('ExerciseLibraryBrowser'), c('LibraryRow'), c('LibraryExerciseDetail'), c('MuscleGroupPicker'), c('AlsoWorksPicker'), c('LoadTypeSelect'), c('TimedTrackingSelect'), c('PushPullPicker'), l('exerciseLibrary'), 'src/data/exercise-library.json', 'src/stores/exercises.ts'] },
  { id: 'SWAP', name: 'Swaps and library links', paths: [c('ExerciseSwapSheet'), c('LibraryLinkField'), c('LibraryLinkReview'), l('exerciseSwap'), l('libraryLink')] },
  { id: 'HIST', name: 'History and past workouts', paths: [c('WorkoutHistory'), c('WorkoutStory'), c('ExerciseHistoryDetail'), l('exerciseHistory'), l('workoutEvents'), l('sessionTable')] },
  { id: 'PROG', name: 'Progress', paths: [c('ProgressHub'), c('ProgressChart'), c('LiftProgress'), c('MuscleProgress'), c('MuscleDetail'), c('BalanceCard'), c('PushPullCheck'), c('TrainingCalendar'), c('TemplateProgress'), c('TemplateProgressDetail'), c('RepRecords'), c('OneRepMaxExplainer'), l('progress'), l('progressHub'), l('progressSeries'), l('muscleVolume'), l('balance'), l('trainingCalendar'), l('templateProgress'), l('repRecords'), l('volume')] },
  { id: 'TGT', name: 'Targets, warm-ups, and plateaus', paths: [l('smartTarget'), l('warmup'), l('plateau'), l('startingWeight')] },
  { id: 'STR', name: 'Strength levels', paths: [c('StrengthLevels'), c('StrengthSexPicker'), l('strengthLevels')] },
  { id: 'RPT', name: 'Reports and PDF', paths: [c('ProgressReport'), c('ShareReportSheet'), l('progressReport'), l('reportPdf'), l('coachReport')] },
  { id: 'FEEL', name: 'Workout feel', paths: [c('FeelInsightsCard'), c('WorkoutFeelPicker'), l('workoutFeel')] },
  { id: 'BODY', name: 'Body weight and measurements', paths: [c('BodyScreen'), c('BodyWeightChart'), c('BodyMeasurementsCard'), c('MeasurementForm'), c('MeasurementHistory'), c('WeighInHistory'), c('BodyStatsModal'), c('MeasureGuideSheet'), l('bodyStats'), l('measurements')] },
  { id: 'MILE', name: 'Milestones and trial passes', paths: [c('MilestonesScreen'), c('UnlockCelebration'), c('TrialPassSheet'), c('TrialNote'), c('TrialEndBanner'), l('milestones'), l('milestoneState'), l('trialPass')] },
  { id: 'LOOK', name: 'Themes, outfits, icons, Extras', paths: [c('ThemeSheet'), c('ThemePreview'), c('ExtrasPicker'), c('RecordCelebration'), l('theme'), l('extras'), l('appIcon'), c('AppIconGrid'), l('bunnyLines'), l('celebration'), 'android/app/src/main/java/app/repbunny/AppIconPlugin.java', 'android/app/src/main/AndroidManifest.xml', 'ios/App/App/AppIconPlugin.swift', 'scripts/apply-default-icon.mjs'] },
  { id: 'WID', name: 'Home screen widgets', paths: [l('homeWidgets'), l('widgetSnapshot'), 'android/app/src/main/java/app/repbunny/HomeWidgets.java', 'android/app/src/main/java/app/repbunny/HomeWidgetsPlugin.java', 'android/app/src/main/java/app/repbunny/WeekWidgetProvider.java', 'android/app/src/main/java/app/repbunny/NextWorkoutWidgetProvider.java', 'android/app/src/main/java/app/repbunny/RecordWidgetProvider.java'] },
  { id: 'PREM', name: 'Premium and free previews', paths: [c('PremiumSheet'), c('PremiumPreviewPanel'), c('PremiumChartTeaser'), c('PremiumMark'), l('premium'), l('premiumStore')] },
  { id: 'PLATE', name: 'Plate calculator', paths: [c('PlateCalculatorSheet'), c('BarbellDrawing'), c('BarbellSettings'), c('PlateInventory'), l('plates')] },
  { id: 'ACCT', name: 'Account and preferences', paths: [c('AccountSheet'), c('AccountButton'), l('accountSheet'), 'src/stores/profile.ts'] },
  { id: 'DATA', name: 'Backup, restore, import, export', paths: [c('BackupOptions'), c('RestoreBackup'), c('ImportHistory'), l('backup'), l('backupMerge'), l('importHistory'), l('importMatch'), 'src/data/sqlite/repos.ts', c('AutoCopySheet'), c('AutoCopyRow'), c('AutoCopyPrompt'), c('AutoCopyOffConfirm'), c('YourCopies'), c('SetupCopyStep'), c('SetupRestore'), l('backupFolder'), 'android/app/src/main/java/app/repbunny/BackupFolderPlugin.java', 'android/app/src/main/java/app/repbunny/BackupDefaultFolder.java', 'ios/App/App/BackupFolderPlugin.swift'] },
  { id: 'HELP', name: 'What\'s new and feedback', paths: [c('WhatsNewSheet'), c('WhatsNewBanner'), c('BugReportSheet'), c('FeatureRequestSheet'), c('HowToSection'), l('whatsNew'), l('releaseNotes'), l('bugReport'), l('errorLog')] },
  { id: 'DEV', name: 'Device states', paths: ['android/app/src/main/AndroidManifest.xml', 'android/app/src/main/java/app/repbunny/MainActivity.java', 'capacitor.config.ts', 'src/App.vue', 'src/main.ts', l('keyboardViewport')] },
  { id: 'UPG', name: 'Updates and migrations', paths: ['src/data/sqlite/schema.ts', 'src/data/sqlite/db.ts', 'src/data/sqlite/capacitor.ts', 'src/data/sqlite/essentialReads.ts', 'src/data/sqlite/restorePoints.ts', l('restorePoints'), c('RestorePoints'), l('localRecovery'), c('RecoveryScreen'), 'android/app/src/main/res/xml/backup_rules.xml', 'android/app/src/main/res/xml/data_extraction_rules.xml'] },
  { id: 'PERF', name: 'Speed', paths: ['src/data/sqlite', 'src/stores'] },
  { id: 'EXPL', name: 'Explore', paths: [] },
]

const PREMIUM_NOTE = 'On the store build, the area\'s free preview and "Keep it with Premium" sheet show instead (see the PREM area).'

export const TEST_CASES = [
  // ---------- First run and onboarding ----------
  {
    id: 'TC-ONB-001', area: 'ONB', title: 'Fresh install through the first logged set and finish', tier: 'free', priority: 'P1', minutes: 6, smoke: true,
    pre: 'Uninstall RepBunny, then install the store bundle from Play\'s internal track. No restore.',
    steps: [
      'Open the app. Note the setup wizard\'s welcome screen and how many taps it takes to reach a workout.',
      'Tap Set up in 30 seconds, keep lb, leave body weight blank, tap Done.',
      'Tap Start a workout, pick Barbell Bench Press from the library.',
      'Log 135 x 8, then 135 x 8 again.',
      'Tap Finish workout and look at the recap, then Done.',
    ],
    expected: 'No dead ends. The first set saves with a clear confirmation, the recap shows the workout and the first milestone (First workout), and Home now shows This week with 1 workout.',
    ux: ['Each welcome card or hint showed once, at the right moment', 'Nothing asked for permission before it was needed'],
  },
  {
    id: 'TC-ONB-002', area: 'ONB', title: 'Weight unit picked once in kg carries everywhere', tier: 'both', priority: 'P2', minutes: 4,
    pre: 'Fresh install (or Account > Your data > Erase all data).',
    steps: ['Pick kg in the setup wizard (or when asked).', 'Start a workout and add Dumbbell Curl.', 'Log 12.5 x 10.', 'Open Progress > Lift progress > Dumbbell Curl.', 'Open Account > Preferences.'],
    expected: 'The logger, chart, and totals all read kg; 12.5 keeps its decimal; Preferences shows kg as the weight unit.',
  },
  {
    id: 'TC-ONB-003', area: 'ONB', title: 'Muscle check screen for exercises without a muscle group', tier: 'both', priority: 'P2', minutes: 4,
    data: { scenario: 'unlinked', label: 'unlinked nicknames' },
    steps: ['Restore the file.', 'Open the Exercises tab.', 'Follow any muscle group or Link your exercises prompt that appears.', 'Link Flat DB Bench to Dumbbell Bench Press, skip the others.'],
    expected: 'The prompt appears once, offers the right library match for Flat DB Bench, and skipping leaves the rest alone. History for Flat DB Bench is unchanged after linking.',
    ux: ['The prompt explains why it is asking'],
  },
  {
    id: 'TC-ONB-004', area: 'ONB', title: 'Start from a program on a fresh install', tier: 'free', priority: 'P2', minutes: 4,
    pre: 'Fresh install.',
    steps: ['On Home tap Start from a program.', 'Open Beginner full body and read its week.', 'Add it.', 'Start the first template it made.'],
    expected: 'The program\'s templates appear on Templates and count toward the 3 free; starting one fills the logger with its exercises.',
  },
  {
    id: 'TC-ONB-005', area: 'ONB', title: 'Save a first freeform workout as a template', tier: 'both', priority: 'P2', minutes: 5,
    pre: 'Fresh install.',
    steps: ['Start a freeform workout with Bench Press and Overhead Press, 2 sets each.', 'Finish it.', 'On the recap, accept the offer to save it as a template.'],
    expected: 'The offer appears only because there are no templates yet; the suggested name fits what was trained (for example Upper body push); the template appears on Templates.',
  },  {
    id: 'TC-ONB-006', area: 'ONB', title: 'Setup wizard on a real phone: keyboard, Skip, look, and Run setup again', tier: 'both', priority: 'P2', minutes: 4,
    pre: 'Fresh install: uninstall RepBunny, then install it again (Erase all data doesn\'t bring the wizard back).',
    steps: [
      'Open the app. On the welcome screen, tap Set up in 30 seconds.',
      'Check which unit is preselected, then tap the Body weight box and type 80.',
      'Tap Back, then Set up in 30 seconds again, then Skip.',
      'Open Account > Preferences > Run setup again. Pick the other unit, enter a body weight, tap Next.',
      'On Pick your look, turn Bunny art off and tap Chalk. Turn Bunny art on, then off again. Open More themes and look through the cards, then tap Chalk. Tap Next, then Skip on How do you want to train?',
      'Close the app fully and open it again. Open Progress > Body weight.',
    ],
    expected: 'The preselected unit matches the phone\'s region (lb in the US, kg elsewhere). The keyboard is a number pad and never hides the Next button for good; the screen scrolls. Skip lands on Home with no unit question. The replay opens on the unit step with the current unit picked, changes the unit, and adds one weigh-in; nothing else is lost. Each card tap and switch flip repaints the whole screen at once, status bar included; More themes opens in place with every other theme as cards, and setup never opens the Theme sheet; after the relaunch the app is still Chalk with no bunny art on Home, and Preferences > Theme shows Chalk and Minimal.',
    ux: ['Nothing sits under the status bar or the gesture bar', 'The bunny and the three promises fit without scrolling on the welcome screen', 'The switch, both theme cards, the More themes header, and Next fit on screen without scrolling'],
  },
  {
    id: 'TC-ONB-007', area: 'ONB', title: 'Setup step 3: See how opens the browser, and each choice lands in the right place', tier: 'both', priority: 'P2', minutes: 5,
    pre: 'Fresh install: uninstall RepBunny, then install it again.',
    steps: [
      'Open the app, tap Set up in 30 seconds, then Next twice to reach How do you want to train?',
      'Tap See how under Just log as I go. Watch a few seconds of the clip, then come back to RepBunny with the back gesture.',
      'Tap Create my own program. Name it Push Day, add Bench Press, tap Done in the sheet.',
      'Tap Add another routine, name it Pull Day, add a row, tap Done in the sheet, then the Done button on the card.',
      'Account > Preferences > Run setup again, Next, Next, then tap Just log as I go and log one set.',
    ],
    expected: 'See how opens repbunny.app/guides/log-a-workout/ in the phone\'s browser (not inside the app), and coming back shows the same setup step. Create my own program asks for a name, then opens the routine editor with Add exercise open; once an exercise is in, the card offers Add another routine and Done. Done lands on Home listing Push Day and Pull Day, with no welcome card. Just log as I go starts a workout with Add exercise open.',
    ux: ['The three choices and the footer fit without scrolling on a small phone', 'Add another routine and Done sit side by side on one line each'],
  },
  {
    id: 'TC-ONB-008', area: 'ONB', title: 'Lifting basics video plays offline with sound and captions', tier: 'both', priority: 'P2', minutes: 4,
    pre: 'Any install. Turn on airplane mode (Wi-Fi off too). Media volume up.',
    steps: [
      'Open Account (the person icon) > About > Lifting basics.',
      'On the first card, tap Watch the basics.',
      'Let it play for about 20 seconds, then drag the scrubber to near the end.',
      'Tap the full screen button in the player, then leave full screen.',
      'Tap Back to the cards.',
    ],
    expected: 'The video starts on the tap, with no network, with sound (music, then the voice) and captions showing at the bottom without turning them on. Seeking works. Back to the cards stops the sound and shows the Reps and sets card again.',
    ux: ['Back to the cards is clear of the status bar', 'The captions are readable and don\'t cover the card text they describe for long'],
  },


  // ---------- Logging ----------
  {
    id: 'TC-LOG-001', area: 'LOG', title: 'Log, edit, and delete weight sets mid-workout', tier: 'both', priority: 'P1', minutes: 5, smoke: true,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore the file.', 'Start Push Day from Templates.', 'Check the first row is pre-filled from last time; log it.', 'Change the second set\'s reps after logging it.', 'Delete the third set (Confirm delete).'],
    expected: 'Pre-fill matches the last Push Day; the edit saves in place; delete asks first and removes only that set.',
  },
  {
    id: 'TC-LOG-011', area: 'LOG', title: 'Store rating prompt appears rarely, only after a record', tier: 'both', priority: 'P2', minutes: 6,
    pre: 'A Play-installed build (internal or closed test), signed in to a Google account on the phone. Clear the app data first so no past ask is stored.',
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore the file and start Push Day.', 'Log a heavier set than last time for one lift and finish. Stay on the recap for a few seconds.', 'Finish a second workout with another record.', 'Finish a plain workout with no record.', 'Open Account > Preferences and turn off "Ask me to rate RepBunny".'],
    expected: 'The first record workout shows Google\'s own rating sheet a few seconds after the recap, with no copy of ours around it. The second record workout never asks again (30 days between asks). A plain day never asks. With the switch off nothing asks. Google may limit the sheet on test builds; if it doesn\'t show, note whether the log shows requestReview resolving.',
  },
  {
    id: 'TC-LOG-002', area: 'LOG', title: 'Each load type logs the right fields', tier: 'both', priority: 'P1', minutes: 7,
    data: { scenario: 'allLoadTypes', label: 'every load type' },
    steps: ['Restore the file and start the Everything template.', 'Log a weight set (Bench), a level set (Spin Bike Intervals), a body-weight set (Push-Up), and an assisted set (Assisted Pull-Up).', 'Log a Treadmill set with time, distance, incline, and calories.', 'Log a Plank with the stopwatch.'],
    expected: 'Each exercise shows only its own inputs (no weight on Push-Up, level on the bike, assist weight on the pull-up, time first on timed). Every set saves and shows in the Workout log the same way.',
  },
  {
    id: 'TC-LOG-003', area: 'LOG', title: 'Timed set stopwatch chimes at the goal time', tier: 'both', priority: 'P2', minutes: 3,
    data: { scenario: 'allLoadTypes', label: 'every load type' },
    steps: ['Restore and start a workout with Plank.', 'Start the stopwatch on the next set.', 'Let it run past last time\'s 1:30.', 'Stop it and log.'],
    expected: 'It chimes once at the goal, keeps counting, and the logged time matches what it showed.',
  },
  {
    id: 'TC-LOG-004', area: 'LOG', title: 'Typo guard on 0 and 999', tier: 'both', priority: 'P2', minutes: 3,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore and start Push Day.', 'Enter 999 for Bench Press and tap Add set, then tap Fix it.', 'Enter 1350 (an extra zero) for the weight and tap Add set.', 'Tap Fix it, enter 135 and 0 reps, and tap Add set.', 'Enter 8 reps and 0 for the weight, and tap Add set.'],
    expected: '999 and 1350 each ask "... is a big jump from <last session\'s heaviest> last time. Log it anyway?" with Fix it and Log anyway; 0 reps shows "Reps must be 1 or more." under the row and saves nothing (no Retry, Finish still works); 0 lb on Bench Press asks first. Nothing silently saves a typo.',
  },
  {
    id: 'TC-LOG-005', area: 'LOG', title: 'Finish early checks first, Resume brings it back', tier: 'both', priority: 'P1', minutes: 3,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore, start Leg Day, log one set.', 'Tap Finish workout.', 'In the dialog, finish anyway.', 'On the recap tap Finished too early? Resume.'],
    expected: 'The dialog says how many planned sets are left; Resume puts you back in the same workout with the set kept.',
  },
  {
    id: 'TC-LOG-006', area: 'LOG', title: 'Discard a workout before logging anything', tier: 'both', priority: 'P2', minutes: 2,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ["Start a freeform workout. Don't log a set.", 'Tap Finish workout.', 'Tap Discard workout.', 'Start the Push Day routine from its tile, then tap Wrong workout? Change it.', 'Open the Workout log.'],
    expected: "Finish with no sets asks 'Finish with no sets logged? This will discard the workout.' first; Discard workout returns Home to the start screen. Change it goes straight back to the tiles with no question. Neither workout appears in the Workout log. Once a set is logged there's no Discard, only Finish workout.",
  },
  {
    id: 'TC-LOG-007', area: 'LOG', title: 'Setup notes from the workout screen', tier: 'both', priority: 'P3', minutes: 2,
    data: { scenario: 'messy', label: 'long names emoji decimals' },
    steps: ['Restore and start the long-named template.', 'Open the setup notes on the landmine press.', 'Edit them, add an emoji, save.'],
    expected: 'The long name wraps without pushing buttons off screen; notes keep their line break and emoji after saving and on the next workout.',
  },
  {
    id: 'TC-LOG-008', area: 'LOG', title: 'Add several exercises without reopening the list', tier: 'both', priority: 'P2', minutes: 2,
    steps: ['Start a freeform workout.', 'Tap Add exercise and add three exercises from the library in one visit.', 'Close the sheet.'],
    expected: 'All three are in the workout in the order picked; the sheet showed which were added.',
  },
  {
    id: 'TC-LOG-009', area: 'LOG', title: 'Finish recap: records, week count, workout note', tier: 'both', priority: 'P1', minutes: 4,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore, start Push Day.', 'Log Bench Press 20 lb heavier than last time.', 'Finish. Read the recap, add a workout note, Done.', 'Open the Workout log.'],
    expected: 'The record celebration shows for the bench set; the recap lists it and this week\'s workout count; the note is on the workout in the log.',
  },
  {
    id: 'TC-LOG-010', area: 'LOG', title: 'Note for today with the phone keyboard, then Last time', tier: 'both', priority: 'P2', minutes: 4, build: 712,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: [
      'Restore, start Push Day, and log one Bench Press set.',
      'Tap + Note for today under the sets, type two lines with an emoji, and tap Save note.',
      'Finish, Done, and open the Workout log.',
      'Start Push Day again and open Bench Press.',
    ],
    expected: 'The keyboard opens on the note box without covering it or Save note; the note shows under Today, then under Bench Press in the Workout log, then at the top of the set card under Last time. The machine setup note by the name is unchanged.',
  },

  // ---------- Rest timer ----------
  {
    id: 'TC-REST-001', area: 'REST', title: 'Rest timer counts down and alerts with the phone locked', tier: 'premium', priority: 'P1', minutes: 4, smoke: true,
    pre: 'Notifications allowed. Volume up.',
    steps: ['Start a workout, log a set so rest starts.', 'With the full rest screen up, lock the phone and press power: the bunny rest screen shows over the lock screen with -15s, +15s, and Skip (#166).', 'Unlock, then lock again with the rest screen closed.', 'Press power: the lock screen shows a RepBunny notification counting down, with +15s and Skip.', 'Tap +15s on the lock screen.', 'Wait for the end.'],
    expected: 'The countdown matches the app, +15s works without unlocking, the rest screen shows over the lock screen while it was up, and an alert (sound or vibration) fires when rest ends. On iPhone it plays the chime picked in Extras (#828), even with the ringer on and the phone locked.',
  },
  {
    id: 'TC-REST-002', area: 'REST', title: 'Rest keeps counting when you leave the workout screen', tier: 'both', priority: 'P2', minutes: 2,
    steps: ['Start rest after a set.', 'Go to Progress, then Templates.', 'Come back to Home.'],
    expected: 'A mini bar shows the remaining rest on other tabs and the time is right when you return.',
  },
  {
    id: 'TC-REST-003', area: 'REST', title: 'Default rest and per-exercise rest', tier: 'both', priority: 'P2', minutes: 3,
    steps: ['Account > Preferences > Default rest timer: 90 seconds.', 'Edit one exercise and give it 3:00 rest.', 'Log a set of each in a workout.'],
    expected: 'The exercise with its own rest uses 3:00; the other uses 1:30.',
  },
  {
    id: 'TC-REST-007', area: 'REST', title: 'Rest screen: where the time came from, Edit, and Keep', tier: 'both', priority: 'P2', minutes: 4,
    pre: 'Fresh install (or Reset & erase > Erase all data), so the 2:00 default and the one-time tip apply.',
    steps: [
      'Finish setup without a starter program, start a Freeform workout, add an exercise, and log a set.',
      'Read the tip under -15s/+15s, tap "just" and the exercise name, then Cancel on the exercise form.',
      'Log another set. Tap Edit next to "Default rest 2:00", then close Account.',
      'Tap -15s, then Keep 1:45 for the exercise (it reads Saved for a moment). Skip, and log one more set.',
      'Lock the phone with the rest screen up, press power, and tap Edit over the lock screen.',
    ],
    expected: 'The first rest is 2:00 with the tip, which never shows again. Each link opens the right field with the keyboard up, the rest keeps counting in the bar, and closing returns to the rest screen. After Keep, the next rest is 1:45 and the line names the exercise. Over the lock screen, Edit asks to unlock first.',
    ux: ['The line under the buttons stays quiet and Skip Rest stays on screen', 'Long exercise names wrap cleanly'],
  },
  {
    id: 'TC-REST-004', area: 'REST', title: 'Notifications denied, then allowed later', tier: 'both', priority: 'P1', minutes: 4,
    pre: 'Android Settings > Apps > RepBunny > Notifications: off.',
    steps: ['Start rest, lock the phone, wait for the end.', 'Unlock: look at the rest screen for the "Rest alerts are off" notice, tap Open settings, and turn notifications back on.', 'Come back and repeat with the screen off.'],
    expected: 'With notifications off the locked phone stays silent (no chime) and the first rest of the workout shows the notice; Open settings lands on RepBunny\'s notification settings. With them on, "Rest is over" fires once, in the background and with the screen off, and plays your picked rest chime (not the phone\'s default notification sound).',
    ux: ['The message about alerts is friendly and says where to fix it', 'Preferences > Rest timer alerts shows the same Open settings button'],
  },
  {
    id: 'TC-REST-005', area: 'REST', title: 'Alarms & reminders off and battery saver on', tier: 'both', priority: 'P2', minutes: 5,
    pre: 'Android Settings > Apps > RepBunny > Alarms & reminders: off. Battery saver on.',
    steps: ['Start a 2:00 rest, lock the phone, put it down.', 'Note when (or whether) the alert fires.'],
    expected: 'The alert still fires within a few seconds of the end, or the app explains that exact alerts are off. Write down the delay.',
  },
  {
    id: 'TC-REST-008', area: 'REST', title: 'One-time notice when on-time alerts are off', tier: 'both', priority: 'P2', minutes: 4,
    pre: 'Android 14 or newer, fresh install. Notifications allowed. Settings > Apps > RepBunny > Alarms & reminders: off.',
    steps: ['Log a set so rest starts.', 'Read the notice on the rest screen and tap Allow on-time alerts.', 'Turn Alarms & reminders on and come back to the app.', 'Reinstall, repeat the first two steps, then tap Not now and log another set.'],
    expected: 'The first rest shows the notice once. Allow opens the Alarms & reminders screen, and the notice is gone when you return with it on. After Not now, later rests never show it again.',
  },
  {
    id: 'TC-REST-006', area: 'REST', title: 'Free: the lock screen shows only the end-of-rest alert', tier: 'free', priority: 'P1', minutes: 3, smoke: true,
    pre: 'A free install (no Premium). Notifications allowed. Volume up.',
    steps: ['Start a workout and log a set so rest starts.', 'Lock the phone and press power.', 'Wait for the end of rest.'],
    expected: 'No countdown on the lock screen. A "Rest is over" notification fires when rest ends. On iPhone it plays the chosen chime, not silence (#828). The Premium sheet lists the lock-screen rest timer.',
  },

  // ---------- Templates ----------
  {
    id: 'TC-TPL-001', area: 'TPL', title: 'Create, reorder, rename, and start a template', tier: 'both', priority: 'P1', minutes: 5, smoke: true,
    data: { scenario: 'exercisesOnly', label: 'exercises no workouts' },
    steps: ['Restore. Templates > New routine.', 'Add three exercises, set target sets, reorder by dragging.', 'Rename it and pick a category.', 'Start it from Templates.'],
    expected: 'Order, target sets, name, and category all stick; the logger opens with the exercises in the new order.',
  },
  {
    id: 'TC-TPL-002', area: 'TPL', title: 'Free limit: 3 templates and the last-free hint', tier: 'free', priority: 'P1', minutes: 3,
    data: { scenario: 'threeTemplates', label: 'three templates' },
    steps: ['Restore. Open Templates.', 'Read the free count.', 'Try to add a fourth template.'],
    expected: 'Templates shows 3 of 3 free used; a fourth opens the Premium sheet, which says what stays free. Nothing already made is locked.',
    ux: ['The nudge is easy to dismiss and says what stays free'],
  },
  {
    id: 'TC-TPL-003', area: 'TPL', title: 'Starter programs: free ones fit, 5-day splits are Premium', tier: 'free', priority: 'P2', minutes: 4,
    pre: 'Fresh install.',
    steps: ['Templates > Not sure what to train? > browse programs.', 'Open Push / pull / legs and add it.', 'Open a 5-day split.'],
    expected: 'PPL adds three templates for free; the 5-day split shows it is Premium with the sheet, not an error.',
  },
  {
    id: 'TC-TPL-004', area: 'TPL', title: 'Archive and restore a template mid-history', tier: 'both', priority: 'P3', minutes: 3,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Archive Pull Day.', 'Open the Workout log and an old Pull Day workout.', 'Back on Routines, tap Restore beside Pull Day under Archived routines.'],
    expected: 'Old Pull Day workouts keep their name in the log. Pull Day returns to the routine list with its exercises.',
  },
  {
    id: 'TC-TPL-005', area: 'TPL', title: 'Create a template from a past workout', tier: 'both', priority: 'P3', minutes: 2,
    data: { scenario: 'allLoadTypes', label: 'every load type' },
    steps: ['Restore. Open the Workout log, pick a workout.', 'Tap Save as routine on the card.'],
    expected: 'The new template has that workout\'s exercises in order with sensible target sets and a fitting name.',
  },

  // ---------- Exercise library ----------
  {
    id: 'TC-EXL-001', area: 'EXL', title: 'Browse the library by muscle group and search machine names', tier: 'both', priority: 'P2', minutes: 3,
    steps: ['Exercises > library. Filter by Back.', 'Search "Pec Fly", then "Tricep Press".', 'Open one and read its how-to.'],
    expected: 'Filter narrows correctly; machine names find the right entries (Pec Fly, Seated Dip Machine); the how-to reads well on a small screen.',
  },
  {
    id: 'TC-EXL-002', area: 'EXL', title: 'Create a custom exercise of each load type', tier: 'both', priority: 'P2', minutes: 5,
    steps: ['Exercises > New exercise. Make "Sled Push" as timed with distance.', 'Make "Weighted Dip" as body weight.', 'Make "Stairmaster" as level.', 'Set push or pull on one.'],
    expected: 'Each saves with only its own fields; push or pull sticks; all three appear in the list in alphabetical order.',
  },
  {
    id: 'TC-EXL-003', area: 'EXL', title: 'Very long exercise name everywhere it appears', tier: 'both', priority: 'P3', minutes: 3,
    data: { scenario: 'messy', label: 'long names emoji decimals' },
    steps: ['Restore. Look at the long name on Exercises, in the logger, on Lift progress, and in the Workout log.'],
    expected: 'It wraps or truncates cleanly everywhere; no button or number is pushed off screen.',
  },

  // ---------- Swaps and links ----------
  {
    id: 'TC-SWAP-001', area: 'SWAP', title: 'Swap a taken machine mid-workout', tier: 'premium', priority: 'P1', minutes: 4, smoke: true,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore, start Leg Day.', 'On Leg Press tap the swap arrows.', 'Pick Hack Squat; log its sets.', 'Finish, then open Templates > Leg Day.'],
    expected: 'Suggestions work the same muscles and show last time; the swap keeps remaining sets and rest; the template still lists Leg Press.',
  },
  {
    id: 'TC-SWAP-002', area: 'SWAP', title: 'Swap on the free build', tier: 'free', priority: 'P2', minutes: 2,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore, start Leg Day.', 'Tap the swap arrows on Leg Press.'],
    expected: 'A preview and the Premium sheet show; the workout keeps going and nothing mid-workout is locked.',
  },
  {
    id: 'TC-SWAP-003', area: 'SWAP', title: 'Link by hand from the edit screen', tier: 'both', priority: 'P3', minutes: 2,
    data: { scenario: 'unlinked', label: 'unlinked nicknames' },
    steps: ['Restore. Edit Lat Pull.', 'Under Library match, link it to Lat Pulldown.'],
    expected: 'The name and history stay "Lat Pull"; Strength levels and swaps now treat it as Lat Pulldown.',
  },

  // ---------- History ----------
  {
    id: 'TC-HIST-001', area: 'HIST', title: 'Edit and delete sets in a past workout', tier: 'both', priority: 'P1', minutes: 4, smoke: true,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Progress > Workout log, open a workout from 3 weeks ago.', 'Change a weight, add a set, delete a set.', 'Open that lift\'s chart.'],
    expected: 'Edits save; the chart and records recalculate to match.',
  },
  {
    id: 'TC-HIST-002', area: 'HIST', title: 'Delete a whole workout', tier: 'both', priority: 'P2', minutes: 2,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Open a workout and delete it.'],
    expected: 'It asks first ("Delete this workout?"), then the workout disappears from the log, calendar, and charts.',
  },
  {
    id: 'TC-HIST-003', area: 'HIST', title: 'Swap, skip, and short-finish markers', tier: 'premium', priority: 'P2', minutes: 3,
    data: { scenario: 'storyMarkers', label: 'swap skip markers' },
    steps: ['Restore. Open the Workout log and find the swapped and skipped workouts.', 'Open Barbell Back Squat\'s chart and tap the marked points.'],
    expected: 'Cards and chart points say what happened, like "Leg Press was taken, so you did Hack Squat."',
  },
  {
    id: 'TC-HIST-004', area: 'HIST', title: 'Session list under a lift\'s chart', tier: 'both', priority: 'P3', minutes: 2,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Open Barbell Bench Press from Lift progress.', 'Scroll the sessions; tap Show older.'],
    expected: 'Each session is a card with sets in columns and a gold paw on record sets; 10 show first, Show older loads more.',
  },
  {
    id: 'TC-HIST-005', area: 'HIST', title: 'Empty states with no history', tier: 'both', priority: 'P3', minutes: 2,
    data: { scenario: 'exercisesOnly', label: 'exercises no workouts' },
    steps: ['Restore. Open Progress, the Workout log, Lift progress, and Muscle groups.'],
    expected: 'Each says what will appear and how to get there; no blank screens or zeros that look broken.',
    ux: ['Empty states are friendly and point to the next step'],
  },

  // ---------- Progress ----------
  {
    id: 'TC-PROG-001', area: 'PROG', title: 'Lift chart: metrics and ranges (Premium)', tier: 'premium', priority: 'P1', minutes: 4, smoke: true,
    data: { scenario: 'year', label: 'twelve months' },
    steps: ['Restore. Progress > Lift progress > Barbell Bench Press.', 'Switch between Heaviest, Est. 1RM, and Volume.', 'Switch ranges 1M, 3M, 1Y, All.', 'Tap a point.'],
    expected: 'Every metric and range draws; the big number is the latest session and the arrow compares to the start of the range; the holiday gap shows as a gap, not a crash to zero.',
  },
  {
    id: 'TC-PROG-002', area: 'PROG', title: 'Lift chart on the free build', tier: 'free', priority: 'P1', minutes: 3,
    data: { scenario: 'year', label: 'twelve months' },
    steps: ['Restore. Open Barbell Bench Press\'s chart.', 'Tap Est. 1RM, Volume, 1Y, and All.', 'Tap Best reps at each weight.'],
    expected: 'Heaviest over 1M or 3M works; each Premium option opens a preview and the sheet saying what stays free.',
  },
  {
    id: 'TC-PROG-003', area: 'PROG', title: 'Chart in kg with decimals', tier: 'both', priority: 'P2', minutes: 2,
    data: { scenario: 'typicalKg', label: 'twelve weeks kg' },
    steps: ['Restore. Open Dumbbell Curl and Bench Press charts.'],
    expected: 'Labels read kg; 11.25 keeps its decimals; no lb leaks in.',
  },
  {
    id: 'TC-PROG-004', area: 'PROG', title: 'This week strip and Progress hub', tier: 'both', priority: 'P2', minutes: 2,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Open Progress.'],
    expected: 'This week shows workouts, sets, and records that match the Workout log for Sunday to Saturday.',
  },
  {
    id: 'TC-PROG-005', area: 'PROG', title: 'Muscle groups: sets per week and the 10 to 20 band', tier: 'both', priority: 'P2', minutes: 3,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Progress > Muscle groups.', 'Open Chest, then go back.', 'Use Previous week and Next week.'],
    expected: 'Sets per muscle match the log; 10 to 20 is shaded; a muscle under 10 last week gets a quiet note.',
  },
  {
    id: 'TC-PROG-006', area: 'PROG', title: 'Balance card flags a push-heavy month', tier: 'premium', priority: 'P2', minutes: 3,
    data: { scenario: 'balanceSkew', label: 'push heavy' },
    steps: ['Restore. Progress > Muscle groups, scroll to Balance.', 'Follow the link for exercises it couldn\'t sort.', 'Set Gym Machine 7 to pull.'],
    expected: 'Push is well ahead of pull with a few suggestions; it says how many it left out; after sorting, the count updates.',
  },
  {
    id: 'TC-PROG-007', area: 'PROG', title: 'Training calendar opens the right day', tier: 'premium', priority: 'P2', minutes: 3,
    data: { scenario: 'year', label: 'twelve months' },
    steps: ['Restore. Progress > Training calendar.', 'Tap a day in the holiday gap, then a day with a workout.', 'Tap the workout in its summary.'],
    expected: '12 months show, stronger color for more sets; a gap day says Rest day; a workout day shows its sets, volume, time, and records, and its workout opens that workout, not the newest one.',
  },
  {
    id: 'TC-PROG-008', area: 'PROG', title: 'Routine progress with a workout note', tier: 'premium', priority: 'P2', minutes: 3,
    data: { scenario: 'templateProgress', label: 'leg day eight sessions' },
    steps: ['Restore. Progress > Routine progress > Leg Day.', 'Tap the point with the pencil.'],
    expected: 'The chart dips on the noted session; the note "Slept 4 hours, cut it short." shows above that session\'s lifts.',
  },
  {
    id: 'TC-PROG-009', area: 'PROG', title: 'Est. 1RM explainer and rep records', tier: 'premium', priority: 'P3', minutes: 2,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. On Bench Press\'s chart tap What\'s est. 1RM?', 'Open Best reps at each weight.'],
    expected: 'The explainer is short and clear; best reps match the log.',
  },

  // ---------- Targets, warm-ups, plateaus ----------
  {
    id: 'TC-TGT-001', area: 'TGT', title: 'Next-set targets from last time and RPE', tier: 'premium', priority: 'P1', minutes: 4, smoke: true,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore, start Push Day.', 'Read the target on each Bench Press row; tap Why? on one.', 'Tap the target to fill the row and log it.'],
    expected: 'Each open row has its own target based on that set last time; Why? explains the rule in plain words; tapping fills the row.',
  },
  {
    id: 'TC-TGT-002', area: 'TGT', title: 'A stalled lift shows Flat since and offers a lighter week', tier: 'premium', priority: 'P1', minutes: 4,
    data: { scenario: 'plateau', label: 'plateau flat lift' },
    steps: ['Restore. Progress > Lift progress: find the Flat since chip on Barbell Bench Press.', 'Open its chart and read the tip.', 'Start the Push template and look at Bench Press.'],
    expected: 'Bench is marked flat since about 4 to 5 weeks ago with one tip; in the workout a Lighter week (about 10% off) is offered and can be taken or skipped.',
  },
  {
    id: 'TC-TGT-003', area: 'TGT', title: 'Warm-up sets round to loadable plates', tier: 'premium', priority: 'P2', minutes: 2,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore, start Leg Day.', 'Tap Warm-up above Squat\'s sets.'],
    expected: 'A few lighter sets build to the target, each a weight you can load with your plates; it says warm-ups aren\'t logged.',
  },
  {
    id: 'TC-TGT-004', area: 'TGT', title: 'Starting weight for a brand-new lift', tier: 'premium', priority: 'P2', minutes: 3,
    data: { scenario: 'strength', label: 'main lifts body weight' },
    steps: ['Restore, start a freeform workout.', 'Add Incline Dumbbell Press (never done).', 'Read the starting weight and where it came from.'],
    expected: 'It suggests a weight from a similar lift or body weight and says which.',
  },
  {
    id: 'TC-TGT-005', area: 'TGT', title: 'Targets turned off per exercise, and on the free build', tier: 'both', priority: 'P3', minutes: 3,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Personal: turn targets off for Bench Press and start Push Day.', 'Store: start Push Day.'],
    expected: 'Personal: no target on Bench, others still have one. Store: a preview of targets, never blocking logging.',
  },

  // ---------- Strength levels ----------
  {
    id: 'TC-STR-001', area: 'STR', title: 'Strength levels for the main lifts', tier: 'premium', priority: 'P1', minutes: 3, smoke: true,
    data: { scenario: 'strength', label: 'main lifts body weight' },
    steps: ['Restore. Progress > Strength levels.', 'Answer (or skip) the one question.', 'Read each lift and the overall score.'],
    expected: 'Squat, bench, deadlift, press, row, and pull-up each show a level and the weight to the next one; the overall score sums them.',
  },
  {
    id: 'TC-STR-002', area: 'STR', title: 'No body weight yet', tier: 'premium', priority: 'P3', minutes: 2,
    data: { scenario: 'allLoadTypes', label: 'every load type' },
    steps: ['Restore. Open Strength levels.'],
    expected: 'It asks for a weigh-in and says why, instead of showing wrong levels.',
  },

  // ---------- Reports ----------
  {
    id: 'TC-RPT-001', area: 'RPT', title: 'Monthly report and Share as PDF', tier: 'premium', priority: 'P1', minutes: 5, smoke: true,
    data: { scenario: 'lastMonth', label: 'last two months' },
    steps: ['Restore. Progress: open last month\'s report.', 'Compare to the month before.', 'Tap Share as PDF, pick Last 4 weeks, and open the PDF.'],
    expected: 'The report shows records, est. 1RM gains, and top muscles; the PDF opens, is readable printed, and lists lifts, sets per muscle, body weight, and records.',
  },
  {
    id: 'TC-RPT-002', area: 'RPT', title: 'Report for a month with no workouts', tier: 'premium', priority: 'P3', minutes: 3,
    data: { scenario: 'emptyLastMonth', label: 'empty last month' },
    steps: ['Restore. Open the report for last month.', 'Make a PDF for custom dates inside the empty month.'],
    expected: 'A friendly empty report, not zeros everywhere or an error; the PDF still makes.',
  },
  {
    id: 'TC-RPT-003', area: 'RPT', title: 'Reports on the free build', tier: 'free', priority: 'P2', minutes: 2,
    data: { scenario: 'lastMonth', label: 'last two months' },
    steps: ['Restore. Tap the report tile on Progress.'],
    expected: 'A preview and the Premium sheet; it says what stays free.',
  },

  // ---------- Feel ----------
  {
    id: 'TC-FEEL-001', area: 'FEEL', title: 'Tag a workout and change it later', tier: 'both', priority: 'P2', minutes: 3,
    steps: ['Finish a workout; on How did it feel? tap sleep, energy, and stress.', 'Open it in the Workout log and change energy.'],
    expected: 'Tags are optional, one tap each, and the change sticks.',
  },
  {
    id: 'TC-FEEL-002', area: 'FEEL', title: 'What helps you lift after 10 tagged workouts', tier: 'premium', priority: 'P2', minutes: 2,
    data: { scenario: 'feel', label: 'fourteen tagged' },
    steps: ['Restore. Progress: find What helps you lift.'],
    expected: 'The card shows which tags line up with the best sessions, worded carefully (not medical advice).',
  },

  // ---------- Body ----------
  {
    id: 'TC-BODY-001', area: 'BODY', title: 'Weigh-in, chart, and BMI', tier: 'both', priority: 'P1', minutes: 3, smoke: true,
    data: { scenario: 'bodyStats', label: 'six months body' },
    steps: ['Restore. Progress > Body weight.', 'Add a weigh-in for today.', 'Edit height.'],
    expected: 'The chart includes today; BMI updates with height; history lists the new entry.',
  },
  {
    id: 'TC-BODY-002', area: 'BODY', title: 'Measurements in inches and cm', tier: 'premium', priority: 'P2', minutes: 4,
    data: { scenario: 'bodyStats', label: 'six months body' },
    steps: ['Restore. Open measurements; read the waist chart.', 'Add new measurements in cm.', 'Open How to measure.'],
    expected: 'Charts per site; cm entries convert for display; the guide is clear.',
  },
  {
    id: 'TC-BODY-003', area: 'BODY', title: 'Measurements on the free build', tier: 'free', priority: 'P3', minutes: 2,
    data: { scenario: 'bodyStats', label: 'six months body' },
    steps: ['Restore. Open measurements.'],
    expected: 'Weigh-ins stay free; measurements show the Premium preview.',
  },

  // ---------- Milestones and trials ----------
  {
    id: 'TC-MILE-001', area: 'MILE', title: 'Crossing 10 workouts earns a trial pass (free build)', tier: 'free', priority: 'P1', minutes: 5, smoke: true,
    data: { scenario: 'milestoneNear', label: 'nine workouts' },
    steps: ['Restore. Do a short workout with 3 sets and finish.', 'Read the milestone card on the recap.', 'Tap Pick a Premium feature to try and pick Lift progress.'],
    expected: 'The recap shows 10 workouts and a trial pass; the pass starts and Lift progress shows "Trial: 7 days left".',
  },
  {
    id: 'TC-MILE-002', area: 'MILE', title: 'Unused trial pass from Milestones', tier: 'free', priority: 'P2', minutes: 3,
    data: { scenario: 'trialUnused', label: 'one unused pass' },
    steps: ['Restore. Progress > Milestones.', 'Use the Premium trial card to start one for Themes.', 'Tap Pick a theme on the confirmation.'],
    expected: 'The card shows one pass waiting; starting it unlocks themes for 7 days, says where themes live, and Pick a theme opens the Theme screen.',
  },
  {
    id: 'TC-MILE-003', area: 'MILE', title: 'Trial on its last day', tier: 'free', priority: 'P1', minutes: 3,
    data: { scenario: 'trialEnding', label: 'trial ends today' },
    steps: ['Account > Erase all data first (a restore merges trials into the ones already on the phone, so a trial started in TC-MILE-002 would win).', 'Restore. Open Lift progress.', 'Read the trial note; tap Keep it with Premium.'],
    expected: 'It says the trial ends today (or in hours), and the sheet says what stays free. Nothing is lost mid-workout.',
  },
  {
    id: 'TC-MILE-004', area: 'MILE', title: 'Trial ended: one gentle note', tier: 'free', priority: 'P2', minutes: 3,
    data: { scenario: 'trialEnded', label: 'trial ended yesterday' },
    steps: ['Account > Erase all data first (a restore merges trials into the ones already on the phone, so a trial started earlier would win).', 'Restore. Go to Home (no workout running).', 'Close the note, leave and come back.'],
    expected: 'One note on Home says the trial ended, shown once; Lift progress is back to the free view.',
  },
  {
    id: 'TC-MILE-005', area: 'MILE', title: 'Milestones screen and Milestone moments off', tier: 'premium', priority: 'P3', minutes: 3,
    data: { scenario: 'strongWeeksNear', label: 'eleven strong weeks' },
    steps: ['Account > Erase all data, then restore. Progress > Milestones: read the next unlock (Strong weeks, 11 of 12).', 'Do a short workout with 3 sets and finish it; read the recap, then tap Done.', 'Account > Preferences > Milestone moments off.', 'Do and finish a second workout the same day.'],
    expected: 'The first finish (2 counted workouts this week) crosses 12 strong weeks and the recap shows the milestone card. After moments go off, the second finish has no milestone card, but Milestones still shows the counts grew (Workouts finished 24).',
  },

  // ---------- Look ----------
  {
    id: 'TC-LOOK-001', area: 'LOOK', title: 'Switch themes, including a light one', tier: 'premium', priority: 'P1', minutes: 4,
    steps: ['Theme screen: Preview Halloween, then pick it.', 'Pick Cotton Candy (light).', 'Check Home, the logger, the rest timer, and a record in each.'],
    expected: 'Colors and art apply everywhere; text stays readable in the light theme; preview matches the real thing.',
    ux: ['Contrast is fine in bright light on the light theme'],
  },
  {
    id: 'TC-LOOK-002', area: 'LOOK', title: 'App icon and outfit picks', tier: 'premium', priority: 'P2', minutes: 3,
    steps: ['Theme screen > App icon: pick Chalk.', 'Outfit: pick Holidays.', 'Go to the home screen.'],
    expected: 'The launcher icon changes (Android may close the app once); the outfit shows on the bunny art.',
  },
  {
    id: 'TC-LOOK-003', area: 'LOOK', title: 'Extras: week marks, confetti, chime, fanfare', tier: 'premium', priority: 'P2', minutes: 4,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Theme > Extras: read which are unlocked.', 'Pick a rest chime and a fanfare.', 'Log a record and let rest finish.'],
    expected: 'Locked ones say what unlocks them; picked sounds play, offline too.',
  },
  {
    id: 'TC-LOOK-004', area: 'LOOK', title: 'Themes on the free build', tier: 'free', priority: 'P2', minutes: 2,
    steps: ['Open Theme.'],
    expected: 'The default theme works; others preview with the Premium sheet; Extras say they come with Premium.',
  },
  {
    id: 'TC-LOOK-005', area: 'LOOK', title: 'Seasonal app icons on the home screen', tier: 'premium', priority: 'P2', minutes: 4,
    steps: ['Theme screen > Seasonal icons: pick Autumn, then go to the home screen and the app drawer.', 'Repeat with Halloween, Snow Globe, and Christmas.', 'Long-press the icon, and on a launcher with icon shapes try circle and square.', 'Pick Default again.'],
    expected: 'Each launcher icon shows the bunny whole inside the circle with the seasonal art around it, no empty or cut-off edge when the launcher zooms or tilts it, and the same bunny as the default icon in that season\'s colors. Default brings the build\'s own icon back.',
    ux: ['The bunny reads clearly at drawer size on a dark and a light wallpaper'],
  },
  {
    id: 'TC-LOOK-006', area: 'LOOK', title: 'iPhone: theme and seasonal app icons', tier: 'premium', priority: 'P2', minutes: 3,
    steps: ['On an iPhone: Account > Preferences > Theme > App icon: pick Chalk and confirm iOS\'s "You have changed the icon" alert.', 'Go to the home screen.', 'Back in Theme > Seasonal icons: pick one, then check the home screen again.', 'Pick Classic, then Default.'],
    expected: 'App icon lists Default (with "Changes with the seasons"), Classic, Cotton Candy, Chalk, Carrot Patch and Sunrise, and Seasonal icons the four seasonal ones, with Premium. Each pick changes the home screen icon after iOS\'s alert, the picked one stays marked when the app reopens, Classic gives the rose icon, and Default brings the build\'s own icon back.',
  },
  {
    id: 'TC-LOOK-007', area: 'LOOK', title: 'Store release with a seasonal default icon', tier: 'both', priority: 'P2', minutes: 5,
    pre: 'The first store release cut with a seasonal default_icon (#857), installed from Play closed testing and TestFlight. Never picked an icon in the app.',
    steps: ['After the update, look at the home screen and the app drawer without opening the app.', 'Open Account > Preferences > Theme > App icon.', 'With Premium, pick Classic, then Default.'],
    expected: 'The home screen icon is the release\'s seasonal one on both phones, with no alert and the shortcut still in place. The Default tile shows that same seasonal icon and is marked as in use, and the Classic tile shows the rose icon. Picking Classic puts the rose icon on the home screen, and Default brings the seasonal icon back. A phone that had picked its own icon before the update keeps it.',
  },
  {
    id: 'TC-LOOK-008', area: 'LOOK', title: 'Retired Halloween and Autumn theme icons move to the seasonal ones', tier: 'premium', priority: 'P2', minutes: 5,
    pre: 'A phone on a build from before #861 with the Halloween (or Autumn) icon picked under App icon, not Seasonal icons. Then update to this build.',
    steps: ['After the update, look at the home screen and the app drawer without opening the app.', 'Open the app.', 'Go to the home screen again.', 'Open Account > Preferences > Theme.'],
    expected: 'On Android the app is still on the home screen and in the drawer the whole time, first with the seasonal art. Opening the app moves it to the Halloween (or Autumn) seasonal icon; the iPhone shows its "You have changed the icon" alert once. The Theme screen marks that seasonal icon as in use, and App icon has no Halloween or Autumn tile.',
  },
  {
    id: 'TC-LOOK-009', area: 'LOOK', title: 'Theme app icons on background art', tier: 'premium', priority: 'P2', minutes: 4,
    steps: ['Theme screen > App icon: pick Cotton Candy, then go to the home screen and the app drawer.', 'Repeat with Chalk, Carrot Patch, and Sunrise.', 'Long-press the icon, and on a launcher with icon shapes try circle and square.', 'On an iPhone, pick each of the four too.', 'Pick Classic, then Default.'],
    expected: 'The picker tiles and each launcher icon show the theme\'s colored bunny whole on its painted background (pink clouds, chalkboard, carrot patch at night, sunrise rays), with no clipped plates in the circle and no empty or cut-off edge when the launcher zooms or tilts it. Classic is still the flat rose tile and Default the build\'s own icon.',
    ux: ['The bunny reads clearly at drawer size on a dark and a light wallpaper'],
  },

  // ---------- Widgets ----------
  {
    id: 'TC-WID-001', area: 'WID', title: 'All three home screen widgets', tier: 'premium', priority: 'P1', minutes: 5,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Add This week, Next workout, and Latest record widgets.', 'Tap Next workout.', 'Log a record and finish, then go home.', 'Switch theme and check the widgets.', 'Switch to Christmas and check This week.', "Switch to Valentine's Day and check This week."],
    expected: 'Widgets show real numbers; Next workout starts the right template; Latest record updates after the finish; colors follow the theme; Christmas marks trained days with candy canes on This week; Valentine\'s Day marks them with candy hearts.',
  },
  {
    id: 'TC-WID-002', area: 'WID', title: 'Widgets on the free build', tier: 'free', priority: 'P3', minutes: 2,
    steps: ['Add the This week widget.'],
    expected: 'It shows a Premium message (tapping it opens the Premium sheet), never blank or stale numbers.',
  },

  // ---------- Premium ----------
  {
    id: 'TC-PREM-001', area: 'PREM', title: 'Premium sheet matches what\'s included', tier: 'free', priority: 'P1', minutes: 3, smoke: true,
    steps: ['Account > Premium: read the list.', 'Open one free preview from each of Progress, Templates, Theme, and the logger.'],
    expected: 'Each preview opens the same sheet with "Keep it with Premium" or Unlock Premium; the list matches the features gated in the app; it always says what stays free.',
    ux: ['Previews are rare and easy to dismiss, never mid-set'],
  },
  {
    id: 'TC-PREM-002', area: 'PREM', title: 'One-time chart teaser at 5 sessions', tier: 'free', priority: 'P3', minutes: 3,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Finish a Push Day (Bench Press is already past the 5 sessions the peek needs).', 'Note the blurred est. 1RM peek on the recap; tap Not now.', 'Finish another workout.'],
    expected: 'The peek shows once and never again after Not now.',
  },

  {
    id: 'TC-PREM-003', area: 'PREM', title: 'Buy Premium unlocks it without a relaunch', tier: 'free', priority: 'P1', minutes: 4,
    pre: 'A license-tester Google account on the phone, with a free (not Premium) RepBunny install from the Play closed testing track (#455).',
    steps: ['Open any free preview, or Account > Premium, and tap Unlock Premium. The button reads "Connecting to Google Play…" while it waits.', 'The Google Play purchase sheet opens within a few seconds. Complete the Play purchase.', 'Without relaunching, open a Premium feature (a theme, plates, a template past the free limit).', 'Fully close the app and reopen it.'],
    expected: 'The sheet closes after the purchase and Premium features work right away, with no relaunch. They are still unlocked after the relaunch.',
  },
  {
    id: 'TC-PREM-004', area: 'PREM', title: 'Restore Premium after a reinstall', tier: 'free', priority: 'P1', minutes: 5,
    pre: 'The license-tester account already owns Premium (run TC-PREM-003 first).',
    steps: ['Uninstall RepBunny, then install the store build from Play.', 'Open it and note whether Premium is already on, after a few seconds.', 'If it is off: Account > Premium > Restore Purchases.', 'Uninstall and reinstall once more, then just open the app and wait a minute without tapping Restore.'],
    expected: 'Restore Purchases brings Premium back (the sheet closes). On the second reinstall a plain launch restores it on its own through the launch check. Neither path shows an error.',
  },
  {
    id: 'TC-PREM-005', area: 'PREM', title: 'Refund and revoke clears Premium', tier: 'free', priority: 'P1', minutes: 6,
    pre: 'The license-tester account owns Premium, with a few routines past the free limit and a non-default theme set.',
    steps: ['In Play Console > Order management, find the test order and refund it with the entitlement removed.', 'Wait about a minute for Play to update (note how long it really takes).', 'Fully close RepBunny (swipe it away) and relaunch it while online.', 'Check Account > Premium, the theme, and the routine list.'],
    expected: 'Premium is off after the relaunch: the sheet offers Unlock Premium again. Nothing created while Premium (routines over the free limit, the chosen theme) is deleted; it is just locked. Record the delay between the refund and Premium clearing.',
  },
  {
    id: 'TC-PREM-006', area: 'PREM', title: 'Offline launch keeps Premium', tier: 'free', priority: 'P1', minutes: 3,
    pre: 'The license-tester account owns Premium and the app has been opened online at least once since buying.',
    steps: ['Turn on airplane mode.', 'Fully close RepBunny and relaunch it.', 'Open a Premium feature and Account > Premium.'],
    expected: 'Premium stays on and nothing on screen shows an error. Turning airplane mode off and relaunching still shows Premium on.',
  },
  {
    id: 'TC-PREM-007', area: 'PREM', title: 'Pending purchase does not unlock', tier: 'free', priority: 'P3', minutes: 5,
    pre: 'A free install, and a license tester set to the "slow test card, declines after a delay" payment method.',
    steps: ['Tap Unlock Premium and buy with the slow test card.', 'Read the sheet, then open a Premium feature.', 'Wait for the card to decline, then fully close and relaunch the app.'],
    expected: 'The sheet says "Waiting for payment. Premium unlocks as soon as Google Play confirms it." and Premium features stay locked while pending, and after the decline.',
  },
  {
    id: 'TC-PREM-008', area: 'PREM', title: 'Redeem a Play promo code from the Premium sheet and the Account card', tier: 'free', priority: 'P2', minutes: 8, build: 706,
    pre: 'A free store install signed in to a Google account that is a closed tester and NOT a license tester, and an unused Play promo code for premium_unlock (Play Console > Monetize > Promo codes).',
    steps: ['Open a Premium feature (e.g. Plate calculator) so the Premium sheet shows.', 'Check the row under Unlock Premium, then tap Redeem a code.', 'In Google Play, enter the promo code and redeem it, then switch back to RepBunny.', 'Open Account > Premium on a second free install, and check the row under Unlock Premium there too (redeem a second code from that card if you have one).', 'Open Account > Premium. Then reopen a Premium feature.', 'Wait 4 days, then relaunch the app.'],
    expected: 'The sheet shows "Restore Purchases · Redeem a code". The Account sheet\'s Premium card shows the same row. Redeem a code opens Google Play\'s redeem screen (not a browser page that can\'t redeem). Back in RepBunny the sheet closes with "Code redeemed. Premium is yours." and features unlock without tapping Restore; if not, Restore Purchases unlocks it. Account says Premium is unlocked and the link is gone. Premium is still on after 4 days (the purchase was acknowledged, not auto-refunded).',
    ux: ['The link reads as quiet as Restore, not a second button', 'Coming back from Play felt automatic'],
  },
  {
    id: 'TC-PREM-009', area: 'PREM', title: 'A bought Premium is acknowledged, not auto-refunded', tier: 'free', priority: 'P1', minutes: 12, build: 888,
    pre: 'A license-tester Google account on the phone, with a free RepBunny install from the Play closed testing track. Play cancels an unacknowledged license-tester purchase after about 5 minutes (#862).',
    steps: ['Tap Unlock Premium and complete the Play purchase.', 'Leave the app open for 10 minutes, then fully close it and reopen it.', 'Check the Google account\'s email, and Play Console > Order management for the order.'],
    expected: 'No "cancelled because it was not acknowledged" email arrives. Premium is still on after the relaunch. The order shows as charged, not refunded.',
  },

  // ---------- Plates ----------
  {
    id: 'TC-PLATE-001', area: 'PLATE', title: 'Plate calculator in lb and kg with odd bars', tier: 'premium', priority: 'P1', minutes: 4, smoke: true,
    data: { scenario: 'plates', label: 'bars lb and kg' },
    steps: ['Restore. In a workout open plates for Squat at 227.5 lb.', 'Open it for Bench (women\'s bar, kg).', 'Open it for EZ Bar Curl (custom 10 kg bar).'],
    expected: 'Each loads the right plates per side for its bar; a weight you can\'t make says so and gives the nearest.',
  },
  {
    id: 'TC-PLATE-002', area: 'PLATE', title: 'Change the plates you own', tier: 'premium', priority: 'P3', minutes: 2,
    steps: ['Open the plate calculator in a workout and edit the plates you own: remove the 2.5 lb plates.', 'Look at 137.5 lb.'],
    expected: 'It works without 2.5s and says the weight can\'t be made exactly.',
  },

  // ---------- Account ----------
  {
    id: 'TC-ACCT-001', area: 'ACCT', title: 'Every Account screen and Back from each', tier: 'both', priority: 'P2', minutes: 3,
    steps: ['Open Account; visit Preferences, Your data, Account & privacy, and About.', 'Use Back and the back gesture from each.'],
    expected: 'Each opens and closes cleanly; Back returns to Account, not out of the app.',
  },
  {
    id: 'TC-ACCT-004', area: 'ACCT', title: 'Visual walkthrough: every screen looks right', tier: 'both', priority: 'P1', minutes: 8, smoke: true,
    steps: [
      'Open each main screen: Home, Progress, Routines, Exercises, Workout log, and Body. Scroll each to the bottom.',
      'Open Account, then each section: Preferences, Your data, Account & privacy, and About. Scroll each.',
      'On the free build and again with Premium (or the Premium preview sheets on a free build), repeat for any screen that differs.',
    ],
    expected: 'Nothing looks unstyled, misaligned, clipped, or run together: rows have their usual spacing, icons and chevrons, text fits its box, and no two items touch.',
    ux: ['Matches the look of the previous release'],
  },
  {
    id: 'TC-ACCT-002', area: 'ACCT', title: 'Reset my data keeps preferences', tier: 'both', priority: 'P1', minutes: 3,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Account & privacy > Reset my data; type RESET.', 'Check Home, Progress, and Preferences.'],
    expected: 'Workouts, templates, and exercises are gone; the weight unit and plates remain.',
  },
  {
    id: 'TC-ACCT-003', area: 'ACCT', title: 'Erase all data starts over like a first launch', tier: 'both', priority: 'P2', minutes: 3,
    data: { scenario: 'trialUnused', label: 'one unused pass' },
    steps: ['Restore. Account & privacy > Erase all data; confirm.', 'Reopen the app.'],
    expected: 'Back to the welcome screen; the weight unit is asked again; trial passes and milestones are cleared.',
  },

  // ---------- Data ----------
  {
    id: 'TC-DATA-001', area: 'DATA', title: 'Full backup, then restore it', tier: 'both', priority: 'P1', minutes: 5, smoke: true,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore the file.', 'Back up my data (all three parts) and save it to Drive.', 'Log one extra set.', 'Restore from the backup you just made; type RESTORE.'],
    expected: 'The preview counts match; after restoring, the extra set is gone and everything else matches.',
  },
  {
    id: 'TC-DATA-002', area: 'DATA', title: 'Corrupt and foreign backups are refused', tier: 'both', priority: 'P1', minutes: 3,
    data: { scenario: 'corruptBackup', label: 'corrupt backup' },
    steps: ['Restore from a backup: pick this file.', 'Then pick TC-DATA-003\'s file (foreign JSON).'],
    expected: 'Both are refused with a clear message; current data is untouched.',
    ux: ['The error says what file it wanted'],
  },
  {
    id: 'TC-DATA-003', area: 'DATA', title: 'Foreign JSON from another app', tier: 'both', priority: 'P2', minutes: 2,
    data: { scenario: 'foreignBackup', label: 'foreign json' },
    steps: ['Restore from a backup: pick this file.'],
    expected: 'Refused as not a RepBunny backup; nothing changes.',
  },
  {
    id: 'TC-DATA-004', area: 'DATA', title: 'Partial backup merges without deleting', tier: 'both', priority: 'P2', minutes: 3,
    data: { scenario: 'partialTemplates', label: 'templates only' },
    steps: ['Restore TC-DATA-001\'s file first.', 'Restore this partial file.', 'Restore it again.'],
    expected: 'The preview says what it adds; Hotel Gym is added once; nothing is deleted; the second merge adds nothing.',
  },
  {
    id: 'TC-DATA-005', area: 'DATA', title: 'Old version 1 backup', tier: 'both', priority: 'P3', minutes: 2,
    data: { scenario: 'v1Backup', label: 'version one' },
    steps: ['Restore this file.'],
    expected: 'It restores with history and templates; the weight unit is left as it was.',
  },
  {
    id: 'TC-DATA-006', area: 'DATA', title: 'Import from Strong', tier: 'both', priority: 'P1', minutes: 6, smoke: true,
    data: { scenario: 'strongCsv', label: 'strong export' },
    pre: 'Restore TC-DATA-001\'s file first, so some exercises match.',
    steps: ['Your data > Import from another app > Strong; pick this file.', 'Answer lb.', 'Review the matches; change one with Other….', 'Import. Then import the same file again.'],
    expected: 'Warm-ups and rest rows are left out; matches look right; history shows "From Strong"; the second import adds nothing.',
  },
  {
    id: 'TC-DATA-007', area: 'DATA', title: 'Import from Hevy in kg', tier: 'both', priority: 'P2', minutes: 4,
    data: { scenario: 'hevyCsv', label: 'hevy export' },
    steps: ['Import from another app > Hevy; pick this file.', 'Import and open Bench Press and the assisted pull-up.'],
    expected: 'Weights stay in kg; the negative weight becomes an assisted lift; planks are timed.',
  },
  {
    id: 'TC-DATA-008', area: 'DATA', title: 'CSV from the wrong app, and a broken one', tier: 'both', priority: 'P2', minutes: 3,
    data: { scenario: 'wrongAppCsv', label: 'wrong app csv' },
    steps: ['Import from another app > Strong: pick this file.', 'Then pick TC-DATA-009\'s broken file.'],
    expected: 'The wrong-app file gets a clear message and imports nothing. The broken file either imports its good rows or refuses clearly; it never crashes or half-imports a row. (It does not yet say how many rows it skipped: #484.)',
  },
  {
    id: 'TC-DATA-009', area: 'DATA', title: 'Broken Strong rows', tier: 'both', priority: 'P3', minutes: 2,
    data: { scenario: 'brokenStrongCsv', label: 'broken strong' },
    steps: ['Import from another app > Strong; pick this file.'],
    expected: 'The good rows import (check the workout count against the file) or it refuses the file clearly. No crash. It does not say how many rows it skipped yet (#484), so don\'t fail the case for that.',
  },
  {
    id: 'TC-DATA-010', area: 'DATA', title: 'Export sets and measurements as CSV', tier: 'both', priority: 'P3', minutes: 3,
    data: { scenario: 'everyTable', label: 'every table' },
    steps: ['Restore. Export sets as CSV, then Export measurements as CSV.', 'Open both in Sheets.'],
    expected: 'Every set has a row with feel tags; measurements are in the unit logged; the files open cleanly.',
  },
  {
    id: 'TC-DATA-012', area: 'DATA', title: 'Share a PDF report, a backup, and a CSV from the system share sheet', tier: 'premium', priority: 'P1', minutes: 5,
    data: { scenario: 'lastMonth', label: 'last two months' },
    steps: ['Restore. Progress: open last month\'s report, tap Share as PDF, pick Last 4 weeks.', 'In the Android share sheet, send the PDF to Drive or Gmail, then open it in a PDF viewer.', 'Account > Data: Save a backup, then Export sets as CSV. Share each to Drive.', 'Open the share sheet and dismiss it without picking an app.'],
    expected: 'Each tap opens the Android share sheet with the file attached and the file opens correctly; dismissing the sheet shows no "saved" message and no error.',
  },
  {
    id: 'TC-DATA-011', area: 'DATA', title: 'Restore and import are off mid-workout', tier: 'both', priority: 'P2', minutes: 2,
    steps: ['Start a workout.', 'Open Your data.'],
    expected: 'Restore and Import are disabled with a reason; backup still works.',
  },
  {
    id: 'TC-DATA-013', area: 'DATA', title: 'Automatic copy is on by default, with setup saying where it goes', tier: 'free', priority: 'P1', minutes: 6,
    pre: 'A fresh install with no workouts (#432, #874). On iPhone, signed in to iCloud with iCloud Drive on.',
    steps: ['Go through setup and read the step titled Your workouts, kept safe. Tap Next without changing anything.', 'Finish a first workout.', 'Open the Files app: iCloud Drive > RepBunny on iPhone, Documents > RepBunny on Android.', 'Finish a second workout.', 'Open Account > Your data > Automatic copy.'],
    expected: 'The setup step names the real folder (iCloud Drive > RepBunny on iPhone; Documents > RepBunny on Android, with the note that this copy stays on this phone) and asks nothing. The recap never offers a copy. The folder has "RepBunny backup.json" and one dated copy; after the second workout the first file is newer and there\'s still one dated copy. Automatic copy says "Saving to <folder>, last saved today".',
  },
  {
    id: 'TC-DATA-014', area: 'DATA', title: 'Automatic copy to a folder you pick (Android: try Google Drive; iPhone: another iCloud folder)', tier: 'free', priority: 'P1', minutes: 8,
    pre: 'TC-DATA-013 done (#432, #874).',
    steps: ['Account > Your data > Automatic copy: tap Change folder and pick a cloud folder: Google Drive (or a sync app\'s folder) on Android, another iCloud Drive folder on iPhone.', 'Finish a workout.', 'Check the file from another device or the web (drive.google.com, icloud.com).', 'Tap Use RepBunny\'s folder.'],
    expected: 'The picker opens at RepBunny\'s own folder and allows the new one (on Android, note which providers allow picking a folder at all). The file appears in the cloud within a few minutes, with no "only on this phone" note. Use RepBunny\'s folder goes back to the default and keeps the copy already there as "RepBunny backup kept <today>".',
  },
  {
    id: 'TC-DATA-015', area: 'DATA', title: 'Turning the automatic copy off needs the warning', tier: 'free', priority: 'P1', minutes: 4,
    pre: 'TC-DATA-013 done (#874).',
    steps: ['Account > Your data > Automatic copy: tap Turn it off, then Keep a copy.', 'Tap Turn it off again, then Turn it off.', 'Finish a workout, then check the folder.', 'Tap Turn it on.', 'Preferences > Run setup again, go to the copy step, tap Don\'t keep a copy, then Turn it off. Finish setup.'],
    expected: 'The warning says everything is stored only on this phone and that a lost phone, reset, or deleted app means the workouts are gone for good. Keep a copy changes nothing. After Turn it off the status says Off and the workout adds no new file. Turn it on saves a copy right away. The setup step shows the copy as off afterwards, and Your data says Off.',
  },
  {
    id: 'TC-DATA-016', area: 'DATA', title: 'Automatic copy when the folder goes away', tier: 'free', priority: 'P2', minutes: 5,
    pre: 'Automatic copy set up to a folder you picked (TC-DATA-014) (#432).',
    steps: ['In the Files app, delete the picked folder.', 'Open Account > Your data > Automatic copy.', 'Finish a workout, then finish another.', 'Tap Change folder and pick a new folder.'],
    expected: 'Your data says it can\'t reach the folder. The next recap shows one "Your copy didn\'t save" note, and the one after doesn\'t repeat it. Workouts save normally throughout. After the new pick it says it\'s saving again.',
  },
  {
    id: 'TC-DATA-017', area: 'DATA', title: 'Automatic copy keeps a copy already in the folder', tier: 'free', priority: 'P1', minutes: 6,
    pre: 'A folder that already holds a "RepBunny backup.json" with several workouts (from TC-DATA-013 on this phone or another one), and a fresh install with no workouts (#871).',
    steps: ['Finish one workout.', 'Account > Your data > Automatic copy: tap Change folder and pick that folder.', 'Open the folder in the Files app.', 'Tap Change folder and pick the same folder again.'],
    expected: 'Automatic copy says the copy already in this folder was kept as "RepBunny backup kept <today>". The folder has that file, the same size as the old copy, next to the new "RepBunny backup.json". The second pick keeps "RepBunny backup kept <today> 2" and the first kept file is unchanged. Your copies lists the kept file.',
  },
  {
    id: 'TC-DATA-018', area: 'DATA', title: 'Your copies restores one from the list', tier: 'free', priority: 'P1', minutes: 5,
    pre: 'TC-DATA-013 done, with at least two workouts in the copy (#874).',
    steps: ['Account > Your data > Your copies.', 'Tap the latest copy, read the preview, and cancel.', 'Start a workout and open Your data.'],
    expected: 'The list shows the latest copy and the weekly ones with their dates and workout counts, and names the folder. The preview shows the same workout count. During a workout Your copies is disabled like the other restores.',
  },
  {
    id: 'TC-DATA-019', area: 'DATA', title: 'iPhone: a new install offers the iCloud copy on the welcome screen', tier: 'free', priority: 'P1', minutes: 8,
    pre: 'iPhone only. TC-DATA-013 done with at least two workouts, signed in to iCloud (#874).',
    steps: ['Delete RepBunny and install it again (or install it on another iPhone on the same Apple ID).', 'Open it and wait on the welcome screen.', 'Tap Restore my workouts, type RESTORE, and restore.'],
    expected: 'The welcome screen asks "Restore your workouts from <date>?" with the workout count, with no folder picker. See all copies lists them. After the restore every workout is back and setup is skipped.',
  },
  {
    id: 'TC-DATA-020', area: 'DATA', title: 'Android: a reinstall finds its copies with one tap', tier: 'free', priority: 'P1', minutes: 8,
    pre: 'Android only. TC-DATA-013 done with at least two workouts (#874).',
    steps: ['Uninstall RepBunny and install it again.', 'On the welcome screen, tap Had RepBunny before? Find my copies.', 'In the folder picker, which should open at Documents > RepBunny, tap Use this folder and allow access.', 'Pick the latest copy, type RESTORE, and restore.', 'Finish a workout, then check Documents > RepBunny.'],
    expected: 'The picker opens at the RepBunny folder. The list shows the old copies with dates and workout counts. After the restore every workout is back. The next copy goes to the same folder and the old latest copy is kept as "RepBunny backup kept <today>", not overwritten.',
  },

  // ---------- Help ----------
  {
    id: 'TC-HELP-001', area: 'HELP', title: 'What\'s new note after an update', tier: 'both', priority: 'P1', minutes: 2,
    pre: 'Update over an older build.',
    steps: ['Open the app after updating.', 'Read the note; open What\'s new; follow a How to use it link.', 'Close and reopen the app.'],
    expected: 'The note shows once; the list has today\'s items; the guide opens; it doesn\'t show again.',
  },
  {
    id: 'TC-HELP-002', area: 'HELP', title: 'Report a bug and Request a feature', tier: 'both', priority: 'P2', minutes: 3,
    steps: ['Account > About > Report a bug: pick errors to include, tick Email me when it\'s fixed.', 'Back out, then Request a feature.'],
    expected: 'Each opens the email app with a filled-in message; backing out sends nothing.',
  },
  {
    id: 'TC-HELP-003', area: 'HELP', title: 'Help & guides', tier: 'both', priority: 'P3', minutes: 2,
    steps: ['Account > About > Help & guides.', 'Open two guides.'],
    expected: 'They open and match what the app looks like now.',
  },

  // ---------- Device states ----------
  {
    id: 'TC-DEV-011', area: 'DEV', title: 'Nothing shows behind the status bar when scrolling', tier: 'both', priority: 'P2', minutes: 2,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Open Progress > Workout log and scroll a long way up the list.', 'Start a workout, add a few lifts, and scroll the Log screen.', 'Watch the strip behind the clock and battery icons on each screen.'],
    expected: 'Scrolled content slides under a solid strip in the theme background. Nothing shows through behind the clock, camera cutout, or battery.',
  },
  {
    id: 'TC-DEV-001', area: 'DEV', title: 'App killed mid-workout: Resume comes back', tier: 'both', priority: 'P1', minutes: 3, smoke: true,
    steps: ['Start a workout and log two sets; start rest.', 'Swipe the app away from Recents.', 'Reopen it.'],
    expected: 'It asks Resume your workout?; resuming keeps both sets and the workout clock.',
  },
  {
    id: 'TC-DEV-002', area: 'DEV', title: 'Airplane mode mid-workout', tier: 'both', priority: 'P1', minutes: 3, smoke: true,
    steps: ['Start a workout; turn on airplane mode.', 'Log sets, rest, finish, open Progress.', 'Turn airplane mode off.'],
    expected: 'Everything works offline (data is on the phone); no spinner or error appears.',
  },
  {
    id: 'TC-DEV-003', area: 'DEV', title: 'Back gesture on every screen', tier: 'both', priority: 'P2', minutes: 5,
    steps: ['On each tab, sheet, and sub-screen (Account sections, chart detail, template editor, restore preview) use the back gesture.'],
    expected: 'Mid-workout it never discards. Back closes the topmost sheet first, then goes up one screen, and leaves the app only from Home. A sheet that cannot be dismissed (the first-run unit picker) stays put.',
  },
  {
    id: 'TC-DEV-004', area: 'DEV', title: 'Large font and display size', tier: 'both', priority: 'P2', minutes: 8, build: 700,
    pre: 'Android Settings > Display: font size at about 150% and display size up one or two steps.',
    steps: [
      'Walk Home, a workout (log a set), the recap, Progress, and Account.',
      'Turn font size and display size to their largest and walk the same screens again.',
    ],
    expected: 'At about 150% nothing overlaps or gets cut off and buttons stay tappable (#492): the workout name keeps its own line above the clock, the exercise card grows to fit its name and History, the tab labels don\'t touch, and the recap\'s How did it feel options wrap between words. At the largest sizes everything is still readable, if tight.',
  },
  {
    id: 'TC-DEV-005', area: 'DEV', title: 'TalkBack on the core loop', tier: 'both', priority: 'P2', minutes: 8,
    pre: 'TalkBack on.',
    steps: ['Start a workout, log a set, start and skip rest, finish.'],
    expected: 'Every control reads a sensible name; you can finish the loop by swiping and double-tapping alone.',
  },
  {
    id: 'TC-DEV-006', area: 'DEV', title: 'Small screen', tier: 'both', priority: 'P3', minutes: 4,
    pre: 'The smaller second phone, or display size at its largest.',
    steps: ['Walk the logger, the bottom nav, and the Premium sheet.'],
    expected: 'Tab labels don\'t overlap; the logger fits a set row without sideways scrolling.',
  },
  {
    id: 'TC-DEV-007', area: 'DEV', title: 'Light and dark system theme', tier: 'both', priority: 'P3', minutes: 2,
    steps: ['Switch the phone between light and dark mode with the app open.'],
    expected: 'The app keeps its own theme and the status bar stays readable.',
  },
  {
    id: 'TC-DEV-008', area: 'DEV', title: 'Uninstall and reinstall with Auto Backup', tier: 'free', priority: 'P2', minutes: 10,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    pre: 'Google backup on for the phone.',
    steps: ['Restore. Settings > Google > Backup > Back up now.', 'Uninstall and reinstall from Play.', 'Open the app.'],
    expected: 'History is back (Auto Backup restored the database), or the app starts fresh and the Restore from a backup route works. Note which.',
  },
  {
    id: 'TC-DEV-009', area: 'DEV', title: 'App killed mid-workout: Discard removes it and its sets', tier: 'both', priority: 'P2', minutes: 3,
    steps: ['Start a freeform workout and log two sets.', 'Swipe the app away from Recents.', 'Reopen it.', 'On Resume your workout?, tap Discard workout, then confirm.', 'Open the Workout log.'],
    expected: "The confirm says 'Discard this workout and its logged sets? This can't be undone.'; afterwards Home shows the start screen and the workout and both sets are gone from the Workout log, calendar, and charts.",
  },
  {
    id: 'TC-DEV-010', area: 'DEV', title: 'Back gesture closes the Add exercise sheet', tier: 'both', priority: 'P2', minutes: 2,
    steps: ['Start a freeform workout.', 'Tap Add exercise (or Add your first exercise on an empty workout).', 'Swipe back.'],
    expected: 'The sheet closes and the workout stays open. The app does not exit.',
  },
  {
    id: 'TC-DEV-012', area: 'DEV', title: 'The app never zooms (rapid taps, pinch, field focus)', tier: 'both', priority: 'P2', minutes: 5,
    pre: 'Run on an iPhone (TestFlight) and on Android.',
    steps: [
      'Start a workout, log a set, and during the rest tap +15s and -15s rapidly.',
      'Pinch out and in on Home, the Log screen, Routines, and the Account sheet.',
      'Tap into the Add exercise search, the Exercise library search, the Lift progress search, and the weight and reps fields.',
    ],
    expected: 'Each rapid tap changes the rest time and the app never zooms. Pinching zooms nothing on any of the four screens. Focusing a search or number field does not zoom the page.',
  },

  // ---------- Updates ----------
  {
    id: 'TC-UPG-001', area: 'UPG', title: 'Update over the last store version keeps every table', tier: 'free', priority: 'P1', minutes: 10, smoke: true,
    data: { scenario: 'everyTable', label: 'every table' },
    pre: 'Install the previous store bundle from My Drive\\RepBunny QA\\Builds\\.',
    steps: ['On the old build, restore this file (or log data across every table by hand).', 'Install the new build over it (no uninstall).', 'Check workouts, sets of each load type, templates, weigh-ins, measurements, feel tags, and the swap marker.'],
    expected: 'Everything survived the update with the same counts; nothing asks to restore.',
  },
  {
    id: 'TC-UPG-002', area: 'UPG', title: 'Restore points: before an update, after a workout, and restoring one', tier: 'free', priority: 'P1', minutes: 8, smoke: true,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    pre: 'Install the previous store bundle from My Drive\\RepBunny QA\\Builds\\.',
    steps: [
      'On the old build, restore this file. Install the new build over it (no uninstall) and open it.',
      'Account > Your data > Restore points.',
      'Close it, start Push Day, log one set, and finish.',
      'Open Restore points again, tap the "After Push Day" one, type RESTORE, and replace.',
      'Open Restore points once more.',
    ],
    expected: 'Step 2 lists "Before update to <new version>" with the restored workout count when the update changed the database schema (otherwise it says there are none yet). Step 4 adds "After Push Day" on top, and restoring it keeps the workout just logged. Step 5 shows "Before a restore" on top. The app never froze on open after the update.',
    ux: ['The restore point labels and times read clearly'],
  },
  {
    id: 'TC-UPG-003', area: 'UPG', title: 'Recovery screen on damaged data: one-tap restore', tier: 'free', priority: 'P1', minutes: 10, build: 658,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    pre: 'A debuggable build of the personal flavor (run-as needs one), the phone on USB with adb.',
    steps: [
      'Restore this file, then start Push Day, log one set, and finish (that saves a restore point).',
      'Swipe the app away. Run: adb shell run-as app.repbunny.personal sh -c "head -c 8192 /dev/urandom > databases/repbunnySQLite.db"',
      'Open the app.',
      'Tap See all restore points, look, and close it. Tap Send a bug report, look, and close it.',
      'Tap Restore it.',
      'Swipe the app away and open it again. Run: adb shell run-as app.repbunny.personal ls databases',
    ],
    expected: 'Step 3 shows "Something went wrong opening your workouts" with "Your data from <today>, after Push Day, is saved on this phone" instead of Home, and nothing restores by itself. The bug report lists "Couldn\'t open the on-device data". Step 5 lands on Home with the history and the Push Day just logged. Step 6 opens straight to Home, and the list shows repbunnySQLite.db (the damaged copy, kept) beside a new repbunny-<date>SQLite.db.',
    ux: ['The recovery screen reads calm, not alarming', 'Restore it is the obvious next step'],
  },
  {
    id: 'TC-UPG-005', area: 'UPG', title: 'Recovery screen on damaged data: Start fresh', tier: 'free', priority: 'P2', minutes: 8,
    pre: 'A debuggable build of the personal flavor (run-as needs one), the phone on USB with adb. No restore points or backup needed.',
    steps: [
      'Swipe the app away. Run: adb shell run-as app.repbunny.personal sh -c "head -c 8192 /dev/urandom > databases/repbunnySQLite.db"',
      'Open the app. Tap Start fresh, then Cancel.',
      'Tap Start fresh, then Start fresh again on the confirmation.',
      'Swipe the app away and open it again. Run: adb shell run-as app.repbunny.personal ls databases',
    ],
    expected: 'Step 2 shows the quiet "Start fresh" above "Send a bug report", and Cancel returns to the same screen with nothing changed. Step 3 opens the app empty, on the welcome screen. Step 4 opens straight to the welcome screen, and the list shows repbunnySQLite.db (the damaged copy, kept) beside a new repbunny-<date>SQLite.db.',
    ux: ['Start fresh reads as a last resort, quieter than Restore', 'The confirmation says the old data stays on the phone'],
  },
  {
    id: 'TC-UPG-004', area: 'UPG', title: 'Reinstall brings the data back, with no recovery screen', tier: 'free', priority: 'P1', minutes: 10, build: 766,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    pre: 'The store build from Play (Auto Backup only restores an app installed the same way), with Google backup on in Settings > System > Backup.',
    steps: [
      'Restore this file. In Settings > System > Backup, tap Back up now and wait for it to finish.',
      'Uninstall RepBunny, then install it again from Play and open it.',
      'Uninstall it again. Install it again, and this time turn on airplane mode before opening it.',
    ],
    expected: 'Steps 2 and 3 open on Home (or the welcome screen if the backup was empty), never on "Something went wrong opening your workouts", and the restored history is there. Account > Your data > Restore a backup file also works after a reinstall.',
    ux: ['A reinstall feels like nothing went wrong'],
  },

  // ---------- Speed ----------
  {
    id: 'TC-PERF-001', area: 'PERF', title: 'Cold start and set save on 5 years of history', tier: 'free', priority: 'P1', minutes: 8, smoke: true,
    data: { scenario: 'fiveYears', label: 'five years' },
    steps: ['Restore (this takes a while; note how long).', 'Force-stop the app, open it, and time until Home is usable.', 'Start Push Day and time a set save.', 'Open Progress and Bench Press\'s chart.', 'Tap between Home, Progress, Routines, and Exercises a few times and time the slowest switch (Progress included; the second visit should be near instant).', 'Enter the numbers in Release > Speed.'],
    expected: 'Cold start and set save are no more than about 20% slower than the last build; Progress and charts open without a long freeze, and a tab switch takes under about 300 ms.',
  },

  // ---------- Explore ----------
  {
    id: 'TC-EXPL-001', area: 'EXPL', title: 'Explore logging for 15 minutes', tier: 'both', priority: 'P2', minutes: 15,
    data: { scenario: 'typical', label: 'twelve weeks ppl' },
    steps: ['Restore. Use the logger the way a hurried lifter would: fast taps, edits, swaps, rest changes.'],
    expected: 'Write anything odd, slow, or confusing in the notes.',
  },
  {
    id: 'TC-EXPL-002', area: 'EXPL', title: 'Explore Progress for 15 minutes', tier: 'premium', priority: 'P2', minutes: 15,
    data: { scenario: 'year', label: 'twelve months' },
    steps: ['Restore. Poke at every chart, card, and link on Progress.'],
    expected: 'Write anything odd, slow, or confusing in the notes.',
  },
  {
    id: 'TC-EXPL-003', area: 'EXPL', title: 'Explore the free build as a new user for 15 minutes', tier: 'free', priority: 'P2', minutes: 15,
    pre: 'Fresh install.',
    steps: ['Use the app with no data and no Premium, the way a first-day user would.'],
    expected: 'Write down every nudge you saw and whether it felt fair.',
  },
]

// Recurring journey reviews, separate from the release pass. `cadenceDays`
// sets when one is Due; it's Due early when one of `areas` changed since.
export const JOURNEYS = [
  {
    id: 'first-run', title: 'First run and onboarding', cadence: 'Monthly', cadenceDays: 30, areas: ['ONB', 'LOG', 'TPL'],
    prompts: [
      'Fresh install through the first logged set and the first finish.',
      'Every welcome card, one-time hint, and prompt (weight unit, muscle check, Link your exercises, alerts permission, the save-as-template offer): does it appear at the right moment and point at things that still exist under those names?',
      'Does each help rather than nag? Is anything new missing a hint it needs?',
    ],
  },
  {
    id: 'free-premium', title: 'Free user and Premium nudges', cadence: 'Quarterly', cadenceDays: 91, areas: ['PREM', 'MILE', 'TPL'],
    prompts: [
      'The store build from scratch.',
      'Every Premium preview, the last-free-template hint, the chart teaser, and trial passes from earning to ending.',
      'Are nudges accurate, rare, and easy to dismiss? Does the Premium sheet match what is included?',
    ],
  },
  {
    id: 'returning', title: 'Returning user', cadence: 'Quarterly', cadenceDays: 91, areas: ['HELP', 'PROG', 'MILE'], data: 'returning',
    prompts: [
      'Restore the returning-user file (months of history, then a break).',
      'What\'s new, the resume flow, Progress after a gap, milestones and next-unlock lines.',
      'Does the app make sense to someone who\'s been away?',
    ],
  },
  {
    id: 'copy', title: 'Help and copy freshness', cadence: 'Quarterly', cadenceDays: 91, areas: ['HELP'],
    prompts: [
      'Each What\'s new note, guide link, and site guide against the current app (pairs with /help-review).',
      'Empty states, error messages, and button labels for wording drift, like "template" left over after the Routines rename.',
    ],
  },
  {
    id: 'moving-in', title: 'Moving in', cadence: 'Quarterly', cadenceDays: 91, areas: ['DATA'],
    prompts: [
      'Import from Strong and Hevy with the import files, and restore on a new phone.',
      'Does someone switching apps get a good first hour?',
    ],
  },
]

export const RELEASE_CHECKS = [
  { id: 'upgrade', text: 'Update over the last store version (TC-UPG-001), with the previous bundle from My Drive\\RepBunny QA\\Builds\\' },
  { id: 'store-bundle', text: 'Smoke ran on the signed store bundle from Play\'s internal track, not a debug or personal build' },
  { id: 'gym', text: 'Real gym session: one-handed, bright light, patchy signal, phone locked between sets' },
  { id: 'second-phone', text: 'Smoke on the second phone (a cheaper or smaller Samsung, battery saver on)' },
  { id: 'speed', text: 'Speed numbers entered for this build (TC-PERF-001)' },
  { id: 'bug-bash', text: 'Bug bash with the closed beta testers (before launch only)' },
]

// Taps recorded on the real gym session.
export const TAP_COUNTS = [
  { id: 'logSet', label: 'Log a set' },
  { id: 'startRoutine', label: 'Start template' },
  { id: 'finish', label: 'Finish' },
]
