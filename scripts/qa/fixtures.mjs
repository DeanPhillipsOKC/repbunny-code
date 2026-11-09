// Issue #211: the QA procedure's test data. Each scenario builds a RepBunny
// backup (or an import CSV) with dates counted back from `now`, because much
// of the app reads "this week", "the last 28 days", last month, trial days
// left, and so on. Pure: no file system, so e2e/qa-fixtures-unit.spec.ts can
// restore every file through the SQLite repos in Node.
//
// Rows match src/lib/backup.ts's BACKUP_TABLES (src/data/sqlite/repos.ts
// TABLES lists the columns). A schema change updates every file at once here.
import { readFileSync } from 'node:fs'

const library = JSON.parse(readFileSync(new URL('../../src/data/exercise-library.json', import.meta.url), 'utf8'))
const libraryById = new Map(library.map((e) => [e.id, e]))

const DAY_MS = 86_400_000

// Small seeded random, so a refresh only moves the dates.
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const roundTo = (value, step) => Math.round(value / step) * step

export const DEFAULT_PROFILE = {
  height: 70,
  height_unit: 'in',
  missing_weight_prompt_opt_out: false,
  weight_reminder: 'monthly',
  plates_lb: [45, 35, 25, 10, 5, 2.5],
  plates_kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  weight_unit: 'lb',
  prefill_mode: 'last_time',
  default_rest_seconds: 120,
}

class Builder {
  constructor(now, seed = 1) {
    this.now = now
    this.random = seeded(seed)
    this.counter = 0
    this.exercises = []
    this.workout_templates = []
    this.workout_template_exercises = []
    this.workouts = []
    this.sets = []
    this.body_weight_entries = []
    this.body_measurements = []
  }

  id() {
    this.counter += 1
    return `00000000-0000-4000-8000-${this.counter.toString(16).padStart(12, '0')}`
  }

  // A moment `daysAgo` days before now, at a local hour of the day.
  at(daysAgo, hour = 18, minute = 0) {
    const d = new Date(this.now.getTime() - daysAgo * DAY_MS)
    d.setHours(hour, minute, 0, 0)
    return d.toISOString()
  }

  exercise(libraryIdOrName, extra = {}) {
    const lib = libraryById.get(libraryIdOrName)
    const row = {
      id: this.id(),
      name: lib ? lib.name : libraryIdOrName,
      is_archived: false,
      setup_notes: null,
      rest_seconds: null,
      load_type: lib ? lib.loadType : 'weight',
      tracks_distance: lib ? lib.tracksDistance : false,
      tracks_incline: lib ? lib.tracksIncline : false,
      tracks_level: lib ? lib.tracksLevel : false,
      tracks_calories: lib ? lib.tracksCalories : false,
      muscle_group: lib ? lib.muscleGroup : null,
      also_works: lib ? lib.alsoWorks : [],
      library_id: lib ? lib.id : null,
      uses_barbell: null,
      bar_type: null,
      bar_custom_weight: null,
      bar_custom_unit: null,
      weight_step: null,
      weight_step_unit: null,
      rep_range_min: null,
      rep_range_max: null,
      push_pull: null,
      ...extra,
    }
    this.exercises.push(row)
    return row
  }

  template(name, exercises, { category = null, targetSets = 3 } = {}) {
    const row = { id: this.id(), name, is_archived: false, category }
    this.workout_templates.push(row)
    exercises.forEach((ex, position) => {
      this.workout_template_exercises.push({ id: this.id(), template_id: row.id, exercise_id: ex.id, position, target_sets: targetSets })
    })
    return row
  }

  // `sets`: [{ exercise, weight, reps, unit?, rpe?, ...timed fields }]
  workout({ daysAgo, hour = 18, template = null, notes = null, feel = null, events = null, sets }) {
    const row = {
      id: this.id(),
      template_id: template ? template.id : null,
      performed_at: this.at(daysAgo, hour),
      notes,
      sleep: feel?.sleep ?? null,
      energy: feel?.energy ?? null,
      stress: feel?.stress ?? null,
      events,
    }
    this.workouts.push(row)
    sets.forEach((s, set_index) => {
      this.sets.push({
        id: this.id(),
        workout_id: row.id,
        exercise_id: s.exercise.id,
        set_index,
        reps: s.reps ?? null,
        weight: s.weight ?? 0,
        weight_unit: s.unit ?? 'lb',
        rpe: s.rpe ?? null,
        level: s.level ?? null,
        duration_seconds: s.duration_seconds ?? null,
        distance: s.distance ?? null,
        distance_unit: s.distance_unit ?? null,
        incline: s.incline ?? null,
        calories: s.calories ?? null,
      })
    })
    return row
  }

