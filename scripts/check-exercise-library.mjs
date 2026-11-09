// Validates src/data/exercise-library.json (issues #41, #842). Plain Node, no dependencies.
import { readFileSync } from 'node:fs'

const GROUPS = ['chest', 'back', 'shoulders', 'arms', 'core', 'glutes', 'legs', 'cardio']
const LOAD_TYPES = ['weight', 'level', 'bodyweight', 'assisted', 'timed']
const FLAGS = ['tracksDistance', 'tracksIncline', 'tracksLevel', 'tracksCalories']
// Issue #150: what the swap suggestions rank alternatives by. Keep in sync
// with LibraryEquipmentType and LibraryMovement in src/lib/exerciseLibrary.ts.
const EQUIPMENT_TYPES = ['barbell', 'dumbbell', 'kettlebell', 'smith', 'cable', 'machine', 'bodyweight', 'other']
const MOVEMENTS = [
  'horizontal_press', 'incline_press', 'chest_fly', 'dip', 'vertical_pull', 'hang', 'horizontal_row', 'rear_delt',
  'hip_hinge', 'shrug', 'vertical_press', 'lateral_raise', 'front_raise', 'biceps_curl', 'triceps_extension',
  'wrist_curl', 'plank', 'crunch', 'leg_raise', 'rotation', 'hip_thrust', 'kickback', 'hip_abduction',
  'hip_adduction', 'squat', 'lunge', 'leg_extension', 'leg_curl', 'calf_raise', 'jump', 'run_walk', 'cycle',
  'cardio_machine', 'conditioning',
]
// Machines and basics the library must cover, under a plain name.
const REQUIRED = [
  'Chest Press Machine', 'Pec Deck', 'Shoulder Press Machine', 'Lat Pulldown', 'Seated Cable Row',
  'Leg Press', 'Leg Extension', 'Seated Leg Curl', 'Lying Leg Curl', 'Hip Abductor Machine',
  'Hip Adductor Machine', 'Ab Crunch Machine', 'Back Extension Machine', 'Assisted Pull-Up',
  'Assisted Dip', 'Smith Machine Squat', 'Smith Machine Bench Press', 'Cable Crossover',
  'Tricep Pushdown', 'Cable Curl', 'Calf Raise Machine',
]

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const library = JSON.parse(readFileSync(new URL('../src/data/exercise-library.json', import.meta.url), 'utf8'))
const errors = []
const fail = (entry, msg) => errors.push(`${entry?.id ?? entry?.name ?? '(entry)'}: ${msg}`)

if (!Array.isArray(library)) {
  console.error('exercise-library.json must be an array')
  process.exit(1)
}
// Issue #842 grew it from free-exercise-db (scripts/import-exercises.mjs).
if (library.length < 300 || library.length > 400) {
  errors.push(`expected 300 to 400 entries, found ${library.length}`)
}

const ids = new Set()
const names = new Map()
for (const entry of library) {
  if (typeof entry.id !== 'string' || !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(entry.id)) fail(entry, 'id must be lowercase snake_case')
  else if (ids.has(entry.id)) fail(entry, 'duplicate id')
  else ids.add(entry.id)

  if (typeof entry.name !== 'string' || !entry.name.trim()) fail(entry, 'missing name')
  if (!Array.isArray(entry.aliases)) fail(entry, 'aliases must be an array')
  for (const name of [entry.name, ...(Array.isArray(entry.aliases) ? entry.aliases : [])]) {
    const key = normalize(String(name))
    if (names.has(key) && names.get(key) !== entry.id) {
      fail(entry, `name or alias "${name}" is also used by ${names.get(key)}`)
    } else names.set(key, entry.id)
  }

  if (!GROUPS.includes(entry.muscleGroup)) fail(entry, `invalid muscleGroup "${entry.muscleGroup}"`)
  if (!Array.isArray(entry.alsoWorks) || entry.alsoWorks.length > 2) fail(entry, 'alsoWorks must have 0 to 2 groups')
  else {
    for (const g of entry.alsoWorks) if (!GROUPS.includes(g)) fail(entry, `invalid alsoWorks group "${g}"`)
    if (entry.alsoWorks.includes(entry.muscleGroup)) fail(entry, 'alsoWorks must not include muscleGroup')
    if (new Set(entry.alsoWorks).size !== entry.alsoWorks.length) fail(entry, 'alsoWorks has a repeated group')
  }

  if (!LOAD_TYPES.includes(entry.loadType)) fail(entry, `invalid loadType "${entry.loadType}"`)
  for (const flag of FLAGS) {
    if (typeof entry[flag] !== 'boolean') fail(entry, `${flag} must be a boolean`)
    else if (entry[flag] && entry.loadType !== 'timed') fail(entry, `${flag} is only allowed on timed exercises`)
  }
  if (typeof entry.equipment !== 'string' || !entry.equipment.trim()) fail(entry, 'missing equipment')
  if (!EQUIPMENT_TYPES.includes(entry.equipmentType)) fail(entry, `invalid equipmentType "${entry.equipmentType}"`)
  if (!MOVEMENTS.includes(entry.movement)) fail(entry, `invalid movement "${entry.movement}"`)

  if (!Array.isArray(entry.howTo) || entry.howTo.length < 3 || entry.howTo.length > 5) {
    fail(entry, 'howTo must have 3 to 5 steps')
  } else {
    for (const step of entry.howTo) {
      if (typeof step !== 'string' || !step.trim()) fail(entry, 'empty howTo step')
      else if (step.length >= 160) fail(entry, `howTo step is ${step.length} characters (limit 159): "${step}"`)
    }
  }
}

for (const name of REQUIRED) {
  if (!names.has(normalize(name))) errors.push(`required exercise missing: ${name}`)
}

if (errors.length) {
  console.error(`exercise-library check failed (${errors.length}):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(`exercise-library OK: ${library.length} entries`)
