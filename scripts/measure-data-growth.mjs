// Issue #117: how fast does on-device data grow against Android Auto Backup's
// 25 MB per-app cap? Builds a heavy-but-normal user's history in the local
// SQLite schema (src/data/sqlite/schema.ts, applied with sql.js, the same
// engine the browser local mode uses) and prints, at 1, 2, 5 and 10 simulated
// years: the database file size before and after VACUUM, a full backup JSON
// in the Account > Your data format, and that JSON gzipped. Then extrapolates
// when the database alone, and the database plus 10 restore points, reach
// the cap. Results are written up in docs/architecture.md ("Android backup").
//
// One-off measurement tool, not part of the e2e gate:
//   node scripts/measure-data-growth.mjs
//
// Needs Node 22.18+ (imports the TypeScript schema directly).

import { randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import initSqlJs from 'sql.js'
import { MIGRATIONS } from '../src/data/sqlite/schema.ts'

const CAP_BYTES = 25_000_000
const RESTORE_POINTS = 10
const CHECKPOINT_YEARS = [1, 2, 5, 10]
const WORKOUTS_PER_WEEK = 5
const TEMPLATES = 5
const EXERCISES_PER_TEMPLATE = 6
const SETS_PER_EXERCISE = 4

// Deterministic, so two runs print the same table.
let seed = 117
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = (items) => items[Math.floor(random() * items.length)]
const chance = (p) => random() < p

const SQL = await initSqlJs()
const db = new SQL.Database()
db.run('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
MIGRATIONS.forEach((statements, i) => {
  for (const statement of statements) db.run(statement)
  db.run('INSERT INTO schema_version (version) VALUES (?)', [i + 1])
})
db.run(`UPDATE settings SET height = 70, height_unit = 'in', weight_unit = 'lb', default_rest_seconds = 120`)

function insert(table, row) {
  const columns = Object.keys(row)
  db.run(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => row[c]),
  )
}

// ---- Exercises and templates -------------------------------------------------

const MUSCLES = ['chest', 'back', 'shoulders', 'arms', 'core', 'glutes', 'legs']
const exercises = []
for (let t = 0; t < TEMPLATES; t++) {
  for (let e = 0; e < EXERCISES_PER_TEMPLATE; e++) {
    const n = exercises.length
    // A few timed holds (planks, carries) so some sets carry duration_seconds.
    const timed = n % 10 === 9
    const exercise = {
      id: randomUUID(),
      name: `Exercise ${n + 1} (${pick(['Barbell', 'Dumbbell', 'Cable', 'Machine'])})`,
      setup_notes: chance(0.3) ? 'Seat on 4, handles at chest height. Pause at the bottom.' : null,
      rest_seconds: chance(0.5) ? pick([60, 90, 120, 180]) : null,
      load_type: timed ? 'timed' : 'weight',
      muscle_group: MUSCLES[n % MUSCLES.length],
      also_works: JSON.stringify(chance(0.5) ? [pick(MUSCLES)] : []),
      library_id: chance(0.8) ? `lib-${String(n).padStart(3, '0')}` : null,
      uses_barbell: timed ? null : chance(0.4) ? 1 : 0,
      weight_step: chance(0.3) ? 5 : null,
      weight_step_unit: null,
      rep_range_min: timed ? null : 8,
      rep_range_max: timed ? null : 12,
      // Starting weight for the simulated progression.
      baseWeight: timed ? 0 : 45 + Math.round(random() * 150 / 5) * 5,
      timed,
    }
    if (exercise.weight_step) exercise.weight_step_unit = 'lb'
    exercises.push(exercise)
  }
}
// A handful of extra exercises the user tried once and archived.
for (let i = 0; i < 8; i++) {
  exercises.push({ id: randomUUID(), name: `Archived exercise ${i + 1}`, is_archived: 1, muscle_group: pick(MUSCLES), also_works: '[]', library_id: `lib-x${i}` })
}
for (const { baseWeight, timed, ...row } of exercises) insert('exercises', row)

const templates = []
for (let t = 0; t < TEMPLATES; t++) {
  const template = { id: randomUUID(), name: `Day ${t + 1}`, category: pick(['upper', 'lower', 'full']) }
  insert('workout_templates', template)
  const members = exercises.slice(t * EXERCISES_PER_TEMPLATE, (t + 1) * EXERCISES_PER_TEMPLATE)
  members.forEach((exercise, position) =>
    insert('workout_template_exercises', { id: randomUUID(), template_id: template.id, exercise_id: exercise.id, position, target_sets: SETS_PER_EXERCISE }),
  )
  templates.push({ ...template, members })
}

// ---- Workouts, one simulated year at a time -----------------------------------

const NOTES = ['Felt strong today.', 'Left shoulder a bit sore, went lighter on presses.', 'Short on time, cut rest.', 'New gym, different machines.', 'Great pump.']
const DAY_MS = 24 * 60 * 60 * 1000
const start = Date.UTC(2026, 0, 5, 17, 30)
let workoutCount = 0
let setCount = 0
let weighInCount = 0
let bodyWeight = 185

function simulateYear(year) {
  db.run('BEGIN')
  for (let week = 0; week < 52; week++) {
    for (let day = 0; day < WORKOUTS_PER_WEEK; day++) {
      const when = new Date(start + ((year * 52 + week) * 7 + day) * DAY_MS + Math.floor(random() * 3 * 60 * 60 * 1000))
      const template = templates[workoutCount % TEMPLATES]
      const workout = { id: randomUUID(), template_id: template.id, performed_at: when.toISOString(), notes: chance(0.15) ? pick(NOTES) : null }
      insert('workouts', workout)
      workoutCount++
      // Slow linear progress, capped so 10-year numbers stay human.
      const progress = Math.min(1.6, 1 + (year * 52 + week) / 1000)
      template.members.forEach((exercise) => {
        for (let s = 0; s < SETS_PER_EXERCISE; s++) {
          const set = { id: randomUUID(), workout_id: workout.id, exercise_id: exercise.id, set_index: s, weight_unit: 'lb' }
          if (exercise.timed) {
            Object.assign(set, { weight: 0, reps: null, duration_seconds: 30 + Math.round(random() * 6) * 5 })
          } else {
            Object.assign(set, {
              weight: Math.round((exercise.baseWeight * progress) / 2.5) * 2.5,
              reps: 6 + Math.floor(random() * 7),
              rpe: chance(0.3) ? pick([7, 7.5, 8, 8.5, 9]) : null,
            })
          }
          insert('sets', set)
          setCount++
        }
      })
    }
    // About one weigh-in a week.
    if (chance(0.8)) {
      bodyWeight = Math.round((bodyWeight + (random() - 0.55) * 1.5) * 10) / 10
      const when = new Date(start + (year * 52 + week) * 7 * DAY_MS + 7 * 60 * 60 * 1000)
      insert('body_weight_entries', { id: randomUUID(), weight: bodyWeight, weight_unit: 'lb', recorded_at: when.toISOString() })
      weighInCount++
    }
  }
  db.run('COMMIT')
}

// The client error log is capped at 200 rows (repos.ts CLIENT_ERROR_LIMIT);
// fill it once with stack-trace-sized rows as a fixed worst case.
const STACK = Array.from({ length: 12 }, (_, i) => `    at handler${i} (capacitor://localhost/assets/index-a1b2c3d4.js:1:${10000 + i * 777})`).join('\n')
db.run('BEGIN')
for (let i = 0; i < 200; i++) {
  insert('client_errors', {
    id: randomUUID(),
    occurred_at: new Date(start + i * DAY_MS).toISOString(),
    kind: 'error',
    message: "TypeError: Cannot read properties of undefined (reading 'id')",
    stack: `TypeError: Cannot read properties of undefined (reading 'id')\n${STACK}`,
    route: '/log',
    context: JSON.stringify({ component: 'WorkoutLogger' }),
    app_version: '1.0.0 (412)',
    user_agent: 'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  })
}
db.run('COMMIT')

// ---- Backup JSON, shaped like buildBackup() in local mode ---------------------
// Mirrors repos.ts decode(): 0/1 booleans become true/false, JSON text
// columns are parsed, and owned tables carry user_id 'local'.

const DECODE = {
  exercises: { booleans: ['is_archived', 'tracks_distance', 'tracks_incline', 'tracks_level', 'tracks_calories', 'uses_barbell'], json: ['also_works'], owned: true },
  workout_templates: { booleans: ['is_archived'], owned: true },
  workout_template_exercises: {},
  workouts: { owned: true },
  sets: {},
  body_weight_entries: { owned: true },
}

function rows(table) {
  const spec = DECODE[table]
  const statement = db.prepare(`SELECT * FROM ${table} ORDER BY id`)
  const out = []
  while (statement.step()) {
    const row = statement.getAsObject()
    for (const c of spec.booleans ?? []) if (row[c] !== null) row[c] = row[c] === 1
    for (const c of spec.json ?? []) if (row[c] !== null) row[c] = JSON.parse(row[c])
    if (spec.owned) row.user_id = 'local'
    out.push(row)
  }
  statement.free()
  return out
}

function backupJson() {
  const settings = db.exec('SELECT * FROM settings')[0]
  const profile = Object.fromEntries(settings.columns.map((c, i) => [c, settings.values[0][i]]))
  delete profile.id
  profile.missing_weight_prompt_opt_out = profile.missing_weight_prompt_opt_out === 1
  profile.plates_lb = JSON.parse(profile.plates_lb)
  profile.plates_kg = JSON.parse(profile.plates_kg)
  const backup = {
    format: 'repbunny-backup',
    version: 2,
    includes: ['templates', 'history', 'preferences'],
    exported_at: new Date().toISOString(),
    ...Object.fromEntries(Object.keys(DECODE).map((t) => [t, rows(t)])),
    profile,
  }
  return JSON.stringify(backup)
}

// ---- Measure ----------------------------------------------------------------

const mb = (bytes) => (bytes / 1_000_000).toFixed(2)
const results = []
for (let year = 0; year < Math.max(...CHECKPOINT_YEARS); year++) {
  simulateYear(year)
  if (!CHECKPOINT_YEARS.includes(year + 1)) continue
  const before = db.export().length
  db.run('VACUUM')
  const after = db.export().length
  const json = Buffer.from(backupJson())
  const gz = gzipSync(json).length
  results.push({ years: year + 1, workouts: workoutCount, sets: setCount, weighIns: weighInCount, before, after, json: json.length, gz })
}

console.log(`Heavy user: ${TEMPLATES} templates x ${EXERCISES_PER_TEMPLATE} exercises x ${SETS_PER_EXERCISE} sets, ${WORKOUTS_PER_WEEK} workouts a week.`)
console.log('Sizes in MB (1 MB = 1,000,000 bytes).\n')
console.log('| Years | Workouts | Sets | Database | Database (after VACUUM) | Backup JSON | JSON gzipped | DB + 10 JSON | DB + 10 gzipped |')
console.log('|---|---|---|---|---|---|---|---|---|')
for (const r of results) {
  console.log(
    `| ${r.years} | ${r.workouts.toLocaleString('en-US')} | ${r.sets.toLocaleString('en-US')} | ${mb(r.before)} | ${mb(r.after)} | ${mb(r.json)} | ${mb(r.gz)} | ${mb(r.after + RESTORE_POINTS * r.json)} | ${mb(r.after + RESTORE_POINTS * r.gz)} |`,
  )
}

// Growth is linear in sets, so extrapolate from the 10-year slope (the
// fixed overhead of empty tables and the error log is in the intercept).
const first = results[0]
const last = results[results.length - 1]
const perYear = (key) => (last[key] - first[key]) / (last.years - first.years)
const yearsTo = (base, slope) => last.years + (CAP_BYTES - base) / slope
const dbOnly = yearsTo(last.after, perYear('after'))
const withJson = yearsTo(last.after + RESTORE_POINTS * last.json, perYear('after') + RESTORE_POINTS * perYear('json'))
const withGz = yearsTo(last.after + RESTORE_POINTS * last.gz, perYear('after') + RESTORE_POINTS * perYear('gz'))

console.log(`\nGrowth per year: database ${mb(perYear('after'))} MB, backup JSON ${mb(perYear('json'))} MB, gzipped ${mb(perYear('gz'))} MB.`)
console.log(`Years to reach 25 MB:`)
console.log(`  database alone:                 ${dbOnly.toFixed(1)}`)
console.log(`  database + 10 JSON backups:      ${withJson.toFixed(1)}`)
console.log(`  database + 10 gzipped backups:   ${withGz.toFixed(1)}`)