  weighIn(daysAgo, weight, unit = 'lb') {
    this.body_weight_entries.push({ id: this.id(), weight, weight_unit: unit, recorded_at: this.at(daysAgo, 7) })
  }

  measure(daysAgo, values, unit = 'in') {
    const row = { id: this.id(), unit, waist: null, chest: null, hips: null, arms: null, thighs: null, neck: null, recorded_at: this.at(daysAgo, 7), ...values }
    this.body_measurements.push(row)
  }

  // A straight-sets block: `count` sets of `reps` at `weight`.
  block(exercise, weight, reps, count = 3, extra = {}) {
    return Array.from({ length: count }, () => ({ exercise, weight, reps, ...extra }))
  }

  backup({ profile = DEFAULT_PROFILE, includes = ['preferences', 'templates', 'history'], extra = {} } = {}) {
    const file = {
      format: 'repbunny-backup',
      version: 2,
      includes,
      exported_at: this.now.toISOString(),
      exercises: this.exercises,
      workout_templates: this.workout_templates,
      workout_template_exercises: this.workout_template_exercises,
      workouts: this.workouts,
      sets: this.sets,
      body_weight_entries: this.body_weight_entries,
      body_measurements: this.body_measurements,
      ...extra,
    }
    if (includes.includes('preferences')) file.profile = profile
    return file
  }
}

// The usual push / pull / legs lifter: templates, three sessions a week,
// slow steady progress in lb, weigh-ins every week.
function pplLifter(b, { weeks, endDaysAgo = 1, perWeek = 3, unit = 'lb', feel = false, bodyStart = 185, setsPerLift = 3 }) {
  const bench = b.exercise('barbell_bench_press', { uses_barbell: true })
  const ohp = b.exercise('overhead_press', { uses_barbell: true })
  const pushdown = b.exercise('Cable Tricep Pushdown', { muscle_group: 'arms', push_pull: 'push' })
  const row = b.exercise('barbell_row', { uses_barbell: true })
  const pulldown = b.exercise('lat_pulldown')
  const curl = b.exercise('dumbbell_curl')
  const squat = b.exercise('barbell_back_squat', { uses_barbell: true })
  const rdl = b.exercise('romanian_deadlift', { uses_barbell: true })
  const legPress = b.exercise('leg_press')
  const push = b.template('Push Day', [bench, ohp, pushdown], { category: 'upper' })
  const pull = b.template('Pull Day', [row, pulldown, curl], { category: 'upper' })
  const legs = b.template('Leg Day', [squat, rdl, legPress], { category: 'lower' })
  const kg = unit === 'kg'
  const scale = kg ? 0.45 : 1
  const step = kg ? 2.5 : 5
  const plan = [
    { template: push, lifts: [[bench, 135], [ohp, 85], [pushdown, 50]] },
    { template: pull, lifts: [[row, 115], [pulldown, 100], [curl, 25]] },
    { template: legs, lifts: [[squat, 185], [rdl, 155], [legPress, 270]] },
  ]
  const days = [0, 2, 4].slice(0, perWeek)
  let n = 0
  for (let week = weeks - 1; week >= 0; week--) {
    days.forEach((dayOffset, i) => {
      const daysAgo = endDaysAgo + week * 7 + (4 - dayOffset)
      const { template, lifts } = plan[(n + i) % 3]
      const progress = Math.floor((weeks - week) / 2)
      const sets = lifts.flatMap(([exercise, base], li) => {
        const weight = roundTo(base * scale + progress * step * (li === 2 ? 0.5 : 1), step)
        const reps = 5 + Math.floor(b.random() * 4)
        return b.block(exercise, weight, reps, setsPerLift, { unit, rpe: li === 0 ? 7 + Math.floor(b.random() * 3) : null })
      })
      const tags = feel
        ? {
            sleep: ['under_6', '6_to_8', 'over_8'][Math.floor(b.random() * 3)],
            energy: ['low', 'ok', 'high'][Math.floor(b.random() * 3)],
            stress: ['low', 'ok', 'high'][Math.floor(b.random() * 3)],
          }
        : null
      b.workout({ daysAgo, template, sets, feel: tags })
    })
    n += days.length
    b.weighIn(endDaysAgo + week * 7 + 1, roundTo(bodyStart - (weeks - week) * 0.3, 0.1), kg ? 'kg' : 'lb')
  }
  return { bench, ohp, pushdown, row, pulldown, curl, squat, rdl, legPress, push, pull, legs }
}

