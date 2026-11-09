import type { TemplateCategory } from './templateCategory'

// Issue #987: each routine tile on Log home shows the mascot doing an exercise
// that fits the routine. Art lives in public/routines/ (owner's art, #988).
// The routine's name decides first (keyword groups, in order), then its
// category; where a group has more than one piece, a stable hash of the
// routine's id picks one, so a tile never changes between visits.
export type RoutineArt =
  | 'overhead-press'
  | 'bench-press'
  | 'push-up'
  | 'lateral-raise'
  | 'bent-over-row'
  | 'pull-up'
  | 'curl'
  | 'flex-biceps'
  | 'barbell-squat'
  | 'hip-thrust'
  | 'split-squat'
  | 'crunch'
  | 'knee-raise'
  | 'forearm-plank'
  | 'running-hop'
  | 'star-jump'
  | 'wave-towel'

// Freeform's own piece; never picked for a routine.
export const FREEFORM_ART: RoutineArt = 'wave-towel'

// A body region limits which art a routine may borrow when its own group has
// run out (#1015): an upper routine never shows a squat. Full and other days
// can show any exercise.
type Region = 'upper' | 'lower' | 'core' | 'cardio' | 'any'

// Checked top to bottom, so glute comes before leg and "Glute & hammy leg
// day" gets glute art. Chest and shoulder come before push/press, so "Chest
// press" gets the bench and "Shoulder press" the overhead press.
const KEYWORD_GROUPS: [keywords: string[], art: RoutineArt[], region: Region][] = [
  [['chest', 'bench'], ['bench-press', 'push-up'], 'upper'],
  [['shoulder', 'delt', 'overhead'], ['overhead-press', 'lateral-raise'], 'upper'],
  [['push', 'press'], ['overhead-press', 'bench-press', 'push-up'], 'upper'],
  [['pull', 'row', 'back', 'lat'], ['pull-up', 'bent-over-row'], 'upper'],
  [['arm', 'bicep', 'biceps', 'curl'], ['curl'], 'upper'],
  [['glute', 'glutes', 'hammy', 'hamstring', 'hip thrust', 'posterior', 'rdl'], ['hip-thrust', 'split-squat'], 'lower'],
  [['quad', 'leg', 'squat'], ['barbell-squat'], 'lower'],
  [['core', 'ab', 'abs'], ['crunch', 'knee-raise'], 'core'],
  [['run', 'cardio', 'bike', 'hiit'], ['running-hop'], 'cardio'],
  [['full body'], ['star-jump'], 'any'],
]

const ALL_ROUTINE_ART: RoutineArt[] = [
  'overhead-press',
  'bench-press',
  'push-up',
  'lateral-raise',
  'bent-over-row',
  'pull-up',
  'curl',
  'flex-biceps',
  'barbell-squat',
  'hip-thrust',
  'split-squat',
  'crunch',
  'knee-raise',
  'forearm-plank',
  'running-hop',
  'star-jump',
]

const REGION_ART: Record<Region, RoutineArt[]> = {
  upper: ['overhead-press', 'bench-press', 'push-up', 'lateral-raise', 'pull-up', 'bent-over-row', 'curl', 'flex-biceps'],
  lower: ['barbell-squat', 'hip-thrust', 'split-squat'],
  core: ['crunch', 'knee-raise', 'forearm-plank'],
  cardio: ['running-hop', 'star-jump'],
  any: ALL_ROUTINE_ART,
}

const CATEGORY_REGION: Record<TemplateCategory, Region> = {
  upper: 'upper',
  lower: 'lower',
  core: 'core',
  cardio: 'cardio',
  full: 'any',
  other: 'any',
}

const CATEGORY_ART: Record<TemplateCategory, RoutineArt[]> = {
  upper: ['flex-biceps', 'curl', 'push-up', 'lateral-raise'],
  lower: ['barbell-squat'],
  full: ['star-jump'],
  core: ['crunch', 'knee-raise', 'forearm-plank'],
  cardio: ['running-hop'],
  other: ALL_ROUTINE_ART,
}

// Lowercase with punctuation as spaces and a space at each end, so every
// keyword can be matched as whole words ("ab" doesn't match "table").
function normalize(name: string): string {
  return ` ${name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

// Whole words, tolerating a plural on the last one ("legs", "rows", "presses").
function hasPhrase(normalized: string, phrase: string): boolean {
  return normalized.includes(` ${phrase} `) || normalized.includes(` ${phrase}s `) || normalized.includes(` ${phrase}es `)
}

// FNV-1a: small, stable across runs and devices, unlike Math.random().
export function stableHash(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// The keyword group a routine name falls in, or null when none matches.
export function keywordArtFor(name: string): RoutineArt[] | null {
  const normalized = normalize(name)
  return matchGroup(normalized)?.[1] ?? null
}

function matchGroup(normalized: string) {
  return KEYWORD_GROUPS.find(([keywords]) => keywords.some((k) => hasPhrase(normalized, k))) ?? null
}

function poolFor(routine: { name: string }, category: TemplateCategory): RoutineArt[] {
  return keywordArtFor(routine.name) ?? CATEGORY_ART[category]
}

export function routineArtFor(routine: { id: string; name: string }, category: TemplateCategory): RoutineArt {
  const pool = poolFor(routine, category)
  return pool[stableHash(routine.id) % pool.length]
}

// Art for every tile on one screen, in display order, with no repeats where
// avoidable (#1015). When a tile's hashed pick is taken, it tries the next
// unused piece in its keyword group, then in its category's list, then in its
// body region's pool (never another region). Only when all of those are used
// does it repeat its own pick. Pure, so each tile comes out the same on every
// render.
export function routineArtForAll<T extends { id: string; name: string }>(
  routines: T[],
  categoryOf: (routine: T) => TemplateCategory,
): RoutineArt[] {
  const used = new Set<RoutineArt>()
  return routines.map((routine) => {
    const category = categoryOf(routine)
    const group = matchGroup(normalize(routine.name))
    const region = group ? group[2] : CATEGORY_REGION[category]
    const regionPool = REGION_ART[region]
    const own = group ? group[1] : CATEGORY_ART[category]
    const lists = [own, CATEGORY_ART[category].filter((a) => regionPool.includes(a)), regionPool]
    const hash = stableHash(routine.id)
    let pick = own[hash % own.length]
    search: for (const list of lists) {
      for (let i = 0; i < list.length; i++) {
        const candidate = list[(hash + i) % list.length]
        if (!used.has(candidate)) {
          pick = candidate
          break search
        }
      }
    }
    used.add(pick)
    return pick
  })
}

export function routineArtSrc(art: RoutineArt): string {
  return `/routines/${art}.webp`
}
