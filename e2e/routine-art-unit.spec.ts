import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { TemplateCategory } from '../src/lib/templateCategory'
import { FREEFORM_ART, keywordArtFor, routineArtFor, routineArtForAll, routineArtSrc, stableHash } from '../src/lib/routineArt'

// Issue #987: art tiles for routines on Log home (src/lib/routineArt.ts).

test('keywords pick the art, in order, as whole words', () => {
  expect(keywordArtFor('Push day')).toEqual(['overhead-press', 'bench-press', 'push-up'])
  expect(keywordArtFor('Bench PRESS')).toEqual(['bench-press', 'push-up'])
  expect(keywordArtFor('Pull day')).toEqual(['pull-up', 'bent-over-row'])
  expect(keywordArtFor('Lats and rows')).toEqual(['pull-up', 'bent-over-row'])
  expect(keywordArtFor('Arms')).toEqual(['curl'])
  expect(keywordArtFor('Biceps blast')).toEqual(['curl'])
  expect(keywordArtFor('Glute & hammy')).toEqual(['hip-thrust', 'split-squat'])
  expect(keywordArtFor('Hip thrust focus')).toEqual(['hip-thrust', 'split-squat'])
  expect(keywordArtFor('RDL day')).toEqual(['hip-thrust', 'split-squat'])
  expect(keywordArtFor('Quad day')).toEqual(['barbell-squat'])
  expect(keywordArtFor('Legs')).toEqual(['barbell-squat'])
  expect(keywordArtFor('Ab blast')).toEqual(['crunch', 'knee-raise'])
  expect(keywordArtFor('Core & abs')).toEqual(['crunch', 'knee-raise'])
  expect(keywordArtFor('Morning run')).toEqual(['running-hop'])
  expect(keywordArtFor('HIIT')).toEqual(['running-hop'])
  expect(keywordArtFor('Full body A')).toEqual(['star-jump'])
})

test('glute comes before leg, and push before everything', () => {
  expect(keywordArtFor('Glute & hammy leg day')).toEqual(['hip-thrust', 'split-squat'])
  expect(keywordArtFor('Leg press')).toEqual(['overhead-press', 'bench-press', 'push-up'])
})

test('chest gets the bench and shoulders the overhead press', () => {
  expect(keywordArtFor('Chest')).toEqual(['bench-press', 'push-up'])
  expect(keywordArtFor('Chest press')).toEqual(['bench-press', 'push-up'])
  expect(keywordArtFor('Shoulders')).toEqual(['overhead-press', 'lateral-raise'])
  expect(keywordArtFor('Shoulder press')).toEqual(['overhead-press', 'lateral-raise'])
  expect(keywordArtFor('Back')).toEqual(['pull-up', 'bent-over-row'])
})

test('no repeats on one screen where the group has another piece', () => {
  const routines = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms'].map((name) => ({ id: `id-${name}`, name }))
  const arts = routineArtForAll(routines, () => 'other')
  expect(new Set(arts).size).toBe(5)
  expect(arts).toEqual(routineArtForAll(routines, () => 'other'))
  // Two chest routines take both chest pieces.
  const two = routineArtForAll([{ id: 'a', name: 'Chest' }, { id: 'b', name: 'Chest day' }], () => 'upper')
  expect(new Set(two)).toEqual(new Set(['bench-press', 'push-up']))
})

test('a one-piece group borrows from its region, then keeps the repeat', () => {
  const arts = routineArtForAll(
    ['a', 'b', 'c', 'd'].map((id) => ({ id, name: 'Legs' })),
    () => 'lower',
  )
  expect(arts[0]).toBe('barbell-squat')
  expect(new Set(arts.slice(0, 3))).toEqual(new Set(['barbell-squat', 'hip-thrust', 'split-squat']))
  // Only three lower pieces, so the fourth repeats its own pick.
  expect(arts[3]).toBe('barbell-squat')
})

test('part words never match', () => {
  expect(keywordArtFor('Table tennis')).toBeNull()
  expect(keywordArtFor('Pushover')).toBeNull()
  expect(keywordArtFor('Latte break')).toBeNull()
  expect(keywordArtFor('Brunch')).toBeNull()
  expect(keywordArtFor('Monday')).toBeNull()
})