// Every scenario: key -> what it's for and how to build it. A test case
// names its scenario in scripts/qa/procedure.mjs; its file is named after the
// test case.
export const SCENARIOS = {
  typical: {
    about: '12 weeks of push / pull / legs, three times a week, in lb, with weekly weigh-ins.',
    build(now) {
      const b = new Builder(now, 11)
      pplLifter(b, { weeks: 12 })
      return b.backup()
    },
  },
  typicalKg: {
    about: 'The typical 12 weeks, logged in kg with decimal weights like 22.5 and 61.25.',
    build(now) {
      const b = new Builder(now, 12)
      const lifts = pplLifter(b, { weeks: 12, unit: 'kg', bodyStart: 84 })
      b.workout({ daysAgo: 0.5, sets: b.block(lifts.curl, 11.25, 10, 3, { unit: 'kg' }) })
      return b.backup({ profile: { ...DEFAULT_PROFILE, weight_unit: 'kg', height: 178, height_unit: 'cm' } })
    },
  },
  exercisesOnly: {
    about: 'Exercises and three templates, no workouts yet: a fresh start that skips onboarding.',
    build(now) {
      const b = new Builder(now, 13)
      const bench = b.exercise('barbell_bench_press')
      const squat = b.exercise('barbell_back_squat')
      const row = b.exercise('barbell_row')
      const ohp = b.exercise('overhead_press')
      const deadlift = b.exercise('deadlift')
      const pulldown = b.exercise('lat_pulldown')
      b.template('Full Body A', [squat, bench, row], { category: 'full' })
      b.template('Full Body B', [deadlift, ohp, pulldown], { category: 'full' })
      b.template('Upper', [bench, row, ohp], { category: 'upper' })
      return b.backup()
    },
  },
  threeTemplates: {
    about: 'Exactly 3 templates (the free limit) and a few weeks of history, for the store build.',
    build(now) {
      const b = new Builder(now, 14)
      pplLifter(b, { weeks: 3 })
      return b.backup()
    },
  },
  allLoadTypes: {
    about: 'One exercise of each load type (weight, level, body weight, assisted, timed with distance, incline, calories) with a few sessions each.',
    build(now) {
      const b = new Builder(now, 15)
      const bench = b.exercise('barbell_bench_press')
      const bike = b.exercise('Spin Bike Intervals', { load_type: 'level', muscle_group: 'cardio' })
      const pushUp = b.exercise('push_up')
      const assisted = b.exercise('assisted_pull_up')
      const treadmill = b.exercise('treadmill', { tracks_incline: true, tracks_calories: true })
      const plank = b.exercise('plank')
      b.template('Everything', [bench, bike, pushUp, assisted, treadmill, plank], { category: 'full', targetSets: 2 })
      for (let i = 4; i >= 1; i--) {
        b.workout({
          daysAgo: i * 3,
          sets: [
            ...b.block(bench, 135 + (4 - i) * 5, 8, 2),
            ...b.block(bike, 0, 10, 2, { level: 6 + (4 - i) }),
            ...b.block(pushUp, 0, 15 + (4 - i), 2),
            ...b.block(assisted, 70 - (4 - i) * 10, 8, 2),
            { exercise: treadmill, reps: null, weight: 0, duration_seconds: 1200, distance: 1.5 + (4 - i) * 0.1, distance_unit: 'mi', incline: 2, calories: 180 },
            { exercise: plank, reps: null, weight: 0, duration_seconds: 45 + (4 - i) * 15 },
          ],
        })
      }
      return b.backup()
    },
  },
  messy: {
    about: 'Edge-case content: a very long exercise name, emoji and line breaks in notes, decimal kg, and one old typo set (999 lb).',
    build(now) {
      const b = new Builder(now, 16)
      const long = b.exercise('Single-Arm Half-Kneeling Landmine Press With Pause At The Top (Left Side First)', { muscle_group: 'shoulders', setup_notes: 'Pad on the left knee 🦵, stand on the yellow line.\nKeep the elbow soft.' })
      const curl = b.exercise('dumbbell_curl')
      const bench = b.exercise('barbell_bench_press')
      b.template('Shoulders 💪 + arms, the long one with a really long name', [long, curl], { category: 'upper' })
      for (let i = 6; i >= 1; i--) {
        b.workout({
          daysAgo: i * 4,
          notes: i === 3 ? 'Gym was packed 😤 had to wait for the landmine.\nShoulder felt 👌 after.' : null,
          sets: [...b.block(long, 17.5 + (6 - i) * 1.25, 10, 3, { unit: 'kg' }), ...b.block(curl, 12.5, 12, 3, { unit: 'kg' })],
        })
      }
      b.workout({ daysAgo: 30, sets: [{ exercise: bench, weight: 999, reps: 1 }, ...b.block(bench, 135, 8, 2)] })
      return b.backup({ profile: { ...DEFAULT_PROFILE, weight_unit: 'kg' } })
    },
  },
  returning: {
    about: '6 months of history that stops 5 weeks ago, as if back after a break.',
    build(now) {
      const b = new Builder(now, 17)
      pplLifter(b, { weeks: 26, endDaysAgo: 35 })
      return b.backup()
    },
  },
  fiveYears: {
    about: 'Five years, four workouts a week, about 15,000 sets: for speed checks.',
    build(now) {
      const b = new Builder(now, 18)
      const lifts = pplLifter(b, { weeks: 260, perWeek: 3, setsPerLift: 5 })
      // A fourth weekly session, so it's about 4 a week.
      for (let week = 259; week >= 0; week--) {
        b.workout({
          daysAgo: week * 7 + 6,
          sets: [...b.block(lifts.bench, 135 + Math.floor((260 - week) / 8) * 5, 8, 5), ...b.block(lifts.row, 115, 10, 5), ...b.block(lifts.curl, 25, 12, 5)],
        })
      }
      return b.backup()
    },
  },
  plateau: {
    about: 'Bench Press climbs for 6 weeks, then sits at the same best for 5 sessions over 4+ weeks, with missed targets at RPE 9 to 10.',
    build(now) {
      const b = new Builder(now, 19)
      const bench = b.exercise('barbell_bench_press', { uses_barbell: true, rep_range_min: 5, rep_range_max: 8 })
      const row = b.exercise('barbell_row')
      const push = b.template('Push', [bench, row], { category: 'upper' })
      // Climb: 155 to 180 over 6 weeks.
      for (let i = 0; i < 6; i++) {
        b.workout({ daysAgo: 70 - i * 7, template: push, sets: [...b.block(bench, 155 + i * 5, 6, 3, { rpe: 8 }), ...b.block(row, 135, 8, 3)] })
      }
      // Flat: 5 sessions at 180 x 5 or fewer, never beating the best.
      const flat = [5, 4, 5, 4, 4]
      flat.forEach((reps, i) => {
        b.workout({ daysAgo: 30 - i * 7, template: push, sets: [...b.block(bench, 180, reps, 3, { rpe: 9.5 }), ...b.block(row, 135, 8, 3)] })
      })
      return b.backup()
    },
  },
  strength: {
    about: 'Main lifts (squat, bench, deadlift, overhead press, row, pull-up) for 8 weeks, plus body weight and height for strength levels.',
    build(now) {
      const b = new Builder(now, 20)
      const squat = b.exercise('barbell_back_squat')
      const bench = b.exercise('barbell_bench_press')
      const deadlift = b.exercise('deadlift')
      const ohp = b.exercise('overhead_press')
      const row = b.exercise('barbell_row')
      const pullUp = b.exercise('pull_up')
      for (let w = 7; w >= 0; w--) {
        const p = 7 - w
        b.workout({ daysAgo: w * 7 + 4, sets: [...b.block(squat, 225 + p * 5, 5), ...b.block(bench, 175 + p * 5, 5), ...b.block(row, 155, 8)] })
        b.workout({ daysAgo: w * 7 + 1, sets: [...b.block(deadlift, 275 + p * 10, 5, 1), ...b.block(ohp, 105 + p * 2.5, 5), ...b.block(pullUp, 0, 6 + Math.floor(p / 3))] })
        b.weighIn(w * 7 + 2, 182)
      }
      return b.backup()
    },
  },
  lastMonth: {
    about: 'Workouts across last month and the month before it, with records, for the monthly report.',
    build(now) {
      const b = new Builder(now, 21)
      const daysIntoMonth = now.getDate()
      pplLifter(b, { weeks: 9, endDaysAgo: daysIntoMonth })
      return b.backup()
    },
  },
  emptyLastMonth: {
    about: 'History that stops two months ago, so last month has no workouts.',
    build(now) {
      const b = new Builder(now, 22)
      pplLifter(b, { weeks: 8, endDaysAgo: now.getDate() + 35 })
      return b.backup()
    },
  },
  year: {
    about: '12 months of training with a two-week holiday gap, for the training calendar and long chart ranges.',
    build(now) {
      const b = new Builder(now, 23)
      pplLifter(b, { weeks: 20, endDaysAgo: 1 })
      pplLifter(b, { weeks: 30, endDaysAgo: 160 })
      return b.backup()
    },
  },
  feel: {
    about: '14 workouts, each tagged with sleep, energy, and stress, for What helps you lift.',
    build(now) {
      const b = new Builder(now, 24)
      pplLifter(b, { weeks: 5, feel: true })
      return b.backup()
    },
  },
  balanceSkew: {
    about: 'Four weeks of mostly pushing (bench, press, dips, pushdowns) with very little pulling or legs.',
    build(now) {
      const b = new Builder(now, 25)
      const bench = b.exercise('barbell_bench_press')
      const ohp = b.exercise('overhead_press')
      const dip = b.exercise('chest_dip')
      const incline = b.exercise('incline_dumbbell_press')
      const row = b.exercise('seated_cable_row')
      const mystery = b.exercise('Gym Machine 7', { muscle_group: 'back' })
      for (let i = 11; i >= 0; i--) {
        b.workout({ daysAgo: i * 2 + 1, sets: [...b.block(bench, 155, 8, 4), ...b.block(ohp, 95, 8, 3), ...b.block(dip, 0, 12, 3), ...b.block(incline, 50, 10, 3), ...(i % 4 === 0 ? b.block(row, 120, 10, 2) : []), ...(i === 2 ? b.block(mystery, 80, 10, 2) : [])] })
      }
      return b.backup()
    },
  },
  milestoneNear: {
    about: '9 finished workouts with the first milestones already seen, so finishing one more crosses 10 workouts (a trial pass on the store build).',
    build(now) {
      const b = new Builder(now, 26)
      pplLifter(b, { weeks: 3, endDaysAgo: 2 })
      return b.backup({ extra: { milestones_seen: ['workouts-1', 'workouts-5', 'records-1'], trial_passes: { granted: [], trials: [], endNoted: 0 } } })
    },
  },
  strongWeeksNear: {
    about: '11 strong weeks (two workouts each, Monday and Wednesday, none this week) at steady weights so no record tiers are in play, with the first milestones already seen. Finishing one workout today crosses 12 strong weeks (a trial pass on the store build). Restore after Account > Erase all data.',
    build(now) {
      const b = new Builder(now, 31)
      const bench = b.exercise('barbell_bench_press', { uses_barbell: true })
      const row = b.exercise('barbell_row', { uses_barbell: true })
      const sinceSunday = now.getDay()
      for (let k = 11; k >= 1; k--) {
        const weekStart = sinceSunday + 7 * k
        b.workout({ daysAgo: weekStart - 1, sets: b.block(bench, 135, 8, 3) })
        b.workout({ daysAgo: weekStart - 3, sets: b.block(row, 115, 8, 3) })
      }
      return b.backup({ extra: { milestones_seen: ['workouts-1', 'workouts-5', 'workouts-10', 'strongWeeks-4'], trial_passes: { granted: [], trials: [], endNoted: 0 } } })
    },
  },
  trialUnused: {
    about: '12 workouts with one trial pass earned and not started yet.',
    build(now) {
      const b = new Builder(now, 27)
      pplLifter(b, { weeks: 4 })
      return b.backup({ extra: { milestones_seen: ['workouts-1', 'workouts-5', 'workouts-10', 'records-1'], trial_passes: { granted: ['workouts-10'], trials: [], endNoted: 0 } } })
    },
  },
  trialEnding: {
    about: 'A Lift progress trial pass started 6 days and 20 hours ago, so it ends a few hours from now. Restoring merges trials into the ones already on the phone and never replaces them, so run Account > Erase all data first or an earlier trial wins.',
    build(now) {
      const b = new Builder(now, 28)
      pplLifter(b, { weeks: 4 })
      const startedAt = new Date(now.getTime() - 6 * DAY_MS - 20 * 3_600_000).toISOString()
      return b.backup({ extra: { milestones_seen: ['workouts-1', 'workouts-5', 'workouts-10', 'records-1'], trial_passes: { granted: ['workouts-10'], trials: [{ feature: 'progress', startedAt }], endNoted: 0 } } })
    },
  },
  trialEnded: {
    about: 'A Lift progress trial pass that ended yesterday and hasn\'t shown its end note yet. Restoring merges trials into the ones already on the phone and never replaces them, so run Account > Erase all data first or an earlier trial wins.',
    build(now) {
      const b = new Builder(now, 29)
      pplLifter(b, { weeks: 4 })
      const startedAt = new Date(now.getTime() - 8 * DAY_MS).toISOString()
      return b.backup({ extra: { milestones_seen: ['workouts-1', 'workouts-5', 'workouts-10', 'records-1'], trial_passes: { granted: ['workouts-10'], trials: [{ feature: 'progress', startedAt }], endNoted: 0 } } })
    },
  },
  templateProgress: {
    about: 'One template done 8 times over 8 weeks, with a workout note on the session that dipped.',
    build(now) {
      const b = new Builder(now, 30)
      const squat = b.exercise('barbell_back_squat')
      const press = b.exercise('leg_press')
      const curl = b.exercise('seated_leg_curl')
      const legs = b.template('Leg Day', [squat, press, curl], { category: 'lower' })
      for (let i = 7; i >= 0; i--) {
        const dip = i === 3
        b.workout({ daysAgo: i * 7 + 1, template: legs, notes: dip ? 'Slept 4 hours, cut it short.' : null, sets: [...b.block(squat, 205 + (7 - i) * 5, dip ? 3 : 5), ...b.block(press, 300, 10, dip ? 1 : 3), ...b.block(curl, 90, 12)] })
      }
      return b.backup()
    },
  },
  storyMarkers: {
    about: 'A template history with a swap (Leg Press taken, did Hack Squat), a skipped exercise, and a short finish, saved as workout events.',
    build(now) {
      const b = new Builder(now, 31)
      const squat = b.exercise('barbell_back_squat')
      const press = b.exercise('leg_press')
      const hack = b.exercise('hack_squat')
      const curl = b.exercise('seated_leg_curl')
      const legs = b.template('Leg Day', [squat, press, curl], { category: 'lower' })
      const ref = (e) => ({ id: e.id, name: e.name })
      for (let i = 5; i >= 0; i--) {
        let events = null
        let sets = [...b.block(squat, 225, 5), ...b.block(press, 320, 10), ...b.block(curl, 90, 12)]
        if (i === 3) {
          events = [{ type: 'swap', from: ref(press), to: ref(hack), sets: 3 }]
          sets = [...b.block(squat, 225, 5), ...b.block(hack, 180, 10), ...b.block(curl, 90, 12)]
        }
        if (i === 1) {
          events = [{ type: 'skip', exercise: ref(curl) }, { type: 'unfinished', sets: 2, exercises: [{ ...ref(press), left: 2 }] }]
          sets = [...b.block(squat, 230, 5), ...b.block(press, 320, 10, 1)]
        }
        b.workout({ daysAgo: i * 6 + 1, template: legs, events, sets })
      }
      return b.backup()
    },
  },
  unlinked: {
    about: 'Own exercises with gym nicknames (Flat DB Bench, Lat Pull, Hammer Strength Row) that aren\'t linked to the library, and no push or pull set.',
    build(now) {
      const b = new Builder(now, 32)
      const db = b.exercise('Flat DB Bench', { muscle_group: 'chest' })
      const lat = b.exercise('Lat Pull', { muscle_group: 'back' })
      const hs = b.exercise('Hammer Strength Row', { muscle_group: 'back' })
      const sq = b.exercise('Squats', { muscle_group: 'legs' })
      for (let i = 5; i >= 0; i--) {
        b.workout({ daysAgo: i * 3 + 1, sets: [...b.block(db, 60, 10), ...b.block(lat, 120, 10), ...b.block(hs, 90, 10), ...b.block(sq, 185, 6)] })
      }
      b.weighIn(2, 176)
      return b.backup()
    },
  },
  bodyStats: {
    about: '6 months of weekly weigh-ins and monthly tape measurements (in), plus height.',
    build(now) {
      const b = new Builder(now, 33)
      pplLifter(b, { weeks: 4 })
      for (let w = 25; w >= 0; w--) b.weighIn(w * 7 + 3, roundTo(196 - (25 - w) * 0.4, 0.1))
      for (let m = 5; m >= 0; m--) b.measure(m * 30 + 4, { waist: 36 - (5 - m) * 0.25, chest: 41 + (5 - m) * 0.1, hips: 40, arms: 14.5 + (5 - m) * 0.1, thighs: 23, neck: 15.5 })
      return b.backup()
    },
  },
  plates: {
    about: 'Barbell lifts in lb and kg, one on a women\'s bar and one with a custom bar weight, for the plate calculator.',
    build(now) {
      const b = new Builder(now, 34)
      const squat = b.exercise('barbell_back_squat', { uses_barbell: true })
      const bench = b.exercise('barbell_bench_press', { uses_barbell: true, bar_type: 'womens' })
      const ez = b.exercise('ez_bar_curl', { uses_barbell: true, bar_type: 'custom', bar_custom_weight: 10, bar_custom_unit: 'kg' })
      for (let i = 3; i >= 0; i--) {
        b.workout({ daysAgo: i * 3 + 1, sets: [...b.block(squat, 227.5, 5), ...b.block(bench, 102.5, 5, 3, { unit: 'kg' }), ...b.block(ez, 32.5, 10, 3, { unit: 'kg' })] })
      }
      return b.backup()
    },
  },
  everyTable: {
    about: 'At least a few rows in every table (sets of each load type, templates, weigh-ins, measurements, feel tags, workout events): install on the old build before an update.',
    build(now) {
      const b = new Builder(now, 35)
      const lifts = pplLifter(b, { weeks: 2, feel: true })
      const treadmill = b.exercise('treadmill', { tracks_incline: true })
      const assisted = b.exercise('assisted_pull_up')
      const plank = b.exercise('plank')
      const bike = b.exercise('Bike Level Test', { load_type: 'level', muscle_group: 'cardio' })
      b.workout({
        daysAgo: 0.3,
        notes: 'Mixed bag day ✅',
        feel: { sleep: 'over_8', energy: 'high', stress: 'low' },
        events: [{ type: 'skip', exercise: { id: lifts.curl.id, name: lifts.curl.name } }],
        sets: [
          { exercise: treadmill, reps: null, weight: 0, duration_seconds: 900, distance: 1.2, distance_unit: 'mi', incline: 3 },
          ...b.block(assisted, 50, 8, 2),
          { exercise: plank, reps: null, weight: 0, duration_seconds: 60 },
          ...b.block(bike, 0, 12, 2, { level: 8 }),
        ],
      })
      b.measure(5, { waist: 34.5, chest: 42, hips: 39, arms: 15, thighs: 23.5, neck: 15.75 })
      return b.backup({ extra: { milestones_seen: ['workouts-1', 'workouts-5', 'records-1'] } })
    },
  },
  partialTemplates: {
    about: 'A partial backup with templates and exercises only (merges, nothing deleted).',
    build(now) {
      const b = new Builder(now, 36)
      const squat = b.exercise('goblet_squat')
      const row = b.exercise('dumbbell_row')
      const press = b.exercise('dumbbell_bench_press')
      b.template('Hotel Gym', [squat, row, press], { category: 'full' })
      return b.backup({ includes: ['templates'] })
    },
  },
  v1Backup: {
    about: 'An old version 1 backup (from before partial backups), 4 weeks of history.',
    build(now) {
      const b = new Builder(now, 37)
      pplLifter(b, { weeks: 4 })
      const file = b.backup()
      const { weight_unit, prefill_mode, default_rest_seconds, ...v1Profile } = file.profile
      return { ...file, version: 1, includes: undefined, profile: v1Profile, body_measurements: undefined }
    },
  },
}

