// Issue #842: which free-exercise-db exercises join the library, and how.
// Read by scripts/import-exercises.mjs; the reasons behind the choices are in
// docs/exercise-library-source.md. Source ids are free-exercise-db's `id`s.

export const SOURCE = {
  repo: 'https://github.com/yuhonas/free-exercise-db',
  commit: 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5',
  license: 'Unlicense (public domain)',
  retrieved: '2026-10-26',
}

// Reviewed as the same exercise as one we already have, under the same or a
// different name. They never add an entry, only the aliases listed (a plural
// or the name people see elsewhere).
export const MATCHES = {
  'Barbell_Bench_Press_-_Medium_Grip': { id: 'barbell_bench_press' },
  'Barbell_Incline_Bench_Press_-_Medium_Grip': { id: 'incline_barbell_bench_press' },
  Dumbbell_Bench_Press: { id: 'dumbbell_bench_press' },
  Incline_Dumbbell_Press: { id: 'incline_dumbbell_press' },
  Leverage_Chest_Press: { id: 'chest_press_machine' },
  Machine_Bench_Press: { id: 'chest_press_machine', aliases: ['Machine Bench Press'] },
  Leverage_Incline_Chest_Press: { id: 'incline_chest_press_machine', aliases: ['Leverage Incline Chest Press'] },
  Smith_Machine_Bench_Press: { id: 'smith_machine_bench_press' },
  Butterfly: { id: 'pec_deck' },
  Dumbbell_Flyes: { id: 'dumbbell_fly' },
  Incline_Dumbbell_Flyes: { id: 'incline_dumbbell_fly', aliases: ['Incline Dumbbell Flyes'] },
  Cable_Crossover: { id: 'cable_crossover' },
  Low_Cable_Crossover: { id: 'low_cable_fly' },
  Pushups: { id: 'push_up', aliases: ['Push-Ups', 'Pushups'] },
  'Incline_Push-Up': { id: 'incline_push_up' },
  'Decline_Push-Up': { id: 'decline_push_up' },
  'Push-Ups_With_Feet_Elevated': { id: 'decline_push_up' },
  'Dips_-_Chest_Version': { id: 'chest_dip' },
  Pullups: { id: 'pull_up', aliases: ['Pull-Ups', 'Pullups'] },
  'Chin-Up': { id: 'chin_up', aliases: ['Chin-Ups'] },
  'Wide-Grip_Lat_Pulldown': { id: 'lat_pulldown' },
  'V-Bar_Pulldown': { id: 'close_grip_lat_pulldown' },
  'Close-Grip_Front_Lat_Pulldown': { id: 'close_grip_lat_pulldown' },
  'Straight-Arm_Pulldown': { id: 'straight_arm_pulldown' },
  'Rope_Straight-Arm_Pulldown': { id: 'straight_arm_pulldown', aliases: ['Rope Straight-Arm Pulldown'] },
  Seated_Cable_Rows: { id: 'seated_cable_row', aliases: ['Seated Cable Rows'] },
  Bent_Over_Barbell_Row: { id: 'barbell_row' },
  'One-Arm_Dumbbell_Row': { id: 'dumbbell_row' },
  Dumbbell_Incline_Row: { id: 'chest_supported_row' },
  'T-Bar_Row_with_Handle': { id: 't_bar_row' },
  Inverted_Row: { id: 'inverted_row' },
  Face_Pull: { id: 'face_pull' },
  Hyperextensions_Back_Extensions: { id: 'hyperextension', aliases: ['Back Extensions', 'Hyperextensions'] },
  Barbell_Deadlift: { id: 'deadlift' },
  Barbell_Shrug: { id: 'barbell_shrug' },
  Standing_Military_Press: { id: 'overhead_press' },
  Barbell_Shoulder_Press: { id: 'overhead_press' },
  Dumbbell_Shoulder_Press: { id: 'seated_dumbbell_shoulder_press' },
  Seated_Dumbbell_Press: { id: 'seated_dumbbell_shoulder_press', aliases: ['Seated Dumbbell Press'] },
  Leverage_Shoulder_Press: { id: 'shoulder_press_machine', aliases: ['Leverage Shoulder Press'] },
  Machine_Shoulder_Military_Press: { id: 'shoulder_press_machine' },
  Smith_Machine_Overhead_Shoulder_Press: { id: 'smith_machine_shoulder_press' },
  Arnold_Dumbbell_Press: { id: 'arnold_press' },
  Side_Lateral_Raise: { id: 'dumbbell_lateral_raise', aliases: ['Side Lateral Raise'] },
  Front_Dumbbell_Raise: { id: 'dumbbell_front_raise' },
  'Front_Two-Dumbbell_Raise': { id: 'dumbbell_front_raise' },
  Front_Cable_Raise: { id: 'cable_front_raise' },
  Reverse_Machine_Flyes: { id: 'reverse_pec_deck' },
  Reverse_Flyes: { id: 'rear_delt_fly', aliases: ['Reverse Fly', 'Reverse Dumbbell Fly'] },
  Upright_Barbell_Row: { id: 'upright_row' },
  Barbell_Curl: { id: 'barbell_curl', aliases: ['Barbell Curls'] },
  Dumbbell_Bicep_Curl: { id: 'dumbbell_curl', aliases: ['Dumbbell Bicep Curl', 'Dumbbell Curls'] },
  // #851: merged into Dumbbell Curl (alternating is how you do it, not another lift).
  Dumbbell_Alternate_Bicep_Curl: { id: 'dumbbell_curl', aliases: ['Alternating Dumbbell Curl', 'Alternate Dumbbell Curl', 'Alternating Bicep Curl'] },
  Hammer_Curls: { id: 'hammer_curl', aliases: ['Hammer Curls'] },
  Incline_Dumbbell_Curl: { id: 'incline_dumbbell_curl' },
  Preacher_Curl: { id: 'preacher_curl', aliases: ['Barbell Preacher Curl'] },
  Machine_Preacher_Curls: { id: 'preacher_curl' },
  'EZ-Bar_Curl': { id: 'ez_bar_curl' },
  Standing_Biceps_Cable_Curl: { id: 'cable_curl' },
  Machine_Bicep_Curl: { id: 'bicep_curl_machine' },
  'Cable_Hammer_Curls_-_Rope_Attachment': { id: 'rope_hammer_curl' },
  Concentration_Curls: { id: 'concentration_curl', aliases: ['Concentration Curls'] },
  Triceps_Pushdown: { id: 'tricep_pushdown' },
  'Triceps_Pushdown_-_Rope_Attachment': { id: 'rope_tricep_pushdown' },
  Standing_Dumbbell_Triceps_Extension: { id: 'overhead_tricep_extension' },
  // #851: merged; the original's steps work seated or standing.
  Seated_Triceps_Press: { id: 'overhead_tricep_extension', aliases: ['Seated Overhead Tricep Extension', 'Seated Dumbbell Tricep Extension', 'Seated Triceps Press'] },
  'EZ-Bar_Skullcrusher': { id: 'skull_crusher', aliases: ['Skullcrusher', 'Skull Crushers'] },
  Lying_Triceps_Press: { id: 'skull_crusher', aliases: ['Lying Triceps Press'] },
  'Close-Grip_Barbell_Bench_Press': { id: 'close_grip_bench_press' },
  'Dips_-_Triceps_Version': { id: 'tricep_dip' },
  Parallel_Bar_Dip: { id: 'tricep_dip' },
  Bench_Dips: { id: 'bench_dip' },
  Machine_Triceps_Extension: { id: 'tricep_extension_machine' },
  Dip_Machine: { id: 'seated_dip_machine' },
  'Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench': { id: 'wrist_curl' },
  // #851: merged; Wrist Curl already covers the barbell.
  'Seated_Palm-Up_Barbell_Wrist_Curl': { id: 'wrist_curl', aliases: ['Barbell Wrist Curl'] },
  Plank: { id: 'plank' },
  Side_Bridge: { id: 'side_plank' },
  Crunches: { id: 'crunch', aliases: ['Crunches'] },
  'Sit-Up': { id: 'sit_up' },
  Reverse_Crunch: { id: 'reverse_crunch' },
  Flat_Bench_Lying_Leg_Raise: { id: 'lying_leg_raise' },
  Hanging_Leg_Raise: { id: 'hanging_leg_raise', aliases: ['Hanging Leg Raises'] },
  Knee_Hip_Raise_On_Parallel_Bars: { id: 'captains_chair_knee_raise' },
  Russian_Twist: { id: 'russian_twist' },
  Cable_Crunch: { id: 'cable_crunch' },
  Rope_Crunch: { id: 'cable_crunch' },
  Ab_Crunch_Machine: { id: 'ab_crunch_machine' },
  Ab_Roller: { id: 'ab_wheel_rollout' },
  Dead_Bug: { id: 'dead_bug' },
  Pallof_Press: { id: 'pallof_press' },
  Air_Bike: { id: 'bicycle_crunch' },
  Barbell_Hip_Thrust: { id: 'barbell_hip_thrust', aliases: ['Hip Thrusts'] },
  Butt_Lift_Bridge: { id: 'glute_bridge', aliases: ['Glute Bridges'] },
  Single_Leg_Glute_Bridge: { id: 'single_leg_glute_bridge' },
  'One-Legged_Cable_Kickback': { id: 'cable_glute_kickback' },
  Glute_Kickback: { id: 'donkey_kick' },
  Thigh_Abductor: { id: 'hip_abductor_machine', aliases: ['Thigh Abductor'] },
  Monster_Walk: { id: 'banded_lateral_walk' },
  Pull_Through: { id: 'cable_pull_through' },
  'One-Arm_Kettlebell_Swings': { id: 'kettlebell_swing', aliases: ['Single-Arm Kettlebell Swing'] },
  Barbell_Squat: { id: 'barbell_back_squat', aliases: ['Barbell Squats', 'Squats'] },
  Barbell_Full_Squat: { id: 'barbell_back_squat' },
  Front_Barbell_Squat: { id: 'front_squat' },
  Front_Squat_Clean_Grip: { id: 'front_squat' },
  Goblet_Squat: { id: 'goblet_squat' },
  Smith_Machine_Squat: { id: 'smith_machine_squat' },
  Leg_Press: { id: 'leg_press' },
  Hack_Squat: { id: 'hack_squat' },
  Bodyweight_Squat: { id: 'bodyweight_squat' },
  Bodyweight_Walking_Lunge: { id: 'walking_lunge' },
  Dumbbell_Lunges: { id: 'lunge', aliases: ['Dumbbell Lunge', 'Lunges'] },
  Dumbbell_Rear_Lunge: { id: 'reverse_lunge', aliases: ['Dumbbell Reverse Lunge'] },
  Dumbbell_Step_Ups: { id: 'step_up', aliases: ['Step-Ups'] },
  Leg_Extensions: { id: 'leg_extension' },
  Seated_Leg_Curl: { id: 'seated_leg_curl' },
  Lying_Leg_Curls: { id: 'lying_leg_curl', aliases: ['Lying Leg Curls'] },
  Romanian_Deadlift: { id: 'romanian_deadlift' },
  Sumo_Deadlift: { id: 'sumo_deadlift' },
  Trap_Bar_Deadlift: { id: 'trap_bar_deadlift', aliases: ['Hex Bar Deadlift'] },
  Thigh_Adductor: { id: 'hip_adductor_machine', aliases: ['Thigh Adductor'] },
  Standing_Calf_Raises: { id: 'calf_raise_machine' },
  Seated_Calf_Raise: { id: 'seated_calf_raise' },
  Good_Morning: { id: 'good_morning', aliases: ['Good Mornings'] },
  Front_Box_Jump: { id: 'box_jump' },
  Running_Treadmill: { id: 'treadmill' },
  Jogging_Treadmill: { id: 'treadmill' },
  Walking_Treadmill: { id: 'treadmill' },
  Trail_Running_Walking: { id: 'outdoor_run', aliases: ['Trail Running'] },
  Bicycling_Stationary: { id: 'stationary_bike' },
  Recumbent_Bike: { id: 'recumbent_bike' },
  Bicycling: { id: 'outdoor_cycling' },
  Stairmaster: { id: 'stair_stepper' },
  Step_Mill: { id: 'stair_stepper', aliases: ['Step Mill', 'StepMill'] },
  Elliptical_Trainer: { id: 'elliptical' },
  Rowing_Stationary: { id: 'rowing_machine' },
  Rope_Jumping: { id: 'jump_rope' },
  Battling_Ropes: { id: 'battle_ropes' },
  High_Cable_Curls: { id: 'cable_curl' },
  Alternate_Incline_Dumbbell_Curl: { id: 'incline_dumbbell_curl' },
  Alternate_Hammer_Curl: { id: 'hammer_curl', aliases: ['Alternating Hammer Curl'] },
  'Standing_Low-Pulley_Deltoid_Raise': { id: 'cable_lateral_raise' },
  'Bent_Over_Two-Arm_Long_Bar_Row': { id: 't_bar_row' },
  Box_Jump_Multiple_Response: { id: 'box_jump' },
}

