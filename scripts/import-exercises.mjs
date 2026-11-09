// Issue #842: grows src/data/exercise-library.json from free-exercise-db
// (public domain; source, license, and commit in docs/exercise-library-source.md).
// Run by hand and commit the output; the app never fetches exercises.
//
//   node scripts/import-exercises.mjs <path to free-exercise-db's dist/exercises.json> [--dry-run]
//
// The curation (which source exercises to keep, our names, aliases, how-to
// steps, and overrides) lives in scripts/exercise-import/curation.mjs. Each
// kept exercise's muscle groups, equipment, load type, and movement are mapped
// from the source here, with the curation's overrides on top. Anything this
// can't map confidently (no movement rule, a movement that doesn't fit the
// muscle group, unknown equipment, a name that clashes with an entry) is
// listed and nothing is written, so it gets a human decision instead of a
// guess. Re-running is safe: imported entries are rebuilt by id and match
// aliases are only added when missing. Original entries keep their ids and
// wording.
import { readFileSync, writeFileSync } from 'node:fs'
import { MATCHES, PICKS, REVIEW, SOURCE } from './exercise-import/curation.mjs'

const LIBRARY_PATH = new URL('../src/data/exercise-library.json', import.meta.url)
// The ids this script wrote last time, so a re-run replaces them and never
// touches an original entry.
const IMPORTED_PATH = new URL('./exercise-import/imported-ids.json', import.meta.url)

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const sourcePath = args.find((arg) => !arg.startsWith('--'))
if (!sourcePath) {
  console.error('usage: node scripts/import-exercises.mjs <free-exercise-db dist/exercises.json> [--dry-run]')
  console.error(`(clone ${SOURCE.repo} at commit ${SOURCE.commit})`)
  process.exit(2)
}

const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
const library = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'))
const sourceById = new Map(source.map((entry) => [entry.id, entry]))

const MUSCLES = {
  abdominals: 'core',
  chest: 'chest',
  shoulders: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  lats: 'back',
  'middle back': 'back',
  'lower back': 'back',
  traps: 'back',
  glutes: 'glutes',
  abductors: 'glutes',
  quadriceps: 'legs',
  hamstrings: 'legs',
  adductors: 'legs',
  calves: 'legs',
}

// [equipment label, equipmentType, loadType]. "other", "foam roll", balls,
// and no equipment need the curation to say.
const EQUIPMENT = {
  barbell: ['Barbell', 'barbell', 'weight'],
  'e-z curl bar': ['EZ-curl bar', 'barbell', 'weight'],
  dumbbell: ['Dumbbells', 'dumbbell', 'weight'],
  kettlebells: ['Kettlebell', 'kettlebell', 'weight'],
  cable: ['Cable machine', 'cable', 'weight'],
  machine: ['Machine', 'machine', 'weight'],
  'body only': ['Bodyweight', 'bodyweight', 'bodyweight'],
  bands: ['Resistance band', 'bodyweight', 'bodyweight'],
}

// Movement from our name, first match wins. Order matters: "leg curl" before
// "curl", "split squat" before "squat", "kickback" by muscle group.
const MOVEMENT_RULES = [
  [/calf/, 'calf_raise'],
  [/shrug|upright row/, 'shrug'],
  [/face pull|rear delt|pull apart/, 'rear_delt'],
  [/lateral raise/, 'lateral_raise'],
  [/front raise/, 'front_raise'],
  [/leg curl|hamstring curl|nordic|glute ham raise/, 'leg_curl'],
  [/leg extension/, 'leg_extension'],
  [/abduct/, 'hip_abduction'],
  [/adduct/, 'hip_adduction'],
  [/hip thrust|glute bridge/, 'hip_thrust'],
  [/tricep|skull crusher|jm press|tate press|french press/, 'triceps_extension'],
  [/kickback/, 'kickback'],
  [/wrist/, 'wrist_curl'],
  [/curl/, 'biceps_curl'],
  [/\bdips?\b/, 'dip'],
  [/pull up|chin up|pulldown|muscle up|rope climb/, 'vertical_pull'],
  [/\brows?\b/, 'horizontal_row'],
  [/deadlift|rdl|good morning|hyperextension|clean|snatch|rack pull/, 'hip_hinge'],
  [/lunge|step up|split squat/, 'lunge'],
  [/jump|bound/, 'jump'],
  [/squat|leg press/, 'squat'],
  [/incline.*(press|push up)/, 'incline_press'],
  [/bench press|chest press|floor press|push up|svend press/, 'horizontal_press'],
  [/\bfly\b|crossover/, 'chest_fly'],
  [/shoulder press|overhead press|military press|push press|jerk|landmine press|behind the neck press/, 'vertical_press'],
  [/plank|rollout/, 'plank'],
  [/crunch|sit up|v up/, 'crunch'],
  [/leg raise|knee raise|knee tuck|flutter/, 'leg_raise'],
  [/twist|woodchop|rotation|side bend|windmill/, 'rotation'],
]