// Files that aren't backups built from a scenario: the broken and foreign
// files, and the import CSVs. `kind` says how the unit spec checks it.
const STRONG_HEADER = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'
const HEVY_HEADER = '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"'

function strongCsv(now) {
  const lines = [STRONG_HEADER]
  const pad = (n) => String(n).padStart(2, '0')
  for (let w = 7; w >= 0; w--) {
    for (const [offset, name, lifts] of [
      [5, 'Push Day', [['Bench Press (Barbell)', 135], ['Overhead Press (Barbell)', 85], ['Triceps Pushdown (Cable - Straight Bar)', 50]]],
      [3, 'Pull Day', [['Bent Over Row (Barbell)', 115], ['Lat Pulldown (Cable)', 100], ['Bicep Curl (Dumbbell)', 25]]],
      [1, 'Leg Day', [['Squat (Barbell)', 185], ['Romanian Deadlift (Barbell)', 155], ['Leg Press', 270]]],
    ]) {
      const d = new Date(now.getTime() - (w * 7 + offset) * DAY_MS)
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 18:05:00`
      lifts.forEach(([exercise, base], li) => {
        if (li === 0) lines.push(`${stamp},"${name}",58m,"${exercise}",W,${base - 40},10,0,0,"","",`)
        for (let s = 1; s <= 3; s++) lines.push(`${stamp},"${name}",58m,"${exercise}",${s},${base + (7 - w) * 5},${6 + (s % 2)},0,0,"","",${li === 0 ? 8 : ''}`)
        if (li === 0) lines.push(`${stamp},"${name}",58m,"${exercise}",Rest Timer,0,0,0,120,"","",`)
      })
    }
  }
  const d = new Date(now.getTime() - 2 * DAY_MS)
  lines.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 07:30:00,"Morning cardio",25m,"Running (Treadmill)",1,0,0,2.1,1500,"","",`)
  return lines.join('\n') + '\n'
}

function hevyCsv(now) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const stamp = (d, h) => `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${String(h).padStart(2, '0')}:05`
  const lines = [HEVY_HEADER]
  for (let w = 5; w >= 0; w--) {
    const d = new Date(now.getTime() - (w * 7 + 2) * DAY_MS)
    const q = (v) => `"${v}"`
    const row = (ex, i, type, kg, reps, extra = ',,') => [q('Upper'), q(stamp(d, 18)), q(stamp(d, 19)), q(''), q(ex), '', q(''), i, q(type), kg, reps, extra, ''].join(',')
    lines.push(row('Bench Press (Barbell)', 0, 'warmup', 40, 10))
    for (let s = 1; s <= 3; s++) lines.push(row('Bench Press (Barbell)', s, 'normal', 80 + (5 - w) * 2.5, 6))
    for (let s = 0; s < 3; s++) lines.push(row('Pull Up (Assisted)', s, 'normal', -20 + (5 - w) * 2.5, 8))
    lines.push([q('Upper'), q(stamp(d, 18)), q(stamp(d, 19)), q(''), q('Plank'), '', q(''), 0, q('normal'), '', '', '', 60, ''].join(','))
  }
  return lines.join('\n') + '\n'
}