// Not imported: the importer had no confident mapping, and a guess would put
// them in the wrong swap target or the wrong muscle group. A second pass can
// add them with a movement chosen on purpose.
export const REVIEW = {
  External_Rotation: 'rotator cuff work; no movement fits (rear_delt would offer face pulls as a swap)',
  External_Rotation_with_Cable: 'rotator cuff work; no movement fits',
  External_Rotation_with_Band: 'rotator cuff work; no movement fits',
  Cable_Internal_Rotation: 'rotator cuff work; no movement fits',
  Dumbbell_Scaption: 'between a front and a lateral raise; either target would be a guess',
  'Kettlebell_Turkish_Get-Up_Squat_style': 'full-body; no single muscle group or movement',
  'Kettlebell_Turkish_Get-Up_Lunge_style': 'full-body; no single muscle group or movement',
  Clean_and_Jerk: 'two lifts in one (a hinge and a press); no single movement',
  Kettlebell_Thruster: 'a squat and a press in one; no single movement',
  Tire_Flip: 'strongman; full-body, no single movement',
  'One-Arm_Medicine_Ball_Slam': 'conditioning lift logged by ball weight; cardio entries are timed',
  Overhead_Slam: 'conditioning lift logged by ball weight; cardio entries are timed',
  Plate_Pinch: 'grip hold; would need a timed hold with a weight, which entries can not track yet',
}