test('no keyword falls back to the category', () => {
  const id = 'routine-1'
  expect(['flex-biceps', 'curl', 'push-up', 'lateral-raise']).toContain(routineArtFor({ id, name: 'Monday' }, 'upper'))
  expect(routineArtFor({ id, name: 'Monday' }, 'lower')).toBe('barbell-squat')
  expect(routineArtFor({ id, name: 'Monday' }, 'full')).toBe('star-jump')
  expect(['crunch', 'knee-raise', 'forearm-plank']).toContain(routineArtFor({ id, name: 'Monday' }, 'core'))
  expect(routineArtFor({ id, name: 'Monday' }, 'cardio')).toBe('running-hop')
  // A keyword wins over the user's category pick.
  expect(['overhead-press', 'bench-press', 'push-up']).toContain(routineArtFor({ id, name: 'Push day' }, 'lower'))
})

test('other never gets the Freeform towel bunny', () => {
  for (let i = 0; i < 200; i++) {
    expect(routineArtFor({ id: `id-${i}`, name: 'Monday' }, 'other')).not.toBe(FREEFORM_ART)
  }
})

test('the pick is stable per id and spreads across a group', () => {
  const pick = (id: string) => routineArtFor({ id, name: 'Glute & hammy' }, 'lower')
  expect(pick('abc')).toBe(pick('abc'))
  expect(stableHash('abc')).toBe(stableHash('abc'))
  const seen = new Set(Array.from({ length: 40 }, (_, i) => pick(`routine-${i}`)))
  expect(seen).toEqual(new Set(['hip-thrust', 'split-squat']))
})

test('art lives in public/routines', () => {
  expect(routineArtSrc('wave-towel')).toBe('/routines/wave-towel.webp')
})

test('each starter program shows no repeated art, and stays in its region', () => {
  const regionOf: Record<string, string[]> = {
    upper: ['overhead-press', 'bench-press', 'push-up', 'lateral-raise', 'pull-up', 'bent-over-row', 'curl', 'flex-biceps'],
    lower: ['barbell-squat', 'hip-thrust', 'split-squat'],
    core: ['crunch', 'knee-raise', 'forearm-plank'],
    cardio: ['running-hop', 'star-jump'],
  }
  // starterPrograms.ts imports the exercise library JSON, which plain node can't
  // load here, so read the programs out of its source: each program is a block
  // starting at `id:`, each routine a `name:` followed by its `category:`.
  const source = readFileSync('src/lib/starterPrograms.ts', 'utf8')
  const programs = source
    .split(/^ {4}id: '/m)
    .slice(1)
    .map((block) => ({
      id: block.slice(0, block.indexOf("'")),
      templates: [...block.matchAll(/^ {8}name: '([^']+)',\n\s+category: '(\w+)'/gm)].map((m) => ({ name: m[1], category: m[2] as TemplateCategory })),
    }))
  expect(programs.length).toBeGreaterThan(5)
  for (const program of programs) {
    expect(program.templates.length, program.id).toBeGreaterThan(0)
    const routines = program.templates.map((t, i) => ({ id: `${program.id}-${i}`, name: t.name, category: t.category }))
    const arts = routineArtForAll(routines, (r) => r.category)
    // Six lower-body routines can't fit in three lower pieces; skip programs with more
    // routines of a region than that region has pieces.
    const byRegion = new Map<string, number>()
    for (const r of routines) byRegion.set(r.category, (byRegion.get(r.category) ?? 0) + 1)
    const fits = [...byRegion].every(([c, n]) => !regionOf[c] || n <= regionOf[c].length)
    if (fits) expect(new Set(arts).size, program.id).toBe(arts.length)
    routines.forEach((r, i) => {
      // The region comes from the matched keyword group, else the category.
      const keyword = keywordArtFor(r.name)
      // Full body days can show any piece.
      const region = keyword?.[0] === 'star-jump' ? undefined : keyword ? Object.values(regionOf).find((pieces) => pieces.includes(keyword[0])) : regionOf[r.category]
      if (region) expect(region, `${program.id} ${r.name}`).toContain(arts[i])
    })
  }
})

test('a full-body pair never repeats, and an upper routine stays upper', () => {
  const two = routineArtForAll([{ id: 'a', name: 'Full Body: A' }, { id: 'b', name: 'Full Body: B' }], () => 'full')
  expect(two[0]).not.toBe(two[1])
  const many = routineArtForAll(
    Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, name: 'Push day' })),
    () => 'lower',
  )
  for (const art of many) expect(['squat', 'hip-thrust', 'split-squat', 'barbell-squat']).not.toContain(art)
  expect(new Set(many).size).toBe(8)
})