export const RAW_FILES = {
  corruptBackup: {
    about: 'A RepBunny backup cut off halfway through (not valid JSON).',
    ext: 'json',
    kind: 'rejected-backup',
    build(now) {
      const text = JSON.stringify(SCENARIOS.typical.build(now))
      return text.slice(0, Math.floor(text.length / 2))
    },
  },
  foreignBackup: {
    about: 'Valid JSON from another app (a Strong-style export), not a RepBunny backup.',
    ext: 'json',
    kind: 'rejected-backup',
    build() {
      return JSON.stringify({ app: 'Strong', exportVersion: 3, workouts: [{ name: 'Push Day', sets: [{ exercise: 'Bench Press (Barbell)', weight: 135, reps: 8 }] }] }, null, 2)
    },
  },
  strongCsv: { about: '8 weeks of Strong history (lb, no unit column), with warm-ups, rest-timer rows, and a treadmill run.', ext: 'csv', kind: 'import-strong', build: strongCsv },
  hevyCsv: { about: '6 weeks of Hevy history in kg, with warm-ups, an assisted pull-up (negative weight), and planks.', ext: 'csv', kind: 'import-hevy', build: hevyCsv },
  wrongAppCsv: {
    about: 'RepBunny\'s own sets CSV export, which isn\'t a Strong or Hevy file.',
    ext: 'csv',
    kind: 'import-unknown',
    build() {
      return 'date,workout,exercise,set,weight,weight_unit,reps,rpe,level,duration_seconds,distance,distance_unit,incline,calories,sleep,energy,stress\r\n2026-09-01T18:00:00.000Z,Push Day,Barbell Bench Press,1,135,lb,8,,,,,,,,,,\r\n'
    },
  },
  brokenStrongCsv: {
    about: 'A Strong export with the right header but broken rows (missing columns, a date that isn\'t one, text where weight goes).',
    ext: 'csv',
    kind: 'import-strong-broken',
    build(now) {
      const good = strongCsv(now).split('\n').slice(0, 6)
      return [...good, 'not a date,"Push Day",1h,"Bench Press (Barbell)",1,heavy,8,0,0,"","",', '2024-01-01 10:00:00,"Cut off row"', ''].join('\n')
    },
  },
}

