import type { LoadType } from './types'

// Backlog item 111/112: a template's category drives its icon on the Home
// start-screen tiles and the Templates screen. Guessed from plain keyword
// tables, no inference (docs/backlog.md item 112's decision note), with the
// user's own pick (workout_templates.category, item 112) always winning.
export type TemplateCategory = 'upper' | 'lower' | 'full' | 'cardio' | 'core' | 'other'
export type ExerciseCategory = 'upper' | 'lower' | 'core' | 'cardio'

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  full: 'Full body',
  cardio: 'Cardio',
  core: 'Core',
  other: 'Other',
}

// Icon tints, per docs/design/item-112-category-icons.html.
export const TEMPLATE_CATEGORY_TINTS: Record<TemplateCategory, string> = {
  upper: 'var(--accent)',
  lower: 'var(--secondary)',
  full: 'var(--highlight)',
  cardio: 'var(--cardio)',
  core: 'var(--success)',
  other: 'var(--text-dim)',
}

// Lowercase, hyphens/punctuation to spaces, so "Pull-Ups" and "pull ups"
// read the same and every key can be matched as whole words.
function normalize(name: string): string {
  return ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

// Whole-word match, tolerating a plural "s"/"es" on the last word.
function hasPhrase(normalized: string, phrase: string): boolean {
  return new RegExp(` ${phrase}(s|es)? `).test(normalized)
}

type KeywordTable<C extends string> = [phrase: string, category: C][]

// Longest phrases first, so "leg press" and "leg raise" are decided before
// "leg", "press", or "raise" alone get a say.
function byWordCount<C extends string>(table: KeywordTable<C>): KeywordTable<C> {
  return [...table].sort((a, b) => b[0].split(' ').length - a[0].split(' ').length)
}

// Routine names only: "push"/"pull" describe a session, but as exercise
// keys they'd misfile moves like "cable pull through" (a glute exercise).
const TEMPLATE_NAME_KEYWORDS: KeywordTable<Exclude<TemplateCategory, 'other'>> = byWordCount([
  ['full body', 'full'],
  ['total body', 'full'],
  ['whole body', 'full'],
  ['full', 'full'],
  ['push', 'upper'],
  ['pull', 'upper'],
  ['upper', 'upper'],
  ['chest', 'upper'],
  ['back', 'upper'],
  ['arm', 'upper'],
  ['shoulder', 'upper'],
  ['leg', 'lower'],
  ['lower', 'lower'],
  ['glute', 'lower'],
  ['quad', 'lower'],
  ['hamstring', 'lower'],
  ['cardio', 'cardio'],
  ['conditioning', 'cardio'],
  ['run', 'cardio'],
  ['hiit', 'cardio'],
  ['core', 'core'],
  ['ab', 'core'],
])

const EXERCISE_KEYWORDS: KeywordTable<ExerciseCategory> = byWordCount([
  // Multi-word keys that would otherwise be misread by a single word inside them.
  ['leg raise', 'core'],
  ['hanging knee raise', 'core'],
  ['russian twist', 'core'],
  ['dead bug', 'core'],
  ['ab wheel', 'core'],
  ['sit up', 'core'],
  ['leg press', 'lower'],
  ['leg curl', 'lower'],
  ['leg extension', 'lower'],
  ['calf raise', 'lower'],
  ['hip thrust', 'lower'],
  ['glute bridge', 'lower'],
  ['step up', 'lower'],
  ['good morning', 'lower'],
  ['pull through', 'lower'],
  ['pull up', 'upper'],
  ['chin up', 'upper'],
  ['push up', 'upper'],
  ['face pull', 'upper'],
  ['skull crusher', 'upper'],
  ['rowing machine', 'cardio'],
  ['jump rope', 'cardio'],
  ['stair climber', 'cardio'],
  // Single words.
  ['squat', 'lower'],
  ['lunge', 'lower'],
  ['deadlift', 'lower'],
  ['rdl', 'lower'],
  ['leg', 'lower'],
  ['calf', 'lower'],
  ['calve', 'lower'],
  ['glute', 'lower'],
  ['hamstring', 'lower'],
  ['quad', 'lower'],
  ['abductor', 'lower'],
  ['adductor', 'lower'],
  ['abduction', 'lower'],
  ['adduction', 'lower'],
  ['pullup', 'upper'],
  ['chinup', 'upper'],
  ['pushup', 'upper'],
  ['press', 'upper'],
  ['bench', 'upper'],
  ['row', 'upper'],
  ['curl', 'upper'],
  ['fly', 'upper'],
  ['flye', 'upper'],
  ['flie', 'upper'],
  ['raise', 'upper'],
  ['dip', 'upper'],
  ['lat', 'upper'],
  ['pulldown', 'upper'],
  ['tricep', 'upper'],
  ['bicep', 'upper'],
  ['shoulder', 'upper'],
  ['chest', 'upper'],
  ['pec', 'upper'],
  ['shrug', 'upper'],
  ['plank', 'core'],
  ['crunch', 'core'],
  ['ab', 'core'],
  ['situp', 'core'],
  ['oblique', 'core'],
  ['rollout', 'core'],
  ['core', 'core'],
  ['treadmill', 'cardio'],
  ['bike', 'cardio'],
  ['cycle', 'cardio'],
  ['cycling', 'cardio'],
  ['rower', 'cardio'],
  ['erg', 'cardio'],
  ['elliptical', 'cardio'],
  ['stair', 'cardio'],
  ['stepper', 'cardio'],
  ['run', 'cardio'],
  ['running', 'cardio'],
  ['walk', 'cardio'],
  ['walking', 'cardio'],
  ['jog', 'cardio'],
  ['sprint', 'cardio'],
  ['swim', 'cardio'],
])

export function classifyExercise(name: string, loadType: LoadType, tracksDistance: boolean): ExerciseCategory | null {
  // A timed exercise that tracks distance is cardio whatever it's called.
  if (loadType === 'timed' && tracksDistance) return 'cardio'
  const normalized = normalize(name)
  for (const [phrase, category] of EXERCISE_KEYWORDS) {
    if (hasPhrase(normalized, phrase)) return category
  }
  return null
}

// A template name counts only when it points at exactly one category
// ("Legs + Core" is ambiguous, so the exercises decide); "full" wins
// outright, and naming both halves ("Upper/Lower") reads as full body.
export function classifyTemplateName(name: string): Exclude<TemplateCategory, 'other'> | null {
  const normalized = normalize(name)
  const hits = new Set<Exclude<TemplateCategory, 'other'>>()
  for (const [phrase, category] of TEMPLATE_NAME_KEYWORDS) {
    if (hasPhrase(normalized, phrase)) hits.add(category)
  }
  if (hits.has('full')) return 'full'
  if (hits.size === 2 && hits.has('upper') && hits.has('lower')) return 'full'
  return hits.size === 1 ? [...hits][0] : null
}

export function classifyExerciseMix(categories: (ExerciseCategory | null)[]): TemplateCategory {
  const known = categories.filter((c): c is ExerciseCategory => c !== null)
  if (known.length === 0) return 'other'
  const count = (c: ExerciseCategory) => known.filter((k) => k === c).length
  if (count('cardio') > known.length / 2) return 'cardio'
  const upper = count('upper') > 0
  const lower = count('lower') > 0
  if (upper && lower) return 'full'
  if (upper) return 'upper'
  if (lower) return 'lower'
  return count('cardio') >= count('core') ? 'cardio' : 'core'
}

export interface CategorizableExercise {
  name: string
  load_type: LoadType
  tracks_distance: boolean
}

// Precedence: the user's pick, then the template's name, then its exercises.
export function templateCategory(
  chosen: TemplateCategory | null | undefined,
  templateName: string,
  exercises: CategorizableExercise[],
): TemplateCategory {
  if (chosen) return chosen
  return (
    classifyTemplateName(templateName) ??
    classifyExerciseMix(exercises.map((e) => classifyExercise(e.name, e.load_type, e.tracks_distance)))
  )
}