// [source id, our name, how-to steps (3 to 5, our voice), overrides]. The
// importer maps muscle groups, equipment, load type, and movement from the
// source; set them here only where the mapping is wrong or missing.
export const PICKS = [
  // Chest
  ['Decline_Barbell_Bench_Press', 'Decline Barbell Bench Press', [
    'Hook your legs under the pads of a decline bench and lie back with your eyes under the bar.',
    'Lift the bar off the rack with a grip a little wider than your shoulders.',
    'Lower it to your lower chest, then press it back up until your arms are straight.',
  ], { aliases: ['Decline Bench Press', 'Decline Bench'], equipment: 'Barbell + decline bench' }],
  ['Decline_Dumbbell_Bench_Press', 'Decline Dumbbell Bench Press', [
    'Hook your legs under the pads of a decline bench and lie back with a dumbbell in each hand.',
    'Start with the dumbbells over your chest, arms straight.',
    'Lower them to the sides of your lower chest, then press them back up.',
  ], { aliases: ['Decline Dumbbell Press'], equipment: 'Dumbbells + decline bench' }],
  ['Wide-Grip_Barbell_Bench_Press', 'Wide-Grip Bench Press', [
    'Lie on a flat bench with your eyes under the bar and your feet flat.',
    'Grip the bar well outside your shoulders and lift it off the rack.',
    'Lower it to your mid chest, then press it back up.',
  ], { equipment: 'Barbell + bench' }],
  ['Dumbbell_Bench_Press_with_Neutral_Grip', 'Neutral-Grip Dumbbell Bench Press', [
    'Lie on a flat bench holding the dumbbells over your chest with your palms facing each other.',
    'Lower them to the sides of your chest, keeping your elbows close to your body.',
    'Press them back up until your arms are straight.',
  ], { aliases: ['Hammer Grip Dumbbell Press', 'Neutral-Grip Dumbbell Press'], equipment: 'Dumbbells + bench' }],
  ['Hammer_Grip_Incline_DB_Bench_Press', 'Neutral-Grip Incline Dumbbell Press', [
    'Set a bench to a slight incline and lie back with the dumbbells over your chest, palms facing each other.',
    'Lower them to the sides of your upper chest, elbows close to your body.',
    'Press them back up until your arms are straight.',
  ], { aliases: ['Hammer Grip Incline Dumbbell Press'], equipment: 'Dumbbells + incline bench' }],
  ['One_Arm_Dumbbell_Bench_Press', 'Single-Arm Dumbbell Bench Press', [
    'Lie on a flat bench with one dumbbell held over your chest. Hold the bench with your free hand.',
    'Lower the dumbbell to the side of your chest without letting your body twist.',
    'Press it back up, finish your reps, then switch arms.',
  ], { aliases: ['One-Arm Dumbbell Bench Press'], equipment: 'Dumbbell + bench' }],
  ['Dumbbell_Floor_Press', 'Dumbbell Floor Press', [
    'Lie on the floor with your knees bent and a dumbbell in each hand over your chest.',
    'Lower the dumbbells until your upper arms touch the floor.',
    'Pause, then press them back up.',
  ], { muscleGroup: 'chest', alsoWorks: ['arms', 'shoulders'], equipment: 'Dumbbells' }],
  ['Floor_Press', 'Barbell Floor Press', [
    'Lie on the floor under a bar set low in a rack, knees bent.',
    'Lift the bar off with a grip a little wider than your shoulders.',
    'Lower it until your upper arms touch the floor, pause, then press it back up.',
  ], { aliases: ['Floor Press', 'Floor Presses'], muscleGroup: 'chest', alsoWorks: ['arms', 'shoulders'], equipment: 'Barbell + rack' }],
  ['Decline_Dumbbell_Flyes', 'Decline Dumbbell Fly', [
    'Lie on a decline bench with the dumbbells over your chest, palms facing each other.',
    'With a slight bend in your elbows, open your arms wide until you feel a stretch in your chest.',
    'Squeeze them back together over your chest.',
  ], { aliases: ['Decline Fly'], equipment: 'Dumbbells + decline bench' }],
  ['Flat_Bench_Cable_Flyes', 'Flat Bench Cable Fly', [
    'Put a flat bench between two low pulleys and lie back holding a handle in each hand.',
    'Start with your hands over your chest and a slight bend in your elbows.',
    'Open your arms wide until you feel a stretch, then bring the handles back together.',
  ], { aliases: ['Lying Cable Fly'], equipment: 'Cable machine + bench' }],
  ['Incline_Cable_Flye', 'Incline Cable Fly', [
    'Put an incline bench between two low pulleys and lie back holding a handle in each hand.',
    'Start with your hands over your upper chest and a slight bend in your elbows.',
    'Open your arms wide until you feel a stretch, then bring the handles back together.',
  ], { muscleGroup: 'chest', equipment: 'Cable machine + incline bench' }],
  ['Single-Arm_Cable_Crossover', 'Single-Arm Cable Fly', [
    'Stand side-on to a high pulley and hold the handle with the arm nearest it.',
    'Keeping a slight bend in your elbow, sweep the handle down and across your body.',
    'Let it back slowly until you feel a stretch, finish your reps, then switch sides.',
  ], { aliases: ['Single-Arm Cable Crossover'] }],
  ['Cable_Chest_Press', 'Cable Chest Press', [
    'Set both pulleys at chest height and stand between them holding a handle in each hand.',
    'Step forward into a split stance with the handles at your chest.',
    'Press them straight out in front of you, then bring them back slowly.',
  ], { aliases: ['Standing Cable Chest Press', 'Standing Cable Press'] }],
  ['Incline_Cable_Chest_Press', 'Incline Cable Chest Press', [
    'Put an incline bench between two low pulleys and lie back holding a handle in each hand.',
    'Start with the handles at your upper chest.',
    'Press them up over your chest, then lower them slowly.',
  ], { equipment: 'Cable machine + incline bench' }],
  ['Leverage_Decline_Chest_Press', 'Decline Chest Press Machine', [
    'Set the seat so the handles line up with your lower chest.',
    'Grip the handles and press them forward until your arms are straight.',
    'Let them back slowly until you feel a stretch in your chest.',
  ], { aliases: ['Decline Machine Press', 'Leverage Decline Chest Press', 'Decline Chest Press', 'Iso-Lateral Decline Press'] }],
  ['Smith_Machine_Incline_Bench_Press', 'Smith Machine Incline Bench Press', [
    'Set an incline bench under the Smith bar so it comes down to your upper chest.',
    'Grip the bar a little wider than your shoulders and twist it off the hooks.',
    'Lower it to your upper chest, then press it back up.',
  ], { aliases: ['Smith Incline Press', 'Smith Machine Incline Press'], equipment: 'Smith machine + incline bench' }],
  ['Smith_Machine_Decline_Press', 'Smith Machine Decline Bench Press', [
    'Set a decline bench under the Smith bar so it comes down to your lower chest.',
    'Grip the bar a little wider than your shoulders and twist it off the hooks.',
    'Lower it to your lower chest, then press it back up.',
  ], { aliases: ['Smith Decline Press', 'Decline Smith Press'], equipment: 'Smith machine + decline bench' }],
  ['Push-Up_Wide', 'Wide Push-Up', [
    'Start in a push-up position with your hands well outside your shoulders.',
    'Keep your body in a straight line and lower your chest to the floor.',
    'Push back up until your arms are straight.',
  ], { aliases: ['Wide-Grip Push-Up', 'Wide Pushup'], alsoWorks: ['shoulders', 'arms'] }],
  ['Plyo_Push-up', 'Clap Push-Up', [
    'Start in a push-up position with your body in a straight line.',
    'Lower your chest, then push up hard enough that your hands leave the floor.',
    'Clap if you can, land with soft elbows, and go straight into the next rep.',
  ], { aliases: ['Plyo Push-Up', 'Plyometric Push-Up', 'Explosive Push-Up'] }],
  ['Suspended_Push-Up', 'Suspension Trainer Push-Up', [
    'Hold the suspension trainer handles and walk your feet back into a push-up position.',
    'Keep your body straight and lower your chest between the handles.',
    'Press back up without letting the straps drift apart.',
  ], { aliases: ['TRX Push-Up', 'Ring Push-Up'], equipment: 'Suspension trainer', equipmentType: 'bodyweight', loadType: 'bodyweight' }],
  ['Svend_Press', 'Svend Press', [
    'Stand tall and squeeze two light plates together between your palms at your chest.',
    'Keep squeezing as you press the plates straight out in front of you.',
    'Pause, then bring them back to your chest.',
  ], { aliases: ['Plate Squeeze Press'], equipment: 'Weight plates', equipmentType: 'other', loadType: 'weight' }],

  // Back
  ['Band_Assisted_Pull-Up', 'Band-Assisted Pull-Up', [
    'Loop a band over the pull-up bar and put a knee or foot in it.',
    'Hang with your hands a little wider than your shoulders.',
    'Pull up until your chin clears the bar, then lower yourself slowly.',
  ], { aliases: ['Banded Pull-Up', 'Band Pull-Up'], equipment: 'Pull-up bar + band', equipmentType: 'bodyweight', loadType: 'bodyweight' }],
  ['Weighted_Pull_Ups', 'Weighted Pull-Up', [
    'Hang a plate or dumbbell from a dip belt, or hold a dumbbell between your feet.',
    'Hang from the bar with your hands a little wider than your shoulders.',
    'Pull up until your chin clears the bar, then lower yourself slowly.',
  ], { aliases: ['Weighted Pullup', 'Weighted Chin-Up'], equipment: 'Pull-up bar + dip belt', equipmentType: 'other', loadType: 'weight' }],
  ['V-Bar_Pullup', 'Neutral-Grip Pull-Up', [
    'Hang from parallel handles or a V-bar with your palms facing each other.',
    'Pull up until your chin clears your hands.',
    'Lower yourself slowly until your arms are straight.',
  ], { aliases: ['Hammer Grip Pull-Up', 'V-Bar Pull-Up', 'Parallel-Grip Pull-Up'], equipment: 'Pull-up bar' }],
  ['Muscle_Up', 'Muscle-Up', [
    'Hang from a bar or rings with a firm grip.',
    'Pull hard to your chest, then lean forward and turn your wrists over the bar.',
    'Press up until your arms are straight above it, then lower yourself back to a hang.',
  ], { aliases: ['Bar Muscle-Up', 'Ring Muscle-Up'], equipment: 'Pull-up bar or rings', equipmentType: 'bodyweight', loadType: 'bodyweight' }],
  ['Rope_Climb', 'Rope Climb', [
    'Grab the rope overhead and wrap it around one leg, pinching it between your feet.',
    'Stand up on your feet, then reach higher with your hands.',
    'Repeat to the top and climb down the same way, hand under hand.',
  ], { aliases: ['Climbing Rope'], equipment: 'Climbing rope', equipmentType: 'bodyweight', loadType: 'bodyweight' }],
  ['Underhand_Cable_Pulldowns', 'Reverse-Grip Lat Pulldown', [
    'Sit at the pulldown with your knees under the pads.',
    'Grip the bar with your palms facing you, about shoulder width apart.',
    'Pull it to your upper chest, then let it back up slowly.',
  ], { aliases: ['Underhand Lat Pulldown', 'Supinated Pulldown', 'Reverse-Grip Pulldown'] }],
  ['One_Arm_Lat_Pulldown', 'Single-Arm Lat Pulldown', [
    'Attach a single handle to the high pulley and sit or kneel facing it.',
    'Pull the handle down to the side of your chest, elbow tucked to your side.',
    'Let it back up slowly until your arm is straight, then switch sides.',
  ], { aliases: ['One-Arm Lat Pulldown', 'Single-Arm Pulldown'] }],
  ['Bent_Over_Two-Dumbbell_Row', 'Bent-Over Dumbbell Row', [
    'Hold a dumbbell in each hand and hinge forward until your back is nearly flat.',
    'Row the dumbbells to your sides, squeezing your shoulder blades together.',
    'Lower them slowly until your arms are straight.',
  ], { aliases: ['Two-Arm Dumbbell Row', 'Dumbbell Bent-Over Row', 'DB Bent-Over Row'] }],
  ['Reverse_Grip_Bent-Over_Rows', 'Reverse-Grip Barbell Row', [
    'Hold the bar with your palms facing forward, a little wider than your hips.',
    'Hinge forward until your back is nearly flat, knees soft.',
    'Row the bar to your lower stomach, then lower it slowly.',
  ], { aliases: ['Underhand Barbell Row', 'Yates Row'] }],
  ['Bent_Over_One-Arm_Long_Bar_Row', 'Single-Arm Landmine Row', [
    'Load one end of a bar set in a landmine or wedged into a corner.',
    'Stand beside the plates, hinge forward, and grip the bar just behind them.',
    'Row it to your side, then lower it slowly. Switch sides after your reps.',
  ], { aliases: ['One-Arm Landmine Row', 'Meadows Row'], equipment: 'Barbell + landmine' }],
  ['Lying_T-Bar_Row', 'Chest-Supported T-Bar Row', [
    'Lie face down on the machine pad with your upper chest at the top.',
    'Grip the handles and row them up toward your chest.',
    'Squeeze your shoulder blades together, then lower slowly.',
  ], { aliases: ['Lying T-Bar Row', 'T-Bar Row Machine'] }],
  ['Leverage_High_Row', 'High Row Machine', [
    'Set the seat so you can just reach the handles above you, knees under the pad.',
    'Pull the handles down and back toward your chest.',
    'Squeeze your shoulder blades together, then let them back up slowly.',
  ], { aliases: ['High Row', 'Machine High Row', 'Leverage High Row', 'Hammer Strength High Row'] }],
  ['Leverage_Iso_Row', 'Iso-Lateral Row Machine', [
    'Set the seat so the handles are at chest height and lean into the chest pad.',
    'Row the handles toward your body, one arm at a time or both together.',
    'Squeeze your shoulder blades together, then let them forward slowly.',
  ], { aliases: ['Iso Row', 'Leverage Iso Row', 'Iso-Lateral Row', 'Hammer Strength Row', 'Plate-Loaded Row'] }],
  ['Seated_One-arm_Cable_Pulley_Rows', 'Single-Arm Seated Cable Row', [
    'Sit at a low pulley with a single handle and your feet on the platform.',
    'Row the handle to your side, keeping your chest up and your body still.',
    'Let it forward slowly until your arm is straight, then switch sides.',
  ], { aliases: ['One-Arm Cable Row', 'Single-Arm Cable Row'] }],
  ['Smith_Machine_Bent_Over_Row', 'Smith Machine Row', [
    'Set the Smith bar at about knee height and grip it a little wider than your hips.',
    'Twist it off the hooks and hinge forward until your back is nearly flat.',
    'Row the bar to your lower stomach, then lower it slowly.',
  ], { aliases: ['Smith Bent-Over Row', 'Smith Machine Bent-Over Row'] }],
  ['One-Arm_Kettlebell_Row', 'Kettlebell Row', [
    'Hinge forward with one hand on a bench and a kettlebell in the other.',
    'Row the kettlebell to your hip, elbow close to your side.',
    'Lower it slowly, finish your reps, then switch sides.',
  ], { aliases: ['Single-Arm Kettlebell Row', 'One-Arm Kettlebell Row', 'KB Row'] }],
  ['Alternating_Renegade_Row', 'Renegade Row', [
    'Start in a push-up position holding a dumbbell or kettlebell in each hand.',
    'Row one weight to your side while you keep your hips square to the floor.',
    'Lower it and row the other side.',
  ], { aliases: ['Plank Row'], equipment: 'Dumbbells or kettlebells', equipmentType: 'dumbbell' }],
  ['Suspended_Row', 'Suspension Trainer Row', [
    'Hold the suspension trainer handles and lean back with your arms straight and body in a line.',
    'Pull your chest up to the handles, squeezing your shoulder blades together.',
    'Lower yourself slowly. Walk your feet forward to make it harder.',
  ], { aliases: ['TRX Row', 'Ring Row'], equipment: 'Suspension trainer', equipmentType: 'bodyweight', loadType: 'bodyweight' }],
  ['Bent-Arm_Barbell_Pullover', 'Barbell Pullover', [
    'Lie on a flat bench holding a barbell over your chest with your elbows slightly bent.',
    'Lower it back over your head until you feel a stretch in your lats.',
    'Pull it back over your chest the same way.',
  ], { muscleGroup: 'back', alsoWorks: ['chest', 'arms'], movement: 'vertical_pull', equipment: 'Barbell + bench' }],
  ['Straight-Arm_Dumbbell_Pullover', 'Dumbbell Pullover', [
    'Lie across or along a bench holding one dumbbell over your chest with both hands.',
    'With your arms nearly straight, lower it back over your head until you feel a stretch.',
    'Pull it back over your chest the same way.',
  ], { aliases: ['DB Pullover'], muscleGroup: 'back', alsoWorks: ['chest', 'arms'], movement: 'vertical_pull', equipment: 'Dumbbell + bench' }],
  ['Rack_Pulls', 'Rack Pull', [
    'Set the bar in a rack at about knee height.',
    'Grip it just outside your legs and brace with a flat back.',
    'Stand up tall by driving your hips forward, then lower the bar back to the pins.',
  ], { aliases: ['Rack Pulls', 'Block Pull'], equipment: 'Barbell + rack' }],
  ['Deficit_Deadlift', 'Deficit Deadlift', [
    'Stand on a low plate or platform with the bar over your midfoot.',
    'Grip the bar just outside your legs and brace with a flat back.',
    'Stand up with the bar close to your legs, then lower it to the floor.',
  ], { equipment: 'Barbell + platform' }],
  ['Reverse_Hyperextension', 'Reverse Hyperextension', [
    'Lie face down on the machine or a high bench with your hips at the edge and hold on.',
    'Let your legs hang, then lift them behind you until they line up with your body.',
    'Lower them slowly without swinging.',
  ], { aliases: ['Reverse Hyper'], muscleGroup: 'back', alsoWorks: ['glutes', 'legs'], equipment: 'Reverse hyper machine' }],
  ['Dumbbell_Shrug', 'Dumbbell Shrug', [
    'Stand tall with a dumbbell in each hand at your sides.',
    'Lift your shoulders straight up toward your ears.',
    'Pause, then lower them slowly.',
  ], { aliases: ['Dumbbell Shrugs', 'DB Shrug'] }],
  ['Cable_Shrugs', 'Cable Shrug', [
    'Stand at a low pulley holding a bar or two handles with your arms straight.',
    'Lift your shoulders straight up toward your ears.',
    'Pause, then lower them slowly.',
  ], { aliases: ['Cable Shrugs'] }],
  ['Smith_Machine_Behind_the_Back_Shrug', 'Smith Machine Shrug', [
    'Set the Smith bar at about hip height and hold it with straight arms, in front or behind you.',
    'Twist it off the hooks and lift your shoulders straight up.',
    'Pause, then lower them slowly.',
  ], { aliases: ['Smith Shrug'] }],
  ['Leverage_Shrug', 'Shrug Machine', [
    'Stand or sit in the machine with the pads or handles at your shoulders.',
    'Lift your shoulders straight up toward your ears.',
    'Pause, then lower them slowly.',
  ], { aliases: ['Machine Shrug', 'Leverage Shrug'] }],
  ['Wide-Grip_Pulldown_Behind_The_Neck', 'Behind-the-Neck Lat Pulldown', [
    'Sit at the pulldown with your knees under the pads and a wide grip on the bar.',
    'Lean forward slightly and pull the bar down behind your head to the top of your neck.',
    'Let it back up slowly. Use a light weight and stop if your shoulders complain.',
  ], { aliases: ['Behind-the-Neck Pulldown'] }],
  ['Scapular_Pull-Up', 'Scapular Pull-Up', [
    'Hang from a pull-up bar with your arms straight.',
    'Without bending your elbows, pull your shoulder blades down and together to lift yourself slightly.',
    'Lower back to a full hang slowly.',
  ], { aliases: ['Scap Pull-Up'], muscleGroup: 'back', equipment: 'Pull-up bar', equipmentType: 'bodyweight', loadType: 'bodyweight', movement: 'vertical_pull' }],
  ['Barbell_Shrug_Behind_The_Back', 'Behind-the-Back Barbell Shrug', [
    'Hold a barbell behind your thighs with your palms facing back.',
    'Lift your shoulders straight up toward your ears.',
    'Pause, then lower them slowly.',
  ], { aliases: ['Behind-the-Back Shrug'] }],

  // Shoulders
  ['Seated_Barbell_Military_Press', 'Seated Barbell Shoulder Press', [
    'Sit on an upright bench in a rack with the bar at about shoulder height.',
    'Grip it a little wider than your shoulders and lift it off the rack to your upper chest.',
    'Press it overhead until your arms are straight, then lower it back to your chest.',
  ], { aliases: ['Seated Military Press', 'Seated Overhead Press'], equipment: 'Barbell + bench' }],
  ['Standing_Dumbbell_Press', 'Standing Dumbbell Shoulder Press', [
    'Stand tall with a dumbbell in each hand at shoulder height.',
    'Brace your stomach and press them overhead until your arms are straight.',
    'Lower them back to your shoulders.',
  ], { aliases: ['Standing Dumbbell Press', 'Standing Dumbbell Overhead Press', 'Standing DB Press'] }],
  ['Dumbbell_One-Arm_Shoulder_Press', 'Single-Arm Dumbbell Shoulder Press', [
    'Stand tall with one dumbbell at shoulder height.',
    'Press it overhead without leaning away from it.',
    'Lower it back to your shoulder, finish your reps, then switch sides.',
  ], { aliases: ['One-Arm Dumbbell Shoulder Press', 'Single-Arm Overhead Press'], equipment: 'Dumbbell' }],
  ['Push_Press', 'Push Press', [
    'Hold the bar at your shoulders with a grip just wider than them.',
    'Dip your knees slightly, then drive up through your legs.',
    'Use that drive to press the bar overhead, then lower it back to your shoulders.',
  ], { muscleGroup: 'shoulders', equipment: 'Barbell' }],
  ['Split_Jerk', 'Split Jerk', [
    'Hold the bar at your shoulders with a grip just wider than them.',
    'Dip and drive up, then split your feet front and back as you push under the bar.',
    'Catch it overhead with straight arms, then step your feet back together.',
  ], { muscleGroup: 'shoulders', alsoWorks: ['legs', 'arms'], movement: 'vertical_press' }],
  ['Landmine_Linear_Jammer', 'Landmine Press', [
    'Set one end of a bar in a landmine and hold the other end at your shoulder.',
    'Stand in a split stance and press the bar up and forward until your arm is straight.',
    'Lower it back to your shoulder.',
  ], { aliases: ['Single-Arm Landmine Press', 'Landmine Shoulder Press'], muscleGroup: 'shoulders', equipment: 'Barbell + landmine', movement: 'vertical_press' }],
  ['Cable_Shoulder_Press', 'Cable Shoulder Press', [
    'Sit or stand between two low pulleys with a handle in each hand at shoulder height.',
    'Press the handles overhead until your arms are straight.',
    'Lower them slowly back to your shoulders.',
  ], { aliases: ['Seated Cable Shoulder Press'] }],
  ['Two-Arm_Kettlebell_Military_Press', 'Kettlebell Overhead Press', [
    'Hold a kettlebell in each hand, resting at your shoulders.',
    'Brace your stomach and press them overhead until your arms are straight.',
    'Lower them back to your shoulders.',
  ], { aliases: ['Kettlebell Press', 'Kettlebell Shoulder Press', 'Kettlebell Military Press', 'KB Press'] }],
  ['Handstand_Push-Ups', 'Handstand Push-Up', [
    'Kick up into a handstand with your heels against a wall, hands a little wider than your shoulders.',
    'Lower your head toward the floor under control.',
    'Press back up until your arms are straight.',
  ], { aliases: ['HSPU', 'Wall Handstand Push-Up'], movement: 'vertical_press' }],
  ['Standing_Barbell_Press_Behind_Neck', 'Behind-the-Neck Press', [
    'Rest the bar on your upper back as for a squat, hands a little wider than your shoulders.',
    'Press it straight up until your arms are straight.',
    'Lower it back behind your head to the top of your neck. Use a light weight.',
  ], { aliases: ['Behind-the-Neck Shoulder Press'] }],
  ['Clean_and_Press', 'Clean and Press', [
    'Stand with the bar over your midfoot and grip it just outside your legs.',
    'Pull it up fast and catch it at your shoulders, elbows forward.',
    'Press it overhead, then lower it to your shoulders and back to the floor.',
  ], { alsoWorks: ['legs', 'back'], movement: 'vertical_press' }],
  ['Cuban_Press', 'Cuban Press', [
    'Hold light dumbbells and raise your elbows out to the sides to shoulder height.',
    'Keeping your elbows there, rotate your forearms up until the dumbbells are over your elbows.',
    'Press them overhead, then reverse each step to come back down.',
  ], { movement: 'vertical_press' }],
  ['Kettlebell_Sumo_High_Pull', 'Kettlebell Sumo High Pull', [
    'Stand with your feet wide and hold one kettlebell with both hands between your legs.',
    'Drive up through your legs and pull the kettlebell to your chin, elbows high.',
    'Lower it back down with control.',
  ], { aliases: ['Sumo High Pull'], muscleGroup: 'shoulders', alsoWorks: ['back', 'legs'], movement: 'shrug' }],
  ['Seated_Side_Lateral_Raise', 'Seated Dumbbell Lateral Raise', [
    'Sit at the end of a bench with a dumbbell in each hand at your sides.',
    'With a slight bend in your elbows, raise them out to the sides to shoulder height.',
    'Lower them slowly.',
  ], { aliases: ['Seated Lateral Raise'], equipment: 'Dumbbells + bench' }],
  ['One-Arm_Side_Laterals', 'Single-Arm Dumbbell Lateral Raise', [
    'Stand side-on to a post or bench and hold it with your free hand.',
    'Raise the dumbbell out to the side to shoulder height.',
    'Lower it slowly, finish your reps, then switch sides.',
  ], { aliases: ['One-Arm Lateral Raise', 'Single-Arm Lateral Raise'], equipment: 'Dumbbell' }],
  ['Lateral_Raise_-_With_Bands', 'Band Lateral Raise', [
    'Stand on the middle of a band and hold an end in each hand at your sides.',
    'Raise your arms out to the sides to shoulder height.',
    'Lower them slowly.',
  ], { aliases: ['Banded Lateral Raise', 'Resistance Band Lateral Raise'] }],
  ['Front_Plate_Raise', 'Plate Front Raise', [
    'Hold a weight plate by its sides in front of your thighs.',
    'With your arms nearly straight, raise it to eye level.',
    'Lower it slowly.',
  ], { aliases: ['Plate Raise'], equipment: 'Weight plate', equipmentType: 'other', loadType: 'weight' }],
  ['Standing_Front_Barbell_Raise_Over_Head', 'Barbell Front Raise', [
    'Hold a barbell in front of your thighs with your palms facing you.',
    'With your arms nearly straight, raise it to eye level.',
    'Lower it slowly.',
  ], {}],
  ['Cable_Rear_Delt_Fly', 'Cable Rear Delt Fly', [
    'Set two pulleys at shoulder height, cross the cables, and hold a handle in each hand.',
    'With a slight bend in your elbows, pull your arms out wide and back.',
    'Let them back slowly until your hands cross again.',
  ], { aliases: ['Cable Reverse Fly', 'Reverse Cable Fly'] }],
  ['Seated_Bent-Over_Rear_Delt_Raise', 'Seated Rear Delt Raise', [
    'Sit at the end of a bench and lean forward over your knees with a dumbbell in each hand.',
    'Raise the dumbbells out to the sides, leading with your elbows.',
    'Lower them slowly.',
  ], { aliases: ['Seated Bent-Over Rear Delt Raise', 'Seated Reverse Fly'], equipment: 'Dumbbells + bench' }],
  ['Barbell_Rear_Delt_Row', 'Barbell Rear Delt Row', [
    'Hold a barbell with a wide grip and hinge forward until your back is nearly flat.',
    'Row the bar to your upper chest with your elbows flared out wide.',
    'Lower it slowly.',
  ], { aliases: ['Wide-Grip Barbell Row'], movement: 'rear_delt' }],
  ['Cable_Rope_Rear-Delt_Rows', 'Cable Rear Delt Row', [
    'Hold a rope at a pulley set at chest height and step back until your arms are straight.',
    'Row the rope toward your face with your elbows high and wide.',
    'Let it forward slowly.',
  ], { aliases: ['Rope Rear Delt Row'], movement: 'rear_delt' }],
  ['Band_Pull_Apart', 'Band Pull-Apart', [
    'Hold a band in front of your chest with your arms straight and hands shoulder width apart.',
    'Pull your hands apart until the band touches your chest.',
    'Let it back slowly.',
  ], { aliases: ['Band Pull Apart', 'Banded Pull-Apart'] }],
  ['Smith_Machine_Upright_Row', 'Smith Machine Upright Row', [
    'Set the Smith bar at about hip height and grip it about shoulder width apart.',
    'Twist it off the hooks and pull it up your body to chest height, elbows leading.',
    'Lower it slowly.',
  ], { aliases: ['Smith Upright Row'], muscleGroup: 'shoulders', alsoWorks: ['back', 'arms'] }],
  ['Upright_Cable_Row', 'Cable Upright Row', [
    'Stand at a low pulley holding a straight bar with your hands about shoulder width apart.',
    'Pull the bar up your body to chest height, elbows leading.',
    'Lower it slowly.',
  ], { muscleGroup: 'shoulders', alsoWorks: ['back', 'arms'] }],
  ['Standing_Dumbbell_Upright_Row', 'Dumbbell Upright Row', [
    'Stand tall with a dumbbell in each hand in front of your thighs.',
    'Pull them up your body to chest height, elbows leading.',
    'Lower them slowly.',
  ], { muscleGroup: 'shoulders', alsoWorks: ['back', 'arms'] }],

  // Arms
  ['Seated_Dumbbell_Curl', 'Seated Dumbbell Curl', [
    'Sit at the end of a bench with a dumbbell in each hand at your sides.',
    'Curl them up to your shoulders, keeping your elbows still.',
    'Lower them slowly.',
  ], { equipment: 'Dumbbells + bench' }],
  ['Cross_Body_Hammer_Curl', 'Cross-Body Hammer Curl', [
    'Stand tall with a dumbbell in each hand, palms facing your body.',
    'Curl one dumbbell up and across your body toward the opposite shoulder.',
    'Lower it slowly, then curl the other.',
  ], { aliases: ['Cross-Body Curl'] }],
  ['Incline_Hammer_Curls', 'Incline Hammer Curl', [
    'Lie back on an incline bench with a dumbbell in each hand, palms facing in.',
    'Curl them up to your shoulders, keeping your upper arms still.',
    'Lower them slowly until your arms are straight.',
  ], { equipment: 'Dumbbells + incline bench' }],
  ['Spider_Curl', 'Spider Curl', [
    'Lie chest down on an incline bench with your arms hanging straight down.',
    'Curl the weight up toward your shoulders without moving your upper arms.',
    'Lower it slowly.',
  ], { aliases: ['Spider Curls'], equipment: 'EZ-bar or dumbbells + incline bench' }],
  ['Drag_Curl', 'Drag Curl', [
    'Hold a barbell in front of your thighs with your palms facing forward.',
    'Curl it up while you drag it along your body, letting your elbows move back.',
    'Lower it the same way.',
  ], { aliases: ['Barbell Drag Curl'] }],
  ['Zottman_Curl', 'Zottman Curl', [
    'Stand tall with a dumbbell in each hand, palms facing forward.',
    'Curl them up, then turn your palms down at the top.',
    'Lower them slowly palms down, and turn your palms forward again at the bottom.',
  ], {}],
  ['Close-Grip_Standing_Barbell_Curl', 'Close-Grip Barbell Curl', [
    'Hold a barbell with your hands a little narrower than your shoulders, palms facing forward.',
    'Curl it up to your shoulders, keeping your elbows at your sides.',
    'Lower it slowly.',
  ], {}],
  ['Reverse_Barbell_Curl', 'Reverse Barbell Curl', [
    'Hold a barbell in front of your thighs with your palms facing down.',
    'Curl it up to your shoulders, keeping your elbows at your sides.',
    'Lower it slowly.',
  ], { aliases: ['Reverse Curl', 'Reverse Grip Curl'] }],
  ['Reverse_Cable_Curl', 'Reverse Cable Curl', [
    'Stand at a low pulley holding a straight bar with your palms facing down.',
    'Curl it up to your shoulders, keeping your elbows at your sides.',
    'Lower it slowly.',
  ], {}],
  ['Standing_Dumbbell_Reverse_Curl', 'Reverse Dumbbell Curl', [
    'Stand tall with a dumbbell in each hand, palms facing back.',
    'Curl them up to your shoulders, keeping your palms down.',
    'Lower them slowly.',
  ], {}],
  ['Wide-Grip_Standing_Barbell_Curl', 'Wide-Grip Barbell Curl', [
    'Hold a barbell with your hands wider than your shoulders, palms facing forward.',
    'Curl it up to your shoulders, keeping your elbows at your sides.',
    'Lower it slowly.',
  ], {}],
  ['Close-Grip_EZ_Bar_Curl', 'Close-Grip EZ-Bar Curl', [
    'Hold an EZ-bar on its inner grips, palms facing forward.',
    'Curl it up to your shoulders, keeping your elbows at your sides.',
    'Lower it slowly.',
  ], { equipment: 'EZ-curl bar' }],
  ['One_Arm_Dumbbell_Preacher_Curl', 'Dumbbell Preacher Curl', [
    'Sit at a preacher bench with the back of one arm flat on the pad, dumbbell in hand.',
    'Curl it up toward your shoulder.',
    'Lower it slowly until your arm is nearly straight, then switch arms.',
  ], { aliases: ['Single-Arm Preacher Curl', 'One-Arm Preacher Curl'], equipment: 'Dumbbell + preacher bench' }],
  ['Preacher_Hammer_Dumbbell_Curl', 'Hammer Preacher Curl', [
    'Sit at a preacher bench with the backs of your arms on the pad, palms facing in.',
    'Curl the dumbbells up toward your shoulders.',
    'Lower them slowly until your arms are nearly straight.',
  ], { equipment: 'Dumbbells + preacher bench' }],
  ['Cable_Preacher_Curl', 'Cable Preacher Curl', [
    'Put a preacher bench in front of a low pulley and hold a straight bar.',
    'With the backs of your arms on the pad, curl the bar toward your shoulders.',
    'Lower it slowly until your arms are nearly straight.',
  ], { equipment: 'Cable machine + preacher bench' }],
  ['Overhead_Cable_Curl', 'Overhead Cable Curl', [
    'Stand between two high pulleys with a handle in each hand, arms out to the sides.',
    'Curl the handles in toward your ears, keeping your upper arms still.',
    'Let them back out slowly.',
  ], { aliases: ['High Cable Curl', 'Double Biceps Cable Curl'] }],
  ['Standing_One-Arm_Cable_Curl', 'Single-Arm Cable Curl', [
    'Stand at a low pulley holding a single handle, palm facing forward.',
    'Curl it up to your shoulder, keeping your elbow at your side.',
    'Lower it slowly, then switch arms.',
  ], { aliases: ['One-Arm Cable Curl'] }],
  ['Triceps_Pushdown_-_V-Bar_Attachment', 'V-Bar Tricep Pushdown', [
    'Stand at a high pulley with a V-bar, elbows tucked at your sides.',
    'Push the bar down until your arms are straight.',
    'Let it back up slowly to about chest height.',
  ], { aliases: ['V-Bar Pushdown'] }],
  ['Reverse_Grip_Triceps_Pushdown', 'Reverse-Grip Tricep Pushdown', [
    'Stand at a high pulley holding a straight bar with your palms facing up.',
    'Keeping your elbows at your sides, push the bar down until your arms are straight.',
    'Let it back up slowly.',
  ], { aliases: ['Underhand Pushdown', 'Reverse-Grip Pushdown'] }],
  ['Cable_One_Arm_Tricep_Extension', 'Single-Arm Tricep Pushdown', [
    'Stand at a high pulley holding a single handle, elbow at your side.',
    'Push the handle down until your arm is straight.',
    'Let it back up slowly, then switch arms.',
  ], { aliases: ['One-Arm Pushdown', 'Single-Arm Pushdown'] }],
  ['Cable_Rope_Overhead_Triceps_Extension', 'Cable Overhead Tricep Extension', [
    'Hold a rope at a low or middle pulley and turn away from it with the rope behind your head.',
    'Keeping your elbows by your head, straighten your arms overhead.',
    'Let the rope back behind your head slowly.',
  ], { aliases: ['Rope Overhead Extension', 'Overhead Rope Extension', 'Cable Overhead Extension'] }],
  ['Tricep_Dumbbell_Kickback', 'Dumbbell Tricep Kickback', [
    'Hinge forward with a dumbbell in one hand and your upper arm tucked to your side.',
    'Straighten your arm back until it lines up with your body.',
    'Lower the dumbbell slowly. Switch arms after your reps.',
  ], { aliases: ['Tricep Kickback', 'Triceps Kickback', 'DB Kickback', 'Tricep Kickbacks'] }],
  ['Lying_Dumbbell_Tricep_Extension', 'Dumbbell Skull Crusher', [
    'Lie on a flat bench holding the dumbbells over your chest, palms facing in.',
    'Bend only at the elbows to lower them beside your head.',
    'Straighten your arms to lift them back up.',
  ], { aliases: ['Lying Dumbbell Tricep Extension', 'Dumbbell Lying Triceps Extension', 'DB Skull Crusher'], alsoWorks: [], equipment: 'Dumbbells + bench' }],
  ['Decline_EZ_Bar_Triceps_Extension', 'Decline Skull Crusher', [
    'Lie on a decline bench holding an EZ-bar over your chest with a close grip.',
    'Bend only at the elbows to lower the bar toward your forehead.',
    'Straighten your arms to lift it back up.',
  ], { aliases: ['Decline Triceps Extension'], equipment: 'EZ-curl bar + decline bench' }],
  ['Incline_Barbell_Triceps_Extension', 'Incline Skull Crusher', [
    'Lie back on an incline bench holding a bar over your head with a close grip.',
    'Bend only at the elbows to lower the bar behind your head.',
    'Straighten your arms to lift it back up.',
  ], { aliases: ['Incline Triceps Extension'], equipment: 'Barbell or EZ-bar + incline bench' }],
  ['Standing_One-Arm_Dumbbell_Triceps_Extension', 'Single-Arm Overhead Tricep Extension', [
    'Hold one dumbbell overhead with your arm straight.',
    'Keeping your upper arm by your head, lower the dumbbell behind your head.',
    'Straighten your arm to lift it back up, then switch arms.',
  ], { aliases: ['One-Arm Overhead Extension'], alsoWorks: [], equipment: 'Dumbbell' }],
  ['Standing_Overhead_Barbell_Triceps_Extension', 'Barbell Overhead Tricep Extension', [
    'Hold a barbell or EZ-bar overhead with your hands about shoulder width apart.',
    'Keeping your elbows pointed up, lower the bar behind your head.',
    'Straighten your arms to lift it back up.',
  ], { aliases: ['French Press', 'Overhead Barbell Extension'] }],
  ['JM_Press', 'JM Press', [
    'Lie on a flat bench with a close grip on the bar over your chest.',
    'Lower it toward your chin, letting your elbows travel forward.',
    'Press it back up with your triceps.',
  ], { equipment: 'Barbell + bench' }],
  ['Tate_Press', 'Tate Press', [
    'Lie on a flat bench holding the dumbbells over your chest, ends touching.',
    'Bend your elbows out to the sides to lower the dumbbells to your chest.',
    'Press them back up with your triceps.',
  ], { equipment: 'Dumbbells + bench' }],
  ['Close-Grip_Dumbbell_Press', 'Close-Grip Dumbbell Press', [
    'Lie on a flat bench holding the dumbbells together over your chest, palms facing in.',
    'Lower them to your chest, keeping them touching and your elbows tucked.',
    'Press them back up.',
  ], { aliases: ['Dumbbell Squeeze Press', 'Crush Press'], equipment: 'Dumbbells + bench', movement: 'horizontal_press' }],
  ['Smith_Machine_Close-Grip_Bench_Press', 'Smith Machine Close-Grip Bench Press', [
    'Lie on a bench under the Smith bar with your hands about shoulder width apart.',
    'Twist the bar off the hooks and lower it to your lower chest, elbows tucked.',
    'Press it back up.',
  ], { aliases: ['Smith Close-Grip Bench Press'], equipment: 'Smith machine + bench' }],
  ['Push-Ups_-_Close_Triceps_Position', 'Diamond Push-Up', [
    'Start in a push-up position with your hands together under your chest.',
    'Lower your chest to your hands, elbows close to your sides.',
    'Push back up until your arms are straight.',
  ], { aliases: ['Close-Grip Push-Up', 'Triangle Push-Up', 'Diamond Pushup'] }],
  ['Ring_Dips', 'Ring Dip', [
    'Hold yourself up on gymnastic rings with your arms straight and the rings by your sides.',
    'Lower yourself until your shoulders are just below your elbows.',
    'Press back up, keeping the rings close to your body.',
  ], { aliases: ['Ring Dips'], equipment: 'Gymnastic rings', equipmentType: 'bodyweight', loadType: 'bodyweight' }],
  ['Palms-Down_Wrist_Curl_Over_A_Bench', 'Reverse Wrist Curl', [
    'Kneel by a bench with your forearms on it and your hands past the edge, palms down.',
    'Lift the weight by bending your wrists up.',
    'Lower it slowly.',
  ], { aliases: ['Palms-Down Wrist Curl'], equipment: 'Barbell or dumbbells + bench' }],
  ['Standing_Palms-Up_Barbell_Behind_The_Back_Wrist_Curl', 'Behind-the-Back Wrist Curl', [
    'Hold a barbell behind your thighs with your palms facing back.',
    'Let it roll down to your fingertips.',
    'Curl it back up by bending your wrists.',
  ], {}],
  ['Cable_Wrist_Curl', 'Cable Wrist Curl', [
    'Sit facing a low pulley with your forearms on your thighs, palms up, holding a bar.',
    'Let the bar roll down to your fingertips.',
    'Curl it back up by bending your wrists.',
  ], {}],
  ['Wrist_Roller', 'Wrist Roller', [
    'Hold the roller in front of you with straight arms and the weight hanging on its cord.',
    'Turn the roller one hand at a time to wind the weight up.',
    'Unwind it slowly the same way.',
  ], { equipment: 'Wrist roller', equipmentType: 'other', loadType: 'weight', movement: 'wrist_curl' }],
  ['Farmers_Walk', "Farmer's Walk", [
    'Stand between two heavy dumbbells or handles and pick them up with a flat back.',
    'Stand tall with your shoulders back and walk with short, quick steps.',
    'Set them down with control at the end.',
  ], { aliases: ["Farmer's Carry", 'Farmers Walk', 'Farmer Carry', 'Kettlebell Carry', "Kettlebell Farmer's Carry", 'Trap Bar Carry', 'Farmers Carry'], muscleGroup: 'arms', alsoWorks: ['back', 'core'], equipment: 'Dumbbells or farmer handles', equipmentType: 'dumbbell', loadType: 'weight', movement: 'hang' }],

  // Core
  ['Decline_Crunch', 'Decline Crunch', [
    'Hook your feet under the pads of a decline bench and lie back.',
    'Curl your shoulders up toward your knees.',
    'Lower yourself slowly without resting at the bottom.',
  ], { aliases: ['Decline Crunches', 'Decline Sit-Up'], equipment: 'Decline bench' }],
  ['Oblique_Crunches_-_On_The_Floor', 'Oblique Crunch', [
    'Lie on your side with your knees bent and your top hand behind your head.',
    'Crunch your top shoulder up toward your hip.',
    'Lower it slowly, finish your reps, then switch sides.',
  ], { aliases: ['Side Crunch', 'Oblique Crunches'] }],
  ['Cross-Body_Crunch', 'Cross-Body Crunch', [
    'Lie on your back with your knees bent and your hands behind your head.',
    'Crunch up and bring one elbow toward the opposite knee.',
    'Lower yourself, then crunch to the other side.',
  ], {}],
  ['Exercise_Ball_Crunch', 'Stability Ball Crunch', [
    'Sit on a stability ball and walk your feet out until it is under your lower back.',
    'Curl your shoulders up toward your hips.',
    'Lower back down over the ball slowly.',
  ], { aliases: ['Exercise Ball Crunch', 'Swiss Ball Crunch'], equipment: 'Stability ball', equipmentType: 'other', loadType: 'bodyweight' }],
  ['Weighted_Crunches', 'Weighted Crunch', [
    'Lie on your back with your knees bent, holding a plate or ball on your chest.',
    'Curl your shoulders up off the floor.',
    'Lower them slowly.',
  ], { equipment: 'Weight plate or medicine ball', equipmentType: 'other', loadType: 'weight' }],
  ['Jackknife_Sit-Up', 'V-Up', [
    'Lie on your back with your arms over your head and your legs straight.',
    'Lift your arms and legs at the same time to meet over your hips.',
    'Lower them slowly without letting them touch the floor.',
  ], { aliases: ['Jackknife Sit-Up', 'V-Ups', 'Jackknife'] }],
  ['Seated_Flat_Bench_Leg_Pull-In', 'Seated Knee Tuck', [
    'Sit on the edge of a bench, lean back, and hold its sides with your legs out straight.',
    'Pull your knees in toward your chest as you lean your body toward them.',
    'Straighten back out slowly.',
  ], { aliases: ['Bench Knee Tuck', 'Seated Leg Tuck'], equipment: 'Bench' }],
  ['Flutter_Kicks', 'Flutter Kicks', [
    'Lie on your back with your hands under your hips and your legs straight.',
    'Lift your heels a few inches off the floor.',
    'Kick your legs up and down in small, quick movements, keeping your lower back down.',
  ], { aliases: ['Flutter Kick', 'Flutters'], muscleGroup: 'core', alsoWorks: ['legs'] }],
  ['Exercise_Ball_Pull-In', 'Stability Ball Knee Tuck', [
    'Start in a push-up position with your shins on a stability ball.',
    'Pull your knees in toward your chest, rolling the ball forward.',
    'Straighten your legs to roll it back out.',
  ], { aliases: ['Swiss Ball Knee Tuck', 'Ball Knee Tuck'], equipment: 'Stability ball', equipmentType: 'other', loadType: 'bodyweight' }],
  ['Barbell_Ab_Rollout', 'Barbell Rollout', [
    'Kneel behind a loaded barbell and hold it with your hands shoulder width apart.',
    'Roll it forward slowly, keeping your back flat, as far as you can control.',
    'Pull it back toward your knees using your stomach.',
  ], { aliases: ['Barbell Ab Rollout'] }],
  ['Standing_Cable_Wood_Chop', 'Cable Woodchop', [
    'Stand side-on to a high pulley and hold the handle with both hands.',
    'Pull it down and across your body to your opposite hip, turning your torso.',
    'Let it back up slowly, finish your reps, then switch sides.',
  ], { aliases: ['Wood Chop', 'Cable Wood Chop', 'Woodchopper'] }],
  ['Landmine_180s', 'Landmine Rotation', [
    'Set one end of a bar in a landmine and hold the other end at arm\'s length, feet wide.',
    'Turn your torso and hips to swing the bar down to one hip.',
    'Bring it back over the middle and down to the other side.',
  ], { aliases: ['Landmine 180', 'Landmine Twist'], equipment: 'Barbell + landmine' }],
  ['Dumbbell_Side_Bend', 'Dumbbell Side Bend', [
    'Stand tall with a dumbbell in one hand at your side.',
    'Bend sideways toward the dumbbell, keeping your hips still.',
    'Pull yourself back up straight, then switch sides.',
  ], { aliases: ['Side Bend'], equipment: 'Dumbbell' }],
  ['Standing_Rope_Crunch', 'Standing Cable Crunch', [
    'Stand facing away from a high pulley holding a rope at the sides of your head.',
    'Crunch down by curling your ribs toward your hips, keeping your hips still.',
    'Come back up slowly.',
  ], { aliases: ['Standing Rope Crunch'] }],
  ['Kettlebell_Windmill', 'Kettlebell Windmill', [
    'Press a kettlebell overhead in one hand and turn your feet away from it.',
    'Keeping your eyes on the kettlebell, push your hips out and lower your free hand down your leg.',
    'Stand back up the same way, then switch sides.',
  ], {}],

  // Glutes
  ['Barbell_Glute_Bridge', 'Barbell Glute Bridge', [
    'Lie on the floor with your knees bent and a padded barbell over your hips.',
    'Drive through your heels to lift your hips until your body is straight from knees to shoulders.',
    'Squeeze your glutes at the top, then lower slowly.',
  ], {}],
  ['Cable_Hip_Adduction', 'Cable Hip Adduction', [
    'Attach an ankle strap to a low pulley and stand side-on with the strap on your inside ankle.',
    'Pull that leg across in front of your other leg.',
    'Let it back out slowly, then switch sides.',
  ], { aliases: ['Standing Cable Adduction'], muscleGroup: 'legs', equipment: 'Cable machine + ankle strap' }],

  // Legs
  ['Box_Squat', 'Box Squat', [
    'Set a box behind you at about knee height and hold the bar on your upper back.',
    'Sit back onto the box under control, keeping your chest up.',
    'Pause, then drive up to standing.',
  ], { equipment: 'Barbell + box' }],
  ['Barbell_Hack_Squat', 'Barbell Hack Squat', [
    'Stand in front of a barbell and hold it behind your legs, arms straight.',
    'Stand up with it, keeping your chest up.',
    'Squat down until the bar is just above the floor, then stand back up.',
  ], {}],
  ['Front_Squats_With_Two_Kettlebells', 'Double Kettlebell Front Squat', [
    'Hold a kettlebell in each hand, resting on your forearms at your shoulders.',
    'Squat down until your thighs are at least parallel, chest up.',
    'Drive back up to standing.',
  ], { aliases: ['Kettlebell Front Squat'] }],
  ['Dumbbell_Squat', 'Dumbbell Squat', [
    'Stand with your feet about shoulder width apart and a dumbbell in each hand at your sides.',
    'Squat down until your thighs are at least parallel, chest up.',
    'Drive back up to standing.',
  ], {}],
  ['Plie_Dumbbell_Squat', 'Sumo Squat', [
    'Stand with your feet wide and toes turned out, holding one dumbbell between your legs.',
    'Squat straight down, pushing your knees out over your toes.',
    'Drive back up to standing.',
  ], { aliases: ['Plie Squat', 'Dumbbell Sumo Squat'], alsoWorks: ['glutes'], equipment: 'Dumbbell' }],
  ['Zercher_Squats', 'Zercher Squat', [
    'Hold the bar in the crooks of your elbows, close to your body.',
    'Squat down until your thighs are at least parallel, chest up.',
    'Drive back up to standing.',
  ], { equipment: 'Barbell + rack' }],
  ['Wide_Stance_Barbell_Squat', 'Wide-Stance Squat', [
    'Hold the bar on your upper back with your feet wider than your shoulders and toes turned out.',
    'Squat down, pushing your knees out over your toes, until your thighs are parallel.',
    'Drive back up to standing.',
  ], { aliases: ['Wide-Stance Barbell Squat'], equipment: 'Barbell + squat rack' }],
  ['Narrow_Stance_Leg_Press', 'Narrow-Stance Leg Press', [
    'Sit in the leg press with your feet close together in the middle of the platform.',
    'Release the safeties and lower the platform until your knees are bent to about 90 degrees.',
    'Press it back up without locking your knees.',
  ], { aliases: ['Close-Stance Leg Press'] }],
  ['Overhead_Squat', 'Overhead Squat', [
    'Hold a barbell overhead with a wide grip and your arms straight.',
    'Keeping the bar over your midfoot, squat down as low as you can control.',
    'Drive back up to standing.',
  ], { aliases: ['OHS'] }],
  ['Weighted_Sissy_Squat', 'Sissy Squat', [
    'Stand tall holding something steady with one hand.',
    'Rise onto your toes and lean back as you bend your knees forward, keeping your hips straight.',
    'Go as low as you can control, then push back up.',
  ], { equipment: 'Bodyweight', equipmentType: 'bodyweight', loadType: 'bodyweight' }],
  ['Kettlebell_Pistol_Squat', 'Pistol Squat', [
    'Stand on one leg with the other leg held straight out in front of you.',
    'Squat down on the standing leg as low as you can control.',
    'Drive back up, finish your reps, then switch legs.',
  ], { aliases: ['Single-Leg Squat', 'Pistol'], alsoWorks: ['glutes', 'core'], equipment: 'Bodyweight (optional kettlebell)', equipmentType: 'bodyweight', loadType: 'bodyweight' }],
  ['Freehand_Jump_Squat', 'Jump Squat', [
    'Stand with your feet about shoulder width apart.',
    'Squat down a little, then jump as high as you can.',
    'Land softly and go straight into the next rep.',
  ], { aliases: ['Squat Jump', 'Jumping Squat', 'Power Jump'] }],
  ['Barbell_Lunge', 'Barbell Lunge', [
    'Hold a barbell on your upper back and stand tall.',
    'Step forward and lower until both knees are bent to about 90 degrees.',
    'Push back to standing and switch legs.',
  ], {}],
  ['Barbell_Walking_Lunge', 'Barbell Walking Lunge', [
    'Hold a barbell on your upper back and stand tall.',
    'Step forward into a lunge until your back knee nearly touches the floor.',
    'Push up and step straight into the next lunge with the other leg.',
  ], {}],
  ['Barbell_Step_Ups', 'Barbell Step-Up', [
    'Hold a barbell on your upper back and stand facing a box or bench.',
    'Step up with one foot and drive through it to stand on the box.',
    'Step back down, finish your reps, then switch legs.',
  ], { equipment: 'Barbell + box' }],
  ['Split_Squat_with_Dumbbells', 'Dumbbell Split Squat', [
    'Stand in a long split stance with a dumbbell in each hand.',
    'Lower straight down until your back knee nearly touches the floor.',
    'Push back up, finish your reps, then switch legs.',
  ], { aliases: ['Split Squat', 'DB Split Squat', 'Split Squats'] }],
  ['Smith_Single-Leg_Split_Squat', 'Smith Machine Split Squat', [
    'Set the Smith bar on your upper back and stand in a long split stance.',
    'Lower straight down until your back knee nearly touches the floor.',
    'Push back up, finish your reps, then switch legs.',
  ], { aliases: ['Smith Split Squat', 'Smith Machine Bulgarian Split Squat'] }],
  ['Split_Jump', 'Split Jump', [
    'Start in a lunge with one foot forward.',
    'Jump up and switch your legs in the air.',
    'Land softly in a lunge with the other foot forward and go again.',
  ], { aliases: ['Jumping Lunge', 'Lunge Jump'] }],
  ['Standing_Long_Jump', 'Broad Jump', [
    'Stand with your feet about hip width apart.',
    'Swing your arms back, bend your knees, then jump forward as far as you can.',
    'Land softly on both feet, reset, and go again.',
  ], { aliases: ['Standing Long Jump'] }],
  ['Knee_Tuck_Jump', 'Tuck Jump', [
    'Stand with your feet about hip width apart.',
    'Jump straight up and pull your knees toward your chest.',
    'Land softly and go straight into the next jump.',
  ], { aliases: ['Knee Tuck Jump'], muscleGroup: 'legs' }],
  ['Star_Jump', 'Star Jump', [
    'Stand with your feet together and arms at your sides.',
    'Squat down a little, then jump up and spread your arms and legs into a star.',
    'Bring them back in before you land softly, and go again.',
  ], {}],
  ['Lateral_Bound', 'Lateral Bound', [
    'Stand on one leg with a slight bend in the knee.',
    'Push off sideways and land on the other leg.',
    'Hold the landing for a moment, then bound back.',
  ], { aliases: ['Skater Jump', 'Skaters'], equipment: 'Bodyweight' }],
  ['Single-Leg_Leg_Extension', 'Single-Leg Leg Extension', [
    'Sit in the leg extension machine with the pad on one shin.',
    'Straighten that leg until your knee is locked out.',
    'Lower it slowly, then switch legs.',
  ], { aliases: ['Single-Leg Extension', 'One-Leg Leg Extension'] }],
  ['Standing_Leg_Curl', 'Standing Leg Curl', [
    'Stand in the machine with the pad behind one ankle and hold the handles.',
    'Curl your heel up toward your glute.',
    'Lower it slowly, then switch legs.',
  ], { aliases: ['Standing Leg Curl Machine', 'Standing Hamstring Curl'] }],
  ['Ball_Leg_Curl', 'Stability Ball Leg Curl', [
    'Lie on your back with your heels on a stability ball and lift your hips.',
    'Pull the ball in toward you by bending your knees, keeping your hips up.',
    'Roll it back out slowly.',
  ], { aliases: ['Swiss Ball Hamstring Curl', 'Ball Hamstring Curl'], equipment: 'Stability ball', equipmentType: 'other', loadType: 'bodyweight' }],
  ['Glute_Ham_Raise', 'Glute-Ham Raise', [
    'Set your feet against the footplate with your knees just behind the pad.',
    'Start upright, then lower your body forward under control.',
    'Pull yourself back up with your hamstrings.',
  ], { aliases: ['GHR', 'Glute Ham Raise'], equipment: 'Glute-ham developer', loadType: 'bodyweight' }],
  ['Natural_Glute_Ham_Raise', 'Nordic Hamstring Curl', [
    'Kneel with your ankles held down by a partner or under a pad.',
    'Lower your body forward as slowly as you can, keeping your hips straight.',
    'Catch yourself with your hands, then pull back up as much as you can with your hamstrings.',
  ], { aliases: ['Nordic Curl', 'Natural Glute-Ham Raise'] }],
  ['Stiff-Legged_Barbell_Deadlift', 'Stiff-Leg Deadlift', [
    'Hold a barbell in front of your thighs with your knees only slightly bent.',
    'Hinge forward, lowering the bar close to your legs until you feel a stretch.',
    'Drive your hips forward to stand back up.',
  ], { aliases: ['Stiff-Legged Deadlift', 'SLDL', 'Straight-Leg Deadlift', 'Stiff Leg Deadlifts'] }],
  ['Stiff-Legged_Dumbbell_Deadlift', 'Dumbbell Stiff-Leg Deadlift', [
    'Hold a dumbbell in each hand in front of your thighs, knees only slightly bent.',
    'Hinge forward, lowering the dumbbells close to your legs until you feel a stretch.',
    'Drive your hips forward to stand back up.',
  ], { aliases: ['Dumbbell Stiff-Legged Deadlift'] }],
  ['Kettlebell_One-Legged_Deadlift', 'Single-Leg Romanian Deadlift', [
    'Stand on one leg holding a kettlebell or dumbbell in the opposite hand.',
    'Hinge forward and let your free leg rise behind you until your body is nearly level.',
    'Stand back up, finish your reps, then switch legs.',
  ], { aliases: ['Single-Leg RDL', 'Single-Leg Deadlift', 'One-Leg Deadlift', 'SL RDL', 'Single-Leg RDLs'], equipment: 'Kettlebell or dumbbell' }],
  ['Smith_Machine_Stiff-Legged_Deadlift', 'Smith Machine Romanian Deadlift', [
    'Set the Smith bar at about hip height and hold it with a grip just outside your legs.',
    'Twist it off the hooks and hinge forward, keeping the bar close to your legs.',
    'Drive your hips forward to stand back up.',
  ], { aliases: ['Smith RDL', 'Smith Machine RDL'] }],
  ['Calf_Press_On_The_Leg_Press_Machine', 'Leg Press Calf Raise', [
    'Sit in the leg press with the balls of your feet on the bottom edge of the platform.',
    'Straighten your legs, then push the platform away by pointing your toes.',
    'Let your heels come back toward you slowly for a stretch.',
  ], { aliases: ['Calf Press', 'Leg Press Calf Press'] }],
  ['Standing_Barbell_Calf_Raise', 'Barbell Calf Raise', [
    'Hold a barbell on your upper back and stand with the balls of your feet on a plate or step.',
    'Rise up onto your toes as high as you can.',
    'Lower your heels slowly below the step.',
  ], {}],
  ['Standing_Dumbbell_Calf_Raise', 'Dumbbell Calf Raise', [
    'Hold a dumbbell in each hand and stand with the balls of your feet on a step.',
    'Rise up onto your toes as high as you can.',
    'Lower your heels slowly below the step.',
  ], {}],
  ['Barbell_Seated_Calf_Raise', 'Barbell Seated Calf Raise', [
    'Sit on a bench with the balls of your feet on a plate and a padded barbell across your knees.',
    'Raise your heels as high as you can.',
    'Lower them slowly below the plate.',
  ], { equipment: 'Barbell + bench' }],
  ['Dumbbell_Seated_One-Leg_Calf_Raise', 'Seated Dumbbell Calf Raise', [
    'Sit on a bench with the balls of your feet on a plate and a dumbbell on your knee.',
    'Raise your heel as high as you can.',
    'Lower it slowly, then switch legs.',
  ], { equipment: 'Dumbbell + bench' }],
  ['Smith_Machine_Calf_Raise', 'Smith Machine Calf Raise', [
    'Set the Smith bar on your upper back and stand with the balls of your feet on a step.',
    'Rise up onto your toes as high as you can.',
    'Lower your heels slowly below the step.',
  ], { aliases: ['Smith Calf Raise'] }],
  ['Donkey_Calf_Raises', 'Donkey Calf Raise', [
    'Set your hips under the machine pad and lean forward, holding the handles.',
    'With the balls of your feet on the block, rise up onto your toes.',
    'Lower your heels slowly below the block.',
  ], { aliases: ['Donkey Calf Raises'], equipment: 'Donkey calf machine', equipmentType: 'machine', loadType: 'weight' }],

  // Olympic and kettlebell lifts, counted as hip hinges for swaps
  ['Power_Clean', 'Power Clean', [
    'Stand with the bar over your midfoot and grip it just outside your legs.',
    'Push the floor away and stand up fast, keeping the bar close.',
    'Pull yourself under it and catch it on your shoulders in a quarter squat.',
  ], { aliases: ['Barbell Power Clean'] }],
  ['Hang_Clean', 'Hang Clean', [
    'Stand holding the bar at your thighs and hinge forward until it is just above your knees.',
    'Jump and shrug hard, then pull yourself under the bar.',
    'Catch it on your shoulders in a squat and stand up.',
  ], { aliases: ['Hang Power Clean'], muscleGroup: 'legs' }],
  ['Clean', 'Squat Clean', [
    'Stand with the bar over your midfoot and grip it just outside your legs.',
    'Pull it off the floor, then extend hard through your hips as it passes your knees.',
    'Drop into a full front squat to catch it on your shoulders, then stand up.',
  ], { aliases: ['Clean', 'Full Clean'] }],
  ['Power_Snatch', 'Power Snatch', [
    'Stand with the bar over your midfoot and take a wide grip.',
    'Pull it from the floor and extend hard through your hips, keeping it close.',
    'Pull yourself under and catch it overhead with straight arms in a quarter squat.',
  ], { muscleGroup: 'legs' }],
  ['Snatch', 'Squat Snatch', [
    'Stand with the bar over your midfoot and take a wide grip.',
    'Pull it from the floor and extend hard through your hips, keeping it close.',
    'Drop into a full overhead squat to catch it with straight arms, then stand up.',
  ], { aliases: ['Snatch', 'Full Snatch'], muscleGroup: 'legs', alsoWorks: ['glutes', 'shoulders'] }],
  ['Hang_Snatch', 'Hang Snatch', [
    'Stand holding the bar with a wide grip and hinge forward until it is just above your knees.',
    'Jump and shrug hard, then pull yourself under the bar.',
    'Catch it overhead with straight arms in a squat and stand up.',
  ], { muscleGroup: 'legs', alsoWorks: ['glutes', 'shoulders'] }],
  ['Dumbbell_Clean', 'Dumbbell Clean', [
    'Stand with a dumbbell in each hand at your sides.',
    'Hinge forward slightly, then drive your hips forward and shrug.',
    'Pull yourself under the dumbbells and catch them at your shoulders.',
  ], { muscleGroup: 'legs' }],
  ['One-Arm_Kettlebell_Clean', 'Kettlebell Clean', [
    'Stand with a kettlebell between your feet and grip it with one hand.',
    'Swing it back between your legs, then drive your hips forward.',
    'Guide it up close to your body to rest on your forearm at your shoulder.',
  ], { aliases: ['Single-Arm Kettlebell Clean', 'KB Clean'], muscleGroup: 'legs' }],
  ['One-Arm_Kettlebell_Snatch', 'Kettlebell Snatch', [
    'Stand with a kettlebell between your feet and grip it with one hand.',
    'Swing it back, then drive your hips forward and pull it up close to your body.',
    'Punch your hand up to finish with the kettlebell overhead, arm straight.',
  ], { aliases: ['Single-Arm Kettlebell Snatch', 'KB Snatch'], muscleGroup: 'legs', alsoWorks: ['shoulders', 'back'] }],

  // Cardio and conditioning
  ['Mountain_Climbers', 'Mountain Climber', [
    'Start in a push-up position with your arms straight.',
    'Drive one knee toward your chest, then switch legs quickly.',
    'Keep your hips low and keep switching for the time you set.',
  ], { aliases: ['Mountain Climbers'], muscleGroup: 'cardio', alsoWorks: ['core', 'shoulders'], equipment: 'Bodyweight', equipmentType: 'bodyweight', loadType: 'timed', movement: 'conditioning' }],
  ['Sled_Push', 'Sled Push', [
    'Load the sled and hold the tall handles with your arms straight or bent.',
    'Lean in and drive the sled forward with short, powerful steps.',
    'Keep pushing for the distance or time you set.',
  ], { aliases: ['Prowler Push', 'Prowler'], muscleGroup: 'cardio', alsoWorks: ['legs', 'glutes'], equipment: 'Sled', equipmentType: 'other', loadType: 'timed', movement: 'conditioning', tracks: ['distance'] }],
  ['Sled_Drag_-_Harness', 'Sled Drag', [
    'Clip the sled to a harness or hold its straps.',
    'Lean forward and walk or run, driving through each step.',
    'Keep going for the distance or time you set.',
  ], { aliases: ['Sled Pull', 'Backward Sled Drag'], muscleGroup: 'cardio', alsoWorks: ['legs', 'glutes'], equipment: 'Sled + harness or straps', equipmentType: 'other', loadType: 'timed', movement: 'conditioning', tracks: ['distance'] }],
]
