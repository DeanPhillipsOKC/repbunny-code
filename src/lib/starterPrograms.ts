import { libraryEntry, type LibraryExercise } from './exerciseLibrary'
import { FREE_TEMPLATE_LIMIT } from './premium'
import type { TemplateCategory } from './templateCategory'

// Issue #148: a few widely published beginner-to-intermediate plans,
// offered on the Templates screen as optional starting points. Adding one
// makes ordinary templates the user owns and can change or archive like any
// other; nothing here tracks which program a template came from. Exercises are
// library ids (src/data/exercise-library.json), and every lift works in the
// app's 8 to 12 rep range, the one next-set targets use (#140).
//
// Issue #167: programs are grouped by the equipment they need. Machine plans
// suit beginners at a big gym (no barbell setup, no spotter); dumbbell-only
// plans suit a home gym.
//
// Issue #209: programs are free. Their templates count toward
// FREE_TEMPLATE_LIMIT like any other, so a program with more templates than
// that (the two 5-day splits) needs Premium (programNeedsPremium).

export type StarterGroup = 'machines' | 'free-weights' | 'dumbbells'

export const STARTER_GROUPS: { id: StarterGroup; name: string; sub: string }[] = [
  { id: 'machines', name: 'Machines', sub: 'For a big gym. Easy to learn, and no spotter needed.' },
  { id: 'free-weights', name: 'Free weights', sub: 'Barbells and dumbbells, plus a few cable and machine lifts.' },
  { id: 'dumbbells', name: 'Dumbbells only', sub: 'For a home gym with a pair of dumbbells and a bench.' },
]

export interface StarterLift {
  libraryId: string
  sets: number
  // Shown in place of "N sets", for cardio done as one timed block.
  duration?: string
}

export interface StarterTemplate {
  name: string
  category: TemplateCategory
  lifts: StarterLift[]
}

export interface StarterProgram {
  id: string
  group: StarterGroup
  name: string
  daysPerWeek: string
  forWho: string
  week: { day: string; template: string }[]
  note: string
  templates: StarterTemplate[]
}