export const FILE_KINDS = Object.fromEntries(Object.entries(RAW_FILES).map(([key, f]) => [key, f.kind]))

// "TC-PROG-014 plateau flat lift.json"
export function fixtureFileName(testCase) {
  const raw = RAW_FILES[testCase.data.scenario]
  const ext = raw ? raw.ext : 'json'
  return `${testCase.id} ${testCase.data.label}.${ext}`
}

// Every test case's file: { folder, name, contents, testCase, scenario }.
export function buildFixtureFiles(testCases, areas, now = new Date()) {
  const areaById = new Map(areas.map((a) => [a.id, a]))
  const cache = new Map()
  return testCases
    .filter((tc) => tc.data)
    .map((tc) => {
      const key = tc.data.scenario
      if (!cache.has(key)) {
        const raw = RAW_FILES[key]
        const scenario = SCENARIOS[key]
        if (!raw && !scenario) throw new Error(`${tc.id}: unknown scenario "${key}"`)
        cache.set(key, raw ? raw.build(now) : JSON.stringify(scenario.build(now), null, 1))
      }
      const area = areaById.get(tc.area)
      return { folder: `${area.id} ${area.name}`, name: fixtureFileName(tc), contents: cache.get(key), testCase: tc, scenario: key }
    })
}

const aboutOf = (key) => (RAW_FILES[key] ?? SCENARIOS[key]).about
const kindOf = (key) => (RAW_FILES[key]?.ext === 'csv' ? 'csv' : 'json')

// What the page lists for each file, without building any of them.
export function fixtureManifest(testCases, areas) {
  const areaById = new Map(areas.map((a) => [a.id, a]))
  return Object.fromEntries(
    testCases
      .filter((tc) => tc.data)
      .map((tc) => {
        const area = areaById.get(tc.area)
        return [tc.id, { folder: `${area.id} ${area.name}`, name: fixtureFileName(tc), about: aboutOf(tc.data.scenario), kind: kindOf(tc.data.scenario) }]
      }),
  )
}

// Journeys that start from a file get one in a Journeys folder.
export function journeyManifest(journeys) {
  return Object.fromEntries(
    journeys.filter((j) => j.data).map((j) => [j.id, { folder: 'Journeys', name: `${j.title}.json`, about: aboutOf(j.data), kind: 'json' }]),
  )
}

export function buildJourneyFiles(journeys, now = new Date()) {
  const manifest = journeyManifest(journeys)
  return journeys
    .filter((j) => j.data)
    .map((j) => ({ ...manifest[j.id], contents: JSON.stringify(SCENARIOS[j.data].build(now), null, 1) }))
}