// Mirrors TARGETS in src/lib/exerciseSwap.ts: in a group that swap splits,
// the movement must belong to one of its targets or swap can't place it.
const GROUP_MOVEMENTS = {
  arms: ['biceps_curl', 'triceps_extension', 'dip', 'horizontal_press', 'wrist_curl', 'hang'],
  shoulders: ['vertical_press', 'front_raise', 'lateral_raise', 'shrug', 'rear_delt'],
  back: ['vertical_pull', 'horizontal_row', 'hip_hinge', 'shrug', 'rear_delt'],
  legs: ['squat', 'lunge', 'leg_extension', 'jump', 'leg_curl', 'hip_hinge', 'calf_raise', 'hip_adduction'],
  glutes: ['hip_thrust', 'kickback', 'hip_hinge', 'hip_abduction'],
}

const FLAGS = { distance: 'tracksDistance', incline: 'tracksIncline', level: 'tracksLevel', calories: 'tracksCalories' }

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const idFor = (name) => normalize(name.replace(/'/g, '')).replace(/ /g, '_')

// Looser than the app's normalize, for catching near-duplicates ("DB Bench
// Press" vs "Dumbbell Bench Presses"): shorthand expanded, filler dropped,
// plurals trimmed, word order ignored.
const SHORTHAND = { db: 'dumbbell', bb: 'barbell', kb: 'kettlebell', ez: 'ezbar', bw: 'bodyweight' }
const FILLER = new Set(['the', 'a', 'with', 'on', 'of', 'to', 'and', 'exercise'])
function looseKey(name) {
  return normalize(name)
    .replace(/\bpush up/g, 'pushup')
    .replace(/\bpull up/g, 'pullup')
    .replace(/\bchin up/g, 'chinup')
    .replace(/\bsit up/g, 'situp')
    .split(' ')
    .map((word) => SHORTHAND[word] ?? word)
    .filter((word) => !FILLER.has(word))
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .map((word) => (word === 'flye' ? 'fly' : word))
    .sort()
    .join(' ')
}

const problems = []
let previous = []
try {
  previous = JSON.parse(readFileSync(IMPORTED_PATH, 'utf8'))
} catch {
  // First run.
}
const previousIds = new Set(previous)
const originals = library.filter((entry) => !previousIds.has(entry.id))
const originalIds = new Set(originals.map((entry) => entry.id))

// Every name and alias already taken, normalized, and the looser keys.
const taken = new Map()
const loose = new Map()
function claim(name, id) {
  const key = normalize(name)
  if (taken.has(key) && taken.get(key) !== id) {
    problems.push(`${id}: "${name}" is already used by ${taken.get(key)}`)
    return false
  }
  taken.set(key, id)
  return true
}
function claimLoose(name, id) {
  const key = looseKey(name)
  if (loose.has(key) && loose.get(key) !== id) {
    problems.push(`${id}: "${name}" looks like a duplicate of ${loose.get(key)} (add it to MATCHES instead)`)
  } else loose.set(key, id)
}
for (const entry of originals) {
  for (const name of [entry.name, ...entry.aliases]) {
    taken.set(normalize(name), entry.id)
    loose.set(looseKey(name), entry.id)
  }
}

// Matches: source exercises reviewed as the same as an entry we have. They
// only add aliases, and only ones nothing else uses.
let aliasesAdded = 0
for (const [sourceId, match] of Object.entries(MATCHES)) {
  if (!sourceById.has(sourceId)) problems.push(`MATCHES: no source exercise ${sourceId}`)
  const entry = originals.find((e) => e.id === match.id)
  if (!entry) {
    problems.push(`MATCHES ${sourceId}: no library entry ${match.id}`)
    continue
  }
  for (const alias of match.aliases ?? []) {
    if (taken.get(normalize(alias)) === entry.id) continue
    if (claim(alias, entry.id)) {
      claimLoose(alias, entry.id)
      entry.aliases.push(alias)
      aliasesAdded++
    }
  }
}

function movementFor(name) {
  const lower = normalize(name)
  return MOVEMENT_RULES.find(([pattern]) => pattern.test(lower))?.[1] ?? null
}

function mapPick([sourceId, name, howTo, extra = {}]) {
  const src = sourceById.get(sourceId)
  const id = idFor(name)
  if (!src) {
    problems.push(`${id}: no source exercise ${sourceId}`)
    return null
  }
  if (originalIds.has(id)) problems.push(`${id}: id is already an original entry`)

  const muscleGroup = extra.muscleGroup ?? MUSCLES[src.primaryMuscles[0]]
  if (!muscleGroup) problems.push(`${id}: can't map primary muscle "${src.primaryMuscles[0]}"`)
  // Grip (forearms) is a secondary muscle on most pulls and carries in the
  // source; counting it would mark every deadlift as an arm exercise.
  const secondary = [...src.primaryMuscles.slice(1), ...src.secondaryMuscles].filter((m) => m !== 'forearms')
  const alsoWorks =
    extra.alsoWorks ??
    [...new Set(secondary.map((m) => MUSCLES[m]).filter(Boolean))]
      .filter((g) => g !== muscleGroup)
      .slice(0, 2)

  const smith = /smith/i.test(name)
  const mapped = smith ? ['Smith machine', 'smith', 'weight'] : EQUIPMENT[src.equipment]
  const equipment = extra.equipment ?? mapped?.[0]
  const equipmentType = extra.equipmentType ?? mapped?.[1]
  const loadType = extra.loadType ?? mapped?.[2]
  if (!equipment || !equipmentType || !loadType) {
    problems.push(`${id}: can't map equipment "${src.equipment}"; set equipment, equipmentType, and loadType`)
  }

  const movement = extra.movement ?? movementFor(name)
  if (!movement) problems.push(`${id}: no movement rule matches "${name}"; set movement`)
  else if (GROUP_MOVEMENTS[muscleGroup] && !GROUP_MOVEMENTS[muscleGroup].includes(movement)) {
    problems.push(`${id}: movement ${movement} doesn't fit ${muscleGroup}`)
  }

  const flags = Object.fromEntries(Object.values(FLAGS).map((flag) => [flag, false]))
  for (const track of extra.tracks ?? []) flags[FLAGS[track]] = true

  const aliases = extra.aliases ?? []
  for (const n of [name, ...aliases]) {
    claim(n, id)
    claimLoose(n, id)
  }

  return {
    id,
    name,
    aliases,
    muscleGroup,
    alsoWorks,
    loadType,
    ...flags,
    equipment,
    equipmentType,
    movement,
    howTo,
  }
}

const imported = PICKS.map(mapPick).filter(Boolean)

for (const sourceId of Object.keys(REVIEW)) {
  if (!sourceById.has(sourceId)) problems.push(`REVIEW: no source exercise ${sourceId}`)
}
const used = [...Object.keys(MATCHES), ...PICKS.map(([sourceId]) => sourceId), ...Object.keys(REVIEW)]
const seen = new Set()
for (const sourceId of used) {
  if (seen.has(sourceId)) problems.push(`${sourceId} is listed twice in the curation`)
  seen.add(sourceId)
}

if (problems.length) {
  console.error(`import-exercises: ${problems.length} to review, nothing written:`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

const merged = [...originals, ...imported]
const stretching = source.filter((e) => e.category === 'stretching').length
console.log(
  [
    `source: ${source.length} exercises (${stretching} stretches dropped)`,
    `matched to an entry we have: ${Object.keys(MATCHES).length} (${aliasesAdded} new aliases)`,
    `imported: ${imported.length}`,
    `held for review: ${Object.keys(REVIEW).length}`,
    `left out: ${source.length - stretching - seen.size}`,
    `library: ${originals.length} original + ${imported.length} imported = ${merged.length}`,
  ].join('\n'),
)
if (!dryRun) {
  writeFileSync(LIBRARY_PATH, `${JSON.stringify(merged, null, 2)}\n`)
  writeFileSync(IMPORTED_PATH, `${JSON.stringify(imported.map((entry) => entry.id), null, 2)}\n`)
}
