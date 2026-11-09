import { ref } from 'vue'
import type { LoadType } from './types'
import { EXERCISE_LIBRARY, findLibraryMatch, type LibraryExercise } from './exerciseLibrary'

// Linking existing exercises to the library (follow-up to #136). An exact
// name or alias match already counts everywhere (findLibraryMatch), so this
// is for names that are close but not exact: "Flat DB Bench" for Dumbbell
// Bench Press, "Tricep Pushdowns" for Tricep Pushdown. It only suggests; the
// user confirms each link (LibraryLinkReview.vue, or the edit sheet's
// Library match row), which writes exercises.library_id.

// Shorthand and spelling variants, applied to both sides so they compare
// alike.
const SYNONYMS: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  dumbell: 'dumbbell',
  dumbells: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  tri: 'tricep',
  tris: 'tricep',
  triceps: 'tricep',
  bi: 'bicep',
  bis: 'bicep',
  biceps: 'bicep',
  ext: 'extension',
  lats: 'lat',
  delts: 'delt',
  deltoid: 'delt',
  deltoids: 'delt',
  pecs: 'pec',
  pectoral: 'pec',
  abs: 'ab',
  abdominal: 'ab',
  abdominals: 'ab',
  glutes: 'glute',
  hammies: 'hamstring',
  mach: 'machine',
  rdl: 'romanian deadlift',
  rdls: 'romanian deadlift',
  ohp: 'overhead press',
}

// Two-word spellings of one-word names ("pull down", "pull-down", "pulldown").
const JOINED: [RegExp, string][] = [
  [/\bpull down\b/g, 'pulldown'],
  [/\bpush down\b/g, 'pushdown'],
  [/\bpull up\b/g, 'pullup'],
  [/\bchin up\b/g, 'chinup'],
  [/\bpush up\b/g, 'pushup'],
  [/\bsit up\b/g, 'situp'],
  [/\bdead lift\b/g, 'deadlift'],
]

// Words that don't tell two exercises apart.
const FILLER = new Set(['the', 'a', 'an', 'on', 'with', 'and', 'my', 'flat', 'exercise', 'regular', 'normal', 'basic', 'pf', 'planet', 'fitness'])

function singular(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

export function linkTokens(name: string): Set<string> {
  let text = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  text = text
    .split(' ')
    .map((w) => SYNONYMS[w] ?? w)
    .join(' ')
  for (const [pattern, joined] of JOINED) text = text.replace(pattern, joined)
  const words = text
    .split(' ')
    .filter(Boolean)
    .map((w) => SYNONYMS[singular(w)] ?? singular(w))
    .flatMap((w) => w.split(' '))
    .filter((w) => !FILLER.has(w))
  return new Set(words)
}

// Dice overlap of two token sets: 1 is the same words in any order. Also
// ranks import matches (#208, importMatch.ts).
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared++
  return (2 * shared) / (a.size + b.size)
}

export const LINK_THRESHOLD = 0.66

const ENTRY_TOKENS: { entry: LibraryExercise; tokens: Set<string> }[] = EXERCISE_LIBRARY.flatMap((entry) =>
  [entry.name, ...entry.aliases].map((n) => ({ entry, tokens: linkTokens(n) })),
)

// The library entry a name most likely means, tracked the same way (its load
// type), or null when nothing is close enough. An exact name or alias match
// returns null: that already counts without a link.
export function suggestLibraryLink(name: string, loadType: LoadType): LibraryExercise | null {
  if (findLibraryMatch(name)) return null
  const mine = linkTokens(name)
  let best: { entry: LibraryExercise; score: number } | null = null
  for (const { entry, tokens } of ENTRY_TOKENS) {
    if (entry.loadType !== loadType) continue
    const score = overlap(mine, tokens)
    if (score < LINK_THRESHOLD) continue
    // Ties go to the shorter, plainer library name.
    if (!best || score > best.score || (score === best.score && entry.name.length < best.entry.name.length)) {
      best = { entry, score }
    }
  }
  return best?.entry ?? null
}

// Issue #488: the edit screen's closest library entries, best first, for names
// too loose for suggestLibraryLink ("Lat Pull" for Lat Pulldown). A word that
// starts the other ("pull" / "pulldown", 3+ letters) counts as three quarters
// of a shared word. Exact name matches return nothing, like suggestLibraryLink.
export const CLOSE_MATCH_THRESHOLD = 0.6

function looseOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const word of a) {
    if (b.has(word)) {
      shared++
      continue
    }
    for (const other of b) {
      const [short, long] = word.length <= other.length ? [word, other] : [other, word]
      if (short.length >= 3 && long.startsWith(short)) {
        shared += 0.75
        break
      }
    }
  }
  return (2 * shared) / (a.size + b.size)
}

export function closeLibraryMatches(name: string, loadType: LoadType, limit = 3): LibraryExercise[] {
  if (findLibraryMatch(name)) return []
  const mine = linkTokens(name)
  const best = new Map<string, { entry: LibraryExercise; score: number }>()
  for (const { entry, tokens } of ENTRY_TOKENS) {
    if (entry.loadType !== loadType) continue
    const score = looseOverlap(mine, tokens)
    if (score < CLOSE_MATCH_THRESHOLD) continue
    const seen = best.get(entry.id)
    if (!seen || score > seen.score) best.set(entry.id, { entry, score })
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length)
    .slice(0, limit)
    .map((m) => m.entry)
}

// "No" answers, per device: `${exerciseId}:${libraryId}`, so a different
// suggestion for the same exercise (after a rename) can still be asked.
export const LINK_DISMISSED_KEY = 'repbunny-library-link-dismissed'

function readDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LINK_DISMISSED_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export const dismissedLinks = ref<string[]>(readDismissed())

export function dismissLinkSuggestion(exerciseId: string, libraryId: string) {
  const key = `${exerciseId}:${libraryId}`
  if (dismissedLinks.value.includes(key)) return
  dismissedLinks.value = [...dismissedLinks.value, key]
  try {
    localStorage.setItem(LINK_DISMISSED_KEY, JSON.stringify(dismissedLinks.value))
  } catch {
    // best-effort; the answer still holds for this session
  }
}

export interface LinkSuggestion {
  exerciseId: string
  name: string
  entry: LibraryExercise
}

// Every unarchived, unlinked exercise with a suggestion not yet answered No.
export function pendingLinkSuggestions(
  exercises: { id: string; name: string; load_type: LoadType; library_id: string | null; is_archived: boolean }[],
  dismissed: string[],
): LinkSuggestion[] {
  const no = new Set(dismissed)
  return exercises.flatMap((e) => {
    if (e.is_archived || e.library_id) return []
    const entry = suggestLibraryLink(e.name, e.load_type)
    if (!entry || no.has(`${e.id}:${entry.id}`)) return []
    return [{ exerciseId: e.id, name: e.name, entry }]
  })
}