export const STARTER_PROGRAMS: StarterProgram[] = [
  {
    id: 'machine-ppl',
    group: 'machines',
    name: 'Machine push / pull / legs',
    daysPerWeek: '3 days a week',
    forWho:
      'Brand new to lifting at a gym full of machines. Each machine guides the movement, so you can learn the basics without a barbell or a spotter. Pushing muscles, pulling muscles, and legs each get their own day.',
    week: [
      { day: 'Mon', template: 'Machine PPL: Push' },
      { day: 'Wed', template: 'Machine PPL: Pull' },
      { day: 'Fri', template: 'Machine PPL: Legs' },
    ],
    note: 'Set each seat so the handles line up with your chest or the pad sits on the right joint. The sticker on the machine shows where.',
    templates: [
      {
        name: 'Machine PPL: Push',
        category: 'upper',
        lifts: [
          { libraryId: 'chest_press_machine', sets: 3 },
          { libraryId: 'shoulder_press_machine', sets: 3 },
          { libraryId: 'pec_deck', sets: 3 },
          { libraryId: 'lateral_raise_machine', sets: 2 },
          { libraryId: 'seated_dip_machine', sets: 3 },
        ],
      },
      {
        name: 'Machine PPL: Pull',
        category: 'upper',
        lifts: [
          { libraryId: 'lat_pulldown', sets: 3 },
          { libraryId: 'seated_row_machine', sets: 3 },
          { libraryId: 'reverse_pec_deck', sets: 3 },
          { libraryId: 'bicep_curl_machine', sets: 3 },
        ],
      },
      {
        name: 'Machine PPL: Legs',
        category: 'lower',
        lifts: [
          { libraryId: 'leg_press', sets: 3 },
          { libraryId: 'leg_extension', sets: 3 },
          { libraryId: 'seated_leg_curl', sets: 3 },
          { libraryId: 'calf_raise_machine', sets: 3 },
          { libraryId: 'ab_crunch_machine', sets: 2 },
        ],
      },
    ],
  },
  {
    id: 'machine-split',
    group: 'machines',
    name: 'Machine 6-day split',
    daysPerWeek: '6 days a week',
    forWho:
      'Ready to be at the gym most days and like shorter sessions. Upper body splits into push and pull, legs split into quads and glutes, and two days are cardio and core.',
    week: [
      { day: 'Mon', template: '6-Day: Push' },
      { day: 'Tue', template: '6-Day: Quads' },
      { day: 'Wed', template: '6-Day: Cardio & Core' },
      { day: 'Thu', template: '6-Day: Pull' },
      { day: 'Fri', template: '6-Day: Glutes & Hams' },
      { day: 'Sat', template: '6-Day: Cardio & Core' },
    ],
    note: 'Rest on Sunday. Any cardio machine works for the cardio block: swap the treadmill for a bike, elliptical, or stair stepper.',
    templates: [
      {
        name: '6-Day: Push',
        category: 'upper',
        lifts: [
          { libraryId: 'chest_press_machine', sets: 3 },
          { libraryId: 'shoulder_press_machine', sets: 3 },
          { libraryId: 'tricep_pushdown', sets: 3 },
          { libraryId: 'pec_deck', sets: 3 },
          { libraryId: 'tricep_extension_machine', sets: 3 },
        ],
      },
      {
        name: '6-Day: Quads',
        category: 'lower',
        lifts: [
          { libraryId: 'leg_press', sets: 3 },
          { libraryId: 'leg_extension', sets: 3 },
          { libraryId: 'calf_raise_machine', sets: 3 },
          { libraryId: 'hip_abductor_machine', sets: 3 },
          { libraryId: 'hip_adductor_machine', sets: 3 },
        ],
      },
      {
        name: '6-Day: Cardio & Core',
        category: 'cardio',
        lifts: [
          { libraryId: 'treadmill', sets: 1, duration: '20 to 30 min' },
          { libraryId: 'ab_crunch_machine', sets: 3 },
          { libraryId: 'captains_chair_knee_raise', sets: 3 },
          { libraryId: 'plank', sets: 3 },
        ],
      },
      {
        name: '6-Day: Pull',
        category: 'upper',
        lifts: [
          { libraryId: 'lat_pulldown', sets: 3 },
          { libraryId: 'seated_row_machine', sets: 3 },
          { libraryId: 'bicep_curl_machine', sets: 3 },
          { libraryId: 'reverse_pec_deck', sets: 3 },
          { libraryId: 'assisted_pull_up', sets: 3 },
        ],
      },
      {
        name: '6-Day: Glutes & Hams',
        category: 'lower',
        lifts: [
          { libraryId: 'seated_leg_curl', sets: 3 },
          { libraryId: 'glute_kickback_machine', sets: 3 },
          { libraryId: 'calf_raise_machine', sets: 3 },
          { libraryId: 'hip_abductor_machine', sets: 3 },
          { libraryId: 'hip_adductor_machine', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'dumbbell-full-body',
    group: 'dumbbells',
    name: 'Dumbbell full body',
    daysPerWeek: '3 days a week',
    forWho:
      'Training at home with a pair of adjustable dumbbells and a bench. Every session works the whole body, with a day off in between.',
    week: [
      { day: 'Mon', template: 'DB Full Body: A' },
      { day: 'Wed', template: 'DB Full Body: B' },
      { day: 'Fri', template: 'DB Full Body: A' },
    ],
    note: 'Next week starts with B. Keep alternating. When 12 reps gets easy, go up a dumbbell size.',
    templates: [
      {
        name: 'DB Full Body: A',
        category: 'full',
        lifts: [
          { libraryId: 'goblet_squat', sets: 3 },
          { libraryId: 'dumbbell_bench_press', sets: 3 },
          { libraryId: 'dumbbell_row', sets: 3 },
          { libraryId: 'dumbbell_romanian_deadlift', sets: 3 },
          { libraryId: 'plank', sets: 3 },
        ],
      },
      {
        name: 'DB Full Body: B',
        category: 'full',
        lifts: [
          { libraryId: 'bulgarian_split_squat', sets: 3 },
          { libraryId: 'seated_dumbbell_shoulder_press', sets: 3 },
          { libraryId: 'chest_supported_row', sets: 3 },
          { libraryId: 'dumbbell_hip_thrust', sets: 3 },
          { libraryId: 'dumbbell_curl', sets: 2 },
        ],
      },
    ],
  },
  {
    id: 'full-body',
    group: 'free-weights',
    name: 'Beginner full body',
    daysPerWeek: '3 days a week',
    forWho:
      'New to lifting, or back after a long break. Every session trains the whole body, so each muscle gets worked three times a week with a day off in between.',
    week: [
      { day: 'Mon', template: 'Full Body: A' },
      { day: 'Wed', template: 'Full Body: B' },
      { day: 'Fri', template: 'Full Body: A' },
    ],
    note: 'Next week starts with B. Keep alternating.',
    templates: [
      {
        name: 'Full Body: A',
        category: 'full',
        lifts: [
          { libraryId: 'barbell_back_squat', sets: 3 },
          { libraryId: 'barbell_bench_press', sets: 3 },
          { libraryId: 'barbell_row', sets: 3 },
          { libraryId: 'plank', sets: 3 },
        ],
      },
      {
        name: 'Full Body: B',
        category: 'full',
        lifts: [
          { libraryId: 'romanian_deadlift', sets: 3 },
          { libraryId: 'overhead_press', sets: 3 },
          { libraryId: 'lat_pulldown', sets: 3 },
          { libraryId: 'leg_press', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    group: 'free-weights',
    name: 'Upper / lower',
    daysPerWeek: '4 days a week',
    forWho:
      'A few months in and ready for more volume. Upper and lower body each get two days, so sessions are a little longer but each muscle still trains twice a week.',
    week: [
      { day: 'Mon', template: 'Upper/Lower: Upper' },
      { day: 'Tue', template: 'Upper/Lower: Lower' },
      { day: 'Thu', template: 'Upper/Lower: Upper' },
      { day: 'Fri', template: 'Upper/Lower: Lower' },
    ],
    note: 'Any four days work. Try not to do the same one two days in a row.',
    templates: [
      {
        name: 'Upper/Lower: Upper',
        category: 'upper',
        lifts: [
          { libraryId: 'barbell_bench_press', sets: 3 },
          { libraryId: 'barbell_row', sets: 3 },
          { libraryId: 'seated_dumbbell_shoulder_press', sets: 3 },
          { libraryId: 'lat_pulldown', sets: 3 },
          { libraryId: 'dumbbell_curl', sets: 2 },
          { libraryId: 'tricep_pushdown', sets: 2 },
        ],
      },
      {
        name: 'Upper/Lower: Lower',
        category: 'lower',
        lifts: [
          { libraryId: 'barbell_back_squat', sets: 3 },
          { libraryId: 'romanian_deadlift', sets: 3 },
          { libraryId: 'leg_press', sets: 3 },
          { libraryId: 'seated_leg_curl', sets: 3 },
          { libraryId: 'standing_calf_raise', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'ppl',
    group: 'free-weights',
    name: 'Push / pull / legs',
    daysPerWeek: '3 or 6 days a week',
    forWho:
      'Lifters who like a clear focus each day. Pushing muscles, pulling muscles, and legs each get their own session. Run it once a week, or twice for more volume.',
    week: [
      { day: 'Mon', template: 'PPL: Push' },
      { day: 'Wed', template: 'PPL: Pull' },
      { day: 'Fri', template: 'PPL: Legs' },
    ],
    note: 'On 6 days, go through it twice and rest on Sunday.',
    templates: [
      {
        name: 'PPL: Push',
        category: 'upper',
        lifts: [
          { libraryId: 'barbell_bench_press', sets: 3 },
          { libraryId: 'incline_dumbbell_press', sets: 3 },
          { libraryId: 'seated_dumbbell_shoulder_press', sets: 3 },
          { libraryId: 'dumbbell_lateral_raise', sets: 3 },
          { libraryId: 'tricep_pushdown', sets: 3 },
        ],
      },
      {
        name: 'PPL: Pull',
        category: 'upper',
        lifts: [
          { libraryId: 'lat_pulldown', sets: 3 },
          { libraryId: 'barbell_row', sets: 3 },
          { libraryId: 'seated_cable_row', sets: 3 },
          { libraryId: 'face_pull', sets: 3 },
          { libraryId: 'dumbbell_curl', sets: 3 },
        ],
      },
      {
        name: 'PPL: Legs',
        category: 'lower',
        lifts: [
          { libraryId: 'barbell_back_squat', sets: 3 },
          { libraryId: 'romanian_deadlift', sets: 3 },
          { libraryId: 'leg_press', sets: 3 },
          { libraryId: 'seated_leg_curl', sets: 3 },
          { libraryId: 'standing_calf_raise', sets: 3 },
        ],
      },
    ],
  },
  {
    id: 'body-part-split',
    group: 'free-weights',
    name: 'Body-part split',
    daysPerWeek: '5 days a week',
    forWho:
      'Experienced lifters who want lots of work for each muscle. Every day trains one area hard, and that area then gets a full week to recover.',
    week: [
      { day: 'Mon', template: 'Split: Chest' },
      { day: 'Tue', template: 'Split: Back' },
      { day: 'Wed', template: 'Split: Legs' },
      { day: 'Thu', template: 'Split: Shoulders' },
      { day: 'Fri', template: 'Split: Arms' },
    ],
    note: 'Weekends off. Missed a day? Pick up where you left off, not where the calendar says.',
    templates: [
      {
        name: 'Split: Chest',
        category: 'upper',
        lifts: [
          { libraryId: 'barbell_bench_press', sets: 4 },
          { libraryId: 'incline_dumbbell_press', sets: 3 },
          { libraryId: 'dumbbell_fly', sets: 3 },
          { libraryId: 'chest_dip', sets: 3 },
        ],
      },
      {
        name: 'Split: Back',
        category: 'upper',
        lifts: [
          { libraryId: 'lat_pulldown', sets: 4 },
          { libraryId: 'barbell_row', sets: 3 },
          { libraryId: 'dumbbell_row', sets: 3 },
          { libraryId: 'seated_cable_row', sets: 3 },
        ],
      },
      {
        name: 'Split: Legs',
        category: 'lower',
        lifts: [
          { libraryId: 'barbell_back_squat', sets: 4 },
          { libraryId: 'romanian_deadlift', sets: 3 },
          { libraryId: 'leg_press', sets: 3 },
          { libraryId: 'leg_extension', sets: 3 },
          { libraryId: 'seated_leg_curl', sets: 3 },
        ],
      },
      {
        name: 'Split: Shoulders',
        category: 'upper',
        lifts: [
          { libraryId: 'overhead_press', sets: 4 },
          { libraryId: 'dumbbell_lateral_raise', sets: 3 },
          { libraryId: 'rear_delt_fly', sets: 3 },
          { libraryId: 'face_pull', sets: 3 },
        ],
      },
      {
        name: 'Split: Arms',
        category: 'upper',
        lifts: [
          { libraryId: 'dumbbell_curl', sets: 3 },
          { libraryId: 'tricep_pushdown', sets: 3 },
          { libraryId: 'hammer_curl', sets: 3 },
          { libraryId: 'overhead_tricep_extension', sets: 3 },
        ],
      },
    ],
  },
]

export function starterProgram(id: string): StarterProgram | null {
  return STARTER_PROGRAMS.find((program) => program.id === id) ?? null
}

// Issue #209: more templates than Free holds, even with none of its own.
export function programNeedsPremium(program: StarterProgram): boolean {
  return program.templates.length > FREE_TEMPLATE_LIMIT
}

export function starterLiftEntry(lift: StarterLift): LibraryExercise {
  const entry = libraryEntry(lift.libraryId)
  if (!entry) throw new Error(`Starter program lift ${lift.libraryId} isn't in the exercise library`)
  return entry
}

// Rest for an exercise a program creates (one the user already has keeps its
// own setting): longer for heavy barbell lifts, shorter for small muscles.
const SHORT_REST_MOVEMENTS = new Set([
  'lateral_raise', 'front_raise', 'rear_delt', 'biceps_curl', 'triceps_extension', 'chest_fly',
  'leg_curl', 'leg_extension', 'calf_raise', 'wrist_curl',
])

export function starterRestSeconds(entry: LibraryExercise): number {
  if (entry.loadType === 'timed') return 60
  if (SHORT_REST_MOVEMENTS.has(entry.movement)) return 90
  if (entry.equipmentType === 'barbell') return 150
  return 120
}

// " (2)", " (3)" when an active template already has the name, the same
// rule a backup merge uses.
export function uniqueTemplateName(name: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()))
  if (!lower.has(name.toLowerCase())) return name
  let n = 2
  while (lower.has(`${name} (${n})`.toLowerCase())) n++
  return `${name} (${n})`
}
